import { useEffect, useState } from 'react'
import { etternaMapBackground, type EtternaSelectedMap } from '../lib/etternaDesktop'

const cache = new Map<string, string | null>()
const inFlight = new Map<string, Promise<string | null>>()
const CACHE_LIMIT = 8
const ARTWORK_GRACE_MS = 800

function remember(key: string, value: string | null): void {
  cache.set(key, value)
  for (const [old, url] of cache) {
    if (cache.size <= CACHE_LIMIT) break
    if (old === key) continue
    cache.delete(old)
    if (url) URL.revokeObjectURL(url)
  }
}

function load(key: string, map: EtternaSelectedMap): Promise<string | null> {
  const existing = inFlight.get(key)
  if (existing) return existing
  const request = etternaMapBackground(map.folder, map.file)
    .then((blob) => {
      const url = blob ? URL.createObjectURL(blob) : null
      remember(key, url)
      return url
    })
    .catch(() => null)
    .finally(() => inFlight.delete(key))
  inFlight.set(key, request)
  return request
}

export function useEtternaMapBackground(map: EtternaSelectedMap | null): string | null {
  const key = map ? `${map.folder}\n${map.file}` : null
  const [loaded, setLoaded] = useState<{ key: string | null; url: string | null }>(() => ({
    key,
    url: key ? (cache.get(key) ?? null) : null,
  }))

  useEffect(() => {
    if (!map || !key) {
      // A native song change can briefly report no audio handle. Keep the
      // previous artwork through that gap, but clear it if Etterna really
      // stops reporting a selected song.
      const timeout = window.setTimeout(() => {
        setLoaded({ key: null, url: null })
      }, ARTWORK_GRACE_MS)
      return () => window.clearTimeout(timeout)
    }
    if (cache.has(key)) {
      queueMicrotask(() => setLoaded({ key, url: cache.get(key) ?? null }))
      return
    }
    let live = true
    void load(key, map).then((next) => {
      if (live) setLoaded({ key, url: next })
    })
    return () => {
      live = false
    }
  }, [key, map])

  // Keep the last artwork during the short gap between two native song
  // detections. The prompt itself can disappear, but the page background
  // should not flash back to the solid fallback color.
  return loaded.url
}
