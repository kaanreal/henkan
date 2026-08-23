import { isTauri } from './environment'

// Plausible-style analytics injected by the web deployment
declare global {
  interface Window {
    pta?: (event: string, properties?: Record<string, string>) => void
  }
}

export async function trackEvent(
  event: string,
  properties?: Record<string, string>,
): Promise<void> {
  if (isTauri()) {
    try {
      const { trackEvent } = await import('@aptabase/tauri')
      trackEvent(event, properties)
    } catch {
      // analytics unavailable
    }
    return
  }

  if (typeof window !== 'undefined' && window.pta) {
    try {
      window.pta(event, properties)
    } catch {
      // ignore
    }
  }
}
