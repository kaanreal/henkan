import { isTauri } from '../services/environment'

export type EtternaSelectedMap = {
  folder: string
  file: string
  artist: string
  title: string
  creator: string
  difficulty: string
  mapId: number
  setId: number
  osuRoot: string | null
}

export type EtternaLive = {
  running: boolean
  connected: boolean
  map: EtternaSelectedMap | null
  problem: string | null
}

export type EtternaStatus = {
  supported: boolean
  installed: boolean
  root: string | null
  songs: string | null
}

export const ETTERNA_LIVE_EVENT = 'henkan://etterna-live'
export const ETTERNA_OFFLINE: EtternaLive = {
  running: false,
  connected: false,
  map: null,
  problem: null,
}

async function invoker() {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke
}

export async function etternaLive(): Promise<EtternaLive> {
  if (!isTauri()) return ETTERNA_OFFLINE
  try {
    return await (await invoker())<EtternaLive>('etterna_live')
  } catch {
    return ETTERNA_OFFLINE
  }
}

export async function etternaStatus(): Promise<EtternaStatus> {
  if (!isTauri()) return { supported: false, installed: false, root: null, songs: null }
  return await (await invoker())<EtternaStatus>('etterna_status')
}

export async function watchEtternaLive(onLive: (live: EtternaLive) => void): Promise<() => void> {
  if (!isTauri()) return () => {}
  let stopped = false
  const { listen } = await import('@tauri-apps/api/event')
  const unlisten = await listen<EtternaLive>(ETTERNA_LIVE_EVENT, (event) => {
    if (!stopped) onLive(event.payload)
  })

  void etternaLive().then((live) => {
    if (!stopped) onLive(live)
  })

  return () => {
    stopped = true
    void unlisten()
  }
}

export async function etternaReadMap(folder: string, file: string): Promise<string> {
  if (!isTauri()) throw new Error('The Etterna integration only works in the desktop app.')
  return await (await invoker())<string>('etterna_read_map', { folder, file })
}

export async function etternaMapBackground(folder: string, file: string): Promise<Blob | null> {
  if (!isTauri()) return null
  try {
    const bytes = await (await invoker())<ArrayBuffer | Uint8Array | number[]>('etterna_map_background', {
      folder,
      file,
    })
    const buffer = toBuffer(bytes)
    if (!buffer.byteLength) return null
    const type = imageMime(new Uint8Array(buffer))
    return type ? new Blob([buffer], { type }) : null
  } catch {
    return null
  }
}

function imageMime(bytes: Uint8Array): string | null {
  const starts = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte)
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (starts(0x89, 0x50, 0x4e, 0x47)) return 'image/png'
  if (starts(0x42, 0x4d)) return 'image/bmp'
  if (
    starts(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  )
    return 'image/webp'
  return null
}

function toBuffer(value: ArrayBuffer | Uint8Array | number[]): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value
  const source = Array.isArray(value) ? new Uint8Array(value) : value
  const copy = new ArrayBuffer(source.byteLength)
  new Uint8Array(copy).set(source)
  return copy
}

export function etternaClientName(): 'Etterna' {
  return 'Etterna'
}
