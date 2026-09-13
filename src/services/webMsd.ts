import type { Beatmap, DiffInfo, Note } from '../types/beatmap'
import {
  msdSupportsKeyCount,
  notesToMsdRows,
  type MsdRating,
} from '../lib/msd/minacalc'
import type { MsdWorkerRequest, MsdWorkerResponse } from '../lib/msd/msdWorker'

type Pending = { resolve: (rating: MsdRating | null) => void }

let worker: Worker | null = null
let workerFailed = false
let nextId = 1
const pending = new Map<number, Pending>()

function getWorker(): Worker | null {
  if (workerFailed || typeof Worker === 'undefined') return null
  if (!worker) {
    try {
      worker = new Worker(new URL('../lib/msd/msdWorker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<MsdWorkerResponse>) => {
        const entry = pending.get(event.data.id)
        if (!entry) return
        pending.delete(event.data.id)
        entry.resolve(event.data.rating)
      }
      worker.onerror = () => {
        workerFailed = true
        for (const entry of pending.values()) entry.resolve(null)
        pending.clear()
        worker?.terminate()
        worker = null
      }
    } catch {
      workerFailed = true
      return null
    }
  }
  return worker
}

export function requestMsd(notes: Note[], keyCount: number): Promise<MsdRating | null> {
  if (!msdSupportsKeyCount(keyCount)) return Promise.resolve(null)
  const rows = notesToMsdRows(
    notes.map(note => ({ column: note.column, startTime: note.time_ms })),
    keyCount,
  )
  if (rows.length <= 1) return Promise.resolve(null)
  const currentWorker = getWorker()
  if (!currentWorker) return Promise.resolve(null)

  return new Promise((resolve) => {
    const id = nextId++
    pending.set(id, { resolve })
    currentWorker.postMessage({ id, rows, keyCount } satisfies MsdWorkerRequest)
  })
}

export async function enrichBeatmapMsd(beatmap: Beatmap): Promise<Beatmap> {
  if (beatmap.difficulty_rating != null) return beatmap
  const rating = await requestMsd(beatmap.notes, beatmap.keys)
  if (!rating) return beatmap
  return { ...beatmap, difficulty_rating: rating.overall }
}

export function diffInfoFromBeatmap(beatmap: Beatmap): DiffInfo {
  return {
    name: beatmap.difficulty_name,
    keys: beatmap.keys,
    note_count: beatmap.notes.length,
    audio_filename: beatmap.audio_filename || null,
    difficulty_rating: beatmap.difficulty_rating ?? null,
  }
}
