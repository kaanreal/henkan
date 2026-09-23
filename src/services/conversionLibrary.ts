import type { ConvertDirection, ExportConfig, SourceFormat } from '../types/beatmap'

const DB_NAME = 'henkan-conversion-library'
const DB_VERSION = 1
const STORE_NAME = 'conversions'
const FALLBACK_KEY = 'henkan_conversion_library'
const MAX_RECORDS = 200

export type ConversionKind = 'beatmap' | 'pack' | 'skin'

export interface ConversionRecord {
  id: string
  kind: ConversionKind
  createdAt: number
  title: string
  artist: string
  creator: string
  sourceName: string
  sourceFormat: SourceFormat | null
  direction: ConvertDirection
  outputFormat: string
  outputNames: string[]
  outputPath: string | null
  itemCount: number
  difficulty: string | null
  sourcePath: string | null
  replay: ConversionReplay | null
}

export interface PackReplay {
  mode: 'osz' | 'folder'
  creator: string
  hp_drain: number
  overall_difficulty: number
  diff_name_template: string
  indices: number[]
  songConfigs: Array<{ index: number; config: ExportConfig }>
}

export interface ConversionReplay {
  sourcePath: string | null
  config: ExportConfig | null
  difficultyIndices: number[] | null
  separateSongs: boolean | null
  packSettings: PackReplay | null
  skinOptions: { hitPosition: number; columnWidth: number } | null
}

export type ConversionRecordInput = Omit<ConversionRecord, 'id' | 'createdAt' | 'sourcePath' | 'replay'> &
  Partial<Pick<ConversionRecord, 'sourcePath' | 'replay'>>

export interface ConversionReplayRequest {
  kind: ConversionKind
  sourcePath: string
  replay: ConversionReplay
}

function outputName(value: string): string {
  return value.split(/[/\\]+/).pop() || value
}

function normaliseRecord(value: Partial<ConversionRecord>): ConversionRecord | null {
  if (!value.id || !value.kind || !value.title || !value.direction) return null
  return {
    id: value.id,
    kind: value.kind,
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
    title: value.title,
    artist: value.artist || '',
    creator: value.creator || '',
    sourceName: value.sourceName || value.title,
    sourceFormat: value.sourceFormat || null,
    direction: value.direction,
    outputFormat: value.outputFormat || 'folder',
    outputNames: Array.isArray(value.outputNames) ? value.outputNames.filter(Boolean).map(outputName) : [],
    outputPath: value.outputPath || null,
    itemCount: typeof value.itemCount === 'number' ? value.itemCount : 1,
    difficulty: value.difficulty || null,
    sourcePath: value.sourcePath || null,
    replay: value.replay || null,
  }
}

function sortRecords(records: ConversionRecord[]): ConversionRecord[] {
  return records
    .map(record => normaliseRecord(record))
    .filter((record): record is ConversionRecord => record !== null)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, MAX_RECORDS)
}

function readFallback(): ConversionRecord[] {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? sortRecords(parsed) : []
  } catch {
    return []
  }
}

function writeFallback(records: ConversionRecord[]): void {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(records))
  } catch {
    // History is best effort when browser storage is unavailable.
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise(resolve => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function loadConversionRecords(): Promise<ConversionRecord[]> {
  const db = await openDatabase()
  if (!db) return readFallback()
  try {
    return await new Promise<ConversionRecord[]>(resolve => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll()
      request.onsuccess = () => resolve(sortRecords(request.result as ConversionRecord[]))
      request.onerror = () => resolve(readFallback())
    })
  } catch {
    return readFallback()
  } finally {
    db.close()
  }
}

export async function saveConversionRecords(records: ConversionRecord[]): Promise<void> {
  const cleanRecords = sortRecords(records)
  const db = await openDatabase()
  if (!db) {
    writeFallback(cleanRecords)
    return
  }
  try {
    const saved = await new Promise<boolean>(resolve => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      store.clear()
      for (const record of cleanRecords) store.put(record)
      transaction.oncomplete = () => resolve(true)
      transaction.onerror = () => resolve(false)
      transaction.onabort = () => resolve(false)
    })
    if (!saved) writeFallback(cleanRecords)
  } catch {
    writeFallback(cleanRecords)
  } finally {
    db.close()
  }
}

export function createConversionRecord(input: ConversionRecordInput): ConversionRecord {
  return {
    ...input,
    id: `conversion_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    outputNames: input.outputNames.filter(Boolean).map(outputName),
    itemCount: Math.max(1, input.itemCount),
    sourcePath: input.sourcePath || null,
    replay: input.replay || null,
  }
}

export { outputName }

let pendingReplay: ConversionReplayRequest | null = null

export function setPendingConversionReplay(request: ConversionReplayRequest): void {
  pendingReplay = request
}

export function consumePendingConversionReplay(): ConversionReplayRequest | null {
  const request = pendingReplay
  pendingReplay = null
  return request
}
