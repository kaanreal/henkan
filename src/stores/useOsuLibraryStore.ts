import { create } from 'zustand'
import { osuStatus, scanOsuLibrary, OSU_LIBRARY_PROGRESS_EVENT, type OsuLibrary, type OsuLibraryScanProgress, type OsuStatus } from '../lib/osuLibrary'
import { isTauri } from '../services/environment'

const PROMPT_KEY = 'henkan_osu_library_prompted'
const LIBRARY_DB = 'henkan-osu-library'
const LIBRARY_STORE = 'library'
const LIBRARY_RECORD = 'current'

function promptWasSeen(): boolean {
  try {
    return localStorage.getItem(PROMPT_KEY) === '1'
  } catch {
    return false
  }
}

function openLibraryDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(LIBRARY_DB, 1)
      request.onupgradeneeded = () => {
        request.result.createObjectStore(LIBRARY_STORE)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function loadPersistedLibrary(): Promise<OsuLibrary | null> {
  const db = await openLibraryDb()
  if (!db) return null
  try {
    return await new Promise<OsuLibrary | null>((resolve) => {
      const request = db.transaction(LIBRARY_STORE, 'readonly').objectStore(LIBRARY_STORE).get(LIBRARY_RECORD)
      request.onsuccess = () => {
        const value = request.result as Partial<OsuLibrary> | undefined
        if (!value?.root || !Array.isArray(value.skins)) {
          resolve(null)
          return
        }
        resolve({
          root: value.root,
          skinsPath: value.skinsPath || `${value.root}/Skins`,
          skins: value.skins.map(skin => ({
            ...skin,
            backgroundPath: skin.backgroundPath || null,
            previewRevision: skin.previewRevision || `legacy-${skin.fileCount}-${skin.archive ? 'archive' : 'folder'}`,
          })),
          scannedAt: value.scannedAt || 0,
        })
      }
      request.onerror = () => resolve(null)
    })
  } catch {
    return null
  } finally {
    db.close()
  }
}

async function savePersistedLibrary(library: OsuLibrary): Promise<void> {
  const db = await openLibraryDb()
  if (!db) return
  try {
    await new Promise<void>((resolve) => {
      const transaction = db.transaction(LIBRARY_STORE, 'readwrite')
      transaction.objectStore(LIBRARY_STORE).put(library, LIBRARY_RECORD)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
      transaction.onabort = () => resolve()
    })
  } catch {
    // The in-memory index remains available when browser storage is unavailable.
  } finally {
    db.close()
  }
}

type OsuLibraryState = {
  library: OsuLibrary | null
  status: OsuStatus | null
  scanning: boolean
  scanProgress: OsuLibraryScanProgress | null
  hydrating: boolean
  error: string | null
  promptSeen: boolean
  hydrate: () => Promise<void>
  refreshStatus: () => Promise<OsuStatus | null>
  scan: (root?: string | null) => Promise<OsuLibrary | null>
  markPromptSeen: () => void
  clearError: () => void
}

export const useOsuLibraryStore = create<OsuLibraryState>((set, get) => ({
  library: null,
  status: null,
  scanning: false,
  scanProgress: null,
  hydrating: true,
  error: null,
  promptSeen: promptWasSeen(),

  hydrate: async () => {
    try {
      const library = await loadPersistedLibrary()
      if (library && !get().library) {
        set({ library, promptSeen: true })
        void savePersistedLibrary(library)
      }
    } finally {
      set({ hydrating: false })
    }
  },

  refreshStatus: async () => {
    try {
      const status = await osuStatus()
      set({ status })
      return status
    } catch {
      set({ status: null })
      return null
    }
  },

  scan: async (root) => {
    set({ scanning: true, scanProgress: null, error: null })
    let stopListening: (() => void) | null = null
    try {
      if (isTauri()) {
        try {
          const { listen } = await import('@tauri-apps/api/event')
          stopListening = await listen<OsuLibraryScanProgress>(OSU_LIBRARY_PROGRESS_EVENT, event => {
            set({ scanProgress: event.payload })
          })
        } catch {
          // Scanning still works when progress events are unavailable.
        }
      }
      const library = await scanOsuLibrary(root)
      set({ library, scanning: false })
      get().markPromptSeen()
      void savePersistedLibrary(library)
      return library
    } catch (error) {
      set({ scanning: false, error: error instanceof Error ? error.message : String(error) })
      return null
    } finally {
      stopListening?.()
      set({ scanning: false })
    }
  },

  markPromptSeen: () => {
    try {
      localStorage.setItem(PROMPT_KEY, '1')
    } catch {
      // Prompt state is best effort when storage is unavailable.
    }
    set({ promptSeen: true })
  },

  clearError: () => set({ error: null }),
}))

void useOsuLibraryStore.getState().hydrate()
