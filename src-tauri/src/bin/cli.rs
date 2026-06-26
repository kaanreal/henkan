use std::cell::Cell;
use std::env;
use std::io::{self, Write};
use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, Instant};

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

fn main() -> io::Result<()> {
    let args: Vec<String> = env::args().collect();
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
const BORDER: Color = Color::Rgb(60, 60, 80);
const TEXT: Color = Color::Rgb(200, 200, 210);
const DIM: Color = Color::Rgb(100, 100, 120);
const ACCENT: Color = Color::Rgb(80, 140, 255);
const GREEN: Color = Color::Rgb(80, 200, 80);
const RED: Color = Color::Rgb(220, 80, 80);

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
    keys: u32,
    notes: usize,
    from: String,
    to: String,
}

#[derive(PartialEq)]
enum Screen {
    Drop,
    Results,
}

struct Star {
    x: u16, y: i32, speed: u16, brightness: u8, size: u8,
}

#[derive(Debug, Clone)]
struct CliSettings {
    global_timing_ms: f64,
    hp_drain: f64,
    overall_difficulty: f64,
    approach_rate: f64,
    circle_size: f64,
    conversion_rate: f64,
    preserve_pitch: bool,
    copy_audio: bool,
    copy_background: bool,
    copy_cdtitle: bool,
}

impl Default for CliSettings {
    fn default() -> Self {
        Self {
            global_timing_ms: 50.0,
            hp_drain: 8.0,
            overall_difficulty: 8.0,
            approach_rate: 0.0,
            circle_size: 0.0,
            conversion_rate: 1.0,
            preserve_pitch: true,
            copy_audio: true,
            copy_background: true,
            copy_cdtitle: true,
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
    drop_btn_area: Cell<Option<Rect>>,
    results_btn_area: Cell<Option<Rect>>,
    cmd_input: String,
    completions: Vec<String>,
    completion_idx: usize,
    comp_list_area: Cell<Option<Rect>>,
    output_lines: Vec<String>,
    output_scroll: usize,
    settings: CliSettings,
}

const COMMANDS: &[&str] = &[
    "select", "results", "open", "clear", "help", "exit", "quit", "settings", "reset",
];

const SETTING_KEYS: &[&str] = &[
    "timing", "hp", "od", "ar", "cs", "rate", "pitch", "audio", "bg", "cdtitle",
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
            drop_btn_area: Cell::new(None),
            results_btn_area: Cell::new(None),
            cmd_input: String::new(),
            completions: Vec::new(),
            completion_idx: 0,
            comp_list_area: Cell::new(None),
            output_lines: Vec::new(),
            output_scroll: 0,
            settings: CliSettings::default(),
        }
    }

    fn run(&mut self, terminal: &mut Terminal<CrosstermBackend<io::Stdout>>) -> io::Result<()> {
        if let Ok(s) = terminal.size() { self.term_w = s.width; self.term_h = s.height; }
        self.spawn_stars();
        loop {
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
        if let Some(after_set) = trimmed.strip_prefix("set ") {
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
        } else {
            self.completions = COMMANDS.iter()
                .filter(|c| c.starts_with(trimmed))
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
            self.compute_completions();
        }
    }

    fn pick_files_via_dialog(&mut self) {
        self.selecting = true;
        let _ = io::stdout().flush();
        let _ = disable_raw_mode();

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
            .output();

        let _ = enable_raw_mode();
        let _ = io::stdout().execute(Hide);
        self.selecting = false;

        if let Ok(out) = output {
            if out.status.success() {
                let text = String::from_utf8_lossy(&out.stdout);
                for line in text.lines() {
                    let trimmed = line.trim();
                    if !trimmed.is_empty() { self.process_file(trimmed); }
                }
                self.results_scroll = 0;
            }
        }
    }

    fn handle_drop_key(&mut self, key: crossterm::event::KeyEvent) {
        match key.code {
            KeyCode::Enter => self.execute_command(),
            KeyCode::Tab => self.tab_complete(),
            KeyCode::F(1) => {
                if !self.results.is_empty() { self.go_to_results(); }
            }
            KeyCode::Esc => std::process::exit(0),
            KeyCode::Char(ch) => {
                self.cmd_input.push(ch);
                self.compute_completions();
            }
            KeyCode::Backspace => {
                self.cmd_input.pop();
                self.compute_completions();
            }
            KeyCode::Up => {
                if self.output_scroll > 0 { self.output_scroll -= 1; }
            }
            KeyCode::Down => {
                let max = self.output_lines.len().saturating_sub(1);
                if self.output_scroll < max { self.output_scroll += 1; }
            }
            _ => {}
        }
    }

    fn execute_command(&mut self) {
        let trimmed = self.cmd_input.trim().to_string();
        self.cmd_input.clear();
        self.completions.clear();

        if trimmed.is_empty() {
            self.pick_files_via_dialog();
            return;
        }

        let (cmd, rest) = trimmed.split_once(' ').unwrap_or((&trimmed, ""));
        let rest = rest.trim();

        match cmd {
            "select" => self.pick_files_via_dialog(),
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
            "settings" => self.show_settings(),
            "reset" => {
                self.settings = CliSettings::default();
                self.output_lines.push("  \u{2713} Settings reset to defaults".into());
                self.output_scroll = self.output_lines.len().saturating_sub(1);
            }
            "set" => self.handle_set(rest),
            "help" => self.show_help(),
            "exit" | "quit" => std::process::exit(0),
            _ => self.process_file(&trimmed),
        }
    }

    fn show_settings(&mut self) {
        let s = &self.settings;
        self.output_lines.push("\u{2500}\u{2500} Settings \u{2500}\u{2500}".into());
        self.output_lines.push(format!("  timing   {} ms", s.global_timing_ms));
        self.output_lines.push(format!("  hp       {}", s.hp_drain));
        self.output_lines.push(format!("  od       {}", s.overall_difficulty));
        self.output_lines.push(format!("  ar       {}", s.approach_rate));
        self.output_lines.push(format!("  cs       {}", s.circle_size));
        self.output_lines.push(format!("  rate     {}x", s.conversion_rate));
        self.output_lines.push(format!("  pitch    {}", onoff(s.preserve_pitch)));
        self.output_lines.push(format!("  audio    {}", onoff(s.copy_audio)));
        self.output_lines.push(format!("  bg       {}", onoff(s.copy_background)));
        self.output_lines.push(format!("  cdtitle  {}", onoff(s.copy_cdtitle)));
        self.output_lines.push("\u{2500}\u{2500} set <key> <value> to change \u{2500}\u{2500}".into());
        self.output_scroll = self.output_lines.len().saturating_sub(1);
    }

    fn handle_set(&mut self, args: &str) {
        let parts: Vec<&str> = args.split_whitespace().collect();
        if parts.len() < 2 {
            self.output_lines.push("  Usage: set <key> <value>".into());
            self.output_lines.push("  Keys: timing, hp, od, ar, cs, rate, pitch, audio, bg, cdtitle".into());
            self.output_scroll = self.output_lines.len().saturating_sub(1);
            return;
        }
        let key = parts[0];
        let val = parts[1];

        let result = match key {
            "timing" => parse_f64(val).map(|v| self.settings.global_timing_ms = v),
            "hp" => parse_f64(val).map(|v| self.settings.hp_drain = v),
            "od" => parse_f64(val).map(|v| self.settings.overall_difficulty = v),
            "ar" => parse_f64(val).map(|v| self.settings.approach_rate = v),
            "cs" => parse_f64(val).map(|v| self.settings.circle_size = v),
            "rate" => parse_f64(val).map(|v| self.settings.conversion_rate = v.max(0.1)),
            "pitch" => parse_onoff(val).map(|v| self.settings.preserve_pitch = v),
            "audio" => parse_onoff(val).map(|v| self.settings.copy_audio = v),
            "bg" => parse_onoff(val).map(|v| self.settings.copy_background = v),
            "cdtitle" => parse_onoff(val).map(|v| self.settings.copy_cdtitle = v),
            _ => Err(format!("Unknown key: {}", key)),
        };

        match result {
            Ok(_) => self.output_lines.push(format!("  \u{2713} {} = {}", key, val)),
            Err(e) => self.output_lines.push(format!("  \u{2717} {}", e)),
        }
        self.output_scroll = self.output_lines.len().saturating_sub(1);
    }

    fn show_help(&mut self) {
        self.output_lines.push("".into());
        self.output_lines.push("  \u{2500}\u{2500} Commands \u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}".into());
        self.output_lines.push("  select        Open file dialog".into());
        self.output_lines.push("  results       Switch to results screen".into());
        self.output_lines.push("  open          Open last export folder".into());
        self.output_lines.push("  clear         Clear output & results".into());
        self.output_lines.push("  settings      Show current settings".into());
        self.output_lines.push("  set <k> <v>   Change a setting".into());
        self.output_lines.push("  reset         Reset settings to defaults".into());
        self.output_lines.push("  help          Show this help".into());
        self.output_lines.push("  exit / quit   Exit the program".into());
        self.output_lines.push("".into());
        self.output_lines.push("  \u{2500}\u{2500} Setting keys \u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}".into());
        self.output_lines.push("  timing   Global timing offset (ms, default 50)".into());
        self.output_lines.push("  hp       HP drain (default 8)".into());
        self.output_lines.push("  od       Overall difficulty (default 8)".into());
        self.output_lines.push("  ar       Approach rate (default 0)".into());
        self.output_lines.push("  cs       Circle size (default 0)".into());
        self.output_lines.push("  rate     Conversion rate multiplier (default 1)".into());
        self.output_lines.push("  pitch    Preserve pitch on rate change (on/off)".into());
        self.output_lines.push("  audio    Copy audio file (on/off)".into());
        self.output_lines.push("  bg       Copy background image (on/off)".into());
        self.output_lines.push("  cdtitle  Copy cdtitle for SM output (on/off)".into());
        self.output_lines.push("".into());
        self.output_lines.push("  \u{2500}\u{2500} Tips \u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}\u{2500}".into());
        self.output_lines.push("  Type a file path directly to parse and convert it.".into());
        self.output_lines.push("  Press Enter with empty input to open the file dialog.".into());
        self.output_lines.push("  Arrow Up/Down scrolls the output history.".into());
        self.output_lines.push("".into());
        self.output_scroll = self.output_lines.len().saturating_sub(1);
    }

    fn tab_complete(&mut self) {
        if self.completions.is_empty() { return; }
        self.completion_idx = (self.completion_idx + 1) % self.completions.len();
        self.cmd_input.clone_from(&self.completions[self.completion_idx]);
    }

    fn go_to_drop(&mut self) {
        self.screen = Screen::Drop;
        self.results_scroll = 0;
        if !self.output_lines.is_empty() {
            self.output_scroll = self.output_lines.len().saturating_sub(1);
        }
    }

    fn go_to_results(&mut self) {
        self.screen = Screen::Results;
        self.drop_scroll = 0;
        self.results_scroll = 0;
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
            _ => {}
        }
    }

    fn handle_mouse(&mut self, ev: crossterm::event::MouseEvent) {
        if ev.kind != MouseEventKind::Up(MouseButton::Left) { return; }
        let pos = Position::new(ev.column, ev.row);
        match self.screen {
            Screen::Drop => {
                // Button click
                if let Some(area) = self.drop_btn_area.get() {
                    if area.contains(pos) { self.pick_files_via_dialog(); return; }
                }
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
            Screen::Results => {
                if let Some(area) = self.results_btn_area.get() {
                    if area.contains(pos) { self.open_folder(); }
                }
            }
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
        let clean = sanitize_path(&raw.trim_matches('"'));
        let path = resolve_path(&clean, &self.cwd);

        if !std::path::Path::new(&path).exists() {
            self.output_lines.push(format!("  \u{2717} File not found: {}", path));
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
        let mut bm = match henkan_lib::cli_parse_file(&path, direction) {
            Ok(b) => b,
            Err(e) => {
                self.output_lines.push(format!("  \u{2717} Parse error: {}", e));
                self.output_scroll = self.output_lines.len().saturating_sub(1);
                return;
            }
        };

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

        config.global_timing_ms = self.settings.global_timing_ms;
        config.hp_drain = self.settings.hp_drain;
        config.overall_difficulty = self.settings.overall_difficulty;
        config.approach_rate = self.settings.approach_rate;
        config.circle_size = self.settings.circle_size;
        config.conversion_rate = self.settings.conversion_rate;
        config.preserve_pitch = self.settings.preserve_pitch;

        if !self.settings.copy_audio { config.audio_filename = String::new(); }
        if !self.settings.copy_background { config.background_filename = None; }
        if !self.settings.copy_cdtitle { config.cdtitle_filename = None; }

        self.output_lines.push(format!("  > Converting {}...", bm.title));
        let content = match henkan_lib::cli_convert_beatmap(&mut bm, &config) {
            Ok(c) => c,
            Err(e) => {
                self.output_lines.push(format!("  \u{2717} Convert error: {}", e));
                self.output_scroll = self.output_lines.len().saturating_sub(1);
                return;
            }
        };

        let src_dir = std::path::Path::new(&path).parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| ".".to_string());
        self.last_export_dir = std::path::PathBuf::from(&src_dir);

        match henkan_lib::cli_export_beatmap(&bm, &config, &content, &src_dir) {
            Ok(export_path) => {
                if self.settings.copy_cdtitle && bm.source_format == henkan_lib::SourceFormat::OsuMania {
                    let has_file = config.cdtitle_filename.as_ref().is_some_and(|s| !s.is_empty());
                    if !has_file {
                        let _ = std::fs::write(
                            std::path::Path::new(&export_path).join("cdtitle.png"),
                            henkan_lib::DEFAULT_CDTITLE,
                        );
                    }
                }

                self.results.push(ExportResult {
                    title: bm.title.clone(),
                    keys: bm.keys,
                    notes: bm.notes.len(),
                    from: from_label.into(),
                    to: to_label.into(),
                });
                self.output_lines.push(format!("  \u{2713} Exported: {} ({} {}K)", bm.title, to_label, bm.keys));
                self.status_msg = format!("Exported: {}", bm.title);
                self.go_to_results();
            }
            Err(e) => {
                self.output_lines.push(format!("  \u{2717} Export error: {}", e));
            }
        }
        self.output_scroll = self.output_lines.len().saturating_sub(1);
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
        }
    }

    fn draw_drop(&self, f: &mut Frame, area: Rect) {
        if area.width < 10 || area.height < 18 { return; }
        let box_w = 56.min(area.width.saturating_sub(4));
        let box_h = (area.height - 4).min(23).max(18);
        let x = (area.width - box_w) / 2;
        let y = (area.height - box_h) / 2;
        let box_area = Rect::new(x, y, box_w, box_h);

        let outer = Block::default()
            .borders(Borders::ALL)
            .border_set(symbols::border::ROUNDED)
            .border_style(Style::default().fg(BORDER))
            .bg(SURFACE);
        f.render_widget(&outer, box_area);
        let inner = outer.inner(box_area);

        let has_comps = !self.completions.is_empty();
        let (parts, out_idx): (Vec<Constraint>, usize) = if has_comps {
            (
                vec![
                    Constraint::Length(6),   // logo
                    Constraint::Length(1),   // gap
                    Constraint::Length(1),   // button
                    Constraint::Length(1),   // gap
                    Constraint::Length(3),   // input
                    Constraint::Max(5),      // completions
                    Constraint::Length(1),   // gap
                    Constraint::Min(0),      // output
                ],
                7,
            )
        } else {
            (
                vec![
                    Constraint::Length(6),   // logo
                    Constraint::Length(1),   // gap
                    Constraint::Length(1),   // button
                    Constraint::Length(1),   // gap
                    Constraint::Length(3),   // input
                    Constraint::Length(1),   // gap
                    Constraint::Min(0),      // output
                ],
                6,
            )
        };
        let vert = Layout::vertical(parts);
        let vert_areas = vert.split(inner);
        let logo_a = vert_areas[0];
        let btn_a = vert_areas[2];
        let input_a = vert_areas[4];
        let output_a = vert_areas[out_idx];

        // Logo
        let logo_lines: Vec<Line> = LOGO.iter().map(|l| {
            Line::from(Span::styled(*l, Style::default().fg(ACCENT).bg(SURFACE)))
        }).collect();
        f.render_widget(
            Paragraph::new(logo_lines).style(Style::default().bg(SURFACE)).alignment(Alignment::Center),
            logo_a,
        );

        // Button (no border)
        let btn_text = if self.selecting {
            "   Loading...   "
        } else if self.results.is_empty() {
            "  [Enter] Select files  "
        } else {
            "  [Enter] Select more  "
        };
        let btn_style = Style::default().fg(if self.selecting { BG } else { ACCENT })
            .bg(if self.selecting { ACCENT } else { SURFACE });
        self.drop_btn_area.set(Some(btn_a));
        f.render_widget(
            Paragraph::new(Span::styled(btn_text, btn_style))
                .style(Style::default().bg(SURFACE)).alignment(Alignment::Center),
            btn_a,
        );

        // Input box
        let display = format!("> {}|", self.cmd_input);
        let input_block = Block::default()
            .borders(Borders::ALL)
            .border_set(symbols::border::ROUNDED)
            .border_style(Style::default().fg(
                if self.cmd_input.is_empty() && self.completions.is_empty() { DIM } else { ACCENT }
            ))
            .bg(SURFACE);
        f.render_widget(
            Paragraph::new(Span::styled(display, Style::default().fg(TEXT).bg(SURFACE)))
                .block(input_block).style(Style::default().bg(SURFACE)),
            input_a,
        );

        // Completions (vertical list)
        if has_comps {
            let comp_a = vert_areas[5];
            let visible = self.completions.len().min(comp_a.height as usize);
            let mut comp_lines: Vec<Line> = Vec::with_capacity(visible);
            for i in 0..visible {
                let selected = i == self.completion_idx;
                let prefix = if selected { " \u{25B6} " } else { "   " };
                let fg = if selected { ACCENT } else { TEXT };
                let bg = if selected { Color::Rgb(30, 30, 45) } else { SURFACE };
                comp_lines.push(Line::from(Span::styled(
                    format!("{}{}", prefix, self.completions[i]),
                    Style::default().fg(fg).bg(bg),
                )));
            }
            f.render_widget(
                Paragraph::new(comp_lines).style(Style::default().bg(SURFACE)),
                comp_a,
            );
            self.comp_list_area.set(Some(comp_a));
        } else {
            self.comp_list_area.set(None);
        }

        // Output area
        if output_a.height >= 2 {
            let out_block = Block::default()
                .borders(Borders::ALL)
                .border_set(symbols::border::ROUNDED)
                .border_style(Style::default().fg(
                    if self.output_lines.is_empty() { DIM } else { BORDER }
                ))
                .bg(SURFACE);

            if self.output_lines.is_empty() {
                f.render_widget(
                    Paragraph::new(Span::styled("  No output yet", Style::default().fg(DIM).bg(SURFACE)))
                        .block(out_block).style(Style::default().bg(SURFACE)),
                    output_a,
                );
            } else {
                let inner_h = output_a.height.saturating_sub(2);
                let max_scroll = self.output_lines.len().saturating_sub(inner_h as usize);
                let scroll = self.output_scroll.min(max_scroll);
                let lines: Vec<Line> = self.output_lines.iter().map(|l| {
                    let fg = if l.starts_with("  \u{2713}") {
                        GREEN
                    } else if l.starts_with("  \u{2717}") {
                        RED
                    } else if l.starts_with("  >") {
                        ACCENT
                    } else if l.starts_with('\u{2500}') {
                        DIM
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
        }

        // Status at bottom of box
        let status_text = if !self.status_msg.is_empty() && self.results.is_empty() {
            &self.status_msg
        } else if !self.results.is_empty() {
            "[Tab] cycle  [F1] results  [Esc] exit"
        } else {
            "[Tab] cycle  [Esc] exit"
        };
        f.render_widget(
            Paragraph::new(Span::styled(status_text, Style::default().fg(DIM).bg(SURFACE)))
                .style(Style::default().bg(SURFACE)).alignment(Alignment::Center),
            Rect::new(box_area.x, box_area.y + box_area.height - 1, box_area.width, 1),
        );
    }

    fn draw_results(&self, f: &mut Frame, area: Rect) {
        if area.width < 10 || area.height < 8 { return; }
        let box_w = 60.min(area.width.saturating_sub(4));
        let box_h = (area.height - 4).min(20);
        let x = (area.width - box_w) / 2;
        let y = (area.height - box_h) / 2;
        let box_area = Rect::new(x, y, box_w, box_h);

        let outer = Block::default()
            .borders(Borders::ALL)
            .border_set(symbols::border::ROUNDED)
            .border_style(Style::default().fg(BORDER))
            .bg(SURFACE);
        f.render_widget(&outer, box_area);
        let inner = outer.inner(box_area);

        let vert = Layout::vertical([
            Constraint::Length(2),
            Constraint::Min(1),
            Constraint::Length(3),
        ]);
        let [header_a, list_a, btn_a] = vert.areas(inner);

        // Header
        f.render_widget(
            Paragraph::new(vec![
                Line::from(Span::styled("  Export Results", Style::default().fg(ACCENT).bg(SURFACE))),
                Line::from(Span::styled(format!("  {} file{} converted", self.results.len(), if self.results.len() == 1 { "" } else { "s" }), Style::default().fg(DIM).bg(SURFACE))),
            ]).style(Style::default().bg(SURFACE)),
            header_a,
        );

        // List
        let mut list_lines: Vec<Line> = Vec::new();
        if self.results.is_empty() {
            list_lines.push(Line::from(Span::styled("  No exports yet", Style::default().fg(DIM).bg(SURFACE))));
        } else {
            list_lines.push(Line::from(vec![
                Span::styled("  #  ", Style::default().fg(DIM)),
                Span::styled("Song", Style::default().fg(ACCENT)),
                Span::styled("  Keys  Notes  Format", Style::default().fg(DIM)),
            ]));
            list_lines.push(Line::from(Span::styled("  ".repeat(50), Style::default().fg(DIM).bg(SURFACE))));
            for (i, r) in self.results.iter().enumerate() {
                let bg = if i % 2 == 0 { SURFACE } else { Color::Rgb(30, 30, 38) };
                list_lines.push(Line::from(vec![
                    Span::styled(format!("  {:<2} ", i + 1), Style::default().fg(DIM).bg(bg)),
                    Span::styled(format!("{:<25}", r.title.chars().take(25).collect::<String>()), Style::default().fg(TEXT).bg(bg)),
                    Span::styled(format!(" {:<3} ", r.keys), Style::default().fg(ACCENT).bg(bg)),
                    Span::styled(format!("{:<5} ", r.notes), Style::default().fg(DIM).bg(bg)),
                    Span::styled(format!("{} \u{2192} {}", r.from, r.to), Style::default().fg(DIM).bg(bg)),
                ]));
            }
        }
        f.render_widget(
            Paragraph::new(list_lines).style(Style::default().bg(SURFACE)).scroll((self.results_scroll as u16, 0)),
            list_a,
        );

        // Button
        let btn_block = Block::default()
            .borders(Borders::ALL)
            .border_set(symbols::border::ROUNDED)
            .border_style(Style::default().fg(BORDER))
            .bg(SURFACE);
        let btn_text = vec![
            Line::from(Span::styled("  Open export folder  ", Style::default().fg(ACCENT).bg(SURFACE))),
            Line::from(Span::styled("  [Enter/O] open  [Esc] back  ", Style::default().fg(DIM).bg(SURFACE))),
        ];
        self.results_btn_area.set(Some(btn_a));
        f.render_widget(
            Paragraph::new(btn_text).block(btn_block).style(Style::default().bg(SURFACE)).alignment(Alignment::Center),
            btn_a,
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
}

// ── Help text drawing inside TUI ────────────────────────────────

fn onoff(v: bool) -> &'static str { if v { "on" } else { "off" } }

fn parse_f64(s: &str) -> Result<f64, String> {
    s.parse::<f64>().map_err(|_| format!("Invalid number: '{}'", s))
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

// ── Non-interactive mode ────────────────────────────────────

fn non_interactive(command: &str, args: &[String]) -> Result<(), String> {
    let file = args.iter()
        .position(|a| !a.starts_with("--") && a != command && *a != args[0])
        .and_then(|i| args.get(i))
        .ok_or_else(|| format!("Usage: henkan-cli {} <file> [--output <dir>] [--dir <osu|sm>]", command))?;
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

fn splash_stdout() {
    for line in LOGO { println!("{}", line); }
    println!(); println!("    osu!mania \u{2194} StepMania Converter");
}

fn help_stdout() {
    println!(); println!("  Commands:"); println!("    parse <file>       Parse & display metadata");
    println!("    convert <file>     Convert & print output"); println!("    export <file>      Convert & save to folder");
    println!(); println!("  Flags:"); println!("    --dir <osu|sm>    Conversion direction (default: auto-detect)");
    println!("    --output <dir>    Output directory (default: current dir)");
    println!(); println!("  Run without args for interactive TUI mode.");
}
