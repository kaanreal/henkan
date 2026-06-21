// TypeScript port of src-tauri/src/parsers/etterna.rs

import type { Note, TimingPoint, Beatmap, DiffInfo } from '../models'
import { createBeatmap, computeDuration } from '../models'

export function parseSm(content: string): Beatmap {
  const raw = content.replace(/\r\n/g, '\n')
  const headers = parseHeaders(raw)
  const sections = extractAllNotesSections(raw)

  let notesStr = ''
  let keys = 4
  if (sections.length > 0) {
    keys = detectKeys(sections[0])
    notesStr = sections[0]
  }

  const beatmap = createBeatmap(keys)
  beatmap.source_format = 'Etterna'

  beatmap.title = headers.get('TITLE') ?? ''
  beatmap.artist = headers.get('ARTIST') ?? ''
  beatmap.creator = headers.get('CREDIT') ?? ''
  beatmap.source = headers.get('GENRE') ?? ''

  beatmap.audio_filename = headers.get('MUSIC') ?? ''
  beatmap.background_filename = headers.get('BACKGROUND') ?? headers.get('BANNER') ?? null
  beatmap.banner_filename = headers.get('BANNER') ?? null

  const offset = parseFloat(headers.get('OFFSET') ?? '0') || 0
  const sampleStart = parseFloat(headers.get('SAMPLESTART') ?? '0') || 0
  beatmap.preview_time = sampleStart * 1000

  const bpmChanges = parseBpms(headers.get('BPMS') ?? '')
  const stops = parseStops(headers.get('STOPS') ?? '')

  beatmap.timing_points = buildTiming(bpmChanges, stops, offset)

  const notes = parseNotesData(notesStr, keys, bpmChanges, stops, offset)
  if (notes) beatmap.notes = notes

  const difficultyName = detectDifficulty(notesStr)
  if (difficultyName) beatmap.difficulty_name = difficultyName

  const audio = headers.get('MUSIC') ?? null
  beatmap.available_difficulties = sections.map(s => {
    const k = detectKeys(s)
    const count = countNotes(s)
    return {
      name: detectDifficulty(s),
      keys: k,
      note_count: count,
      audio_filename: audio,
    } as DiffInfo
  })

  computeDuration(beatmap)
  return beatmap
}

export function parseSmDifficulty(content: string, index: number): Beatmap {
  const raw = content.replace(/\r\n/g, '\n')
  const headers = parseHeaders(raw)
  const sections = extractAllNotesSections(raw)

  if (index >= sections.length) {
    throw new Error(`Difficulty index ${index} out of range (0..${sections.length})`)
  }

  const notesStr = sections[index]
  const keys = detectKeys(notesStr)

  const beatmap = createBeatmap(keys)
  beatmap.source_format = 'Etterna'

  beatmap.title = headers.get('TITLE') ?? ''
  beatmap.artist = headers.get('ARTIST') ?? ''
  beatmap.creator = headers.get('CREDIT') ?? ''
  beatmap.source = headers.get('GENRE') ?? ''
  beatmap.audio_filename = headers.get('MUSIC') ?? ''
  beatmap.background_filename = headers.get('BACKGROUND') ?? headers.get('BANNER') ?? null
  beatmap.banner_filename = headers.get('BANNER') ?? null

  const offset = parseFloat(headers.get('OFFSET') ?? '0') || 0
  const sampleStart = parseFloat(headers.get('SAMPLESTART') ?? '0') || 0
  beatmap.preview_time = sampleStart * 1000

  const bpmChanges = parseBpms(headers.get('BPMS') ?? '')
  const stops = parseStops(headers.get('STOPS') ?? '')
  beatmap.timing_points = buildTiming(bpmChanges, stops, offset)

  const notes = parseNotesData(notesStr, keys, bpmChanges, stops, offset)
  if (notes) beatmap.notes = notes

  const difficultyName = detectDifficulty(notesStr)
  if (difficultyName) beatmap.difficulty_name = difficultyName

  const audio = headers.get('MUSIC') ?? null
  beatmap.available_difficulties = sections.map(s => ({
    name: detectDifficulty(s),
    keys: detectKeys(s),
    note_count: countNotes(s),
    audio_filename: audio,
  } as DiffInfo))

  computeDuration(beatmap)
  return beatmap
}

function parseHeaders(content: string): Map<string, string> {
  const headers = new Map<string, string>()
  let rest = content

  while (true) {
    const hash = rest.indexOf('#')
    if (hash === -1) break

    const after = rest.slice(hash + 1)
    const colon = after.indexOf(':')
    if (colon === -1) break

    const key = after.slice(0, colon).trim().toUpperCase()
    const valuePart = after.slice(colon + 1)
    const end = valuePart.indexOf(';')
    const actualEnd = end === -1 ? valuePart.length : end

    if (key !== 'NOTES') {
      if (!headers.has(key)) {
        headers.set(key, valuePart.slice(0, actualEnd).trim())
      }
    }

    rest = valuePart.slice(Math.min(actualEnd, valuePart.length))
  }

  return headers
}

export function extractAllNotesSections(content: string): string[] {
  const sections: string[] = []
  let inNotes = false
  let depth = 0
  let current = ''

  for (const line of content.split('\n')) {
    const trimmed = line.trim()

    if (trimmed.startsWith('#NOTES:')) {
      if (inNotes) {
        current = ''
      }
      inNotes = true
      depth = 0
      current = ''
      continue
    }

    if (inNotes) {
      if (trimmed === ';') {
        if (depth === 0) {
          sections.push(current.trim())
          inNotes = false
          current = ''
          continue
        }
        depth--
      }
      current += line + '\n'
    }
  }

  return sections
}

function countNotes(notesSection: string): number {
  let count = 0
  for (const ch of notesSection) {
    if (ch === '1' || ch === '2' || ch === '3' || ch === '4') count++
  }
  return count
}

function detectKeys(notesSection: string): number {
  const firstLine = notesSection.split('\n')[0]?.trim().replace(/:/g, '').replace(/"/g, '').trim() ?? ''
  switch (firstLine) {
    case 'dance-single': return 4
    case 'dance-solo': return 6
    case 'dance-double': return 8
    case 'pump-single': return 5
    case 'pump-double': return 10
    case 'kb7-single':
    case 'kbx-single': return 7
    default: return 4
  }
}

function detectDifficulty(notesSection: string): string {
  const lines = notesSection.split('\n')
  if (lines.length > 1) {
    return lines[1].trim().replace(/:/g, '').replace(/"/g, '').trim()
  }
  return ''
}

function parseBpms(content: string): [number, number][] {
  const bpms: [number, number][] = []
  if (!content.trim()) {
    bpms.push([0, 120])
    return bpms
  }
  for (const part of content.split(',')) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const beat = parseFloat(trimmed.slice(0, eq).trim()) || 0
    const bpm = parseFloat(trimmed.slice(eq + 1).trim()) || 120
    bpms.push([beat, bpm])
  }
  bpms.sort((a, b) => a[0] - b[0])
  if (bpms.length === 0) bpms.push([0, 120])
  return bpms
}

function parseStops(content: string): [number, number][] {
  const stops: [number, number][] = []
  if (!content.trim()) return stops
  for (const part of content.split(',')) {
    const trimmed = part.trim()
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const beat = parseFloat(trimmed.slice(0, eq).trim()) || 0
    const seconds = parseFloat(trimmed.slice(eq + 1).trim()) || 0
    stops.push([beat, seconds])
  }
  return stops
}

function buildTiming(
  bpms: [number, number][],
  stops: [number, number][],
  offset: number,
): TimingPoint[] {
  const points: TimingPoint[] = []
  let currentTime = -offset * 1000

  for (let i = 0; i < bpms.length; i++) {
    const [beat, bpm] = bpms[i]

    if (i > 0) {
      const prevBeat = bpms[i - 1][0]
      const prevBpm = bpms[i - 1][1]
      const beatDiff = beat - prevBeat
      const msDiff = beatDiff * (60000 / prevBpm)

      const stopDuration = stops
        .filter(([sBeat]) => sBeat >= prevBeat && sBeat < beat)
        .reduce((sum, [, sec]) => sum + sec * 1000, 0)

      currentTime += msDiff + stopDuration
    }

    points.push({
      time_ms: currentTime,
      beat_length: 60000 / bpm,
      meter: 4,
      uninherited: true,
    })
  }

  return points
}

function parseNotesData(
  notesSection: string,
  keys: number,
  bpms: [number, number][],
  stops: [number, number][],
  offset: number,
): Note[] | null {
  const lines = notesSection
    .split('\n')
    .map(l => {
      const commentIdx = l.indexOf('//')
      return (commentIdx >= 0 ? l.slice(0, commentIdx) : l).trim()
    })
    .filter(l => l.length > 0)

  // Skip header fields (end with ':')
  let idx = 0
  let skipped = 0
  while (skipped < 5 && idx < lines.length && lines[idx].endsWith(':')) {
    idx++
    skipped++
  }
  if (skipped === 0) return null

  // Parse measures
  const measures: string[][] = []
  let current: string[] = []
  for (let i = idx; i < lines.length; i++) {
    const line = lines[i]
    if (line === ';') break
    if (line === ',') {
      measures.push(current)
      current = []
      continue
    }
    let row = line.replace(/[,;]$/, '')
    if (row) current.push(row)
    if (row.length !== line.length && line.endsWith(',')) {
      measures.push(current)
      current = []
    }
  }
  if (current.length > 0) measures.push(current)

  const notes: Note[] = []
  let beatsAccumulated = 0

  const inHold = new Array(keys).fill(false)
  const holdStartTime = new Array(keys).fill(0)

  for (const rows of measures) {
    if (rows.length === 0) {
      beatsAccumulated += 4
      continue
    }
    const rowsPerMeasure = rows.length

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const beatInMeasure = (rowIdx / rowsPerMeasure) * 4
      const currentBeat = beatsAccumulated + beatInMeasure
      const time = beatToMs(currentBeat, bpms, stops, offset)

      const row = rows[rowIdx]
      for (let col = 0; col < Math.min(row.length, keys); col++) {
        const ch = row[col]
        switch (ch) {
          case '1':
            if (inHold[col]) {
              notes.push({
                time_ms: holdStartTime[col],
                column: col,
                hold: true,
                hold_end_ms: time,
              })
              inHold[col] = false
            }
            notes.push({
              time_ms: time,
              column: col,
              hold: false,
              hold_end_ms: null,
            })
            break
          case '2':
            if (inHold[col]) {
              notes.push({
                time_ms: holdStartTime[col],
                column: col,
                hold: true,
                hold_end_ms: time,
              })
            }
            inHold[col] = true
            holdStartTime[col] = time
            break
          case '3':
            if (inHold[col]) {
              notes.push({
                time_ms: holdStartTime[col],
                column: col,
                hold: true,
                hold_end_ms: time,
              })
              inHold[col] = false
            }
            break
          case '4':
            if (inHold[col]) {
              notes.push({
                time_ms: holdStartTime[col],
                column: col,
                hold: true,
                hold_end_ms: time,
              })
            }
            inHold[col] = true
            holdStartTime[col] = time
            break
        }
      }
    }

    beatsAccumulated += 4
  }

  // Close any remaining holds
  for (let col = 0; col < keys; col++) {
    if (inHold[col]) {
      notes.push({
        time_ms: holdStartTime[col],
        column: col,
        hold: true,
        hold_end_ms: holdStartTime[col] + 1000,
      })
    }
  }

  notes.sort((a, b) => a.time_ms - b.time_ms)
  return notes
}

function beatToMs(
  beat: number,
  bpms: [number, number][],
  stops: [number, number][],
  offset: number,
): number {
  let time = -offset * 1000
  let prevBeat = 0

  for (let i = 0; i < bpms.length; i++) {
    const [bpmBeat, bpm] = bpms[i]
    if (beat <= bpmBeat) {
      const beatDiff = beat - prevBeat
      if (i > 0) {
        const prevBpm = bpms[i - 1][1]
        time += beatDiff * (60000 / prevBpm)
      } else {
        time += beatDiff * (60000 / bpm)
      }
      return time
    }

    const nextBeat = i + 1 < bpms.length ? bpms[i + 1][0] : beat

    const beatDiff = nextBeat - prevBeat
    time += beatDiff * (60000 / bpm)

    const stopDuration = stops
      .filter(([sBeat]) => sBeat >= prevBeat && sBeat < nextBeat)
      .reduce((sum, [, sec]) => sum + sec * 1000, 0)
    time += stopDuration

    prevBeat = nextBeat
  }

  return time
}
