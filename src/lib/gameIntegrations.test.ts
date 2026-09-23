import { describe, expect, it } from 'vitest'
import { directSaveFolder, hasDetectedGame, type GameInstallations } from './gameIntegrations'

const installations: GameInstallations = {
  osu: {
    supported: true,
    installed: true,
    running: false,
    root: 'C:\\Games\\osu!',
    songs: 'D:\\Beatmaps',
  },
  etterna: {
    supported: true,
    installed: true,
    root: 'C:\\Games\\Etterna',
    songs: 'C:\\Games\\Etterna\\Songs',
  },
}

describe('game integrations', () => {
  it('uses the configured osu!stable Songs folder for osu exports', () => {
    expect(directSaveFolder(installations, 'etterna-to-osu')).toBe('D:\\Beatmaps')
  })

  it('uses the Etterna Songs folder directly', () => {
    expect(directSaveFolder(installations, 'osu-to-etterna')).toBe(
      'C:\\Games\\Etterna\\Songs',
    )
  })

  it('does not expose a shortcut when the target game is missing', () => {
    const onlyOsu = {
      ...installations,
      etterna: { supported: true, installed: false, root: null, songs: null },
    }
    expect(directSaveFolder(onlyOsu, 'osu-to-etterna')).toBeNull()
    expect(hasDetectedGame(onlyOsu)).toBe(true)
  })
})
