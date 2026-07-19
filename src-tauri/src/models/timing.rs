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
/// Returns an integer millisecond value that sits on or before a valid grid
/// line for one of the editor-supported divisors that AIMod checks:
/// 1/1, 1/2, 1/3, 1/4, 1/6, 1/8, 1/12, 1/16.
///
/// Uses floor (not round) when converting the floating-point grid position to
/// an integer.  Stable's AIMod determines the "practical unsnap" via
/// `(int)` truncation, which means a note placed *before* its grid line
/// always scores 0 ms unsnap, while a note placed *after* scores +1 ms.
/// Flooring guarantees every note lands at or before its grid line, keeping
/// the practical unsnap at 0 for all divisors.
pub fn snap_to_osu_grid(time_ms: f64, tps: &[TimingPoint]) -> f64 {
    let beat = ms_to_beat(time_ms, tps);
    let divisors = [1.0, 2.0, 3.0, 4.0, 6.0, 8.0, 12.0, 16.0];

    let mut best_time = time_ms.floor();
    let mut best_error = f64::INFINITY;

    for &d in &divisors {
        let snapped_beat = (beat * d).round() / d;
        let snapped_ms = beat_to_ms(snapped_beat, tps);
        let floored_ms = snapped_ms.floor();
        let error = (time_ms - floored_ms).abs();
        if error < best_error {
            best_error = error;
            best_time = floored_ms;
        }
    }

    best_time.max(0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tp(bpm: f64) -> TimingPoint {
        TimingPoint {
            time_ms: 0.0,
            beat_length: 60_000.0 / bpm,
            meter: 4,
            uninherited: true,
        }
    }

    fn tp_at(bpm: f64, time_ms: f64) -> TimingPoint {
        TimingPoint {
            time_ms,
            beat_length: 60_000.0 / bpm,
            meter: 4,
            uninherited: true,
        }
    }

    /// Check whether `time_ms` sits on a valid osu! grid line relative to `tp`.
    /// Returns the minimum distance (in ms) to any of the 11 standard grid lines.
    fn min_grid_error(time_ms: f64, tp: &TimingPoint) -> f64 {
        let divisors = [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 16];
        let mut best = f64::INFINITY;
        for &d in &divisors {
            let spacing = tp.beat_length / d as f64;
            let offset = time_ms - tp.time_ms;
            let n = (offset / spacing).round();
            let grid_line = tp.time_ms + n * spacing;
            let err = (time_ms - grid_line).abs();
            if err < best {
                best = err;
            }
        }
        best
    }

    #[test]
    fn snap_returns_integer() {
        let tps = [tp(120.0)];
        for beat_div in 1..=16 {
            for n in 0..20 {
                let beat = n as f64 / beat_div as f64;
                let time = beat_to_ms(beat, &tps);
                let snapped = snap_to_osu_grid(time, &tps);
                assert_eq!(snapped, snapped.round(), "beat {beat} at 120bpm");
            }
        }
    }

    #[test]
    fn snap_120bpm_common_divisors() {
        let tps = [tp(120.0)];
        for d in [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 16] {
            let beat = 1.0 / d as f64;
            let time = beat_to_ms(beat, &tps);
            let snapped = snap_to_osu_grid(time, &tps);
            let err = min_grid_error(snapped, &tps[0]);
            assert!(
                err < 1.0,
                "1/{d} at 120bpm: snapped to {snapped}ms, grid error {err}ms"
            );
        }
    }

    #[test]
    fn snap_ugly_bpms() {
        for bpm in [133.333, 187.5, 191.0, 193.0, 197.0, 199.0, 222.22] {
            let tps = [tp(bpm)];
            for d in [1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 16] {
                let beat = 1.0 / d as f64;
                let time = beat_to_ms(beat, &tps);
                let snapped = snap_to_osu_grid(time, &tps);
                let err = min_grid_error(snapped, &tps[0]);
                assert!(
                    err < 1.0,
                    "1/{d} at {bpm}bpm: snapped to {snapped}ms, grid error {err}ms"
                );
            }
        }
    }

    #[test]
    fn snap_with_offset() {
        let tps = [tp_at(120.0, 333.0)];
        for d in [1, 2, 3, 4, 8, 16] {
            let beat = 1.0 / d as f64;
            let time = beat_to_ms(beat, &tps);
            let snapped = snap_to_osu_grid(time, &tps);
            let err = min_grid_error(snapped, &tps[0]);
            assert!(
                err < 1.0,
                "1/{d} at 120bpm offset 333ms: snapped to {snapped}ms, grid error {err}ms"
            );
        }
    }

    #[test]
    fn snap_after_bpm_change() {
        let tps = [tp_at(120.0, 0.0), tp_at(180.0, 2000.0)];
        for d in [1, 2, 3, 4, 8, 16] {
            let beat = 4.0 + 1.0 / d as f64;
            let time = beat_to_ms(beat, &tps);
            let snapped = snap_to_osu_grid(time, &tps);
            let err = min_grid_error(snapped, &tps[1]);
            assert!(
                err < 1.0,
                "1/{d} after bpm change: snapped to {snapped}ms, grid error {err}ms"
            );
        }
    }

    #[test]
    fn snap_prefers_floor_for_non_integer_grid() {
        let tps = [tp(120.0)];
        let time = 166.666;
        let snapped = snap_to_osu_grid(time, &tps);
        assert_eq!(snapped, 166.0, "should floor to keep note before grid line");
    }

    #[test]
    fn snap_never_returns_negative() {
        let tps = [tp_at(120.0, 333.0)];
        let snapped = snap_to_osu_grid(1.0, &tps);
        assert!(snapped >= 0.0);
    }
}
