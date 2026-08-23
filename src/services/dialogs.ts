import { isTauri } from './environment'
import { fileInputCache, type FileWithPath } from './fileCache'

// Minimal shape of the File System Access API directory handle
interface DirHandleLike {
  name: string
  entries(): AsyncIterableIterator<[string, DirEntryLike]>
}
interface DirEntryLike {
  kind: 'file' | 'directory'
  name?: string
  getFile?: () => Promise<File>
  entries?: DirHandleLike['entries']
}

interface OpenFileOptions {
  multiple?: boolean
  filters?: { name: string; extensions: string[] }[]
}

interface SaveFileOptions {
  title?: string
  defaultPath?: string
  filters?: { name: string; extensions: string[] }[]
}

export async function openFiles(options: OpenFileOptions = {}): Promise<string[] | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      multiple: options.multiple,
      filters: options.filters,
    })
    if (!selected) return null
    return Array.isArray(selected) ? selected : [selected]
  }

  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = options.multiple ?? false
    if (options.filters?.length) {
      input.accept = options.filters
        .flatMap(f => f.extensions.map(e => `.${e}`))
        .join(',')
    }
    input.onchange = () => {
      const files = Array.from(input.files || [])
      if (!files.length) {
        resolve(null)
        return
      }
      resolve(files.map(f => (f as FileWithPath).path || f.name))
      fileInputCache.push(...files)
    }
    input.click()
  })
}

export async function openDirectory(options: { title?: string } = {}): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const picked = await open({ directory: true, title: options.title })
    return picked || null
  }

  if ('showDirectoryPicker' in window) {
    try {
      const handle = await (window as { showDirectoryPicker?: () => Promise<DirHandleLike> }).showDirectoryPicker!()
      const files: File[] = []
      const walk = async (dirHandle: DirHandleLike, path: string = '') => {
        for await (const [name, entry] of dirHandle.entries()) {
          if (entry.kind === 'file') {
            const file = await entry.getFile!()
            const fullPath = path ? `${path}/${name}` : name
            Object.defineProperty(file, 'webkitRelativePath', { value: fullPath, writable: false })
            files.push(file)
          } else if (entry.kind === 'directory') {
            await walk({ name: entry.name || name, entries: entry.entries! }, path ? `${path}/${name}` : name)
          }
        }
      }
      await walk(handle)
      for (const f of files) {
        const path = f.webkitRelativePath || f.name
        const existing = fileInputCache.find(c => c.webkitRelativePath === path)
        if (!existing) fileInputCache.push(f)
      }
      return handle.name
    } catch {
      return null
    }
  }

  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.webkitdirectory = true
    input.onchange = () => {
      const files = Array.from(input.files || [])
      if (!files.length) { resolve(null); return }
      const path = (files[0] as FileWithPath).path || files[0].webkitRelativePath.split('/')[0] || 'folder'
      fileInputCache.push(...files)
      resolve(path)
    }
    input.click()
  })
}

export async function saveFile(options: SaveFileOptions = {}): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    const path = await save({
      title: options.title,
      defaultPath: options.defaultPath,
      filters: options.filters,
    })
    return path || null
  }

  return options.defaultPath || 'export'
}
