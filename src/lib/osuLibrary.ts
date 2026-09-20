import { isTauri } from '../services/environment'

export type OsuStatus = {
  supported: boolean
  installed: boolean
  running: boolean
  root: string | null
  songs: string | null
}

export type OsuLibrarySkin = {
  path: string
  name: string
  author: string
  fileCount: number
  archive: boolean
  backgroundPath: string | null
  previewRevision: string
}

export type OsuLibrary = {
  root: string
  skinsPath: string
  skins: OsuLibrarySkin[]
  scannedAt: number
}

export type OsuLibraryScanProgress = {
  phase: 'skins'
  completed: number
  total: number
}

export const OSU_LIBRARY_PROGRESS_EVENT = 'osu-library-progress'

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error('The osu! library only works in the desktop app.')
  const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
  return await tauriInvoke<T>(command, args)
}

export async function osuStatus(): Promise<OsuStatus> {
  if (!isTauri()) {
    return { supported: false, installed: false, running: false, root: null, songs: null }
  }
  return await invoke<OsuStatus>('osu_status')
}

export async function scanOsuLibrary(root?: string | null): Promise<OsuLibrary> {
  return await invoke<OsuLibrary>('osu_scan_library', { root: root || null })
}

export async function osuSkinBackground(path: string): Promise<string | null> {
  if (!isTauri()) return null
  return await invoke<string | null>('osu_skin_background', { path })
}
