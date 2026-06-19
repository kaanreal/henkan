use crate::models::beatmap::{Beatmap, Note};
use crate::models::timing::{SVEvent, TimingPoint};
use anyhow::Result;
use std::collections::HashMap;

pub fn parse_osu(content: &str) -> Result<Beatmap> {
    parse_osu_with_source(content, "")
}

pub fn parse_osu_with_source(content: &str, source_dir: &str) -> Result<Beatmap> {
    let sections = split_sections(content);

    let general = parse_general(sections.get("General").map(|s| s.as_str()).unwrap_or(""));
    let metadata = parse_metadata(sections.get("Metadata").map(|s| s.as_str()).unwrap_or(""));
    let difficulty = parse_difficulty(sections.get("Difficulty").map(|s| s.as_str()).unwrap_or(""));
    let timing_points = parse_timing_points(
        sections
            .get("TimingPoints")
            .map(|s| s.as_str())
            .unwrap_or(""),
    );
    let hit_objects = parse_hit_objects(
        sections
            .get("HitObjects")
            .map(|s| s.as_str())
            .unwrap_or(""),
        difficulty.keys,
    );

    let sv_events: Vec<SVEvent> = timing_points
        .iter()
        .filter(|tp| !tp.uninherited)
        .map(|tp| SVEvent {
            time_ms: tp.time_ms,
            multiplier: tp.sv_multiplier(),
        })
        .collect();

    let bpm_timing: Vec<TimingPoint> = timing_points
        .into_iter()
        .filter(|tp| tp.uninherited)
        .collect();

    let mut beatmap = Beatmap::new(difficulty.keys);
    beatmap.title = metadata.title;
    beatmap.artist = metadata.artist;
    beatmap.creator = metadata.creator;
    beatmap.difficulty_name = metadata.version;
    beatmap.source = metadata.source;
    beatmap.tags = metadata.tags;
    beatmap.audio_filename = general.audio_filename;
    beatmap.preview_time = general.preview_time;
    beatmap.lead_in_ms = general.audio_lead_in;
    beatmap.timing_points = bpm_timing;
    beatmap.sv_events = sv_events;
    beatmap.notes = hit_objects;
    beatmap.source_format = crate::models::beatmap::SourceFormat::OsuMania;
    beatmap.source_dir = source_dir.to_string();

    // extract background from [Events]
    let events = sections.get("Events").map(|s| s.as_str()).unwrap_or("");
    if let Some(bg) = parse_background(events) {
        beatmap.background_filename = Some(bg);
    }

    beatmap.compute_duration();
    Ok(beatmap)
}

fn split_sections(content: &str) -> HashMap<String, String> {
    let mut sections = HashMap::new();
    let mut current_section = String::new();
    let mut current_content = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            if !current_section.is_empty() {
                sections.insert(current_section.clone(), current_content.join("\n"));
            }
            current_section = trimmed[1..trimmed.len() - 1].to_string();
            current_content.clear();
        } else if !trimmed.is_empty() && !trimmed.starts_with("//") {
            current_content.push(line);
        }
    }

    if !current_section.is_empty() {
        sections.insert(current_section, current_content.join("\n"));
    }

    sections
}

struct General {
    audio_filename: String,
    audio_lead_in: f64,
    preview_time: f64,
    mode: u32,
}

fn parse_general(content: &str) -> General {
    let mut general = General {
        audio_filename: String::new(),
        audio_lead_in: 0.0,
        preview_time: 0.0,
        mode: 0,
    };

    for line in content.lines() {
        let trimmed = line.trim();
        if let Some((key, value)) = trimmed.split_once(':') {
            match key.trim() {
                "AudioFilename" => general.audio_filename = value.trim().to_string(),
                "AudioLeadIn" => general.audio_lead_in = value.trim().parse().unwrap_or(0.0),
                "PreviewTime" => general.preview_time = value.trim().parse().unwrap_or(0.0),
                "Mode" => general.mode = value.trim().parse().unwrap_or(0),
                _ => {}
            }
        }
    }

    general
}

struct Metadata {
    title: String,
    artist: String,
    creator: String,
    version: String,
    source: String,
    tags: String,
}

fn parse_metadata(content: &str) -> Metadata {
    let mut meta = Metadata {
        title: String::new(),
        artist: String::new(),
        creator: String::new(),
        version: String::new(),
        source: String::new(),
        tags: String::new(),
    };

    for line in content.lines() {
        let trimmed = line.trim();
        if let Some((key, value)) = trimmed.split_once(':') {
            match key.trim() {
                "Title" => meta.title = value.trim().to_string(),
                "Artist" => meta.artist = value.trim().to_string(),
                "Creator" => meta.creator = value.trim().to_string(),
                "Version" => meta.version = value.trim().to_string(),
                "Source" => meta.source = value.trim().to_string(),
                "Tags" => meta.tags = value.trim().to_string(),
                _ => {}
            }
        }
    }

    meta
}

struct Difficulty {
    keys: u32,
}

fn parse_difficulty(content: &str) -> Difficulty {
    let mut diff = Difficulty { keys: 4 };

    for line in content.lines() {
        let trimmed = line.trim();
        if let Some((key, value)) = trimmed.split_once(':') {
            if key.trim() == "CircleSize" {
                diff.keys = value.trim().parse().unwrap_or(4);
            }
        }
    }

    diff
}

fn parse_timing_points(content: &str) -> Vec<TimingPoint> {
    let mut points = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let parts: Vec<&str> = trimmed.split(',').collect();
        if parts.len() < 8 {
            continue;
        }

        let time: f64 = parts[0].trim().parse().unwrap_or(0.0);
        let beat_length: f64 = parts[1].trim().parse().unwrap_or(500.0);
        let meter: u32 = parts[2].trim().parse().unwrap_or(4);
        let uninherited: u32 = parts[6].trim().parse().unwrap_or(0);

        points.push(TimingPoint {
            time_ms: time,
            beat_length,
            meter,
            uninherited: uninherited != 0,
        });
    }

    points.sort_by(|a, b| a.time_ms.partial_cmp(&b.time_ms).unwrap_or(std::cmp::Ordering::Equal));
    points
}

fn parse_hit_objects(content: &str, keys: u32) -> Vec<Note> {
    let mut notes = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let parts: Vec<&str> = trimmed.split(',').collect();
        if parts.len() < 5 {
            continue;
        }

        let x: f64 = parts[0].trim().parse().unwrap_or(0.0);
        let time: f64 = parts[2].trim().parse().unwrap_or(0.0);
        let obj_type: u32 = parts[3].trim().parse().unwrap_or(0);

        let column = ((x / 512.0) * keys as f64).floor() as u32;
        let column = column.min(keys - 1);

        let is_hold = (obj_type & 128) != 0;

        let hold_end = if is_hold && parts.len() > 5 {
            let extras = parts[5].trim();
            let end_parts: Vec<&str> = extras.split(':').collect();
            end_parts.first().and_then(|s| s.parse().ok())
        } else {
            None
        };

        notes.push(Note {
            time_ms: time,
            column,
            hold: is_hold,
            hold_end_ms: hold_end,
        });
    }

    notes.sort_by(|a, b| a.time_ms.partial_cmp(&b.time_ms).unwrap_or(std::cmp::Ordering::Equal));
    notes
}

fn parse_background(events_section: &str) -> Option<String> {
    for line in events_section.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with("//") {
            continue;
        }
        // Format: 0,0,"filename.jpg",0,0
        if !trimmed.starts_with("0,0,") {
            continue;
        }
        let rest = trimmed.strip_prefix("0,0,")?;
        if let Some(quoted) = rest.strip_prefix('"') {
            if let Some((name, _)) = quoted.split_once('"') {
                return Some(name.to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_basic_osu() {
        let content = r#"osu file format v14

[General]
AudioFilename: song.mp3
AudioLeadIn: 500
PreviewTime: 30000
Mode: 3

[Metadata]
Title:Test Song
TitleUnicode:テストソング
Artist:Test Artist
ArtistUnicode:テストアーティスト
Creator:TestMapper
Version:Another
Source:Game
Tags:test song

[Difficulty]
HPDrainRate:8
CircleSize:7
OverallDifficulty:8
ApproachRate:9
SliderMultiplier:1.4
SliderTickRate:1

[TimingPoints]
1000,500,4,0,0,100,1,0
3000,-100,4,0,0,100,0,0
5000,250,4,0,0,100,1,0

[HitObjects]
256,192,1500,1,0,0:0:0:0:
256,192,2000,128,0,3500:0:0:0:0:
"#;

        let beatmap = parse_osu(content).unwrap();
        assert_eq!(beatmap.title, "Test Song");
        assert_eq!(beatmap.artist, "Test Artist");
        assert_eq!(beatmap.creator, "TestMapper");
        assert_eq!(beatmap.difficulty_name, "Another");
        assert_eq!(beatmap.keys, 7);
        assert_eq!(beatmap.audio_filename, "song.mp3");
        assert_eq!(beatmap.preview_time, 30000.0);
        assert_eq!(beatmap.lead_in_ms, 500.0);

        assert_eq!(beatmap.timing_points.len(), 2);
        assert!((beatmap.timing_points[0].bpm() - 120.0).abs() < 0.01);
        assert!((beatmap.timing_points[1].bpm() - 240.0).abs() < 0.01);

        assert_eq!(beatmap.sv_events.len(), 1);
        assert!((beatmap.sv_events[0].multiplier - 1.0).abs() < 0.01);

        assert_eq!(beatmap.notes.len(), 2);
        assert!(!beatmap.notes[0].hold);
        assert!(beatmap.notes[1].hold);
        assert_eq!(beatmap.notes[1].hold_end_ms, Some(3500.0));
    }
}
