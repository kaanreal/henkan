// Keep the previous database name so its saved background carries forward.
const DATABASE = 'henkan-last-converted-background'
const STORE = 'backgrounds'
const KEY = 'last'
const FALLBACK_KEY = 'henkan.last-opened-map-background'

let sessionBackground: Blob | null = null

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(blob)
  })
}

function dataUrlToBlob(url: string): Blob | null {
  try {
    const comma = url.indexOf(',')
    if (comma < 0) return null
    const metadata = url.slice(5, comma)
    const mimeType = metadata.split(';')[0]
    const data = url.slice(comma + 1)
    if (metadata.toLowerCase().includes(';base64')) {
      const binary = atob(data)
      const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
      return new Blob([bytes], { type: mimeType })
    }
    return new Blob([decodeURIComponent(data)], { type: mimeType })
  } catch {
    return null
  }
}

function loadFallback(): Blob | null {
  try {
    const saved = localStorage.getItem(FALLBACK_KEY)
    return saved ? dataUrlToBlob(saved) : null
  } catch {
    return null
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise(resolve => {
    try {
      const request = indexedDB.open(DATABASE, 1)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
      request.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function loadLastOpenedMapBackground(): Promise<Blob | null> {
  if (sessionBackground) return sessionBackground
  const database = await openDatabase()
  if (!database) return loadFallback()
  try {
    const stored = await new Promise<Blob | null>(resolve => {
      const request = database.transaction(STORE, 'readonly').objectStore(STORE).get(KEY)
      request.onsuccess = () => resolve((request.result as Blob | undefined) ?? null)
      request.onerror = () => resolve(loadFallback())
    })
    sessionBackground = stored ?? loadFallback()
    return sessionBackground
  } catch {
    sessionBackground = loadFallback()
    return sessionBackground
  } finally {
    database.close()
  }
}

export async function saveLastOpenedMapBackground(background: Blob): Promise<void> {
  sessionBackground = background
  const dataUrl = await blobToDataUrl(background)
  if (dataUrl) {
    try {
      localStorage.setItem(FALLBACK_KEY, dataUrl)
    } catch {
      // Large backgrounds may exceed localStorage. IndexedDB remains primary.
    }
  }

  const database = await openDatabase()
  if (!database) return
  try {
    await new Promise<void>(resolve => {
      const transaction = database.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).put(background, KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
      transaction.onabort = () => resolve()
    })
  } catch {
    // Keep map loading usable if browser storage is unavailable.
  } finally {
    database.close()
  }
}
