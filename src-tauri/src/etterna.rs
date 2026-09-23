use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant, SystemTime};

use serde::Serialize;

const STORAGE_PREFIX: &str = "etterna:";
const POLL_INTERVAL: Duration = Duration::from_millis(1000);
const INDEX_REFRESH: Duration = Duration::from_secs(30);
const MAX_CHART_BYTES: u64 = 32 * 1024 * 1024;
const UNREADABLE: &str = "Etterna is running, but its current song could not be found.";

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

#[derive(Serialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub supported: bool,
    pub installed: bool,
    pub root: Option<String>,
    pub songs: Option<String>,
}

impl Live {
    pub fn interval(&self) -> Duration {
        POLL_INTERVAL
    }
}

#[derive(Clone, Debug)]
struct Candidate {
    folder: String,
    file: String,
    artist: String,
    title: String,
    creator: String,
    difficulty: String,
    group: String,
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
        if !etterna_running() {
            return Live::default();
        }

        let selection = latest_selection(&root);
        // Gameplay updates nowplaying.txt, so avoid the more expensive
        // Windows handle walk until metadata is unavailable (song select).
        let open_folder = selection
            .is_none()
            .then(|| current_song_folder(&root))
            .flatten();
        if selection.is_none() && open_folder.is_none() {
            return Live {
                running: true,
                connected: true,
                ..Live::default()
            };
        }

        // When the audio handle gives us the song folder, inspect only that
        // folder. Scanning a large Etterna library is reserved for the
        // nowplaying-metadata fallback below.
        let direct_candidate = open_folder
            .as_deref()
            .and_then(|folder| candidate_for_folder(&root, folder));
        let candidate = if direct_candidate.is_some() {
            direct_candidate
        } else {
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
            selection.as_ref().and_then(|selection| {
                state
                    .candidates
                    .iter()
                    .find(|candidate| candidate_matches(candidate, selection))
                    .cloned()
            })
        };
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
                folder: format!("{STORAGE_PREFIX}{}", candidate.folder),
                file: candidate.file.clone(),
                artist: candidate.artist.clone(),
                title: candidate.title.clone(),
                creator: candidate.creator.clone(),
                difficulty: candidate.difficulty.clone(),
                map_id: 0,
                set_id: 0,
                osu_root: Some(root.to_string_lossy().to_string()),
            }),
            problem: None,
        }
    }

    fn lock(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

pub fn spawn_watcher(app: tauri::AppHandle) {
    use tauri::{Emitter, Manager};

    app.manage(Watcher::default());
    std::thread::spawn(move || {
        let mut last: Option<Live> = None;
        loop {
            let live = app.state::<Watcher>().poll();
            let pause = live.interval();
            if last.as_ref() != Some(&live) {
                let _ = app.emit(LIVE_EVENT, &live);
                last = Some(live);
            }
            std::thread::sleep(pause);
        }
    });
}

pub const LIVE_EVENT: &str = "henkan://etterna-live";

#[tauri::command]
pub fn etterna_live(app: tauri::AppHandle) -> serde_json::Value {
    use tauri::Manager;
    serde_json::to_value(app.state::<Watcher>().poll()).unwrap_or(serde_json::Value::Null)
}

#[tauri::command]
pub fn etterna_status() -> Status {
    let root = discover_root();
    Status {
        supported: true,
        installed: root.is_some(),
        songs: root
            .as_ref()
            .and_then(|path| path.join("Songs").to_str().map(str::to_string)),
        root: root.and_then(|path| path.to_str().map(str::to_string)),
    }
}

#[tauri::command]
pub fn etterna_read_map(folder: String, file: String) -> Result<String, String> {
    read_map(&folder, &file)
}

#[tauri::command]
pub fn etterna_map_background(folder: String, file: String) -> Result<Vec<u8>, String> {
    map_background(&folder, &file)
}

pub fn discover_root() -> Option<PathBuf> {
    let mut roots = Vec::new();
    for key in ["ETTERNA_ROOT_DIR", "ETTERNA_ROOT"] {
        if let Some(value) = std::env::var_os(key).filter(|value| !value.is_empty()) {
            roots.push(PathBuf::from(value));
        }
    }
    if let Some(root) = running_root() {
        roots.push(root);
    }

    #[cfg(not(windows))]
    let home = std::env::var_os("HOME").map(PathBuf::from);
    #[cfg(windows)]
    {
        if let Some(value) = std::env::var_os("USERPROFILE") {
            roots.push(PathBuf::from(value).join("Etterna"));
        }
        if let Some(value) = std::env::var_os("APPDATA") {
            roots.push(PathBuf::from(value).join("Etterna"));
        }
        if let Some(value) = std::env::var_os("LOCALAPPDATA") {
            roots.push(PathBuf::from(value).join("Etterna"));
        }
        roots.extend([
            PathBuf::from(r"C:\Etterna"),
            PathBuf::from(r"C:\Games\Etterna"),
        ]);
        if let Some(system_drive) = std::env::var_os("SystemDrive") {
            let drive_root = PathBuf::from(format!("{}\\", system_drive.to_string_lossy()));
            roots.extend(portable_roots_on(&drive_root));
        }
    }
    #[cfg(not(windows))]
    {
        if let Some(home) = home.as_ref() {
            roots.extend([
                home.join("Etterna"),
                home.join("Games/Etterna"),
                home.join("Library/Application Support/Etterna"),
                home.join(".etterna"),
            ]);
        }
        #[cfg(target_os = "macos")]
        roots.extend([
            PathBuf::from("/Applications/Etterna"),
            PathBuf::from("/Applications/Etterna.app"),
        ]);
        #[cfg(not(target_os = "macos"))]
        {
            let data = std::env::var_os("XDG_DATA_HOME")
                .map(PathBuf::from)
                .or_else(|| home.as_ref().map(|path| path.join(".local/share")));
            if let Some(data) = data {
                roots.push(data.join("Etterna"));
                roots.push(data.join("etterna"));
            }
        }
        roots.extend([
            PathBuf::from("/opt/Etterna"),
            PathBuf::from("/usr/local/Etterna"),
        ]);
    }

    roots.into_iter().find(|root| root.join("Songs").is_dir())
}

#[cfg(windows)]
fn portable_roots_on(drive: &Path) -> Vec<PathBuf> {
    let Ok(entries) = fs::read_dir(drive) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| {
            entry
                .file_type()
                .ok()?
                .is_dir()
                .then_some(entry.path().join("Etterna"))
        })
        .filter(|root| root.join("Songs").is_dir())
        .collect()
}

fn running_root() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        for path in windows_etterna_process_paths() {
            if let Some(root) = root_from_executable(&path) {
                return Some(root);
            }
        }
    }
    #[cfg(not(windows))]
    {
        let output = Command::new("ps")
            .args(["-axo", "command="])
            .output()
            .ok()?;
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            let trimmed = line.trim().trim_matches('"');
            let lower = trimmed.to_ascii_lowercase();
            if !is_etterna_command(&lower) {
                continue;
            }
            let executable = if let Some(index) = lower.find(".app/contents/macos/etterna") {
                &trimmed[..index + ".app/Contents/MacOS/Etterna".len()]
            } else {
                trimmed.split_whitespace().next().unwrap_or(trimmed)
            };
            return root_from_executable(Path::new(executable));
        }
    }
    None
}

#[cfg(windows)]
fn windows_etterna_process_paths() -> Vec<PathBuf> {
    // Get-Process -Name Etterna only matches the literal process name. The
    // portable Windows builds retain their version in the executable name
    // (for example, Etterna-0.75.1-win64.exe), so query the executable path
    // and apply the same matcher used by the Unix process scan instead.
    let script = r#"
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -match '(?i)^etterna(?:[-_].*)?\.exe$' -and $_.ExecutablePath } |
  Select-Object -ExpandProperty ExecutablePath
"#;
    let Ok(output) = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
    else {
        return Vec::new();
    };
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|path| !path.is_empty())
        .filter(|path| is_etterna_command(path))
        .map(PathBuf::from)
        .collect()
}

fn root_from_executable(path: &Path) -> Option<PathBuf> {
    let lower = path.to_string_lossy().to_ascii_lowercase();
    if lower.contains(".app/contents/macos/etterna") {
        return path
            .parent()?
            .parent()?
            .parent()?
            .parent()
            .map(Path::to_path_buf);
    }
    let parent = path.parent()?;
    #[cfg(windows)]
    if parent
        .file_name()
        .is_some_and(|name| name.eq_ignore_ascii_case("Program"))
        && parent
            .parent()
            .is_some_and(|root| root.join("Songs").is_dir())
    {
        return parent.parent().map(Path::to_path_buf);
    }
    Some(parent.to_path_buf())
}

fn etterna_running() -> bool {
    #[cfg(windows)]
    {
        if !windows_etterna_process_paths().is_empty() {
            return true;
        }

        // Path lookup can be denied for an elevated process. Fall back to
        // tasklist, but inspect every image name so versioned portable builds
        // are found too.
        let Ok(output) = Command::new("tasklist")
            .args(["/FO", "CSV", "/NH"])
            .output()
        else {
            return false;
        };
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter_map(|line| line.split(',').next())
            .map(|name| name.trim().trim_matches('"'))
            .any(is_etterna_command)
    }
    #[cfg(not(windows))]
    {
        let Ok(output) = Command::new("ps").args(["-axo", "command="]).output() else {
            return false;
        };
        String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(str::trim)
            .any(|line| is_etterna_command(&line.to_ascii_lowercase()))
    }
}

fn current_song_folder(root: &Path) -> Option<String> {
    let pid = etterna_pid()?;
    let songs = root.join("Songs").canonicalize().ok()?;
    for path in open_paths(pid) {
        if let Some(folder) = song_folder_from_audio_path(&songs, Path::new(&path)) {
            return Some(folder);
        }
    }
    None
}

fn song_folder_from_audio_path(songs: &Path, path: &Path) -> Option<String> {
    let extension = path.extension()?;
    let extension = format!(".{}", extension.to_string_lossy().to_ascii_lowercase());
    if !crate::AUDIO_EXTS.contains(&extension.as_str()) {
        return None;
    }
    let canonical = path.canonicalize().ok()?;
    let relative = canonical.strip_prefix(songs).ok()?;
    let folder = relative.parent()?;
    (folder.components().count() >= 2).then(|| folder.to_string_lossy().replace('\\', "/"))
}

#[cfg(target_os = "macos")]
fn open_paths(pid: u32) -> Vec<String> {
    let Ok(output) = Command::new("lsof")
        .args(["-p", &pid.to_string(), "-Fn"])
        .output()
    else {
        return Vec::new();
    };
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| line.strip_prefix('n').map(str::to_string))
        .collect()
}

#[cfg(target_os = "linux")]
fn open_paths(pid: u32) -> Vec<String> {
    fs::read_dir(format!("/proc/{pid}/fd"))
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .filter_map(|entry| fs::read_link(entry.path()).ok())
        .filter_map(|path| path.to_str().map(str::to_string))
        .collect()
}

#[cfg(windows)]
fn open_paths(pid: u32) -> Vec<String> {
    use std::ffi::c_void;
    use std::mem::size_of;

    type RawHandle = *mut c_void;

    #[repr(C)]
    struct SystemHandle {
        object: usize,
        process_id: usize,
        handle: usize,
        granted_access: u32,
        creator_back_trace_index: u16,
        object_type_index: u16,
        handle_attributes: u32,
        reserved: u32,
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn CloseHandle(handle: RawHandle) -> i32;
        fn DuplicateHandle(
            source_process: RawHandle,
            source_handle: RawHandle,
            target_process: RawHandle,
            target_handle: *mut RawHandle,
            desired_access: u32,
            inherit_handle: i32,
            options: u32,
        ) -> i32;
        fn GetCurrentProcess() -> RawHandle;
        fn GetFinalPathNameByHandleW(
            handle: RawHandle,
            path: *mut u16,
            path_length: u32,
            flags: u32,
        ) -> u32;
        fn OpenProcess(access: u32, inherit_handle: i32, process_id: u32) -> RawHandle;
    }

    #[link(name = "ntdll")]
    extern "system" {
        fn NtQuerySystemInformation(
            information_class: u32,
            information: *mut c_void,
            information_length: u32,
            return_length: *mut u32,
        ) -> i32;
    }

    const SYSTEM_EXTENDED_HANDLE_INFORMATION: u32 = 0x40;
    const STATUS_INFO_LENGTH_MISMATCH: i32 = 0xC0000004u32 as i32;
    const PROCESS_DUP_HANDLE: u32 = 0x0040;
    const DUPLICATE_SAME_ACCESS: u32 = 0x00000002;
    const FILE_READ_DATA: u32 = 0x0001;

    unsafe fn final_path(handle: RawHandle) -> Option<String> {
        let mut buffer = vec![0u16; 512];
        loop {
            let length =
                GetFinalPathNameByHandleW(handle, buffer.as_mut_ptr(), buffer.len() as u32, 0);
            if length == 0 {
                return None;
            }
            if (length as usize) < buffer.len() {
                let value = String::from_utf16(&buffer[..length as usize]).ok()?;
                return Some(value.strip_prefix(r"\\?\").unwrap_or(&value).to_string());
            }
            buffer.resize(length as usize + 1, 0);
        }
    }

    let source_process = unsafe { OpenProcess(PROCESS_DUP_HANDLE, 0, pid) };
    if source_process.is_null() {
        return Vec::new();
    }

    let mut size = 1024 * 1024usize;
    let mut result = Vec::new();
    for _ in 0..8 {
        let mut buffer = vec![0u8; size];
        let mut returned = 0u32;
        let status = unsafe {
            NtQuerySystemInformation(
                SYSTEM_EXTENDED_HANDLE_INFORMATION,
                buffer.as_mut_ptr().cast(),
                buffer.len() as u32,
                &mut returned,
            )
        };
        if status == 0 {
            let header_size = size_of::<usize>() * 2;
            if buffer.len() < header_size {
                break;
            }
            let count = unsafe { *(buffer.as_ptr().cast::<usize>()) };
            let entries = unsafe { buffer.as_ptr().add(header_size).cast::<SystemHandle>() };
            let max_count = (buffer.len() - header_size) / size_of::<SystemHandle>();
            let current_process = unsafe { GetCurrentProcess() };
            for index in 0..count.min(max_count) {
                let entry = unsafe { &*entries.add(index) };
                if entry.process_id != pid as usize {
                    continue;
                }
                if entry.granted_access & FILE_READ_DATA == 0 {
                    continue;
                }
                let mut duplicate = std::ptr::null_mut();
                let copied = unsafe {
                    DuplicateHandle(
                        source_process,
                        entry.handle as RawHandle,
                        current_process,
                        &mut duplicate,
                        0,
                        0,
                        DUPLICATE_SAME_ACCESS,
                    )
                };
                if copied == 0 || duplicate.is_null() {
                    continue;
                }
                if let Some(path) = unsafe { final_path(duplicate) } {
                    result.push(path);
                }
                unsafe {
                    CloseHandle(duplicate);
                }
            }
            break;
        }
        if status != STATUS_INFO_LENGTH_MISMATCH {
            break;
        }
        size = (returned as usize).max(size.saturating_mul(2));
    }
    unsafe {
        CloseHandle(source_process);
    }
    result
}

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
fn open_paths(_pid: u32) -> Vec<String> {
    Vec::new()
}

#[cfg(windows)]
fn etterna_pid() -> Option<u32> {
    let output = Command::new("tasklist")
        .args(["/FO", "CSV", "/NH"])
        .output()
        .ok()?;
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let mut fields = line.split(',').map(|field| field.trim().trim_matches('"'));
            let name = fields.next()?;
            let pid = fields.next()?.parse().ok()?;
            is_etterna_command(name).then_some(pid)
        })
        .next()
}

#[cfg(not(windows))]
fn etterna_pid() -> Option<u32> {
    let output = Command::new("ps")
        .args(["-axo", "pid=,command="])
        .output()
        .ok()?;
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        let mut fields = line.trim().splitn(2, char::is_whitespace);
        let pid = fields.next()?.parse().ok()?;
        let command = fields.next().unwrap_or_default();
        if is_etterna_command(command) {
            return Some(pid);
        }
    }
    None
}

fn is_etterna_command(command: &str) -> bool {
    let executable = command
        .trim()
        .trim_matches('"')
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    let file_name = executable.rsplit(['/', '\\']).next().unwrap_or_default();
    executable.ends_with("/etterna")
        || executable.contains("/etterna.app/contents/macos/etterna")
        || executable.ends_with("\\etterna.exe")
        || file_name == "etterna.exe"
        || file_name == "etterna"
        || file_name.starts_with("etterna-")
}

fn latest_selection(root: &Path) -> Option<(String, String, String)> {
    let path = root.join("nowplaying.txt");
    let modified = fs::metadata(&path).ok()?.modified().ok()?;
    if newest_log_created(root).is_some_and(|log| log > modified) {
        return None;
    }
    let text = fs::read_to_string(path).ok()?;
    parse_now_playing(&text)
}

fn newest_log_created(root: &Path) -> Option<SystemTime> {
    fs::read_dir(root.join("Logs"))
        .ok()?
        .flatten()
        .filter_map(|entry| {
            let metadata = entry.metadata().ok()?;
            metadata.created().or_else(|_| metadata.modified()).ok()
        })
        .max()
}

fn parse_now_playing(text: &str) -> Option<(String, String, String)> {
    let value = text.trim().strip_prefix("Now playing ")?;
    let end = value.rfind(" MSD:").unwrap_or(value.len());
    let value = value[..end].trim();
    let in_index = value.rfind(" in ")?;
    let group = value[in_index + 4..].trim();
    let song = value[..in_index].trim();
    let by_index = song.find(" by ")?;
    let title = song[..by_index].trim();
    let artist = song[by_index + 4..].trim();
    if title.is_empty() || artist.is_empty() || group.is_empty() {
        return None;
    }
    Some((title.to_string(), artist.to_string(), group.to_string()))
}

fn scan_candidates(root: &Path) -> Vec<Candidate> {
    let songs = root.join("Songs");
    let mut paths = Vec::new();
    collect_chart_files(&songs, 0, &mut paths);
    paths.sort();
    paths
        .into_iter()
        .filter_map(|path| candidate_from_path(&songs, &path))
        .collect()
}

fn candidate_for_folder(root: &Path, folder: &str) -> Option<Candidate> {
    let songs = root.join("Songs");
    let mut song_dir = songs.clone();
    for component in Path::new(folder).components() {
        match component {
            Component::Normal(part) => song_dir.push(part),
            _ => return None,
        }
    }
    if !song_dir.is_dir() || !within(&songs, &song_dir) {
        return None;
    }
    let mut paths = Vec::new();
    collect_chart_files(&song_dir, 0, &mut paths);
    paths.sort();
    paths
        .into_iter()
        .filter_map(|path| candidate_from_path(&songs, &path))
        .find(|candidate| candidate.folder == folder)
}

fn collect_chart_files(dir: &Path, depth: usize, output: &mut Vec<PathBuf>) {
    if depth > 4 {
        return;
    }
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_chart_files(&path, depth + 1, output);
        } else if path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("sm"))
        {
            output.push(path);
        }
    }
}

fn candidate_from_path(songs: &Path, path: &Path) -> Option<Candidate> {
    let metadata = fs::metadata(path).ok()?;
    if metadata.len() > MAX_CHART_BYTES {
        return None;
    }
    let content = fs::read_to_string(path).ok()?;
    let headers = crate::parsers::etterna::parse_headers(&content);
    let title = headers.get("TITLE")?.trim().to_string();
    let artist = headers.get("ARTIST")?.trim().to_string();
    if title.is_empty() || artist.is_empty() {
        return None;
    }
    let relative = path.strip_prefix(songs).ok()?;
    let folder = relative.parent().unwrap_or(Path::new(""));
    let group = folder
        .components()
        .next()
        .and_then(|component| match component {
            Component::Normal(value) => value.to_str(),
            _ => None,
        })
        .unwrap_or_default()
        .to_string();
    let folder = folder.to_string_lossy().replace('\\', "/");
    let file = path.file_name()?.to_string_lossy().to_string();
    Some(Candidate {
        folder,
        file,
        artist,
        title,
        creator: headers
            .get("CREDIT")
            .cloned()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| first_notes_credit(&content))
            .unwrap_or_default()
            .trim()
            .to_string(),
        difficulty: first_notes_difficulty(&content).unwrap_or_default(),
        group,
    })
}

fn first_notes_credit(content: &str) -> Option<String> {
    let fields = first_notes_fields(content)?;
    fields.get(1).cloned()
}

fn first_notes_difficulty(content: &str) -> Option<String> {
    let fields = first_notes_fields(content)?;
    fields.get(2).cloned()
}

fn first_notes_fields(content: &str) -> Option<Vec<String>> {
    let mut fields = Vec::new();
    let mut in_notes = false;
    for line in content.lines() {
        let line = line.trim();
        if line.eq_ignore_ascii_case("#NOTES:") {
            in_notes = true;
            continue;
        }
        if !in_notes {
            continue;
        }
        if line.is_empty() {
            continue;
        }
        fields.push(line.trim_end_matches(':').trim().to_string());
        if fields.len() == 5 {
            return Some(fields);
        }
    }
    None
}

fn candidate_matches(candidate: &Candidate, selection: &(String, String, String)) -> bool {
    let same = |left: &str, right: &str| left.trim().eq_ignore_ascii_case(right.trim());
    same(&candidate.title, &selection.0)
        && same(&candidate.artist, &selection.1)
        && same(&candidate.group, &selection.2)
}

pub fn read_map(folder: &str, file: &str) -> Result<String, String> {
    let folder = relative_folder(folder)?;
    let file =
        safe_file(file).ok_or_else(|| "That Etterna chart filename is not valid.".to_string())?;
    let root =
        discover_root().ok_or_else(|| "Could not find your Etterna installation.".to_string())?;
    let songs = root.join("Songs");
    let chart = songs.join(&folder).join(file);
    validate_chart(&songs, &chart)?;
    Ok(chart.to_string_lossy().to_string())
}

pub fn map_background(folder: &str, file: &str) -> Result<Vec<u8>, String> {
    let folder = relative_folder(folder)?;
    let file =
        safe_file(file).ok_or_else(|| "That Etterna chart filename is not valid.".to_string())?;
    let root =
        discover_root().ok_or_else(|| "Could not find your Etterna installation.".to_string())?;
    let songs = root.join("Songs");
    let chart = songs.join(&folder).join(file);
    validate_chart(&songs, &chart)?;
    let song_dir = chart
        .parent()
        .ok_or_else(|| "That Etterna chart has no song folder.".to_string())?;
    let content = fs::read_to_string(&chart)
        .map_err(|error| format!("Cannot read that Etterna chart: {error}"))?;
    let headers = crate::parsers::etterna::parse_headers(&content);
    let Some(name) = headers
        .get("BACKGROUND")
        .or_else(|| headers.get("BANNER"))
        .filter(|name| !name.trim().is_empty())
    else {
        return Ok(Vec::new());
    };
    let image = resolve_asset(song_dir, name)
        .ok_or_else(|| "Etterna background was not found.".to_string())?;
    let metadata = fs::metadata(&image)
        .map_err(|error| format!("Cannot inspect Etterna background: {error}"))?;
    if metadata.len() > crate::osu::background::MAX_IMAGE_BYTES {
        return Ok(Vec::new());
    }
    fs::read(image).map_err(|error| format!("Cannot read Etterna background: {error}"))
}

fn relative_folder(value: &str) -> Result<PathBuf, String> {
    let value = value
        .strip_prefix(STORAGE_PREFIX)
        .ok_or_else(|| "That map does not come from Etterna.".to_string())?;
    let mut path = PathBuf::new();
    for component in Path::new(value).components() {
        match component {
            Component::Normal(part) => path.push(part),
            _ => return Err("That Etterna song folder is not valid.".to_string()),
        }
    }
    Ok(path)
}

fn safe_file(value: &str) -> Option<&str> {
    let path = Path::new(value);
    (path.components().count() == 1
        && path
            .components()
            .next()
            .is_some_and(|component| matches!(component, Component::Normal(_)))
        && path
            .extension()
            .is_some_and(|ext| ext.eq_ignore_ascii_case("sm")))
    .then_some(value)
}

fn validate_chart(songs: &Path, chart: &Path) -> Result<(), String> {
    if !chart.is_file() || !within(songs, chart) {
        return Err("That Etterna chart is no longer in its Songs folder.".to_string());
    }
    Ok(())
}

fn within(base: &Path, path: &Path) -> bool {
    let Ok(base) = base.canonicalize() else {
        return false;
    };
    let Ok(path) = path.canonicalize() else {
        return false;
    };
    path.starts_with(base)
}

fn resolve_asset(dir: &Path, name: &str) -> Option<PathBuf> {
    let exact = dir.join(name.trim());
    if exact.is_file() && within(dir, &exact) {
        return Some(exact);
    }
    let wanted = Path::new(name.trim())
        .file_name()?
        .to_string_lossy()
        .to_ascii_lowercase();
    fs::read_dir(dir)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .find(|path| {
            path.is_file()
                && path
                    .file_name()
                    .is_some_and(|file| file.to_string_lossy().to_ascii_lowercase() == wanted)
                && within(dir, path)
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_etterna_now_playing_output() {
        assert_eq!(
            parse_now_playing(
                "Now playing Lolibox by Sewerslvt in ZeroCandy Stamina Chordjack Killer MSD: 26.60"
            ),
            Some((
                "Lolibox".to_string(),
                "Sewerslvt".to_string(),
                "ZeroCandy Stamina Chordjack Killer".to_string(),
            ))
        );
    }

    #[test]
    fn ignores_blank_or_menu_now_playing_output() {
        assert_eq!(parse_now_playing(" "), None);
        assert_eq!(parse_now_playing("Now playing "), None);
    }

    #[test]
    fn reads_the_first_stepmania_chart_fields() {
        let chart = "#NOTES:\n dance-single:\n mapper:\n Challenge:\n 12:\n 0,0,0,0,0:\n";
        assert_eq!(first_notes_credit(chart).as_deref(), Some("mapper"));
        assert_eq!(first_notes_difficulty(chart).as_deref(), Some("Challenge"));
    }

    #[test]
    fn rejects_unsafe_chart_identifiers() {
        assert!(relative_folder("etterna:Group/Song").is_ok());
        assert!(relative_folder("etterna:../outside").is_err());
        assert!(safe_file("chart.sm").is_some());
        assert!(safe_file("../chart.sm").is_none());
        assert!(safe_file("chart.osu").is_none());
    }

    #[test]
    fn identifies_etterna_process_names() {
        assert!(is_etterna_command(
            "/Applications/Etterna/Etterna.app/Contents/MacOS/Etterna"
        ));
        assert!(is_etterna_command(
            "/Applications/Etterna/Etterna.app/Contents/MacOS/Etterna --theme=Til%20Death"
        ));
        assert!(is_etterna_command("/opt/Etterna/Etterna-x86_64.AppImage"));
        assert!(is_etterna_command("C:\\Etterna\\Etterna.exe"));
        assert!(is_etterna_command("C:\\Etterna\\Etterna-0.75.1-win64.exe"));
        assert!(!is_etterna_command(
            "/Applications/Henkan.app/Contents/MacOS/henkan"
        ));
        assert!(!is_etterna_command("/tmp/notetterna"));
        assert_eq!(
            root_from_executable(Path::new(
                "/Applications/Etterna/Etterna.app/Contents/MacOS/Etterna"
            )),
            Some(PathBuf::from("/Applications/Etterna"))
        );
        #[cfg(windows)]
        {
            assert_eq!(
                root_from_executable(Path::new(r"C:\Games\Etterna\Etterna.exe")),
                Some(PathBuf::from(r"C:\Games\Etterna"))
            );
            let root =
                std::env::temp_dir().join(format!("henkan-etterna-program-{}", std::process::id()));
            let _ = fs::remove_dir_all(&root);
            fs::create_dir_all(root.join("Program")).unwrap();
            fs::create_dir_all(root.join("Songs")).unwrap();
            assert_eq!(
                root_from_executable(&root.join("Program/Etterna.exe")),
                Some(root.clone())
            );
            let _ = fs::remove_dir_all(root);
        }
    }

    #[cfg(windows)]
    #[test]
    fn finds_portable_etterna_one_folder_below_a_drive_root() {
        let drive =
            std::env::temp_dir().join(format!("henkan-etterna-drive-{}", std::process::id()));
        let root = drive.join("STUFF/Etterna");
        let _ = fs::remove_dir_all(&drive);
        fs::create_dir_all(root.join("Songs")).unwrap();

        assert_eq!(portable_roots_on(&drive), vec![root]);

        let _ = fs::remove_dir_all(drive);
    }

    #[test]
    fn matches_a_song_folder_to_now_playing_metadata() {
        let root = std::env::temp_dir().join("henkan-etterna-test");
        let songs = root.join("Songs");
        let folder = songs.join("Test Pack/Test Song");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&folder).unwrap();
        let chart = folder.join("Test Song.sm");
        fs::write(
            &chart,
            "#TITLE:Test Song;\n#ARTIST:Test Artist;\n#NOTES:\n dance-single:\n Mapper:\n Challenge:\n 10:\n 0,0,0,0,0:\n",
        )
        .unwrap();
        let candidate = candidate_from_path(&songs, &chart).expect("song candidate");
        assert!(candidate_matches(
            &candidate,
            &(
                "Test Song".to_string(),
                "Test Artist".to_string(),
                "Test Pack".to_string()
            )
        ));
        assert_eq!(candidate.folder, "Test Pack/Test Song");
        assert_eq!(candidate.file, "Test Song.sm");
        assert_eq!(candidate.difficulty, "Challenge");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn finds_the_song_folder_from_an_open_audio_file() {
        let root = std::env::temp_dir().join("henkan-etterna-audio-test");
        let songs = root.join("Songs");
        let folder = songs.join("Pack/Song");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&folder).unwrap();
        let audio = folder.join("preview.mp3");
        fs::write(&audio, b"audio").unwrap();
        let songs = songs.canonicalize().unwrap();
        assert_eq!(
            song_folder_from_audio_path(&songs, &audio),
            Some("Pack/Song".to_string())
        );
        assert_eq!(
            song_folder_from_audio_path(&songs, &folder.join("notes.txt")),
            None
        );
        let _ = fs::remove_dir_all(root);
    }
}
