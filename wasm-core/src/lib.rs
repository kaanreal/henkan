mod models;
mod parsers;
mod converters;

use models::beatmap::{Beatmap, ExportConfig};

fn apply_rate_scaling(bm: &mut Beatmap, rate: f64) {
    if (rate - 1.0).abs() < f64::EPSILON {
        return;
    }
    let inv = 1.0 / rate;
    for tp in &mut bm.timing_points {
        tp.time_ms *= inv;
        if tp.uninherited && tp.beat_length > 0.0 {
            tp.beat_length *= inv;
        }
    }
    for note in &mut bm.notes {
        note.time_ms *= inv;
        if let Some(ref mut end) = note.hold_end_ms {
            *end *= inv;
        }
    }
    bm.preview_time *= inv;
    bm.lead_in_ms *= inv;
    bm.duration_ms = bm
        .notes
        .iter()
        .map(|n| n.hold_end_ms.unwrap_or(n.time_ms))
        .fold(0.0, f64::max);
}

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn convert_etterna_to_osu(beatmap_json: &str, config_json: &str) -> Result<String, JsValue> {
    let beatmap: Beatmap =
        serde_json::from_str(beatmap_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let config: ExportConfig =
        serde_json::from_str(config_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    converters::etterna_to_osu::convert(&beatmap, &config)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn convert_osu_to_etterna(
    beatmap_json: &str,
    global_timing_ms: f64,
    chart_description: &str,
) -> Result<String, JsValue> {
    let mut beatmap: Beatmap =
        serde_json::from_str(beatmap_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    let config = ExportConfig {
        global_timing_ms,
        subtitle: if chart_description.is_empty() {
            None
        } else {
            Some(chart_description.to_string())
        },
        ..Default::default()
    };
    converters::osu_to_etterna::convert(&mut beatmap, &config)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn parse_osu_content(content: &str) -> Result<String, JsValue> {
    let beatmap =
        parsers::osu::parse_osu(content).map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_json::to_string(&beatmap).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn parse_sm_all_difficulties(content: &str) -> Result<String, JsValue> {
    let beatmaps = parsers::etterna::parse_sm_all(content)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_json::to_string(&beatmaps).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn parse_sm_content(content: &str) -> Result<String, JsValue> {
    let beatmap =
        parsers::etterna::parse_sm(content).map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_json::to_string(&beatmap).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn parse_sm_difficulty(content: &str, index: u32) -> Result<String, JsValue> {
    let beatmap = parsers::etterna::parse_sm_difficulty(content, index as usize)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    serde_json::to_string(&beatmap).map_err(|e| JsValue::from_str(&e.to_string()))
}

#[wasm_bindgen]
pub fn rate_label_text(rate: f64) -> Option<String> {
    if (rate - 1.0).abs() < f64::EPSILON {
        None
    } else {
        Some(format!("{}x", rate))
    }
}

#[wasm_bindgen]
pub fn scale_timing_for_rate(beatmap_json: &str, rate: f64) -> Result<String, JsValue> {
    let mut beatmap: Beatmap =
        serde_json::from_str(beatmap_json).map_err(|e| JsValue::from_str(&e.to_string()))?;
    apply_rate_scaling(&mut beatmap, rate);
    serde_json::to_string(&beatmap).map_err(|e| JsValue::from_str(&e.to_string()))
}
