use crate::models::beatmap::{Beatmap, ExportConfig};
use crate::models::timing::ms_to_beat;
use anyhow::Result;
use std::fmt::Write;

pub fn convert(beatmap: &Beatmap, config: &ExportConfig) -> Result<String> {
    let tps = &beatmap.timing_points;

    // compute beat shift so earliest note/timing-point lands at beat 0
    let offset = compute_offset(beatmap);
    let offset_ms = offset * 1000.0;
    let beat_shift = -ms_to_beat(offset_ms, tps);

    // Global timing correction: shift #OFFSET without changing the note grid,
    // so all notes play later (positive) or earlier (negative).
    let display_offset = offset + (config.global_timing_ms / 1000.0);

    let mut out = String::new();

    // ── attribution ──────────────────────────────────────────
    writeln!(out, "// Converted using \"https://github.com/kaanreal/henkan\"")?;

    // ── headers ──────────────────────────────────────────────
    writeln!(out, "#TITLE:{};", escape(&beatmap.title))?;
    if let Some(ref v) = config.subtitle {
        writeln!(out, "#SUBTITLE:{};", escape(v))?;
    } else if !beatmap.difficulty_name.is_empty() {
        writeln!(out, "#SUBTITLE:{};", escape(&beatmap.difficulty_name))?;
    }
    writeln!(out, "#ARTIST:{};", escape(&beatmap.artist))?;
    if let Some(ref v) = config.title_translit {
        writeln!(out, "#TITLETRANSLIT:{};", escape(v))?;
    }
    if let Some(ref v) = config.subtitle_translit {
        writeln!(out, "#SUBTITLETRANSLIT:{};", escape(v))?;
    }
    if let Some(ref v) = config.artist_translit {
        writeln!(out, "#ARTISTTRANSLIT:{};", escape(v))?;
    }
    if let Some(ref v) = config.genre {
        writeln!(out, "#GENRE:{};", escape(v))?;
    } else if !beatmap.source.is_empty() {
        writeln!(out, "#GENRE:{};", escape(&beatmap.source))?;
    }
    if let Some(ref v) = config.credit {
        writeln!(out, "#CREDIT:{};", escape(v))?;
    } else {
        writeln!(out, "#CREDIT:{};", escape(&beatmap.creator))?;
    }
    writeln!(out, "#MUSIC:{};", escape(&beatmap.audio_filename))?;

    if beatmap.background_filename.is_some() {
        writeln!(out, "#BACKGROUND:bg.png;")?;
    }
    if beatmap.banner_filename.as_ref().is_some_and(|s| !s.is_empty()) {
        writeln!(out, "#BANNER:banner.png;")?;
    }
    writeln!(out, "#CDTITLE:cdtitle.png;")?;

    // SM convention: beat 0 occurs at time -OFFSET seconds.
    let sm_offset = if display_offset == 0.0 { 0.0 } else { -display_offset };
    writeln!(out, "#OFFSET:{:.3};", sm_offset)?;

    let sample_start = config.sample_start.as_deref()
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(beatmap.preview_time / 1000.0);
    writeln!(out, "#SAMPLESTART:{:.3};", sample_start)?;

    let sample_length = config.sample_length.as_deref()
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(10.0);
    writeln!(out, "#SAMPLELENGTH:{:.3};", sample_length)?;

    let selectable = config.selectable.as_deref().unwrap_or("YES");
    writeln!(out, "#SELECTABLE:{};", selectable)?;

    // ── BPMS ─────────────────────────────────────────────────
    let bpms = compute_bpms(beatmap, beat_shift);
    out.push_str("#BPMS:");
    for (i, &(b, bpm)) in bpms.iter().enumerate() {
        if i > 0 { out.push(','); }
        out.push_str(&format!("{:.3}={:.3}", b, bpm));
    }
    writeln!(out, ";")?;

    // ── STOPS ────────────────────────────────────────────────
    writeln!(out, "#STOPS:;")?;

    // ── BGCHANGES / FGCHANGES ────────────────────────────────
    writeln!(out, "#BGCHANGES:;")?;
    writeln!(out, "#FGCHANGES:;")?;

    // ── DISPLAYBPM ──────────────────────────────────────────
    if let Some(ref v) = config.display_bpm {
        writeln!(out, "#DISPLAYBPM:{};", escape(v))?;
    }

    // ── NOTES ────────────────────────────────────────────────
    let step_type = match beatmap.keys {
        4 => "dance-single",
        5 => "pump-single",
        6 => "dance-solo",
        7 => "kb7-single",
        8 => "dance-double",
        10 => "pump-double",
        _ => "dance-single",
    };

    let diff_name = if let Some(ref v) = config.subtitle {
        if v.is_empty() { &beatmap.difficulty_name } else { v }
    } else if beatmap.difficulty_name.is_empty() { "Converted" } else { &beatmap.difficulty_name };

    let meter = compute_meter(beatmap);
    writeln!(out, "#NOTES:")?;
    writeln!(out, "    {}:", step_type)?;
    writeln!(out, "    {}:", diff_name)?;
    writeln!(out, "    Challenge:")?;
    writeln!(out, "    {}:", meter)?;
    let radar = compute_radar_values(beatmap);
    writeln!(out, "    {:.3},{:.3},{:.3},{:.3},{:.3}:", radar.0, radar.1, radar.2, radar.3, radar.4)?;

    let measures = notes_to_measures(beatmap, beat_shift);
    out.push_str(&measures);
    writeln!(out, ";")?;

    Ok(out)
}

// ── helpers ─────────────────────────────────────────────────

fn escape(s: &str) -> String {
    s.replace(';', "\\;").replace('\n', " ").replace('\r', "")
}

fn compute_offset(beatmap: &Beatmap) -> f64 {
    // Returns the time (seconds) at which beat 0 occurs. We pull it back by
    // whole 4-beat measures until it is ≤ 0 so that notes placed before the
    // first timing point still land on non-negative beats.
    let first_tp = beatmap
        .timing_points
        .iter()
        .find(|tp| tp.uninherited && tp.beat_length > 0.0);

    if let Some(tp) = first_tp {
        let time = tp.time_ms;
        if time <= 0.0 {
            time / 1000.0
        } else {
            let measure_ms = tp.beat_length * 4.0;
            let n = (time / measure_ms).ceil();
            (time - n * measure_ms) / 1000.0
        }
    } else {
        let first_note = beatmap
            .notes
            .iter()
            .map(|n| n.time_ms)
            .fold(f64::MAX, f64::min);
        if first_note == f64::MAX || first_note == f64::INFINITY {
            0.0
        } else if first_note <= 0.0 {
            first_note / 1000.0
        } else {
            let measure_ms = 500.0 * 4.0; // 120 BPM fallback
            let n = (first_note / measure_ms).ceil();
            (first_note - n * measure_ms) / 1000.0
        }
    }
}

fn compute_bpms(beatmap: &Beatmap, beat_shift: f64) -> Vec<(f64, f64)> {
    let mut bpms = Vec::new();
    let tps = &beatmap.timing_points;

    if tps.is_empty() {
        return vec![(0.0, 120.0)];
    }

    for tp in tps {
        if tp.uninherited && tp.beat_length > 0.0 {
            let bpm = 60_000.0 / tp.beat_length;
            let beat = ms_to_beat(tp.time_ms, tps) + beat_shift;
            bpms.push((beat, bpm));
        }
    }

    if bpms.is_empty() {
        bpms.push((0.0, 120.0));
    }

    // force first BPM to beat 0 so Etterna has a defined tempo from the start
    if let Some(first) = bpms.first_mut() {
        first.0 = 0.0;
    }

    bpms
}

fn compute_radar_values(beatmap: &Beatmap) -> (f64, f64, f64, f64, f64) {
    let dur = beatmap.duration_ms / 1000.0;
    if dur <= 0.0 || beatmap.notes.is_empty() {
        return (0.0, 0.0, 0.0, 0.0, 0.0);
    }
    let taps = beatmap.notes.iter().filter(|n| !n.hold).count() as f64;

    let stream = (taps / dur / 12.0).clamp(0.0, 1.0);

    let mut time_counts: std::collections::HashMap<u64, usize> = std::collections::HashMap::new();
    for note in &beatmap.notes {
        *time_counts.entry((note.time_ms * 100.0) as u64).or_default() += 1;
    }
    let simultaneous: f64 = time_counts.values().filter(|&&c| c >= 2).count() as f64;
    let total_slots = time_counts.len() as f64;
    let voltage = if total_slots > 0.0 { (simultaneous / total_slots * 2.0).clamp(0.0, 1.0) } else { 0.0 };

    let hold_ms: f64 = beatmap.notes.iter()
        .filter_map(|n| n.hold_end_ms.map(|e| e - n.time_ms))
        .sum();
    let freeze = (hold_ms / beatmap.duration_ms).clamp(0.0, 1.0);

    let air = (1.0 - taps / dur / 8.0).clamp(0.0, 1.0);

    let chaos = ((stream + voltage + air + freeze) / 4.0).clamp(0.0, 1.0);

    (stream, voltage, air, freeze, chaos)
}

pub(crate) fn compute_meter(_beatmap: &Beatmap) -> u32 {
    1
}

// SM note grid: 48 slots per beat = 192 rows per measure (48th-note resolution).
// 192nd-note precision is too fine for most SM editors; 48th-note is the
// finest widely-supported quantization.
const SLOTS_PER_BEAT: i64 = 48;
const SLOTS_PER_MEASURE: i64 = SLOTS_PER_BEAT * 4;

/// Standard SM beat divisors - each represents N subdivisions of a beat.
/// Ordered coarsest-first so we can pick the finest one that aligns.
const SM_DIVISORS: [i64; 10] = [4, 8, 12, 16, 24, 32, 48, 64, 96, 192];

/// Snap a beat position to the nearest SM-standard beat fraction.
/// Finds the divisor (1/4, 1/8, … 1/192) whose snapped position is closest
/// to the original beat.  This guarantees every note lands on a grid line
/// that all SM editors can interpret.
fn snap_beat(beat: f64) -> f64 {
    let mut best = beat;
    let mut best_diff = f64::MAX;
    for &div in &SM_DIVISORS {
        let frac = 1.0 / div as f64;
        let snapped = (beat / frac).round() * frac;
        let diff = (beat - snapped).abs();
        if diff < best_diff {
            best_diff = diff;
            best = snapped;
        }
    }
    best
}

fn notes_to_measures(beatmap: &Beatmap, beat_shift: f64) -> String {
    if beatmap.notes.is_empty() {
        return "0000\n".to_string();
    }

    let keys = beatmap.keys as usize;
    let tps = &beatmap.timing_points;

    // Every note time is converted to one global beat position (across all
    // BPM changes), then snapped to the nearest standard SM beat subdivision,
    // and finally rounded to the nearest slot.
    let slot_of = |time_ms: f64| -> i64 {
        let beat = snap_beat(ms_to_beat(time_ms, tps) + beat_shift);
        (beat * SLOTS_PER_BEAT as f64).round() as i64
    };

    let end = beatmap.notes.iter()
        .map(|n| n.hold_end_ms.unwrap_or(n.time_ms))
        .fold(0.0, f64::max);
    let num_meas = ((slot_of(end) / SLOTS_PER_MEASURE) + 1).max(1) as usize;

    let mut grid: Vec<Vec<Vec<char>>> =
        vec![vec![vec!['0'; keys]; SLOTS_PER_MEASURE as usize]; num_meas];

    let mut place = |slot: i64, col: usize, ch: char| -> bool {
        if slot < 0 { return false; }
        let mi = (slot / SLOTS_PER_MEASURE) as usize;
        if mi >= num_meas { return false; }
        let si = (slot % SLOTS_PER_MEASURE) as usize;
        grid[mi][si][col] = ch;
        true
    };

    for note in &beatmap.notes {
        let col = note.column as usize;
        if col >= keys { continue; }
        let s = slot_of(note.time_ms);

        match note.hold_end_ms.filter(|_| note.hold) {
            Some(end_ms) => {
                let e = slot_of(end_ms);
                if e <= s {
                    // hold shorter than a slot - degrade to a tap
                    place(s, col, '1');
                } else if place(s, col, '2') {
                    place(e, col, '3');
                }
            }
            None => { place(s, col, '1'); }
        }
    }

    // Per measure, compress the slot grid down to the coarsest row count
    // that still holds every occupied slot.
    let mut out = String::new();
    for (i, measure) in grid.iter().enumerate() {
        let occupied: Vec<usize> = measure.iter().enumerate()
            .filter(|(_, row)| row.iter().any(|&c| c != '0'))
            .map(|(si, _)| si)
            .collect();

        let rows = [4usize, 8, 12, 16, 24, 32, 48, 64, 96, 192].iter()
            .copied()
            .find(|r| {
                let step = SLOTS_PER_MEASURE as usize / r;
                occupied.iter().all(|si| si % step == 0)
            })
            .unwrap_or(192);

        let step = SLOTS_PER_MEASURE as usize / rows;
        for ri in 0..rows {
            let line: String = measure[ri * step].iter().collect();
            out.push_str(&line);
            out.push('\n');
        }
        if i < num_meas - 1 {
            out.push_str(",\n");
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parsers::osu::parse_osu;

    fn test_config() -> ExportConfig {
        ExportConfig {
            global_timing_ms: 0.0,
            ..Default::default()
        }
    }

    #[test]
    fn test_rate_scaling_changes_output() {
        let osu = r#"osu file format v14

[General]
AudioFilename: audio.mp3
Mode: 3

[Metadata]
Title:Test Song
Artist:Test Artist
Creator:Mapper
Version:4K Normal
Source:

[Difficulty]
CircleSize:4

[TimingPoints]
0,500,4,0,0,100,1,0

[HitObjects]
64,192,1000,1,0,0:0:0:0:
192,192,2000,1,0,0:0:0:0:
320,192,3000,1,0,0:0:0:0:
448,192,4000,1,0,0:0:0:0:
"#;
        let mut bm = parse_osu(osu).unwrap();
        let cfg = test_config();
        // convert at 1x (no scaling)
        let sm_1x = crate::converters::osu_to_etterna::convert(&bm, &cfg).unwrap();
        // scale timing for 2x and convert
        crate::scale_timing_for_rate(&mut bm, 2.0);
        let sm_2x = crate::converters::osu_to_etterna::convert(&bm, &cfg).unwrap();

        // Re-parse and verify note times are earlier with 2x
        let reparsed_1x = crate::parsers::etterna::parse_sm(&sm_1x).unwrap();
        let reparsed_2x = crate::parsers::etterna::parse_sm(&sm_2x).unwrap();

        // All notes should be shifted earlier with 2x rate
        for (n1, n2) in reparsed_1x.notes.iter().zip(reparsed_2x.notes.iter()) {
            assert!(n2.time_ms < n1.time_ms,
                "rate 2x note should be earlier: 1x={}ms 2x={}ms", n1.time_ms, n2.time_ms);
            assert!((n2.time_ms - n1.time_ms / 2.0).abs() < 3.0,
                "2x note time should be ~half of 1x: 1x={}ms 2x={}ms", n1.time_ms, n2.time_ms);
        }

        // The total duration should be shorter with 2x
        let dur_1x = reparsed_1x.duration_ms;
        let dur_2x = reparsed_2x.duration_ms;
        assert!(dur_2x < dur_1x,
            "duration should be shorter with 2x: {} vs {}", dur_2x, dur_1x);
    }

    #[test]
    fn test_converter_output() {
        let osu = r#"osu file format v14

[General]
AudioFilename: audio.mp3
Mode: 3

[Metadata]
Title:Test Song
Artist:Test Artist
Creator:Mapper
Version:4K Normal
Source:

[Difficulty]
CircleSize:4

[TimingPoints]
0,500,4,0,0,100,1,0

[HitObjects]
64,192,1000,1,0,0:0:0:0:
192,192,1500,1,0,0:0:0:0:
320,192,2000,1,0,0:0:0:0:
448,192,2500,1,0,0:0:0:0:
64,192,3000,128,0,4500:0:0:0:0:
"#;
        let bm = parse_osu(osu).unwrap();
        assert_eq!(bm.notes.len(), 5);
        assert_eq!(bm.keys, 4);
        let cfg = test_config();
        let sm = convert(&bm, &cfg).unwrap();
        assert!(sm.contains("1"));   // contains tap notes
        assert!(sm.contains("2"));   // contains hold head
        assert!(sm.contains("3"));
        assert!(sm.contains("4K Normal"));
        assert!(sm.lines().any(|l| l.starts_with('1') || l.contains("1")), "no tap note row found");
        assert!(sm.lines().any(|l| l.starts_with('2')), "no hold head found");
        assert!(sm.lines().any(|l| l.starts_with('3')), "no hold tail found");
        println!("=== SM OUTPUT ===\n{}", sm);
    }

    #[test]
    fn test_roundtrip_osu_to_sm() {
        // parse .osu, convert to .sm, then re-parse the .sm
        let osu = r#"osu file format v14

[General]
AudioFilename: audio.mp3
Mode: 3

[Metadata]
Title:Test Song
Artist:Test Artist
Creator:Mapper
Version:4K Normal
Source:

[Difficulty]
CircleSize:4

[TimingPoints]
0,500,4,0,0,100,1,0

[HitObjects]
64,192,1000,1,0,0:0:0:0:
192,192,1500,1,0,0:0:0:0:
320,192,2000,1,0,0:0:0:0:
448,192,2500,1,0,0:0:0:0:
64,192,3000,128,0,4500:0:0:0:0:
"#;
        let bm = parse_osu(osu).unwrap();
        let cfg = test_config();
        let sm = convert(&bm, &cfg).unwrap();
        let reparsed = crate::parsers::etterna::parse_sm(&sm).unwrap();
        assert_eq!(reparsed.notes.len(), bm.notes.len(),
            "roundtrip note count mismatch: {} vs {}",
            reparsed.notes.len(), bm.notes.len());
        // BPM should match
        assert!((reparsed.timing_points[0].bpm() - 120.0).abs() < 1.0,
            "roundtrip bpm mismatch: {}", reparsed.timing_points[0].bpm());
    }

    #[test]
    fn test_roundtrip_notes_before_tp() {
        let osu = r#"osu file format v14

[General]
AudioFilename: audio.mp3
Mode: 3

[Metadata]
Title:Haunted
Artist:laura les
Creator:Mapper
Version:4K Hard
Source:

[Difficulty]
CircleSize:4

[TimingPoints]
752,388.6,4,0,0,100,1,0

[HitObjects]
64,192,169,1,0,0:0:0:0:
192,192,363,1,0,0:0:0:0:
320,192,557,1,0,0:0:0:0:
448,192,751,1,0,0:0:0:0:
64,192,945,1,0,0:0:0:0:
192,192,1139,1,0,0:0:0:0:
320,192,1333,1,0,0:0:0:0:
448,192,1527,1,0,0:0:0:0:
"#;
        let bm = parse_osu(osu).unwrap();
        let cfg = test_config();
        let sm = convert(&bm, &cfg).unwrap();
        let reparsed = crate::parsers::etterna::parse_sm(&sm).unwrap();
        assert_eq!(reparsed.notes.len(), bm.notes.len(),
            "roundtrip note count: {} vs {}", reparsed.notes.len(), bm.notes.len());
        assert!((reparsed.timing_points[0].bpm() - 154.4).abs() < 1.0,
            "roundtrip bpm: {}", reparsed.timing_points[0].bpm());
    }

    #[test]
    fn test_decoded_rows_do_not_collapse() {
        // Simulates the inoqx-decode scenario: first TP at 8706ms, BPM 220,
        // notes at 1/2 beat intervals. Snap should be 48 (finest), and
        // notes at different beat fractions must land on different rows.
        let osu = r#"osu file format v14

[General]
AudioFilename: audio.mp3
Mode: 3

[Metadata]
Title:decode test
Artist:inoqx
Creator:Jhown
Version:test
Source:

[Difficulty]
CircleSize:4

[TimingPoints]
8706,272.727272727273,4,1,0,30,1,0

[HitObjects]
448,192,8706,5,0,0:0:0:0:
192,192,8842,1,0,0:0:0:0:
64,192,8842,1,0,0:0:0:0:
320,192,8978,1,0,0:0:0:0:
192,192,9115,1,0,0:0:0:0:
"#;
        let bm = parse_osu(osu).unwrap();
        let cfg = test_config();
        let sm = convert(&bm, &cfg).unwrap();

        // The first note (col 3) should be row 0001, not 1111
        // The second group (col 1 + col 0) should be row 1100
        // Verify no row has notes in ALL four columns (that would mean collision)
        for line in sm.lines() {
            if line == "1111" {
                panic!("found phantom row 1111 - notes are collapsing into same row:\n{}", sm);
            }
        }

        // Verify the expected note rows appear (only counting note-data lines)
        let note_rows: Vec<&str> = sm.lines()
            .filter(|l| l.chars().all(|c| c == '0' || c == '1' || c == '2' || c == '3'))
            .filter(|l| l.contains('1') || l.contains('2') || l.contains('3'))
            .collect();
        assert!(note_rows.contains(&"0001"), "missing 0001 (col 3): {:?}", note_rows);
        assert!(note_rows.contains(&"1100"), "missing 1100 (col 0+1): {:?}", note_rows);
        assert!(note_rows.contains(&"0010"), "missing 0010 (col 2): {:?}", note_rows);
        assert!(note_rows.contains(&"0100"), "missing 0100 (col 1): {:?}", note_rows);
    }

    #[test]
    fn test_multi_bpm_roundtrip_keeps_note_times() {
        // Regression test for the "random notes spammed" bug: with more than
        // one BPM timing point, the old slot arithmetic wrapped notes from
        // later sections back into early measures. Notes here sit on 4ths,
        // 8ths and 16ths across a 120 → 150 BPM change at 4000ms.
        let osu = r#"osu file format v14

[General]
AudioFilename: audio.mp3
Mode: 3

[Metadata]
Title:Multi BPM
Artist:Test
Creator:Mapper
Version:4K
Source:

[Difficulty]
CircleSize:4

[TimingPoints]
0,500,4,0,0,100,1,0
4000,400,4,0,0,100,1,0

[HitObjects]
64,192,0,1,0,0:0:0:0:
192,192,250,1,0,0:0:0:0:
320,192,500,1,0,0:0:0:0:
448,192,1000,1,0,0:0:0:0:
64,192,1125,1,0,0:0:0:0:
192,192,2000,128,0,3000:0:0:0:0:
320,192,4000,1,0,0:0:0:0:
448,192,4200,1,0,0:0:0:0:
64,192,4400,1,0,0:0:0:0:
192,192,6000,1,0,0:0:0:0:
"#;
        let bm = parse_osu(osu).unwrap();
        let cfg = test_config();
        let sm = convert(&bm, &cfg).unwrap();
        let reparsed = crate::parsers::etterna::parse_sm(&sm).unwrap();

        assert_eq!(reparsed.notes.len(), bm.notes.len(),
            "note count changed in roundtrip: {} vs {}\n{}",
            reparsed.notes.len(), bm.notes.len(), sm);

        for (orig, rt) in bm.notes.iter().zip(reparsed.notes.iter()) {
            assert!((orig.time_ms - rt.time_ms).abs() < 3.0,
                "note drifted: {}ms -> {}ms\n{}", orig.time_ms, rt.time_ms, sm);
            assert_eq!(orig.column, rt.column, "column changed for note at {}ms", orig.time_ms);
        }

        let hold = reparsed.notes.iter().find(|n| n.hold).expect("hold lost in roundtrip");
        assert!((hold.time_ms - 2000.0).abs() < 3.0);
        assert!((hold.hold_end_ms.unwrap() - 3000.0).abs() < 3.0);
    }

    #[test]
    fn test_converter_with_notes_before_tp() {
        // Simulates the user's laura les - Haunted map:
        // first TP at 752ms, BPM 154.4, notes starting at 169ms
        let osu = r#"osu file format v14

[General]
AudioFilename: audio.mp3
Mode: 3

[Metadata]
Title:Haunted
Artist:laura les
Creator:Mapper
Version:4K Hard
Source:

[Difficulty]
CircleSize:4

[TimingPoints]
752,388.6,4,0,0,100,1,0

[HitObjects]
64,192,169,1,0,0:0:0:0:
192,192,363,1,0,0:0:0:0:
320,192,557,1,0,0:0:0:0:
448,192,751,1,0,0:0:0:0:
64,192,945,1,0,0:0:0:0:
192,192,1139,1,0,0:0:0:0:
320,192,1333,1,0,0:0:0:0:
448,192,1527,1,0,0:0:0:0:
"#;
        let bm = parse_osu(osu).unwrap();
        let cfg = test_config();
        let sm = convert(&bm, &cfg).unwrap();
        println!("=== SM OUTPUT (notes before TP) ===\n{}", sm);
        // BPMS check
        assert!(sm.contains("#BPMS:"), "BPMS line missing");
        assert!(sm.contains("0.000="), "first BPM should be at beat 0");
        // beat 0 sits before the audio start (negative time), and SM stores
        // OFFSET = -time_of_beat0, so the written OFFSET must be positive
        assert!(sm.contains("#OFFSET:0.802"), "expected OFFSET 0.802, got:\n{}", sm);
        // Notes count in the measures (at least 8 '1's for 8 tap notes)
        let note_count = sm.matches('1').count();
        assert!(note_count >= 8, "expected at least 8 notes, got {}", note_count);
        // No negative-beat overflow issues - all notes in measures
        assert!(!sm.contains(",,\n"), "no empty measures");
        assert!(!sm.contains(",0000\n"), "no empty measures");
    }

}


