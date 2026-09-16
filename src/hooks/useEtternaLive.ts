import { useEffect, useState } from 'react'
import { ETTERNA_OFFLINE, watchEtternaLive, type EtternaLive } from '../lib/etternaDesktop'

export function useEtternaLive(enabled = true): { live: EtternaLive } {
  const [live, setLive] = useState<EtternaLive>(ETTERNA_OFFLINE)

  useEffect(() => {
    let stop: (() => void) | null = null
    let cancelled = false
    if (!enabled) {
      return
    }

    void watchEtternaLive((next) => {
      setLive(next)
    }).then((unwatch) => {
      if (cancelled) void unwatch()
      else stop = unwatch
    })

    return () => {
      cancelled = true
      stop?.()
    }
  }, [enabled])

  return { live }
}
