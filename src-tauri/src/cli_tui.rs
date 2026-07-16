use std::cell::Cell;
use std::env;
use std::io::{self, Write};
use std::path::PathBuf;
use std::process::Command;
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};
use serde::{Deserialize, Serialize};
use crate as henkan_lib;

use crossterm::cursor::{Hide, Show};
use crossterm::event::{
    self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEventKind, MouseButton,
    MouseEventKind,
};
use crossterm::terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen};
use crossterm::ExecutableCommand;
use rand::Rng;
use ratatui::prelude::*;
use ratatui::widgets::*;

pub fn run(args: &[String]) -> io::Result<()> {
    if args.len() > 1 && matches!(args[1].as_str(), "-h" | "--help") {
        splash_stdout(); help_stdout(); return Ok(());
    }
    if args.len() > 1 && matches!(args[1].as_str(), "parse" | "convert" | "export") {
        if let Err(e) = non_interactive(&args[1], &args) {
            eprintln!("Error: {}", e);
        }
        return Ok(());
    }
    interactive_tui()
}

const BG: Color = Color::Rgb(18, 18, 24);
const SURFACE: Color = Color::Rgb(26, 26, 34);
const SURFACE_LIGHT: Color = Color::Rgb(32, 32, 42);
const BORDER: Color = Color::Rgb(60, 60, 80);
const BORDER_ACTIVE: Color = Color::Rgb(80, 140, 255);
const TEXT: Color = Color::Rgb(200, 200, 210);
const DIM: Color = Color::Rgb(100, 100, 120);
const ACCENT: Color = Color::Rgb(80, 140, 255);
const GREEN: Color = Color::Rgb(80, 200, 80);
const RED: Color = Color::Rgb(220, 80, 80);
const YELLOW: Color = Color::Rgb(220, 200, 80);

const LOGO: &[&str] = &[
    "██╗  ██╗███████╗███╗   ██╗██╗  ██╗ █████╗ ███╗   ██╗",
    "██║  ██║██╔════╝████╗  ██║██║ ██╔╝██╔══██╗████╗  ██║",
    "███████║█████╗  ██╔██╗ ██║█████╔╝ ███████║██╔██╗ ██║",
    "██╔══██║██╔══╝  ██║╚██╗██║██╔═██╗ ██╔══██║██║╚██╗██║",
    "██║  ██║███████╗██║ ╚████║██║  ██╗██║  ██║██║ ╚████║",
    "╚═╝  ╚═╝╚══════╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝",
];

#[cfg(target_os = "windows")]
fn disable_quickedit() {
    type DWORD = u32;
    type HANDLE = *mut std::ffi::c_void;
    type BOOL = i32;
    const STD_INPUT_HANDLE: DWORD = 0xFFFFFFF6u32;
    const ENABLE_EXTENDED_FLAGS: DWORD = 0x0080;
    const ENABLE_QUICK_EDIT: DWORD = 0x0040;
    extern "system" {
        fn GetStdHandle(n: DWORD) -> HANDLE;
        fn GetConsoleMode(h: HANDLE, m: *mut DWORD) -> BOOL;
        fn SetConsoleMode(h: HANDLE, m: DWORD) -> BOOL;
    }
    unsafe {
        let h = GetStdHandle(STD_INPUT_HANDLE);
        let invalid: HANDLE = -1isize as *mut std::ffi::c_void;
        if h == invalid || h.is_null() { return; }
        let mut mode: DWORD = 0;
        if GetConsoleMode(h, &mut mode) == 0 { return; }
        mode |= ENABLE_EXTENDED_FLAGS;
        mode &= !ENABLE_QUICK_EDIT;
        SetConsoleMode(h, mode);
    }
}
#[cfg(not(target_os = "windows"))]
fn disable_quickedit() {}

fn interactive_tui() -> io::Result<()> {
    enable_raw_mode()?;
    disable_quickedit();
    io::stdout().execute(EnterAlternateScreen)?;
    io::stdout().execute(Hide)?;
    io::stdout().execute(EnableMouseCapture)?;
    let mut terminal = Terminal::new(CrosstermBackend::new(io::stdout()))?;
    let mut app = App::new();
    let res = app.run(&mut terminal);
    disable_raw_mode()?;
    io::stdout().execute(Show)?;
    io::stdout().execute(DisableMouseCapture)?;
    io::stdout().execute(LeaveAlternateScreen)?;
    if let Err(e) = &res { eprintln!("Error: {}", e); }
    res
}

struct ExportResult {
    title: String,
    mapper: String,
    difficulty: String,
    from: String,
    to: String,
}

#[derive(PartialEq)]
enum Screen {
    Drop,
    Results,
    Settings,
    SelectDiffs,
    PackSelect,
}

struct PackMap {
    path: PathBuf,
    name: String,
    artist: String,
    mapper: String,
    // Per-map overrides
    title_ov: String,
    artist_ov: String,
    mapper_ov: String,
    diff_ov: String,
    hp_drain: Option<f64>,
    overall_difficulty: Option<f64>,
    conversion_rate: Option<f64>,
    preserve_pitch: Option<bool>,
}

struct DiffMetaOverride {
    title: String,
    artist: String,
    mapper: String,
    diff: String,
    // Per-diff numeric/boolean overrides (None = use global setting)
    hp_drain: Option<f64>,
    overall_difficulty: Option<f64>,
    conversion_rate: Option<f64>,
    preserve_pitch: Option<bool>,
}

struct Star {
    x: u16, y: i32, speed: u16, brightness: u8, size: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CliSettings {
    fetch_avatar: bool,
    export_format_osz: bool,
    output_dir: String,
}

impl Default for CliSettings {
    fn default() -> Self {
        Self {
            fetch_avatar: true,
            export_format_osz: true,
            output_dir: "./converts".into(),
        }
    }
}

impl CliSettings {
    fn settings_path() -> std::path::PathBuf {
        if let Ok(home) = std::env::var("HOME") {
            std::path::PathBuf::from(home).join(".config/henkan/settings.json")
        } else {
            std::path::PathBuf::from(".henkan_settings.json")
        }
    }

    fn load() -> Self {
        let path = Self::settings_path();
        std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    fn save(&self) {
        let path = Self::settings_path();
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(s) = serde_json::to_string_pretty(self) {
            let _ = std::fs::write(&path, s);
        }
    }
}

struct App {
    cwd: PathBuf,
    results: Vec<ExportResult>,
    drop_scroll: usize,
    results_scroll: usize,
    stars: Vec<Star>,
    status_msg: String,
    screen: Screen,
    paste_buf: String,
    selecting: bool,
    term_w: u16,
    term_h: u16,
    last_export_dir: PathBuf,
    star_tick: Instant,
    cmd_input: String,
    completions: Vec<String>,
    completion_idx: usize,
    comp_list_area: Cell<Option<Rect>>,
    output_lines: Vec<String>,
    output_scroll: usize,
    cmd_history: Vec<String>,
    history_pos: Option<usize>,
    history_saved: String,
    settings: CliSettings,
    settings_selection: usize,
    // Diff selection state
    diff_entries: Vec<(String, String)>,
    diff_tmp_dir: String,
    diff_info: Vec<henkan_lib::DiffInfo>,
    diff_selection: usize,
    diff_selected: Vec<bool>,
    diff_meta: Vec<DiffMetaOverride>,
    diff_search: String,
    diff_filtered: Vec<usize>,
    editing_diff: Option<usize>,
    _edit_selection: usize,
    _edit_buf: Option<(usize, String)>,
    _from_select: bool,
    pending_labels: (String, String),
    pending_path: String,
    // Pack selection state
    pack_path: PathBuf,
    pack_maps: Vec<PackMap>,
    pack_selection: usize,
    pack_selected: Vec<bool>,
    pack_search: String,
    pack_filtered: Vec<usize>,
    pack_editing: Option<usize>,
    pack_edit_selection: usize,
    quick_path: Option<String>,
    quick_rx: Option<mpsc::Receiver<()>>,
    quick_mode: bool,
    cmd_cursor: usize,
    need_clear: bool,
}

const COMMANDS: &[&str] = &[
    "quick", "results", "open", "clear", "help", "exit", "quit", "settings", "reset", "convert",
];

const COMMAND_DESCS: &[(&str, &str)] = &[
    ("quick", "Open temp folder - drop files & press Enter to convert"),
    ("results", "Switch to results screen"),
    ("open", "Open export folder in file manager"),
    ("clear", "Clear output history and results list"),
    ("help", "Display help and usage information"),
    ("settings", "Show current configuration settings"),
    ("reset", "Reset all settings to defaults"),
    ("convert", "Convert a beatmap file by path"),
    ("exit", "Exit the program"),
    ("quit", "Exit the program"),
];

const SETTING_KEYS: &[&str] = &[
    "avatar", "format", "dir",
];

impl App {
    fn new() -> Self {
        let cwd = env::current_dir().unwrap_or_default();
        Self {
            last_export_dir: cwd.clone(),
            cwd,
            results: Vec::new(),
            drop_scroll: 0,
            results_scroll: 0,
            stars: Vec::new(),
            status_msg: String::new(),
            screen: Screen::Drop,
            paste_buf: String::new(),
            selecting: false,
            term_w: 80,
            term_h: 24,
            star_tick: Instant::now(),
            cmd_input: String::new(),
            completions: Vec::new(),
            completion_idx: 0,
            comp_list_area: Cell::new(None),
            output_lines: Vec::new(),
            output_scroll: 0,
            cmd_history: Vec::new(),
            history_pos: None,
            history_saved: String::new(),
            settings: CliSettings::load(),
            settings_selection: 0,
            diff_entries: Vec::new(),
            diff_tmp_dir: String::new(),
            diff_info: Vec::new(),
            diff_selection: 0,
            diff_selected: Vec::new(),
            diff_meta: Vec::new(),
            editing_diff: None,
            _edit_selection: 0,
            _edit_buf: None,
            diff_search: String::new(),
            diff_filtered: Vec::new(),
            _from_select: false,
            pending_labels: (String::new(), String::new()),
            pending_path: String::new(),
            pack_path: PathBuf::new(),
            pack_maps: Vec::new(),
            pack_selection: 0,
            pack_selected: Vec::new(),
            pack_search: String::new(),
            pack_filtered: Vec::new(),
            pack_editing: None,
            pack_edit_selection: 0,
            quick_path: None,
            quick_rx: None,
            quick_mode: false,
            cmd_cursor: 0,
            need_clear: false,
        }
    }

    fn run(&mut self, terminal: &mut Terminal<CrosstermBackend<io::Stdout>>) -> io::Result<()> {
        if let Ok(s) = terminal.size() { self.term_w = s.width; self.term_h = s.height; }
        self.spawn_stars();
        loop {
            // Check if quick folder was closed (macOS background thread)
            if self.quick_rx.is_some() {
                if self.quick_rx.as_ref().unwrap().try_recv().is_ok() {
                    self.finish_quick();
                }
            }
            if self.need_clear {
                let _ = terminal.clear();
                self.need_clear = false;
            }
            self.check_paste_buf();
            self.update_stars();
            let _ = terminal.draw(|f| self.draw(f));

            if event::poll(Duration::from_millis(50))? {
                match event::read()? {
                    Event::Key(key) => {
                        if key.kind != KeyEventKind::Press { continue; }
                        match self.screen {
                            Screen::Drop => self.handle_drop_key(key),
                            Screen::Results => self.handle_results_key(key),
                            Screen::Settings => self.handle_settings_key(key),
                            Screen::SelectDiffs => self.handle_select_key(key),
                            Screen::PackSelect => self.handle_pack_select_key(key),
                        }
                    }
                    Event::Paste(text) => {
                        self.paste_buf.push_str(&text);
                    }
                    Event::Resize(w, h) => {
                        self.term_w = w; self.term_h = h;
                        self.stars.clear();
                        self.spawn_stars();
                    }
                    Event::Mouse(m) => self.handle_mouse(m),
                    _ => {}
                }
            }
        }
    }

    fn compute_completions(&mut self) {
        let trimmed = self.cmd_input.trim();
        if trimmed.is_empty() {
            self.completions.clear();
            self.completion_idx = 0;
            return;
        }

        // Support both "/cmd" and direct "cmd" syntax
        let search = trimmed.strip_prefix('/').unwrap_or(trimmed);

        if let Some(after_set) = search.strip_prefix("set ") {
            let after = after_set.trim();
            if after.is_empty() {
                self.completions = SETTING_KEYS.iter()
                    .map(|k| format!("set {} ", k))
                    .collect();
            } else {
                self.completions = SETTING_KEYS.iter()
                    .filter(|k| k.starts_with(after))
                    .map(|k| format!("set {} ", k))
                    .collect();
            }
        } else if search.is_empty() {
            // Just "/" shows all commands
            self.completions = COMMANDS.iter()
                .map(|c| c.to_string())
                .collect();
        } else {
            self.completions = COMMANDS.iter()
                .filter(|c| c.starts_with(search))
                .map(|c| c.to_string())
                .collect();
        }
        self.completion_idx = 0;
    }

    fn check_paste_buf(&mut self) {
        if self.paste_buf.is_empty() { return; }
        let content = std::mem::take(&mut self.paste_buf);
        if self.screen == Screen::Drop {
            self.cmd_input.push_str(&content);
            self.cmd_cursor = self.cmd_input.len();
            self.compute_completions();
        }
    }

    fn pick_files_via_dialog(&mut self) {
        self.selecting = true;
        let _ = io::stdout().flush();
        let _ = disable_raw_mode();

        let result = Self::file_dialog_inner();

        let _ = enable_raw_mode();
        let _ = io::stdout().execute(Hide);
        self.selecting = false;

        if let Ok(Some(files)) = result {
            for path in files {
                self.process_file(&path);
            }
            self.results_scroll = 0;
        }
    }

    fn quick_files_via_folder(&mut self) {
        let tmp = std::env::temp_dir().join("henkan_quick");
        let _ = std::fs::create_dir_all(&tmp);
        let path_str = tmp.to_string_lossy().to_string();

        // Open in native file manager
        #[cfg(target_os = "linux")]
        let _ = Command::new("xdg-open").args([&path_str]).spawn();
        #[cfg(target_os = "windows")]
        {
            let _ = Command::new("explorer").args([&path_str]).spawn();
            let (tx, rx) = mpsc::channel();
            let script_path = path_str.clone();
            let script = format!(r##"$path = '{path}'
try {{
    $shell = New-Object -ComObject Shell.Application
    do {{
        Start-Sleep -Milliseconds 500
        $found = $false
        $windows = $shell.Windows()
        if ($windows -ne $null) {{
            for ($i = 0; $i -lt $windows.Count; $i++) {{
                $w = $windows.Item($i)
                if ($w -ne $null -and $w.LocationURL -ne $null) {{
                    if (([System.Uri]$w.LocationURL).LocalPath -eq $path) {{
                        $found = $true
                        break
                    }}
                }}
            }}
        }}
    }} while ($found)
}} catch {{}}
"##, path = script_path.replace('\'', "''"));
            thread::spawn(move || {
                let _ = Command::new("powershell")
                    .args(["-NoProfile", "-NonInteractive", "-Command", &script])
                    .status();
                let _ = tx.send(());
            });
            self.quick_rx = Some(rx);
        }

        #[cfg(target_os = "macos")]
        {
            let (tx, rx) = mpsc::channel();
            let script = format!(r#"tell application "Finder"
    activate
    set theWindow to make new Finder window to folder POSIX file "{}"
    repeat
        try
            if not (exists theWindow) then exit repeat
        on error
            exit repeat
        end try
        delay 0.5
    end repeat
end tell"#, path_str);
            thread::spawn(move || {
                let _ = Command::new("osascript").args(["-e", &script]).status();
                let _ = tx.send(());
            });
            self.quick_rx = Some(rx);
        }

        self.quick_path = Some(path_str);
        self.quick_mode = true;
    }

    fn finish_quick(&mut self) {
        self.quick_rx = None;
        if let Some(ref tmp_path) = self.quick_path.clone() {
            let tmp = std::path::Path::new(&tmp_path);

            let out_dir = self.resolve_output_dir();
            let _ = std::fs::create_dir_all(&out_dir);

            if let Ok(entries) = std::fs::read_dir(tmp) {
                for entry in entries.flatten() {
                    let p = entry.path();
                    if p.is_file() {
                        self.process_file(&p.to_string_lossy());
                    }
                }
            }

            let _ = std::fs::remove_dir_all(tmp);
        }
        self.quick_path = None;
        self.quick_mode = false;
        self.results_scroll = 0;
    }

    fn file_dialog_inner() -> Result<Option<Vec<String>>, String> {
        use std::process::Command;

        if cfg!(target_os = "windows") {
            let script = r#"
Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.OpenFileDialog
$d.Multiselect = $true
$d.Filter = 'Beatmap files (*.osu;*.osz;*.sm)|*.osu;*.osz;*.sm|All files (*.*)|*.*'
$d.Title = 'Select beatmap files'
$d.InitialDirectory = [Environment]::GetFolderPath('Desktop')
$res = $d.ShowDialog()
if ($res -eq 'OK') { $d.FileNames -join "`n" }
"#;
            let output = Command::new("powershell")
                .args(["-NoProfile", "-NonInteractive", "-Command", script])
                .output()
                .map_err(|e| format!("Failed to run dialog: {}", e))?;
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                let files: Vec<String> = text.lines()
                    .map(|l| l.trim().to_string())
                    .filter(|l| !l.is_empty())
                    .collect();
                return Ok(Some(files));
            }
            return Ok(None);
        }

        if cfg!(target_os = "macos") {
            let script = r#"set files to (choose file with multiple selections allowed of type {"osu","osz","sm"})
set output to ""
repeat with f in files
    set output to output & POSIX path of f & "\n"
end repeat
return output"#;
            let output = Command::new("osascript")
                .args(["-e", script])
                .output()
                .map_err(|e| format!("Failed to run dialog: {}", e))?;
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if text.is_empty() { return Ok(None); }
                let files: Vec<String> = text.lines()
                    .map(|l| l.trim().to_string())
                    .filter(|l| !l.is_empty())
                    .collect();
                return Ok(Some(files));
            }
            return Ok(None);
        }

        if cfg!(target_os = "linux") {
            let zenity = Command::new("zenity")
                .args(["--file-selection", "--multiple", "--title=Select beatmap files", "--file-filter=Beatmap files *.osu *.osz *.sm"])
                .output();
            if let Ok(out) = zenity {
                if out.status.success() {
                    let text = String::from_utf8_lossy(&out.stdout);
                    let files: Vec<String> = text.split('|')
                        .map(|l| l.trim().to_string())
                        .filter(|l| !l.is_empty())
                        .collect();
                    return Ok(Some(files));
                }
            }
            let kdialog = Command::new("kdialog")
                .args(["--title=Select beatmap files", "--multiple", "--open", ".", "--file-filter=*.osu *.osz *.sm"])
                .output();
            if let Ok(out) = kdialog {
                if out.status.success() {
                    let text = String::from_utf8_lossy(&out.stdout);
                    let files: Vec<String> = text.lines()
                        .map(|l| l.trim().to_string())
                        .filter(|l| !l.is_empty())
                        .collect();
                    return Ok(Some(files));
                }
            }
            return Err("No file dialog available (install zenity or kdialog)".into());
        }

        Err("Unsupported platform for file dialog".into())
    }

    fn folder_dialog_inner() -> Result<Option<String>, String> {
        use std::process::Command;

        if cfg!(target_os = "macos") {
            let script = r#"set theFolder to choose folder with prompt "Select output directory"
if theFolder is not "" then return POSIX path of theFolder"#;
            let output = Command::new("osascript")
                .args(["-e", script])
                .output()
                .map_err(|e| format!("Failed to run dialog: {}", e))?;
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if text.is_empty() { return Ok(None); }
                return Ok(Some(text));
            }
            return Ok(None);
        }

        if cfg!(target_os = "linux") {
            let output = Command::new("zenity")
                .args(["--file-selection", "--directory", "--title=Select output directory"])
                .output();
            if let Ok(out) = output {
                if out.status.success() {
                    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
                    if !text.is_empty() { return Ok(Some(text)); }
                }
            }
            return Err("No folder dialog available (install zenity)".into());
        }

        if cfg!(target_os = "windows") {
            let script = r#"
Add-Type -AssemblyName System.Windows.Forms
$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = 'Select output directory'
$d.RootFolder = 'Desktop'
$res = $d.ShowDialog()
if ($res -eq 'OK') { $d.SelectedPath }
"#;
            let output = Command::new("powershell")
                .args(["-NoProfile", "-NonInteractive", "-Command", script])
                .output()
                .map_err(|e| format!("Failed to run dialog: {}", e))?;
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if text.is_empty() { return Ok(None); }
                return Ok(Some(text));
            }
            return Ok(None);
        }

        Err("Unsupported platform for folder dialog".into())
    }

    fn handle_drop_key(&mut self, key: crossterm::event::KeyEvent) {
        let has_comps = !self.completions.is_empty();

        // If quick folder is open, Enter finishes it
        if self.quick_path.is_some() {
            match key.code {
                KeyCode::Enter => self.finish_quick(),
                KeyCode::Esc => {
                    let tmp_path = self.quick_path.take();
                    if let Some(p) = tmp_path {
                        let _ = std::fs::remove_dir_all(&p);
                    }
                }
                _ => {}
            }
            return;
        }

        match key.code {
            KeyCode::Enter => {
                if has_comps && self.completion_idx < self.completions.len() {
                    self.cmd_input.clone_from(&self.completions[self.completion_idx]);
                    self.cmd_cursor = self.cmd_input.len();
                    self.completions.clear();
                    self.completion_idx = 0;
                    self.execute_command();
                } else {
                    self.execute_command();
                }
            }
            KeyCode::Tab => self.tab_complete(),
            KeyCode::F(1) => {
                if !self.results.is_empty() { self.go_to_results(); }
            }
            KeyCode::Esc => {
                if has_comps {
                    self.completions.clear();
                    self.completion_idx = 0;
                } else {
                    std::process::exit(0);
                }
            }
            KeyCode::Left => {
                if self.cmd_cursor > 0 {
                    self.cmd_cursor -= 1;
                }
            }
            KeyCode::Right => {
                if self.cmd_cursor < self.cmd_input.len() {
                    self.cmd_cursor += 1;
                }
            }
            KeyCode::Home => {
                self.cmd_cursor = 0;
            }
            KeyCode::End => {
                self.cmd_cursor = self.cmd_input.len();
            }
            KeyCode::Char(ch) => {
                self.cmd_input.insert(self.cmd_cursor, ch);
                self.cmd_cursor += 1;
                self.compute_completions();
            }
            KeyCode::Backspace => {
                if self.cmd_cursor > 0 {
                    self.cmd_cursor -= 1;
                    self.cmd_input.remove(self.cmd_cursor);
                    self.compute_completions();
                }
            }
            KeyCode::Delete => {
                if self.cmd_cursor < self.cmd_input.len() {
                    self.cmd_input.remove(self.cmd_cursor);
                    self.compute_completions();
                }
            }
            KeyCode::Up => {
                if has_comps {
                    if self.completion_idx > 0 {
                        self.completion_idx -= 1;
                    } else {
                        self.completion_idx = self.completions.len().saturating_sub(1);
                    }
                } else if !self.cmd_history.is_empty() {
                    if self.history_pos.is_none() {
                        self.history_saved = self.cmd_input.clone();
                        self.history_pos = Some(self.cmd_history.len() - 1);
                    } else {
                        let pos = self.history_pos.unwrap();
                        if pos > 0 {
                            self.history_pos = Some(pos - 1);
                        }
                    }
                    if let Some(pos) = self.history_pos {
                        self.cmd_input.clone_from(&self.cmd_history[pos]);
                        self.cmd_cursor = self.cmd_input.len();
                    }
                    self.completions.clear();
                    self.completion_idx = 0;
                }
            }
            KeyCode::Down => {
                if has_comps {
                    let last = self.completions.len().saturating_sub(1);
                    if self.completion_idx < last {
                        self.completion_idx += 1;
                    } else {
                        self.completion_idx = 0;
                    }
                } else if let Some(pos) = self.history_pos {
                    if pos < self.cmd_history.len() - 1 {
                        self.history_pos = Some(pos + 1);
                        self.cmd_input.clone_from(&self.cmd_history[pos + 1]);
                        self.cmd_cursor = self.cmd_input.len();
                    } else {
                        self.history_pos = None;
                        self.cmd_input = self.history_saved.clone();
                        self.cmd_cursor = self.cmd_input.len();
                    }
                    self.completions.clear();
                    self.completion_idx = 0;
                }
            }
            KeyCode::PageUp => {
                let max = self.output_lines.len().saturating_sub(1);
                let new_scroll = self.output_scroll.saturating_sub(5);
                self.output_scroll = new_scroll.min(max);
            }
            KeyCode::PageDown => {
                let max = self.output_lines.len().saturating_sub(1);
                let new_scroll = self.output_scroll + 5;
                self.output_scroll = new_scroll.min(max);
            }
            _ => {}
        }
    }

    fn execute_command(&mut self) {
        let trimmed = self.cmd_input.trim().to_string();
        self.cmd_input.clear();
        self.cmd_cursor = 0;
        self.completions.clear();
        self.history_pos = None;
        self.history_saved.clear();

        if trimmed.is_empty() {
            self.pick_files_via_dialog();
            return;
        }

        // Support both "/cmd" and "cmd" syntax
        let trimmed = trimmed.strip_prefix('/').unwrap_or(&trimmed).to_string();

        // Save to history (skip if same as last)
        if self.cmd_history.last().map_or(true, |last| last != &trimmed) {
            self.cmd_history.push(trimmed.clone());
        }

        let (cmd, rest) = trimmed.split_once(' ').unwrap_or((&trimmed, ""));
        let rest = rest.trim();

        match cmd {
            "quick" => self.quick_files_via_folder(),
            "results" | "exports" => {
                if !self.results.is_empty() { self.go_to_results(); }
            }
            "open" => self.open_folder(),
            "clear" => {
                self.results.clear();
                self.status_msg.clear();
                self.output_lines.clear();
                self.output_scroll = 0;
            }
            "convert" => {
                if rest.is_empty() {
                    self.pick_files_via_dialog();
                } else {
                    let file = rest.trim_matches('"');
                    self.process_file(file);
                }
            }
            "settings" => self.go_to_settings(),
            "reset" => {
                self.settings = CliSettings::default();
                self.settings.save();
                self.output_lines.push("  \u{2713} Settings reset to defaults".into());
                self.output_scroll = self.output_lines.len().saturating_sub(1);
            }
            "set" => self.handle_set(rest),
            "help" => self.show_help(),
            "exit" | "quit" => std::process::exit(0),
            _ => self.process_file(&trimmed),
        }
    }

    fn handle_set(&mut self, args: &str) {
        let parts: Vec<&str> = args.split_whitespace().collect();
        if parts.len() < 2 {
            self.output_lines.push("  Usage: set <key> <value>".into());
            self.output_lines.push("  Keys: avatar (on/off), format (osz/folder), dir <path>".into());
            self.output_scroll = self.output_lines.len().saturating_sub(1);
            return;
        }
        let key = parts[0];
        let rest = parts[1..].join(" ");

        let result = match key {
            "Fetch osu! avatars for cdtitle" => parse_onoff(&rest).map(|v| self.settings.fetch_avatar = v),
            "format" => {
                let v = rest.to_lowercase();
                if v == "osz" { self.settings.export_format_osz = true; Ok(()) }
                else if v == "folder" { self.settings.export_format_osz = false; Ok(()) }
                else { Err("Use 'osz' or 'folder'".into()) }
            }
            "dir" => {
                let trimmed = rest.trim();
                if trimmed.is_empty() { Err("Path cannot be empty".into()) }
                else { self.settings.output_dir = trimmed.to_string(); Ok(()) }
            }
            _ => Err(format!("Unknown key: {}", key)),
        };
        if result.is_ok() { self.settings.save(); }

        match result {
            Ok(_) => self.output_lines.push(format!("  \u{2713} {} = {}", key, rest)),
            Err(e) => self.output_lines.push(format!("  \u{2717} {}", e)),
        }
        self.output_scroll = self.output_lines.len().saturating_sub(1);
    }

    fn show_help(&mut self) {
        self.output_lines.push("".into());
        self.output_lines.push(" \u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}".into());
        self.output_lines.push("".into());
        self.output_lines.push("  \u{2502} commands".into());
        self.output_lines.push("".into());
        self.output_lines.push("  \u{2192} quick           Open temp folder - drop files & press Enter to convert".into());
        self.output_lines.push("  \u{2192} convert <path>   Convert a beatmap file".into());
        self.output_lines.push("  \u{2192} results         Switch to results screen".into());
        self.output_lines.push("  \u{2192} open            Open last export folder in file manager".into());
        self.output_lines.push("  \u{2192} clear           Clear output & results".into());
        self.output_lines.push("  \u{2192} settings        Show current settings".into());
        self.output_lines.push("  \u{2192} set <k> <v>     Change a setting (avatar, format, dir)".into());
        self.output_lines.push("  \u{2192} reset           Reset settings to defaults".into());
        self.output_lines.push("  \u{2192} help            Show this help".into());
        self.output_lines.push("  \u{2192} exit / quit     Exit the program".into());
        self.output_lines.push("".into());
        self.output_lines.push("  \u{2502} settings keys".into());
        self.output_lines.push("".into());
        self.output_lines.push("  \u{2192} avatar   Fetch osu! avatar for cdtitle (on/off)".into());
        self.output_lines.push("  \u{2192} format   Export format: osz or folder".into());
        self.output_lines.push("  \u{2192} dir      Output directory (default ./converts)".into());
        self.output_lines.push("".into());
        self.output_lines.push("  \u{2502} edit keys (per-difficulty)".into());
        self.output_lines.push("".into());
        self.output_lines.push("  Press Enter on a difficulty in the select screen to edit metadata".into());
        self.output_lines.push("  This is used for overriding per-difficulty settings before export.".into());
        self.output_lines.push("".into());
        self.output_lines.push("  \u{2192} title    Override title (empty = use source)".into());
        self.output_lines.push("  \u{2192} artist   Override artist (empty = use source)".into());
        self.output_lines.push("  \u{2192} mapper   Override mapper (empty = use source)".into());
        self.output_lines.push("  \u{2192} diff     Override difficulty name (empty = use source)".into());
        self.output_lines.push("  \u{2192} hp       HP drain (default 8)".into());
        self.output_lines.push("  \u{2192} od       Overall difficulty (default 8)".into());
        self.output_lines.push("  \u{2192} rate     Conversion rate multiplier (default 1)".into());
        self.output_lines.push("  \u{2192} pitch    Preserve pitch on rate change (on/off)".into());
        self.output_lines.push("  \u{2192} audio    Copy audio file (on/off)".into());
        self.output_lines.push("  \u{2192} bg       Copy background image (on/off)".into());
        self.output_lines.push("  \u{2192} banner   Copy banner for SM (on/off)".into());
        self.output_lines.push("  \u{2192} cdtitle  Copy cdtitle for SM (on/off)".into());
        self.output_lines.push("".into());
        self.output_lines.push("  \u{2502} tips".into());
        self.output_lines.push("".into());
        self.output_lines.push("  \u{2022} Type a path directly or press Enter with empty input for file dialog".into());
        self.output_lines.push("  \u{2022} Up/Down recalls command history; PageUp/Down scrolls output".into());
        self.output_lines.push("  \u{2022} Tab accepts the top suggestion; arrow keys navigate suggestions".into());
        self.output_lines.push("  \u{2022} Starred items (*) in the pack screen have existing metadata edits".into());
        self.output_lines.push("".into());
        self.output_lines.push(" \u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}".into());
        self.output_lines.push("".into());
        self.output_scroll = self.output_lines.len().saturating_sub(1);
    }

    fn tab_complete(&mut self) {
        if self.completions.is_empty() { return; }
        self.cmd_input.clone_from(&self.completions[0]);
        self.cmd_cursor = self.cmd_input.len();
        self.completions.clear();
        self.completion_idx = 0;
    }

    fn go_to_drop(&mut self) {
        self.screen = Screen::Drop;
        self.results_scroll = 0;
        self.cmd_input.clear();
        self.cmd_cursor = 0;
        self.completions.clear();
        self.quick_path = None;
        self.completion_idx = 0;
        if !self.output_lines.is_empty() {
            self.output_scroll = self.output_lines.len().saturating_sub(1);
        }
    }

    fn go_to_results(&mut self) {
        self.screen = Screen::Results;
        self.drop_scroll = 0;
        self.results_scroll = 0;
        self.need_clear = true;
    }

    fn go_to_settings(&mut self) {
        self.screen = Screen::Settings;
        self.settings_selection = 0;
        self.need_clear = true;
    }

    fn handle_results_key(&mut self, key: crossterm::event::KeyEvent) {
        match key.code {
            KeyCode::Esc | KeyCode::Tab => { self.go_to_drop(); }
            KeyCode::Enter | KeyCode::Char('o') => { self.open_folder(); }
            KeyCode::Up => { if self.results_scroll > 0 { self.results_scroll -= 1; } }
            KeyCode::Down => {
                self.results_scroll = self.results_scroll.min(self.results.len().saturating_sub(1));
                if self.results_scroll < self.results.len().saturating_sub(1) { self.results_scroll += 1; }
            }
            KeyCode::PageUp => {
                self.results_scroll = self.results_scroll.saturating_sub(5);
            }
            KeyCode::PageDown => {
                let max = self.results.len().saturating_sub(1);
                self.results_scroll = (self.results_scroll + 5).min(max);
            }
            _ => {}
        }
    }

    fn handle_settings_key(&mut self, key: crossterm::event::KeyEvent) {
        let max_idx = 2;

        match key.code {
            KeyCode::Esc | KeyCode::Tab => {
                self.settings.save();
                if self._from_select {
                    self._from_select = false;
                    self.screen = Screen::SelectDiffs;
                } else {
                    self.go_to_drop();
                }
            }
            KeyCode::Up => {
                self.settings_selection = self.settings_selection.saturating_sub(1);
            }
            KeyCode::Down => {
                if self.settings_selection < max_idx { self.settings_selection += 1; }
            }
            KeyCode::Enter | KeyCode::Right | KeyCode::Left => {
                match self.settings_selection {
                    0 => {
                        self.settings.fetch_avatar = !self.settings.fetch_avatar;
                        self.settings.save();
                    }
                    1 => {
                        self.settings.export_format_osz = !self.settings.export_format_osz;
                        self.settings.save();
                    }
                    2 => {
                        let _ = io::stdout().flush();
                        let _ = disable_raw_mode();
                        let _ = io::stdout().execute(DisableMouseCapture);
                        let result = Self::folder_dialog_inner();
                        let _ = enable_raw_mode();
                        let _ = io::stdout().execute(Hide);
                        let _ = io::stdout().execute(EnableMouseCapture);
                        if let Ok(Some(dir)) = result {
                            self.settings.output_dir = dir;
                            self.settings.save();
                        }
                    }
                    _ => {}
                }
            }
            _ => {}
        }
    }

    fn handle_select_key(&mut self, key: crossterm::event::KeyEvent) {
        // Metadata editing sub-mode
        if let Some(diff_idx) = self.editing_diff {
            self.handle_select_edit_key(diff_idx, key);
            return;
        }

        let _total = self.diff_info.len();
        let total_filtered = self.diff_filtered.len();
        let export_idx = total_filtered;

        match key.code {
            KeyCode::Tab => {
                self._from_select = true;
                self.cmd_input = self.pending_path.clone();
                self.screen = Screen::Settings;
                self.settings_selection = 0;
            }
            KeyCode::Esc => {
                if !self.diff_search.is_empty() {
                    self.diff_search.clear();
                    self.update_diff_filter();
                    self.diff_selection = 0;
                } else {
                    self.diff_entries.clear();
                    self.diff_tmp_dir.clear();
                    self.diff_info.clear();
                    self.go_to_drop();
                }
            }
            KeyCode::Up => {
                if self.diff_selection > 0 {
                    self.diff_selection -= 1;
                } else if export_idx > 0 {
                    self.diff_selection = export_idx;
                }
            }
            KeyCode::Down => {
                if self.diff_selection < export_idx {
                    self.diff_selection += 1;
                } else {
                    self.diff_selection = 0;
                }
            }
            KeyCode::Char(' ') => {
                if self.diff_selection < total_filtered {
                    let real = self.diff_filtered[self.diff_selection];
                    self.diff_selected[real] = !self.diff_selected[real];
                }
            }
            KeyCode::Enter => {
                if self.diff_selection < total_filtered {
                    let real = self.diff_filtered[self.diff_selection];
                    self.editing_diff = Some(real);
                } else if self.diff_selection == export_idx {
                    self.export_selected_diffs();
                }
            }
            KeyCode::Backspace => {
                self.diff_search.pop();
                self.update_diff_filter();
                if self.diff_selection >= self.diff_filtered.len() && !self.diff_filtered.is_empty() {
                    self.diff_selection = self.diff_filtered.len() - 1;
                }
            }
            KeyCode::Char(c) if !c.is_ascii_control() => {
                self.diff_search.push(c);
                self.update_diff_filter();
                self.diff_selection = 0;
            }
            _ => {}
        }
    }

    fn handle_select_edit_key(&mut self, diff_idx: usize, key: crossterm::event::KeyEvent) {
        // Label, type, min, max - None for text
        const FIELDS: &[(&str, Option<[f64; 2]>)] = &[
            ("Title", None),
            ("Artist", None),
            ("Mapper", None),
            ("Diff", None),
            ("HP", Some([0.0, 10.0])),
            ("OD", Some([0.0, 10.0])),
            ("Rate", Some([0.5, 3.0])),
            ("Pitch", None), // boolean toggle - stored as Option<bool>
        ];
        let field_count = FIELDS.len();

        // Text editing mode
        if let Some((field_idx, buf)) = self._edit_buf.take() {
            let (keep, val) = match key.code {
                KeyCode::Esc => (false, buf),
                KeyCode::Enter => {
                    let meta = &mut self.diff_meta[diff_idx];
                    match field_idx {
                        0 => meta.title = buf.clone(),
                        1 => meta.artist = buf.clone(),
                        2 => meta.mapper = buf.clone(),
                        3 => meta.diff = buf.clone(),
                        4 => meta.hp_drain = buf.parse::<f64>().ok().map(|v| v.max(0.0).min(10.0)),
                        5 => meta.overall_difficulty = buf.parse::<f64>().ok().map(|v| v.max(0.0).min(10.0)),
                        6 => meta.conversion_rate = buf.parse::<f64>().ok().map(|v| v.max(0.5).min(3.0)),
                        7 => { /* boolean toggle handled below */ }
                        _ => {}
                    }
                    (false, buf)
                }
                KeyCode::Backspace => {
                    let mut b = buf;
                    b.pop();
                    (true, b)
                }
                KeyCode::Char(c) => {
                    let mut b = buf;
                    b.push(c);
                    (true, b)
                }
                _ => (false, buf),
            };
            if keep { self._edit_buf = Some((field_idx, val)); }
            return;
        }

        match key.code {
            KeyCode::Esc => {
                self.editing_diff = None;
                self._edit_selection = 0;
            }
            KeyCode::Up => {
                if self._edit_selection > 0 { self._edit_selection -= 1; }
            }
            KeyCode::Down => {
                if self._edit_selection < field_count - 1 { self._edit_selection += 1; }
            }
            KeyCode::Left | KeyCode::Right => {
                let sel = self._edit_selection;
                if let Some([lo, hi]) = FIELDS[sel].1 {
                    let meta = &mut self.diff_meta[diff_idx];
                    let step = if FIELDS[sel].0 == "Rate" { 0.05 } else { 0.5 };
                    let cur = match sel {
                        4 => meta.hp_drain.unwrap_or(5.0),
                        5 => meta.overall_difficulty.unwrap_or(5.0),
                        6 => meta.conversion_rate.unwrap_or(1.0),
                        _ => return,
                    };
                    let delta = if key.code == KeyCode::Left { -step } else { step };
                    let new = (cur + delta).max(lo).min(hi);
                    match sel {
                        4 => meta.hp_drain = Some((new * 10.0).round() / 10.0),
                        5 => meta.overall_difficulty = Some((new * 10.0).round() / 10.0),
                        6 => meta.conversion_rate = Some((new * 100.0).round() / 100.0),
                        _ => {}
                    }
                }
            }
            KeyCode::Enter => {
                if self._edit_selection < 7 {
                    let meta = &self.diff_meta[diff_idx];
                    let val = match self._edit_selection {
                        0 => meta.title.clone(),
                        1 => meta.artist.clone(),
                        2 => meta.mapper.clone(),
                        3 => meta.diff.clone(),
                        4 => meta.hp_drain.map_or(String::new(), |v| format!("{:.1}", v)),
                        5 => meta.overall_difficulty.map_or(String::new(), |v| format!("{:.1}", v)),
                        6 => meta.conversion_rate.map_or(String::new(), |v| format!("{:.2}", v)),
                        _ => return,
                    };
                    self._edit_buf = Some((self._edit_selection, val));
                } else if self._edit_selection == 7 {
                    // Boolean toggle: flip directly
                    let meta = &mut self.diff_meta[diff_idx];
                    let current = meta.preserve_pitch.unwrap_or(true);
                    meta.preserve_pitch = Some(!current);
                }
            }
            _ => {}
        }
    }

    fn handle_mouse(&mut self, ev: crossterm::event::MouseEvent) {
        if ev.kind != MouseEventKind::Up(MouseButton::Left) { return; }
        let pos = Position::new(ev.column, ev.row);
        match self.screen {
            Screen::Drop => {
                // Completion list click
                if let Some(area) = self.comp_list_area.get() {
                    if area.contains(pos) {
                        let row = pos.y as usize - area.y as usize;
                        if row < self.completions.len() {
                            let val = self.completions[row].clone();
                            self.cmd_input = val;
                            self.completions.clear();
                            self.completion_idx = 0;
                        }
                        return;
                    }
                }
            }
            Screen::Results => {}
            Screen::Settings => {}
            Screen::SelectDiffs => {}
            Screen::PackSelect => {}
        }
    }

    fn open_folder(&self) {
        let dir = self.last_export_dir.to_string_lossy();
        #[cfg(target_os = "windows")]
        { let _ = Command::new("cmd").args(["/c", "start", "", &dir]).spawn(); }
        #[cfg(target_os = "macos")]
        { let _ = Command::new("open").arg(&*dir).spawn(); }
        #[cfg(target_os = "linux")]
        { let _ = Command::new("xdg-open").arg(&*dir).spawn(); }
    }

    fn process_file(&mut self, raw: &str) {
        let clean = resolve_path(&deescape_path(&sanitize_path(&raw.trim_matches('"'))), &self.cwd);
        let path = clean;
        let p = std::path::Path::new(&path);

        if !p.exists() {
            self.output_lines.push(format!("  \u{2717} File not found: {}", path));
            self.output_scroll = self.output_lines.len().saturating_sub(1);
            return;
        }

        // If it's a directory, scan as a pack
        if p.is_dir() {
            if self.scan_pack(&path) {
                self.screen = Screen::PackSelect;
                self.output_lines.push(format!("  \u{2713} Found {} song{} in pack", self.pack_maps.len(), if self.pack_maps.len() == 1 { "" } else { "s" }));
            } else {
                self.output_lines.push(format!("  \u{2717} No beatmap files found in: {}", path));
            }
            self.output_scroll = self.output_lines.len().saturating_sub(1);
            return;
        }

        let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
        let (direction, from_label, to_label) = match ext.as_str() {
            "osu" | "osz" => ("osu-to-etterna", "osu!", "StepMania"),
            "sm" => ("etterna-to-osu", "StepMania", "osu!"),
            _ => {
                self.output_lines.push(format!("  \u{2717} Unknown format: .{}", ext));
                self.output_scroll = self.output_lines.len().saturating_sub(1);
                return;
            }
        };

        self.output_lines.push(format!("  > Parsing {}...", &path));

        // For .osz, use extract_osz_all to get entries for multi-difficulty selection
        let bm = if ext == "osz" {
            match henkan_lib::extract_osz_all(&path) {
                Ok((bm, entries, tmp_dir)) => {
                    if bm.available_difficulties.len() > 1 {
                        if self.quick_mode {
                            // Auto-export all diffs without selection screen
                            self.diff_info = bm.available_difficulties.clone();
                            self.diff_tmp_dir = tmp_dir;
                            self.pending_labels = (from_label.to_owned(), to_label.to_owned());
                            self.pending_path = path;
                            self.enter_select_screen(&entries);
                            self.diff_entries = entries;
                            self.export_selected_diffs();
                            return;
                        }
                        self.diff_info = bm.available_difficulties.clone();
                        self.diff_tmp_dir = tmp_dir;
                        self.pending_labels = (from_label.to_owned(), to_label.to_owned());
                        self.pending_path = path;
                        self.output_lines.pop();
                        self.output_lines.push("  > Multiple difficulties detected - select which to export.".into());
                        self.enter_select_screen(&entries);
                        self.diff_entries = entries;
                        return;
                    }
                    bm
                }
                Err(e) => {
                    self.output_lines.push(format!("  \u{2717} Parse error: {}", e));
                    self.output_scroll = self.output_lines.len().saturating_sub(1);
                    return;
                }
            }
        } else {
            match henkan_lib::cli_parse_file(&path, direction) {
                Ok(b) => b,
                Err(e) => {
                    self.output_lines.push(format!("  \u{2717} Parse error: {}", e));
                    self.output_scroll = self.output_lines.len().saturating_sub(1);
                    return;
                }
            }
        };

        self.do_convert(bm, from_label, to_label, &path);
    }

    fn scan_pack(&mut self, dir_path: &str) -> bool {
        let dir = std::path::Path::new(dir_path);
        let mut maps: Vec<PackMap> = Vec::new();
        let _dir_name = dir.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();

        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(_) => return false,
        };
        for entry in entries.flatten() {
            let subdir = entry.path();
            if !subdir.is_dir() { continue; }

            // Look for .sm or .osu files in subdirectory
            let mut map_file: Option<std::path::PathBuf> = None;
            if let Ok(contents) = std::fs::read_dir(&subdir) {
                for file in contents.flatten() {
                    let fp = file.path();
                    let ext = fp.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                    if ext == "sm" || ext == "osu" {
                        map_file = Some(fp);
                        break;
                    }
                }
            }

            if let Some(ref mf) = map_file {
                let ext = mf.extension().and_then(|e| e.to_str()).unwrap_or("");
                let direction = if ext == "osu" || ext == "osz" { "osu-to-etterna" } else { "etterna-to-osu" };
                if let Ok(bm) = henkan_lib::cli_parse_file(&mf.to_string_lossy(), direction) {
                    maps.push(PackMap {
                        path: subdir,
                        name: bm.title,
                        artist: bm.artist.clone(),
                        mapper: bm.creator.clone(),
                        title_ov: String::new(),
                        artist_ov: String::new(),
                        mapper_ov: String::new(),
                        diff_ov: String::new(),
                        hp_drain: None,
                        overall_difficulty: None,
                        conversion_rate: None,
                        preserve_pitch: None,
                    });
                }
            }
        }

        if maps.is_empty() { return false; }

        maps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        self.pack_path = dir.to_path_buf();
        self.pack_maps = maps;
        self.pack_selection = 0;
        self.pack_selected = vec![true; self.pack_maps.len()];
        self.pack_search.clear();
        self.pack_filtered = (0..self.pack_maps.len()).collect();
        self.pack_editing = None;
        true
    }

    fn do_convert(&mut self, mut bm: henkan_lib::Beatmap, from_label: &str, to_label: &str, _path: &str) {
        let mut config = henkan_lib::ExportConfig::default();
        config.title = bm.title.clone();
        config.artist = bm.artist.clone();
        config.creator = bm.creator.clone();
        config.difficulty_name = bm.difficulty_name.clone();
        config.source = bm.source.clone();
        config.tags = bm.tags.clone();
        config.audio_filename = bm.audio_filename.clone();
        config.background_filename = bm.background_filename.clone();
        config.banner_filename = bm.banner_filename.clone();
        config.cdtitle_filename = bm.cdtitle_filename.clone();
        config.preview_time = bm.preview_time;

        config.hp_drain = 8.0;
        config.overall_difficulty = 8.0;
        config.conversion_rate = 1.0;
        config.preserve_pitch = true;
        config.fetch_avatar = self.settings.fetch_avatar;

        self.output_lines.push(format!("  > Converting {}...", bm.title));
        let content = match henkan_lib::cli_convert_beatmap(&mut bm, &config) {
            Ok(c) => c,
            Err(e) => {
                self.output_lines.push(format!("  \u{2717} Convert error: {}", e));
                self.output_scroll = self.output_lines.len().saturating_sub(1);
                return;
            }
        };

        let out_dir = self.resolve_output_dir();
        self.last_export_dir = std::path::PathBuf::from(&out_dir);

        match henkan_lib::cli_export_beatmap(&bm, &config, &content, &out_dir) {
            Ok(_) => {
                self.results.push(ExportResult {
                    title: bm.title.clone(),
                    mapper: bm.creator.clone(),
                    difficulty: bm.difficulty_name.clone(),
                    from: from_label.into(),
                    to: to_label.into(),
                });
                self.output_lines.push(format!("  \u{2713} Exported: {} \u{2192} {}", bm.title, to_label));
                self.status_msg = format!("Exported: {}", bm.title);
                self.go_to_results();
            }
            Err(e) => {
                self.output_lines.push(format!("  \u{2717} Export error: {}", e));
            }
        }
        self.output_scroll = self.output_lines.len().saturating_sub(1);
    }

    fn enter_select_screen(&mut self, entries: &[(String, String)]) {
        let count = entries.len();
        self.diff_selected = vec![true; count];
        self.diff_selection = 0;
        self.editing_diff = None;
        self._edit_selection = 0;
        self._edit_buf = None;
        self.diff_search.clear();
        self.diff_filtered = (0..count).collect();

        // Pre-fill metadata from each entry
        self.diff_meta = entries.iter().map(|(_, text)| {
            let bm = henkan_lib::parse_osu(text).ok();
            DiffMetaOverride {
                title: bm.as_ref().map_or(String::new(), |b| b.title.clone()),
                artist: bm.as_ref().map_or(String::new(), |b| b.artist.clone()),
                mapper: bm.as_ref().map_or(String::new(), |b| b.creator.clone()),
                diff: bm.as_ref().map_or(String::new(), |b| b.difficulty_name.clone()),
                hp_drain: None,
                overall_difficulty: None,
                conversion_rate: None,
                preserve_pitch: None,
            }
        }).collect();

        self.screen = Screen::SelectDiffs;
    }

    fn update_diff_filter(&mut self) {
        if self.diff_search.is_empty() {
            self.diff_filtered = (0..self.diff_info.len()).collect();
        } else {
            let q = self.diff_search.to_lowercase();
            self.diff_filtered = self.diff_info.iter().enumerate()
                .filter(|(_, d)| d.name.to_lowercase().contains(&q))
                .map(|(i, _)| i)
                .collect();
        }
    }

    fn export_selected_diffs(&mut self) {
        let selected: Vec<usize> = self.diff_selected.iter()
            .enumerate()
            .filter(|(_, &s)| s)
            .map(|(i, _)| i)
            .collect();

        if selected.is_empty() { return; }

        self.output_lines.push(format!("  > Exporting {} selected difficult{}...",
            selected.len(), if selected.len() == 1 { "y" } else { "ies" }));

        // Count unique audio files among selected diffs
        let mut audio_set: std::collections::HashSet<String> = std::collections::HashSet::new();
        for &i in &selected {
            if let Some(ref a) = self.diff_info[i].audio_filename {
                if !a.is_empty() { audio_set.insert(a.clone()); }
            }
        }

        let single_audio = audio_set.len() <= 1;

        if single_audio {
            self.export_multi_sm(&selected);
        } else {
            for &i in &selected {
                self.export_single_diff(i);
            }
            self.go_to_results();
        }

        // Clean up state
        self.diff_entries.clear();
        self.diff_tmp_dir.clear();
        self.diff_info.clear();
        self.diff_selected.clear();
        self.diff_meta.clear();
        self.editing_diff = None;
        self._edit_buf = None;
        self.output_scroll = self.output_lines.len().saturating_sub(1);
    }

    fn export_multi_sm(&mut self, indices: &[usize]) {
        let from_label = &self.pending_labels.0;
        let to_label = &self.pending_labels.1;
        let _path = &self.pending_path;

        // Convert each, combine #NOTES: sections into one .sm file
        let mut combined: Option<String> = None;
        let mut first_bm: Option<henkan_lib::Beatmap> = None;

        for &i in indices {
            let (_, text) = &self.diff_entries[i];
            let mut bm = match henkan_lib::parse_osu(text) {
                Ok(b) => b,
                Err(e) => {
                    self.output_lines.push(format!("  \u{2717} Parse error: {}", e));
                    return;
                }
            };
            bm.source_dir = self.diff_tmp_dir.clone();
            bm.source_file = self.pending_path.clone();
            bm.compute_duration();

            // Apply per-diff metadata overrides
            let config = self.build_diff_config(&bm, i);

            let content = match henkan_lib::cli_convert_beatmap(&mut bm, &config) {
                Ok(c) => c,
                Err(e) => {
                    self.output_lines.push(format!("  \u{2717} Convert error: {}", e));
                    return;
                }
            };

            if combined.is_none() {
                combined = Some(content.clone());
                first_bm = Some(bm);
            } else {
                // Extract #NOTES: section and append
                if let Some(pos) = content.find("#NOTES:") {
                    if let Some(ref mut c) = combined {
                        c.push_str(&content[pos..]);
                    }
                }
            }
        }

        let combined = combined.unwrap();
        let bm = first_bm.unwrap();
        let config = self.build_diff_config(&bm, indices[0]);

        // Export with combined content
        let out_dir = self.resolve_output_dir();
        self.last_export_dir = std::path::PathBuf::from(&out_dir);

        // Export with combined content using henkan_lib helpers
        let base = format!("{} [{}]", config.title, config.creator);
        let safe_name = henkan_lib::sanitize_filename(&base, 80);
        let export_path = std::path::Path::new(&out_dir).join(&safe_name);
        if let Err(e) = std::fs::create_dir_all(&export_path) {
            self.output_lines.push(format!("  \u{2717} Create dir error: {}", e));
            return;
        }

        // Copy audio
        if !config.audio_filename.is_empty() {
            let needs_rate = (config.conversion_rate - 1.0).abs() > f64::EPSILON;
            let src_a = henkan_lib::resolve_audio_path(&self.diff_tmp_dir, &config.audio_filename);
            let dst_a = export_path.join(&config.audio_filename);
            if needs_rate {
                if let Some(ff) = henkan_lib::find_ffmpeg() {
                    let _ = henkan_lib::speed_up_audio_ffmpeg(&ff, &src_a, &dst_a, config.conversion_rate, config.preserve_pitch);
                } else {
                    let _ = henkan_lib::speed_up_audio_symphonia(&src_a.to_string_lossy(), &dst_a.to_string_lossy(), config.conversion_rate);
                }
            } else {
                let _ = henkan_lib::copy_media(&self.diff_tmp_dir, &config.audio_filename, &export_path, &config.audio_filename);
            }
        }

        // Write combined .sm
        let out_filename = format!("{}.sm", safe_name);
        if std::fs::write(export_path.join(&out_filename), &combined).is_err() {
            self.output_lines.push("  \u{2717} Failed to write .sm".into());
            return;
        }

        // Copy background
        if let Some(ref bg) = config.background_filename {
            if !bg.is_empty() {
                let _ = henkan_lib::copy_media(&self.diff_tmp_dir, bg, &export_path, "bg.png");
            }
        }

        // cdtitle: copy source → fetch avatar → default fallback
        if bm.source_format == henkan_lib::SourceFormat::OsuMania {
            let has_cdt = config.cdtitle_filename.as_ref().is_some_and(|s| !s.is_empty());
            if has_cdt {
                if let Some(ref cdt) = config.cdtitle_filename {
                    let _ = henkan_lib::copy_media(&self.diff_tmp_dir, cdt, &export_path, "cdtitle.png");
                }
            } else if config.fetch_avatar {
                if let Some(avatar) = henkan_lib::fetch_mapper_avatar(&bm.creator) {
                    let _ = std::fs::write(export_path.join("cdtitle.png"), &avatar);
                } else {
                    let _ = std::fs::write(export_path.join("cdtitle.png"), henkan_lib::DEFAULT_CDTITLE);
                }
            } else {
                let _ = std::fs::write(export_path.join("cdtitle.png"), henkan_lib::DEFAULT_CDTITLE);
            }
        }

        self.results.push(ExportResult {
            title: config.title.clone(),
            mapper: bm.creator.clone(),
            difficulty: format!("{} diffs", indices.len()),
            from: from_label.into(),
            to: to_label.into(),
        });
        self.output_lines.push(format!("  \u{2713} Exported: {} \u{2192} {} ({} diffs)", config.title, to_label, indices.len()));
        self.status_msg = format!("Exported: {}", config.title);
        self.go_to_results();
    }

    fn export_single_diff(&mut self, idx: usize) {
        let (_, text) = &self.diff_entries[idx];
        let mut bm = match henkan_lib::parse_osu(text) {
            Ok(b) => b,
            Err(e) => {
                self.output_lines.push(format!("  \u{2717} Parse error: {}", e));
                return;
            }
        };
        bm.source_dir = self.diff_tmp_dir.clone();
        bm.source_file = self.pending_path.clone();
        bm.compute_duration();

        let from_label = &self.pending_labels.0;
        let to_label = &self.pending_labels.1;
        let config = self.build_diff_config(&bm, idx);
        let _path = &self.pending_path;

        let content = match henkan_lib::cli_convert_beatmap(&mut bm, &config) {
            Ok(c) => c,
            Err(e) => {
                self.output_lines.push(format!("  \u{2717} Convert error: {}", e));
                return;
            }
        };

        let out_dir = self.resolve_output_dir();
        self.last_export_dir = std::path::PathBuf::from(&out_dir);

        // Match desktop/web: output_dir/song_name/diff_name/file + media
        let diff_safe = henkan_lib::sanitize_filename(&config.difficulty_name, 40);
        let song_name = format!("{} - {}", config.artist, config.title);
        let safe_sub = henkan_lib::sanitize_filename(&song_name, 60);
        let export_dir = if diff_safe.is_empty() {
            std::path::PathBuf::from(&out_dir).join(&safe_sub)
        } else {
            std::path::PathBuf::from(&out_dir).join(&safe_sub).join(&diff_safe)
        };
        if let Err(e) = std::fs::create_dir_all(&export_dir) {
            self.output_lines.push(format!("  \u{2717} Dir error: {}", e));
            return;
        }
        let folder_name = if diff_safe.is_empty() {
            None
        } else {
            Some(format!("{} [{}]", config.title, diff_safe))
        };

        match henkan_lib::cli_export_beatmap_named(&bm, &config, &content, &export_dir.to_string_lossy(), folder_name.as_deref(), true) {
            Ok(_) => {
                self.results.push(ExportResult {
                    title: config.title.clone(),
                    mapper: config.creator.clone(),
                    difficulty: config.difficulty_name.clone(),
                    from: from_label.into(),
                    to: to_label.into(),
                });
                self.output_lines.push(format!("  \u{2713} Exported: {} \u{2192} {}  ({})", config.title, to_label, config.difficulty_name));
                self.status_msg = format!("Exported: {}", config.title);
            }
            Err(e) => {
                self.output_lines.push(format!("  \u{2717} Export error: {}", e));
            }
        }
    }

    fn resolve_output_dir(&self) -> String {
        let p = std::path::Path::new(&self.settings.output_dir);
        if p.is_absolute() {
            self.settings.output_dir.clone()
        } else {
            self.cwd.join(&self.settings.output_dir).to_string_lossy().to_string()
        }
    }

    fn build_diff_config(&self, bm: &henkan_lib::Beatmap, idx: usize) -> henkan_lib::ExportConfig {
        let mut config = henkan_lib::ExportConfig::default();
        let meta = &self.diff_meta[idx];

        // Priority: per-diff meta > global settings > original
        config.title = if !meta.title.is_empty() { meta.title.clone() }
            else if !String::new().is_empty() { String::new().clone() }
            else { bm.title.clone() };

        config.artist = if !meta.artist.is_empty() { meta.artist.clone() }
            else if !String::new().is_empty() { String::new().clone() }
            else { bm.artist.clone() };

        config.creator = if !meta.mapper.is_empty() { meta.mapper.clone() }
            else if !String::new().is_empty() { String::new().clone() }
            else { bm.creator.clone() };

        config.difficulty_name = if !meta.diff.is_empty() { meta.diff.clone() }
            else if !String::new().is_empty() { String::new().clone() }
            else { bm.difficulty_name.clone() };

        config.source = bm.source.clone();
        config.tags = bm.tags.clone();
        config.audio_filename = bm.audio_filename.clone();
        config.background_filename = bm.background_filename.clone();
        config.banner_filename = bm.banner_filename.clone();
        config.cdtitle_filename = bm.cdtitle_filename.clone();
        config.preview_time = bm.preview_time;

        config.hp_drain = meta.hp_drain.unwrap_or(8.0);
        config.overall_difficulty = meta.overall_difficulty.unwrap_or(8.0);
        config.conversion_rate = meta.conversion_rate.unwrap_or(1.0);
        config.preserve_pitch = meta.preserve_pitch.unwrap_or(true);
        config.fetch_avatar = self.settings.fetch_avatar;

        config
    }

    // ── Drawing ──────────────────────────────────────────────

    fn draw(&self, f: &mut Frame) {
        let area = f.area();
        f.render_widget(Paragraph::new(" ").style(Style::default().bg(BG)), area);

        for star in &self.stars {
            if star.y < 0 || star.y >= area.height as i32 { continue; }
            let ch = if star.size == 1 { '*' } else { '.' };
            let b = star.brightness;
            f.render_widget(
                Paragraph::new(Span::styled(ch.to_string(), Style::default().fg(Color::Rgb(b, b, b)).bg(BG))),
                Rect::new(star.x, star.y as u16, 1, 1),
            );
        }

        match self.screen {
            Screen::Drop => self.draw_drop(f, area),
            Screen::Results => self.draw_results(f, area),
            Screen::Settings => {
                f.render_widget(
                    Paragraph::new(" ").style(Style::default().bg(Color::Rgb(10, 10, 15))),
                    area,
                );
                self.draw_settings(f, area);
            }
            Screen::SelectDiffs => {
                f.render_widget(
                    Paragraph::new(" ").style(Style::default().bg(Color::Rgb(10, 10, 15))),
                    area,
                );
                self.draw_select(f, area);
            }
            Screen::PackSelect => {
                f.render_widget(
                    Paragraph::new(" ").style(Style::default().bg(Color::Rgb(10, 10, 15))),
                    area,
                );
                self.draw_pack_select(f, area);
            }
        }
    }

    fn draw_drop(&self, f: &mut Frame, area: Rect) {
        if area.width < 30 || area.height < 10 { return; }

        let has_comps = !self.completions.is_empty();
        let hint_items = if has_comps {
            self.completions.len().min(8)
        } else {
            0
        };
        let hint_height = if hint_items > 0 {
            hint_items as u16 + 2
        } else {
            0
        };
        let cmd_bar_height = 3u16;
        let status_height = 1u16;

        let vert = Layout::vertical([
            Constraint::Min(1),
            Constraint::Length(hint_height),
            Constraint::Length(cmd_bar_height),
            Constraint::Length(status_height),
        ]);
        let areas = vert.split(area);
        let output_a = areas[0];
        let hint_a = areas[1];
        let cmd_a = areas[2];
        let status_a = areas[3];

        // ── Content area (output or welcome) ──
        if self.quick_path.is_some() {
            // Quick mode: show instructions
            let block = Block::default()
                .borders(Borders::ALL)
                .border_set(symbols::border::ROUNDED)
                .border_style(Style::default().fg(ACCENT))
                .bg(SURFACE);
            let inner = block.inner(output_a);
            f.render_widget(&block, output_a);

            let lines = vec![
                Line::from(Span::styled("", Style::default().bg(SURFACE))),
                Line::from(Span::styled(
                    format!("  >>> Drop your beatmap files into the folder <<<"),
                    Style::default().fg(ACCENT).bold().bg(SURFACE),
                )),
                Line::from(Span::styled(
                    format!("      {}", self.quick_path.as_ref().unwrap()),
                    Style::default().fg(DIM).bg(SURFACE),
                )),
                Line::from(Span::styled("", Style::default().bg(SURFACE))),
                Line::from(Span::styled(
                    "  Press Enter when done, Esc to cancel",
                    Style::default().fg(TEXT).bg(SURFACE),
                )),
            ];
            f.render_widget(
                Paragraph::new(lines).style(Style::default().bg(SURFACE)),
                inner,
            );
        } else if self.output_lines.is_empty() && self.results.is_empty() {
            // Welcome screen: centered ASCII art logo + hints
            let logo_h = LOGO.len() as u16 + 3;
            let start_y = output_a.top() + (output_a.height.saturating_sub(logo_h).saturating_sub(4) / 2);
            let start_x = output_a.left() + 2;

            // Logo lines
            for (i, line) in LOGO.iter().enumerate() {
                let line_w = line.chars().count() as u16;
                let x = start_x + (output_a.width.saturating_sub(6).saturating_sub(line_w) / 2);
                f.render_widget(
                    Paragraph::new(Span::styled(*line, Style::default().fg(Color::Rgb(80, 140, 255))))
                        .style(Style::default().bg(BG)),
                    Rect::new(x, start_y + i as u16, line_w, 1),
                );
            }

            // Subtitle
            let subtitle = "osu!mania \u{2194} StepMania Converter";
            let sub_x = start_x + (output_a.width.saturating_sub(6).saturating_sub(subtitle.chars().count() as u16) / 2);
            f.render_widget(
                Paragraph::new(Span::styled(subtitle, Style::default().fg(DIM)))
                    .style(Style::default().bg(BG)),
                Rect::new(sub_x, start_y + LOGO.len() as u16 + 1, subtitle.chars().count() as u16, 1),
            );
        } else {
            let out_block = Block::default()
                .borders(Borders::ALL)
                .border_set(symbols::border::ROUNDED)
                .border_style(Style::default().fg(BORDER))
                .bg(SURFACE);
            let inner_h = output_a.height.saturating_sub(2);
            let max_scroll = self.output_lines.len().saturating_sub(inner_h as usize);
            let scroll = self.output_scroll.min(max_scroll);
            let lines: Vec<Line> = self.output_lines.iter().map(|l| {
                let fg = if l.contains("\u{2713}") {
                    GREEN
                } else if l.contains("\u{2717}") {
                    RED
                } else if l.starts_with("  >") {
                    ACCENT
                } else if l.starts_with('\u{2500}') {
                    DIM
                } else if l.contains("\u{2192}") || l.contains("\u{2190}") {
                    YELLOW
                } else {
                    TEXT
                };
                Line::from(Span::styled(l.as_str(), Style::default().fg(fg).bg(SURFACE)))
            }).collect();
            f.render_widget(
                Paragraph::new(lines).block(out_block)
                    .style(Style::default().bg(SURFACE))
                    .scroll((scroll as u16, 0)),
                output_a,
            );
        }

        // ── Hint popup (above command bar) ──
        if has_comps && hint_height > 0 {
            let vis = hint_items;
            let mut hint_lines: Vec<Line> = Vec::with_capacity(vis + 2);
            hint_lines.push(Line::from(Span::styled(
                format!("\u{2500}{:w$}\u{2500}", "", w = hint_a.width.saturating_sub(2) as usize),
                Style::default().fg(BORDER),
            )));
            for i in 0..vis {
                let selected = i == self.completion_idx;
                let cmd = &self.completions[i];
                let desc = desc_for(cmd);
                let arrow = if selected { "\u{276F}" } else { " " };
                let item_fg = if selected { ACCENT } else { TEXT };
                let item_bg = if selected { Color::Rgb(22, 22, 35) } else { BG };

                let avail = hint_a.width.saturating_sub(5);
                let desc_part = if avail > cmd.len() as u16 + 3 {
                    let max_desc = (avail as usize).saturating_sub(cmd.len() + 3);
                    let d = desc.chars().take(max_desc).collect::<String>();
                    format!("  {}", d)
                } else {
                    String::new()
                };

                hint_lines.push(Line::from(vec![
                    Span::styled(format!(" {} ", arrow), Style::default().fg(item_fg).bg(item_bg)),
                    Span::styled(cmd.clone(), Style::default().fg(item_fg).bold().bg(item_bg)),
                    Span::styled(desc_part, Style::default().fg(DIM).bg(item_bg)),
                ]));
            }
            hint_lines.push(Line::from(Span::styled(
                format!("\u{2500}{:w$}\u{2500}", "", w = hint_a.width.saturating_sub(2) as usize),
                Style::default().fg(BORDER),
            )));
            let hint_h = hint_lines.len() as u16;
            self.comp_list_area.set(Some(hint_a));
            f.render_widget(
                Paragraph::new(hint_lines).style(Style::default().bg(BG).fg(DIM)),
                Rect::new(hint_a.x, hint_a.y, hint_a.width, hint_h),
            );
        } else {
            self.comp_list_area.set(None);
        }

        // ── Command input bar ──
        let before = &self.cmd_input[..self.cmd_cursor];
        let at = self.cmd_input.chars().nth(self.cmd_cursor).map(|c| c.to_string()).unwrap_or_default();
        let after = if self.cmd_cursor < self.cmd_input.len() {
            &self.cmd_input[self.cmd_cursor + at.len()..]
        } else {
            ""
        };
        let input_display = format!("{}\u{2588}{}{}", before, at, after);
        let cmd_block = Block::default()
            .borders(Borders::ALL)
            .border_set(symbols::border::ROUNDED)
            .border_style(Style::default().fg(if has_comps { BORDER_ACTIVE } else { BORDER }))
            .bg(SURFACE_LIGHT);
        let cmd_prefix = Span::styled(" \u{276F} ", Style::default().fg(ACCENT).bold());
        let cmd_text = Span::styled(&input_display, Style::default().fg(TEXT));
        f.render_widget(
            Paragraph::new(Line::from(vec![cmd_prefix, cmd_text]))
                .block(cmd_block)
                .style(Style::default().bg(SURFACE_LIGHT)),
            cmd_a,
        );

        // ── Status bar (centered) ──
        let hint = if self.quick_path.is_some() {
            "\u{23CE} convert files  Esc cancel"
        } else if has_comps {
            "\u{2191}\u{2192} navigate  \u{23CE} select  Esc dismiss  Tab accept"
        } else if self.output_lines.is_empty() && self.results.is_empty() {
            "\u{2191}\u{2192} history  Left/Right edit  Enter files  quick folder  Esc exit"
        } else {
            "Esc exit"
        };
        let centered_x = status_a.left() + (status_a.width.saturating_sub(hint.chars().count() as u16) / 2);
        f.render_widget(
            Paragraph::new(Span::styled(hint, Style::default().fg(DIM)))
                .style(Style::default().bg(BG)),
            Rect::new(centered_x, status_a.top(), hint.chars().count() as u16, 1),
        );
    }

    fn draw_results(&self, f: &mut Frame, area: Rect) {
        if area.width < 40 || area.height < 10 { return; }

        let bg = Color::Rgb(10, 10, 15);
        f.render_widget(Paragraph::new(" ").style(Style::default().bg(bg)), area);

        // Title bar
        let title_text = format!(
            " \u{2713} {} file{} exported ",
            self.results.len(),
            if self.results.len() == 1 { "" } else { "s" }
        );
        f.render_widget(
            Paragraph::new(Span::styled(&title_text, Style::default().fg(GREEN).bold()))
                .style(Style::default().bg(SURFACE)),
            Rect::new(0, 0, area.width.min(title_text.len() as u16 + 2), 1),
        );

        // Compact result list - left-aligned, full width
        let pad = 2u16;
        let list_w = area.width.saturating_sub(pad * 2);
        let max_visible = ((area.height - 4) / 2) as usize;
        let scroll = self.results_scroll.min(self.results.len().saturating_sub(max_visible));

        for (i, r) in self.results.iter().skip(scroll).enumerate() {
            let y = 2 + i as u16 * 2;
            if y + 2 >= area.height { break; }

            // Background block
            f.render_widget(Block::default().bg(SURFACE), Rect::new(pad, y, list_w, 2));

            // Line 1: Title + "[" + difficulty + "]" (truncated to fit)
            let diff_part = if r.difficulty.is_empty() {
                String::new()
            } else {
                format!(" [{}]", r.difficulty)
            };
            let title_line = if r.mapper.is_empty() {
                format!("{}", r.title)
            } else {
                format!("{}  \u{00B7}  {}", r.title, r.mapper)
            };
            let line1 = if diff_part.is_empty() {
                title_line
            } else {
                format!("{}  {}", title_line, diff_part)
            };
            let max_chars = list_w as usize - 2;
            let line1 = if line1.len() > max_chars {
                format!("{}...", line1.chars().take(max_chars.saturating_sub(3)).collect::<String>())
            } else {
                line1
            };

            f.render_widget(
                Paragraph::new(Span::styled(line1, Style::default().fg(TEXT).bold()))
                    .alignment(Alignment::Left),
                Rect::new(pad + 1, y, list_w - 2, 1),
            );

            // Line 2: format arrow
            let arrow = Line::from(vec![
                Span::styled(r.from.clone(), Style::default().fg(DIM)),
                Span::styled(" \u{2192} ", Style::default().fg(ACCENT).bold()),
                Span::styled(r.to.clone(), Style::default().fg(GREEN)),
            ]);
            f.render_widget(
                Paragraph::new(arrow).alignment(Alignment::Left),
                Rect::new(pad + 2, y + 1, list_w - 4, 1),
            );
        }

        // Status hint
        f.render_widget(
            Paragraph::new(Span::styled(
                " [Esc] back  [O] open folder  \u{2191}\u{2193} scroll",
                Style::default().fg(DIM),
            )).style(Style::default().bg(bg))
                .alignment(Alignment::Center),
            Rect::new(0, area.height.saturating_sub(1), area.width, 1),
        );
    }

    fn draw_select(&self, f: &mut Frame, area: Rect) {
        // Sub-mode: metadata editing popup
        if let Some(diff_idx) = self.editing_diff {
            self.draw_select_edit(f, area, diff_idx);
            return;
        }

        if area.width < 46 || area.height < 10 { return; }

        let total = self.diff_info.len();
        let filtered = self.diff_filtered.len();
        let max_visible = 8.min(filtered);
        let box_w = 50.min(area.width.saturating_sub(6));
        let box_h = 3 + max_visible as u16 + 2; // direction + search + diffs + export + hint
        let x = (area.width - box_w) / 2;
        let y = (area.height - box_h) / 2;

        // Title from first diff's metadata
        let title = self.diff_meta.first()
            .map(|m| {
                if m.artist.is_empty() { m.title.clone() }
                else { format!("{} \u{2014} {}", m.artist, m.title) }
            })
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| "Select difficulties".into());

        let title_display = if !self.diff_search.is_empty() {
            format!("{} | {} matched", title, filtered)
        } else {
            title
        };

        let outer = Block::default()
            .title(title_display.as_str())
            .title_alignment(Alignment::Center)
            .borders(Borders::ALL)
            .border_set(symbols::border::ROUNDED)
            .border_style(Style::default().fg(ACCENT))
            .bg(SURFACE);
        let box_area = Rect::new(x, y, box_w, box_h);
        f.render_widget(&outer, box_area);
        let inner = outer.inner(box_area);

        let mut lines: Vec<Line> = Vec::new();

        // Direction line
        let from = &self.pending_labels.0;
        let to = &self.pending_labels.1;
        let fmt = format!(" {} \u{2192} {}  \u{00B7}  {}", from, to, total);
        lines.push(Line::from(Span::styled(fmt, Style::default().fg(DIM).bg(SURFACE))));

        // Search bar
        let search_display = if self.diff_search.is_empty() {
            " Search: ".to_string()
        } else {
            format!(" Search: {}\u{2588}", self.diff_search)
        };
        lines.push(Line::from(Span::styled(search_display, Style::default().fg(DIM).bg(SURFACE))));

        // Diffs with scrolling
        let diff_scroll = if self.diff_selection >= filtered {
            filtered.saturating_sub(max_visible)
        } else if self.diff_selection >= max_visible {
            (self.diff_selection - max_visible + 1).min(filtered.saturating_sub(max_visible))
        } else {
            0
        };
        for vi in diff_scroll..(diff_scroll + max_visible).min(filtered) {
            let real = self.diff_filtered[vi];
            let d = &self.diff_info[real];
            let cursor = vi == self.diff_selection;
            let checked = self.diff_selected.get(real).copied().unwrap_or(true);
            let cb = if checked { "[x]" } else { "[ ]" };
            let arrow = if cursor { "\u{276F} " } else { "  " };
            let bg = if cursor { Color::Rgb(22, 22, 36) } else { SURFACE };
            let fg = if cursor { ACCENT } else { TEXT };
            let label = format!("{}{} {}", arrow, cb, d.name);
            let max_w = (box_w - 4) as usize;
            let label = if label.chars().count() > max_w {
                let s: String = label.chars().take(max_w.saturating_sub(2)).collect();
                format!("{}..", s)
            } else {
                label
            };
            lines.push(Line::from(Span::styled(label, Style::default().fg(fg).bg(bg))));
        }

        // Export button
        let sel_count = self.diff_selected.iter().filter(|&&s| s).count();
        let is_export = self.diff_selection >= filtered;
        let label = format!("{}Export {} song{}", if is_export { "\u{276F} " } else { "   " }, sel_count, if sel_count == 1 { "" } else { "s" });
        let btn = format!(" {:^width$} ", label, width = (box_w - 4) as usize);
        lines.push(Line::from(Span::styled(
            btn,
            Style::default().fg(if is_export { BG } else { DIM })
                .bg(if is_export { ACCENT } else { SURFACE })
                .bold(),
        )));

        f.render_widget(
            Paragraph::new(lines).style(Style::default().bg(SURFACE)),
            inner,
        );

        // Hint
        let hint = " \u{2191}\u{2193} nav  Space toggle  Enter edit/export  Type to search  Esc back ";
        f.render_widget(
            Paragraph::new(Span::styled(hint, Style::default().fg(DIM)))
                .style(Style::default().bg(SURFACE)).alignment(Alignment::Center),
            Rect::new(box_area.x, box_area.y + box_area.height - 1, box_area.width, 1),
        );
    }

    fn draw_pack_select(&self, f: &mut Frame, area: Rect) {
        // Sub-mode: map metadata editor popup
        if let Some(map_idx) = self.pack_editing {
            self.draw_pack_edit(f, area, map_idx);
            return;
        }

        if area.width < 50 || area.height < 12 { return; }

        let count = self.pack_maps.len();
        let filtered = self.pack_filtered.len();
        let max_visible = (area.height - 6).min(12) as usize;
        let box_w = 56.min(area.width.saturating_sub(6));
        let box_h = 5 + max_visible.min(filtered) as u16;
        let x = (area.width - box_w) / 2;
        let y = (area.height - box_h) / 2;

        let pack_name = self.pack_path.file_name()
            .map(|n| n.to_string_lossy())
            .unwrap_or(std::borrow::Cow::Borrowed("Pack"));

        let outer = Block::default()
            .title(format!(" {} (\u{00B7} {} song{}) ", pack_name, count, if count == 1 { "" } else { "s" }))
            .title_alignment(Alignment::Center)
            .borders(Borders::ALL)
            .border_set(symbols::border::ROUNDED)
            .border_style(Style::default().fg(ACCENT))
            .bg(SURFACE);
        let box_area = Rect::new(x, y, box_w, box_h);
        f.render_widget(&outer, box_area);
        let inner = outer.inner(box_area);

        let mut lines: Vec<Line> = Vec::new();

        // Search bar
        let search_display = if self.pack_search.is_empty() {
            "Search: ".to_string()
        } else {
            format!("Search: {}\u{2588}", self.pack_search)
        };
        lines.push(Line::from(Span::styled(search_display, Style::default().fg(DIM).bg(SURFACE))));

        // Divider
        lines.push(Line::from(Span::styled(
            "\u{2500}".repeat(inner.width.saturating_sub(2) as usize),
            Style::default().fg(Color::Rgb(40, 40, 55)).bg(SURFACE),
        )));

        // Map rows with scrolling
        let scroll = if self.pack_selection >= max_visible {
            self.pack_selection - max_visible + 1
        } else {
            0
        };
        for vi in scroll..(scroll + max_visible).min(filtered) {
            let real = self.pack_filtered[vi];
            let m = &self.pack_maps[real];
            let cursor = vi == self.pack_selection;
            let checked = self.pack_selected[real];
            let cb = if checked { "[x]" } else { "[ ]" };
            let arrow = if cursor { "\u{276F} " } else { "  " };
            let bg = if cursor { Color::Rgb(22, 22, 36) } else { SURFACE };
            let fg = if cursor { ACCENT } else { TEXT };
            let title_disp = if !m.title_ov.is_empty() { &m.title_ov } else { &m.name };
            let mapper_disp = if !m.mapper_ov.is_empty() { &m.mapper_ov } else { &m.mapper };
            let label = format!("{}{} {} \u{2014} {}", arrow, cb, title_disp, mapper_disp);
            let max_w = (box_w - 6) as usize;
            let label = if label.chars().count() > max_w {
                let s: String = label.chars().take(max_w.saturating_sub(2)).collect();
                format!("{}..", s)
            } else {
                label
            };
            lines.push(Line::from(Span::styled(label, Style::default().fg(fg).bg(bg))));
        }

        // Output format indicator (static, not selectable)
        let fmt_label = if self.settings.export_format_osz { "OSZ" } else { "Folder" };
        let fmt_text = format!("   Output format: [{}]  (\u{2190}\u{2192} toggle)", fmt_label);
        lines.push(Line::from(Span::styled(fmt_text, Style::default().fg(DIM).bg(SURFACE))));

        // Export button
        let is_export = self.pack_selection >= filtered;
        let sel_count = self.pack_selected.iter().filter(|&&s| s).count();
        let label = format!("{}Export {} song{}", if is_export { "\u{276F} " } else { "   " }, sel_count, if sel_count == 1 { "" } else { "s" });
        let btn = format!(" {:^width$} ", label, width = (box_w - 4) as usize);
        lines.push(Line::from(Span::styled(
            btn,
            Style::default().fg(if is_export { BG } else { DIM })
                .bg(if is_export { ACCENT } else { SURFACE })
                .bold(),
        )));

        f.render_widget(
            Paragraph::new(lines).style(Style::default().bg(SURFACE)),
            inner,
        );

        // Hint
        let hint = " \u{2191}\u{2193} nav  Space toggle  Enter edit  Type to search  Esc back ";
        f.render_widget(
            Paragraph::new(Span::styled(hint, Style::default().fg(DIM)))
                .style(Style::default().bg(SURFACE)).alignment(Alignment::Center),
            Rect::new(box_area.x, box_area.y + box_area.height - 1, box_area.width, 1),
        );
    }

    fn draw_pack_edit(&self, f: &mut Frame, area: Rect, map_idx: usize) {
        if area.width < 50 || area.height < 10 { return; }

        struct EditField<'a> { label: &'a str, value: String, is_bool: bool }
        let m = &self.pack_maps[map_idx];
        let cur_hp = format!("{:.1}", m.hp_drain.unwrap_or(8.0));
        let cur_od = format!("{:.1}", m.overall_difficulty.unwrap_or(8.0));
        let cur_rate = format!("{:.2}", m.conversion_rate.unwrap_or(1.0));
        let pitch = m.preserve_pitch.unwrap_or(true);

        let title_val = if m.title_ov.is_empty()  { m.name.clone() } else { m.title_ov.clone() };
        let artist_val = if m.artist_ov.is_empty() { m.artist.clone() } else { m.artist_ov.clone() };
        let mapper_val = if m.mapper_ov.is_empty() { m.mapper.clone() } else { m.mapper_ov.clone() };
        let diff_val = if m.diff_ov.is_empty()   { String::new() } else { m.diff_ov.clone() };
        let fields = [
            EditField { label: "Title",     value: title_val,             is_bool: false },
            EditField { label: "Artist",    value: artist_val,            is_bool: false },
            EditField { label: "Mapper",    value: mapper_val,            is_bool: false },
            EditField { label: "Diff",      value: diff_val,              is_bool: false },
            EditField { label: "HP Drain",  value: cur_hp,                is_bool: false },
            EditField { label: "OD",        value: cur_od,                is_bool: false },
            EditField { label: "Rate",      value: cur_rate,              is_bool: false },
            EditField { label: "Pitch",     value: if pitch { "ON" } else { "OFF" }.into(), is_bool: true },
        ];

        let box_w = 46.min(area.width.saturating_sub(10));
        let box_h = 4 + fields.len() as u16 + 1; // +1 for section separator
        let x = (area.width - box_w) / 2;
        let y = (area.height - box_h) / 2;

        let title = format!(" {} ", m.name);
        let outer = Block::default()
            .title(title.as_str())
            .title_alignment(Alignment::Center)
            .borders(Borders::ALL)
            .border_set(symbols::border::ROUNDED)
            .border_style(Style::default().fg(if self._edit_buf.is_some() { GREEN } else { ACCENT }))
            .bg(SURFACE);
        let box_area = Rect::new(x, y, box_w, box_h);
        f.render_widget(&outer, box_area);
        let inner = outer.inner(box_area);

        let mut lines: Vec<Line> = Vec::new();
        lines.push(Line::from(Span::styled(
            " Metadata",
            Style::default().fg(DIM).bg(SURFACE),
        )));
        for (i, fld) in fields.iter().enumerate() {
            if i == 4 {
                lines.push(Line::from(Span::styled(
                    " Settings",
                    Style::default().fg(DIM).bg(SURFACE),
                )));
            }
            let cursor = i == self.pack_edit_selection && self._edit_buf.is_none();
            let editing = self._edit_buf.as_ref().map_or(false, |(f, _)| *f == i + 100);
            let arrow = if cursor || editing { "\u{276F}" } else { " " };
            let bg = if cursor || editing { Color::Rgb(22, 22, 36) } else { SURFACE };
            let fg = if cursor { ACCENT } else if editing { GREEN } else if fld.is_bool {
                if fld.value == "ON" { Color::Rgb(108, 92, 231) } else { DIM }
            } else { TEXT };

            let display = if editing {
                let buf = &self._edit_buf.as_ref().unwrap().1;
                format!("{}_", buf)
            } else if fld.is_bool {
                format!("[{:^3}]", fld.value)
            } else if fld.value.is_empty() && i == 3 {
                "(source)".to_string()
            } else {
                fld.value.chars().take(20).collect::<String>()
            };

            let label_w = 10usize;
            let text = format!(" {} {:<label_w$}  {}", arrow, fld.label, display);
            lines.push(Line::from(Span::styled(text, Style::default().fg(fg).bg(bg))));
        }

        f.render_widget(
            Paragraph::new(lines).style(Style::default().bg(SURFACE)),
            inner,
        );

        let hint = if self._edit_buf.is_some() {
            " Type \u{23CE} done  Esc cancel "
        } else {
            " \u{2191}\u{2193} select  Enter edit/toggle  Esc back "
        };
        f.render_widget(
            Paragraph::new(Span::styled(hint, Style::default().fg(DIM)))
                .style(Style::default().bg(SURFACE)).alignment(Alignment::Center),
            Rect::new(box_area.x, box_area.y + box_area.height - 1, box_area.width, 1),
        );
    }

    fn draw_select_edit(&self, f: &mut Frame, area: Rect, diff_idx: usize) {
        // Metadata fields definition
        struct EditField<'a> { label: &'a str, value: String, is_bool: bool }
        let meta = &self.diff_meta[diff_idx];
        let cur_hp = meta.hp_drain.map_or(String::new(), |v| format!("{:.1}", v));
        let cur_od = meta.overall_difficulty.map_or(String::new(), |v| format!("{:.1}", v));
        let cur_rate = meta.conversion_rate.map_or(String::new(), |v| format!("{:.2}", v));
        let pitch = meta.preserve_pitch.unwrap_or(true);

        let fields = [
            EditField { label: "Title",     value: meta.title.clone(),     is_bool: false },
            EditField { label: "Artist",    value: meta.artist.clone(),    is_bool: false },
            EditField { label: "Mapper",    value: meta.mapper.clone(),    is_bool: false },
            EditField { label: "Diff",      value: meta.diff.clone(),      is_bool: false },
            EditField { label: "HP Drain",  value: cur_hp,                 is_bool: false },
            EditField { label: "OD",        value: cur_od,                 is_bool: false },
            EditField { label: "Rate",      value: cur_rate,               is_bool: false },
            EditField { label: "Pitch",     value: if pitch { "ON" } else { "OFF" }.into(), is_bool: true },
        ];

        let box_w = 46.min(area.width.saturating_sub(10));
        let box_h = 4 + fields.len() as u16 + 1; // 1 line per field + separator rows
        let x = (area.width - box_w) / 2;
        let y = (area.height - box_h) / 2;

        let fmt = if self.pending_labels.0 == "osu!" { "osu! → SM" } else { "SM → osu!" };
        let title = format!(" {} [{}] ", self.diff_info[diff_idx].name, fmt);
        let outer = Block::default()
            .title(title.as_str())
            .title_alignment(Alignment::Center)
            .borders(Borders::ALL)
            .border_set(symbols::border::ROUNDED)
            .border_style(Style::default().fg(if self._edit_buf.is_some() { GREEN } else { ACCENT }))
            .bg(SURFACE);
        let box_area = Rect::new(x, y, box_w, box_h);
        f.render_widget(&outer, box_area);
        let inner = outer.inner(box_area);

        let mut lines: Vec<Line> = Vec::new();
        // Section header: metadata
        lines.push(Line::from(Span::styled(
            " Metadata",
            Style::default().fg(DIM).bg(SURFACE),
        )));
        for (i, fld) in fields.iter().enumerate() {
            if i == 4 {
                lines.push(Line::from(Span::styled(
                    " Settings",
                    Style::default().fg(DIM).bg(SURFACE),
                )));
            }
            let cursor = i == self._edit_selection && self._edit_buf.is_none();
            let editing = self._edit_buf.as_ref().map_or(false, |(f, _)| *f == i);
            let arrow = if cursor || editing { "\u{276F}" } else { " " };
            let bg = if cursor || editing { Color::Rgb(22, 22, 36) } else { SURFACE };
            let fg = if cursor { ACCENT } else if editing { GREEN } else if fld.is_bool {
                if fld.value == "ON" { Color::Rgb(108, 92, 231) } else { DIM }
            } else { TEXT };

            let display = if editing {
                let buf = &self._edit_buf.as_ref().unwrap().1;
                format!("{}_", buf)
            } else if fld.is_bool {
                format!("[{:^3}]", fld.value)
            } else if fld.value.is_empty() {
                "(source)".to_string()
            } else {
                fld.value.chars().take(20).collect::<String>()
            };

            let label_w = 10usize;
            let text = format!(" {} {:<label_w$}  {}", arrow, fld.label, display);
            lines.push(Line::from(Span::styled(text, Style::default().fg(fg).bg(bg))));
        }

        f.render_widget(
            Paragraph::new(lines).style(Style::default().bg(SURFACE)),
            inner,
        );

        let hint = if self._edit_buf.is_some() {
            " Type \u{23CE} done  Esc cancel "
        } else {
            " \u{2191}\u{2193} select  Enter edit/toggle  Esc back "
        };
        f.render_widget(
            Paragraph::new(Span::styled(hint, Style::default().fg(DIM)))
                .style(Style::default().bg(SURFACE)).alignment(Alignment::Center),
            Rect::new(box_area.x, box_area.y + box_area.height - 1, box_area.width, 1),
        );
    }

    fn draw_settings(&self, f: &mut Frame, area: Rect) {
        if area.width < 50 || area.height < 16 { return; }

        let box_w = 60.min(area.width.saturating_sub(6));
        let box_h = 12.min(area.height.saturating_sub(2));
        let x = (area.width - box_w) / 2;
        let y = (area.height - box_h) / 2;
        let box_area = Rect::new(x, y, box_w, box_h);

        let outer = Block::default()
            .title(" Settings ")
            .title_alignment(Alignment::Center)
            .borders(Borders::ALL)
            .border_set(symbols::border::ROUNDED)
            .border_style(Style::default().fg(ACCENT))
            .bg(SURFACE);
        f.render_widget(&outer, box_area);
        let inner = outer.inner(box_area);

        let items: Vec<(&str, &str)> = vec![
            ("Fetch osu avatars", if self.settings.fetch_avatar { "on" } else { "off" }),
            ("Format", if self.settings.export_format_osz { "OSZ" } else { "Folder" }),
            ("Output", &self.settings.output_dir),
        ];

        let mut lines: Vec<Line> = Vec::new();
        lines.push(Line::from(Span::styled("", Style::default().bg(SURFACE))));

        for (i, (name, value)) in items.iter().enumerate() {
            let selected = i == self.settings_selection;
            let arrow = if selected { "\u{276F}" } else { " " };
            let bg = if selected { Color::Rgb(22, 22, 36) } else { SURFACE };
            let name_fg = if selected { ACCENT } else { TEXT };
            let value_disp = if value.len() > 30 { format!("{}...", &value[..28]) } else { value.to_string() };
            let name_w = 20usize;
            let pad = " ".repeat(name_w.saturating_sub(name.len()));
            let main = format!(" {} {}{}  {}", arrow, name, pad, value_disp);
            if i == 0 {
                lines.push(Line::from(vec![
                    Span::styled(main, Style::default().fg(name_fg).bold().bg(bg)),
                    Span::styled("  slows down conversion", Style::default().fg(DIM).bg(bg)),
                ]));
            } else {
                lines.push(Line::from(Span::styled(main, Style::default().fg(name_fg).bold().bg(bg))));
            }
        }

        f.render_widget(
            Paragraph::new(lines).style(Style::default().bg(SURFACE)),
            Rect::new(inner.x, inner.y, inner.width, inner.height),
        );

        let hint = "  \u{2191}\u{2193} select  Enter toggle  Esc back  ";
        f.render_widget(
            Paragraph::new(Span::styled(hint, Style::default().fg(DIM).bg(SURFACE)))
                .style(Style::default().bg(SURFACE)).alignment(Alignment::Center),
            Rect::new(box_area.x, box_area.y + box_area.height - 1, box_area.width, 1),
        );
    }

    fn spawn_stars(&mut self) {
        let w = self.term_w.max(10);
        let h = self.term_h.max(4);
        let mut rng = rand::thread_rng();
        let count = (w as usize * h as usize / 20).max(50);
        for _ in 0..count {
            let x = rng.gen_range(0..w);
            let y = rng.gen_range(0..h) as i32;
            let speed = rng.gen_range(1..=4);
            let brightness = rng.gen_range(80..=255);
            let size = if rng.gen_bool(0.3) { 1 } else { 0 };
            self.stars.push(Star { x, y, speed, brightness, size });
        }
    }

    fn update_stars(&mut self) {
        let elapsed = self.star_tick.elapsed();
        if elapsed < Duration::from_millis(50) { return; }
        self.star_tick = Instant::now();

        let w = self.term_w.max(10);
        let h = self.term_h.max(4);
        let mut rng = rand::thread_rng();
        for star in &mut self.stars {
            star.y += star.speed as i32;
            star.brightness = star.brightness.saturating_sub(5).max(80);
        }
        self.stars.retain(|s| s.y < h as i32);
        let spawn = (w as usize / 20).max(2);
        for _ in 0..spawn {
            if rng.gen_bool(0.3) {
                let x = rng.gen_range(0..w);
                let speed = rng.gen_range(1..=4);
                let brightness = rng.gen_range(150..=255);
                let size = if rng.gen_bool(0.3) { 1 } else { 0 };
                self.stars.push(Star { x, y: 0, speed, brightness, size });
            }
        }
    }

    fn handle_pack_select_key(&mut self, key: crossterm::event::KeyEvent) {
        if let Some(map_idx) = self.pack_editing {
            self.handle_pack_edit_key(map_idx, key);
            return;
        }

        let total_filtered = self.pack_filtered.len();

        match key.code {
            KeyCode::Esc => {
                if !self.pack_search.is_empty() {
                    self.pack_search.clear();
                    self.update_pack_filter();
                } else {
                    self.pack_maps.clear();
                    self.pack_selected.clear();
                    self.pack_filtered.clear();
                    self.pack_search.clear();
                    self.go_to_drop();
                }
            }
            KeyCode::Up => {
                if self.pack_selection > 0 {
                    self.pack_selection -= 1;
                } else if total_filtered > 0 {
                    self.pack_selection = total_filtered;
                }
            }
            KeyCode::Down => {
                if self.pack_selection < total_filtered {
                    self.pack_selection += 1;
                } else {
                    self.pack_selection = 0;
                }
            }
            KeyCode::Left | KeyCode::Right => {
                self.settings.export_format_osz = !self.settings.export_format_osz;
            }
            KeyCode::Char(' ') => {
                if self.pack_selection < total_filtered {
                    let real = self.pack_filtered[self.pack_selection];
                    self.pack_selected[real] = !self.pack_selected[real];
                }
            }
            KeyCode::Enter => {
                if self.pack_selection < total_filtered {
                    let real = self.pack_filtered[self.pack_selection];
                    self.pack_editing = Some(real);
                    self.pack_edit_selection = 0;
                } else {
                    self.export_pack();
                }
            }
            KeyCode::Backspace => {
                self.pack_search.pop();
                self.update_pack_filter();
                if self.pack_selection >= self.pack_filtered.len() && !self.pack_filtered.is_empty() {
                    self.pack_selection = self.pack_filtered.len() - 1;
                }
            }
            KeyCode::Char(c) if !c.is_ascii_control() => {
                self.pack_search.push(c);
                self.update_pack_filter();
                self.pack_selection = 0;
            }
            _ => {}
        }
    }

    fn handle_pack_edit_key(&mut self, map_idx: usize, key: crossterm::event::KeyEvent) {
        const FIELDS: &[(&str, Option<[f64; 2]>)] = &[
            ("Title", None),
            ("Artist", None),
            ("Mapper", None),
            ("Diff", None),
            ("HP", Some([0.0, 10.0])),
            ("OD", Some([0.0, 10.0])),
            ("Rate", Some([0.5, 3.0])),
            ("Pitch", None),
        ];
        let field_count = FIELDS.len();

        if let Some((field_idx, buf)) = self._edit_buf.take() {
            let f = field_idx.wrapping_sub(100);
            let (keep, val) = match key.code {
                KeyCode::Esc => (false, buf),
                KeyCode::Enter => {
                    let m = &mut self.pack_maps[map_idx];
                    match f {
                        0 => m.title_ov = buf.clone(),
                        1 => m.artist_ov = buf.clone(),
                        2 => m.mapper_ov = buf.clone(),
                        3 => m.diff_ov = buf.clone(),
                        4 => m.hp_drain = buf.parse::<f64>().ok().map(|v| v.max(0.0).min(10.0)),
                        5 => m.overall_difficulty = buf.parse::<f64>().ok().map(|v| v.max(0.0).min(10.0)),
                        6 => m.conversion_rate = buf.parse::<f64>().ok().map(|v| v.max(0.5).min(3.0)),
                        7 => {}
                        _ => {}
                    }
                    (false, buf)
                }
                KeyCode::Backspace => {
                    let mut b = buf;
                    b.pop();
                    (true, b)
                }
                KeyCode::Char(c) => {
                    let mut b = buf;
                    b.push(c);
                    (true, b)
                }
                _ => (false, buf),
            };
            if keep { self._edit_buf = Some((field_idx, val)); }
            return;
        }

        match key.code {
            KeyCode::Esc => {
        self.pack_editing = None;
        self.pack_edit_selection = 0;
        self.settings.export_format_osz = true;
                self.pack_edit_selection = 0;
            }
            KeyCode::Up => {
                if self.pack_edit_selection > 0 { self.pack_edit_selection -= 1; }
            }
            KeyCode::Down => {
                if self.pack_edit_selection < field_count - 1 { self.pack_edit_selection += 1; }
            }
            KeyCode::Left | KeyCode::Right => {
                let sel = self.pack_edit_selection;
                if sel < field_count {
                    if let Some([lo, hi]) = FIELDS[sel].1 {
                        let m = &mut self.pack_maps[map_idx];
                        let step = if FIELDS[sel].0 == "Rate" { 0.05 } else { 0.5 };
                        let cur = match sel {
                            4 => m.hp_drain.unwrap_or(5.0),
                            5 => m.overall_difficulty.unwrap_or(5.0),
                            6 => m.conversion_rate.unwrap_or(1.0),
                            _ => return,
                        };
                        let delta = if key.code == KeyCode::Left { -step } else { step };
                        let new = (cur + delta).max(lo).min(hi);
                        match sel {
                            4 => m.hp_drain = Some((new * 10.0).round() / 10.0),
                            5 => m.overall_difficulty = Some((new * 10.0).round() / 10.0),
                            6 => m.conversion_rate = Some((new * 100.0).round() / 100.0),
                            _ => {}
                        }
                    }
                }
            }
            KeyCode::Enter => {
                let sel = self.pack_edit_selection;
                if sel < 7 {
                    let m = &self.pack_maps[map_idx];
                    let val = match sel {
                        0 => m.title_ov.clone(),
                        1 => m.artist_ov.clone(),
                        2 => m.mapper_ov.clone(),
                        3 => m.diff_ov.clone(),
                        4 => m.hp_drain.map_or(String::new(), |v| format!("{:.1}", v)),
                        5 => m.overall_difficulty.map_or(String::new(), |v| format!("{:.1}", v)),
                        6 => m.conversion_rate.map_or(String::new(), |v| format!("{:.2}", v)),
                        _ => return,
                    };
                    self._edit_buf = Some((sel + 100, val));
                } else if sel == 7 {
                    let m = &mut self.pack_maps[map_idx];
                    let current = m.preserve_pitch.unwrap_or(true);
                    m.preserve_pitch = Some(!current);
                }
            }
            _ => {}
        }
    }

    fn update_pack_filter(&mut self) {
        if self.pack_search.is_empty() {
            self.pack_filtered = (0..self.pack_maps.len()).collect();
        } else {
            let q = self.pack_search.to_lowercase();
            self.pack_filtered = self.pack_maps.iter().enumerate()
                .filter(|(_, m)| {
                    m.name.to_lowercase().contains(&q) ||
                    m.mapper.to_lowercase().contains(&q)
                })
                .map(|(i, _)| i)
                .collect();
        }
    }

    fn export_pack(&mut self) {
        let selected: Vec<usize> = self.pack_selected.iter()
            .enumerate().filter(|(_, &s)| s).map(|(i, _)| i).collect();
        if selected.is_empty() { return; }

        self.output_lines.push(format!("  > Exporting {} song{} from pack...",
            selected.len(), if selected.len() == 1 { "" } else { "s" }));
        let pack_name = self.pack_path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "pack".into());
        let out_dir = self.resolve_output_dir();
        let export_base = std::path::PathBuf::from(&out_dir);

        let use_osz = self.settings.export_format_osz;
        let tmp_dir = if use_osz {
            Some(std::env::temp_dir().join(format!("henkan_pack_{}", std::time::UNIX_EPOCH.elapsed().unwrap_or_default().as_nanos())))
        } else {
            None
        };
        if let Some(ref td) = tmp_dir {
            if let Err(e) = std::fs::create_dir_all(td) {
                self.output_lines.push(format!("  \u{2717} Temp dir error: {}", e));
                return;
            }
        }

        let mut total_sections = 0usize;
        for &idx in &selected {
            let m = &self.pack_maps[idx];
            let map_files: Vec<std::path::PathBuf> = std::fs::read_dir(&m.path)
                .into_iter().flatten().flatten()
                .filter(|e| e.path().is_file())
                .map(|e| e.path())
                .filter(|p| {
                    let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                    ext == "sm" || ext == "osu"
                })
                .collect();

            if map_files.is_empty() {
                self.output_lines.push(format!("  \u{2717} No beatmap files in: {}", m.name));
                continue;
            }

            for mf in &map_files {
                let ext = mf.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
                if ext != "sm" {
                    // Non-SM files: single-song folder export (unchanged)
                    let direction = if ext == "osu" || ext == "osz" { "osu-to-etterna" } else { "etterna-to-osu" };
                    match henkan_lib::cli_parse_file(&mf.to_string_lossy(), direction) {
                        Ok(mut bm) => {
                            let mut config = henkan_lib::ExportConfig::default();
                            let title = if !m.title_ov.is_empty() { &m.title_ov } else { &m.name };
                            let artist = if !m.artist_ov.is_empty() { &m.artist_ov } else { &m.artist };
                            let creator = if !m.mapper_ov.is_empty() { &m.mapper_ov } else { &m.mapper };
                            let diff = if !m.diff_ov.is_empty() { m.diff_ov.clone() } else { bm.difficulty_name.clone() };

                            config.title = title.clone();
                            config.artist = artist.clone();
                            config.creator = creator.clone();
                            config.difficulty_name = diff.clone();
                            config.audio_filename = bm.audio_filename.clone();
                            config.background_filename = bm.background_filename.clone();
                            config.banner_filename = bm.banner_filename.clone();
                            config.cdtitle_filename = bm.cdtitle_filename.clone();
                            config.preview_time = bm.preview_time;
                            config.source = bm.source.clone();
                            config.tags = bm.tags.clone();
                            config.hp_drain = m.hp_drain.unwrap_or(8.0);
                            config.overall_difficulty = m.overall_difficulty.unwrap_or(8.0);
                            config.conversion_rate = m.conversion_rate.unwrap_or(1.0);
                            config.preserve_pitch = m.preserve_pitch.unwrap_or(true);
                            config.fetch_avatar = self.settings.fetch_avatar;

                            let content = match henkan_lib::cli_convert_beatmap(&mut bm, &config) {
                                Ok(c) => c,
                                Err(e) => {
                                    self.output_lines.push(format!("  \u{2717} Convert error ({}): {}", m.name, e));
                                    continue;
                                }
                            };

                            let song_name = format!("{} - {}", artist, title);
                            let safe_sub = henkan_lib::sanitize_filename(&song_name, 60);
                            let diff_safe = henkan_lib::sanitize_filename(&diff, 40);
                            let export_dir = if diff_safe.is_empty() {
                                export_base.join(&safe_sub)
                            } else {
                                export_base.join(&safe_sub).join(&diff_safe)
                            };
                            if let Err(e) = std::fs::create_dir_all(&export_dir) {
                                self.output_lines.push(format!("  \u{2717} Dir error: {}", e));
                                continue;
                            }
                            let fn_folder = if diff_safe.is_empty() {
                                None
                            } else {
                                Some(format!("{} [{}]", title, diff_safe))
                            };

                            match henkan_lib::cli_export_beatmap_named(&bm, &config, &content, &export_dir.to_string_lossy(), fn_folder.as_deref(), true) {
                                Ok(_) => {
                                    let to_label = if direction == "osu-to-etterna" { "StepMania" } else { "osu!" };
                                    self.results.push(ExportResult {
                                        title: config.title.clone(),
                                        mapper: config.creator.clone(),
                                        difficulty: config.difficulty_name.clone(),
                                        from: if direction == "osu-to-etterna" { "osu!" } else { "StepMania" }.into(),
                                        to: to_label.into(),
                                    });
                                    self.output_lines.push(format!("  \u{2713} Exported: {}", config.title));
                                }
                                Err(e) => {
                                    self.output_lines.push(format!("  \u{2717} Export error ({}): {}", m.name, e));
                                }
                            }
                        }
                        Err(e) => {
                            self.output_lines.push(format!("  \u{2717} Parse error ({}): {}", m.name, e));
                        }
                    }
                    continue;
                }

                // ── .sm file: parse once per file ──
                let content = match std::fs::read_to_string(mf) {
                    Ok(c) => c,
                    Err(e) => {
                        self.output_lines.push(format!("  \u{2717} Read error ({}): {}", m.name, e));
                        continue;
                    }
                };

                let beatmaps = match henkan_lib::parsers::etterna::parse_sm_all(&content) {
                    Ok(b) => b,
                    Err(e) => {
                        self.output_lines.push(format!("  \u{2717} Parse error ({}): {}", m.name, e));
                        continue;
                    }
                };

                if beatmaps.is_empty() {
                    self.output_lines.push(format!("  \u{2717} No sections in: {}", m.name));
                    continue;
                }

                let source_dir = mf.parent()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_default();
                let audio_filename = henkan_lib::extract_sm_header_field(&content, "MUSIC")
                    .unwrap_or_default();
                let mut bg_filename = henkan_lib::extract_sm_header_field(&content, "BACKGROUND")
                    .or_else(|| henkan_lib::extract_sm_header_field(&content, "BANNER"));
                if bg_filename.as_ref().map_or(true, |s| s.is_empty()) {
                    if let Some(found) = henkan_lib::scan_source_dir_for_bg(&source_dir) {
                        if let Some(name) = found.file_name().and_then(|n| n.to_str()) {
                            bg_filename = Some(name.to_string());
                        }
                    }
                }

                let title = if !m.title_ov.is_empty() { &m.title_ov } else { &m.name };
                let artist = if !m.artist_ov.is_empty() { &m.artist_ov } else { &m.artist };
                let creator = if !m.mapper_ov.is_empty() { &m.mapper_ov } else { &m.mapper };

                let safe = henkan_lib::sanitize_filename(&format!("{} - {}", artist, title), 80);

                let mut any_ok = false;

                    // ── Use pre-parsed beatmaps ──
                    let rate = m.conversion_rate.unwrap_or(1.0);
                    let pitch = m.preserve_pitch.unwrap_or(true);
                    for bm in &beatmaps {
                        let mut bm = bm.clone();
                        bm.title = title.clone();
                        bm.artist = artist.clone();
                        if !creator.is_empty() { bm.creator = creator.clone(); }
                        bm.source = title.clone();
                        bm.tags = String::new();

                        let diff_name = if !m.diff_ov.is_empty() {
                            m.diff_ov.clone()
                        } else {
                            bm.difficulty_name.clone()
                        };
                        bm.difficulty_name = diff_name.clone();

                        henkan_lib::scale_timing_for_rate(&mut bm, rate);
                        if let Some(label) = henkan_lib::rate_label(rate) {
                            bm.difficulty_name.push(' ');
                            bm.difficulty_name.push_str(&label);
                        }

                        let mut bmc = henkan_lib::ExportConfig::default();
                        bmc.title = bm.title.clone();
                        bmc.artist = bm.artist.clone();
                        bmc.creator = bm.creator.clone();
                        bmc.source = bm.source.clone();
                        bmc.tags = bm.tags.clone();
                        bmc.difficulty_name = bm.difficulty_name.clone();
                        bmc.conversion_rate = rate;
                        bmc.preserve_pitch = pitch;
                        bmc.audio_filename = bm.audio_filename.clone();
                        bmc.background_filename = bm.background_filename.clone();
                        bmc.banner_filename = bm.banner_filename.clone();
                        bmc.cdtitle_filename = bm.cdtitle_filename.clone();
                        bmc.fetch_avatar = self.settings.fetch_avatar;

                    let converted = match henkan_lib::converters::etterna_to_osu::convert(&bm, &bmc) {
                        Ok(c) => c,
                        Err(e) => {
                            self.output_lines.push(format!("  \u{2717} Convert error ({}): {}", m.name, e));
                            continue;
                        }
                    };

                    let diff_safe = henkan_lib::sanitize_filename(&diff_name, 60);
                    let entry_name = if diff_safe.is_empty() {
                        format!("{}.osu", safe)
                    } else {
                        format!("{} [{}].osu", safe, diff_safe)
                    };

                    if let Some(ref td) = tmp_dir {
                        if let Err(e) = std::fs::write(td.join(&entry_name), &converted) {
                            self.output_lines.push(format!("  \u{2717} Write error ({}): {}", m.name, e));
                            continue;
                        }
                    } else {
                        // Folder mode: write to export_dir/song_name/diff_name/
                        let sub = format!("{} - {}", artist, title);
                        let safe_sub = henkan_lib::sanitize_filename(&sub, 60);
                        let diff_dir = export_base.join(&safe_sub).join(&diff_safe);
                        if let Err(e) = std::fs::create_dir_all(&diff_dir) {
                            self.output_lines.push(format!("  \u{2717} Dir error: {}", e));
                            continue;
                        }
                        if let Err(e) = std::fs::write(diff_dir.join(&entry_name), &converted) {
                            self.output_lines.push(format!("  \u{2717} Write error ({}): {}", m.name, e));
                            continue;
                        }
                        // Copy audio and background into per-diff folder
                        if !audio_filename.is_empty() {
                            let needs_rate = (rate - 1.0).abs() > f64::EPSILON;
                            if needs_rate {
                                let src = henkan_lib::resolve_audio_path(&source_dir, &audio_filename);
                                let dest = diff_dir.join(&audio_filename);
                                if let Some(ff) = henkan_lib::find_ffmpeg() {
                                    if let Err(e) = henkan_lib::speed_up_audio_ffmpeg(&ff, &src, &dest, rate, pitch) {
                                        self.output_lines.push(format!("  \u{2717} Audio error ({}): {}", m.name, e));
                                    }
                                } else if let Err(e) = henkan_lib::speed_up_audio_symphonia(&src.to_string_lossy(), &dest.to_string_lossy(), rate) {
                                    self.output_lines.push(format!("  \u{2717} Audio error ({}): {}", m.name, e));
                                }
                            } else {
                                let _ = henkan_lib::copy_media(&source_dir, &audio_filename, &diff_dir, &audio_filename);
                            }
                        }
                        if let Some(ref bg) = bg_filename {
                            if !bg.is_empty() {
                                let _ = henkan_lib::copy_media(&source_dir, bg, &diff_dir, bg);
                            }
                        }
                    }
                    any_ok = true;
                }

                if !any_ok {
                    continue;
                }

                total_sections += beatmaps.len();
                self.output_lines.push(format!("  \u{2713} Added: {} ({} diff{})", m.name, beatmaps.len(), if beatmaps.len() == 1 { "" } else { "s" }));
            }
        }

        if use_osz {
            // Find pack banner
            let banner_path: Option<String> = (|| -> Option<String> {
                let entries = std::fs::read_dir(&self.pack_path).ok()?;
                for entry in entries.flatten() {
                    let path = entry.path();
                    if !path.is_file() { continue; }
                    let ext = path.extension()?.to_str()?.to_lowercase();
                    if matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp") {
                        return Some(path.to_string_lossy().to_string());
                    }
                }
                None
            })();

            let banner_filename = if let Some(ref pb) = banner_path {
                let bf = std::path::Path::new(pb)
                    .file_name().and_then(|n| n.to_str()).unwrap_or("banner.png").to_string();
                if let Some(ref td) = tmp_dir {
                    let _ = std::fs::copy(pb, td.join(&bf));
                }
                bf
            } else {
                String::new()
            };

            // Create dummy diff entry for the pack
            if let Some(ref td) = tmp_dir {
                let mut dummy = String::new();
                dummy.push_str("osu file format v14\n\n");
                dummy.push_str("[General]\n");
                dummy.push_str("AudioFilename: dummy.mp3\n");
                dummy.push_str("AudioLeadIn: 0\n");
                dummy.push_str("Mode: 3\n");
                dummy.push_str("PreviewTime: 0\n\n");
                dummy.push_str("[Metadata]\n");
                dummy.push_str(&format!("Title:{}\n", pack_name));
                dummy.push_str(&format!("TitleUnicode:{}\n", pack_name));
                dummy.push_str("Creator:Etterna Pack\n");
                dummy.push_str("Version:Etterna pack\n");
                dummy.push_str(&format!("Source:etterna-pack-{}\n", pack_name));
                dummy.push_str("Tags:\n\n");
                dummy.push_str("[Difficulty]\n");
                dummy.push_str("HPDrainRate:5\n");
                dummy.push_str("CircleSize:4\n");
                dummy.push_str("OverallDifficulty:5\n");
                dummy.push_str("ApproachRate:5\n");
                dummy.push_str("SliderMultiplier:1.4\n");
                dummy.push_str("SliderTickRate:1\n\n");
                dummy.push_str("[Events]\n");
                dummy.push_str("//Background and Video events\n");
                if !banner_filename.is_empty() {
                    dummy.push_str(&format!("0,0,\"{}\",0,0\n", banner_filename));
                }
                dummy.push_str("//Break Periods\n\n");
                dummy.push_str("[TimingPoints]\n");
                dummy.push_str("0,500,4,0,0,100,1,0\n\n");
                dummy.push_str("[HitObjects]\n");
                let _ = std::fs::write(td.join(format!("{}.osu", henkan_lib::sanitize_filename(&pack_name, 60))), &dummy);
            }

            // Zip
            {
                use std::io::Write;
                let osz_name = format!("{}.osz", henkan_lib::sanitize_filename(&pack_name, 80));
                let osz_path = export_base.join(&osz_name);
                let zip_result = (|| -> Result<String, String> {
                    let file = std::fs::File::create(&osz_path)
                        .map_err(|e| format!("Failed to create .osz: {}", e))?;
                    let mut zip_w = zip::ZipWriter::new(file);
                    let opts: zip::write::FileOptions<'_, ()> = zip::write::FileOptions::default()
                        .compression_method(zip::CompressionMethod::Deflated);

                    fn walk_dir(
                        zip_w: &mut zip::ZipWriter<std::fs::File>,
                        dir: &std::path::Path,
                        base: &std::path::Path,
                        opts: &zip::write::FileOptions<'_, ()>,
                    ) -> Result<(), String> {
                        if !dir.is_dir() { return Ok(()); }
                        let entries = std::fs::read_dir(dir).map_err(|e| format!("Failed to read dir: {}", e))?;
                        for entry in entries.flatten() {
                            let path = entry.path();
                            let relative = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().to_string();
                            if path.is_dir() {
                                walk_dir(zip_w, &path, base, opts)?;
                            } else {
                                let bytes = std::fs::read(&path)
                                    .map_err(|e| format!("Failed to read {}: {}", relative, e))?;
                                zip_w.start_file(relative.replace('\\', "/"), *opts)
                                    .map_err(|e| format!("Zip error: {}", e))?;
                                zip_w.write_all(&bytes)
                                    .map_err(|e| format!("Zip write error: {}", e))?;
                            }
                        }
                        Ok(())
                    }

                    if let Some(ref td) = tmp_dir {
                        walk_dir(&mut zip_w, td, td, &opts)?;
                    }
                    zip_w.finish().map_err(|e| format!("Zip finalize error: {}", e))?;
                    Ok(osz_path.to_string_lossy().to_string())
                })();

                match zip_result {
                    Ok(_) => {
                        self.results.push(ExportResult {
                            title: pack_name.clone(),
                            mapper: "Etterna Pack".into(),
                            difficulty: format!("{} total diffs", total_sections),
                            from: "StepMania".into(),
                            to: "osu!".into(),
                        });
                        self.output_lines.push(format!("  \u{2713} Exported: {}.osz ({} songs)", pack_name, selected.len()));
                    }
                    Err(e) => {
                        self.output_lines.push(format!("  \u{2717} Zip error: {}", e));
                    }
                }
            }

            if let Some(ref td) = tmp_dir {
                let _ = std::fs::remove_dir_all(td);
            }
        } else {
            self.results.push(ExportResult {
                title: pack_name.clone(),
                mapper: "Etterna Pack".into(),
                difficulty: format!("{} total diffs", total_sections),
                from: "StepMania".into(),
                to: "osu!".into(),
            });
            self.output_lines.push(format!("  \u{2713} Exported {} songs to folders", selected.len()));
        }

        self.last_export_dir = export_base;
        self.status_msg = format!("Pack exported: {}", pack_name);
        self.output_scroll = self.output_lines.len().saturating_sub(1);
        self.go_to_results();
    }

}

// ── Help text drawing inside TUI ────────────────────────────────
fn desc_for(cmd: &str) -> &'static str {
    let trimmed = cmd.trim().strip_prefix("set ").unwrap_or(cmd.trim());
    for (name, desc) in COMMAND_DESCS {
        if *name == trimmed { return desc; }
    }
    for key in SETTING_KEYS {
        if *key == trimmed { return "Configuration setting"; }
    }
    if trimmed == "set" {
        return "Modify a configuration value (set <key> <value>)";
    }
    ""
}


fn parse_onoff(s: &str) -> Result<bool, String> {
    match s.to_lowercase().as_str() {
        "on" | "yes" | "true" | "1" => Ok(true),
        "off" | "no" | "false" | "0" => Ok(false),
        _ => Err(format!("Expected on/off, got '{}'", s)),
    }
}

fn resolve_path(file: &str, cwd: &PathBuf) -> String {
    let p = PathBuf::from(file);
    if p.is_absolute() { file.to_string() } else { cwd.join(file).to_string_lossy().to_string() }
}

fn sanitize_path(s: &str) -> String {
    s.chars().filter(|&c| c != '\x7f' && (c >= ' ' || c == '\t')).collect::<String>().trim().to_string()
}

fn deescape_path(s: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        // On Windows, backslash is a path separator, not an escape character
        s.to_string()
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut out = String::with_capacity(s.len());
        let mut chars = s.chars();
        while let Some(c) = chars.next() {
            if c == '\\' {
                if let Some(next) = chars.next() { out.push(next); }
            } else {
                out.push(c);
            }
        }
        out
    }
}

// ── Non-interactive mode ────────────────────────────────────

fn non_interactive(command: &str, args: &[String]) -> Result<(), String> {
    let file = args.iter()
        .position(|a| !a.starts_with("--") && a != command && *a != args[0])
        .and_then(|i| args.get(i))
        .ok_or_else(|| format!("Usage: henkan-cli {} <file> [--output <dir>] [--dir <osu|sm>] [settings...]", command))?;
    let out_dir = parse_flag(args, "--output").unwrap_or_else(|| ".".to_string());
    let dir_flag = parse_flag(args, "--dir");
    let direction = match dir_flag.as_deref() {
        Some("osu") => "osu-to-etterna",
        Some("sm") => "etterna-to-osu",
        Some(other) => return Err(format!("Invalid direction '{}'. Use 'osu' or 'sm'.", other)),
        None => {
            let ext = file.rsplit('.').next().unwrap_or("").to_lowercase();
            match ext.as_str() {
                "osu" | "osz" => "osu-to-etterna",
                "sm" => "etterna-to-osu",
                _ => return Err("Could not detect file type. Use --dir to specify.".into()),
            }
        }
    };

    // Parse settings from CLI flags
    let cli_settings = CliSettings {
        fetch_avatar: parse_bool_flag(args, "--avatar").unwrap_or(true),
        export_format_osz: !parse_bool_flag(args, "--format").map(|v| v == false).unwrap_or(true),
        output_dir: parse_flag(args, "--output").unwrap_or_else(|| "./converts".into()),
    };
    let has_any_setting_flag = args.iter().any(|a| matches!(a.as_str(), "--avatar" | "--format" | "--output"));

    // For convert/export: if no settings flags and not --quick, show interactive TUI
    let final_settings = if (command == "convert" || command == "export") && !has_any_setting_flag && !args.contains(&"--quick".to_string()) {
        match run_interactive_convert(file, direction) {
            Ok(Some(s)) => s,
            Ok(None) => return Ok(()),
            Err(e) => return Err(format!("Interactive settings error: {}", e)),
        }
    } else {
        cli_settings
    };

    match command {
        "parse" => {
            let bm = henkan_lib::cli_parse_file(file, direction)?;
            println!("Title:         {}", bm.title);
            println!("Artist:        {}", bm.artist);
            println!("Creator:       {}", bm.creator);
            println!("Difficulty:    {}", bm.difficulty_name);
            println!("Source:        {:?}", bm.source_format);
            println!("Keys:          {}", bm.keys);
            println!("Notes:         {} (holds: {})", bm.notes.len(), bm.notes.iter().filter(|n| n.hold).count());
            println!("Timing pts:    {}", bm.timing_points.len());
            println!("Duration:      {:.1}s", bm.duration_ms / 1000.0);
            println!("Preview:       {:.1}s", bm.preview_time / 1000.0);
            println!("Audio:         {}", bm.audio_filename);
            println!("Difficulties:  {}", bm.available_difficulties.len());
            for d in &bm.available_difficulties {
                println!("  \u{2192} {} ({}K, {} notes)", d.name, d.keys, d.note_count);
            }
        }
        "convert" => {
            let mut bm = henkan_lib::cli_parse_file(file, direction)?;
            let mut config = henkan_lib::ExportConfig::default();
            config.title = bm.title.clone(); config.artist = bm.artist.clone(); config.creator = bm.creator.clone();
            config.difficulty_name = bm.difficulty_name.clone(); config.source = bm.source.clone(); config.tags = bm.tags.clone();
            config.audio_filename = bm.audio_filename.clone(); config.background_filename = bm.background_filename.clone();
            config.banner_filename = bm.banner_filename.clone(); config.cdtitle_filename = bm.cdtitle_filename.clone();
            config.preview_time = bm.preview_time;
            config.hp_drain = 8.0;
            config.overall_difficulty = 8.0;
            config.conversion_rate = 1.0;
            config.preserve_pitch = true;
            config.fetch_avatar = final_settings.fetch_avatar;
            println!("{}", henkan_lib::cli_convert_beatmap(&mut bm, &config)?);
        }
        "export" => {
            let mut bm = henkan_lib::cli_parse_file(file, direction)?;
            let mut config = henkan_lib::ExportConfig::default();
            config.title = bm.title.clone(); config.artist = bm.artist.clone(); config.creator = bm.creator.clone();
            config.difficulty_name = bm.difficulty_name.clone(); config.source = bm.source.clone(); config.tags = bm.tags.clone();
            config.audio_filename = bm.audio_filename.clone(); config.background_filename = bm.background_filename.clone();
            config.banner_filename = bm.banner_filename.clone(); config.cdtitle_filename = bm.cdtitle_filename.clone();
            config.preview_time = bm.preview_time;
            config.hp_drain = 8.0;
            config.overall_difficulty = 8.0;
            config.conversion_rate = 1.0;
            config.preserve_pitch = true;
            config.fetch_avatar = final_settings.fetch_avatar;
            let content = henkan_lib::cli_convert_beatmap(&mut bm, &config)?;
            println!("Exported to: {}", henkan_lib::cli_export_beatmap(&bm, &config, &content, &out_dir)?);
        }
        _ => unreachable!(),
    }
    Ok(())
}

fn parse_flag(args: &[String], flag: &str) -> Option<String> {
    args.windows(2).find_map(|w| { if w[0] == flag { Some(w[1].clone()) } else { None } })
}

fn parse_bool_flag(args: &[String], flag: &str) -> Option<bool> {
    parse_flag(args, flag).map(|s| !matches!(s.to_lowercase().as_str(), "off" | "false" | "no" | "0"))
}

// ── Interactive settings TUI for `convert <file>` without flags ──

fn run_interactive_convert(file: &str, _direction: &str) -> io::Result<Option<CliSettings>> {
    use crossterm::terminal::{EnterAlternateScreen, LeaveAlternateScreen};

    enable_raw_mode()?;
    let mut stdout = io::stdout();
    stdout.execute(EnterAlternateScreen)?;
    stdout.execute(Hide)?;
    stdout.execute(EnableMouseCapture)?;
    let mut terminal = Terminal::new(CrosstermBackend::new(io::stdout()))?;

    let mut settings = CliSettings::load();
    let mut selection = 0usize;
    let settings_count = 3; // avatar, format, dir
    let max_idx = settings_count; // convert button is at this index
    let mut confirmed = false;

    loop {
        let _ = terminal.draw(|f| {
            let area = f.area();
            f.render_widget(Paragraph::new(" ").style(Style::default().bg(Color::Rgb(10, 10, 15))), area);
            draw_mini_settings(f, area, &settings, selection, file);
        });

        if event::poll(Duration::from_millis(50))? {
            match event::read()? {
                Event::Key(key) => {
                    if key.kind != KeyEventKind::Press { continue; }

                    match key.code {
                        KeyCode::Esc => break,
                        KeyCode::Up => { selection = selection.saturating_sub(1); }
                        KeyCode::Down => { if selection < max_idx { selection += 1; } }
                        KeyCode::Enter | KeyCode::Right | KeyCode::Left => {
                            if selection == max_idx {
                                confirmed = true; break;
                            } else if selection == 0 {
                                settings.fetch_avatar = !settings.fetch_avatar;
                            } else if selection == 1 {
                                settings.export_format_osz = !settings.export_format_osz;
                            } else if selection == 2 {
                                let _ = disable_raw_mode();
                                let _ = stdout.execute(DisableMouseCapture);
                                let result = App::folder_dialog_inner();
                                let _ = enable_raw_mode();
                                let _ = stdout.execute(Hide);
                                let _ = stdout.execute(EnableMouseCapture);
                                if let Ok(Some(dir)) = result {
                                    settings.output_dir = dir;
                                }
                            }
                        }
                        _ => {}
                    }
                }
                Event::Resize(_, _) => {}
                _ => {}
            }
        }
    }

    stdout.execute(LeaveAlternateScreen)?;
    stdout.execute(Show)?;
    stdout.execute(DisableMouseCapture)?;
    disable_raw_mode()?;

    if confirmed { settings.save(); Ok(Some(settings)) } else { Ok(None) }
}

fn draw_mini_settings(f: &mut Frame, area: Rect, settings: &CliSettings, selection: usize, file_path: &str) {
    let box_w = 64.min(area.width.saturating_sub(8));
    let box_h = 12.min(area.height.saturating_sub(4));
    let x = (area.width - box_w) / 2;
    let y = (area.height - box_h) / 2;
    let box_area = Rect::new(x, y, box_w, box_h);

    let outer = Block::default()
        .title(" Settings ")
        .title_alignment(Alignment::Center)
        .borders(Borders::ALL)
        .border_set(symbols::border::ROUNDED)
        .border_style(Style::default().fg(ACCENT))
        .bg(SURFACE);
    f.render_widget(&outer, box_area);
    let inner = outer.inner(box_area);

    let display = file_path.chars().take(box_w as usize - 10).collect::<String>();
    f.render_widget(
        Paragraph::new(Span::styled(display, Style::default().fg(DIM).bg(SURFACE)))
            .style(Style::default().bg(SURFACE)),
        Rect::new(inner.x + 1, inner.y, inner.width.saturating_sub(2), 1),
    );

    let items: Vec<(&str, &str)> = vec![
        ("Fetch osu avatars", if settings.fetch_avatar { "on" } else { "off" }),
        ("Format", if settings.export_format_osz { "OSZ" } else { "Folder" }),
        ("Output", &settings.output_dir),
    ];
    let max_idx = items.len(); // 3, convert button is at this index

    let mut lines: Vec<Line> = Vec::new();
    lines.push(Line::from(Span::styled("", Style::default().bg(SURFACE))));

        for (i, (name, value)) in items.iter().enumerate() {
            let selected = i == selection;
            let arrow = if selected { "\u{276F}" } else { " " };
            let bg = if selected { Color::Rgb(22, 22, 36) } else { SURFACE };
            let item_fg = if selected { ACCENT } else { TEXT };
            let value_disp = if value.len() > 30 { format!("{}...", &value[..28]) } else { value.to_string() };
            let name_w = 20usize;
            let pad = " ".repeat(name_w.saturating_sub(name.len()));
            let main = format!(" {} {}{}  {}", arrow, name, pad, value_disp);
            if i == 0 {
                lines.push(Line::from(vec![
                    Span::styled(main, Style::default().fg(item_fg).bold().bg(bg)),
                    Span::styled("  slows down conversion", Style::default().fg(DIM).bg(bg)),
                ]));
            } else {
                lines.push(Line::from(Span::styled(main, Style::default().fg(item_fg).bold().bg(bg))));
            }
        }

    lines.push(Line::from(Span::styled("", Style::default().bg(SURFACE))));
    let convert_sel = selection == max_idx;
    let convert_fg = if convert_sel { BG } else { DIM };
    let convert_bg = if convert_sel { ACCENT } else { SURFACE };
    lines.push(Line::from(vec![
        Span::styled(
            format!("{} Convert{}", if convert_sel { "\u{276F}" } else { " " }, if convert_sel { " \u{23CE}" } else { "" }),
            Style::default().fg(convert_fg).bold().bg(convert_bg),
        ),
    ]));

    f.render_widget(
        Paragraph::new(lines).style(Style::default().bg(SURFACE)),
        Rect::new(inner.x, inner.y, inner.width, inner.height),
    );

    let hint = "  \u{2191}\u{2193} select  Enter toggle  Esc back  ";
    f.render_widget(
        Paragraph::new(Span::styled(hint, Style::default().fg(DIM).bg(SURFACE)))
            .style(Style::default().bg(SURFACE)).alignment(Alignment::Center),
        Rect::new(box_area.x, box_area.y + box_area.height - 1, box_area.width, 1),
    );
}

fn splash_stdout() {
    for line in LOGO { println!("{}", line); }
    println!(); println!("    osu!mania \u{2194} StepMania Converter");
}

fn help_stdout() {
    println!(); println!("  Commands:");
    println!("    parse <file>           Parse & display metadata");
    println!("    convert <file>         Convert & print output");
    println!("    export <file>          Convert & save to folder");
    println!(); println!("  Quick mode flags (omit for interactive settings):");
    println!("    --avatar <on|off>      Fetch osu! avatar (default on)");
    println!("    --format <osz|folder>  Export format (default osz)");
    println!("    --quick                Use defaults, skip interactive menu");
    println!(); println!("  Other flags:");
    println!("    --dir <osu|sm>         Conversion direction (default: auto-detect)");
    println!("    --output <dir>         Output directory (default: current dir)");
    println!(); println!("  Examples:");
    println!("    henkan-cli convert song.osz           Show interactive settings, then convert");
    println!("    henkan-cli convert song.osz --quick   Convert with default settings");
    println!("    henkan-cli export song.osz --avatar off --format folder");
    println!(); println!("  Run without args for interactive TUI mode.");
}
