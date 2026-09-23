import { create } from 'zustand'
import {
  createConversionRecord,
  loadConversionRecords,
  saveConversionRecords,
  type ConversionRecord,
  type ConversionRecordInput,
} from '../services/conversionLibrary'

type ConversionLibraryState = {
  records: ConversionRecord[]
  hydrating: boolean
  hydrate: () => Promise<void>
  remember: (input: ConversionRecordInput) => void
  remove: (id: string) => void
  clear: () => void
}

let persistQueue = Promise.resolve()

function persist(records: ConversionRecord[]): void {
  persistQueue = persistQueue.then(() => saveConversionRecords(records))
}

export const useConversionLibraryStore = create<ConversionLibraryState>((set, get) => ({
  records: [],
  hydrating: true,

  hydrate: async () => {
    try {
      const stored = await loadConversionRecords()
      const current = get().records
      if (current.length === 0) set({ records: stored })
      else if (stored.length > 0) {
        const merged = new Map(stored.map(record => [record.id, record]))
        current.forEach(record => merged.set(record.id, record))
        set({ records: [...merged.values()].sort((a, b) => b.createdAt - a.createdAt) })
      }
    } finally {
      set({ hydrating: false })
    }
  },

  remember: (input) => {
    const record = createConversionRecord(input)
    set(state => {
      const records = [record, ...state.records].slice(0, 200)
      persist(records)
      return { records }
    })
  },

  remove: (id) => {
    set(state => {
      const records = state.records.filter(record => record.id !== id)
      persist(records)
      return { records }
    })
  },

  clear: () => {
    set({ records: [] })
    persist([])
  },
}))

void useConversionLibraryStore.getState().hydrate()
