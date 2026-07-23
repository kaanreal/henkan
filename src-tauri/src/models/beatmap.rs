use serde::{Deserialize, Serialize};

use super::timing::{SVEvent, TimingPoint};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub time_ms: f64,
    pub column: u32,
    pub hold: bool,
    pub hold_end_ms: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffInfo {
    pub name: String,
    pub keys: u32,
    pub note_count: usize,
    pub audio_filename: Option<String>,
    #[serde(default)]
    pub difficulty_rating: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Beatmap {
    // Metadata
    pub title: String,
    pub artist: String,
    pub creator: String,
    pub difficulty_name: String,
    pub source: String,
    pub tags: String,

    // File references
    pub audio_filename: String,
    pub background_filename: Option<String>,
    pub banner_filename: Option<String>,
    pub cdtitle_filename: Option<String>,

    // Source paths (for resolving relative refs)
    pub source_dir: String,
    pub source_file: String,

    // Timing
    pub timing_points: Vec<TimingPoint>,
    pub sv_events: Vec<SVEvent>,
    pub preview_time: f64,
    pub lead_in_ms: f64,

    // Gameplay
    pub keys: u32,
    pub notes: Vec<Note>,

    // Computed
    pub duration_ms: f64,

    // Difficulty rating (MSD for Etterna charts, star rating for osu)
    #[serde(default)]
    pub difficulty_rating: Option<f64>,

    // Source tracking
    pub source_format: SourceFormat,

    // Multiple difficulties
    pub available_difficulties: Vec<DiffInfo>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SourceFormat {
    OsuMania,
    Etterna,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportConfig {
    pub title: String,
    pub artist: String,
    pub creator: String,
    pub difficulty_name: String,
    pub source: String,
    pub tags: String,
    pub audio_filename: String,
    pub background_filename: Option<String>,
    pub banner_filename: Option<String>,
    pub cdtitle_filename: Option<String>,
    pub global_timing_ms: f64,       // ms to shift all notes later (+ = later, - = earlier)
    pub output_format: String,       // "osu" or "osz" ("osz" = zip package)
    pub hp_drain: f64,
    pub overall_difficulty: f64,
    #[serde(default)]
    pub approach_rate: f64,
    #[serde(default)]
    pub circle_size: f64,
    pub preview_time: f64,
    #[serde(default = "default_conversion_rate")]
    pub conversion_rate: f64,
    #[serde(default = "default_preserve_pitch")]
    pub preserve_pitch: bool,
    #[serde(default = "default_fetch_avatar")]
    pub fetch_avatar: bool,

    // SM advanced fields (osu → etterna) — all optional, empty = use defaults
    #[serde(default)]
    pub subtitle: Option<String>,
    #[serde(default)]
    pub title_translit: Option<String>,
    #[serde(default)]
    pub subtitle_translit: Option<String>,
    #[serde(default)]
    pub artist_translit: Option<String>,
    #[serde(default)]
    pub genre: Option<String>,
    #[serde(default)]
    pub credit: Option<String>,
    #[serde(default)]
    pub display_bpm: Option<String>,
    #[serde(default)]
    pub sample_start: Option<String>,
    #[serde(default)]
    pub sample_length: Option<String>,
    #[serde(default)]
    pub selectable: Option<String>,
    #[serde(default)]
    pub diff_name_template: Option<String>,
}

impl Default for ExportConfig {
    fn default() -> Self {
        Self {
            title: String::new(),
            artist: String::new(),
            creator: String::new(),
            difficulty_name: String::new(),
            source: String::new(),
            tags: String::new(),
            audio_filename: String::new(),
            background_filename: None,
            banner_filename: None,
            cdtitle_filename: None,
            global_timing_ms: 50.0,
            output_format: "folder".into(),
            hp_drain: 8.0,
            overall_difficulty: 8.0,
            approach_rate: 0.0,
            circle_size: 0.0,
            preview_time: 0.0,
            conversion_rate: 1.0,
            preserve_pitch: true,
            fetch_avatar: true,
            subtitle: None,
            title_translit: None,
            subtitle_translit: None,
            artist_translit: None,
            genre: None,
            credit: None,
            display_bpm: None,
            sample_start: None,
            sample_length: None,
            selectable: None,
            diff_name_template: None,
        }
    }
}

fn default_conversion_rate() -> f64 { 1.0 }
fn default_preserve_pitch() -> bool { true }
fn default_fetch_avatar() -> bool { true }

/// Lightweight metadata returned by scan_pack for each .sm file found.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackEntry {
    pub source_file: String,
    pub source_dir: String,
    pub title: String,
    pub artist: String,
    pub background_filename: Option<String>,
    pub banner_filename: Option<String>,
    pub available_difficulties: Vec<DiffInfo>,
}

impl Beatmap {
    pub fn new(keys: u32) -> Self {
        Self {
            title: String::new(),
            artist: String::new(),
            creator: String::new(),
            difficulty_name: String::new(),
            source: String::new(),
            tags: String::new(),
            audio_filename: String::new(),
            background_filename: None,
            banner_filename: None,
            cdtitle_filename: None,
            source_dir: String::new(),
            source_file: String::new(),
            timing_points: Vec::new(),
            sv_events: Vec::new(),
            preview_time: 0.0,
            lead_in_ms: 0.0,
            keys,
            notes: Vec::new(),
            duration_ms: 0.0,
            difficulty_rating: None,
            source_format: SourceFormat::OsuMania,
            available_difficulties: Vec::new(),
        }
    }

    pub fn compute_duration(&mut self) {
        self.duration_ms = self
            .notes
            .iter()
            .map(|n| n.hold_end_ms.unwrap_or(n.time_ms))
            .fold(0.0, f64::max);
    }
}
