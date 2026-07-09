import { isTauri } from './environment'
import { fileInputCache } from './fileCache'

const MIRROR_BASE = 'https://api.nerinyan.moe'

export type RankStatus = 'ranked' | 'qualified' | 'loved' | 'pending' | 'wip' | 'graveyard'

export interface MirrorBeatmap {
  id: number
  version: string
  mode_int: number
  cs: number
  difficulty_rating: number
  total_length: number
  bpm?: number
}

export interface MirrorBeatmapSet {
  id: number
  artist: string
  title: string
  creator: string
  bpm: number
  status: RankStatus
  beatmaps: MirrorBeatmap[]
}

interface NerinyanBeatmap {
  id: number
  version: string
  mode_int: number
  cs: number
  difficulty_rating: number
  total_length: number
  bpm?: number
}

interface NerinyanSet {
  id: number
  artist: string
  title: string
  creator: string
  bpm: number
  status: string
  beatmaps: NerinyanBeatmap[]
}

export function coverUrl(setId: number): string {
  return `https://assets.ppy.sh/beatmaps/${setId}/covers/list.jpg`
}

export async function searchBeatmaps(
  query: string,
  status?: RankStatus,
  keys?: number,
  page: number = 1
): Promise<{ results: MirrorBeatmapSet[]; error: string | null }> {
  try {
    let raw: string

    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core')
      raw = await invoke<string>('search_mirror', { query, status: status || '', page })
    } else {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)
      const params = new URLSearchParams({ q: query, m: 'mania', p: String(page), ps: '20', sort: 'plays_desc' })
      if (status) params.set('s', status)
      const url = `${MIRROR_BASE}/search?${params}`
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)
      if (!res.ok) return { results: [], error: 'Search failed' }
      raw = await res.text()
    }

    const data: NerinyanSet[] = JSON.parse(raw)
    if (!Array.isArray(data)) return { results: [], error: null }

    let results: MirrorBeatmapSet[] = data
      .filter(s => s.beatmaps && s.beatmaps.some(b => b.mode_int === 3))
      .map(s => ({
        id: s.id,
        artist: s.artist,
        title: s.title,
        creator: s.creator,
        bpm: s.bpm,
        status: s.status as RankStatus,
        beatmaps: s.beatmaps
          .filter(b => b.mode_int === 3)
          .map(b => ({
            id: b.id,
            version: b.version,
            mode_int: b.mode_int,
            cs: b.cs,
            difficulty_rating: b.difficulty_rating,
            total_length: b.total_length,
            bpm: b.bpm,
          })),
      }))

    if (keys) {
      results = results
        .map(s => ({ ...s, beatmaps: s.beatmaps.filter(b => b.cs === keys) }))
        .filter(s => s.beatmaps.length > 0)
    }

    return { results, error: null }
  } catch {
    return { results: [], error: 'Could not reach the beatmap mirror' }
  }
}

export async function downloadBeatmapPath(setId: number): Promise<{ path: string | null; error: string | null }> {
  try {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core')
      const path = await invoke<string>('download_mirror_osz', { setId })
      return { path, error: null }
    }

    const url = `${MIRROR_BASE}/d/${setId}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) return { path: null, error: 'Download failed' }
    const blob = await res.blob()
    const file = new File([blob], `${setId}.osz`, { type: 'application/octet-stream' })
    fileInputCache.push(file)
    return { path: file.name, error: null }
  } catch {
    return { path: null, error: 'Download failed' }
  }
}
