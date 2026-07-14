use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct TimingPoint {
    pub time_ms: f64,
    pub beat_length: f64,
    pub meter: u32,
    pub uninherited: bool,
}

impl TimingPoint {
    #[cfg(test)]
    pub fn bpm(&self) -> f64 {
        if self.uninherited && self.beat_length > 0.0 {
            60_000.0 / self.beat_length
        } else {
            0.0
        }
    }

    pub fn sv_multiplier(&self) -> f64 {
        if !self.uninherited && self.beat_length < 0.0 {
            -100.0 / self.beat_length
        } else {
            1.0
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct SVEvent {
    pub time_ms: f64,
    pub multiplier: f64,
}

/// Convert a time in milliseconds to a beat position using the given timing points.
/// Only uninherited (BPM) timing points are used.
pub fn ms_to_beat(time_ms: f64, tps: &[TimingPoint]) -> f64 {
    let relevant: Vec<&TimingPoint> = tps.iter().filter(|tp| tp.uninherited && tp.beat_length > 0.0).collect();
    if relevant.is_empty() {
        return time_ms / 500.0;
    }

    if time_ms <= relevant[0].time_ms {
        let bpm = 60_000.0 / relevant[0].beat_length;
        return (time_ms - relevant[0].time_ms) * bpm / 60_000.0;
    }

    let mut beat = 0.0;
    for i in 0..relevant.len() - 1 {
        let cur = relevant[i];
        let next = relevant[i + 1];
        if time_ms <= next.time_ms {
            let dt = time_ms - cur.time_ms;
            beat += dt / cur.beat_length;
            return beat;
        }
        let dt = next.time_ms - cur.time_ms;
        beat += dt / cur.beat_length;
    }

    let last = relevant[relevant.len() - 1];
    let dt = time_ms - last.time_ms;
    beat += dt / last.beat_length;
    beat
}

/// Convert a beat position back to a time in milliseconds using the given timing points.
/// Only uninherited (BPM) timing points are used.
pub fn beat_to_ms(beat: f64, tps: &[TimingPoint]) -> f64 {
    let relevant: Vec<&TimingPoint> = tps.iter().filter(|tp| tp.uninherited && tp.beat_length > 0.0).collect();
    if relevant.is_empty() {
        return beat * 500.0;
    }

    let mut time = relevant[0].time_ms;
    let mut prev_beat = 0.0;

    for i in 0..relevant.len() {
        let cur = relevant[i];
        let seg_end_beat = if i + 1 < relevant.len() {
            let next = relevant[i + 1];
            prev_beat + (next.time_ms - cur.time_ms) / cur.beat_length
        } else {
            f64::INFINITY
        };

        if beat <= seg_end_beat {
            let beat_diff = beat - prev_beat;
            time += beat_diff * cur.beat_length;
            return time;
        }

        let beat_diff = seg_end_beat - prev_beat;
        time += beat_diff * cur.beat_length;
        prev_beat = seg_end_beat;
    }

    time
}

/// Snap a time in milliseconds to the nearest beat division.
/// `snap_division` is the fraction of a beat to snap to (e.g. 1.0/4 for 1/4th notes, 1.0/16 for 1/16th).
pub fn snap_time(time_ms: f64, tps: &[TimingPoint], snap_division: f64) -> f64 {
    let beat = ms_to_beat(time_ms, tps);
    let snapped_beat = (beat / snap_division).round() * snap_division;
    beat_to_ms(snapped_beat, tps)
}

/// Snap a time to the nearest 1/192th beat (768 rows per measure), matching SM resolution.
pub fn snap_time_ms(time_ms: f64, tps: &[TimingPoint]) -> f64 {
    snap_time(time_ms, tps, 1.0 / 192.0)
}

/// Snap a time to the nearest osu! beat grid position.
/// Tries all 11 editor-supported divisors (1/1 through 1/16) and picks the closest.
pub fn snap_to_osu_grid(time_ms: f64, tps: &[TimingPoint]) -> f64 {
    let beat = ms_to_beat(time_ms, tps);
    let divisors = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 12.0, 16.0];

    let mut best_snapped = beat;
    let mut best_error = f64::INFINITY;

    for &d in &divisors {
        let snapped = (beat * d).round() / d;
        let error = (beat - snapped).abs();
        if error < best_error {
            best_error = error;
            best_snapped = snapped;
        }
    }

    beat_to_ms(best_snapped, tps)
}
