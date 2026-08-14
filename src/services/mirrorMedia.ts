import type { Beatmap } from '../types/beatmap'
import { isTauri } from './environment'
import { readFileText } from './files'
import { getCachedFile } from './fileCache'
import { downloadBeatmapPath, fetchSetIdByBeatmapId, searchBeatmaps, type MirrorBeatmapSet } from './beatmapMirror'
import { ensureOszMediaCached } from './convert'

export interface OsuIds {
  setId: number | null
  beatmapId: number | null
}

/** Extract BeatmapSetID/BeatmapID from raw .osu file content. */
export function parseOsuIds(content: string): OsuIds {
  const setIdMatch = /BeatmapSetID\s*:\s*(-?\d+)/i.exec(content)
  const beatmapIdMatch = /BeatmapID\s*:\s*(-?\d+)/i.exec(content)
  const setId = setIdMatch ? parseInt(setIdMatch[1], 10) : NaN
  const beatmapId = beatmapIdMatch ? parseInt(beatmapIdMatch[1], 10) : NaN
  return {
    setId: Number.isFinite(setId) && setId > 0 ? setId : null,
    beatmapId: Number.isFinite(beatmapId) && beatmapId > 0 ? beatmapId : null,
  }
}

/** Title/Artist from the .osu [Metadata] section, for title-based mirror lookups. */
export function parseOsuMeta(content: string): { title: string; artist: string } {
  const titleMatch = /^Title\s*:\s*(.*)$/im.exec(content)
  const artistMatch = /^Artist\s*:\s*(.*)$/im.exec(content)
  return {
    title: titleMatch?.[1].trim() ?? '',
    artist: artistMatch?.[1].trim() ?? '',
  }
}

/**
 * Pick the best set from mirror search results for a title fallback. Only exact
 * title matches are accepted; an exact artist match breaks ties.
 */
export function pickBestTitleMatch(
  results: MirrorBeatmapSet[],
  title: string,
  artist: string,
): MirrorBeatmapSet | null {
  const titleLower = title.trim().toLowerCase()
  if (!titleLower) return null
  const exact = results.filter(s => s.title.trim().toLowerCase() === titleLower)
  if (exact.length === 0) return null
  const artistLower = artist.trim().toLowerCase()
  const byArtist = exact.find(s => s.artist.trim().toLowerCase() === artistLower)
  return byArtist || exact[0]
}

function isLoneOsu(bm: Beatmap): boolean {
  return bm.source_format === 'OsuMania' && /\.osu$/i.test(bm.source_file) && !!bm.audio_filename
}

export interface MirrorProgress {
  phase: 'downloading' | 'extracting' | 'done'
  percent?: number
}

/** What the mirror lookup found for this map. */
export type FetchLookupInfo =
  | { status: 'ok'; setId: number }
  | { status: 'unmatched' }

export interface FetchMissingMediaOptions {
  onProgress?: (p: MirrorProgress) => void
  /** Ask the user before downloading. Receives the mirror lookup result. */
  confirmFetch?: (bm: Beatmap, info: FetchLookupInfo) => Promise<boolean>
}

/**
 * Last-resort lookup for maps with no BeatmapSetID/BeatmapID (e.g. Etterna
 * packs). Sets that live on the mirror can still be found by title.
 */
async function findSetByTitle(title: string, artist: string): Promise<MirrorBeatmapSet | null> {
  if (!title.trim()) return null
  const { results, error } = await searchBeatmaps(title)
  if (error || results.length === 0) return null
  return pickBestTitleMatch(results, title, artist)
}

// Tauri: extracted media dir per beatmapset id, so sibling .osu files from the
// same set reuse one download instead of re-fetching (and re-prompting).
const extractedSetCache = new Map<number, string>()

/**
 * Download the beatmapset from the mirror and make its media (audio, background)
 * available so a lone .osu with no local files becomes previewable.
 *
 * Web: the osz is fetched into the file cache and extracted, so media resolution
 * finds the real files. Tauri: the osz is extracted to a temp dir and the returned
 * beatmap points `source_dir` there.
 *
 * Maps without a beatmap id are still matched on the mirror by title; only when
 * nothing is found is `confirmFetch` called with `{ status: 'unmatched' }` so the
 * UI can explain why the media can't be fetched. Returns null when the map can't
 * be matched on the mirror or the user declines.
 */
export async function fetchMissingMedia(
  bm: Beatmap,
  opts: FetchMissingMediaOptions = {},
): Promise<Beatmap | null> {
  if (!isLoneOsu(bm)) return null

  let content: string
  try {
    content = await readFileText(bm.source_file)
  } catch {
    return null
  }

  const { setId, beatmapId } = parseOsuIds(content)
  let resolvedSetId = setId
  if (resolvedSetId == null && beatmapId != null) {
    resolvedSetId = await fetchSetIdByBeatmapId(beatmapId)
  }

  // Stripped conversions and packs have no ids but the set may still be on the
  // mirror under the same title.
  if (resolvedSetId == null) {
    const { title, artist } = parseOsuMeta(content)
    const match = await findSetByTitle(title, artist)
    if (match) resolvedSetId = match.id
  }

  // Nothing on the mirror: let the user know instead of silently loading
  // without audio.
  if (resolvedSetId == null) {
    await opts.confirmFetch?.(bm, { status: 'unmatched' })
    return null
  }

  // Reuse a set we already fetched so reloading another .osu from the same set
  // doesn't download it again (or ask again).
  if (isTauri()) {
    const cachedDir = extractedSetCache.get(resolvedSetId)
    if (cachedDir) return { ...bm, source_dir: cachedDir }
  } else {
    const oszName = `${resolvedSetId}.osz`
    if (getCachedFile(oszName)) {
      await ensureOszMediaCached(oszName)
      return bm
    }
  }

  const ok = opts.confirmFetch ? await opts.confirmFetch(bm, { status: 'ok', setId: resolvedSetId }) : true
  if (!ok) return null

  try {
    opts.onProgress?.({ phase: 'downloading' })
    const { path } = await downloadBeatmapPath(
      resolvedSetId,
      `${resolvedSetId}.osz`,
      (percent) => opts.onProgress?.({ phase: 'downloading', percent }),
    )
    if (!path) return null

    opts.onProgress?.({ phase: 'extracting' })
    if (isTauri()) {
      const { invoke } = await import('@tauri-apps/api/core')
      const mediaDir = await invoke<string>('extract_osz_media', { path })
      extractedSetCache.set(resolvedSetId, mediaDir)
      return { ...bm, source_dir: mediaDir }
    }

    await ensureOszMediaCached(path)
    return bm
  } finally {
    opts.onProgress?.({ phase: 'done' })
  }
}
