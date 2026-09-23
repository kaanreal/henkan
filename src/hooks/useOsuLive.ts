import { useEffect, useRef, useState } from 'react'
import { OSU_OFFLINE, watchOsuLive, type OsuLive } from '../lib/osuDesktop'

export function useOsuLive(enabled = true): {
  live: OsuLive
  connectedAt: number | null
  acknowledge: () => void
} {
  const [live, setLive] = useState<OsuLive>(OSU_OFFLINE)
  const [connectedAt, setConnectedAt] = useState<number | null>(null)
  const wasConnected = useRef(false)

  useEffect(() => {
    let stop: (() => void) | null = null
    let cancelled = false
    if (!enabled) {
      wasConnected.current = false
      return
    }

    void watchOsuLive((next) => {
      setLive(next)
      if (next.connected && !wasConnected.current) setConnectedAt(Date.now())
      if (!next.connected && wasConnected.current) setConnectedAt(null)
      wasConnected.current = next.connected
    }).then((unwatch) => {
      if (cancelled) void unwatch()
      else stop = unwatch
    })

    return () => {
      cancelled = true
      stop?.()
    }
  }, [enabled])

  return {
    live: enabled ? live : OSU_OFFLINE,
    connectedAt: enabled ? connectedAt : null,
    acknowledge: () => setConnectedAt(null),
  }
}
