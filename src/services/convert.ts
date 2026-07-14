import type { Beatmap, ConvertDirection, ExportConfig } from '../types/beatmap'
import { isTauri } from './environment'
import { readFileText } from './files'
import { getCachedFile } from './fileCache'
import {
  wasmParseOsu,
  wasmParseSm,
  wasmParseSmDifficulty,
  wasmParseSmAll,
  wasmConvertEtternaToOsu,
  wasmConvertOsuToEtterna,
  wasmScaleTimingForRate,
} from './wasm'

// In-memory cache for .osz extracted data
interface OszMediaFile {
  name: string
  blob: Blob
}
interface OszData {
  osuEntries: { name: string; text: string }[]
  sourceDir: string
  difficulties: { name: string; keys: number; note_count: number; audio_filename: string | null }[]
  mediaFiles: OszMediaFile[]
}
export const oszContentCache = new Map<string, OszData>()
const oszCachedFiles = new Set<File>()

const MEDIA_MIME_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
}

function mimeTypeForFile(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase()
  return ext ? MEDIA_MIME_TYPES[ext] || '' : ''
}

export function isOsz(path: string): boolean {
  return path.toLowerCase().endsWith('.osz')
}

/** Ensure the media files for the given OSZ path are in fileInputCache (restores from cache if needed).
 *  No-op in Tauri — native invoke handles OSZ via the filesystem directly. */
export async function ensureOszMediaCached(sourceFile: string): Promise<void> {
  if (!isOsz(sourceFile)) return
  if (isTauri()) return
  await extractOsz(sourceFile)
}

function sourceDirFromPath(path: string): string {
  return path.split('/').slice(0, -1).join('/') || '.'
}

async function extractOsz(path: string): Promise<OszData> {
  const { fileInputCache } = await import('./fileCache')

  if (oszContentCache.has(path)) {
    // Cache hit: restore this OSZ's media files
    const cached = oszContentCache.get(path)!
    // Remove previously cached OSZ media files (keep user-uploaded files)
    for (const f of oszCachedFiles) {
      const idx = fileInputCache.indexOf(f)
      if (idx !== -1) fileInputCache.splice(idx, 1)
    }
    oszCachedFiles.clear()
    for (const mf of cached.mediaFiles) {
      const f = new File([mf.blob], mf.name, { type: mimeTypeForFile(mf.name) })
      fileInputCache.push(f)
      oszCachedFiles.add(f)
    }
    return cached
  }

  const oszFile = getCachedFile(path)
  if (!oszFile) throw new Error(`File not found: ${path}`)

  // Remove previously cached OSZ media files (keep user-uploaded files)
  for (const f of oszCachedFiles) {
    const idx = fileInputCache.indexOf(f)
    if (idx !== -1) fileInputCache.splice(idx, 1)
  }
  oszCachedFiles.clear()

  let JSZip: any
  try {
    JSZip = (await import('jszip')).default
  } catch (e) {
    console.error('JSZip import failed:', e)
    throw e
  }

  const zipData = await oszFile.arrayBuffer()
  const zip = await JSZip.loadAsync(zipData)

  const osuEntries: { name: string; text: string }[] = []
  const mediaFiles: { name: string }[] = []

  const mediaExts = new Set(['mp3', 'ogg', 'wav', 'flac', 'm4a', 'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'])

  zip.forEach((name: string) => {
    if (name.startsWith('__MACOSX/')) return
    const lower = name.toLowerCase()
    if (lower.endsWith('.osu')) {
      osuEntries.push({ name, text: '' })
    } else {
      const ext = lower.split('.').pop()
      if (ext && mediaExts.has(ext)) {
        mediaFiles.push({ name })
      }
    }
  })

  for (const entry of osuEntries) {
    const file = zip.file(entry.name)
    if (file) entry.text = await file.async('text')
  }

  // Parse all osu entries to build the difficulties list
  const difficulties: { name: string; keys: number; note_count: number; audio_filename: string | null }[] = []
  for (const entry of osuEntries) {
    if (entry.text) {
      try {
        const bm = await wasmParseOsu(entry.text)
        difficulties.push({
          name: bm.difficulty_name,
          keys: bm.keys,
          note_count: bm.notes?.length || 0,
          audio_filename: bm.audio_filename || null,
        })
      } catch { /* skip unparseable */ }
    }
  }

  // Cache media files in fileInputCache
  const cachedMediaFiles: OszMediaFile[] = []
  for (const mf of mediaFiles) {
    const file = zip.file(mf.name)
    if (file) {
      const blob = await file.async('blob')
      const fullName = mf.name
      const f = new File([blob], fullName, { type: mimeTypeForFile(fullName) })
      fileInputCache.push(f)
      oszCachedFiles.add(f)
      cachedMediaFiles.push({ name: fullName, blob })
    }
  }

  const sourceDir = path.split('/').pop()?.replace(/\.osz$/i, '') || 'osz_extracted'
  const result: OszData = { osuEntries, sourceDir, difficulties, mediaFiles: cachedMediaFiles }
  oszContentCache.set(path, result)
  return result
}

export async function parseFile(
  pathOrContent: string,
  direction: ConvertDirection,
): Promise<Beatmap> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<Beatmap>('parse_file', { path: pathOrContent, direction })
  }

  if (isOsz(pathOrContent)) {
    const { osuEntries, sourceDir, difficulties } = await extractOsz(pathOrContent)
    if (!osuEntries.length) throw new Error('No .osu files found in .osz')

    // Parse first .osu as the main beatmap
    const main = await wasmParseOsu(osuEntries[0].text)
    main.source_dir = sourceDir
    main.source_file = pathOrContent
    main.available_difficulties = difficulties
    return main
  }

  const isOsu = direction === 'osu-to-etterna'
  const content = await readFileText(pathOrContent)

  let beatmap: Beatmap
  if (isOsu) {
    beatmap = await wasmParseOsu(content)
  } else {
    // For .sm files, parse all difficulties to populate available_difficulties
    try {
      const all = await wasmParseSmAll(content)
      if (all.length > 0) {
        beatmap = all[0]
        beatmap.available_difficulties = all.map(b => ({
          name: b.difficulty_name,
          keys: b.keys,
          note_count: b.notes?.length || 0,
          audio_filename: b.audio_filename || null,
        }))
      } else {
        beatmap = await wasmParseSm(content)
      }
    } catch {
      beatmap = await wasmParseSm(content)
    }
  }

  beatmap.source_dir = sourceDirFromPath(pathOrContent)
  beatmap.source_file = pathOrContent

  return beatmap
}

export async function selectDifficulty(
  pathOrContent: string,
  index: number,
): Promise<Beatmap> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<Beatmap>('select_difficulty', { path: pathOrContent, index })
  }

  if (isOsz(pathOrContent)) {
    const { osuEntries, sourceDir, difficulties } = await extractOsz(pathOrContent)
    if (index < 0 || index >= osuEntries.length) throw new Error(`Difficulty index ${index} out of range`)
    const beatmap = await wasmParseOsu(osuEntries[index].text)
    beatmap.source_dir = sourceDir
    beatmap.source_file = pathOrContent
    beatmap.available_difficulties = difficulties
    return beatmap
  }

  const content = await readFileText(pathOrContent)

  // Parse all difficulties to get available_difficulties, then parse the specific one
  let allBeatmaps: Beatmap[]
  try {
    allBeatmaps = await wasmParseSmAll(content)
  } catch {
    allBeatmaps = []
  }

  const beatmap = await wasmParseSmDifficulty(content, index)
  beatmap.source_dir = sourceDirFromPath(pathOrContent)
  beatmap.source_file = pathOrContent
  if (allBeatmaps.length > 0) {
    beatmap.available_difficulties = allBeatmaps.map(b => ({
      name: b.difficulty_name,
      keys: b.keys,
      note_count: b.notes?.length || 0,
      audio_filename: b.audio_filename || null,
    }))
  }
  return beatmap
}

export async function parseSmAll(pathOrContent: string): Promise<Beatmap[]> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    const beatmaps: Beatmap[] = []
    let i = 0
    try {
      while (true) {
        const bm = await invoke<Beatmap>('select_difficulty', { path: pathOrContent, index: i })
        beatmaps.push(bm)
        i++
      }
    } catch {
      return beatmaps
    }
  }

  const content = await readFileText(pathOrContent)
  const beatmaps = await wasmParseSmAll(content)
  for (const bm of beatmaps) {
    bm.source_dir = pathOrContent.split('/').slice(0, -1).join('/') || '.'
    bm.source_file = pathOrContent
  }
  return beatmaps
}

const HENKAN_ATTRIBUTION = '// Converted using "https://github.com/kaanreal/henkan"\n\n'

export async function convertBeatmap(
  beatmap: Beatmap,
  config: ExportConfig,
): Promise<string> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string>('convert_beatmap', { beatmap, config })
  }

  if (beatmap.source_format === 'Etterna') {
    const result = await wasmConvertEtternaToOsu(beatmap, config)
    return result.replace('osu file format v14\n\n', `osu file format v14\n\n${HENKAN_ATTRIBUTION}`)
  }
  return HENKAN_ATTRIBUTION + await wasmConvertOsuToEtterna(
    beatmap,
    config.global_timing_ms,
    config.creator,
  )
}

export async function scaleTimingForRate(
  beatmap: Beatmap,
  rate: number,
): Promise<Beatmap> {
  if (isTauri()) {
    return beatmap
  }
  return await wasmScaleTimingForRate(beatmap, rate)
}
