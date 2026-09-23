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
    // Keep the current artwork while the native bridge reads the next song.
    // OsuBackground crossfades once this request resolves, so a slow read does
    // not briefly unmount the whole background layer.
    void load(key, map).then((next) => {
      if (live) setLoaded({ key, url: next })
    })
    return () => { live = false }
  }, [key])

  // Keep the previous artwork visible until the next song's artwork is ready.
  return loaded.url
}
