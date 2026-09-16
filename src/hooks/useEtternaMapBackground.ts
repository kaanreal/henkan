import { useEffect, useState } from 'react'
import { etternaMapBackground, type EtternaSelectedMap } from '../lib/etternaDesktop'

const cache = new Map<string, string | null>()
const inFlight = new Map<string, Promise<string | null>>()
const CACHE_LIMIT = 8

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
    if (!map || !key) return
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

  return map ? loaded.url : null
}
