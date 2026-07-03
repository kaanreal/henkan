import { isTauri } from './environment'

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

  if (typeof window !== 'undefined' && (window as any).pta) {
    try {
      (window as any).pta(event, properties)
    } catch {
      // ignore
    }
  }
}
