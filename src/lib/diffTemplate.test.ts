import { describe, expect, it } from 'vitest'
import { expandDiffTemplate } from './diffTemplate'
import type { Beatmap, ExportConfig } from '../types/beatmap'

function beatmap(overrides: Partial<Beatmap> = {}): Beatmap {
  return {
    title: 'Song',
    artist: 'Artist',
    creator: 'Mapper',
    difficulty_name: 'Hard',
    source: '',
    tags: '',
    audio_filename: 'audio.mp3',
    background_filename: null,
    banner_filename: null,
    cdtitle_filename: null,
    source_dir: '',
    source_file: 'song.osz',
    timing_points: [],
    sv_events: [],
    preview_time: 0,
    lead_in_ms: 0,
    keys: 4,
    notes: [],
    duration_ms: 0,
    difficulty_rating: null,
    source_format: 'OsuMania',
    available_difficulties: [],
    ...overrides,
  }
}

const config: ExportConfig = {
  title: 'Song',
  artist: 'Artist',
  creator: 'Mapper',
  difficulty_name: 'Hard',
  source: '',
  tags: '',
  audio_filename: 'audio.mp3',
  background_filename: null,
  banner_filename: null,
  cdtitle_filename: null,
  global_timing_ms: 50,
  output_format: 'folder',
  hp_drain: 8,
  overall_difficulty: 8,
  preview_time: 0,
  conversion_rate: 1,
  preserve_pitch: true,
  subtitle: null,
  title_translit: null,
  subtitle_translit: null,
  artist_translit: null,
  genre: null,
  credit: null,
  display_bpm: null,
  sample_start: null,
  sample_length: null,
  selectable: null,
  diff_name_template: null,
}

describe('expandDiffTemplate', () => {
  it('uses the active difficulty rating when the beatmap field is missing', () => {
    const result = expandDiffTemplate(
      '<msd>',
      beatmap({
        available_difficulties: [{
          name: 'Hard',
          keys: 4,
          note_count: 100,
          audio_filename: 'audio.mp3',
          difficulty_rating: 47.97049331665039,
        }],
      }),
      config,
    )

    expect(result).toBe('47.97')
  })

  it('prefers the active beatmap rating when both values exist', () => {
    const result = expandDiffTemplate(
      '<msd>',
      beatmap({
        difficulty_rating: 12.345,
        available_difficulties: [{
          name: 'Hard',
          keys: 4,
          note_count: 100,
          audio_filename: 'audio.mp3',
          difficulty_rating: 47.97,
        }],
      }),
      config,
    )

    expect(result).toBe('12.35')
  })
})
