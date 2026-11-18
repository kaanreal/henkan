import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useConverterStore } from '../stores/useConverterStore'
import { convertBeatmap, oszContentCache, parseFile } from './convert'
import { exportAllBeatmaps, exportBeatmap } from './export'
import { clearFileCache, fileInputCache } from './fileCache'
import { saveBlobToFile, saveContentToFile } from './files'

vi.mock('./files', { spy: true })

function osuChart(difficulty: string): string {
  return `osu file format v14

[General]
AudioFilename: song.ogg
Mode: 3

[Metadata]
Title:Song
Artist:Artist
Creator:Mapper
Version:${difficulty}

[Difficulty]
CircleSize:4

[Events]
0,0,"art.png",0,0

[TimingPoints]
0,500,4,2,1,100,1,0

[HitObjects]
64,192,1000,1,0,0:0:0:0:
`
}

async function loadBeatmapSet() {
  const input = new JSZip()
  input.file('easy.osu', osuChart('Easy'))
  input.file('hard.osu', osuChart('Hard'))
  input.file('song.ogg', 'audio')
  input.file('art.png', 'background')
  input.file('banner.jpg', 'banner')
  input.file('disc.png', 'cd title')
  const bytes = await input.generateAsync({ type: 'arraybuffer' })
  fileInputCache.push(new File([bytes], 'source.osz'))

  const beatmap = await parseFile('source.osz', 'osu-to-etterna')
  useConverterStore.getState().setBeatmap(beatmap, 'osu-to-etterna')
  return { beatmap, config: useConverterStore.getState().config }
}

async function readDownload() {
  expect(saveBlobToFile).toHaveBeenCalledTimes(1)
  const [blob] = vi.mocked(saveBlobToFile).mock.calls[0]
  return JSZip.loadAsync(await blob.arrayBuffer(), { checkCRC32: true })
}

describe('web beatmap exports', () => {
  beforeEach(() => {
    vi.mocked(saveBlobToFile).mockResolvedValue(undefined)
    vi.mocked(saveContentToFile).mockResolvedValue(undefined)
    vi.stubGlobal('fetch', async (url: URL | string) => {
      if (String(url).endsWith('/henkan_core_bg.wasm')) {
        const wasm = await readFile(new URL('../wasm/henkan_core_bg.wasm', import.meta.url))
        return new Response(new Uint8Array(wasm), { headers: { 'Content-Type': 'application/wasm' } })
      }
      return new Response(null, { status: 404 })
    })
  })

  afterEach(() => {
    clearFileCache()
    oszContentCache.clear()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('puts a converted chart and its media in one song folder', async () => {
    const { beatmap, config } = await loadBeatmapSet()
    const edited = {
      ...config, title: 'Edited / Song', creator: 'A:Mapper',
      banner_filename: 'banner.jpg', cdtitle_filename: 'disc.png',
    }
    const content = await convertBeatmap(beatmap, edited)
    const name = await exportBeatmap(beatmap, edited, content, '', 'Easy/4K')
    expect(name).toBe('Edited _ Song [A_Mapper] Easy_4K.zip')

    const zip = await readDownload()
    const folder = 'Edited _ Song [A_Mapper]/'
    expect(Object.keys(zip.files)).toEqual([
      folder,
      `${folder}Edited _ Song [A_Mapper] Easy_4K.sm`,
      `${folder}song.ogg`,
      `${folder}bg.png`,
      `${folder}banner.png`,
      `${folder}cdtitle.png`,
    ])
    const chart = await zip.file(`${folder}Edited _ Song [A_Mapper] Easy_4K.sm`)!.async('text')
    expect(chart).toContain('#MUSIC:song.ogg;')
    expect(chart).toContain('#BACKGROUND:bg.png;')
    expect(chart).toContain('#BANNER:banner.png;')
    expect(chart).toContain('#CDTITLE:cdtitle.png;')
    expect(await zip.file(`${folder}song.ogg`)!.async('text')).toBe('audio')
    expect(await zip.file(`${folder}bg.png`)!.async('text')).toBe('background')
    expect(await zip.file(`${folder}banner.png`)!.async('text')).toBe('banner')
    expect(await zip.file(`${folder}cdtitle.png`)!.async('text')).toBe('cd title')
  })

  it('keeps all selected difficulties and their shared media under one folder', async () => {
    const { config } = await loadBeatmapSet()
    expect(await exportAllBeatmaps('source.osz', config, '', [0, 1])).toEqual(['Song.zip'])

    const zip = await readDownload()
    expect(Object.keys(zip.files).sort()).toEqual([
      'Song [Mapper]/',
      'Song [Mapper]/Song [Mapper] [Easy].sm',
      'Song [Mapper]/Song [Mapper] [Hard].sm',
      'Song [Mapper]/bg.png',
      'Song [Mapper]/song.ogg',
    ])
  })

  it('keeps osu! packages flat', async () => {
    const { beatmap, config } = await loadBeatmapSet()
    const etterna = { ...beatmap, source_format: 'Etterna' as const }
    const osuConfig = { ...config, output_format: 'osz' as const }
    const content = await convertBeatmap(etterna, osuConfig)
    expect(await exportBeatmap(etterna, osuConfig, content, '')).toBe('Artist - Song.osz')

    const zip = await readDownload()
    expect(Object.keys(zip.files)).toEqual(['Artist - Song.osu', 'song.ogg', 'bg.jpg'])
  })
})
