mod converters;
mod models;
mod parsers;

/// Public API exposed for integration tests.
pub use parsers::etterna::parse_sm;
pub use parsers::osu::parse_osu;
pub use models::beatmap::Beatmap;

use models::beatmap::{DiffInfo, ExportConfig, PackEntry, SourceFormat};
use std::fs;
use std::io::Read;
use ureq::ResponseExt;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use tauri::Manager;
use tauri_plugin_aptabase::EventTracker;

// ── .osz extraction ──────────────────────────────────────────

type OszResult = (Beatmap, Vec<(String, String)>, String);

fn extract_osz_all(path: &str) -> Result<OszResult, String> {
    let file = fs::File::open(path).map_err(|e| format!("Failed to open .osz: {}", e))?;
    let mut archive =
        zip::ZipArchive::new(file).map_err(|e| format!("Invalid .osz (corrupt zip): {}", e))?;

    let tmp = std::env::temp_dir().join("henkan").join(
        Path::new(path)
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string(),
    );
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).map_err(|e| format!("Failed to create temp dir: {}", e))?;

    let mut osu_entries: Vec<(String, String)> = Vec::new(); // (filename, content)

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| format!("Zip error: {}", e))?;
        let name = entry.name().to_string();
        let lower = name.to_lowercase();

        if lower.ends_with(".osu") {
            let mut buf = Vec::new();
            entry
                .read_to_end(&mut buf)
                .map_err(|e| format!("Error reading {}: {}", name, e))?;
            let text = String::from_utf8(buf).map_err(|_| "Non-UTF8 in .osu".to_string())?;
            osu_entries.push((name, text));
        } else if lower.ends_with(".mp3")
            || lower.ends_with(".ogg")
            || lower.ends_with(".wav")
            || lower.ends_with(".jpg")
            || lower.ends_with(".jpeg")
            || lower.ends_with(".png")
            || lower.ends_with(".gif")
        {
            let target = tmp.join(&name);
            if let Some(parent) = target.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let mut out =
                fs::File::create(&target).map_err(|e| format!("Failed to extract {}: {}", name, e))?;
            let mut buf = Vec::new();
            entry
                .read_to_end(&mut buf)
                .map_err(|e| format!("Error reading {}: {}", name, e))?;
                std::io::Write::write_all(&mut out, &buf)
                    .map_err(|e| format!("Error writing {}: {}", name, e))?;
        }
    }

    if osu_entries.is_empty() {
        return Err("No .osu file found in .osz".to_string());
    }

    // Parse all entries, sort by note density (easiest first) to match SM meter ordering
    let mut parsed: Vec<(String, String, Beatmap)> = Vec::with_capacity(osu_entries.len());
    for (fname, text) in &osu_entries {
        if let Ok(bm) = parsers::osu::parse_osu(text) {
            parsed.push((fname.clone(), text.clone(), bm));
        }
    }
    if parsed.is_empty() {
        return Err("Failed to parse any .osu file in .osz".to_string());
    }
    parsed.sort_by(|a, b| {
        let a_meter = converters::osu_to_etterna::compute_meter(&a.2);
        let b_meter = converters::osu_to_etterna::compute_meter(&b.2);
        a_meter.cmp(&b_meter)
    });

    let mut beatmap = parsed[0].2.clone();
    beatmap.source_dir = tmp.to_string_lossy().to_string();

    // Rebuild osu_entries in sorted order for select_difficulty lookups
    let sorted_entries: Vec<(String, String)> = parsed.iter().map(|p| (p.0.clone(), p.1.clone())).collect();

    // Collect all difficulties (1:1 with sorted_entries)
    let diffs: Vec<DiffInfo> = parsed.iter().map(|p| DiffInfo {
        name: p.2.difficulty_name.clone(),
        keys: p.2.keys,
        note_count: p.2.notes.len(),
        audio_filename: Some(p.2.audio_filename.clone()),
    }).collect();

    beatmap.available_difficulties = diffs;
    beatmap.source_file = path.to_string();

    beatmap.compute_duration();
    Ok((beatmap, sorted_entries, tmp.to_string_lossy().to_string()))
}

#[tauri::command]
fn select_difficulty(path: String, index: usize) -> Result<Beatmap, String> {
    let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();

    match ext.as_str() {
        "sm" => {
            let content =
                fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;
            let dir = Path::new(&path)
                .parent()
                .unwrap_or(Path::new(""))
                .to_string_lossy()
                .to_string();
            let mut beatmap = parsers::etterna::parse_sm_difficulty(&content, index)
                .map_err(|e| format!("Parse error: {}", e))?;
            beatmap.source_dir = dir;
            beatmap.source_file = path.clone();
            beatmap.compute_duration();
            Ok(beatmap)
        }
        "osz" => {
            let (mut beatmap, entries, tmp_dir) = extract_osz_all(&path)?;
            if index >= entries.len() {
                return Err(format!(
                    "Difficulty index {} out of range (0..{})",
                    index,
                    entries.len()
                ));
            }
            let (fname, text) = &entries[index];
            let new_bm = parsers::osu::parse_osu(text)
                .map_err(|e| format!("Parse error in {}: {}", fname, e))?;
            beatmap.creator = new_bm.creator;
            beatmap.title = new_bm.title;
            beatmap.artist = new_bm.artist;
            beatmap.difficulty_name = new_bm.difficulty_name;
            beatmap.keys = new_bm.keys;
            beatmap.notes = new_bm.notes;
            beatmap.timing_points = new_bm.timing_points;
            beatmap.sv_events = new_bm.sv_events;
            beatmap.preview_time = new_bm.preview_time;
            beatmap.lead_in_ms = new_bm.lead_in_ms;
            beatmap.audio_filename = new_bm.audio_filename;
            beatmap.background_filename = new_bm.background_filename.clone();
            beatmap.banner_filename = new_bm.banner_filename.clone();
            beatmap.source_dir = tmp_dir;
            beatmap.source_file = path;
            beatmap.compute_duration();
            Ok(beatmap)
        }
        "osu" => {
            let content =
                fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;
            let dir = Path::new(&path)
                .parent()
                .unwrap_or(Path::new(""))
                .to_string_lossy()
                .to_string();
            let mut beatmap = parsers::osu::parse_osu(&content)
                .map_err(|e| format!("Parse error: {}", e))?;
            beatmap.source_dir = dir;
            beatmap.source_file = path;
            beatmap.compute_duration();
            Ok(beatmap)
        }
        _ => Err("Unsupported file format".to_string()),
    }
}

#[tauri::command]
fn parse_file(path: String, direction: String) -> Result<Beatmap, String> {
    let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();

    match (direction.as_str(), ext.as_str()) {
        ("osu-to-etterna", "osu" | "osz") => {}
        ("etterna-to-osu", "sm") => {}
        ("osu-to-etterna", _) => {
            return Err(
                "In osu!mania → StepMania mode, only .osu and .osz files are accepted."
                    .to_string(),
            );
        }
        ("etterna-to-osu", _) => {
            return Err(
                "In StepMania → osu!mania mode, only .sm files are accepted."
                    .to_string(),
            );
        }
        _ => return Err("Unsupported file format".to_string()),
    }

    match ext.as_str() {
        "osz" => {
            let (bm, _entries, _tmp_dir) = extract_osz_all(&path)?;
            Ok(bm)
        }
        "osu" => {
            let content =
                fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;
            let dir = Path::new(&path)
                .parent()
                .unwrap_or(Path::new(""))
                .to_string_lossy()
                .to_string();
            let mut beatmap = parsers::osu::parse_osu(&content)
                .map_err(|e| format!("Parse error: {}", e))?;
            beatmap.source_dir = dir;
            beatmap.source_file = path.clone();
            beatmap.available_difficulties.push(DiffInfo {
                name: beatmap.difficulty_name.clone(),
                keys: beatmap.keys,
                note_count: beatmap.notes.len(),
                audio_filename: Some(beatmap.audio_filename.clone()),
            });
            beatmap.compute_duration();
            Ok(beatmap)
        }
        "sm" => {
            let content =
                fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;
            let dir = Path::new(&path)
                .parent()
                .unwrap_or(Path::new(""))
                .to_string_lossy()
                .to_string();
            let mut beatmap = parsers::etterna::parse_sm(&content)
                .map_err(|e| format!("Parse error: {}", e))?;
            beatmap.source_dir = dir;
            beatmap.source_file = path.clone();
            beatmap.compute_duration();
            Ok(beatmap)
        }
        _ => Err("Unsupported file format".to_string()),
    }
}

#[tauri::command]
fn resolve_file(source_dir: String, filename: String) -> Result<String, String> {
    let found = resolve_media_file(&source_dir, &filename, &[".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);
    match found {
        Some(p) => p.canonicalize()
            .map(|p| p.to_string_lossy().to_string())
            .map_err(|_| format!("File not found: {}", filename)),
        None => Err(format!("File not found: {} (looked in {})", filename, source_dir)),
    }
}

/// Try to find a media file by exact match, then alternate extensions, then case-insensitive,
/// then heuristic scan for plausible files.
fn resolve_media_file(source_dir: &str, filename: &str, alt_extensions: &[&str]) -> Option<PathBuf> {
    if filename.is_empty() {
        return scan_source_dir_for_bg(source_dir);
    }

    // 1. Exact match in source dir
    let exact = Path::new(source_dir).join(filename);
    if exact.exists() { return Some(exact); }

    // 2. Exact match relative to CWD
    let cwd = PathBuf::from(filename);
    if cwd.exists() { return Some(cwd); }

    let path = Path::new(filename);
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or(filename);

    // 3. Try alternative extensions
    for ext in alt_extensions {
        let candidate = Path::new(source_dir).join(format!("{}{}", stem, ext));
        if candidate.exists() { return Some(candidate); }
    }

    // 4. Case-insensitive scan of source dir
    if let Ok(entries) = fs::read_dir(source_dir) {
        let lower = filename.to_lowercase();
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if name.to_lowercase() == lower {
                    return Some(entry.path());
                }
            }
        }
    }

    // 5. Scan for any plausible image when the exact name doesn't exist.
    //    Filters out CD titles and banners, then prefers files with "bg"/"background"
    //    in the name; otherwise picks the largest remaining image.
    if alt_extensions.iter().any(|e| IMAGE_EXTS.contains(e)) {
        return scan_source_dir_for_bg(source_dir);
    }

    None
}

/// Scan source_dir for plausible background images, preferring files named
/// "bg"/"background" and falling back to the largest remaining image.
fn scan_source_dir_for_bg(source_dir: &str) -> Option<PathBuf> {
    if let Ok(entries) = fs::read_dir(source_dir) {
        let mut candidates: Vec<(u64, PathBuf)> = Vec::new();
        for entry in entries.flatten() {
            let p = entry.path();
            if !p.is_file() { continue; }
            let ext = p.extension().and_then(|e| e.to_str().map(|s| s.to_lowercase())).unwrap_or_default();
            if !IMAGE_EXTS.contains(&format!(".{}", ext).as_str()) { continue; }
            let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
            // Skip files that are clearly not backgrounds (CD titles, banners)
            if stem.contains("cdtitle") || stem == "cd" || stem == "bn" || stem == "banner" { continue; }
            // Prefer files with "bg" or "background" in the name
            if stem.contains("bg") || stem.contains("background") {
                return Some(p);
            }
            if let Ok(meta) = p.metadata() {
                candidates.push((meta.len(), p));
            }
        }
        // No file matched "bg"/"background" – pick the largest remaining
        if let Some((_, biggest)) = candidates.into_iter().max_by_key(|(size, _)| *size) {
            return Some(biggest);
        }
    }
    None
}

const IMAGE_EXTS: &[&str] = &[".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tiff", ".tif"];

const DEFAULT_CDTITLE: &[u8] = include_bytes!("../assets/cdtitle_default.png");

/// Try to fetch the osu! avatar for a given creator name.
/// Falls back to None on any error (network, no user, etc.).
fn fetch_mapper_avatar(creator: &str) -> Option<Vec<u8>> {
    // Resolve username → user_id by following the osu! profile redirect
    let profile_url = format!("https://osu.ppy.sh/users/{}", creator);
    let resp = ureq::get(&profile_url)
        .header("User-Agent", "henkan/1.0")
        .call()
        .ok()?;
    let final_url = resp.get_uri().to_string();
    drop(resp);

    let user_id = final_url
        .strip_prefix("https://osu.ppy.sh/users/")
        .or_else(|| final_url.strip_prefix("https://old.ppy.sh/users/"))
        .and_then(|rest| rest.split('/').next())
        .and_then(|s| s.parse::<u64>().ok())?;

    let avatar_url = format!("https://a.ppy.sh/{}", user_id);
    let avatar_resp = ureq::get(&avatar_url)
        .header("User-Agent", "henkan/1.0")
        .call()
        .ok()?;
    if avatar_resp.status() != 200 {
        return None;
    }
    let content_type = avatar_resp.headers().get("Content-Type")
        .and_then(|v| v.to_str().ok())?;
    if !content_type.starts_with("image/") {
        return None;
    }
    let mut buf = Vec::new();
    avatar_resp.into_body().as_reader().read_to_end(&mut buf).ok()?;
    Some(buf)
}

fn rate_label(rate: f64) -> Option<String> {
    if (rate - 1.0).abs() < f64::EPSILON { return None; }
    let s = format!("{:.2}", rate);
    let trimmed = s.trim_end_matches('0').trim_end_matches('.');
    Some(format!("[{}x]", trimmed))
}

pub(crate) fn scale_timing_for_rate(bm: &mut Beatmap, rate: f64) {
    if (rate - 1.0).abs() < f64::EPSILON { return; }
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
    bm.duration_ms = bm.notes.iter()
        .map(|n| n.hold_end_ms.unwrap_or(n.time_ms))
        .fold(0.0, f64::max);
}

#[tauri::command]
fn convert_beatmap(
    mut beatmap: Beatmap,
    config: ExportConfig,
) -> Result<String, String> {
    // Apply config overrides so user edits (mapper, title, etc.) are reflected
    beatmap.title = config.title.clone();
    beatmap.artist = config.artist.clone();
    if !config.creator.is_empty() { beatmap.creator = config.creator.clone(); }
    beatmap.difficulty_name = config.difficulty_name.clone();
    if let Some(label) = rate_label(config.conversion_rate) {
        beatmap.difficulty_name.push(' ');
        beatmap.difficulty_name.push_str(&label);
    }
    beatmap.source = config.source.clone();
    beatmap.tags = config.tags.clone();
    beatmap.audio_filename = config.audio_filename.clone();
    beatmap.background_filename = config.background_filename.clone();
    beatmap.banner_filename = config.banner_filename.clone();
    beatmap.cdtitle_filename = config.cdtitle_filename.clone();
    beatmap.preview_time = config.preview_time;

    scale_timing_for_rate(&mut beatmap, config.conversion_rate);

    match beatmap.source_format {
        SourceFormat::OsuMania => {
            converters::osu_to_etterna::convert(&beatmap, config.global_timing_ms, &config.creator)
                .map_err(|e| format!("Conversion error: {}", e))
        }
        SourceFormat::Etterna => {
            converters::etterna_to_osu::convert(&beatmap, &config)
                .map_err(|e| format!("Conversion error: {}", e))
        }
    }
}

fn read_file_bytes(source_dir: &str, filename: &str) -> Result<(Vec<u8>, String), String> {
    let resolved = resolve_media_file(source_dir, filename, &[".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".mp3", ".ogg", ".wav", ".flac", ".m4a"])
        .ok_or_else(|| format!("File not found: {} (looked in {})", filename, source_dir))?;
    let bytes = fs::read(&resolved).map_err(|e| format!("Failed to read {}: {}", filename, e))?;
    let ext = resolved
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin")
        .to_lowercase();
    Ok((bytes, ext))
}

fn find_ffmpeg() -> Option<PathBuf> {
    // Check PATH first (works on all platforms)
    if std::process::Command::new("ffmpeg").arg("-version").output().is_ok() {
        return Some(PathBuf::from("ffmpeg"));
    }
    // Development: in src-tauri/binaries/
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries");
    let target_triple = std::env::consts::ARCH.to_string() + "-" + std::env::consts::OS;
    let sidecar_name = format!("ffmpeg-{}", target_triple);
    // Try with .exe extension on Windows
    let candidate = if cfg!(target_os = "windows") {
        manifest.join(format!("{}.exe", sidecar_name))
    } else {
        manifest.join(&sidecar_name)
    };
    if candidate.exists() {
        return Some(candidate);
    }
    // Try unadorned name
    let plain = manifest.join("ffmpeg");
    if plain.exists() {
        return Some(plain);
    }
    // Production: alongside executable (sidecar placement)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let prod = if cfg!(target_os = "windows") {
                dir.join(format!("{}.exe", sidecar_name))
            } else {
                dir.join(&sidecar_name)
            };
            if prod.exists() {
                return Some(prod);
            }
        }
    }
    None
}

fn speed_up_audio_ffmpeg(
    ffmpeg: &Path,
    input: &Path,
    output: &Path,
    rate: f64,
    preserve_pitch: bool,
) -> Result<String, String> {
    let output_str = output.to_string_lossy().to_string();

    if preserve_pitch {
        // atempo filter is limited to 0.5–2.0; chain for rates outside that range
        let mut filters: Vec<String> = Vec::new();
        let mut r = rate;
        while r > 2.0 {
            filters.push("atempo=2.0".to_string());
            r /= 2.0;
        }
        while r < 0.5 {
            filters.push("atempo=0.5".to_string());
            r /= 0.5;
        }
        filters.push(format!("atempo={:.6}", r));
        let filter_str = filters.join(",");

        let status = std::process::Command::new(ffmpeg)
            .arg("-y")
            .arg("-i")
            .arg(input)
            .arg("-af")
            .arg(&filter_str)
            .arg("-codec:a")
            .arg("libmp3lame")
            .arg("-b:a")
            .arg("192k")
            .arg(&output_str)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;
        if !status.success() {
            return Err(format!("ffmpeg exited with status {:?}", status.code()));
        }
    } else {
        // No pitch preservation: change sample rate directly (chipmunk/tape effect)
        let target_rate = (44100.0 * rate) as u32;
        let setrate = format!("asetrate={},aresample=44100", target_rate);

        let status = std::process::Command::new(ffmpeg)
            .arg("-y")
            .arg("-i")
            .arg(input)
            .arg("-af")
            .arg(&setrate)
            .arg("-codec:a")
            .arg("libmp3lame")
            .arg("-b:a")
            .arg("192k")
            .arg(&output_str)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map_err(|e| format!("Failed to run ffmpeg: {}", e))?;
        if !status.success() {
            return Err(format!("ffmpeg exited with status {:?}", status.code()));
        }
    }

    Ok(output_str)
}

fn speed_up_audio_symphonia(input_path: &str, output_path: &str, rate: f64) -> Result<String, String> {
    use symphonia::core::audio::SampleBuffer;
    use symphonia::core::codecs::DecoderOptions;
    use symphonia::core::formats::FormatOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;

    let file = std::fs::File::open(input_path)
        .map_err(|e| format!("Failed to open audio: {}", e))?;
    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let hint = Hint::new();
    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &FormatOptions::default(), &MetadataOptions::default())
        .map_err(|e| format!("Failed to probe audio format: {}", e))?;

    let mut format = probed.format;
    let track = format.tracks().first()
        .ok_or_else(|| "No audio track found".to_string())?;
    let track_id = track.id;
    let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);
    let num_channels = track.codec_params.channels.map(|c| c.count()).unwrap_or(2);
    let total_frames = track.codec_params.n_frames.unwrap_or(0) as usize;

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|e| format!("Failed to create decoder: {}", e))?;

    // Pre-allocate PCM buffer to avoid repeated reallocations during decode
    let cap = if total_frames > 0 { total_frames * num_channels } else { 1024 * 1024 };
    let mut all_samples: Vec<f32> = Vec::with_capacity(cap);

    // Reuse one SampleBuffer across all packets
    let mut sample_buf: Option<SampleBuffer<f32>> = None;
    loop {
        match format.next_packet() {
            Ok(packet) => {
                if packet.track_id() != track_id { continue; }
                if let Ok(decoded) = decoder.decode(&packet) {
                    let spec = *decoded.spec();
                    let buf = sample_buf.get_or_insert_with(|| {
                        let cap = decoded.frames().max(4096) as u64;
                        SampleBuffer::new(cap, spec)
                    });
                    buf.copy_interleaved_ref(decoded);
                    all_samples.extend_from_slice(buf.samples());
                }
            }
            Err(symphonia::core::errors::Error::IoError(_)) => break,
            Err(symphonia::core::errors::Error::DecodeError(_)) => continue,
            Err(_) => break,
        }
    }

    if all_samples.is_empty() {
        return Err("No audio samples decoded".to_string());
    }

    // Resample with linear interpolation, writing output directly to WAV
    let in_frames = all_samples.len() / num_channels;
    let out_frames = (in_frames as f64 / rate).ceil() as usize;

    let spec = hound::WavSpec {
        channels: num_channels as u16,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(output_path, spec)
        .map_err(|e| format!("Failed to create WAV: {}", e))?;

    // Borrow all_samples once to avoid bounds checks
    let src = &all_samples[..];
    let ch = num_channels;
    for i in 0..out_frames {
        let src_pos = i as f64 * rate;
        let src_idx = src_pos as usize;
        let frac = (src_pos - src_idx as f64) as f32;
        let one_minus_frac = 1.0 - frac;

        let base = src_idx * ch;
        // Bounds: safe because src_idx <= in_frames / rate <= in_frames
        if base + ch < src.len() {
            for c in 0..ch {
                let v = src[base + c] * one_minus_frac + src[base + ch + c] * frac;
                writer.write_sample((v.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
                    .map_err(|e| format!("Write error: {}", e))?;
            }
        } else {
            // Last partial frame — no next frame to interpolate with
            for c in 0..ch {
                let v = if base + c < src.len() { src[base + c] } else { 0.0 };
                writer.write_sample((v.clamp(-1.0, 1.0) * i16::MAX as f32) as i16)
                    .map_err(|e| format!("Write error: {}", e))?;
            }
        }
    }

    writer.finalize()
        .map_err(|e| format!("Failed to finalize WAV: {}", e))?;

    Ok(output_path.to_string())
}

/// Sanitize a string for use as a Windows filename component, truncating
/// to `max_len` chars to avoid hitting MAX_PATH (260).
fn sanitize_filename(s: &str, max_len: usize) -> String {
    s.chars()
        .map(|c| if c.is_ascii_alphanumeric() || " _.-'!()[]".contains(c) { c } else { '_' })
        .collect::<String>()
        .chars()
        .take(max_len)
        .collect()
}

fn resolve_audio_path(source_dir: &str, filename: &str) -> PathBuf {
    resolve_media_file(source_dir, filename, &[".mp3", ".ogg", ".wav", ".flac", ".m4a", ".wma"])
        .unwrap_or_else(|| Path::new(source_dir).join(filename))
}

#[tauri::command]
fn export_beatmap(
    beatmap: Beatmap,
    config: ExportConfig,
    converted_content: String,
    output_dir: String,
    filename_suffix: Option<String>,
) -> Result<String, String> {
    // Find ffmpeg: dev path or production sidecar
    let ffmpeg_path = find_ffmpeg();
    let base = format!("{} [{}]", config.title, config.creator);
    let folder_name = if let Some(ref suffix) = filename_suffix {
        format!("{} {}", base, suffix)
    } else {
        base
    };
    let safe_name = sanitize_filename(&folder_name, 80);

    let out_ext = match beatmap.source_format {
        SourceFormat::OsuMania => "sm",
        SourceFormat::Etterna => "osu",
    };
    let out_filename = format!("{}.{}", safe_name, out_ext);

    if config.output_format == "osz" {
        // ── .osz (zip) output ──
        // output_dir comes from save() dialog and IS the file path
        let osz_path = PathBuf::from(&output_dir);
        // ensure parent dir exists
        if let Some(parent) = osz_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create output directory: {}", e))?;
        }
        let file = fs::File::create(&osz_path)
            .map_err(|e| format!("Failed to create .osz: {}", e))?;
        let mut zip_w = zip::ZipWriter::new(file);
        let opts: zip::write::FileOptions<'_, ()> = zip::write::FileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        // audio (keep original filename so #MUSIC: stays correct)
        if !config.audio_filename.is_empty() {
            let needs_rate = (config.conversion_rate - 1.0).abs() > f64::EPSILON;
            let audio_bytes: Vec<u8> = if needs_rate {
                let src = resolve_audio_path(&beatmap.source_dir, &config.audio_filename);
                let tmp_dir = std::env::temp_dir().join("henkan_audio");
                fs::create_dir_all(&tmp_dir)
                    .map_err(|e| format!("Failed to create temp dir: {}", e))?;
                let tmp_audio = tmp_dir.join(&config.audio_filename);
                if let Some(ff) = &ffmpeg_path {
                    speed_up_audio_ffmpeg(ff, &src, &tmp_audio, config.conversion_rate, config.preserve_pitch)?;
                } else {
                    speed_up_audio_symphonia(
                        &src.to_string_lossy(),
                        &tmp_audio.to_string_lossy(),
                        config.conversion_rate,
                    )?;
                }
                let bytes = fs::read(&tmp_audio)
                    .map_err(|e| format!("Failed to read temp audio: {}", e))?;
                let _ = fs::remove_dir_all(&tmp_dir);
                bytes
            } else {
                let (bytes, _) =
                    read_file_bytes(&beatmap.source_dir, &config.audio_filename)?;
                bytes
            };
            zip_w
                .start_file(&config.audio_filename, opts)
                .map_err(|e| format!("Zip error: {}", e))?;
            std::io::Write::write_all(&mut zip_w, &audio_bytes)
                .map_err(|e| format!("Zip write error: {}", e))?;
        }

        // .osu/.sm inside
        zip_w
            .start_file(&out_filename, opts)
            .map_err(|e| format!("Zip error: {}", e))?;
        std::io::Write::write_all(&mut zip_w, converted_content.as_bytes())
            .map_err(|e| format!("Zip write error: {}", e))?;

        // background (osu [Events] references "bg.jpg")
        if let Some(ref bg) = config.background_filename {
            if !bg.is_empty() {
                let (bg_bytes, _) = read_file_bytes(&beatmap.source_dir, bg)?;
                zip_w
                    .start_file("bg.jpg", opts)
                    .map_err(|e| format!("Zip error: {}", e))?;
                std::io::Write::write_all(&mut zip_w, &bg_bytes)
                    .map_err(|e| format!("Zip write error: {}", e))?;
            }
        }

        zip_w
            .finish()
            .map_err(|e| format!("Zip finalize error: {}", e))?;

        Ok(osz_path.to_string_lossy().to_string())
    } else {
        // ── folder output ──
        // output_dir is the PARENT directory; we create a subfolder
        let export_path = Path::new(&output_dir).join(&safe_name);
        fs::create_dir_all(&export_path)
            .map_err(|e| format!("Failed to create export dir: {}", e))?;

        // Write converted beatmap
        let out_content = converted_content;
        if !config.audio_filename.is_empty() {
            let needs_rate = (config.conversion_rate - 1.0).abs() > f64::EPSILON;
            if needs_rate {
                let src = resolve_audio_path(&beatmap.source_dir, &config.audio_filename);
                let dest = export_path.join(&config.audio_filename);
                if let Some(ff) = &ffmpeg_path {
                    speed_up_audio_ffmpeg(ff, &src, &dest, config.conversion_rate, config.preserve_pitch)?;
                } else {
                    speed_up_audio_symphonia(
                        &src.to_string_lossy(),
                        &dest.to_string_lossy(),
                        config.conversion_rate,
                    )?;
                }
            } else {
                copy_media(
                    &beatmap.source_dir,
                    &config.audio_filename,
                    &export_path,
                    &config.audio_filename,
                )?;
            }
        }
        fs::write(export_path.join(&out_filename), &out_content)
            .map_err(|e| format!("Failed to write .{}: {}", out_ext, e))?;

        // Copy background as "bg.png"
        if let Some(ref bg) = config.background_filename {
            if !bg.is_empty() {
                copy_media(&beatmap.source_dir, bg, &export_path, "bg.png")?;
            }
        }

        // banner + cdtitle only for SM destination
        if beatmap.source_format == SourceFormat::OsuMania {
            let banner_auto = config.banner_filename.as_ref().map_or(true, |s| s.is_empty());
            if !banner_auto {
                if let Some(ref b) = config.banner_filename {
                    copy_media(&beatmap.source_dir, b, &export_path, "banner.png")?;
                }
            }
            let cdtitle_has_file = config.cdtitle_filename.as_ref().is_some_and(|s| !s.is_empty());
            if cdtitle_has_file {
                if let Some(ref cdt) = config.cdtitle_filename {
                    copy_media(&beatmap.source_dir, cdt, &export_path, "cdtitle.png")?;
                }
            } else if let Some(avatar) = fetch_mapper_avatar(&beatmap.creator) {
                fs::write(export_path.join("cdtitle.png"), &avatar)
                    .map_err(|e| format!("Failed to write cdtitle.png: {}", e))?;
            } else {
                fs::write(export_path.join("cdtitle.png"), DEFAULT_CDTITLE)
                    .map_err(|e| format!("Failed to write cdtitle.png: {}", e))?;
            }
        }

        Ok(export_path.to_string_lossy().to_string())
    }
}

/// Recursively scan a folder for .sm files and return basic metadata for each.
#[tauri::command]
fn scan_pack(folder: String) -> Result<Vec<PackEntry>, String> {
    fn walk(dir: &Path, results: &mut Vec<PackEntry>, depth: usize) {
        if depth > 5 { return; }
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    walk(&path, results, depth + 1);
                } else if path.extension().and_then(|e| e.to_str()) == Some("sm") {
                    if let Ok(content) = fs::read_to_string(&path) {
                        if let Ok(bm) = parsers::etterna::parse_sm(&content) {
                        let source_dir = path.parent()
                            .unwrap_or(Path::new(""))
                            .to_string_lossy()
                            .to_string();
                        results.push(PackEntry {
                            source_file: path.to_string_lossy().to_string(),
                            source_dir,
                            title: bm.title,
                            artist: bm.artist,
                            background_filename: bm.background_filename,
                            available_difficulties: bm.available_difficulties,
                        });
                    }
                    }
                }
            }
        }
    }

    let dir = Path::new(&folder);
    if !dir.is_dir() {
        return Err("Not a directory".to_string());
    }

    let mut results = Vec::new();
    walk(dir, &mut results, 0);
    Ok(results)
}

#[tauri::command]
fn find_pack_banner(folder: String) -> Result<Option<String>, String> {
    let dir = std::path::Path::new(&folder);
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Ok(None),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() { continue; }
        let ext = path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        if matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp") {
            return Ok(Some(path.to_string_lossy().to_string()));
        }
    }
    Ok(None)
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/c", "start", "", &url])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn get_github_stars(repo: String) -> Result<Option<String>, String> {
    let url = format!("https://api.github.com/repos/{}", repo);
    let resp = ureq::get(&url)
        .header("User-Agent", "henkan/1.0")
        .header("Accept", "application/vnd.github.v3+json")
        .call()
        .map_err(|e| format!("GitHub API error: {}", e))?;
    let text = resp.into_body().read_to_string()
        .map_err(|e| format!("Body read error: {}", e))?;
    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| format!("JSON parse error: {}", e))?;
    Ok(json.get("stargazers_count")
        .and_then(|v| v.as_i64())
        .map(|n| n.to_string()))
}

#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/c", "start", "", &path])
        .spawn()
        .map_err(|e| format!("Failed to open file: {}", e))?;
    Ok(())
}

#[tauri::command]
fn export_all_beatmaps(
    source_file: String,
    config: ExportConfig,
    output_dir: String,
    indices: Option<Vec<usize>>,
    pack_name: Option<String>,
) -> Result<Vec<String>, String> {
    use std::io::Write;
    let ffmpeg_path = find_ffmpeg();

    let ext = Path::new(&source_file)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let pack_mode = pack_name.is_some();

    let base = format!("{} [{}]", config.title, config.creator);
    let safe = sanitize_filename(&base, 80);

    let mut results = Vec::new();

    match ext.as_str() {
        "sm" => {
            // ── SM source: export all difficulties as .osu ──
            let content =
                fs::read_to_string(&source_file).map_err(|e| format!("Failed to read file: {}", e))?;
            let source_dir = Path::new(&source_file)
                .parent()
                .unwrap_or(Path::new(""))
                .to_string_lossy()
                .to_string();
            let raw = content.replace("\r\n", "\n");
            let sections = parsers::etterna::extract_all_notes_sections(&raw);

            // Resolve filenames from SM header when config provides defaults
            let audio_filename = if config.audio_filename.is_empty() {
                extract_sm_header_field(&content, "MUSIC").unwrap_or_default()
            } else {
                config.audio_filename.clone()
            };
            let mut background_filename: Option<String> = config.background_filename.clone().or_else(|| {
                extract_sm_header_field(&content, "BACKGROUND").or_else(|| {
                    extract_sm_header_field(&content, "BANNER")
                })
            });
            // If no background was specified, scan the source dir for plausible images
            if background_filename.as_ref().map_or(true, |s| s.is_empty()) {
                if let Some(found) = scan_source_dir_for_bg(&source_dir) {
                    if let Some(name) = found.file_name().and_then(|n| n.to_str()) {
                        background_filename = Some(name.to_string());
                    }
                }
            }

            if config.output_format == "osz" {
                let osz_path = Path::new(&output_dir).join(format!("{}.osz", safe));
                if let Some(parent) = osz_path.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create output directory: {}", e))?;
                }
                let file = fs::File::create(&osz_path)
                    .map_err(|e| format!("Failed to create .osz: {}", e))?;
                let mut zip_w = zip::ZipWriter::new(file);
                let opts: zip::write::FileOptions<'_, ()> = zip::write::FileOptions::default()
                    .compression_method(zip::CompressionMethod::Deflated);

                let mut media_added = false;
                for i in 0..sections.len() {
                    let mut bm = parsers::etterna::parse_sm_difficulty(&content, i)
                        .map_err(|e| format!("Parse error: {}", e))?;
                    bm.title = config.title.clone();
                    bm.artist = config.artist.clone();
                    if !config.creator.is_empty() { bm.creator = config.creator.clone(); }
                    bm.source = config.source.clone();
                    bm.tags = config.tags.clone();
                    if config.preview_time != 0.0 { bm.preview_time = config.preview_time; }
                    scale_timing_for_rate(&mut bm, config.conversion_rate);
                    if let Some(label) = rate_label(config.conversion_rate) {
                        bm.difficulty_name.push(' ');
                        bm.difficulty_name.push_str(&label);
                    }
                    let mut bmc = config.clone();
                    bmc.title = bm.title.clone();
                    bmc.artist = bm.artist.clone();
                    bmc.creator = bm.creator.clone();
                    bmc.source = bm.source.clone();
                    bmc.tags = bm.tags.clone();
                    let converted =
                        converters::etterna_to_osu::convert(&bm, &bmc)
                            .map_err(|e| format!("Conversion error: {}", e))?;

                    let dn = bm.difficulty_name;
                    let diff_safe = sanitize_filename(&dn, 60);
                    let entry_name = if diff_safe.is_empty() {
                        format!("{}.osu", safe)
                    } else {
                        format!("{} [{}].osu", safe, diff_safe)
                    };
                    zip_w
                        .start_file(&entry_name, opts)
                        .map_err(|e| format!("Zip error: {}", e))?;
                    zip_w
                        .write_all(converted.as_bytes())
                        .map_err(|e| format!("Zip write error: {}", e))?;
                    results.push(format!("{} (inside .osz)", entry_name));

                    if !media_added && !audio_filename.is_empty() {
                        // audio
                        let needs_rate = (config.conversion_rate - 1.0).abs() > f64::EPSILON;
                        let audio_bytes: Vec<u8> = if needs_rate {
                            let src = resolve_audio_path(&source_dir, &audio_filename);
                            let tmp_dir = std::env::temp_dir().join("henkan_audio");
                            fs::create_dir_all(&tmp_dir)
                                .map_err(|e| format!("Failed to create temp dir: {}", e))?;
                            let tmp_audio = tmp_dir.join(&audio_filename);
                            if let Some(ff) = &ffmpeg_path {
                                speed_up_audio_ffmpeg(ff, &src, &tmp_audio, config.conversion_rate, config.preserve_pitch)?;
                            } else {
                                speed_up_audio_symphonia(
                                    &src.to_string_lossy(),
                                    &tmp_audio.to_string_lossy(),
                                    config.conversion_rate,
                                )?;
                            }
                            let bytes = fs::read(&tmp_audio)
                                .map_err(|e| format!("Failed to read temp audio: {}", e))?;
                            let _ = fs::remove_dir_all(&tmp_dir);
                            bytes
                        } else {
                            let (bytes, _) =
                                read_file_bytes(&source_dir, &audio_filename)?;
                            bytes
                        };
                        let audio_name = Path::new(&audio_filename)
                            .file_name()
                            .unwrap_or(std::ffi::OsStr::new("audio.mp3"))
                            .to_string_lossy()
                            .to_string();
                        zip_w
                            .start_file(&audio_name, opts)
                            .map_err(|e| format!("Zip error: {}", e))?;
                        zip_w
                            .write_all(&audio_bytes)
                            .map_err(|e| format!("Zip write error: {}", e))?;
                        // background
                        if let Some(ref bg) = background_filename {
                            if !bg.is_empty() {
                                let (bg_bytes, _) = read_file_bytes(&source_dir, bg)?;
                                zip_w
                                    .start_file("bg.jpg", opts)
                                    .map_err(|e| format!("Zip error: {}", e))?;
                                zip_w
                                    .write_all(&bg_bytes)
                                    .map_err(|e| format!("Zip write error: {}", e))?;
                            }
                        }
                        media_added = true;
                    }
                }
                zip_w
                    .finish()
                    .map_err(|e| format!("Zip finalize error: {}", e))?;
                results.insert(0, osz_path.to_string_lossy().to_string());
            } else {
                // folder output
                let title_safe = sanitize_filename(&config.title, 80);

                let out_folder = if pack_mode {
                    PathBuf::from(&output_dir)
                } else {
                    Path::new(&output_dir).join(&safe)
                };
                fs::create_dir_all(&out_folder)
                    .map_err(|e| format!("Failed to create output dir: {}", e))?;

                let name_base = if pack_mode { 
                    if title_safe.is_empty() { safe.clone() } else { title_safe.clone() }
                } else { 
                    safe.clone() 
                };

                for i in 0..sections.len() {
                    let mut bm = parsers::etterna::parse_sm_difficulty(&content, i)
                        .map_err(|e| format!("Parse error: {}", e))?;
                    bm.title = config.title.clone();
                    bm.artist = config.artist.clone();
                    if !config.creator.is_empty() { bm.creator = config.creator.clone(); }
                    bm.source = config.source.clone();
                    bm.tags = config.tags.clone();
                    if config.preview_time != 0.0 { bm.preview_time = config.preview_time; }

                    // In pack mode, set filenames to match title-based output
                    if pack_mode {
                        let audio_ext = Path::new(&audio_filename)
                            .extension().and_then(|e| e.to_str()).unwrap_or("mp3");
                        bm.audio_filename = format!("{}.{}", name_base, audio_ext);
                        if let Some(ref bg) = background_filename {
                            let bg_ext = Path::new(bg)
                                .extension().and_then(|e| e.to_str()).unwrap_or("jpg");
                            bm.background_filename = Some(format!("{}.{}", name_base, bg_ext));
                        }
                    }

                    scale_timing_for_rate(&mut bm, config.conversion_rate);
                    if let Some(label) = rate_label(config.conversion_rate) {
                        bm.difficulty_name.push(' ');
                        bm.difficulty_name.push_str(&label);
                    }
                    let mut bmc = config.clone();
                    bmc.title = bm.title.clone();
                    bmc.artist = bm.artist.clone();
                    bmc.creator = bm.creator.clone();
                    bmc.source = bm.source.clone();
                    bmc.tags = bm.tags.clone();
                    let mut converted =
                        converters::etterna_to_osu::convert(&bm, &bmc)
                            .map_err(|e| format!("Conversion error: {}", e))?;

                    let dn = bm.difficulty_name;
                    let diff_safe = sanitize_filename(&dn, 60);
                    let out_name = if diff_safe.is_empty() {
                        format!("{}.osu", name_base)
                    } else {
                        format!("{} [{}].osu", name_base, diff_safe)
                    };

                    // In pack mode, fix the hardcoded "bg.jpg" reference in .osu
                    if pack_mode {
                        if let Some(ref bg) = bm.background_filename {
                            converted = converted.replace("\"bg.jpg\"", &format!("\"{}\"", bg));
                        }
                    }

                    let out_path = out_folder.join(&out_name);
                    fs::write(&out_path, &converted)
                        .map_err(|e| format!("Failed to write {}: {}", out_name, e))?;
                    results.push(out_path.to_string_lossy().to_string());
                }

                // Copy media once (audio + bg)
                if pack_mode {
                    let audio_ext = Path::new(&audio_filename)
                        .extension().and_then(|e| e.to_str()).unwrap_or("mp3");
                    let audio_out = format!("{}.{}", name_base, audio_ext);
                    if !audio_filename.is_empty() {
                        let needs_rate = (config.conversion_rate - 1.0).abs() > f64::EPSILON;
                        if needs_rate {
                            let src = resolve_audio_path(&source_dir, &audio_filename);
                            let dest = out_folder.join(&audio_out);
                            if let Some(ff) = &ffmpeg_path {
                                speed_up_audio_ffmpeg(ff, &src, &dest, config.conversion_rate, config.preserve_pitch)?;
                            } else {
                                speed_up_audio_symphonia(
                                    &src.to_string_lossy(),
                                    &dest.to_string_lossy(),
                                    config.conversion_rate,
                                )?;
                            }
                        } else {
                            copy_media(&source_dir, &audio_filename, &out_folder, &audio_out)?;
                        }
                    }
                    if let Some(ref bg) = background_filename {
                        if !bg.is_empty() {
                            let bg_ext = Path::new(bg)
                                .extension().and_then(|e| e.to_str()).unwrap_or("jpg");
                            let bg_out = format!("{}.{}", name_base, bg_ext);
                            copy_media(&source_dir, bg, &out_folder, &bg_out)?;
                        }
                    }
                } else {
                    if !audio_filename.is_empty() {
                        let needs_rate = (config.conversion_rate - 1.0).abs() > f64::EPSILON;
                        if needs_rate {
                            let src = resolve_audio_path(&source_dir, &audio_filename);
                            let dest = out_folder.join(&audio_filename);
                            if let Some(ff) = &ffmpeg_path {
                                speed_up_audio_ffmpeg(ff, &src, &dest, config.conversion_rate, config.preserve_pitch)?;
                            } else {
                                speed_up_audio_symphonia(
                                    &src.to_string_lossy(),
                                    &dest.to_string_lossy(),
                                    config.conversion_rate,
                                )?;
                            }
                        } else {
                            copy_media(
                                &source_dir,
                                &audio_filename,
                                &out_folder,
                                &audio_filename,
                            )?;
                        }
                    }
                    if let Some(ref bg) = background_filename {
                        if !bg.is_empty() {
                            copy_media(&source_dir, bg, &out_folder, "bg.png")?;
                        }
                    }
                }
            }
        }
        "osz" => {
            // ── OSZ source: export all difficulties into one .sm with multiple #NOTES: ──
            let (_, entries, tmp_dir) = extract_osz_all(&source_file)?;
            // Parse all entries, sort by exact SM meter (easiest first)
            let mut parsed: Vec<(String, Beatmap)> = Vec::with_capacity(entries.len());
            for (fname, text) in &entries {
                let bm = parsers::osu::parse_osu(text)
                    .map_err(|e| format!("Parse error in {}: {}", fname, e))?;
                parsed.push((fname.clone(), bm));
            }
            parsed.sort_by(|a, b| {
                let a_meter = converters::osu_to_etterna::compute_meter(&a.1);
                let b_meter = converters::osu_to_etterna::compute_meter(&b.1);
                a_meter.cmp(&b_meter)
            });

            // Filter by selected indices if provided
            if let Some(idxs) = &indices {
                parsed = idxs.iter().map(|&i| parsed[i].clone()).collect();
            }

            let highest_diff = parsed.last()
                .map(|e| {
                    let mut dn = e.1.difficulty_name.clone();
                    if let Some(label) = rate_label(config.conversion_rate) {
                        dn.push(' ');
                        dn.push_str(&label);
                    }
                    dn
                })
                .unwrap_or_default();

            let out_folder = Path::new(&output_dir).join(&safe);
            fs::create_dir_all(&out_folder)
                .map_err(|e| format!("Failed to create output dir: {}", e))?;

            let mut combined = String::new();
            for (i, (fname, bm)) in parsed.iter_mut().enumerate() {
                // Apply config overrides (title/artist/creator etc.) to each diff
                    bm.title = config.title.clone();
                    bm.artist = config.artist.clone();
                    if !config.creator.is_empty() { bm.creator = config.creator.clone(); }
                    bm.source = config.source.clone();
                bm.tags = config.tags.clone();
                bm.difficulty_name = config.difficulty_name.clone();
                if let Some(label) = rate_label(config.conversion_rate) {
                    bm.difficulty_name.push(' ');
                    bm.difficulty_name.push_str(&label);
                }
                if config.preview_time != 0.0 { bm.preview_time = config.preview_time; }
                scale_timing_for_rate(bm, config.conversion_rate);

                let converted =
                    converters::osu_to_etterna::convert(bm, config.global_timing_ms, &config.creator)
                        .map_err(|e| format!("Conversion error for {}: {}", fname, e))?;

                if i == 0 {
                    combined = converted;
                } else {
                    if let Some(notes_start) = converted.find("#NOTES:") {
                        combined.push('\n');
                        combined.push_str(&converted[notes_start..]);
                    }
                }
            }

            // Renumber meters sequentially (1, 2, 3, ...) after sorting
            combined = renumber_meters(&combined);

            // Fix subtitle to use the highest difficulty name
            if !highest_diff.is_empty() {
                let escaped = highest_diff.replace(';', "\\;");
                let new_sub = format!("#SUBTITLE:{};", escaped);
                if let Some(start) = combined.find("#SUBTITLE:") {
                    if let Some(end) = combined[start..].find(';') {
                        combined.replace_range(start..=start + end, &new_sub);
                    }
                }
                let new_sub_tl = format!("#SUBTITLETRANSLIT:{};", escaped);
                if let Some(start) = combined.find("#SUBTITLETRANSLIT:") {
                    if let Some(end) = combined[start..].find(';') {
                        combined.replace_range(start..=start + end, &new_sub_tl);
                    }
                }
            }

            let out_name = format!("{}.sm", safe);
            let out_path = out_folder.join(&out_name);
            fs::write(&out_path, &combined)
                .map_err(|e| format!("Failed to write {}: {}", out_name, e))?;
            results.push(out_path.to_string_lossy().to_string());

            // Copy media once
            if !config.audio_filename.is_empty() {
                let needs_rate = (config.conversion_rate - 1.0).abs() > f64::EPSILON;
                if needs_rate {
                    let src = resolve_audio_path(&tmp_dir, &config.audio_filename);
                    let dest = out_folder.join(&config.audio_filename);
                    if let Some(ff) = &ffmpeg_path {
                        speed_up_audio_ffmpeg(ff, &src, &dest, config.conversion_rate, config.preserve_pitch)?;
                    } else {
                        speed_up_audio_symphonia(
                            &src.to_string_lossy(),
                            &dest.to_string_lossy(),
                            config.conversion_rate,
                        )?;
                    }
                } else {
                    copy_media(
                        &tmp_dir,
                        &config.audio_filename,
                        &out_folder,
                        &config.audio_filename,
                    )?;
                }
            }
            if let Some(ref bg) = config.background_filename {
                if !bg.is_empty() {
                    copy_media(&tmp_dir, bg, &out_folder, "bg.png")?;
                }
            }
            // banner for SM destination (only if explicitly set)
            let banner_auto = config.banner_filename.as_ref().map_or(true, |s| s.is_empty());
            if !banner_auto {
                if let Some(ref b) = config.banner_filename {
                    copy_media(&tmp_dir, b, &out_folder, "banner.png")?;
                }
            }
            let cdtitle_has_file = config.cdtitle_filename.as_ref().is_some_and(|s| !s.is_empty());
            if cdtitle_has_file {
                if let Some(ref cdt) = config.cdtitle_filename {
                    copy_media(&tmp_dir, cdt, &out_folder, "cdtitle.png")?;
                }
            } else if let Some(avatar) = fetch_mapper_avatar(&config.creator) {
                fs::write(out_folder.join("cdtitle.png"), &avatar)
                    .map_err(|e| format!("Failed to write cdtitle.png: {}", e))?;
            } else {
                fs::write(out_folder.join("cdtitle.png"), DEFAULT_CDTITLE)
                    .map_err(|e| format!("Failed to write cdtitle.png: {}", e))?;
            }
        }
        _ => return Err("Unsupported file format".to_string()),
    }

    Ok(results)
}



#[tauri::command]
fn create_dummy_diff(
    title: String,
    creator: String,
    pack_banner_path: Option<String>,
    output_dir: String,
) -> Result<String, String> {
    let out_dir = Path::new(&output_dir);
    fs::create_dir_all(out_dir)
        .map_err(|e| format!("Failed to create output dir: {}", e))?;

    // Copy pack banner as background
    let banner_name = if let Some(ref banner_full) = pack_banner_path {
        let banner_path = Path::new(banner_full);
        let fname = banner_path
            .file_name()
            .unwrap_or(std::ffi::OsStr::new("banner.jpg"))
            .to_string_lossy()
            .to_string();
        if banner_path.exists() {
            fs::copy(banner_path, out_dir.join(&fname))
                .map_err(|e| format!("Failed to copy banner: {}", e))?;
        }
        fname
    } else {
        String::new()
    };

    let mut osu = String::new();
    osu.push_str("osu file format v14\n\n");
    osu.push_str("[General]\n");
    osu.push_str("AudioFilename: dummy.mp3\n");
    osu.push_str("AudioLeadIn: 0\n");
    osu.push_str("Mode: 3\n");
    osu.push_str("PreviewTime: 0\n\n");
    osu.push_str("[Metadata]\n");
    osu.push_str(&format!("Title:{}\n", title));
    osu.push_str(&format!("TitleUnicode:{}\n", title));
    osu.push_str(&format!("Creator:{}\n", creator));
    osu.push_str("Version:Etterna pack\n");
    osu.push_str(&format!("Source:etterna-pack-{}\n", title));
    osu.push_str("Tags:\n\n");
    osu.push_str("[Difficulty]\n");
    osu.push_str("HPDrainRate:5\n");
    osu.push_str("CircleSize:4\n");
    osu.push_str("OverallDifficulty:5\n");
    osu.push_str("ApproachRate:5\n");
    osu.push_str("SliderMultiplier:1.4\n");
    osu.push_str("SliderTickRate:1\n\n");
    osu.push_str("[Events]\n");
    osu.push_str("//Background and Video events\n");
    if !banner_name.is_empty() {
        osu.push_str(&format!("0,0,\"{}\",0,0\n", banner_name));
    }
    osu.push_str("//Break Periods\n\n");
    osu.push_str("[TimingPoints]\n");
    osu.push_str("0,500,4,0,0,100,1,0\n\n");
    osu.push_str("[HitObjects]\n");
    // No hit objects — this is purely a visual pack identifier

    let osu_name = format!("{}.osu", title);
    let osu_path = out_dir.join(&osu_name);
    fs::write(&osu_path, &osu)
        .map_err(|e| format!("Failed to write dummy .osu: {}", e))?;

    Ok(osu_path.to_string_lossy().to_string())
}

#[tauri::command]
fn zip_folder(folder_path: String, output_path: String) -> Result<String, String> {
    use std::io::Write;

    let file = fs::File::create(&output_path)
        .map_err(|e| format!("Failed to create .osz: {}", e))?;
    let mut zip_w = zip::ZipWriter::new(file);
    let opts: zip::write::FileOptions<'_, ()> = zip::write::FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    fn walk_dir(
        zip_w: &mut zip::ZipWriter<fs::File>,
        dir: &Path,
        base: &Path,
        opts: &zip::write::FileOptions<'_, ()>,
    ) -> Result<(), String> {
        if !dir.is_dir() {
            return Ok(());
        }
        let entries = fs::read_dir(dir).map_err(|e| format!("Failed to read dir: {}", e))?;
        for entry in entries.flatten() {
            let path = entry.path();
            let relative = path.strip_prefix(base).unwrap_or(&path).to_string_lossy().to_string();
            if path.is_dir() {
                walk_dir(zip_w, &path, base, opts)?;
            } else {
                let bytes = fs::read(&path)
                    .map_err(|e| format!("Failed to read {}: {}", relative, e))?;
                zip_w
                    .start_file(relative.replace('\\', "/"), *opts)
                    .map_err(|e| format!("Zip error: {}", e))?;
                zip_w
                    .write_all(&bytes)
                    .map_err(|e| format!("Zip write error: {}", e))?;
            }
        }
        Ok(())
    }

    let folder = Path::new(&folder_path);
    walk_dir(&mut zip_w, folder, folder, &opts)?;
    zip_w.finish().map_err(|e| format!("Zip finalize error: {}", e))?;
    Ok(output_path)
}


/// After sorting by computed meter, reassign meters sequentially (1, 2, 3, …)
/// so the .sm file always starts at meter 1.
fn renumber_meters(sm: &str) -> String {
    let mut lines: Vec<String> = sm.lines().map(|l| l.to_string()).collect();
    let mut counter = 1u32;
    let mut i = 0;
    while i < lines.len() {
        if lines[i].trim() == "#NOTES:" {
            if let Some(meter_line) = lines.get(i + 4) {
                let trimmed = meter_line.trim();
                if let Some(colon_pos) = trimmed.rfind(':') {
                    if trimmed[..colon_pos].trim().parse::<u32>().is_ok() {
                        let indent_len = meter_line.len() - meter_line.trim_start().len();
                        lines[i + 4] = format!("{}{}:", " ".repeat(indent_len), counter);
                        counter += 1;
                    }
                }
            }
        }
        i += 1;
    }
    lines.join("\n")
}

fn extract_sm_header_field(content: &str, field: &str) -> Option<String> {
    let prefix = format!("#{}:", field);
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix(&prefix) {
            return Some(rest.strip_suffix(';').unwrap_or(rest).trim().to_string());
        }
    }
    None
}

fn copy_media(source_dir: &str, filename: &str, dest: &Path, dest_name: &str) -> Result<(), String> {
    let resolved = resolve_media_file(source_dir, filename, &[".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"])
        .ok_or_else(|| format!("File not found: {} (looked in {})", filename, source_dir))?;
    fs::copy(&resolved, dest.join(dest_name))
        .map_err(|e| format!("Failed to copy {}: {}", dest_name, e))?;
    Ok(())
}

#[tauri::command]
fn read_file_as_data_url(path: String) -> Result<String, String> {
    use std::io::Read;
    let mut file = fs::File::open(&path).map_err(|e| format!("Failed to read: {}", e))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf).map_err(|e| format!("Read error: {}", e))?;

    let ext = path.rsplit('.').next().unwrap_or("").to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "mp3" => "audio/mpeg",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "flac" => "audio/flac",
        _ => {
            if ext == "jpg" || ext == "jpeg" { "image/jpeg" }
            else if ext == "m4a" { "audio/mp4" }
            else { "application/octet-stream" }
        }
    };

    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &buf);
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
fn save_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, &content).map_err(|e| format!("Failed to save file: {}", e))
}

#[tauri::command]
fn clean_dir(path: String) -> Result<(), String> {
    let dir = Path::new(&path);
    if dir.exists() {
        fs::remove_dir_all(dir)
            .map_err(|e| format!("Failed to clean directory: {}", e))?;
    }
    fs::create_dir_all(dir)
        .map_err(|e| format!("Failed to recreate directory: {}", e))?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Keep a tokio runtime alive so aptabase' reqwest::Client::builder().build()
    // doesn't panic with "there is no reactor running"
    let _tokio_rt = tokio::runtime::Runtime::new().unwrap();
    let _guard = _tokio_rt.enter();

    dotenvy::dotenv().ok();
    let aptabase_key = std::env::var("APTABASE_KEY")
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| option_env!("APTABASE_KEY").filter(|s| !s.is_empty()).map(String::from))
        .unwrap_or_default();

    tauri::Builder::default()
        .plugin(tauri_plugin_aptabase::Builder::new(
            &aptabase_key,
        ).build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            app.track_event("app_started", None).ok();
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_background_color(Some(tauri::window::Color(2, 6, 23, 255)));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            parse_file,
            select_difficulty,
            resolve_file,
            read_file_as_data_url,
            convert_beatmap,
            export_beatmap,
            export_all_beatmaps,
            create_dummy_diff,
            zip_folder,
            save_file,
            clean_dir,
            scan_pack,
            find_pack_banner,
            open_file,
            open_url,
            get_github_stars
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
