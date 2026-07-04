import { isTauri } from './environment'
import { getCachedFile, getCachedFiles } from './fileCache'

export async function readFileAsDataUrl(pathOrFile: string | File): Promise<string | null> {
  if (pathOrFile instanceof File) {
    return URL.createObjectURL(pathOrFile)
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

  if (!filename) {
    // Auto-discovery: scan sourceDir for a background image (matches desktop scan_source_dir_for_bg)
    if (sourceDir) {
      const files = getCachedFiles().filter(f => /\.(png|jpg|jpeg|gif|bmp)$/i.test(f.name) &&
        (!f.webkitRelativePath || f.webkitRelativePath.startsWith(sourceDir + '/')))
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
      const match = preferred || candidates[0]
      return (match as any).webkitRelativePath || match.name
    }
    return null
  }

  const baseName = filename.split(/[/\\]+/).pop() || filename

  // Try exact path match first (sourceDir + "/" + baseName)
  if (sourceDir) {
    const fullPath = `${sourceDir}/${baseName}`
    const cached = getCachedFile(fullPath)
    if (cached) return fullPath
  }

  if (getCachedFile(filename)) return filename
  if (getCachedFile(baseName)) return baseName

  const files = getCachedFiles()
  const cacheKey = (n: string) => {
    const base = n.split(/[/\\]+/).pop() || n
    return base.replace(/\.[^.]+$/, '').toLowerCase()
  }
  // Prefer files from the same source directory
  const match = files.find(f => {
    const inRightDir = !sourceDir || !f.webkitRelativePath ||
      f.webkitRelativePath.startsWith(sourceDir + '/')
    if (!inRightDir) return false
    return f.name.toLowerCase() === filename.toLowerCase() ||
      f.name.toLowerCase() === baseName.toLowerCase() ||
      cacheKey(f.name) === cacheKey(filename) ||
      cacheKey(f.name) === cacheKey(baseName)
  })
  return match ? match.name : null
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
