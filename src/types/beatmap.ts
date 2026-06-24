export type SourceFormat = 'OsuMania' | 'Etterna'

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
  cdtitle_filename: string | null
  source_dir: string
  source_file: string
  timing_points: TimingPoint[]
  sv_events: SVEvent[]
  preview_time: number
  lead_in_ms: number
  keys: number
  notes: Note[]
  duration_ms: number
  source_format: SourceFormat
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
  global_timing_ms: number
  output_format: 'folder' | 'osu' | 'osz'
  hp_drain: number
  overall_difficulty: number
  preview_time: number
  conversion_rate: number
  preserve_pitch: boolean
}

export type ConvertDirection = 'osu-to-etterna' | 'etterna-to-osu'

export interface PackEntry {
  source_file: string
  source_dir: string
  title: string
  artist: string
  background_filename: string | null
  available_difficulties: DiffInfo[]
}
