import type { ConvertDirection } from '../types/beatmap'
import { etternaStatus, type EtternaStatus } from './etternaDesktop'
import { osuStatus, type OsuStatus } from './osuLibrary'

export type GameInstallations = {
  osu: OsuStatus
  etterna: EtternaStatus
}

export async function detectGameInstallations(): Promise<GameInstallations> {
  const [osu, etterna] = await Promise.all([osuStatus(), etternaStatus()])
  return { osu, etterna }
}

export function directSaveFolder(
  installations: GameInstallations | null,
  direction: ConvertDirection | null,
): string | null {
  if (!installations || !direction) return null
  if (direction === 'etterna-to-osu') return installations.osu.songs
  return installations.etterna.songs
}

export function hasDetectedGame(installations: GameInstallations | null): boolean {
  return Boolean(installations?.osu.songs || installations?.etterna.songs)
}
