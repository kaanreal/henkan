import { create } from 'zustand'
import type { Beatmap, ConvertDirection, ExportConfig } from '../types/beatmap'

export interface QueueItem {
  id: string
  filePath: string
  fileName: string
  direction: ConvertDirection
  beatmap: Beatmap | null
  config: ExportConfig
  status: 'pending' | 'parsing' | 'ready' | 'converting' | 'completed' | 'error'
  error: string | null
  exportPath: string | null
}

interface QueueState {
  items: QueueItem[]
  activeId: string | null
  addItem: (item: QueueItem) => void
  removeItem: (id: string) => void
  setActiveId: (id: string | null) => void
  updateItem: (id: string, updates: Partial<QueueItem>) => void
  clearCompleted: () => void
  clearAll: () => void
}

function buildConfig(beatmap: Beatmap | null): ExportConfig {
  if (!beatmap) return emptyConfig()
  return {
    title: beatmap.title,
    artist: beatmap.artist,
    creator: beatmap.creator,
    difficulty_name: beatmap.difficulty_name,
    source: beatmap.source,
    tags: beatmap.tags,
    audio_filename: beatmap.audio_filename,
    background_filename: beatmap.background_filename,
    banner_filename: beatmap.banner_filename,
    cdtitle_filename: null,
    global_timing_ms: 50,
    output_format: beatmap.source_format === 'OsuMania' ? 'folder' : 'osz',
    hp_drain: 8,
    overall_difficulty: 8,
    preview_time: beatmap.preview_time,
    conversion_rate: 1,
    preserve_pitch: true,
    subtitle: null, title_translit: null, subtitle_translit: null,
    artist_translit: null, genre: null, credit: null,
    display_bpm: null, sample_start: null, sample_length: null, selectable: null,
    diff_name_template: null,
  }
}

function emptyConfig(): ExportConfig {
  return {
    title: '', artist: '', creator: '', difficulty_name: '',
    source: '', tags: '', audio_filename: '',
    background_filename: null, banner_filename: null,
    cdtitle_filename: null,
    global_timing_ms: 50, output_format: 'osz',
    hp_drain: 8, overall_difficulty: 8,
    preview_time: 0, conversion_rate: 1, preserve_pitch: true,
    subtitle: null, title_translit: null, subtitle_translit: null,
    artist_translit: null, genre: null, credit: null,
    display_bpm: null, sample_start: null, sample_length: null, selectable: null,
    diff_name_template: null,
  }
}

let _counter = 0
function generateId(): string {
  return `q_${Date.now()}_${++_counter}`
}

function detectDirection(path: string): ConvertDirection {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  return (ext === 'osu' || ext === 'osz') ? 'osu-to-etterna' : 'etterna-to-osu'
}

export const useQueueStore = create<QueueState>((set) => ({
  items: [],
  activeId: null,

  addItem: (item) => set((s) => ({ items: [...s.items, item] })),

  removeItem: (id) => set((s) => {
    const remaining = s.items.filter((i) => i.id !== id)
    return {
      items: remaining,
      activeId: s.activeId === id
        ? (remaining.length > 0 ? remaining[remaining.length - 1].id : null)
        : s.activeId,
    }
  }),

  setActiveId: (id) => set({ activeId: id }),

  updateItem: (id, updates) => set((s) => ({
    items: s.items.map((i) => (i.id === id ? { ...i, ...updates } : i)),
  })),

  clearCompleted: () => set((s) => {
    const remaining = s.items.filter((i) => i.status !== 'completed')
    return {
      items: remaining,
      activeId: s.activeId && !remaining.find((i) => i.id === s.activeId)
        ? (remaining.length > 0 ? remaining[remaining.length - 1].id : null)
        : s.activeId,
    }
  }),

  clearAll: () => set({ items: [], activeId: null }),
}))

export { buildConfig, emptyConfig, generateId, detectDirection }
