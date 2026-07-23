use crate::models::beatmap::{Beatmap, DiffInfo, Note};
use crate::models::timing::TimingPoint;
use anyhow::Result;

#[cfg(feature = "minacalc")]
fn try_compute_msd(beatmap: &Beatmap) -> Option<f64> {
    crate::msd::compute_msd(beatmap)
}

#[cfg(not(feature = "minacalc"))]
fn try_compute_msd(_beatmap: &Beatmap) -> Option<f64> {
    None
}

#[cfg(feature = "minacalc")]
fn try_compute_msd_batch(note_slices: &[&[Note]]) -> Vec<Option<f64>> {
    crate::msd::compute_msd_batch(note_slices)
}

#[cfg(not(feature = "minacalc"))]
fn try_compute_msd_batch(note_slices: &[&[Note]]) -> Vec<Option<f64>> {
    note_slices.iter().map(|_| None).collect()
}

pub fn parse_sm(content: &str) -> Result<Beatmap> {
    let raw = content.replace("\r\n", "\n");
    let headers = parse_headers(&raw);
    let sections = extract_all_notes_sections(&raw);

    let (notes_str, keys) = if sections.is_empty() {
        (String::new(), 4)
    } else {
        let k = detect_keys(&sections[0]);
        (sections[0].clone(), k)
    };

    let mut beatmap = Beatmap::new(keys);
    beatmap.source_format = crate::models::beatmap::SourceFormat::Etterna;

    beatmap.title = headers.get("TITLE").cloned().unwrap_or_default();
    beatmap.artist = headers.get("ARTIST").cloned().unwrap_or_default();
    beatmap.creator = headers.get("CREDIT").cloned().unwrap_or_default();
    beatmap.source = headers.get("GENRE").cloned().unwrap_or_default();

    beatmap.audio_filename = headers.get("MUSIC").cloned().unwrap_or_default();
    beatmap.background_filename = headers.get("BACKGROUND").cloned()
        .filter(|s| !s.is_empty())
        .or_else(|| headers.get("BANNER").cloned().filter(|s| !s.is_empty()));
    beatmap.banner_filename = headers.get("BANNER").cloned().filter(|s| !s.is_empty());
    beatmap.cdtitle_filename = headers.get("CDTITLE").cloned().filter(|s| !s.is_empty());

    let offset: f64 = headers.get("OFFSET").and_then(|s| s.parse().ok()).unwrap_or(0.0);

    let sample_start: f64 = headers
        .get("SAMPLESTART")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0.0);
    beatmap.preview_time = sample_start * 1000.0;

    let bpm_changes = parse_bpms(headers.get("BPMS").unwrap_or(&String::new()));
    let stops = parse_stops(headers.get("STOPS").unwrap_or(&String::new()));

    let timing_points = build_timing(&bpm_changes, &stops, offset);
    beatmap.timing_points = timing_points;

    if let Some(notes) = parse_notes_data(&notes_str, keys, &bpm_changes, &stops, offset) {
        beatmap.notes = notes;
    }

    let difficulty_name = detect_difficulty(&notes_str);
    if !difficulty_name.is_empty() {
        beatmap.difficulty_name = difficulty_name;
    }

    let audio = headers.get("MUSIC").cloned();
    beatmap.available_difficulties = sections.iter().map(|s| {
        let k = detect_keys(s);
        let count = count_notes(s);
        DiffInfo {
            name: detect_difficulty(s),
            keys: k,
            note_count: count,
            audio_filename: audio.clone(),
            difficulty_rating: detect_meter(s),
        }
    }).collect();

    beatmap.difficulty_rating = try_compute_msd(&beatmap);
    beatmap.compute_duration();
    Ok(beatmap)
}

pub fn parse_sm_difficulty(content: &str, index: usize) -> Result<Beatmap> {
    let raw = content.replace("\r\n", "\n");
    let headers = parse_headers(&raw);
    let sections = extract_all_notes_sections(&raw);

    if index >= sections.len() {
        anyhow::bail!("Difficulty index {} out of range (0..{})", index, sections.len());
    }

    let notes_str = &sections[index];
    let keys = detect_keys(notes_str);

    let mut beatmap = Beatmap::new(keys);
    beatmap.source_format = crate::models::beatmap::SourceFormat::Etterna;

    beatmap.title = headers.get("TITLE").cloned().unwrap_or_default();
    beatmap.artist = headers.get("ARTIST").cloned().unwrap_or_default();
    beatmap.creator = headers.get("CREDIT").cloned().unwrap_or_default();
    beatmap.source = headers.get("GENRE").cloned().unwrap_or_default();
    beatmap.audio_filename = headers.get("MUSIC").cloned().unwrap_or_default();
    beatmap.background_filename = headers.get("BACKGROUND").cloned()
        .filter(|s| !s.is_empty())
        .or_else(|| headers.get("BANNER").cloned().filter(|s| !s.is_empty()));
    beatmap.banner_filename = headers.get("BANNER").cloned().filter(|s| !s.is_empty());
    beatmap.cdtitle_filename = headers.get("CDTITLE").cloned().filter(|s| !s.is_empty());

    let offset: f64 = headers.get("OFFSET").and_then(|s| s.parse().ok()).unwrap_or(0.0);
    let sample_start: f64 = headers.get("SAMPLESTART").and_then(|s| s.parse().ok()).unwrap_or(0.0);
    beatmap.preview_time = sample_start * 1000.0;

    let bpm_changes = parse_bpms(headers.get("BPMS").unwrap_or(&String::new()));
    let stops = parse_stops(headers.get("STOPS").unwrap_or(&String::new()));
    beatmap.timing_points = build_timing(&bpm_changes, &stops, offset);

    if let Some(notes) = parse_notes_data(notes_str, keys, &bpm_changes, &stops, offset) {
        beatmap.notes = notes;
    }

    let difficulty_name = detect_difficulty(notes_str);
    if !difficulty_name.is_empty() {
        beatmap.difficulty_name = difficulty_name;
    }

    let audio = headers.get("MUSIC").cloned();
    beatmap.available_difficulties = sections.iter().map(|s| {
        let k = detect_keys(s);
        let count = count_notes(s);
        DiffInfo {
            name: detect_difficulty(s),
            keys: k,
            note_count: count,
            audio_filename: audio.clone(),
            difficulty_rating: detect_meter(s),
        }
    }).collect();

    beatmap.difficulty_rating = try_compute_msd(&beatmap);
    beatmap.compute_duration();
    Ok(beatmap)
}

/// Parse all difficulties from an SM file, sharing one header/timing pass.
/// Much faster than calling `parse_sm_difficulty` N times.
pub fn parse_sm_all(content: &str) -> Result<Vec<Beatmap>> {
    let raw = content.replace("\r\n", "\n");
    let headers = parse_headers(&raw);
    let sections = extract_all_notes_sections(&raw);

    if sections.is_empty() {
        anyhow::bail!("No #NOTES: sections found");
    }

    let offset: f64 = headers.get("OFFSET").and_then(|s| s.parse().ok()).unwrap_or(0.0);
    let sample_start: f64 = headers.get("SAMPLESTART").and_then(|s| s.parse().ok()).unwrap_or(0.0);
    let preview_time = sample_start * 1000.0;
    let bpm_changes = parse_bpms(headers.get("BPMS").unwrap_or(&String::new()));
    let stops = parse_stops(headers.get("STOPS").unwrap_or(&String::new()));
    let timing_points = build_timing(&bpm_changes, &stops, offset);
    let audio = headers.get("MUSIC").cloned();
    let title = headers.get("TITLE").cloned().unwrap_or_default();
    let artist = headers.get("ARTIST").cloned().unwrap_or_default();
    let creator = headers.get("CREDIT").cloned().unwrap_or_default();
    let source = headers.get("GENRE").cloned().unwrap_or_default();
    let audio_filename = headers.get("MUSIC").cloned().unwrap_or_default();
    let bg = headers.get("BACKGROUND").cloned()
        .filter(|s| !s.is_empty())
        .or_else(|| headers.get("BANNER").cloned().filter(|s| !s.is_empty()));
    let banner = headers.get("BANNER").cloned().filter(|s| !s.is_empty());
    let cdtitle = headers.get("CDTITLE").cloned().filter(|s| !s.is_empty());

    // Pre-parse all sections once
    let parsed_sections: Vec<_> = sections.iter().map(|s| {
        let k = detect_keys(s);
        let notes = parse_notes_data(s, k, &bpm_changes, &stops, offset).unwrap_or_default();
        let diff_name = detect_difficulty(s);
        let note_count = count_notes(s);
        (k, notes, diff_name, note_count)
    }).collect();

    // Batch-compute MSD for all note slices in one Calc instance
    let note_refs: Vec<&[Note]> = parsed_sections.iter().map(|(_, notes, _, _)| notes.as_slice()).collect();
    let msd_ratings = try_compute_msd_batch(&note_refs);

    // Build shared available_difficulties once
    let available_difficulties: Vec<DiffInfo> = parsed_sections.iter().zip(&msd_ratings).enumerate().map(|(i, ((k, _notes, diff_name, note_count), rating))| {
        DiffInfo {
            name: diff_name.clone(),
            keys: *k,
            note_count: *note_count,
            audio_filename: audio.clone(),
            difficulty_rating: rating.or_else(|| detect_meter(&sections[i])),
        }
    }).collect();

    let mut result = Vec::with_capacity(sections.len());
    for (i, _notes_str) in sections.iter().enumerate() {
        let (keys, notes, dn, _) = &parsed_sections[i];
        let mut beatmap = Beatmap::new(*keys);
        beatmap.source_format = crate::models::beatmap::SourceFormat::Etterna;
        beatmap.title = title.clone();
        beatmap.artist = artist.clone();
        beatmap.creator = creator.clone();
        beatmap.source = source.clone();
        beatmap.audio_filename = audio_filename.clone();
        beatmap.background_filename = bg.clone();
        beatmap.banner_filename = banner.clone();
        beatmap.cdtitle_filename = cdtitle.clone();
        beatmap.preview_time = preview_time;
        beatmap.timing_points = timing_points.clone();
        beatmap.notes = notes.clone();
        if !dn.is_empty() { beatmap.difficulty_name = dn.clone(); }
        beatmap.difficulty_rating = msd_ratings[i];
        beatmap.available_difficulties = available_difficulties.clone();
        beatmap.compute_duration();
        result.push(beatmap);
    }
    Ok(result)
}

pub fn parse_headers(content: &str) -> std::collections::HashMap<String, String> {
    // Values routinely span multiple lines (#BPMS is almost always written
    // one change per line), so scan #KEY:VALUE; pairs across the whole file
    // instead of line by line.
    let mut headers = std::collections::HashMap::new();
    let mut rest = content;

    while let Some(hash) = rest.find('#') {
        let after = &rest[hash + 1..];
        let Some(colon) = after.find(':') else { break };
        let key = after[..colon].trim().to_uppercase();
        let value_part = &after[colon + 1..];
        let end = value_part.find(';').unwrap_or(value_part.len());
        if key != "NOTES" {
            headers.entry(key).or_insert_with(|| value_part[..end].trim().to_string());
        }
        rest = &value_part[end.min(value_part.len())..];
    }

    headers
}

pub fn extract_all_notes_sections(content: &str) -> Vec<String> {
    let mut sections = Vec::new();
    let mut in_notes = false;
    let mut depth = 0;
    let mut current = String::new();

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.starts_with("#NOTES:") {
            if in_notes {
                current.clear();
            }
            in_notes = true;
            depth = 0;
            current.clear();
            continue;
        }

        if in_notes {
            if trimmed == ";" {
                if depth == 0 {
                    sections.push(current.trim().to_string());
                    in_notes = false;
                    current.clear();
                    continue;
                }
                depth -= 1;
            }
            current.push_str(line);
            current.push('\n');
        }
    }

    sections
}

fn count_notes(notes_section: &str) -> usize {
    let mut count = 0;
    for line in notes_section.lines() {
        for ch in line.chars() {
            if ch == '1' || ch == '2' || ch == '3' || ch == '4' {
                count += 1;
            }
        }
    }
    count
}

fn detect_keys(notes_section: &str) -> u32 {
    let first_line = notes_section.lines().next().unwrap_or("");
    match first_line.trim().trim_matches(':').trim().trim_matches('"') {
        "dance-single" => 4,
        "dance-solo" => 6,
        "dance-double" => 8,
        "pump-single" => 5,
        "pump-double" => 10,
        "kb7-single" | "kbx-single" => 7,
        _ => 4,
    }
}

fn detect_difficulty(notes_section: &str) -> String {
    let lines: Vec<&str> = notes_section.lines().collect();
    if lines.len() > 1 {
        lines[1].trim().trim_matches(':').trim().trim_matches('"').to_string()
    } else {
        String::new()
    }
}

fn detect_meter(notes_section: &str) -> Option<f64> {
    let lines: Vec<&str> = notes_section.lines().collect();
    if lines.len() > 2 {
        let raw = lines[2].trim().trim_matches(':').trim().trim_matches('"');
        raw.parse::<f64>().ok()
    } else {
        None
    }
}

fn parse_bpms(content: &str) -> Vec<(f64, f64)> {
    let mut bpms = Vec::new();
    if content.is_empty() {
        bpms.push((0.0, 120.0));
        return bpms;
    }
    for part in content.split(',') {
        let part = part.trim();
        if let Some((beat, bpm)) = part.split_once('=') {
            let beat: f64 = beat.trim().parse().unwrap_or(0.0);
            let bpm: f64 = bpm.trim().parse().unwrap_or(120.0);
            bpms.push((beat, bpm));
        }
    }
    bpms.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
    if bpms.is_empty() {
        bpms.push((0.0, 120.0));
    }
    bpms
}

fn parse_stops(content: &str) -> Vec<(f64, f64)> {
    let mut stops = Vec::new();
    if content.is_empty() {
        return stops;
    }
    for part in content.split(',') {
        let part = part.trim();
        if let Some((beat, seconds)) = part.split_once('=') {
            let beat: f64 = beat.trim().parse().unwrap_or(0.0);
            let seconds: f64 = seconds.trim().parse().unwrap_or(0.0);
            stops.push((beat, seconds));
        }
    }
    stops
}

fn build_timing(
    bpms: &[(f64, f64)],
    stops: &[(f64, f64)],
    offset: f64,
) -> Vec<TimingPoint> {
    let mut points = Vec::new();
    let mut current_time = -offset * 1000.0;

    for (i, &(beat, bpm)) in bpms.iter().enumerate() {
        if i > 0 {
            let prev_beat = bpms[i - 1].0;
            let prev_bpm = bpms[i - 1].1;
            let beat_diff = beat - prev_beat;
            let ms_diff = beat_diff * (60_000.0 / prev_bpm);

            let stop_duration: f64 = stops
                .iter()
                .filter(|(s_beat, _)| *s_beat >= prev_beat && *s_beat < beat)
                .map(|(_, sec)| sec * 1000.0)
                .sum();

            current_time += ms_diff + stop_duration;
        }

        points.push(TimingPoint {
            time_ms: current_time,
            beat_length: 60_000.0 / bpm,
            meter: 4,
            uninherited: true,
        });
    }

    points
}

fn parse_notes_data(
    notes_section: &str,
    keys: u32,
    bpms: &[(f64, f64)],
    stops: &[(f64, f64)],
    offset: f64,
) -> Option<Vec<Note>> {
    // The 5 chart header fields (steptype, description, difficulty, meter,
    // radar) come first; everything after is note rows grouped into measures
    // separated by ',' lines.
    let mut data_lines = notes_section
        .lines()
        .map(|l| l.split("//").next().unwrap_or("").trim())
        .filter(|l| !l.is_empty())
        .peekable();

    // Header fields all end with ':' (steptype, description, difficulty,
    // meter, radar); note rows never do. Some files omit fields, so skip by
    // shape rather than by a fixed count.
    let mut skipped = 0;
    while skipped < 5 && data_lines.peek().is_some_and(|l| l.ends_with(':')) {
        data_lines.next();
        skipped += 1;
    }
    if skipped == 0 {
        return None;
    }

    let mut measures: Vec<Vec<&str>> = Vec::new();
    let mut current: Vec<&str> = Vec::new();
    for line in data_lines {
        if line == ";" {
            break;
        }
        if line == "," {
            measures.push(std::mem::take(&mut current));
            continue;
        }
        let row = line.trim_end_matches([',', ';']);
        if !row.is_empty() {
            current.push(row);
        }
        if row.len() != line.len() && line.ends_with(',') {
            measures.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        measures.push(current);
    }

    let mut notes: Vec<Note> = Vec::new();
    let mut beats_accumulated: f64 = 0.0;

    let mut in_hold = vec![false; keys as usize];
    let mut hold_start_time = vec![0.0_f64; keys as usize];

    for rows in &measures {
        if rows.is_empty() {
            beats_accumulated += 4.0;
            continue;
        }
        let rows_per_measure = rows.len() as f64;

        for (row_idx, row) in rows.iter().enumerate() {
            let beat_in_measure = row_idx as f64 / rows_per_measure * 4.0;
            let current_beat = beats_accumulated + beat_in_measure;
            let time = beat_to_ms(current_beat, bpms, stops, offset);

            let cols: Vec<char> = row.chars().collect();
            for (col, &ch) in cols.iter().enumerate() {
                if col >= keys as usize {
                    break;
                }
                match ch {
                    '1' => {
                        if in_hold[col] {
                            notes.push(Note {
                                time_ms: hold_start_time[col],
                                column: col as u32,
                                hold: true,
                                hold_end_ms: Some(time),
                            });
                            in_hold[col] = false;
                        }
                        notes.push(Note {
                            time_ms: time,
                            column: col as u32,
                            hold: false,
                            hold_end_ms: None,
                        });
                    }
                    '2' => {
                        if in_hold[col] {
                            notes.push(Note {
                                time_ms: hold_start_time[col],
                                column: col as u32,
                                hold: true,
                                hold_end_ms: Some(time),
                            });
                        }
                        in_hold[col] = true;
                        hold_start_time[col] = time;
                    }
                    '3' => {
                        if in_hold[col] {
                            notes.push(Note {
                                time_ms: hold_start_time[col],
                                column: col as u32,
                                hold: true,
                                hold_end_ms: Some(time),
                            });
                            in_hold[col] = false;
                        }
                    }
                    '4' => {
                        if in_hold[col] {
                            notes.push(Note {
                                time_ms: hold_start_time[col],
                                column: col as u32,
                                hold: true,
                                hold_end_ms: Some(time),
                            });
                        }
                        in_hold[col] = true;
                        hold_start_time[col] = time;
                    }
                    _ => {}
                }
            }
        }

        beats_accumulated += 4.0;
    }

    for col in 0..keys as usize {
        if in_hold[col] {
            notes.push(Note {
                time_ms: hold_start_time[col],
                column: col as u32,
                hold: true,
                hold_end_ms: Some(hold_start_time[col] + 1000.0),
            });
        }
    }

    notes.sort_by(|a, b| a.time_ms.partial_cmp(&b.time_ms).unwrap_or(std::cmp::Ordering::Equal));
    Some(notes)
}

fn beat_to_ms(
    beat: f64,
    bpms: &[(f64, f64)],
    stops: &[(f64, f64)],
    offset: f64,
) -> f64 {
    let mut time = -offset * 1000.0;
    let mut prev_beat = 0.0;

    for i in 0..bpms.len() {
        let (_bpm_beat, bpm) = bpms[i];
        let seg_end = if i + 1 < bpms.len() { bpms[i + 1].0 } else { f64::INFINITY };

        if beat < seg_end {
            let beat_diff = beat - prev_beat;
            time += beat_diff * (60_000.0 / bpm);
            for &(s_beat, sec) in stops {
                if s_beat >= prev_beat && s_beat < beat {
                    time += sec * 1000.0;
                }
            }
            return time;
        }

        let beat_diff = seg_end - prev_beat;
        time += beat_diff * (60_000.0 / bpm);
        for &(s_beat, sec) in stops {
            if s_beat >= prev_beat && s_beat < seg_end {
                time += sec * 1000.0;
            }
        }
        prev_beat = seg_end;
    }

    if beat > prev_beat {
        let last_bpm = bpms.last().map(|(_, b)| *b).unwrap_or(120.0);
        time += (beat - prev_beat) * (60_000.0 / last_bpm);
        for &(s_beat, sec) in stops {
            if s_beat >= prev_beat && s_beat < beat {
                time += sec * 1000.0;
            }
        }
    }

    time
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_basic_sm() {
        let content = r#"#TITLE:Test Song;
#ARTIST:Test Artist;
#CREDIT:TestMapper;
#MUSIC:song.ogg;
#OFFSET:0.000;
#SAMPLESTART:30.000;
#BPMS:0.000=120.000;
#STOPS:;
#NOTES:
     dance-single:
     Hard:
     10:
     0.777,0.444,0.111,0.111,0.222:
0000
1000
0100
0010
,
0001
2000
0003
0000
;
"#;

        let beatmap = parse_sm(content).unwrap();
        assert_eq!(beatmap.title, "Test Song");
        assert_eq!(beatmap.artist, "Test Artist");
        assert_eq!(beatmap.creator, "TestMapper");
        assert_eq!(beatmap.keys, 4);
        assert_eq!(beatmap.preview_time, 30000.0);

        assert!(!beatmap.timing_points.is_empty());
        assert!((beatmap.timing_points[0].bpm() - 120.0).abs() < 0.01);

        assert!(!beatmap.notes.is_empty());
        let holds: Vec<_> = beatmap.notes.iter().filter(|n| n.hold).collect();
        assert_eq!(holds.len(), 1);

        // 8 rows in the two measures at 120 BPM (2000ms per measure):
        // row 1 of measure 0 = 500ms, row 0 of measure 1 = 2000ms
        let taps: Vec<f64> = beatmap.notes.iter().filter(|n| !n.hold).map(|n| n.time_ms).collect();
        assert!((taps[0] - 500.0).abs() < 1.0, "first tap at {}ms", taps[0]);
        assert!((taps[3] - 2000.0).abs() < 1.0, "fourth tap at {}ms", taps[3]);
    }

    #[test]
    fn test_parse_multiline_bpms() {
        // real .sm files write one BPM change per line
        let content = "#TITLE:Multi;\n#OFFSET:0.000;\n#BPMS:0.000=120.000,\n4.000=240.000\n;\n#NOTES:\n dance-single:\n :\n Hard:\n 10:\n 0,0,0,0,0:\n1000\n0100\n0010\n0001\n,\n1000\n0100\n0010\n0001\n;\n";
        let beatmap = parse_sm(content).unwrap();
        assert_eq!(beatmap.timing_points.len(), 2, "expected 2 BPM points");
        assert!((beatmap.timing_points[0].bpm() - 120.0).abs() < 0.01);
        assert!((beatmap.timing_points[1].bpm() - 240.0).abs() < 0.01);
        // second BPM at beat 4 = 2000ms at 120 BPM
        assert!((beatmap.timing_points[1].time_ms - 2000.0).abs() < 0.01);
        assert_eq!(beatmap.notes.len(), 8);
        // measure 2 starts at beat 4: 2000ms + 250ms per row at 240 BPM
        assert!((beatmap.notes[4].time_ms - 2000.0).abs() < 0.01);
        assert!((beatmap.notes[5].time_ms - 2250.0).abs() < 0.01);
    }
}
