import { useEffect, useState } from 'react'
import { osuMapBackground, type OsuSelectedMap } from '../lib/osuDesktop'

const cache = new Map<string, string | null>()
const inFlight = new Map<string, Promise<string | null>>()
const CACHE_LIMIT = 8
const ARTWORK_GRACE_MS = 800

function mapKey(map: OsuSelectedMap): string {
  return `${map.folder}\n${map.file}`
}

function remember(key: string, value: string | null): void {
  cache.set(key, value)
  for (const [old, url] of cache) {
    if (cache.size <= CACHE_LIMIT) break
    if (old === key) continue
    cache.delete(old)
    if (url) URL.revokeObjectURL(url)
  }
}

function load(key: string, map: OsuSelectedMap): Promise<string | null> {
  const existing = inFlight.get(key)
  if (existing) return existing
  const request = osuMapBackground(map.folder, map.file)
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

export function useOsuMapBackground(map: OsuSelectedMap | null): string | null {
  const key = map ? mapKey(map) : null
  const [loaded, setLoaded] = useState<{ key: string | null; url: string | null }>(() => ({
    key,
    url: key ? (cache.get(key) ?? null) : null,
  }))

  useEffect(() => {
    if (!map || !key) {
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
    // Do not leave the previous song's artwork attached to the new map while
    // the native bridge is reading the next asset. OsuBackground handles the
    // short dark transition; retaining the old URL here makes a slow read look
    // like the new song has the wrong background.
    queueMicrotask(() => {
      if (live) setLoaded({ key, url: null })
    })
    void load(key, map).then((next) => {
      if (live) setLoaded({ key, url: next })
    })
    return () => { live = false }
  }, [key])

  // Keep the previous artwork visible only while the live source disappears.
  // During a song change, a null result means the current map is still being
  // read and must not display the previous song's artwork.
  return key && loaded.key === key ? loaded.url : key ? null : loaded.url
}
