import { isTauri } from './environment'

export type SkinInput = File | string

let pendingSkinInput: SkinInput | null = null

export function setPendingSkinInput(input: SkinInput): void {
  pendingSkinInput = input
}

export function consumePendingSkinInput(): SkinInput | null {
  const input = pendingSkinInput
  pendingSkinInput = null
  return input
}

export function isSkinArchiveName(value: string): boolean {
  return /\.(osk|zip)$/i.test(value)
}

export function containsSkinMarker(files: File[]): boolean {
  return files.some((file) => {
    const path = (file.webkitRelativePath || file.name).replace(/\\/g, '/').toLowerCase()
    return /(?:^|\/)(?:skin\.ini|noteskin\.lua|metrics\.ini)$/.test(path)
  })
}

export async function readDroppedDirectory(entry: FileSystemDirectoryEntry): Promise<File[]> {
  const files: File[] = []

  const walk = async (directory: FileSystemDirectoryEntry, prefix: string): Promise<void> => {
    const reader = directory.createReader()
    const entries: FileSystemEntry[] = []
    await new Promise<void>((resolve) => {
      const readBatch = () => {
        reader.readEntries((batch) => {
          if (batch.length === 0) {
            resolve()
            return
          }
          entries.push(...batch)
          readBatch()
        }, () => resolve())
      }
      readBatch()
    })

    for (const child of entries) {
      if (child.isDirectory) {
        await walk(child as FileSystemDirectoryEntry, `${prefix}/${child.name}`)
        continue
      }
      const source = await new Promise<File | null>((resolve) => {
        (child as FileSystemFileEntry).file(resolve, () => resolve(null))
      })
      if (!source) continue
      const file = new File([source], source.name, { type: source.type, lastModified: source.lastModified })
      Object.defineProperty(file, 'webkitRelativePath', {
        value: `${prefix}/${source.name}`,
        configurable: false,
        writable: false,
      })
      files.push(file)
    }
  }

  await walk(entry, entry.name)
  return files
}

export async function archiveSkinFolderFiles(files: File[], folderName: string): Promise<File> {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  for (const file of files) {
    const path = (file.webkitRelativePath || file.name).replace(/\\/g, '/')
    zip.file(path, file)
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  return new File([blob], `${folderName || 'skin'}.zip`, { type: 'application/zip' })
}

export async function isSkinFolderPath(path: string): Promise<boolean> {
  if (!isTauri()) return false
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<boolean>('directory_contains_skin', { path })
}

export async function archiveSkinFolderPath(path: string): Promise<File> {
  if (!isTauri()) throw new Error('Native skin folders are only available in the desktop app.')
  const { invoke } = await import('@tauri-apps/api/core')
  const bytes = await invoke<number[]>('archive_directory', { path })
  const name = path.split(/[/\\]+/).filter(Boolean).pop() || 'skin'
  return new File([Uint8Array.from(bytes)], `${name}.zip`, { type: 'application/zip' })
}
