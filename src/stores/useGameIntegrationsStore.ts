import { create } from 'zustand'
import {
  detectGameInstallations,
  type GameInstallations,
} from '../lib/gameIntegrations'

const PROMPT_KEY = 'henkan_game_integrations_prompted_v1'
const ENABLED_KEY = 'henkan_game_integrations_enabled_v1'

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    // Desktop integration still works for this session when storage is unavailable.
  }
}

type GameIntegrationsState = {
  installations: GameInstallations | null
  checked: boolean
  checking: boolean
  enabled: boolean
  promptSeen: boolean
  detect: () => Promise<void>
  accept: () => void
  dismiss: () => void
  setEnabled: (enabled: boolean) => void
}

export const useGameIntegrationsStore = create<GameIntegrationsState>((set, get) => ({
  installations: null,
  checked: false,
  checking: false,
  enabled: readFlag(ENABLED_KEY),
  promptSeen: readFlag(PROMPT_KEY),

  detect: async () => {
    if (get().checked || get().checking) return
    set({ checking: true })
    try {
      set({ installations: await detectGameInstallations(), checked: true })
    } catch {
      set({ installations: null, checked: true })
    } finally {
      set({ checking: false })
    }
  },

  accept: () => {
    writeFlag(PROMPT_KEY, true)
    writeFlag(ENABLED_KEY, true)
    set({ promptSeen: true, enabled: true })
  },

  dismiss: () => {
    writeFlag(PROMPT_KEY, true)
    writeFlag(ENABLED_KEY, false)
    set({ promptSeen: true, enabled: false })
  },

  setEnabled: (enabled) => {
    writeFlag(PROMPT_KEY, true)
    writeFlag(ENABLED_KEY, enabled)
    set({ promptSeen: true, enabled })
  },
}))
