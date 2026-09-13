/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { loadMinacalc, msdSupportsKeyCount, notesToMsdRows } from './minacalc'

const wasmBytes = readFileSync(new URL('./minacalc.wasm', import.meta.url))
const calcPromise = loadMinacalc(wasmBytes)

function streamNotes(seconds: number, notesPerSecond: number) {
  return Array.from({ length: Math.floor(seconds * notesPerSecond) }, (_, i) => ({
    column: [0, 2, 1, 3][i % 4],
    startTime: (i * 1000) / notesPerSecond,
  }))
}

describe('web minacalc', () => {
  it('loads the same calculator version as the native path', async () => {
    expect((await calcPromise).version).toBe(515)
  })

  it('returns a real rating for a 4K stream', async () => {
    const calc = await calcPromise
    const rows = notesToMsdRows(streamNotes(30, 6), 4)
    const rating = calc.compute(rows, 4)
    expect(rating.overall).toBeGreaterThan(3)
    expect(rating.overall).toBeLessThan(40)
  })

  it('keeps the row masks deterministic and merges simultaneous notes', () => {
    expect(notesToMsdRows([
      { column: 0, startTime: 1000 },
      { column: 3, startTime: 1000.2 },
      { column: 1, startTime: 1500 },
    ], 4)).toEqual([
      { mask: 0b1001, timeSec: 1 },
      { mask: 0b0010, timeSec: 1.5 },
    ])
  })

  it('supports only the keymodes MinaCalc can rate', () => {
    expect(msdSupportsKeyCount(4)).toBe(true)
    expect(msdSupportsKeyCount(6)).toBe(true)
    expect(msdSupportsKeyCount(7)).toBe(true)
    expect(msdSupportsKeyCount(5)).toBe(false)
  })
})
