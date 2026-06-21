// TypeScript models mirroring the Rust models/beatmap.rs and models/timing.rs

export interface Note {
  time_ms: number
  column: number
  hold: boolean
  hold_end_ms: number | null
}

export interface TimingPoint {
  time_ms: number
  beat_length: number
  meter: number
  uninherited: boolean
}

export interface SVEvent {
  time_ms: number
  multiplier: number
}

export interface DiffInfo {
  name: string
  keys: number
  note_count: number
  audio_filename: string | null
}

export interface Beatmap {
  title: string
  artist: string
  creator: string
  difficulty_name: string
  source: string
  tags: string
  audio_filename: string
  background_filename: string | null
  banner_filename: string | null
  source_dir: string
  source_file: string
  timing_points: TimingPoint[]
  sv_events: SVEvent[]
  preview_time: number
  lead_in_ms: number
  keys: number
  notes: Note[]
  duration_ms: number
  source_format: 'OsuMania' | 'Etterna'
  available_difficulties: DiffInfo[]
}

export interface ExportConfig {
  title: string
  artist: string
  creator: string
  difficulty_name: string
  source: string
  tags: string
  audio_filename: string
  background_filename: string | null
  banner_filename: string | null
  cdtitle_filename: string | null
  cdtitle_name: string
  global_timing_ms: number
  output_format: 'folder' | 'osu' | 'osz'
  hp_drain: number
  overall_difficulty: number
  preview_time: number
  conversion_rate: number
  preserve_pitch: boolean
}

export function createBeatmap(keys: number): Beatmap {
  return {
    title: '',
    artist: '',
    creator: '',
    difficulty_name: '',
    source: '',
    tags: '',
    audio_filename: '',
    background_filename: null,
    banner_filename: null,
    source_dir: '',
    source_file: '',
    timing_points: [],
    sv_events: [],
    preview_time: 0,
    lead_in_ms: 0,
    keys,
    notes: [],
    duration_ms: 0,
    source_format: 'OsuMania',
    available_difficulties: [],
  }
}

export function computeDuration(bm: Beatmap): void {
  bm.duration_ms = bm.notes.reduce(
    (max, n) => Math.max(max, n.hold_end_ms ?? n.time_ms),
    0
  )
}

export function svMultiplier(tp: TimingPoint): number {
  if (!tp.uninherited && tp.beat_length < 0) {
    return -100.0 / tp.beat_length
  }
  return 1.0
}
