import i18n from '../i18n'
import { isTauri } from './environment'
import { fileInputCache } from './fileCache'

const MIRROR_PROXY = '/api/mirror'
const MIRROR_BASE  = 'https://catboy.best'
const UA = 'henkan/1.0'

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

interface CatboyBeatmap {
  BeatmapID: number
  DiffName: string
  Mode: number
  CS: number
  DifficultyRating: number
  TotalLength: number
  BPM: number
}

interface CatboySet {
  SetID: number
  RankedStatus: number
  Artist: string
  Title: string
  Creator: string
  ChildrenBeatmaps: CatboyBeatmap[]
}

const STATUS_TO_NUM: Record<RankStatus, number> = {
  ranked: 1, qualified: 3, loved: 4, pending: 0, wip: -1, graveyard: -2,
}

const NUM_TO_STATUS: Record<number, RankStatus> = {
  1: 'ranked', 3: 'qualified', 4: 'loved', 0: 'pending', '-1': 'wip', '-2': 'graveyard',
}

export function coverUrl(setId: number): string {
  return `https://assets.ppy.sh/beatmaps/${setId}/covers/card.jpg`
}

export function previewUrl(setId: number): string {
  return `https://b.ppy.sh/preview/${setId}.mp3`
}

function buildSearchUrl(query: string, status?: RankStatus, offset = 0): string {
  const params = new URLSearchParams({ q: query })
  if (status) params.set('status', String(STATUS_TO_NUM[status]))
  if (offset > 0) params.set('offset', String(offset))

  if (isTauri()) {
    return `${MIRROR_BASE}/api/search?${params}`
  }
  params.set('path', '/api/search')
  return `${MIRROR_PROXY}?${params}`
}

function buildDownloadUrl(setId: number): string {
  if (isTauri()) return `${MIRROR_BASE}/d/${setId}`
  return `${MIRROR_PROXY}?path=/d/${setId}`
}

function parseResults(raw: string): CatboySet[] {
  const data: unknown = JSON.parse(raw)
  return Array.isArray(data) ? data as CatboySet[] : []
}

function toManiaSets(data: CatboySet[]): MirrorBeatmapSet[] {
  return data
    .filter(s => s.ChildrenBeatmaps && s.ChildrenBeatmaps.length > 0)
    .map(s => ({
      id: s.SetID,
      artist: s.Artist,
      title: s.Title,
      creator: s.Creator,
      bpm: s.ChildrenBeatmaps[0]?.BPM ?? 0,
      status: (NUM_TO_STATUS[s.RankedStatus] ?? 'graveyard') as RankStatus,
      beatmaps: s.ChildrenBeatmaps.map(b => ({
        id: b.BeatmapID,
        version: b.DiffName,
        mode_int: 3,
        cs: b.CS,
        difficulty_rating: b.DifficultyRating,
        total_length: b.TotalLength,
        bpm: b.BPM,
      })),
    }))
}

function filterKeys(results: MirrorBeatmapSet[], keys?: number): MirrorBeatmapSet[] {
  if (!keys || keys <= 0) return results
  return results
    .map(s => ({ ...s, beatmaps: s.beatmaps.filter(b => b.cs === keys) }))
    .filter(s => s.beatmaps.length > 0)
}

export async function searchBeatmaps(
  query: string,
  status?: RankStatus,
  keys?: number,
  page: number = 1
): Promise<{ results: MirrorBeatmapSet[]; error: string | null }> {
  try {
    const q = query.trim()
    if (!q) return { results: [], error: null }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)

    const offset = (page - 1) * 100
    let raw: string

    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core')
      raw = await invoke<string>('search_mirror', { query: q, status: status || '', offset })
    } else {
      const url = buildSearchUrl(q, status, offset)
      const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA } })
      clearTimeout(timeout)
      if (!res.ok) return { results: [], error: i18n.t('services.mirrorUnreachable') }
      raw = await res.text()
    }
    clearTimeout(timeout)

    const data = parseResults(raw)
    const results = filterKeys(toManiaSets(data), keys)

    return { results, error: null }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { results: [], error: i18n.t('services.searchTimedOut') }
    }
    return { results: [], error: i18n.t('services.mirrorUnreachable') }
  }
}

export async function downloadBeatmapPath(setId: number, filename: string): Promise<{ path: string | null; error: string | null }> {
  try {
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core')
      const path = await invoke<string>('download_mirror_osz', { setId, filename })
      return { path, error: null }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)

    const url = buildDownloadUrl(setId)
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA } })
    clearTimeout(timeout)
    if (!res.ok) return { path: null, error: i18n.t('services.downloadFailed') }

    const blob = await res.blob()
    const file = new File([blob], filename, { type: 'application/octet-stream' })
    fileInputCache.push(file)
    return { path: filename, error: null }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { path: null, error: i18n.t('services.downloadTimedOut') }
    }
    return { path: null, error: i18n.t('services.downloadFailed') }
  }
}
