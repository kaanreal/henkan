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
