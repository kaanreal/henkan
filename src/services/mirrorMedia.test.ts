import { describe, expect, it } from 'vitest'
import { parseOsuIds, parseOsuMeta, pickBestTitleMatch, fetchMissingMedia } from './mirrorMedia'
import type { Beatmap } from '../types/beatmap'
import type { MirrorBeatmapSet } from './beatmapMirror'

const osuWithIds = `osu file format v14

[General]
AudioFilename: audio.mp3

[Metadata]
Title:Test
Artist:Test
BeatmapID:4866217
BeatmapSetID:2282204

[TimingPoints]
`

const osuWithoutSetId = `osu file format v14

[General]
AudioFilename: audio.mp3

[Metadata]
Title:Test
Artist:Test
BeatmapID:4866217
BeatmapSetID:0

[TimingPoints]
`

const osuWithoutIds = `osu file format v14

[General]
AudioFilename: audio.mp3

[Metadata]
Title:Test
Artist:Test
BeatmapID:0
BeatmapSetID:-1

[TimingPoints]
`

function loneOsu(): Beatmap {
  return {
    title: 'Test', artist: 'Test', creator: 'Test', difficulty_name: 'Test',
    source: '', tags: '', audio_filename: 'audio.mp3', background_filename: 'bg.jpg',
    banner_filename: null, cdtitle_filename: null, source_dir: '.', source_file: 'test.osu',
    timing_points: [], sv_events: [], preview_time: 0, lead_in_ms: 0, keys: 4,
    notes: [], duration_ms: 0, difficulty_rating: null, source_format: 'OsuMania',
    available_difficulties: [],
  }
}

describe('parseOsuIds', () => {
  it('extracts BeatmapSetID and BeatmapID', () => {
    expect(parseOsuIds(osuWithIds)).toEqual({ setId: 2282204, beatmapId: 4866217 })
  })

  it('drops invalid or missing ids', () => {
    expect(parseOsuIds(osuWithoutSetId)).toEqual({ setId: null, beatmapId: 4866217 })
    expect(parseOsuIds(osuWithoutIds)).toEqual({ setId: null, beatmapId: null })
    expect(parseOsuIds('')).toEqual({ setId: null, beatmapId: null })
  })
})

describe('parseOsuMeta', () => {
  it('extracts Title and Artist', () => {
    expect(parseOsuMeta(osuWithIds)).toEqual({ title: 'Test', artist: 'Test' })
  })

  it('returns empty strings when missing', () => {
    expect(parseOsuMeta('')).toEqual({ title: '', artist: '' })
  })
})

function fakeSet(id: number, title: string, artist: string): MirrorBeatmapSet {
  return { id, title, artist, creator: 'c', bpm: 0, status: 'ranked', beatmaps: [] }
}

describe('pickBestTitleMatch', () => {
  it('returns null for an empty title', () => {
    expect(pickBestTitleMatch([fakeSet(1, 'Song', 'a')], '', 'a')).toBeNull()
  })

  it('rejects non-exact title matches', () => {
    const results = [fakeSet(1, 'Song', 'a'), fakeSet(2, 'Song Remix', 'b')]
    expect(pickBestTitleMatch(results, 'Song', 'b')?.id).toBe(1)
  })

  it('prefers an exact artist match among same-title sets', () => {
    const results = [fakeSet(1, 'Song', 'Other'), fakeSet(2, 'Song', 'Correct')]
    expect(pickBestTitleMatch(results, 'Song', 'Correct')?.id).toBe(2)
  })
})

describe('fetchMissingMedia', () => {
  it('returns null for non-.osu sources', async () => {
    const bm = loneOsu()
    bm.source_file = 'folder.sm'
    bm.source_format = 'Etterna'
    expect(await fetchMissingMedia(bm)).toBeNull()
  })

  it('returns null when the file cannot be read', async () => {
    expect(await fetchMissingMedia(loneOsu())).toBeNull()
  })
})
