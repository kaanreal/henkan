import type { SkinPreview } from '../types/skin'

const DATABASE = 'henkan-skin-previews'
const STORE = 'previews'

type CachedPreview = {
  revision: string
  preview: SkinPreview
}

function openPreviewCache(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DATABASE, 1)
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function loadCachedSkinPreview(path: string, revision: string): Promise<SkinPreview | null> {
  const database = await openPreviewCache()
  if (!database) return null
  try {
    return await new Promise<SkinPreview | null>((resolve) => {
      const request = database.transaction(STORE, 'readonly').objectStore(STORE).get(path)
      request.onsuccess = () => {
        const cached = request.result as CachedPreview | undefined
        resolve(cached?.revision === revision ? cached.preview : null)
      }
      request.onerror = () => resolve(null)
    })
  } catch {
    return null
  } finally {
    database.close()
  }
}

export async function saveCachedSkinPreview(path: string, revision: string, preview: SkinPreview): Promise<void> {
  const database = await openPreviewCache()
  if (!database) return
  try {
    await new Promise<void>((resolve) => {
      const transaction = database.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).put({ revision, preview } satisfies CachedPreview, path)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => resolve()
      transaction.onabort = () => resolve()
    })
  } finally {
    database.close()
  }
}
