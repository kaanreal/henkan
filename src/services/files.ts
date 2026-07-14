import { isTauri } from './environment'
import { getCachedFile, getCachedFileContent, getCachedFiles, fileContentCache } from './fileCache'

export async function readFileAsDataUrl(pathOrFile: string | File): Promise<string | null> {
  if (pathOrFile instanceof File) {
    // Force mime type if browser failed to detect it (e.g. for double extensions like .png.jpg)
    let fileToUse = pathOrFile
    if (!pathOrFile.type || pathOrFile.type === 'application/octet-stream') {
      const ext = pathOrFile.name.split('.').pop()?.toLowerCase()
      let mime = 'application/octet-stream'
      if (ext === 'png') mime = 'image/png'
      else if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg'
      else if (ext === 'gif') mime = 'image/gif'
      else if (ext === 'webp') mime = 'image/webp'
      else if (ext === 'bmp') mime = 'image/bmp'
      
      if (mime !== 'application/octet-stream') {
        fileToUse = new File([pathOrFile], pathOrFile.name, { type: mime })
      }
    }
    return URL.createObjectURL(fileToUse)
  }

  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    try {
      return await invoke<string>('read_file_as_data_url', { path: pathOrFile })
    } catch {
      return null
    }
  }

  const cached = getCachedFile(pathOrFile)
  if (cached) {
    return readFileAsDataUrl(cached)
  }

  return null
}

async function decodeFileText(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('iso-8859-1').decode(buf)
  }
}

export async function readFileText(pathOrFile: string | File): Promise<string> {
  if (pathOrFile instanceof File) {
    return await decodeFileText(pathOrFile)
  }

  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    const dataUrl = await invoke<string>('read_file_as_data_url', { path: pathOrFile })
    const base64 = dataUrl.split(',')[1]
    return atob(base64)
  }

  // Check content cache first (populated by scanSongsFolder / scanPack)
  const cachedContent = getCachedFileContent(pathOrFile)
  if (cachedContent !== undefined) {
    console.log('[readFileText] using cached content for', JSON.stringify(pathOrFile))
    return cachedContent
  }

  console.warn('[readFileText] miss for', JSON.stringify(pathOrFile), 'cache keys:', JSON.stringify(Array.from(fileContentCache.keys())))
  const cached = getCachedFile(pathOrFile)
  if (cached) {
    return await decodeFileText(cached)
  }

  throw new Error(`File not found: ${pathOrFile}`)
}

export async function readFileArrayBuffer(pathOrFile: string | File): Promise<ArrayBuffer> {
  if (pathOrFile instanceof File) {
    return await pathOrFile.arrayBuffer()
  }

  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    const dataUrl = await invoke<string>('read_file_as_data_url', { path: pathOrFile })
    const base64 = dataUrl.split(',')[1]
    const binaryStr = atob(base64)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    return bytes.buffer
  }

  const cached = getCachedFile(pathOrFile)
  if (cached) {
    return await cached.arrayBuffer()
  }

  throw new Error(`File not found: ${pathOrFile}`)
}

export async function resolveMediaFile(
  sourceDir: string,
  filename: string,
): Promise<string | null> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    try {
      return await invoke<string>('resolve_file', { sourceDir, filename })
    } catch {
      return null
    }
  }

  function isInSourceDir(w: string, dir: string): boolean {
    return w.startsWith(dir + '/') || w.includes('/' + dir + '/')
  }

  function doAutoDiscovery() {
    if (!sourceDir) return null
    // Exclude video formats from auto-discovery since web uses CSS backgrounds, matching desktop IMAGE_EXTS
    const files = getCachedFiles().filter(f => /\.(png|jpg|jpeg|gif|bmp|webp)$/i.test(f.name) &&
      (!f.webkitRelativePath || isInSourceDir(f.webkitRelativePath, sourceDir)))
    // Skip files that are clearly not backgrounds (banners, cd titles)
    const candidates = files.filter(f => {
      const stem = f.name.replace(/\.[^.]+$/, '').toLowerCase()
      return !['cdtitle', 'cd', 'bn', 'banner'].includes(stem) && !stem.includes('cdtitle')
    })
    if (candidates.length === 0) return null
    // Prefer file with "bg" or "background" in the name
    const preferred = candidates.find(f => {
      const stem = f.name.replace(/\.[^.]+$/, '').toLowerCase()
      return stem.includes('bg') || stem.includes('background')
    })
    // Fall back to picking the largest file, similar to desktop
    const match = preferred || candidates.sort((a, b) => b.size - a.size)[0]
    return (match as any).webkitRelativePath || match.name
  }

  if (!filename) {
    return doAutoDiscovery()
  }

  const baseName = filename.split(/[/\\]+/).pop() || filename
  const baseLower = baseName.toLowerCase()

  // Case-insensitive search in sourceDir: match by name or stem
  const files = getCachedFiles()
  const inDir = files.filter(f =>
    !sourceDir || !f.webkitRelativePath || isInSourceDir(f.webkitRelativePath, sourceDir)
  )
  console.log('[media] resolveMediaFile web', { sourceDir, filename, baseLower, cacheSize: files.length, inDirSize: inDir.length, cacheNames: files.map(f => f.name) })
  // 1. Exact filename match (case-insensitive)
  const exact = inDir.find(f => f.name.toLowerCase() === baseLower)
  if (exact) return exact.webkitRelativePath || exact.name

  // 2. Stem match (same base name, different extension)
  const stem = baseLower.replace(/\.[^.]+$/, '')
  const isImageOrVideoReq = /\.(png|jpg|jpeg|gif|bmp|webp|avi|mpg|mpeg|webm|mp4)$/i.test(filename) || stem.includes('bg') || stem.includes('background')
  const isAudioReq = /\.(mp3|ogg|wav|flac)$/i.test(filename)

  const byStem = inDir.find(f => {
    const fStem = f.name.replace(/\.[^.]+$/, '').toLowerCase()
    // Match either the base stem or the full filename as stem (for .png.jpg double extensions)
    const matchesStem = fStem === stem || fStem === baseLower || fStem.startsWith(baseLower)
    if (!matchesStem) return false

    // Ensure the matched file is of the same media category as the requested file
    const fIsImageOrVideo = /\.(png|jpg|jpeg|gif|bmp|webp|avi|mpg|mpeg|webm|mp4)$/i.test(f.name)
    const fIsAudio = /\.(mp3|ogg|wav|flac)$/i.test(f.name)
    
    if (isImageOrVideoReq && !fIsImageOrVideo) return false
    if (isAudioReq && !fIsAudio) return false
    return true
  })
  if (byStem) {
    return byStem.webkitRelativePath || byStem.name
  }

  // 3. Try filename as provided (case-sensitive, for compatibility)
  if (sourceDir) {
    const fullPath = `${sourceDir}/${baseName}`
    const cached = getCachedFile(fullPath)
    if (cached) return fullPath
  }

  // 4. Fallback for backgrounds: if the requested file was a media file
  // but wasn't found, try scanning for a plausible background image.
  const isImageOrVideo = /\.(png|jpg|jpeg|gif|bmp|webp|avi|mpg|mpeg|webm|mp4)$/i.test(filename) || stem.includes('bg') || stem.includes('background')
  if (isImageOrVideo) {
    return doAutoDiscovery()
  }

  return null
}

export async function saveContentToFile(path: string, content: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('save_file', { path, content })
    return
  }

  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = path.split(/[/\\]+/).pop() || 'export.txt'
  a.click()
  URL.revokeObjectURL(url)
}

export async function saveBlobToFile(blob: Blob, filename: string): Promise<void> {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
