import { afterEach, describe, expect, it, vi } from 'vitest'

const { eventGate, invoke, listen } = vi.hoisted(() => {
  let release!: () => void
  const promise = new Promise<void>((resolve) => { release = resolve })
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

describe('watchOsuLive', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('subscribes before taking the first snapshot', async () => {
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} })
    const live = {
      running: true,
      connected: true,
      map: null,
      problem: null,
    }
    const order: string[] = []
    listen.mockImplementation(async () => {
      order.push('listen')
      return () => {}
    })
    invoke.mockImplementation(async () => {
      order.push('invoke')
      return live
    })

    const { watchOsuLive } = await import('./osuDesktop')
    const watching = watchOsuLive(() => {})
    await Promise.resolve()
    const invokedBeforeListener = order[0] === 'invoke'
    eventGate.release()
    await watching
    await vi.waitFor(() => expect(order).toEqual(['listen', 'invoke']))

    expect(invokedBeforeListener).toBe(false)
  })
})

describe('osuClientName', () => {
  it('labels stable and lazer maps separately', async () => {
    const { osuClientName } = await import('./osuDesktop')
    expect(osuClientName({ folder: 'lazer:0123456789abcdef' })).toBe('osu!lazer')
    expect(osuClientName({ folder: '12345 Artist - Song' })).toBe('osu!stable')
  })
})
