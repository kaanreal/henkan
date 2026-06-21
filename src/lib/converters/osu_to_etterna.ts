// TypeScript port of src-tauri/src/converters/osu_to_etterna.rs

import type { Beatmap, TimingPoint } from '../models'

export function convertOsuToEtterna(beatmap: Beatmap, globalTimingMs: number): string {
  const tps = beatmap.timing_points

  // compute beat shift so earliest note/timing-point lands at beat 0
  const offset = computeOffset(beatmap)
  const offsetMs = offset * 1000
  const beatShift = -msToBeat(offsetMs, tps)

  // Global timing correction
  const displayOffset = offset + (globalTimingMs / 1000)

  let out = ''

  // ── headers ──
  out += `#TITLE:${escape(beatmap.title)};\n`
  out += `#SUBTITLE:${escape(beatmap.difficulty_name)};\n`
  out += `#ARTIST:${escape(beatmap.artist)};\n`
  out += `#TITLETRANSLIT:${escape(beatmap.title)};\n`
  out += `#SUBTITLETRANSLIT:${escape(beatmap.difficulty_name)};\n`
  out += `#ARTISTTRANSLIT:${escape(beatmap.artist)};\n`
  out += `#GENRE:${escape(beatmap.source)};\n`
  out += `#CREDIT:${escape(beatmap.creator)};\n`
  out += `#MUSIC:${escape(beatmap.audio_filename)};\n`

  if (beatmap.background_filename) {
    out += '#BACKGROUND:bg.jpg;\n'
  }
  if (beatmap.banner_filename || beatmap.background_filename) {
    out += '#BANNER:banner.jpg;\n'
  }

  const smOffset = displayOffset === 0 ? 0 : -displayOffset
  out += `#OFFSET:${smOffset.toFixed(3)};\n`
  out += `#SAMPLESTART:${(beatmap.preview_time / 1000).toFixed(3)};\n`
  out += '#SAMPLELENGTH:10.000;\n'
  out += '#SELECTABLE:YES;\n'

  // ── BPMS ──
  const bpms = computeBpms(beatmap, beatShift)
  out += '#BPMS:'
  out += bpms.map(([b, bpm]) => `${b.toFixed(3)}=${bpm.toFixed(3)}`).join(',')
  out += ';\n'

  // ── STOPS ──
  out += '#STOPS:;\n'

  // ── BGCHANGES / FGCHANGES ──
  out += '#BGCHANGES:;\n'
  out += '#FGCHANGES:;\n'

  // ── NOTES ──
  const stepType = (() => {
    switch (beatmap.keys) {
      case 4: return 'dance-single'
      case 5: return 'pump-single'
      case 6: return 'dance-solo'
      case 7: return 'kb7-single'
      case 8: return 'dance-double'
      case 10: return 'pump-double'
      default: return 'dance-single'
    }
  })()

  const diffName = beatmap.difficulty_name || 'Converted'
  const meter = computeMeter(beatmap)
  const radar = computeRadarValues(beatmap)

  out += '#NOTES:\n'
  out += `    ${stepType}:\n`
  out += `    ${diffName}:\n`
  out += '    Challenge:\n'
  out += `    ${meter}:\n`
  out += `    ${radar.map(v => v.toFixed(3)).join(',')}:\n`

  const measures = notesToMeasures(beatmap, beatShift)
  out += measures
  out += ';\n'

  return out
}

// ── helpers ──

function escape(s: string): string {
  return s.replace(/;/g, '\\;').replace(/\n/g, ' ').replace(/\r/g, '')
}

function computeOffset(beatmap: Beatmap): number {
  const firstTp = beatmap.timing_points.find(tp => tp.uninherited && tp.beat_length > 0)

  if (firstTp) {
    const time = firstTp.time_ms
    if (time <= 0) return time / 1000
    const measureMs = firstTp.beat_length * 4
    const n = Math.ceil(time / measureMs)
    return (time - n * measureMs) / 1000
  }

  const firstNote = beatmap.notes.reduce(
    (min, n) => Math.min(min, n.time_ms),
    Infinity
  )
  if (firstNote === Infinity) return 0
  if (firstNote <= 0) return firstNote / 1000
  const measureMs = 500 * 4 // 120 BPM fallback
  const n = Math.ceil(firstNote / measureMs)
  return (firstNote - n * measureMs) / 1000
}

function computeBpms(beatmap: Beatmap, beatShift: number): [number, number][] {
  const bpms: [number, number][] = []
  const tps = beatmap.timing_points

  if (tps.length === 0) return [[0, 120]]

  for (const tp of tps) {
    if (tp.uninherited && tp.beat_length > 0) {
      const bpm = 60000 / tp.beat_length
      const beat = msToBeat(tp.time_ms, tps) + beatShift
      bpms.push([beat, bpm])
    }
  }

  if (bpms.length === 0) bpms.push([0, 120])

  // force first BPM to beat 0
  if (bpms.length > 0) bpms[0][0] = 0

  return bpms
}

function msToBeat(timeMs: number, tps: TimingPoint[]): number {
  if (tps.length === 0) return timeMs / 500

  const relevant = tps.filter(tp => tp.uninherited && tp.beat_length > 0)
  if (relevant.length === 0) return timeMs / 500

  if (timeMs <= relevant[0].time_ms) {
    const bpm = 60000 / relevant[0].beat_length
    return (timeMs - relevant[0].time_ms) * bpm / 60000
  }

  let beat = 0
  for (let i = 0; i < relevant.length - 1; i++) {
    const cur = relevant[i]
    const next = relevant[i + 1]
    if (timeMs <= next.time_ms) {
      const dt = timeMs - cur.time_ms
      beat += dt / cur.beat_length
      return beat
    }
    const dt = next.time_ms - cur.time_ms
    beat += dt / cur.beat_length
  }

  const last = relevant[relevant.length - 1]
  const dt = timeMs - last.time_ms
  beat += dt / last.beat_length
  return beat
}

function computeRadarValues(beatmap: Beatmap): [number, number, number, number, number] {
  const dur = beatmap.duration_ms / 1000
  if (dur <= 0 || beatmap.notes.length === 0) return [0, 0, 0, 0, 0]

  const taps = beatmap.notes.filter(n => !n.hold).length
  const stream = Math.max(0, Math.min(1, taps / dur / 12))

  const timeCounts = new Map<number, number>()
  for (const note of beatmap.notes) {
    const key = Math.round(note.time_ms * 100)
    timeCounts.set(key, (timeCounts.get(key) ?? 0) + 1)
  }
  let simultaneous = 0
  for (const count of timeCounts.values()) {
    if (count >= 2) simultaneous++
  }
  const totalSlots = timeCounts.size
  const voltage = totalSlots > 0 ? Math.max(0, Math.min(1, simultaneous / totalSlots * 2)) : 0

  let holdMs = 0
  for (const n of beatmap.notes) {
    if (n.hold_end_ms !== null) holdMs += n.hold_end_ms - n.time_ms
  }
  const freeze = Math.max(0, Math.min(1, holdMs / beatmap.duration_ms))

  const air = Math.max(0, Math.min(1, 1 - taps / dur / 8))

  const chaos = Math.max(0, Math.min(1, (stream + voltage + air + freeze) / 4))

  return [stream, voltage, air, freeze, chaos]
}

export function computeMeter(beatmap: Beatmap): number {
  const taps = beatmap.notes.filter(n => !n.hold).length
  const dur = beatmap.duration_ms / 1000
  if (dur > 0) {
    return Math.max(1, Math.round(taps / dur / 2))
  }
  return 1
}

const SLOTS_PER_BEAT = 192
const SLOTS_PER_MEASURE = SLOTS_PER_BEAT * 4

function notesToMeasures(beatmap: Beatmap, beatShift: number): string {
  if (beatmap.notes.length === 0) return '0000\n'

  const keys = beatmap.keys
  const tps = beatmap.timing_points

  const slotOf = (timeMs: number): number => {
    const beat = msToBeat(timeMs, tps) + beatShift
    return Math.round(beat * SLOTS_PER_BEAT)
  }

  const end = beatmap.notes.reduce(
    (max, n) => Math.max(max, n.hold_end_ms ?? n.time_ms),
    0
  )
  const numMeas = Math.max(1, Math.floor(slotOf(end) / SLOTS_PER_MEASURE) + 1)

  // Initialize grid
  const grid: string[][][] = []
  for (let m = 0; m < numMeas; m++) {
    const measure: string[][] = []
    for (let s = 0; s < SLOTS_PER_MEASURE; s++) {
      measure.push(new Array(keys).fill('0'))
    }
    grid.push(measure)
  }

  const place = (slot: number, col: number, ch: string): boolean => {
    if (slot < 0) return false
    const mi = Math.floor(slot / SLOTS_PER_MEASURE)
    if (mi >= numMeas) return false
    const si = slot % SLOTS_PER_MEASURE
    grid[mi][si][col] = ch
    return true
  }

  for (const note of beatmap.notes) {
    const col = note.column
    if (col >= keys) continue
    const s = slotOf(note.time_ms)

    if (note.hold && note.hold_end_ms !== null) {
      const e = slotOf(note.hold_end_ms)
      if (e <= s) {
        place(s, col, '1')
      } else if (place(s, col, '2')) {
        place(e, col, '3')
      }
    } else {
      place(s, col, '1')
    }
  }

  // Compress each measure
  const ROW_COUNTS = [4, 8, 12, 16, 24, 32, 48, 64, 96, 192, 384, 768]
  let out = ''

  for (let i = 0; i < numMeas; i++) {
    const measure = grid[i]
    const occupied: number[] = []
    for (let si = 0; si < SLOTS_PER_MEASURE; si++) {
      if (measure[si].some(c => c !== '0')) occupied.push(si)
    }

    const rows = ROW_COUNTS.find(r => {
      const step = SLOTS_PER_MEASURE / r
      return occupied.every(si => si % step === 0)
    }) ?? 768

    const step = SLOTS_PER_MEASURE / rows
    for (let ri = 0; ri < rows; ri++) {
      out += measure[ri * step].join('') + '\n'
    }
    if (i < numMeas - 1) out += ',\n'
  }

  return out
}
