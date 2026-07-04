export const fileInputCache: File[] = []

export function getCachedFile(name: string): File | undefined {
  return fileInputCache.find(f => {
    if ((f as any).path === name) return true
    if (f.webkitRelativePath === name) return true
    if (f.webkitRelativePath.endsWith(name)) return true
    if (f.name === name) return true
    return false
  })
}

export function getCachedFiles(): File[] {
  return [...fileInputCache]
}

export function clearFileCache() {
  fileInputCache.length = 0
}


