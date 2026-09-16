import { afterEach, describe, expect, it, vi } from 'vitest'

const { eventGate, invoke, listen } = vi.hoisted(() => {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return {
    eventGate: { promise, release: () => release() },
    invoke: vi.fn(),
    listen: vi.fn(),
  }
})

vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('@tauri-apps/api/event', async () => {
  await eventGate.promise
  return { listen }
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('watchEtternaLive', () => {
  it('subscribes before taking the first snapshot', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    const order: string[] = []
    listen.mockImplementation(async () => {
      order.push('listen')
      return () => {}
    })
    invoke.mockImplementation(async () => {
      order.push('invoke')
      return { running: true, connected: true, map: null, problem: null }
    })

    const { watchEtternaLive } = await import('./etternaDesktop')
    const watching = watchEtternaLive(() => {})
    await Promise.resolve()
    expect(order[0]).toBeUndefined()
    eventGate.release()
    await watching
    await vi.waitFor(() => expect(order).toEqual(['listen', 'invoke']))
  })
})

describe('etternaClientName', () => {
  it('labels the Etterna live source', async () => {
    const { etternaClientName } = await import('./etternaDesktop')
    expect(etternaClientName()).toBe('Etterna')
  })
})
