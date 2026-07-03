import { create } from 'zustand'
import type { Beatmap, ConvertDirection, ExportConfig } from '../types/beatmap'

interface MediaUrls {
  audio: string | null
  background: string | null
  banner: string | null
  cdtitle: string | null
}

interface ConverterState {
  sourceFile: string | null
  beatmap: Beatmap | null
  direction: ConvertDirection
  mediaUrls: MediaUrls

  // export config (editable)
  config: ExportConfig

  isConverting: boolean
  convertedContent: string | null
  exportPath: string | null
  error: string | null
  dragging: boolean

  setSourceFile: (path: string | null) => void
  setBeatmap: (beatmap: Beatmap | null, direction?: ConvertDirection) => void
  setDirection: (dir: ConvertDirection) => void
  setMediaUrls: (urls: MediaUrls) => void
  updateConfig: (partial: Partial<ExportConfig>) => void
  setConverting: (v: boolean) => void
  setConvertedContent: (c: string | null) => void
  setExportPath: (p: string | null) => void
  setError: (e: string | null) => void
  setDragging: (d: boolean) => void
  updateBeatmapDifficulty: (bm: Beatmap) => void
  reset: () => void
}

function buildConfig(beatmap: Beatmap | null): ExportConfig {
  if (!beatmap) {
    return {
      title: '', artist: '', creator: '', difficulty_name: '',
      source: '', tags: '', audio_filename: '',
      background_filename: null, banner_filename: null,       cdtitle_filename: null,
      global_timing_ms: 50, output_format: 'osz',
      hp_drain: 8, overall_difficulty: 8,
      preview_time: 0,
      conversion_rate: 1,
      preserve_pitch: true,
    }
  }
  return {
    title: beatmap.title,
    artist: beatmap.artist,
    creator: beatmap.creator,
    difficulty_name: beatmap.difficulty_name,
    source: beatmap.source,
    tags: beatmap.tags,
    audio_filename: beatmap.audio_filename,
    background_filename: beatmap.background_filename,
    banner_filename: beatmap.banner_filename,
    cdtitle_filename: null,
    global_timing_ms: 50,
    output_format: beatmap.source_format === 'OsuMania' ? 'folder' : 'osz',
    hp_drain: 8,
    overall_difficulty: 8,
    preview_time: beatmap.preview_time,
    conversion_rate: 1,
    preserve_pitch: true,
  }
}

export const useConverterStore = create<ConverterState>((set) => ({
  sourceFile: null,
  beatmap: null,
  direction: 'osu-to-etterna',
  mediaUrls: { audio: null, background: null, banner: null, cdtitle: null },
  config: buildConfig(null),
  isConverting: false,
  convertedContent: null,
  exportPath: null,
  error: null,
  dragging: false,

  setSourceFile: (path) => set({ sourceFile: path }),
  setBeatmap: (beatmap, direction?: ConvertDirection) => set({
    beatmap,
    config: { ...buildConfig(beatmap), output_format: direction === 'osu-to-etterna' ? 'folder' : 'osz' },
  }),
  setDirection: (dir) => set({ direction: dir }),
  setMediaUrls: (urls) => set({ mediaUrls: urls }),
  updateConfig: (partial) => set((s) => ({ config: { ...s.config, ...partial } })),
  setConverting: (v) => set({ isConverting: v }),
  setConvertedContent: (c) => set({ convertedContent: c }),
  setExportPath: (p) => set({ exportPath: p }),
  setError: (e) => set({ error: e }),
  setDragging: (d) => set({ dragging: d }),
    updateBeatmapDifficulty: (bm) => set((s) => {
    const _old = s.beatmap
    const def = (v: string | null | undefined, fallback: string): string => v ?? fallback
    const sync = <T>(cfgVal: T, oldVal: T, newVal: T): T =>
      _old && cfgVal === oldVal ? newVal : cfgVal
    return {
      beatmap: bm,
      config: {
        ...s.config,
        difficulty_name: bm.difficulty_name,
        title: sync<string>(s.config.title, def(_old?.title, s.config.title), bm.title),
        artist: sync<string>(s.config.artist, def(_old?.artist, s.config.artist), bm.artist),
        creator: sync<string>(s.config.creator, def(_old?.creator, s.config.creator), bm.creator),
        source: sync<string>(s.config.source, def(_old?.source, s.config.source), bm.source),
        tags: sync<string>(s.config.tags, def(_old?.tags, s.config.tags), bm.tags),
        audio_filename: sync<string>(s.config.audio_filename, def(_old?.audio_filename, s.config.audio_filename), bm.audio_filename),
        background_filename: sync(s.config.background_filename, _old?.background_filename ?? null, bm.background_filename),
        banner_filename: sync(s.config.banner_filename, _old?.banner_filename ?? null, bm.banner_filename),
        preview_time: sync(s.config.preview_time, _old?.preview_time ?? s.config.preview_time, bm.preview_time),
      },
    }
  }),
  reset: () => set({
    sourceFile: null, beatmap: null, convertedContent: null,
    exportPath: null, error: null, isConverting: false,
    config: buildConfig(null),
    mediaUrls: { audio: null, background: null, banner: null, cdtitle: null },
  }),
}))
