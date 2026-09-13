#[cfg(windows)]
mod background;
#[cfg(windows)]
mod install;
#[cfg(windows)]
mod memory;

use serde::Serialize;
#[cfg(windows)]
use std::path::{Path, PathBuf};

#[cfg(not(windows))]
const WINDOWS_ONLY: &str = "The osu! integration is only available on Windows.";

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
        let _ = app;
        OsuStatus::default()
    }
}

/// Event emitted when osu! opens, closes, or changes its selected map.
#[cfg(windows)]
pub const LIVE_EVENT: &str = "henkan://osu-live";

pub fn spawn_watcher(app: tauri::AppHandle) {
    #[cfg(windows)]
    {
        use tauri::{Emitter, Manager};
        app.manage(memory::Watcher::default());
        std::thread::spawn(move || {
            let mut last: Option<memory::Live> = None;
            loop {
                let live = app.state::<memory::Watcher>().poll();
                let pause = live.interval();
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
        let _ = app;
    }
}

#[tauri::command]
pub fn osu_live(app: tauri::AppHandle) -> serde_json::Value {
    #[cfg(windows)]
    {
        serde_json::to_value(watcher(&app).poll()).unwrap_or(serde_json::Value::Null)
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        serde_json::json!({"running": false, "connected": false, "map": null, "problem": null})
    }
}

/// Packs the selected Songs folder into a temporary .osz so Henkan's existing
/// queue can load it through the normal file path flow.
#[tauri::command]
pub fn osu_read_map(app: tauri::AppHandle, folder: String) -> Result<String, String> {
    #[cfg(windows)]
    {
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
        let _ = (app, folder);
        Err(WINDOWS_ONLY.to_string())
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
        let _ = (app, folder, file);
        Err(WINDOWS_ONLY.to_string())
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
