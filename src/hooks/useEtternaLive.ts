import { useEffect, useRef, useState } from 'react'
import { ETTERNA_OFFLINE, watchEtternaLive, type EtternaLive } from '../lib/etternaDesktop'

const MAP_GAP_GRACE_MS = 700

export function useEtternaLive(enabled = true): { live: EtternaLive } {
  const [live, setLive] = useState<EtternaLive>(ETTERNA_OFFLINE)
  const lastMap = useRef<EtternaLive['map']>(null)
  const gapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let stop: (() => void) | null = null
    let cancelled = false

    const clearGapTimer = () => {
      if (gapTimer.current !== null) {
        clearTimeout(gapTimer.current)
        gapTimer.current = null
      }
    }

    if (!enabled) {
      clearGapTimer()
      lastMap.current = null
      return
    }

    void watchEtternaLive((next) => {
      clearGapTimer()

      // During a song change Etterna can briefly report a connected process
      // with no audio handle. Hold the current card through that gap instead
      // of unmounting it and replaying its entrance animation.
      if (next.connected && !next.map && lastMap.current) {
        setLive({ ...next, map: lastMap.current })
        gapTimer.current = setTimeout(() => {
          gapTimer.current = null
          lastMap.current = null
          setLive(next)
        }, MAP_GAP_GRACE_MS)
        return
      }

      lastMap.current = next.map
      setLive(next)
    }).then((unwatch) => {
      if (cancelled) void unwatch()
      else stop = unwatch
    })

    return () => {
      cancelled = true
      clearGapTimer()
      lastMap.current = null
      stop?.()
    }
  }, [enabled])

  return { live }
}
