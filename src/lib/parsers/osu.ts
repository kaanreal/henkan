// TypeScript port of src-tauri/src/parsers/osu.rs

import type { Note, TimingPoint, SVEvent, Beatmap, DiffInfo } from '../models'
import { createBeatmap, computeDuration, svMultiplier } from '../models'

export function parseOsu(content: string): Beatmap {
  const sections = splitSections(content)

  const general = parseGeneral(sections.get('General') ?? '')
  const metadata = parseMetadata(sections.get('Metadata') ?? '')
  const difficulty = parseDifficulty(sections.get('Difficulty') ?? '')
  const timingPoints = parseTimingPoints(sections.get('TimingPoints') ?? '')
  const hitObjects = parseHitObjects(sections.get('HitObjects') ?? '', difficulty.keys)

  const svEvents: SVEvent[] = timingPoints
    .filter(tp => !tp.uninherited)
    .map(tp => ({
      time_ms: tp.time_ms,
      multiplier: svMultiplier(tp),
    }))

  const bpmTiming: TimingPoint[] = timingPoints.filter(tp => tp.uninherited)

  const beatmap = createBeatmap(difficulty.keys)
  beatmap.title = metadata.title
  beatmap.artist = metadata.artist
  beatmap.creator = metadata.creator
  beatmap.difficulty_name = metadata.version
  beatmap.source = metadata.source
  beatmap.tags = metadata.tags
  beatmap.audio_filename = general.audio_filename
  beatmap.preview_time = general.preview_time
  beatmap.lead_in_ms = general.audio_lead_in
  beatmap.timing_points = bpmTiming
  beatmap.sv_events = svEvents
  beatmap.notes = hitObjects
  beatmap.source_format = 'OsuMania'

  // extract background from [Events]
  const events = sections.get('Events') ?? ''
  const bg = parseBackground(events)
  if (bg) beatmap.background_filename = bg

  computeDuration(beatmap)
  return beatmap
}

function splitSections(content: string): Map<string, string> {
  const sections = new Map<string, string>()
  let currentSection = ''
  let currentContent: string[] = []

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      if (currentSection) {
        sections.set(currentSection, currentContent.join('\n'))
      }
      currentSection = trimmed.slice(1, -1)
      currentContent = []
    } else if (trimmed && !trimmed.startsWith('//')) {
      currentContent.push(line)
    }
  }

  if (currentSection) {
    sections.set(currentSection, currentContent.join('\n'))
  }

  return sections
}

interface General {
  audio_filename: string
  audio_lead_in: number
  preview_time: number
  mode: number
}

function parseGeneral(content: string): General {
  const general: General = {
    audio_filename: '',
    audio_lead_in: 0,
    preview_time: 0,
    mode: 0,
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    const idx = trimmed.indexOf(':')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()

    switch (key) {
      case 'AudioFilename': general.audio_filename = value; break
      case 'AudioLeadIn': general.audio_lead_in = parseFloat(value) || 0; break
      case 'PreviewTime': general.preview_time = parseFloat(value) || 0; break
      case 'Mode': general.mode = parseInt(value) || 0; break
    }
  }

  return general
}

interface Metadata {
  title: string
  artist: string
  creator: string
  version: string
  source: string
  tags: string
}

function parseMetadata(content: string): Metadata {
  const meta: Metadata = {
    title: '',
    artist: '',
    creator: '',
    version: '',
    source: '',
    tags: '',
  }

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    const idx = trimmed.indexOf(':')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()

    switch (key) {
      case 'Title': meta.title = value; break
      case 'Artist': meta.artist = value; break
      case 'Creator': meta.creator = value; break
      case 'Version': meta.version = value; break
      case 'Source': meta.source = value; break
      case 'Tags': meta.tags = value; break
    }
  }

  return meta
}

function parseDifficulty(content: string): { keys: number } {
  let keys = 4
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    const idx = trimmed.indexOf(':')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    if (key === 'CircleSize') {
      keys = parseInt(value) || 4
    }
  }
  return { keys }
}

function parseTimingPoints(content: string): TimingPoint[] {
  const points: TimingPoint[] = []

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split(',')
    if (parts.length < 8) continue

    const time = parseFloat(parts[0].trim()) || 0
    const beat_length = parseFloat(parts[1].trim()) || 500
    const meter = parseInt(parts[2].trim()) || 4
    const uninherited = (parseInt(parts[6].trim()) || 0) !== 0

    points.push({ time_ms: time, beat_length, meter, uninherited })
  }

  points.sort((a, b) => a.time_ms - b.time_ms)
  return points
}

function parseHitObjects(content: string, keys: number): Note[] {
  const notes: Note[] = []

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split(',')
    if (parts.length < 5) continue

    const x = parseFloat(parts[0].trim()) || 0
    const time = parseFloat(parts[2].trim()) || 0
    const objType = parseInt(parts[3].trim()) || 0

    let column = Math.floor((x / 512) * keys)
    column = Math.min(column, keys - 1)

    const isHold = (objType & 128) !== 0

    let holdEnd: number | null = null
    if (isHold && parts.length > 5) {
      const extras = parts[5].trim()
      const endParts = extras.split(':')
      const parsed = parseFloat(endParts[0])
      if (!isNaN(parsed)) holdEnd = parsed
    }

    notes.push({
      time_ms: time,
      column,
      hold: isHold,
      hold_end_ms: holdEnd,
    })
  }

  notes.sort((a, b) => a.time_ms - b.time_ms)
  return notes
}

function parseBackground(eventsSection: string): string | null {
  for (const line of eventsSection.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('//')) continue
    if (!trimmed.startsWith('0,0,')) continue
    const rest = trimmed.slice(4)
    if (rest.startsWith('"')) {
      const endQuote = rest.indexOf('"', 1)
      if (endQuote > 1) {
        return rest.slice(1, endQuote)
      }
    }
  }
  return null
}

/**
 * Parse an .osz (zip) file in the browser. Returns the first beatmap +
 * all difficulty info, plus extracted media files as blobs.
 */
export async function parseOsz(
  file: File
): Promise<{
  beatmap: Beatmap
  entries: { filename: string; content: string }[]
  mediaFiles: Map<string, Blob>
}> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(file)

  const osuEntries: { filename: string; content: string }[] = []
  const mediaFiles = new Map<string, Blob>()

  for (const [name, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue
    const lower = name.toLowerCase()

    if (lower.endsWith('.osu')) {
      const text = await zipEntry.async('string')
      osuEntries.push({ filename: name, content: text })
    } else if (
      lower.endsWith('.mp3') || lower.endsWith('.ogg') || lower.endsWith('.wav') ||
      lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.gif')
    ) {
      const blob = await zipEntry.async('blob')
      mediaFiles.set(name, blob)
    }
  }

  if (osuEntries.length === 0) {
    throw new Error('No .osu file found in .osz')
  }

  // Parse all entries
  const parsed: { filename: string; content: string; beatmap: Beatmap }[] = []
  for (const entry of osuEntries) {
    try {
      const bm = parseOsu(entry.content)
      parsed.push({ ...entry, beatmap: bm })
    } catch { /* skip unparseable */ }
  }
  if (parsed.length === 0) {
    throw new Error('Failed to parse any .osu file in .osz')
  }

  // Sort by note density (easiest first)
  parsed.sort((a, b) => computeMeter(a.beatmap) - computeMeter(b.beatmap))

  const beatmap = { ...parsed[0].beatmap }
  beatmap.source_file = file.name

  // Collect all difficulties
  const diffs: DiffInfo[] = parsed.map(p => ({
    name: p.beatmap.difficulty_name,
    keys: p.beatmap.keys,
    note_count: p.beatmap.notes.length,
    audio_filename: p.beatmap.audio_filename || null,
  }))
  beatmap.available_difficulties = diffs

  computeDuration(beatmap)

  const sortedEntries = parsed.map(p => ({
    filename: p.filename,
    content: p.content,
  }))

  return { beatmap, entries: sortedEntries, mediaFiles }
}

function computeMeter(beatmap: Beatmap): number {
  const taps = beatmap.notes.filter(n => !n.hold).length
  const dur = beatmap.duration_ms / 1000
  if (dur > 0) {
    return Math.max(1, Math.round(taps / dur / 2))
  }
  return 1
}
