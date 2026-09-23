import { describe, expect, it } from 'vitest'
import {
  configForSeparateBeatmap,
  isOsuCompilationPack,
  normalizeCompilationMetadata,
  normalizeParsedOsuPackMetadata,
  packEntryMetadata,
} from './packMetadata'
import type { Beatmap, ExportConfig, PackEntry } from '../types/beatmap'

function beatmap(overrides: Partial<Beatmap>): Beatmap {
  return {
    title: 'Pack title', artist: 'Various Artists', creator: 'Mapper', difficulty_name: 'First song',
    source: '', tags: '', audio_filename: 'first.mp3', background_filename: 'first.jpg',
    banner_filename: null, cdtitle_filename: null, source_dir: '.', source_file: 'pack.osz',
    timing_points: [], sv_events: [], preview_time: 1000, lead_in_ms: 0, keys: 4,
    notes: [], duration_ms: 0, difficulty_rating: null, source_format: 'OsuMania',
    available_difficulties: [], ...overrides,
  }
}

function config(overrides: Partial<ExportConfig>): ExportConfig {
  return {
    title: 'Pack title', artist: 'Various Artists', creator: 'Mapper', difficulty_name: 'First song',
    source: '', tags: '', audio_filename: 'first.mp3', background_filename: 'first.jpg',
    banner_filename: null, cdtitle_filename: null, global_timing_ms: 50, output_format: 'folder',
    hp_drain: 8, overall_difficulty: 8, preview_time: 1000, conversion_rate: 1,
    preserve_pitch: true, subtitle: 'First song', title_translit: null, subtitle_translit: null,
    artist_translit: null, genre: null, credit: null, display_bpm: null, sample_start: null,
    sample_length: null, selectable: null, diff_name_template: null, ...overrides,
  }
}

function entry(title: string, difficulty: string, audio: string): PackEntry {
  return {
    source_file: `${difficulty}.osu`,
    source_dir: '.',
    title,
    artist: 'Various Artists',
    background_filename: null,
    banner_filename: null,
    available_difficulties: [{
      name: difficulty,
      keys: 4,
      note_count: 100,
      audio_filename: audio,
      difficulty_rating: null,
    }],
  }
}

describe('osu compilation pack metadata', () => {
  it('uses each parsed osu file metadata when exporting separate songs', () => {
    const target = beatmap({
      title: 'Second title',
      artist: 'Second artist',
      creator: 'Second mapper',
      difficulty_name: 'Second song',
      source: 'Second source',
      tags: 'second tags',
      audio_filename: 'second.mp3',
      background_filename: 'second.jpg',
      preview_time: 2000,
    })

    expect(configForSeparateBeatmap(config({}), target)).toMatchObject({
      title: 'Second song',
      artist: 'Second artist',
      creator: 'Second mapper',
      difficulty_name: 'Second song',
      source: 'Second source',
      tags: 'second tags',
      audio_filename: 'second.mp3',
      background_filename: 'second.jpg',
      preview_time: 2000,
      subtitle: 'Second title',
    })
  })

  it('does not copy edits from the selected chart into the other songs', () => {
    const target = beatmap({
      title: 'Second title',
      artist: 'Second artist',
      creator: 'Second mapper',
      difficulty_name: 'Second song',
    })

    expect(configForSeparateBeatmap(config({
      title: 'Selected title edit',
      artist: 'Selected artist edit',
      creator: 'Selected mapper edit',
      subtitle: 'Selected subtitle edit',
      credit: 'Selected credit edit',
      conversion_rate: 1.2,
    }), target)).toMatchObject({
      title: 'Second song',
      artist: 'Second artist',
      creator: 'Second mapper',
      difficulty_name: 'Second song',
      subtitle: 'Second title',
      credit: null,
      conversion_rate: 1.2,
    })
  })

  it('detects one shared title with different audio files', () => {
    const entries = [
      entry('Community Pack 3', 'Artist A - First Song', 'first.mp3'),
      entry('Community Pack 3', 'Artist B - Second Song', 'second.mp3'),
    ]

    expect(isOsuCompilationPack(entries)).toBe(true)
    expect(packEntryMetadata(entries[0], true)).toMatchObject({
      title: 'Artist A - First Song',
      subtitle: 'Community Pack 3',
      difficultyName: 'Artist A - First Song',
      audioFilename: 'first.mp3',
    })
    expect(entries.map(item => packEntryMetadata(item, true))).toMatchObject([
      { title: 'Artist A - First Song', subtitle: 'Community Pack 3' },
      { title: 'Artist B - Second Song', subtitle: 'Community Pack 3' },
    ])
  })

  it('does not change a normal multi-difficulty beatmap set', () => {
    const entries = [
      entry('One Song', 'Hard', 'audio.mp3'),
      entry('One Song', 'Insane', 'audio.mp3'),
    ]

    expect(isOsuCompilationPack(entries)).toBe(false)
    expect(packEntryMetadata(entries[0], false)).toMatchObject({
      title: 'One Song',
      subtitle: null,
    })
  })

  it('does not treat a folder of unrelated beatmap sets as one compilation map', () => {
    const entries = [
      entry('First Song', 'Hard', 'first.mp3'),
      entry('Second Song', 'Hard', 'second.mp3'),
    ]

    expect(isOsuCompilationPack(entries)).toBe(false)
  })

  it('repairs metadata copied from another chart before export', () => {
    const entries = [
      entry('Community Pack 3', 'Artist A - First Song', 'first.mp3'),
      entry('Community Pack 3', 'Artist B - Second Song', 'second.mp3'),
    ]

    expect(normalizeCompilationMetadata(entries[1], entries, {
      title: 'Community Pack 3',
      subtitle: 'Artist A - First Song',
      difficulty_name: '',
      audio_filename: '',
    })).toEqual({
      title: 'Artist B - Second Song',
      subtitle: 'Community Pack 3',
      difficulty_name: 'Artist B - Second Song',
      audio_filename: 'second.mp3',
    })
  })

  it('keeps custom review edits', () => {
    const entries = [
      entry('Community Pack 3', 'Artist A - First Song', 'first.mp3'),
      entry('Community Pack 3', 'Artist B - Second Song', 'second.mp3'),
    ]

    expect(normalizeCompilationMetadata(entries[1], entries, {
      title: 'My edited title',
      subtitle: 'My edited subtitle',
      difficulty_name: 'Custom chart name',
      audio_filename: 'custom.mp3',
    })).toEqual({
      title: 'My edited title',
      subtitle: 'My edited subtitle',
      difficulty_name: 'Custom chart name',
      audio_filename: 'custom.mp3',
    })
  })

  it('repairs first-chart metadata from the parsed osu file before conversion', () => {
    const entries = [
      entry('200+ chordjack practice pack 4', 'ANGUISH, wiu, zyzek, ily - Klamstwo [The blue frawog]', '14.mp3'),
      entry('200+ chordjack practice pack 4', 'Envy - nevermore. [The blue frawog]', '8.mp3'),
    ]

    expect(normalizeParsedOsuPackMetadata({
      title: '200+ chordjack practice pack 4',
      difficulty_name: 'Envy - nevermore. [The blue frawog]',
      audio_filename: '8.mp3',
    }, entries, {
      title: '200+ chordjack practice pack 4',
      subtitle: 'ANGUISH, wiu, zyzek, ily - Klamstwo [The blue frawog]',
      difficulty_name: 'Envy - nevermore. [The blue frawog]',
      audio_filename: '8.mp3',
    })).toEqual({
      title: 'Envy - nevermore. [The blue frawog]',
      subtitle: '200+ chordjack practice pack 4',
      difficulty_name: 'Envy - nevermore. [The blue frawog]',
      audio_filename: '8.mp3',
    })
  })
})
