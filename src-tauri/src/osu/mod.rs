#[cfg_attr(not(windows), allow(dead_code))]
pub(crate) mod background;
#[cfg(windows)]
mod install;
mod lazer;
#[cfg(windows)]
mod memory;

use serde::Serialize;
#[cfg(windows)]
use std::path::{Path, PathBuf};

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct OsuStatus {
    pub supported: bool,
    pub installed: bool,
    pub running: bool,
    pub root: Option<String>,
    pub songs: Option<String>,
}

#[cfg(windows)]
fn config_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    use tauri::Manager;
    app.path().app_config_dir().ok()
}

#[cfg(windows)]
fn watcher(app: &tauri::AppHandle) -> tauri::State<'_, memory::Watcher> {
    use tauri::Manager;
    app.state::<memory::Watcher>()
}

#[cfg(windows)]
fn lazer_watcher(app: &tauri::AppHandle) -> tauri::State<'_, lazer::Watcher> {
    use tauri::Manager;
    app.state::<lazer::Watcher>()
}

#[cfg(windows)]
#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct Live {
    running: bool,
    connected: bool,
    map: Option<LiveMap>,
    problem: Option<String>,
    sources: Vec<LiveSource>,
}

#[cfg(windows)]
#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct LiveMap {
    folder: String,
    file: String,
    artist: String,
    title: String,
    creator: String,
    difficulty: String,
    map_id: i32,
    set_id: i32,
    osu_root: Option<String>,
}

#[cfg(windows)]
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct LiveSource {
    id: String,
    client_name: String,
    running: bool,
    connected: bool,
    map: Option<LiveMap>,
    problem: Option<String>,
}

#[cfg(windows)]
fn from_stable(live: memory::Live) -> LiveSource {
    LiveSource {
        id: "osu-stable".to_string(),
        client_name: "osu!stable".to_string(),
        running: live.running,
        connected: live.connected,
        map: live.map.map(|map| LiveMap {
            folder: map.folder,
            file: map.file,
            artist: map.artist,
            title: map.title,
            creator: map.creator,
            difficulty: map.difficulty,
            map_id: map.map_id,
            set_id: map.set_id,
            osu_root: map.osu_root,
        }),
        problem: live.problem,
    }
}

#[cfg(windows)]
fn from_lazer(live: lazer::Live) -> LiveSource {
    LiveSource {
        id: "osu-lazer".to_string(),
        client_name: "osu!lazer".to_string(),
        running: live.running,
        connected: live.connected,
        map: live.map.map(|map| LiveMap {
            folder: map.folder,
            file: map.file,
            artist: map.artist,
            title: map.title,
            creator: map.creator,
            difficulty: map.difficulty,
            map_id: map.map_id,
            set_id: map.set_id,
            osu_root: map.osu_root,
        }),
        problem: live.problem,
    }
}

#[cfg(windows)]
fn combined_live(stable: memory::Live, lazer: lazer::Live) -> Live {
    let stable = from_stable(stable);
    let lazer = from_lazer(lazer);

    // Keep every running client in the payload. The UI can then present Stable
    // and Lazer as separate cards instead of silently choosing one.
    let sources = [stable.clone(), lazer.clone()]
        .into_iter()
        .filter(|source| source.running || source.map.is_some())
        .collect::<Vec<_>>();

    // The legacy top-level fields remain useful to older clients and provide a
    // single background fallback. Prefer a source that currently has a map.
    let active = if lazer.map.is_some() {
        &lazer
    } else if stable.map.is_some() {
        &stable
    } else if lazer.running {
        &lazer
    } else {
        &stable
    };

    Live {
        running: stable.running || lazer.running,
        connected: active.connected,
        map: active.map.clone(),
        problem: active.problem.clone(),
        sources,
    }
}

#[cfg(windows)]
fn locate(app: &tauri::AppHandle) -> Option<(PathBuf, PathBuf)> {
    let root = install::discover_root(config_dir(app).as_deref())
        .or_else(|| watcher(app).running_root())?;
    let songs = install::songs_for(&root);
    Some((root, songs))
}

#[cfg(windows)]
fn status_for(app: &tauri::AppHandle) -> OsuStatus {
    let live = watcher(app).poll();
    match locate(app) {
        Some((root, songs)) => OsuStatus {
            supported: true,
            installed: true,
            running: live.running,
            root: root.to_str().map(str::to_string),
            songs: songs.to_str().map(str::to_string),
        },
        None => OsuStatus {
            supported: true,
            running: live.running,
            ..OsuStatus::default()
        },
    }
}

#[tauri::command]
pub fn osu_status(app: tauri::AppHandle) -> OsuStatus {
    #[cfg(windows)]
    {
        status_for(&app)
    }
    #[cfg(not(windows))]
    {
        use tauri::Manager;
        let root = lazer::discover_root();
        let live = app.state::<lazer::Watcher>().poll();
        OsuStatus {
            supported: true,
            installed: root.is_some(),
            running: live.running,
            root: root.and_then(|path| path.to_str().map(str::to_string)),
            songs: None,
        }
    }
}

/// Event emitted when osu! opens, closes, or changes its selected map.
pub const LIVE_EVENT: &str = "henkan://osu-live";

pub fn spawn_watcher(app: tauri::AppHandle) {
    #[cfg(windows)]
    {
        use tauri::{Emitter, Manager};
        app.manage(memory::Watcher::default());
        app.manage(lazer::Watcher::default());
        std::thread::spawn(move || {
            let mut last: Option<Live> = None;
            loop {
                let stable = app.state::<memory::Watcher>().poll();
                let lazer = app.state::<lazer::Watcher>().poll();
                let live = combined_live(stable, lazer);
                let pause = if live.connected {
                    std::time::Duration::from_millis(500)
                } else if live.running {
                    std::time::Duration::from_secs(1)
                } else {
                    std::time::Duration::from_secs(2)
                };
                if last.as_ref() != Some(&live) {
                    let _ = app.emit(LIVE_EVENT, &live);
                    last = Some(live);
                }
                std::thread::sleep(pause);
            }
        });
    }
    #[cfg(not(windows))]
    {
        use tauri::{Emitter, Manager};
        app.manage(lazer::Watcher::default());
        std::thread::spawn(move || {
            let mut last: Option<lazer::Live> = None;
            loop {
                let live = app.state::<lazer::Watcher>().poll();
                let pause = live.interval();
                if last.as_ref() != Some(&live) {
                    let _ = app.emit(LIVE_EVENT, &live);
                    last = Some(live);
                }
                std::thread::sleep(pause);
            }
        });
    }
}

#[tauri::command]
pub fn osu_live(app: tauri::AppHandle) -> serde_json::Value {
    #[cfg(windows)]
    {
        let stable = watcher(&app).poll();
        let lazer = lazer_watcher(&app).poll();
        serde_json::to_value(combined_live(stable, lazer)).unwrap_or(serde_json::Value::Null)
    }
    #[cfg(not(windows))]
    {
        use tauri::Manager;
        serde_json::to_value(app.state::<lazer::Watcher>().poll())
            .unwrap_or(serde_json::Value::Null)
    }
}

/// Materializes the selected chart so Henkan's existing queue can load it
/// through the normal file path flow. Both stable and Lazer maps return a
/// complete temporary `.osz` whenever the set has a known online id.
#[tauri::command]
pub fn osu_read_map(app: tauri::AppHandle, folder: String) -> Result<String, String> {
    #[cfg(windows)]
    {
        if folder.starts_with("lazer:") {
            return lazer::read_map(&app, &folder);
        }
        let (_, songs) =
            locate(&app).ok_or_else(|| "Could not find your osu! installation.".to_string())?;
        let safe = install::safe_folder(&folder)
            .ok_or_else(|| "That map folder name is not valid.".to_string())?;
        let dir = songs.join(safe);
        if !dir.is_dir() || !install::within(&songs, &dir) {
            return Err("That map folder is not in your osu! Songs folder any more.".to_string());
        }
        let bytes = pack_folder(&dir)?;
        let temp = std::env::temp_dir().join("henkan-osu-hook");
        std::fs::create_dir_all(&temp)
            .map_err(|err| format!("Cannot create temp folder: {err}"))?;
        let path = temp.join(install::osz_file_name(safe));
        std::fs::write(&path, bytes)
            .map_err(|err| format!("Cannot write temporary .osz: {err}"))?;
        Ok(path.to_string_lossy().to_string())
    }
    #[cfg(not(windows))]
    {
        lazer::read_map(&app, &folder)
    }
}

#[tauri::command]
pub fn osu_map_background(
    app: tauri::AppHandle,
    folder: String,
    file: String,
) -> Result<Vec<u8>, String> {
    #[cfg(windows)]
    {
        if folder.starts_with("lazer:") {
            return lazer::map_background(&app, &folder, &file);
        }
        let (_, songs) =
            locate(&app).ok_or_else(|| "Could not find your osu! installation.".to_string())?;
        let safe = install::safe_folder(&folder)
            .ok_or_else(|| "That map folder name is not valid.".to_string())?;
        let dir = songs.join(safe);
        if !dir.is_dir() || !install::within(&songs, &dir) {
            return Err("That map folder is not in your osu! Songs folder any more.".to_string());
        }
        let Some(chart) = difficulty_file(&dir, &file) else {
            return Ok(Vec::new());
        };
        let text = std::fs::read(&chart)
            .map(|bytes| String::from_utf8_lossy(&bytes).into_owned())
            .map_err(|err| format!("Cannot read that map: {err}"))?;
        let Some(image) =
            background::background_name(&text).and_then(|name| background::resolve(&dir, &name))
        else {
            return Ok(Vec::new());
        };
        if !image.is_file() || !install::within(&dir, &image) {
            return Ok(Vec::new());
        }
        let oversized = std::fs::metadata(&image)
            .map(|meta| meta.len() > background::MAX_IMAGE_BYTES)
            .unwrap_or(true);
        if oversized {
            return Ok(Vec::new());
        }
        std::fs::read(&image).map_err(|err| format!("Cannot read map background: {err}"))
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        lazer::map_background(&folder, &file)
    }
}

#[cfg(windows)]
fn difficulty_file(dir: &Path, file: &str) -> Option<PathBuf> {
    if let Some(name) = install::safe_folder(file) {
        let named = dir.join(name);
        if named.is_file()
            && named
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("osu"))
        {
            return Some(named);
        }
    }
    let mut charts: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .extension()
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("osu"))
        })
        .collect();
    charts.sort();
    charts.into_iter().next()
}

#[cfg(windows)]
fn pack_folder(dir: &Path) -> Result<Vec<u8>, String> {
    use std::io::{Cursor, Write};
    use zip::write::FileOptions;

    let entries =
        std::fs::read_dir(dir).map_err(|err| format!("Cannot read the map folder: {err}"))?;
    let mut files = Vec::new();
    let mut total = 0u64;
    for entry in entries.flatten() {
        let path = entry.path();
        let meta = match entry.metadata() {
            Ok(meta) => meta,
            Err(_) => continue,
        };
        if !meta.is_file() {
            continue;
        }
        let name = match entry.file_name().to_str() {
            Some(name) => name.to_string(),
            None => continue,
        };
        let lower = name.to_ascii_lowercase();
        if lower.starts_with('.') || lower.ends_with(".osb") || lower.ends_with(".db") {
            continue;
        }
        total = total.saturating_add(meta.len());
        if total > 512 * 1024 * 1024 {
            return Err("This map folder is larger than 512 MB.".to_string());
        }
        files.push((name, path));
    }
    if files.is_empty()
        || !files
            .iter()
            .any(|(name, _)| name.to_ascii_lowercase().ends_with(".osu"))
    {
        return Err("That folder has no .osu file in it.".to_string());
    }
    files.sort_by(|a, b| a.0.cmp(&b.0));
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options: FileOptions<'_, ()> =
        FileOptions::default().compression_method(zip::CompressionMethod::Stored);
    for (name, path) in files {
        writer
            .start_file(name, options)
            .map_err(|err| format!("Cannot pack the map: {err}"))?;
        writer
            .write_all(&std::fs::read(path).map_err(|err| format!("Cannot read map file: {err}"))?)
            .map_err(|err| format!("Cannot pack the map: {err}"))?;
    }
    writer
        .finish()
        .map(|cursor| cursor.into_inner())
        .map_err(|err| format!("Cannot pack the map: {err}"))
}
