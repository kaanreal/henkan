import { create } from 'zustand'
import type { DiffPreset } from '../lib/diffTemplate'
import { DEFAULT_PRESETS, generatePresetId } from '../lib/diffTemplate'

const STORAGE_KEY = 'henkan_diff_presets'
const VERSION_KEY = 'henkan_diff_presets_v'
const CURRENT_VERSION = 2

function loadPresets(): DiffPreset[] {
  try {
    const version = parseInt(localStorage.getItem(VERSION_KEY) ?? '0', 10)
    if (version < CURRENT_VERSION) {
      localStorage.removeItem(STORAGE_KEY)
      localStorage.setItem(VERSION_KEY, String(CURRENT_VERSION))
      return [...DEFAULT_PRESETS]
    }
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch { /* fall through */ }
  return [...DEFAULT_PRESETS]
}

function savePresets(presets: DiffPreset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
}

interface DiffPresetsState {
  presets: DiffPreset[]
  activePresetId: string | null

  setActivePreset: (id: string | null) => void
  addPreset: (name: string, template: string) => string
  updatePreset: (id: string, updates: Partial<Pick<DiffPreset, 'name' | 'template'>>) => void
  deletePreset: (id: string) => void
  reorderPresets: (fromIndex: number, toIndex: number) => void
  resetToDefaults: () => void
}

export const useDiffPresetsStore = create<DiffPresetsState>((set, get) => ({
  presets: loadPresets(),
  activePresetId: null,

  setActivePreset: (id) => set({ activePresetId: id }),

  addPreset: (name, template) => {
    const id = generatePresetId()
    const presets = [...get().presets, { id, name, template }]
    savePresets(presets)
    set({ presets, activePresetId: id })
    return id
  },

  updatePreset: (id, updates) => {
    const presets = get().presets.map(p =>
      p.id === id ? { ...p, ...updates } : p
    )
    savePresets(presets)
    set({ presets })
  },

  deletePreset: (id) => {
    const presets = get().presets.filter(p => p.id !== id)
    savePresets(presets)
    const activePresetId = get().activePresetId === id ? null : get().activePresetId
    set({ presets, activePresetId })
  },

  reorderPresets: (fromIndex, toIndex) => {
    const presets = [...get().presets]
    const [moved] = presets.splice(fromIndex, 1)
    presets.splice(toIndex, 0, moved)
    savePresets(presets)
    set({ presets })
  },

  resetToDefaults: () => {
    const presets = [...DEFAULT_PRESETS]
    savePresets(presets)
    set({ presets, activePresetId: null })
  },
}))
