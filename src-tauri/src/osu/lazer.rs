use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant, SystemTime};

use serde::Serialize;

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
    let home = PathBuf::from(std::env::var_os("HOME")?);
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

    // Lazer keeps charts and media under unrelated content hashes. A normal
    // import is a complete `.osz`, so fetch that same archive before handing
    // the path to the existing queue. This also keeps audio, backgrounds, and
    // every difficulty on the same path as a dropped map.
    if candidate.set_id > 0 {
        let label = format!("{} - {}", candidate.artist, candidate.title);
        let filename = format!("{}.osz", crate::sanitize_filename(&label, 160));
        return crate::download_mirror_osz(app.clone(), candidate.set_id as u64, filename);
    }

    let temp = std::env::temp_dir().join("henkan-osu-hook");
    fs::create_dir_all(&temp).map_err(|error| format!("Cannot create temp folder: {error}"))?;
    // Unsubmitted/local maps do not have a mirror set id. Keep the chart
    // importable and let the normal queue report missing media for those maps.
    let path = imported_chart_path(hash);
    fs::write(&path, content).map_err(|error| format!("Cannot write temporary .osu: {error}"))?;
    Ok(path.to_string_lossy().to_string())
}

fn imported_chart_path(hash: &str) -> PathBuf {
    std::env::temp_dir()
        .join("henkan-osu-hook")
        .join(format!("lazer-{hash}.osu"))
}

/// Lazer stores chart and media files under content hashes, so the chart does
/// not sit beside its background like a stable Songs folder does. The public
/// beatmapset cover is a small, reliable artwork fallback when the local Realm
/// asset index cannot be resolved by the desktop bridge.
pub fn map_background(folder: &str, _file: &str) -> Result<Vec<u8>, String> {
    let hash = folder
        .strip_prefix(STORAGE_PREFIX)
        .ok_or_else(|| "That map does not come from osu!lazer.".to_string())?;
    let root = discover_root()
        .ok_or_else(|| "Could not find your osu!lazer data folder.".to_string())?;
    let source = storage_path(&root, hash)
        .filter(|path| path.is_file())
        .ok_or_else(|| "That osu!lazer map is no longer in local storage.".to_string())?;
    let content = fs::read_to_string(&source)
        .map_err(|error| format!("Cannot read the osu!lazer map: {error}"))?;
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
    fn keeps_a_standalone_osu_file_for_local_maps_without_a_set_id() {
        let path = imported_chart_path("0123456789abcdef");
        assert_eq!(
            path.file_name().and_then(|name| name.to_str()),
            Some("lazer-0123456789abcdef.osu")
        );
    }
}
