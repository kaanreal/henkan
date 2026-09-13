import { isTauri } from '../services/environment'

export type OsuSelectedMap = {
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

export type OsuLive = {
  running: boolean
  connected: boolean
  map: OsuSelectedMap | null
  problem: string | null
}

export const OSU_LIVE_EVENT = 'henkan://osu-live'
export const OSU_OFFLINE: OsuLive = {
  running: false,
  connected: false,
  map: null,
  problem: null,
}

async function invoker() {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke
}

export async function osuLive(): Promise<OsuLive> {
  if (!isTauri()) return OSU_OFFLINE
  try {
    return await (await invoker())<OsuLive>('osu_live')
  } catch {
    return OSU_OFFLINE
  }
}

export async function watchOsuLive(onLive: (live: OsuLive) => void): Promise<() => void> {
  if (!isTauri()) return () => {}
  let stopped = false
  void osuLive().then((live) => {
    if (!stopped) onLive(live)
  })

  const { listen } = await import('@tauri-apps/api/event')
  const unlisten = await listen<OsuLive>(OSU_LIVE_EVENT, (event) => {
    if (!stopped) onLive(event.payload)
  })
  return () => {
    stopped = true
    void unlisten()
  }
}

export async function osuReadMap(folder: string): Promise<string> {
  if (!isTauri()) throw new Error('The osu! integration only works in the desktop app.')
  return await (await invoker())<string>('osu_read_map', { folder })
}

export async function osuMapBackground(folder: string, file: string): Promise<Blob | null> {
  if (!isTauri()) return null
  try {
    const bytes = await (await invoker())<ArrayBuffer | Uint8Array | number[]>('osu_map_background', { folder, file })
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
  return null
}

function toBuffer(value: ArrayBuffer | Uint8Array | number[]): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value
  const source = Array.isArray(value) ? new Uint8Array(value) : value
  const copy = new ArrayBuffer(source.byteLength)
  new Uint8Array(copy).set(source)
  return copy
}

export function osuMapName(map: OsuSelectedMap): { artist: string; title: string } {
  if (map.artist && map.title) return { artist: map.artist, title: map.title }
  const folder = map.folder.trim().replace(/^\d+\s+(?!- )/, '')
  const split = folder.indexOf(' - ')
  if (split < 0) return { artist: map.artist, title: map.title || folder }
  return {
    artist: map.artist || folder.slice(0, split).trim(),
    title: map.title || folder.slice(split + 3).trim(),
  }
}

export function osuMapLabel(map: OsuSelectedMap): string {
  const { artist, title } = osuMapName(map)
  const song = [artist, title].filter(Boolean).join(' - ')
  const name = song || map.folder
  return map.difficulty ? `${name} [${map.difficulty}]` : name
}
