use crate::models::beatmap::{Beatmap, ExportConfig};
use crate::models::timing::{snap_to_osu_grid, TimingPoint};
use anyhow::Result;

pub fn convert(beatmap: &Beatmap, config: &ExportConfig) -> Result<String> {
    let global_timing_ms = config.global_timing_ms;
    let mut output = String::new();

    output.push_str("osu file format v14\n\n");

    output.push_str("// Converted using \"https://github.com/kaanreal/henkan\"\n\n");

    output.push_str("[General]\n");
    output.push_str(&format!("AudioFilename: {}\n", beatmap.audio_filename));
    output.push_str(&format!("AudioLeadIn: {}\n", beatmap.lead_in_ms as u64));
    output.push_str("Mode: 3\n");
    output.push_str("Countdown: 0\n");
    output.push_str(&format!("PreviewTime: {}\n", beatmap.preview_time as i64));
    output.push('\n');

    output.push_str("[Editor]\n\n");

    output.push_str("[Metadata]\n");
    output.push_str(&format!("Title:{}\n", beatmap.title));
    output.push_str(&format!("TitleUnicode:{}\n", beatmap.title));
    output.push_str(&format!("Artist:{}\n", beatmap.artist));
    output.push_str(&format!("ArtistUnicode:{}\n", beatmap.artist));
    output.push_str(&format!("Creator:{}\n", beatmap.creator));
    output.push_str(&format!("Version:{}\n", beatmap.difficulty_name));
    output.push_str(&format!("Source:{}\n", beatmap.source));
    output.push_str(&format!("Tags:{}\n", beatmap.tags));
    output.push('\n');

    let cs = if config.circle_size == 0.0 { beatmap.keys as f64 } else { config.circle_size };
    let ar = if config.approach_rate == 0.0 { config.overall_difficulty } else { config.approach_rate };

    output.push_str("[Difficulty]\n");
    output.push_str(&format!("HPDrainRate:{}\n", config.hp_drain));
    output.push_str(&format!("CircleSize:{}\n", cs));
    output.push_str(&format!("OverallDifficulty:{}\n", config.overall_difficulty));
    output.push_str(&format!("ApproachRate:{}\n", ar));
    output.push_str("SliderMultiplier:1.4\n");
    output.push_str("SliderTickRate:1\n");
    output.push('\n');

    output.push_str("[Events]\n");
    output.push_str("//Background and Video events\n");
    // Export copies background to "bg.jpg" for both directions, so reference
    // that known name instead of the SM file's original name.
    if beatmap.background_filename.is_some() {
        output.push_str("0,0,\"bg.jpg\",0,0\n");
    }
    output.push_str("//Break Periods\n");
    output.push_str("//Storyboard Layer 0 (Background)\n");
    output.push_str("//Storyboard Layer 1 (Fail)\n");
    output.push_str("//Storyboard Layer 2 (Pass)\n");
    output.push_str("//Storyboard Layer 3 (Foreground)\n");
    output.push_str("//Storyboard Layer 4 (Overlay)\n");
    output.push_str("//Storyboard Sound Samples\n");
    output.push('\n');

    // Apply timing correction (shift earlier). Timing points must NOT be
    // clamped to 0 so the SM offset → beat relationship is preserved
    // (otherwise the osu! editor shows wrong snap grids).
    let shift_tp = |t: f64| t - global_timing_ms;
    let shift_note = |t: f64| (t - global_timing_ms).max(0.0);

    // Skip uninherited timing points with extremely short beat lengths (>6000 BPM).
    // Etterna charts sometimes use absurdly high BPM values as micro-segments
    // (e.g. 27469 BPM for 4 beats ≈ 8ms). These create meaningless timing
    // segments in osu and should be omitted. Notes are still timestamped
    // correctly because build_timing used the full BPM list.
    let is_extreme = |tp: &TimingPoint| {
        tp.uninherited && tp.beat_length > 0.0 && tp.beat_length < 10.0
    };

    output.push_str("[TimingPoints]\n");

    // collect BPM points and SV (inherited) points, then emit them in one
    // time-sorted list - osu expects [TimingPoints] in chronological order,
    // with the uninherited point first when both share a timestamp
    let mut lines: Vec<(f64, u8, String)> = Vec::new();

    for tp in &beatmap.timing_points {
        if is_extreme(tp) {
            continue;
        }
        // Round to 12 decimal places to match osu! editor's output precision.
        // At this magnitude f64 has enough precision for 12 digits, and osu!
        // parses the timing point string back to f64 using the same number of
        // digits - producing the exact same internal value used for grid math.
        let raw = if tp.beat_length > 0.0 { tp.beat_length } else { -100.0 };
        let beat_length = (raw * 1e12).round() / 1e12;
        let t = shift_tp(tp.time_ms);
        lines.push((
            t,
            if tp.uninherited { 0 } else { 1 },
            format!(
                "{},{:.12},{},{},{},{},{},{}",
                t.round() as i64,
                beat_length,
                tp.meter,
                0,
                0,
                100,
                if tp.uninherited { 1 } else { 0 },
                0
            ),
        ));
    }

    for sv in &beatmap.sv_events {
        if sv.multiplier <= 0.0 {
            continue;
        }
        let sv_raw = -100.0 / sv.multiplier;
        let sv_beat_length = (sv_raw * 1e12).round() / 1e12;
        let t = shift_tp(sv.time_ms);
        lines.push((
            t,
            1,
            format!("{},{:.12},{},{},{},{},{},{}", t.round() as i64, sv_beat_length, 4, 0, 0, 100, 0, 0),
        ));
    }

    lines.sort_by(|a, b| {
        a.0.partial_cmp(&b.0)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(a.1.cmp(&b.1))
    });
    for (_, _, line) in &lines {
        output.push_str(line);
        output.push('\n');
    }

    output.push('\n');

    output.push_str("[HitObjects]\n");

    let osu_tps: Vec<TimingPoint> = beatmap
        .timing_points
        .iter()
        .filter(|tp| !is_extreme(tp))
        .map(|tp| TimingPoint {
            time_ms: shift_tp(tp.time_ms).round(),
            // Round to 12 decimal places so snap_to_osu_grid uses the same
            // beat_length that osu! will parse from the timing point string.
            beat_length: (tp.beat_length * 1e12).round() / 1e12,
            meter: tp.meter,
            uninherited: tp.uninherited,
        })
        .collect();

    for note in &beatmap.notes {
        let x = ((note.column as f64 + 0.5) / beatmap.keys as f64 * 512.0) as u32;
        let shifted = shift_note(note.time_ms);
        let time = snap_to_osu_grid(shifted, &osu_tps).max(0.0) as u64;

        if note.hold {
            let end_shifted = shift_note(note.hold_end_ms.unwrap_or(note.time_ms + 1000.0));
            let end_time = snap_to_osu_grid(end_shifted, &osu_tps).max(0.0) as u64;
            output.push_str(&format!(
                "{},{},{},128,0,{}:0:0:0:0:0\n",
                x, 192, time, end_time
            ));
        } else {
            output.push_str(&format!("{},{},{},1,0,0:0,0,0,0,0\n", x, 192, time));
        }
    }

    Ok(output)
}
