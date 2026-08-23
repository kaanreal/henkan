import type { PackEntry } from '../types/beatmap'
import { isTauri } from './environment'
import { readFileAsDataUrl } from './files'
import { wasmParseSmAll } from './wasm'
import { getCachedFiles, getCachedFile, cacheFileContent, type FileWithPath } from './fileCache'

function decodeFileContent(file: File): Promise<string> {
  return file.arrayBuffer().then(buf => {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buf)
    } catch {
      return new TextDecoder('iso-8859-1').decode(buf)
    }
  })
}

export async function scanPack(folder: string): Promise<PackEntry[]> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<PackEntry[]>('scan_pack', { folder })
  }

  const files = getCachedFiles()

  // Filter .sm files belonging to this pack folder
  const smFiles = files.filter(f => {
    if (f.webkitRelativePath) {
      return f.webkitRelativePath.toLowerCase().endsWith('.sm')
    }
    // Drag-dropped files - all .sm files are from this pack
    return f.name.toLowerCase().endsWith('.sm')
  })

  const entries: PackEntry[] = []

  for (const file of smFiles) {
    try {
      const content = await decodeFileContent(file)
      const sourceFile = (file as FileWithPath).path || file.webkitRelativePath || file.name
      cacheFileContent(sourceFile, content) // cache for later re-read by parseFile

      const beatmaps = await wasmParseSmAll(content)
      const first = beatmaps[0]
      if (!first) continue

      // Extract raw #BACKGROUND: value from .sm content (parsed beatmap may have
      // fallbacked to #BANNER when #BACKGROUND is empty - we want the real value)
      const bgMatch = content.match(/#BACKGROUND\s*:\s*([^;\n\r]+)/i)
      const rawBackground = bgMatch?.[1]?.trim() || null

      const relPath = file.webkitRelativePath.startsWith(folder + '/')
        ? file.webkitRelativePath.slice(folder.length + 1)
        : file.webkitRelativePath
      entries.push({
        source_file: sourceFile,
        source_dir: relPath.split('/')[0] || folder,
        title: first.title,
        artist: first.artist,
        background_filename: rawBackground,
        banner_filename: first.banner_filename,
        available_difficulties: first.available_difficulties,
      })
    } catch {
      // skip unparseable files
    }
  }

  return entries
}

export async function findPackBanner(folder: string): Promise<File | string | null> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string | null>('find_pack_banner', { folder })
  }

  const files = getCachedFiles()
  const hasWebkitPath = files.some(f => f.webkitRelativePath)

  if (hasWebkitPath) {
    // Normalize webkitRelativePath by stripping the folder prefix if present
    // (Chromium showDirectoryPicker doesn't include it, Safari/Firefox <input webkitdirectory> does)
    const isRootLevel = (f: File) => {
      const w = f.webkitRelativePath || ''
      const normalized = w.startsWith(folder + '/') ? w.slice(folder.length + 1) : w
      return !normalized.includes('/')
    }

    const imageFiles = files.filter(f => /\.(png|jpg|jpeg|gif|bmp)$/i.test(f.name))
    const rootImages = imageFiles.filter(isRootLevel)

    if (rootImages.length > 0) {
      const bannerNames = ['banner', 'bn']
      const preferred = rootImages.find(f => {
        const base = f.name.replace(/\.[^.]+$/, '').toLowerCase()
        return bannerNames.includes(base)
      })
      return preferred || rootImages[0]
    }
  } else {
    // Drag-dropped files without webkitRelativePath - can't determine hierarchy
    const imageFiles = files.filter(f => /\.(png|jpg|jpeg|gif|bmp)$/i.test(f.name))
    const named = imageFiles.find(f => {
      const base = f.name.replace(/\.[^.]+$/, '').toLowerCase()
      return base === 'banner' || base === 'bn'
    })
    if (named) return named
  }

  return null
}

export async function loadPackBannerUrl(folder: string): Promise<{ url: string; filePath: string; file?: File } | null> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    const banner = await invoke<string | null>('find_pack_banner', { folder })
    if (!banner) return null
    const url = await invoke<string>('read_file_as_data_url', { path: banner })
    return { url, filePath: banner }
  }

  const bannerFile = await findPackBanner(folder)
  if (!bannerFile) return null

  if (bannerFile instanceof File) {
    const url = await readFileAsDataUrl(bannerFile)
    if (!url) return null
    return { url, filePath: bannerFile.webkitRelativePath || bannerFile.name, file: bannerFile }
  }

  const cachedFile = getCachedFile(bannerFile)
  if (!cachedFile) return null
  const url = await readFileAsDataUrl(cachedFile)
  if (!url) return null
  return { url, filePath: cachedFile.webkitRelativePath || cachedFile.name, file: cachedFile }
}

export async function createDummyDiff(
  title: string,
  creator: string,
  packBannerPath: string | null,
  outputDir: string,
): Promise<string> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string>('create_dummy_diff', {
      title,
      creator,
      packBannerPath,
      outputDir,
    })
  }
  return ''
}

export function generateDummyDiffContent(
  title: string,
  creator: string,
  bannerName?: string,
): string {
  const escape = (s: string) => s.replace(/[#,\n\r]/g, '')
  let osu = 'osu file format v14\n\n'
  osu += '[General]\n'
  osu += 'AudioFilename: dummy.mp3\n'
  osu += 'AudioLeadIn: 0\n'
  osu += 'Mode: 3\n'
  osu += 'Countdown: 0\n'
  osu += `PreviewTime: 0\n\n`
  osu += '[Metadata]\n'
  osu += `Title:${escape(title)}\n`
  osu += `TitleUnicode:${escape(title)}\n`
  osu += `Creator:${escape(creator)}\n`
  osu += 'Version:Etterna pack\n'
  osu += `Source:etterna-pack-${escape(title)}\n`
  osu += 'Tags:\n\n'
  osu += '[Difficulty]\n'
  osu += 'HPDrainRate:5\n'
  osu += 'CircleSize:4\n'
  osu += 'OverallDifficulty:5\n'
  osu += 'ApproachRate:5\n'
  osu += 'SliderMultiplier:1.4\n'
  osu += 'SliderTickRate:1\n\n'
  osu += '[Events]\n'
  osu += '//Background and Video events\n'
  if (bannerName) {
    osu += `0,0,"${escape(bannerName)}",0,0\n`
  }
  osu += '//Break Periods\n\n'
  osu += '[TimingPoints]\n'
  osu += '0,500,4,0,0,100,1,0\n\n'
  osu += '[HitObjects]\n'
  return osu
}

export async function scanSongsFolder(folder: string): Promise<PackEntry[]> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<PackEntry[]>('scan_songs_folder', { folder })
  }

  const files = getCachedFiles()
  const osuFiles = files.filter(f => {
    if (f.webkitRelativePath) {
      return f.webkitRelativePath.toLowerCase().endsWith('.osu')
    }
    return f.name.toLowerCase().endsWith('.osu')
  })

  const entries: PackEntry[] = []

  for (const file of osuFiles) {
    try {
      const content = await decodeFileContent(file)
      const sourceFile = (file as FileWithPath).path || file.webkitRelativePath || file.name
      cacheFileContent(sourceFile, content)

      const { wasmParseOsu } = await import('./wasm')
      const bm = await wasmParseOsu(content)
      if (!bm) continue

      entries.push({
        source_file: sourceFile,
        source_dir: bm.source_dir || folder,
        title: bm.title,
        artist: bm.artist,
        background_filename: bm.background_filename,
        banner_filename: null,
        available_difficulties: [{
          name: bm.difficulty_name,
          keys: bm.keys,
          note_count: bm.notes.length,
          audio_filename: bm.audio_filename || null,
          difficulty_rating: bm.difficulty_rating ?? null,
        }],
      })
    } catch {
      // skip unparseable files
    }
  }

  return entries
}

export async function cleanDir(path: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('clean_dir', { path })
  }
}
