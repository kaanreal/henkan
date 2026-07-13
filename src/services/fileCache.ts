export const fileInputCache: File[] = []

export function getCachedFile(name: string): File | undefined {
  return fileInputCache.find(f => {
    if ((f as any).path === name) return true
    if (f.webkitRelativePath === name) return true
    if (f.webkitRelativePath && f.webkitRelativePath.endsWith(name)) return true
    if (f.webkitRelativePath && name.endsWith(f.webkitRelativePath)) return true
    if (f.name === name) return true

    // Fallback: match by file name and its immediate parent directory
    // This helps if the cached file has a different prefix than the requested name.
    const parts = name.split(/[/\\]+/)
    if (parts.length >= 2) {
      const fileName = parts.pop()!
      const parentDir = parts.pop()!
      if (f.name === fileName && f.webkitRelativePath.includes(`/${parentDir}/${fileName}`)) {
        return true
      }
    }
    return false
  })
}

export function getCachedFiles(): File[] {
  return [...fileInputCache]
}

export function clearFileCache() {
  fileInputCache.length = 0
}


