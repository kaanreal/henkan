use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
#[cfg(not(windows))]
use std::process::Command;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant, SystemTime};

use serde::Serialize;

#[cfg(windows)]
use windows::Win32::{
    Foundation::{CloseHandle, FALSE, HMODULE},
    System::{
        ProcessStatus::{EnumProcesses, GetModuleFileNameExA},
        Threading::{OpenProcess, PROCESS_QUERY_INFORMATION, PROCESS_VM_READ},
    },
};

const INDEX_REFRESH: Duration = Duration::from_secs(60);
const POLL_INTERVAL: Duration = Duration::from_millis(1000);
const STORAGE_PREFIX: &str = "lazer:";
const UNREADABLE: &str = "osu!lazer is running, but its selected map is not in local storage.";
const ASSET_BASE: &str = "https://assets.ppy.sh";

#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SelectedMap {
    pub folder: String,
    pub file: String,
    pub artist: String,
    pub title: String,
    pub creator: String,
    pub difficulty: String,
    pub map_id: i32,
    pub set_id: i32,
    pub osu_root: Option<String>,
}

#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Live {
    pub running: bool,
    pub connected: bool,
    pub map: Option<SelectedMap>,
    pub problem: Option<String>,
}

impl Live {
    pub fn interval(&self) -> Duration {
        POLL_INTERVAL
    }
}

#[derive(Clone, Debug)]
struct Candidate {
    hash: String,
    file: String,
    artist: String,
    title: String,
    creator: String,
    difficulty: String,
    map_id: i32,
    set_id: i32,
}

#[derive(Default)]
struct State {
    root: Option<PathBuf>,
    candidates: Vec<Candidate>,
    indexed_at: Option<Instant>,
}

#[derive(Default)]
pub struct Watcher {
    state: Mutex<State>,
}

impl Watcher {
    pub fn poll(&self) -> Live {
        let Some(root) = discover_root() else {
            return Live::default();
        };
        if !lazer_running() {
            return Live::default();
        }

        let Some(selection) = latest_selection(&root) else {
            return Live {
                running: true,
                connected: true,
                ..Live::default()
            };
        };

        let mut state = self.lock();
        if state.root.as_deref() != Some(root.as_path())
            || state
                .indexed_at
                .is_none_or(|time| time.elapsed() >= INDEX_REFRESH)
        {
            state.root = Some(root.clone());
            state.candidates = scan_candidates(&root);
            state.indexed_at = Some(Instant::now());
        }

        let candidate = state
            .candidates
            .iter()
            .find(|candidate| candidate_matches(candidate, &selection));
        let Some(candidate) = candidate else {
            return Live {
                running: true,
                connected: false,
                problem: Some(UNREADABLE.to_string()),
                ..Live::default()
            };
        };

        Live {
            running: true,
            connected: true,
            map: Some(SelectedMap {
                folder: format!("{STORAGE_PREFIX}{}", candidate.hash),
                file: candidate.file.clone(),
                artist: candidate.artist.clone(),
                title: candidate.title.clone(),
                creator: candidate.creator.clone(),
                difficulty: candidate.difficulty.clone(),
                map_id: candidate.map_id,
                set_id: candidate.set_id,
                osu_root: root.to_str().map(str::to_string),
            }),
            problem: None,
        }
    }

    fn lock(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

pub fn discover_root() -> Option<PathBuf> {
    let home = PathBuf::from(std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"))?);
    let root = if cfg!(target_os = "macos") {
        home.join("Library/Application Support/osu")
    } else if cfg!(target_os = "windows") {
        PathBuf::from(std::env::var_os("APPDATA")?).join("osu")
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".local/share"))
            .join("osu")
    };
    (root.join("files").is_dir() && root.join("logs").is_dir()).then_some(root)
}

fn lazer_running() -> bool {
    #[cfg(windows)]
    {
        return osu_executable_paths()
            .iter()
            .any(|path| is_lazer_executable(path));
    }

    #[cfg(not(windows))]
    {
        let Ok(output) = Command::new("ps").args(["-axo", "command="]).output() else {
            return false;
        };
        String::from_utf8_lossy(&output.stdout).lines().any(|line| {
            let name = line.trim().to_ascii_lowercase();
            name == "osu!"
                || name.ends_with("/osu!")
                || name.contains("/osu!.app/")
                || name.contains("osu!.dll")
                || name.contains("osu!.exe")
        })
    }
}

#[cfg(windows)]
pub(crate) fn osu_executable_paths() -> Vec<PathBuf> {
    let mut processes = [0u32; 512];
    let mut returned = 0u32;
    let Ok(()) = (unsafe {
        EnumProcesses(
            processes.as_mut_slice().as_mut_ptr(),
            std::mem::size_of_val(&processes) as u32,
            &mut returned,
        )
    })
    .ok() else {
        return Vec::new();
    };

    let length = returned as usize / std::mem::size_of::<u32>();
    processes[..length]
        .iter()
        .filter_map(|pid| {
            let handle = unsafe {
                OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, *pid).ok()?
            };
            let mut buffer = [0u8; 1024];
            let size = unsafe { GetModuleFileNameExA(handle, HMODULE(0), &mut buffer) } as usize;
            let path = std::str::from_utf8(&buffer[..size])
                .ok()
                .filter(|path| {
                    Path::new(path)
                        .file_name()
                        .is_some_and(|name| name.eq_ignore_ascii_case("osu!.exe"))
                })
                .map(PathBuf::from);
            unsafe {
                let _ = CloseHandle(handle);
            }
            path
        })
        .collect()
}

#[cfg(windows)]
pub(crate) fn is_lazer_executable(path: &Path) -> bool {
    let Some(root) = path.parent() else {
        return false;
    };
    // Stable has the same osu!.exe name, while Lazer ships the .NET game
    // assembly/runtime files beside it. No install path is assumed.
    ["osu.Game.dll", "osu!.dll", "osu!.deps.json"]
        .iter()
        .any(|marker| root.join(marker).is_file())
}

fn latest_selection(root: &Path) -> Option<(String, String, String, String)> {
    let log = fs::read_dir(root.join("logs"))
        .ok()?
        .flatten()
        .filter(|entry| {
            entry
                .file_name()
                .to_str()
                .is_some_and(|name| name.ends_with(".runtime.log"))
        })
        .max_by_key(|entry| {
            entry
                .metadata()
                .and_then(|metadata| metadata.modified())
                .unwrap_or(SystemTime::UNIX_EPOCH)
        })?;
    let text = fs::read_to_string(log.path()).ok()?;
    text.lines().rev().find_map(parse_selected_line)
}

fn scan_candidates(root: &Path) -> Vec<Candidate> {
    let mut candidates = Vec::new();
    let Ok(first_level) = fs::read_dir(root.join("files")) else {
        return candidates;
    };
    for first in first_level.flatten() {
        let Ok(second_level) = fs::read_dir(first.path()) else {
            continue;
        };
        for second in second_level.flatten() {
            let Ok(files) = fs::read_dir(second.path()) else {
                continue;
            };
            for entry in files.flatten() {
                let path = entry.path();
                let Ok(metadata) = fs::metadata(&path) else {
                    continue;
                };
                if !metadata.is_file() || metadata.len() > 8 * 1024 * 1024 {
                    continue;
                }
                let Ok(mut file) = fs::File::open(&path) else {
                    continue;
                };
                let mut prefix = [0; 32];
                let Ok(read) = file.read(&mut prefix) else {
                    continue;
                };
                let prefix = String::from_utf8_lossy(&prefix[..read]);
                if !prefix
                    .trim_start_matches('\u{feff}')
                    .starts_with("osu file format")
                {
                    continue;
                }
                let mut bytes = prefix.as_bytes().to_vec();
                if file.read_to_end(&mut bytes).is_err() {
                    continue;
                }
                let text = String::from_utf8_lossy(&bytes);
                let Some(hash) = path.file_name().and_then(|name| name.to_str()) else {
                    continue;
                };
                let Some(candidate) = parse_candidate(hash, &text) else {
                    continue;
                };
                candidates.push(candidate);
            }
        }
    }
    candidates
}

fn parse_candidate(hash: &str, text: &str) -> Option<Candidate> {
    if hash.len() != 64 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    let artist = metadata_field(text, "Artist")?;
    let title = metadata_field(text, "Title")?;
    let creator = metadata_field(text, "Creator")?;
    let difficulty = metadata_field(text, "Version")?;
    let file = format!("{}.osu", clean_file_name(&difficulty, hash));
    Some(Candidate {
        hash: hash.to_string(),
        file,
        artist,
        title,
        creator,
        difficulty,
        map_id: metadata_field(text, "BeatmapID")
            .and_then(|value| value.parse().ok())
            .unwrap_or(0),
        set_id: metadata_field(text, "BeatmapSetID")
            .and_then(|value| value.parse().ok())
            .unwrap_or(0),
    })
}

fn metadata_field(text: &str, field: &str) -> Option<String> {
    let mut in_metadata = false;
    for line in text.lines() {
        let line = line.trim().trim_start_matches('\u{feff}');
        if line.starts_with('[') {
            in_metadata = line.eq_ignore_ascii_case("[Metadata]");
            continue;
        }
        if !in_metadata {
            continue;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        if key.trim().eq_ignore_ascii_case(field) {
            let value = value.trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn clean_file_name(value: &str, hash: &str) -> String {
    let cleaned: String = value
        .chars()
        .map(|character| match character {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            character if character.is_control() => '_',
            character => character,
        })
        .collect();
    let cleaned = cleaned.trim().trim_matches('.');
    if cleaned.is_empty() {
        hash.to_string()
    } else {
        cleaned.to_string()
    }
}

fn candidate_matches(candidate: &Candidate, selection: &(String, String, String, String)) -> bool {
    let same = |left: &str, right: &str| left.trim().eq_ignore_ascii_case(right.trim());
    if !same(&candidate.artist, &selection.0)
        || !same(&candidate.title, &selection.1)
        || !same(&candidate.creator, &selection.2)
    {
        return false;
    }
    let selected = normalized_difficulty(&selection.3);
    let difficulty = normalized_difficulty(&candidate.difficulty);
    selected == difficulty || selected.contains(&difficulty)
}

fn normalized_difficulty(value: &str) -> String {
    let value = value.trim().to_ascii_lowercase();
    let value = value
        .find("] ")
        .map(|index| &value[index + 2..])
        .unwrap_or(&value);
    value
        .split_whitespace()
        .filter(|part| {
            let number = part.strip_prefix('x').unwrap_or_default();
            number.is_empty() || number.parse::<f64>().is_err()
        })
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn read_map(app: &tauri::AppHandle, folder: &str) -> Result<String, String> {
    let hash = folder
        .strip_prefix(STORAGE_PREFIX)
        .ok_or_else(|| "That map does not come from osu!lazer.".to_string())?;
    let root =
        discover_root().ok_or_else(|| "Could not find your osu!lazer data folder.".to_string())?;
    let source = storage_path(&root, hash)
        .filter(|path| path.is_file())
        .ok_or_else(|| "That osu!lazer map is no longer in local storage.".to_string())?;
    let content =
        fs::read(&source).map_err(|error| format!("Cannot read the osu!lazer map: {error}"))?;
    let text = String::from_utf8(content.clone())
        .map_err(|_| "The selected osu!lazer map is not text-based.".to_string())?;
    let candidate = parse_candidate(hash, &text)
        .ok_or_else(|| "The selected osu!lazer map has incomplete metadata.".to_string())?;

    // Lazer keeps charts and media under unrelated content hashes. Never guess
    // media from nearby Realm bytes: importing a full mirror set makes the
    // normal parser choose its first chart, which can silently swap the
    // selected chart's audio/background.
    let assets = local_assets(&root, hash);
    if assets.audio.is_some() || assets.background.is_some() || candidate.set_id == 0 {
        return pack_local_map(hash, &candidate, &content, &text, assets);
    }

    // A partially downloaded Lazer map may not have local media yet. Keep the
    // public-program fallback, but only after the exact local path failed.
    if candidate.set_id > 0 {
        let filename = format!("henkan-lazer-{}.osz", candidate.set_id);
        if let Ok(path) = crate::download_mirror_osz(app.clone(), candidate.set_id as u64, filename)
        {
            if let Ok(Some(selected)) = pack_downloaded_map(&path, hash, &candidate) {
                return Ok(selected);
            }
        }
    }

    pack_local_map(hash, &candidate, &content, &text, assets)
}

#[derive(Default)]
struct LocalAssets {
    background: Option<Vec<u8>>,
    audio: Option<Vec<u8>>,
}

fn audio_name(osu: &str) -> Option<String> {
    let mut in_general = false;
    for line in osu.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_general = line.eq_ignore_ascii_case("[General]");
            continue;
        }
        if !in_general {
            continue;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        if key.trim().eq_ignore_ascii_case("AudioFilename") {
            let value = value.trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
    }
    None
}

fn safe_asset_name(name: &str) -> Option<String> {
    let name = name.trim().replace('\\', "/");
    if name.is_empty()
        || name.starts_with('/')
        || name.contains(':')
        || name.chars().any(|character| character.is_control())
        || name
            .split('/')
            .any(|part| part.is_empty() || part == "." || part == "..")
    {
        return None;
    }
    Some(name)
}

fn same_metadata(left: &Candidate, right: &Candidate) -> bool {
    let same = |a: &str, b: &str| a.trim().eq_ignore_ascii_case(b.trim());
    if left.map_id > 0 && right.map_id > 0 && left.map_id != right.map_id {
        return false;
    }
    same(&left.artist, &right.artist)
        && same(&left.title, &right.title)
        && same(&left.creator, &right.creator)
        && normalized_difficulty(&left.difficulty) == normalized_difficulty(&right.difficulty)
}

fn archive_name_matches(entry: &str, wanted: &str) -> bool {
    let entry = entry.replace('\\', "/");
    let wanted = wanted.replace('\\', "/");
    entry.eq_ignore_ascii_case(&wanted)
        || entry
            .rsplit('/')
            .next()
            .is_some_and(|name| name.eq_ignore_ascii_case(&wanted))
}

fn pack_downloaded_map(
    archive_path: &str,
    hash: &str,
    selected: &Candidate,
) -> Result<Option<String>, String> {
    let file = fs::File::open(archive_path)
        .map_err(|error| format!("Cannot open downloaded osu! map: {error}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| format!("Cannot read downloaded osu! map: {error}"))?;
    let mut selected_chart = None;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Cannot read downloaded osu! map: {error}"))?;
        if !entry.name().to_ascii_lowercase().ends_with(".osu") {
            continue;
        }
        let mut bytes = Vec::new();
        entry
            .read_to_end(&mut bytes)
            .map_err(|error| format!("Cannot read downloaded chart: {error}"))?;
        let matches = {
            let text = String::from_utf8_lossy(&bytes);
            let Some(candidate) = parse_candidate(
                "0000000000000000000000000000000000000000000000000000000000000000",
                &text,
            ) else {
                continue;
            };
            same_metadata(&candidate, selected)
        };
        if matches {
            let text = String::from_utf8_lossy(&bytes).into_owned();
            selected_chart = Some((bytes, text));
            break;
        }
    }
    drop(archive);

    let Some((chart, text)) = selected_chart else {
        return Ok(None);
    };
    let file = fs::File::open(archive_path)
        .map_err(|error| format!("Cannot reopen downloaded osu! map: {error}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| format!("Cannot read downloaded osu! map: {error}"))?;
    let mut files = vec![(selected.file.clone(), chart)];

    for wanted in [
        audio_name(&text),
        crate::osu::background::background_name(&text),
    ]
    .into_iter()
    .flatten()
    {
        let Some(safe_name) = safe_asset_name(&wanted) else {
            continue;
        };
        let Some(index) = (0..archive.len()).find(|index| {
            archive
                .by_index(*index)
                .ok()
                .is_some_and(|entry| archive_name_matches(entry.name(), &safe_name))
        }) else {
            continue;
        };
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Cannot read downloaded media: {error}"))?;
        let mut bytes = Vec::new();
        entry
            .read_to_end(&mut bytes)
            .map_err(|error| format!("Cannot read downloaded media: {error}"))?;
        files.push((safe_name, bytes));
    }

    pack_files(hash, files).map(Some)
}

fn downloaded_background(
    archive_path: &str,
    selected: &Candidate,
) -> Result<Option<Vec<u8>>, String> {
    let file = fs::File::open(archive_path)
        .map_err(|error| format!("Cannot open downloaded osu! map: {error}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| format!("Cannot read downloaded osu! map: {error}"))?;
    let mut background_name = None;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("Cannot read downloaded osu! map: {error}"))?;
        if !entry.name().to_ascii_lowercase().ends_with(".osu") {
            continue;
        }
        let mut bytes = Vec::new();
        entry
            .read_to_end(&mut bytes)
            .map_err(|error| format!("Cannot read downloaded chart: {error}"))?;
        let text = String::from_utf8_lossy(&bytes);
        let Some(candidate) = parse_candidate(
            "0000000000000000000000000000000000000000000000000000000000000000",
            &text,
        ) else {
            continue;
        };
        if same_metadata(&candidate, selected) {
            background_name = crate::osu::background::background_name(&text);
            break;
        }
    }

    let Some(background_name) = background_name.and_then(|name| safe_asset_name(&name)) else {
        return Ok(None);
    };
    let Some(index) = (0..archive.len()).find(|index| {
        archive
            .by_index(*index)
            .ok()
            .is_some_and(|entry| archive_name_matches(entry.name(), &background_name))
    }) else {
        return Ok(None);
    };
    let mut entry = archive
        .by_index(index)
        .map_err(|error| format!("Cannot read downloaded background: {error}"))?;
    let mut bytes = Vec::new();
    entry
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Cannot read downloaded background: {error}"))?;
    if bytes.len() as u64 > crate::osu::background::MAX_IMAGE_BYTES || !is_image(&bytes) {
        return Ok(None);
    }
    Ok(Some(bytes))
}

fn remote_background(
    app: &tauri::AppHandle,
    chart_hash: &str,
    selected: &Candidate,
) -> Option<Vec<u8>> {
    if selected.set_id <= 0 {
        return None;
    }
    let cache_dir = std::env::temp_dir().join("henkan-osu-hook");
    let _ = fs::create_dir_all(&cache_dir);
    let cache_path = cache_dir.join(format!("lazer-bg-{chart_hash}.img"));
    if let Ok(bytes) = fs::read(&cache_path) {
        if bytes.len() as u64 <= crate::osu::background::MAX_IMAGE_BYTES && is_image(&bytes) {
            return Some(bytes);
        }
    }

    let filename = format!("henkan-lazer-{}.osz", selected.set_id);
    let archive_path =
        crate::download_mirror_osz(app.clone(), selected.set_id as u64, filename).ok()?;
    let bytes = downloaded_background(&archive_path, selected)
        .ok()
        .flatten()?;
    let _ = fs::write(cache_path, &bytes);
    Some(bytes)
}

fn is_image(bytes: &[u8]) -> bool {
    bytes.starts_with(&[0xff, 0xd8, 0xff])
        || bytes.starts_with(&[0x89, b'P', b'N', b'G'])
        || bytes.starts_with(b"BM")
        || (bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP"))
}

// Lazer's current Realm v24 file stores the chart and media hashes in
// separate linked tables. Guessing based on nearby bytes can select another
// difficulty's artwork, so local assets are intentionally left empty unless
// an exact association is available from a downloaded chart set.
fn local_assets(_root: &Path, _chart_hash: &str) -> LocalAssets {
    LocalAssets::default()
}

fn pack_local_map(
    hash: &str,
    candidate: &Candidate,
    chart: &[u8],
    text: &str,
    assets: LocalAssets,
) -> Result<String, String> {
    let mut files = vec![(candidate.file.clone(), chart.to_vec())];
    if let (Some(name), Some(bytes)) = (audio_name(text), assets.audio) {
        if let Some(name) = safe_asset_name(&name) {
            files.push((name, bytes));
        }
    }
    if let (Some(name), Some(bytes)) = (
        crate::osu::background::background_name(text),
        assets.background,
    ) {
        if let Some(name) = safe_asset_name(&name) {
            files.push((name, bytes));
        }
    }

    pack_files(hash, files)
}

fn pack_files(hash: &str, files: Vec<(String, Vec<u8>)>) -> Result<String, String> {
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options: zip::write::FileOptions<'_, ()> =
        zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Stored);
    for (name, bytes) in files {
        writer
            .start_file(name, options)
            .map_err(|error| format!("Cannot pack the osu!lazer map: {error}"))?;
        writer
            .write_all(&bytes)
            .map_err(|error| format!("Cannot pack the osu!lazer map: {error}"))?;
    }
    let bytes = writer
        .finish()
        .map_err(|error| format!("Cannot pack the osu!lazer map: {error}"))?
        .into_inner();

    let temp = std::env::temp_dir().join("henkan-osu-hook");
    fs::create_dir_all(&temp).map_err(|error| format!("Cannot create temp folder: {error}"))?;
    let path = temp.join(format!("lazer-{hash}.osz"));
    fs::write(&path, bytes).map_err(|error| format!("Cannot write temporary .osz: {error}"))?;
    Ok(path.to_string_lossy().to_string())
}

/// Lazer stores chart and media files under content hashes, so the chart does
/// not sit beside its background like a stable Songs folder does. The public
/// beatmapset cover is a small, reliable artwork fallback when the local Realm
/// asset index cannot be resolved by the desktop bridge.
pub fn map_background(
    app: &tauri::AppHandle,
    folder: &str,
    _file: &str,
) -> Result<Vec<u8>, String> {
    let hash = folder
        .strip_prefix(STORAGE_PREFIX)
        .ok_or_else(|| "That map does not come from osu!lazer.".to_string())?;
    let root =
        discover_root().ok_or_else(|| "Could not find your osu!lazer data folder.".to_string())?;
    let source = storage_path(&root, hash)
        .filter(|path| path.is_file())
        .ok_or_else(|| "That osu!lazer map is no longer in local storage.".to_string())?;
    let content = fs::read_to_string(&source)
        .map_err(|error| format!("Cannot read the osu!lazer map: {error}"))?;
    let assets = local_assets(&root, hash);
    if let Some(bytes) = assets.background {
        return Ok(bytes);
    }
    if let Some(candidate) = parse_candidate(hash, &content) {
        if let Some(bytes) = remote_background(app, hash, &candidate) {
            return Ok(bytes);
        }
    }
    let Some(set_id) = metadata_field(&content, "BeatmapSetID")
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|id| *id > 0)
    else {
        return Ok(Vec::new());
    };

    let cache_dir = std::env::temp_dir().join("henkan-osu-hook");
    fs::create_dir_all(&cache_dir)
        .map_err(|error| format!("Cannot create background cache: {error}"))?;
    let cache_key = format!("{set_id}-cover.jpg");
    let cache_path = cache_dir.join(cache_key);
    if let Ok(bytes) = fs::read(&cache_path) {
        if !bytes.is_empty() && bytes.len() as u64 <= crate::osu::background::MAX_IMAGE_BYTES {
            return Ok(bytes);
        }
    }

    let url = format!("{ASSET_BASE}/beatmaps/{set_id}/covers/cover.jpg");
    let response = ureq::get(&url)
        .header("User-Agent", "henkan/1.0")
        .call()
        .map_err(|error| format!("Cannot fetch the osu! beatmap artwork: {error}"))?;
    let mut body = response.into_body();
    let mut reader = body
        .with_config()
        .limit(crate::osu::background::MAX_IMAGE_BYTES)
        .reader();
    let mut bytes = Vec::new();
    reader
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Cannot read the osu! beatmap artwork: {error}"))?;
    if bytes.is_empty() {
        return Ok(Vec::new());
    }
    let _ = fs::write(&cache_path, &bytes);
    Ok(bytes)
}

pub fn parse_selected_line(line: &str) -> Option<(String, String, String, String)> {
    let marker = "Game-wide working beatmap updated to ";
    let value = line.split_once(marker)?.1.trim();
    if value.is_empty() || value.contains("no beatmap selected") {
        return None;
    }

    let split = value.find(" - ")?;
    let artist = value[..split].trim().to_string();
    let rest = value[split + 3..].trim();
    let difficulty_start = rest.rfind(" [")?;
    let difficulty = rest[difficulty_start + 2..]
        .strip_suffix(']')
        .unwrap_or(&rest[difficulty_start + 2..])
        .trim()
        .to_string();
    let song = rest[..difficulty_start].trim();
    let creator_start = song.rfind(" (")?;
    let title = song[..creator_start].trim().to_string();
    let creator = song[creator_start + 2..]
        .strip_suffix(')')
        .unwrap_or(&song[creator_start + 2..])
        .trim()
        .to_string();
    Some((artist, title, creator, difficulty))
}

pub fn storage_path(root: &Path, hash: &str) -> Option<PathBuf> {
    if hash.len() != 64 || !hash.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return None;
    }
    Some(
        root.join("files")
            .join(&hash[..1])
            .join(&hash[..2])
            .join(hash),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Live Windows/macOS probe for the desktop integration. Run explicitly
    /// with `cargo test osu::lazer::tests::reads_the_running_lazer_client --
    /// --ignored --nocapture` when osu!lazer is open.
    #[test]
    #[ignore]
    fn reads_the_running_lazer_client() {
        let watcher = Watcher::default();
        let live = watcher.poll();
        println!("lazer live: {live:?}");
        assert!(live.running, "osu!lazer must be running for this test");
        if let (Some(root), Some(map)) = (discover_root(), live.map.as_ref()) {
            let hash = map.folder.strip_prefix(STORAGE_PREFIX).unwrap_or_default();
            let assets = local_assets(&root, hash);
            println!(
                "local assets: background={} audio={}",
                assets.background.as_ref().map_or(0, Vec::len),
                assets.audio.as_ref().map_or(0, Vec::len)
            );
            let source = storage_path(&root, hash).expect("live chart path");
            let content = fs::read(&source).expect("live chart bytes");
            let text = String::from_utf8(content.clone()).expect("live chart text");
            let candidate = parse_candidate(hash, &text).expect("live chart metadata");
            let archive_path = pack_local_map(hash, &candidate, &content, &text, assets)
                .expect("pack local chart");
            let file = fs::File::open(archive_path).expect("open local archive");
            let mut archive = zip::ZipArchive::new(file).expect("read local archive");
            let names = (0..archive.len())
                .filter_map(|index| {
                    archive
                        .by_index(index)
                        .ok()
                        .map(|entry| entry.name().to_string())
                })
                .collect::<Vec<_>>();
            println!("local archive entries: {names:?}");
        }
    }

    #[test]
    fn parses_a_lazer_working_beatmap_log_line() {
        assert_eq!(
            parse_selected_line(
                "2026-09-13 22:10:21 [verbose]: Game-wide working beatmap updated to Kairiki Bear - Beajek's Eta Jack Practice Pack (Beajek) [[Alluminati] Disappearance Addiction x1.36 (Low/Mid)]"
            ),
            Some((
                "Kairiki Bear".to_string(),
                "Beajek's Eta Jack Practice Pack".to_string(),
                "Beajek".to_string(),
                "[Alluminati] Disappearance Addiction x1.36 (Low/Mid)".to_string(),
            ))
        );
    }

    #[test]
    fn treats_the_empty_selection_as_no_map() {
        assert_eq!(
            parse_selected_line(
                "[verbose]: Game-wide working beatmap updated to please select or load a beatmap! - no beatmap selected!"
            ),
            None
        );
    }

    #[test]
    fn builds_the_hashed_lazer_storage_path() {
        let hash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        assert_eq!(
            storage_path(Path::new("/osu"), hash),
            Some(PathBuf::from(format!("/osu/files/0/01/{hash}")))
        );
        assert_eq!(storage_path(Path::new("/osu"), "not-a-hash"), None);
    }

    #[test]
    fn matches_a_log_selection_to_a_stored_chart() {
        let chart = concat!(
            "osu file format v14\n",
            "[Metadata]\n",
            "Title:Beajek's Eta Jack Practice Pack\n",
            "Artist:Kairiki Bear\n",
            "Creator:Beajek\n",
            "Version:[Alluminati] Disappearance Addiction x1.36 (Low/Mid)\n",
            "BeatmapID:123\n",
            "BeatmapSetID:456\n",
        );
        let hash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let candidate = parse_candidate(hash, chart).expect("chart metadata");
        let selection = (
            "Kairiki Bear".to_string(),
            "Beajek's Eta Jack Practice Pack".to_string(),
            "Beajek".to_string(),
            "[Alluminati] Disappearance Addiction x1.36 (Low/Mid)".to_string(),
        );
        assert!(candidate_matches(&candidate, &selection));
        assert_eq!(candidate.map_id, 123);
        assert_eq!(candidate.set_id, 456);
    }

    #[test]
    fn indexes_only_osu_chart_files_from_lazer_storage() {
        let root = std::env::temp_dir().join("henkan-lazer-index-test");
        let _ = std::fs::remove_dir_all(&root);
        let hash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
        let chart_path = storage_path(&root, hash).expect("storage path");
        std::fs::create_dir_all(chart_path.parent().expect("chart parent")).unwrap();
        std::fs::write(
            &chart_path,
            concat!(
                "osu file format v14\n",
                "[Metadata]\n",
                "Title:Test\nArtist:Artist\nCreator:Mapper\nVersion:Hard\n"
            ),
        )
        .unwrap();
        let candidates = scan_candidates(&root);
        let _ = std::fs::remove_dir_all(&root);
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].hash, hash);
        assert_eq!(candidates[0].file, "Hard.osu");
    }

    #[test]
    fn selects_the_requested_chart_from_a_downloaded_set() {
        let root =
            std::env::temp_dir().join(format!("henkan-lazer-zip-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let archive_path = root.join("set.osz");
        let file = fs::File::create(&archive_path).unwrap();
        let mut writer = zip::ZipWriter::new(file);
        let options: zip::write::FileOptions<'_, ()> = zip::write::FileOptions::default();
        let chart = |title: &str, version: &str, audio: &str, background: &str| {
            format!(
                "osu file format v14\n\n[General]\nAudioFilename: {audio}\n\n[Metadata]\nTitle:{title}\nArtist:Artist\nCreator:Mapper\nVersion:{version}\nBeatmapID:1\nBeatmapSetID:2\n\n[Events]\n0,0,\"{background}\",0,0\n"
            )
        };
        for (name, content) in [
            (
                "Wrong.osu",
                chart("Song", "Wrong", "wrong.mp3", "wrong.png"),
            ),
            (
                "Requested.osu",
                chart("Song", "Requested", "requested.mp3", "requested.png"),
            ),
        ] {
            writer.start_file(name, options).unwrap();
            writer.write_all(content.as_bytes()).unwrap();
        }
        for (name, bytes) in [
            ("wrong.mp3", b"wrong audio".as_slice()),
            ("wrong.png", b"\x89PNG wrong image".as_slice()),
            ("requested.mp3", b"requested audio".as_slice()),
            ("requested.png", b"\x89PNG requested image".as_slice()),
        ] {
            writer.start_file(name, options).unwrap();
            writer.write_all(bytes).unwrap();
        }
        writer.finish().unwrap();

        let selected_text = chart("Song", "Requested", "requested.mp3", "requested.png");
        let selected = parse_candidate(
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            &selected_text,
        )
        .unwrap();
        assert_eq!(
            downloaded_background(&archive_path.to_string_lossy(), &selected)
                .unwrap()
                .unwrap(),
            b"\x89PNG requested image"
        );
        let packed = pack_downloaded_map(
            &archive_path.to_string_lossy(),
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            &selected,
        )
        .unwrap()
        .unwrap();
        let file = fs::File::open(&packed).unwrap();
        let mut result = zip::ZipArchive::new(file).unwrap();
        let names = (0..result.len())
            .map(|index| result.by_index(index).unwrap().name().to_string())
            .collect::<Vec<_>>();
        assert_eq!(
            names,
            vec![
                "Requested.osu".to_string(),
                "requested.mp3".to_string(),
                "requested.png".to_string(),
            ]
        );
        let _ = fs::remove_file(packed);
        let _ = fs::remove_dir_all(root);
    }
}
