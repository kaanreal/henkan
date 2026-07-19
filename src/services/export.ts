import type { Beatmap, ExportConfig } from '../types/beatmap'
import { isTauri } from './environment'
import { saveContentToFile, saveBlobToFile, resolveMediaFile } from './files'
import { convertBeatmap, oszContentCache } from './convert'
import { getCachedFile } from './fileCache'

let _defaultCdtitleBlob: Blob | null = null
async function defaultCdtitleBlob(): Promise<Blob> {
  if (!_defaultCdtitleBlob) {
    const resp = await fetch('/cdtitle_default.png')
    _defaultCdtitleBlob = await resp.blob()
  }
  return _defaultCdtitleBlob
}

const _avatarCacheExport = new Map<string, Blob>()
async function avatarFromApi(creator: string): Promise<Blob | null> {
  const cached = _avatarCacheExport.get(creator)
  if (cached) return cached
  try {
    const resp = await fetch(`/api/avatar?user=${encodeURIComponent(creator)}`)
    if (resp.ok) {
      const blob = await resp.blob()
      _avatarCacheExport.set(creator, blob)
      return blob
    }
  } catch { /* fall through */ }
  return null
}

export async function addCdtitleToZip(
  zip: { file: (path: string, data: Blob | ArrayBuffer) => void },
  sourceDir: string,
  cdtitleFilename: string | null | undefined,
  pathInZip: string,
  creator?: string | null,
): Promise<void> {
  if (cdtitleFilename) {
    const key = await resolveMediaFile(sourceDir, cdtitleFilename)
    if (key) {
      const file = getCachedFile(key)
      if (file) {
        zip.file(pathInZip, await file.arrayBuffer())
        return
      }
    }
  }
  if (creator) {
    const avatarBlob = await avatarFromApi(creator)
    if (avatarBlob) {
      zip.file(pathInZip, avatarBlob)
      return
    }
  }
  const blob = await defaultCdtitleBlob()
  zip.file(pathInZip, blob)
}

export async function exportBeatmap(
  beatmap: Beatmap,
  config: ExportConfig,
  convertedContent: string,
  outputDir: string,
  filenameSuffix?: string,
  skipSubfolder?: boolean,
): Promise<string> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string>('export_beatmap', {
      beatmap,
      config,
      convertedContent,
      outputDir,
      filenameSuffix: filenameSuffix || null,
      skipSubfolder: skipSubfolder ?? false,
    })
  }

  const ext = beatmap.source_format === 'OsuMania' ? '.sm' : '.osu'
  const safeTitle = (config.title || beatmap.title).replace(/[/\\?%*:|"<>]/g, '_')
  const safeCreator = (config.creator || beatmap.creator).replace(/[/\\?%*:|"<>]/g, '_')
  const safeDiff = (config.difficulty_name || beatmap.difficulty_name || '').replace(/[/\\?%*:|"<>]/g, '_')
  const suffix = filenameSuffix ? ` ${filenameSuffix}` : (safeDiff ? ` [${safeDiff}]` : '')
  const filename = `${safeTitle} - ${safeCreator}${suffix}${ext}`

  const hasMedia = await resolveMediaFile(beatmap.source_dir, config.audio_filename || beatmap.audio_filename)
  const bundleMedia = hasMedia && config.output_format !== 'osu'

  if (bundleMedia) {
    const JSZip = (await import('jszip')).default
    const zip = new JSZip()
    zip.file(filename, convertedContent)

    const added = new Set<string>()
    const fields: string[] = [config.audio_filename || beatmap.audio_filename]
    const bg = config.background_filename || beatmap.background_filename
    if (bg) fields.push(bg)
    const bn = config.banner_filename || beatmap.banner_filename
    if (bn) fields.push(bn)
    for (const field of fields) {
      const key = await resolveMediaFile(beatmap.source_dir, field)
      if (!key) continue
      const file = getCachedFile(key)
      if (!file) continue
      const name = key.split('/').pop() || key
      if (added.has(name)) continue
      added.add(name)
      zip.file(name, await file.arrayBuffer())
    }
    await addCdtitleToZip(zip, beatmap.source_dir, config.cdtitle_filename || beatmap.cdtitle_filename, 'cdtitle.png', config.creator || beatmap.creator)

    const blob = await zip.generateAsync({ type: 'blob' })
    const bundleExt = config.output_format === 'osz' ? '.osz' : '.zip'
    const zipName = `${safeTitle} - ${safeCreator}${suffix}${bundleExt}`
    await saveBlobToFile(blob, zipName)
    return zipName
  }

  await saveContentToFile(filename, convertedContent)
  return filename
}

export async function exportAllBeatmaps(
  sourceFileOrDir: string,
  config: ExportConfig,
  outputDir: string,
  indices?: number[],
  packName?: string,
): Promise<string[]> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string[]>('export_all_beatmaps', {
      sourceFile: sourceFileOrDir,
      config,
      outputDir,
      indices: indices || null,
      packName: packName || null,
    })
  }

  const paths: string[] = []

  try {
    const { isOsz, ensureOszMediaCached, selectDifficulty, parseSmAll } = await import('./convert')
    let beatmaps: Beatmap[]

    if (isOsz(sourceFileOrDir)) {
      await ensureOszMediaCached(sourceFileOrDir)
      const cached = oszContentCache.get(sourceFileOrDir)
      if (!cached) return paths

      const diffCount = cached.difficulties.length
      const toProcess = indices ?? Array.from({ length: diffCount }, (_, i) => i).filter(
        i => i < diffCount
      )

      beatmaps = []
      for (const idx of toProcess) {
        const bm = await selectDifficulty(sourceFileOrDir, idx)
        beatmaps.push(bm)
      }
    } else {
      beatmaps = await parseSmAll(sourceFileOrDir)
      if (indices) {
        beatmaps = indices.map(i => beatmaps[i]).filter(Boolean)
      }
    }

    if (beatmaps.length === 0) return paths

    const hasMedia = beatmaps[0] && await resolveMediaFile(
      beatmaps[0].source_dir,
      beatmaps[0].audio_filename,
    )

    if (hasMedia) {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const addedMedia = new Set<string>()
      const packTitle = packName || beatmaps[0]?.title || 'export'

      for (const bm of beatmaps) {
        if (!bm) continue
        const content = await convertBeatmap(bm, config)
        const ext = bm.source_format === 'OsuMania' ? '.sm' : '.osu'
        const safeTitle = (config.title || bm.title).replace(/[/\\?%*:|"<>]/g, '_')
        const safeCreator = (config.creator || bm.creator).replace(/[/\\?%*:|"<>]/g, '_')
        const safeDiff = (bm.difficulty_name || '').replace(/[/\\?%*:|"<>]/g, '_')
        const filename = `${safeTitle} - ${safeCreator} [${safeDiff}]${ext}`
        zip.file(filename, content)
        paths.push(filename)

        const mediaFields: string[] = [bm.audio_filename]
        if (bm.background_filename) mediaFields.push(bm.background_filename)
        if (bm.banner_filename) mediaFields.push(bm.banner_filename)
        for (const field of mediaFields) {
          const key = await resolveMediaFile(bm.source_dir, field)
          if (!key) continue
          const file = getCachedFile(key)
          if (!file) continue
          const name = key.split('/').pop() || key
          if (addedMedia.has(name)) continue
          addedMedia.add(name)
          zip.file(name, await file.arrayBuffer())
        }
        await addCdtitleToZip(zip, bm.source_dir, bm.cdtitle_filename, 'cdtitle.png', bm.creator)
      }

      const safePackName = packTitle.replace(/[/\\?%*:|"<>]/g, '_')
      const blob = await zip.generateAsync({ type: 'blob' })
      const zipName = `${safePackName}.zip`
      await saveBlobToFile(blob, zipName)
      return [zipName]
    }

    // No media available - download individually
    for (const bm of beatmaps) {
      if (!bm) continue
      const content = await convertBeatmap(bm, config)
      const ext = bm.source_format === 'OsuMania' ? '.sm' : '.osu'
      const safeTitle = (config.title || bm.title).replace(/[/\\?%*:|"<>]/g, '_')
      const safeCreator = (config.creator || bm.creator).replace(/[/\\?%*:|"<>]/g, '_')
      const safeDiff = (bm.difficulty_name || '').replace(/[/\\?%*:|"<>]/g, '_')
      const filename = `${safeTitle} - ${safeCreator} [${safeDiff}]${ext}`
      await saveContentToFile(filename, content)
      paths.push(filename)
    }
  } catch (e) {
    console.error('Export failed:', e)
  }

  return paths
}

export async function zipFolder(
  folderPath: string,
  outputPath: string,
): Promise<string> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string>('zip_folder', { folderPath, outputPath })
  }

  const JSZip = (await import('jszip')).default
  const zip = new JSZip()

  const { getCachedFiles } = await import('./fileCache')
  const files = getCachedFiles()
  const folderFiles = files.filter((f: File) =>
    f.webkitRelativePath.startsWith(folderPath) ||
    f.name.includes(folderPath),
  )

  for (const file of folderFiles) {
    const relativePath = file.webkitRelativePath || file.name
    const content = await file.arrayBuffer()
    zip.file(relativePath, content)
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const filename = outputPath.split(/[/\\]+/).pop() || 'export.zip'
  await saveBlobToFile(blob, filename)
  return filename
}
