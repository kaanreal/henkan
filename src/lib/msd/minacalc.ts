import { makeWasiStubs } from './wasi'

export const MSD_KEYCOUNTS = [4, 6, 7] as const

export const MSD_SKILLSET_KEYS = [
  'overall',
  'stream',
  'jumpstream',
  'handstream',
  'stamina',
  'jackspeed',
  'chordjack',
  'technical',
] as const

export type MsdRating = Record<(typeof MSD_SKILLSET_KEYS)[number], number>

export type MsdRow = { mask: number; timeSec: number }

type MinacalcExports = {
  memory: WebAssembly.Memory
  _initialize?: () => void
  msd_version: () => number
  msd_create: () => number
  msd_destroy: (calc: number) => void
  msd_compute: (
    calc: number,
    masksPtr: number,
    timesPtr: number,
    numRows: number,
    keycount: number,
    musicRate: number,
    outPtr: number,
  ) => number
  malloc: (size: number) => number
  free: (ptr: number) => void
}

export type Minacalc = {
  version: number
  compute: (rows: MsdRow[], keyCount: number, rate?: number) => MsdRating
}

export function msdSupportsKeyCount(keyCount: number): boolean {
  return (MSD_KEYCOUNTS as readonly number[]).includes(keyCount)
}

export async function loadMinacalc(wasmBytes: BufferSource): Promise<Minacalc> {
  let memory: WebAssembly.Memory | null = null
  const { instance } = await WebAssembly.instantiate(wasmBytes, {
    wasi_snapshot_preview1: makeWasiStubs(() => memory!),
  })
  const ex = instance.exports as unknown as MinacalcExports
  memory = ex.memory
  ex._initialize?.()

  const calc = ex.msd_create()

  const compute = (rows: MsdRow[], keyCount: number, rate = 1): MsdRating => {
    const n = rows.length
    const masksPtr = ex.malloc(Math.max(4, n * 4))
    const timesPtr = ex.malloc(Math.max(4, n * 4))
    const outPtr = ex.malloc(8 * 4)
    try {
      const masks = new Uint32Array(ex.memory.buffer, masksPtr, n)
      const times = new Float32Array(ex.memory.buffer, timesPtr, n)
      for (let i = 0; i < n; i++) {
        masks[i] = rows[i].mask
        times[i] = rows[i].timeSec
      }
      ex.msd_compute(calc, masksPtr, timesPtr, n, keyCount, rate, outPtr)
      const out = new Float32Array(ex.memory.buffer, outPtr, 8)
      const rating = {} as MsdRating
      MSD_SKILLSET_KEYS.forEach((key, i) => {
        const value = out[i]
        rating[key] = Number.isFinite(value) ? Math.max(0, value) : 0
      })
      return rating
    } finally {
      ex.free(masksPtr)
      ex.free(timesPtr)
      ex.free(outPtr)
    }
  }

  return { version: ex.msd_version(), compute }
}

export function notesToMsdRows(
  notes: { column: number; startTime: number }[],
  keyCount: number,
): MsdRow[] {
  const byTime = new Map<number, number>()
  for (const note of notes) {
    if (note.column < 0 || note.column >= keyCount) continue
    const ms = Math.round(note.startTime)
    byTime.set(ms, (byTime.get(ms) ?? 0) | (1 << note.column))
  }
  return [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ms, mask]) => ({ mask, timeSec: ms / 1000 }))
}
