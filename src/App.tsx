import type { Beatmap, ExportConfig, PackEntry } from './types/beatmap'
import { useCallback, useState, useEffect, useRef, startTransition } from 'react'
import { useConverterStore } from './stores/useConverterStore'
import { useQueueStore, type QueueItem, buildConfig, emptyConfig, generateId, detectDirection } from './stores/useQueueStore'
import { ErrorBoundary } from './components/ErrorBoundary'
import { trackEvent } from '@aptabase/tauri'
import { Header } from './components/Header'
import { DropZone } from './components/DropZone'
import { ConversionQueue } from './components/ConversionQueue'
import { MetadataPanel } from './components/MetadataPanel'
import { AudioPlayer } from './components/AudioPlayer'
import { PreviewOverlay } from './components/PreviewOverlay'
import { ConvertDialog } from './components/ConvertDialog'
import { MultiAudioWarning } from './components/MultiAudioWarning'
import { BulkConvertDialog } from './components/BulkConvertDialog'
import { PackBrowser } from './components/PackBrowser'
import { FallingArrows } from './components/FallingArrows'
import { PackSettingsDialog } from './components/PackSettingsDialog'
import { WebAudioPlayer } from './lib/WebAudioPlayer'
import { getCurrentWindow } from '@tauri-apps/api/window'

const ACCEPTED_EXTS = ['.osu', '.osz', '.sm']

function configFromEntry(entry: PackEntry): ExportConfig {
  const fallback = entry.source_file.split(/[/\\]+/).filter(Boolean).pop()?.replace(/\.[^.]+$/, '') || 'Untitled'
  return {
    title: entry.title || fallback,
    artist: entry.artist,
    creator: '',
    difficulty_name: '',
    source: '',
    tags: '',
    audio_filename: '',
    background_filename: entry.background_filename,
    banner_filename: null,
    cdtitle_filename: null,
    global_timing_ms: 50,
    output_format: 'osz',
    hp_drain: 8,
    overall_difficulty: 8,
    preview_time: 0,
    conversion_rate: 1,
    preserve_pitch: true,
  }
}

async function loadMediaAsDataUrl(sourceDir: string, filename: string | null): Promise<string | null> {
  if (!filename) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const resolved = await invoke<string>('resolve_file', { sourceDir, filename })
    return await invoke<string>('read_file_as_data_url', { path: resolved })
  } catch {
    return null
  }
}

function App() {
  const {
    beatmap, config, direction, mediaUrls,
    isConverting, exportPath, error, dragging,
    setBeatmap, setMediaUrls, setDirection,
    setConverting, setExportPath,
    setError, setDragging, reset,
  } = useConverterStore()

  const [lastExportPath, setLastExportPath] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [switchingDifficulty, setSwitchingDifficulty] = useState(false)
  const [showConvertDialog, setShowConvertDialog] = useState(false)
  const [showMultiAudioWarning, setShowMultiAudioWarning] = useState(false)
  const pendingIndicesRef = useRef<number[]>([])
  const [showBulkConvert, setShowBulkConvert] = useState(false)
  const [showPackSettings, setShowPackSettings] = useState(false)
  const [packConvertAllMode, setPackConvertAllMode] = useState(false)
  const [queueLoading, setQueueLoading] = useState(false)

  // Queue state
  const queueItems = useQueueStore(s => s.items)
  const queueActiveId = useQueueStore(s => s.activeId)
  const queueAddItem = useQueueStore(s => s.addItem)
  const queueRemoveItem = useQueueStore(s => s.removeItem)
  const queueSetActiveId = useQueueStore(s => s.setActiveId)
  const queueUpdateItem = useQueueStore(s => s.updateItem)
  const queueClearCompleted = useQueueStore(s => s.clearCompleted)
  const queueClearAll = useQueueStore(s => s.clearAll)

  // Pack browsing state
  const [packFolder, setPackFolder] = useState<string | null>(null)
  const [packEntries, setPackEntries] = useState<PackEntry[]>([])
  const [packSelected, setPackSelected] = useState<Set<number>>(new Set())
  const [packEditing, setPackEditing] = useState<number | null>(null)
  const [packLoading, setPackLoading] = useState(false)
  const [packBannerUrl, setPackBannerUrl] = useState<string | null>(null)
  const [packBannerPath, setPackBannerPath] = useState<string | null>(null)
  const packConfigsRef = useRef<Map<number, ExportConfig>>(new Map())

  // Shared audio player — owned by App, used by AudioPlayer and PreviewOverlay
  const audioPlayerRef = useRef<WebAudioPlayer | null>(null)
  const [audioLoading, setAudioLoading] = useState(false)
  const [audioPlaying, setAudioPlaying] = useState(false)
  const [audioDuration, setAudioDuration] = useState(0)
  const [volumeToast, setVolumeToast] = useState<{ msg: string; leaving?: boolean } | null>(null)
  const volumeToastTimer = useRef<number | undefined>(undefined)

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F12') e.preventDefault()
      if (e.code === 'Space' && beatmap && mediaUrls.audio) {
        e.preventDefault()
        if (!showPreview) setShowPreview(true)
      }
      if (e.key === 'Escape') setShowPreview(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [beatmap, mediaUrls.audio, showPreview])

  // Alt+Scrollwheel volume control
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      if (!e.altKey || !audioPlayerRef.current) return
      e.preventDefault()
      const player = audioPlayerRef.current
      const step = e.deltaY < 0 ? 0.05 : -0.05
      const newVol = Math.round(Math.max(0, Math.min(1, player.volume + step)) * 100)
      player.volume = newVol / 100
      if (volumeToastTimer.current) clearTimeout(volumeToastTimer.current)
      setVolumeToast({ msg: `Volume ${newVol}%` })
      volumeToastTimer.current = window.setTimeout(() => {
        setVolumeToast(v => v ? { ...v, leaving: true } : null)
        volumeToastTimer.current = window.setTimeout(() => setVolumeToast(null), 220)
      }, 1000)
    }
    window.addEventListener('wheel', handler, { passive: false })
    return () => window.removeEventListener('wheel', handler)
  }, [])

  // Initialize WebAudioPlayer and wire up callbacks
  useEffect(() => {
    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new WebAudioPlayer()
    }
    const player = audioPlayerRef.current
    player.onDurationChange = setAudioDuration
    player.onPlay = () => setAudioPlaying(true)
    player.onPause = () => setAudioPlaying(false)
    player.onEnded = () => setAudioPlaying(false)
  }, [])

  // Decode audio whenever the data URL changes
  useEffect(() => {
    const player = audioPlayerRef.current
    if (!player) return
    if (mediaUrls.audio) {
      setAudioLoading(true)
      player.load(mediaUrls.audio).finally(() => {
        setAudioLoading(false)
        const bm = useConverterStore.getState().beatmap
        if (bm && bm.preview_time > 0) {
          player.currentTime = bm.preview_time / 1000
        } else {
          player.currentTime = 0
        }
        player.play().catch(() => {})
      })
    } else {
      player.stop()
    }
  }, [mediaUrls.audio])

  const handleSetPreviewTime = useCallback((ms: number) => {
    const state = useConverterStore.getState()
    const bm = state.beatmap
    if (bm) {
      useConverterStore.setState({
        beatmap: { ...bm, preview_time: ms },
        config: { ...state.config, preview_time: ms },
      })
    }
  }, [])

  // ── Multi-file queue ─────────────────────────────────────────

  const loadQueueMedia = useCallback(async (bm: Beatmap) => {
    const [audio, bg, banner] = await Promise.all([
      loadMediaAsDataUrl(bm.source_dir, bm.audio_filename),
      loadMediaAsDataUrl(bm.source_dir, bm.background_filename),
      loadMediaAsDataUrl(bm.source_dir, bm.banner_filename),
    ])
    setMediaUrls({ audio, background: bg, banner })
  }, [setMediaUrls])

  const handleFilesSelected = useCallback(async (paths: string[]) => {
    const newIds: string[] = []
    for (const path of paths) {
      const id = generateId()
      const fileName = path.split(/[/\\]+/).filter(Boolean).pop() || path
      const dir = detectDirection(path)
      newIds.push(id)
      queueAddItem({
        id, filePath: path, fileName, direction: dir,
        beatmap: null, config: emptyConfig(),
        status: 'parsing', error: null, exportPath: null,
      })
    }

    // Parse files sequentially so each is ready as soon as possible
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i]
      const id = newIds[i]
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const dir = detectDirection(path)
        const result = await invoke<Beatmap>('parse_file', { path, direction: dir })
        const cfg = buildConfig(result)
        queueUpdateItem(id, { beatmap: result, config: cfg, status: 'ready' })

        // Auto-activate the first newly added item
        if (i === 0 && queueItems.length === 0) {
          queueSetActiveId(id)
          setDirection(dir)
          setBeatmap(result, dir)
          useConverterStore.getState().updateConfig(cfg)
          await loadQueueMedia(result)
        }
      } catch (e: unknown) {
        const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : 'Failed to parse file'
        queueUpdateItem(id, { status: 'error', error: msg })
      }
    }
  }, [queueAddItem, queueUpdateItem, queueSetActiveId, queueItems.length, setDirection, setBeatmap, loadQueueMedia])

  const handleQueueSelect = useCallback(async (item: QueueItem) => {
    if (item.id === queueActiveId || !item.beatmap) return
    // Save current config to the previously active item
    const curCfg = useConverterStore.getState().config
    if (queueActiveId) {
      queueUpdateItem(queueActiveId, { config: curCfg })
    }
    // Reset completed/errored items to ready when clicked for retry
    if (item.status === 'completed' || item.status === 'error') {
      queueUpdateItem(item.id, { status: 'ready', exportPath: null, error: null })
    }
    // Clear old content immediately to prevent flash
    setQueueLoading(true)
    setBeatmap(null)
    useConverterStore.getState().setMediaUrls({ audio: null, background: null, banner: null })
    audioPlayerRef.current?.stop()
    setAudioPlaying(false)
    setLastExportPath(null)
    setError(null)
    // Load the new item's data
    queueSetActiveId(item.id)
    setDirection(item.direction)
    try {
      const [audio, bg, banner] = await Promise.all([
        loadMediaAsDataUrl(item.beatmap.source_dir, item.beatmap.audio_filename),
        loadMediaAsDataUrl(item.beatmap.source_dir, item.beatmap.background_filename),
        loadMediaAsDataUrl(item.beatmap.source_dir, item.beatmap.banner_filename),
      ])
      useConverterStore.getState().setMediaUrls({ audio, background: bg, banner })
      setBeatmap(item.beatmap, item.direction)
      useConverterStore.getState().updateConfig(item.config)
    } catch {
      setError('Failed to load media')
    } finally {
      setQueueLoading(false)
    }
  }, [queueActiveId, queueUpdateItem, queueSetActiveId, setDirection, setBeatmap, loadMediaAsDataUrl])

  const handleQueueAddFiles = useCallback(async () => {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const selected = await open({
      multiple: true,
      filters: [{ name: 'Beatmap Files', extensions: ['osu', 'osz', 'sm'] }],
    })
    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected]
      handleFilesSelected(paths)
    }
  }, [handleFilesSelected])

  const handleQueueRemove = useCallback((id: string) => {
    const idx = queueItems.findIndex(i => i.id === id)
    if (id === queueActiveId) {
      const remaining = queueItems.filter(i => i.id !== id)
      const nextIdx = Math.min(idx, remaining.length - 1)
      const next = remaining.length > 0 ? remaining[Math.max(0, nextIdx)] : null
      queueRemoveItem(id)
      if (next && next.beatmap) {
        queueSetActiveId(next.id)
        setDirection(next.direction)
        setBeatmap(next.beatmap, next.direction)
        useConverterStore.getState().updateConfig(next.config)
        loadQueueMedia(next.beatmap)
      } else {
        queueSetActiveId(null)
        setBeatmap(null)
        reset()
      }
    } else {
      queueRemoveItem(id)
    }
  }, [queueItems, queueActiveId, queueRemoveItem, queueSetActiveId, setDirection, setBeatmap, loadQueueMedia, reset])

  const handleQueueClearAll = useCallback(() => {
    queueClearAll()
    reset()
  }, [queueClearAll, reset])

  const handleQueueClearCompleted = useCallback(() => {
    const hadActiveCompleted = queueActiveId !== null
      && queueItems.find(i => i.id === queueActiveId)?.status === 'completed'
    queueClearCompleted()
    if (hadActiveCompleted) {
      const fresh = useQueueStore.getState().items
      if (fresh.length > 0) {
        const next = fresh[fresh.length - 1]
        if (next.beatmap) {
          queueSetActiveId(next.id)
          setDirection(next.direction)
          setBeatmap(next.beatmap, next.direction)
          useConverterStore.getState().updateConfig(next.config)
          loadQueueMedia(next.beatmap)
        } else {
          reset()
        }
      }
    }
  }, [queueActiveId, queueItems, queueClearCompleted, queueSetActiveId, setDirection, setBeatmap, loadQueueMedia, reset])

  const handleResetAll = useCallback(() => {
    for (const item of queueItems) {
      if ((item.status === 'completed' || item.status === 'error') && item.beatmap) {
        queueUpdateItem(item.id, { status: 'ready', exportPath: null, error: null })
      }
    }
  }, [queueItems, queueUpdateItem])

  const doBatchConversion = useCallback(async () => {
    const readyItems = queueItems.filter(i => i.status === 'ready' && i.beatmap)
    if (readyItems.length === 0 || isConverting) return

    // Save active config before starting
    const activeCfg = useConverterStore.getState().config
    if (queueActiveId) {
      queueUpdateItem(queueActiveId, { config: activeCfg })
    }

    setConverting(true)
    setError(null)
    setLastExportPath(null)

    const { invoke } = await import('@tauri-apps/api/core')
    const { open } = await import('@tauri-apps/plugin-dialog')

    const baseDir = await open({ directory: true, title: 'Export all to folder' })
    if (!baseDir) { setConverting(false); return }

    const allPaths: string[] = []

    for (const item of readyItems) {
      // Use chosen output_format for all items; preserve per-item metadata edits
      const cfg = { ...item.config, output_format: activeCfg.output_format }
      queueUpdateItem(item.id, { status: 'converting' })
      try {
        const ext = item.filePath.split('.').pop()?.toLowerCase() || ''

        if (ext === 'sm' || ext === 'osz') {
          const paths = await invoke<string[]>('export_all_beatmaps', {
            sourceFile: item.filePath,
            config: cfg,
            outputDir: baseDir,
          })
          allPaths.push(...paths)
        } else {
          const maxIdx = item.beatmap!.available_difficulties.length
          for (let i = 0; i < Math.max(1, maxIdx); i++) {
            const bm = await invoke<Beatmap>('select_difficulty', { path: item.filePath, index: i })
            const content = await invoke<string>('convert_beatmap', { beatmap: bm, config: cfg })
            const result = await invoke<string>('export_beatmap', {
              beatmap: bm, config: cfg,
              convertedContent: content, outputDir: baseDir,
            })
            allPaths.push(result)
          }
        }
        queueUpdateItem(item.id, { status: 'completed', exportPath: allPaths[allPaths.length - 1], config: cfg })
      } catch (e: unknown) {
        const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : 'Conversion failed'
        queueUpdateItem(item.id, { status: 'error', error: msg, config: cfg })
      }
    }

    if (allPaths.length > 0) {
      setLastExportPath(allPaths.join('\n'))
      setExportPath(baseDir)
      trackEvent('batch_conversion_completed', { count: String(readyItems.length) })
    }
    setConverting(false)
  }, [queueItems, queueActiveId, isConverting, queueUpdateItem, setConverting, setError, setExportPath])

  const handleConvert = useCallback(() => {
    if (!beatmap) return
    setShowConvertDialog(true)
  }, [beatmap])

  const doConversion = useCallback(async (indices: number[], separateSongs: boolean) => {
    if (!beatmap?.source_file || indices.length === 0) return
    setConverting(true)
    setError(null)
    setLastExportPath(null)

    const cur = useConverterStore.getState().config
    try {
      const { invoke } = await import('@tauri-apps/api/core')

      let exportDir: string | null = null

      if (cur.output_format === 'osz') {
        const { save } = await import('@tauri-apps/plugin-dialog')
        exportDir = await save({
          title: 'Export as .osz',
          defaultPath: `${cur.artist} - ${cur.title} (${cur.creator}).osz`,
          filters: [{ name: 'osu! beatmap package', extensions: ['osz'] }],
        })
      } else {
        const { open } = await import('@tauri-apps/plugin-dialog')
        exportDir = await open({
          directory: true,
          title: 'Choose export folder',
        })
      }

      if (!exportDir) { setConverting(false); return }

      const allPaths: string[] = []

      if (separateSongs) {
        for (const idx of indices) {
          const bm = await invoke<Beatmap>('select_difficulty', { path: beatmap.source_file, index: idx })
          const diffLabel = bm.difficulty_name || `Diff ${idx}`
          const diffCfg = {
            ...cur,
            audio_filename: bm.audio_filename || cur.audio_filename,
            background_filename: bm.background_filename ?? cur.background_filename,
            difficulty_name: bm.difficulty_name,
            preview_time: bm.preview_time,
          }
          const content = await invoke<string>('convert_beatmap', { beatmap: bm, config: diffCfg })
          const result = await invoke<string>('export_beatmap', { beatmap: bm, config: diffCfg, convertedContent: content, outputDir: exportDir, filenameSuffix: diffLabel })
          allPaths.push(result)
        }
      } else {
        const allAtOne = Math.abs(cur.conversion_rate - 1) < 0.01
        const isOsz = beatmap.source_file.toLowerCase().endsWith('.osz')
        if (isOsz && direction === 'osu-to-etterna' && indices.length > 1 && allAtOne) {
          const paths = await invoke<string[]>('export_all_beatmaps', {
            sourceFile: beatmap.source_file,
            config: cur,
            outputDir: exportDir,
            indices,
          })
          allPaths.push(...paths)
        } else {
          for (const idx of indices) {
            const bm = await invoke<Beatmap>('select_difficulty', { path: beatmap.source_file, index: idx })
            const cfg = { ...cur }
            const content = await invoke<string>('convert_beatmap', { beatmap: bm, config: cfg })
            const result = await invoke<string>('export_beatmap', { beatmap: bm, config: cfg, convertedContent: content, outputDir: exportDir })
            allPaths.push(result)
          }
        }
      }

      setLastExportPath(allPaths.join('\n'))
      setExportPath(exportDir)
      if (queueActiveId) {
        queueUpdateItem(queueActiveId, { status: 'completed', exportPath: allPaths.join('\n') || exportDir, config: cur })
      }
      trackEvent('conversion_completed', { count: String(indices.length), format: cur.output_format })
    } catch (e: unknown) {
      if (queueActiveId) {
        const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : 'Conversion failed'
        queueUpdateItem(queueActiveId, { status: 'error', error: msg, config: cur })
      }
      const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : 'Conversion failed'
      setError(msg)
      trackEvent('conversion_failed', { error: msg })
    } finally {
      setConverting(false)
    }
  }, [beatmap, direction, queueActiveId, queueUpdateItem, setConverting, setError, setExportPath])

  const handleConvertDialogConfirm = useCallback(async (indices: number[]) => {
    if (!beatmap?.source_file || indices.length === 0) return
    setShowConvertDialog(false)

    const isOsz = beatmap.source_file.toLowerCase().endsWith('.osz')
    const curRate = useConverterStore.getState().config.conversion_rate
    const allAtOne = Math.abs(curRate - 1) < 0.01
    if (isOsz && direction === 'osu-to-etterna' && indices.length > 1 && allAtOne) {
      const audioFiles = new Set(
        indices.map(i => beatmap.available_difficulties[i]?.audio_filename).filter(Boolean)
      )
      if (audioFiles.size > 1) {
        pendingIndicesRef.current = indices
        setShowMultiAudioWarning(true)
        return
      }
    }

    await doConversion(indices, false)
  }, [beatmap, direction, doConversion])

  const handleSeparateSongs = useCallback(() => {
    setShowMultiAudioWarning(false)
    doConversion(pendingIndicesRef.current, true)
  }, [doConversion])

  const handleCombineAnyway = useCallback(() => {
    setShowMultiAudioWarning(false)
    doConversion(pendingIndicesRef.current, false)
  }, [doConversion])

  const handleMultiAudioCancel = useCallback(() => {
    setShowMultiAudioWarning(false)
    pendingIndicesRef.current = []
  }, [])

  // ── Pack browsing ──────────────────────────────────────────

  const handleOpenPack = useCallback(async (folder?: string) => {
    if (!folder) {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const picked = await open({ directory: true, title: 'Select pack folder' })
      if (!picked) return
      folder = picked
    }
    setPackFolder(folder)
    setPackEditing(null)
    setPackSelected(new Set())
    setPackLoading(true)
    setError(null)
    setPackBannerUrl(null)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const entries = await invoke<PackEntry[]>('scan_pack', { folder })
      setPackEntries(entries)
    } catch (e: unknown) {
      setError(typeof e === 'string' ? e : e instanceof Error ? e.message : 'Failed to scan pack')
      setPackFolder(null)
      setPackLoading(false)
      return
    }
    // Load pack banner separately so a failure doesn't undo the pack
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const banner = await invoke<string | null>('find_pack_banner', { folder })
      if (banner) {
        setPackBannerPath(banner)
        const url = await invoke<string>('read_file_as_data_url', { path: banner })
        setPackBannerUrl(url)
      }
    } catch {
      // banner is optional
    } finally {
      setPackLoading(false)
    }
  }, [setError])

  const handlePackEditSong = useCallback(async (index: number) => {
    const entry = packEntries[index]
    if (!entry) return

    // Save current config if switching from another song
    if (packEditing !== null) {
      const cur = useConverterStore.getState().config
      packConfigsRef.current.set(packEditing, { ...cur })
    }

    setPackEditing(index)
    setError(null)

    // Clear previous song immediately to prevent flash
    useConverterStore.getState().setBeatmap(null)
    useConverterStore.getState().setMediaUrls({ audio: null, background: null, banner: null })
    const audio = audioPlayerRef.current
    if (audio) {
      audio.stop()
    }
    setAudioPlaying(false)

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const bm = await invoke<Beatmap>('parse_file', {
        path: entry.source_file,
        direction: 'etterna-to-osu',
      })

      // Load media
      const [newAudio, bg] = await Promise.all([
        loadMediaAsDataUrl(bm.source_dir, bm.audio_filename),
        loadMediaAsDataUrl(bm.source_dir, bm.background_filename),
      ])
      useConverterStore.getState().setMediaUrls({ audio: newAudio, background: bg, banner: null })
      useConverterStore.getState().setBeatmap(bm, 'etterna-to-osu')

      // Restore any saved config for this song (after setBeatmap resets it)
      const saved = packConfigsRef.current.get(index)
      if (saved) {
        useConverterStore.getState().updateConfig(saved)
      }
    } catch (e: unknown) {
      setError(typeof e === 'string' ? e : e instanceof Error ? e.message : 'Failed to load song')
      setPackEditing(null)
    }
  }, [packEntries, packEditing, setAudioPlaying, setError])

  const handlePackBack = useCallback(() => {
    // Save current config
    if (packEditing !== null) {
      const cur = useConverterStore.getState().config
      packConfigsRef.current.set(packEditing, { ...cur })
    }
    setPackEditing(null)
    useConverterStore.getState().setBeatmap(null)
    useConverterStore.getState().setMediaUrls({ audio: null, background: null, banner: null })
    const audio = audioPlayerRef.current
    if (audio) {
      audio.stop()
    }
    setAudioPlaying(false)
  }, [packEditing, setAudioPlaying])

  const handlePackClose = useCallback(() => {
    if (packEditing !== null) {
      const cur = useConverterStore.getState().config
      packConfigsRef.current.set(packEditing, { ...cur })
    }
    setPackFolder(null)
    setPackEntries([])
    setPackEditing(null)
    setPackSelected(new Set())
    setPackBannerUrl(null)
    packConfigsRef.current.clear()
    queueClearAll()
    reset()
  }, [packEditing, queueClearAll, reset])

  const handleSelectAll = useCallback((select: boolean) => {
    startTransition(() => {
      if (select) {
        setPackSelected(new Set(packEntries.map((_, i) => i)))
      } else {
        setPackSelected(new Set())
      }
    })
  }, [packEntries])

  const handlePackConvert = useCallback(async () => {
    if (packSelected.size === 0 || isConverting) return
    setPackConvertAllMode(false)
    setShowPackSettings(true)
  }, [packSelected, isConverting])

  const handlePackConvertAll = useCallback(async () => {
    if (packEntries.length === 0 || isConverting) return
    setPackConvertAllMode(true)
    setShowPackSettings(true)
  }, [packEntries, isConverting])

  const runPackConversion = useCallback(async (settings: { mode: string; creator: string; hp_drain: number; overall_difficulty: number }) => {
    const indices = packConvertAllMode
      ? packEntries.map((_, i) => i)
      : [...packSelected]

    if (indices.length === 0) return
    setConverting(true)
    setError(null)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const { open } = await import('@tauri-apps/plugin-dialog')

      const packFolderName = packFolder ? packFolder.split(/[/\\]+/).filter(Boolean).pop() || 'pack' : 'pack'
      const useOsz = settings.mode === 'osz'

      const exportDir = await open({
        directory: true,
        title: useOsz ? 'Choose where to save the .osz' : 'Choose export folder',
      })
      if (!exportDir) { setConverting(false); return }

      const workDir = useOsz
        ? `${exportDir}/__henkan_pack_${packFolderName}`
        : `${exportDir}/${packFolderName}`

      // Clean the workDir so stale files from previous conversions don't persist
      await invoke('clean_dir', { path: workDir })

      const allPaths: string[] = []

      for (const idx of indices) {
        const entry = packEntries[idx]
        if (!entry) continue
        const savedCfg = packConfigsRef.current.get(idx)
        const cfg = {
          ...(savedCfg || configFromEntry(entry)),
          output_format: 'folder' as const,
          creator: settings.creator || (savedCfg || configFromEntry(entry)).creator,
          hp_drain: settings.hp_drain,
          overall_difficulty: settings.overall_difficulty,
        }
        const paths = await invoke<string[]>('export_all_beatmaps', {
          sourceFile: entry.source_file,
          config: cfg,
          outputDir: workDir,
          packName: packFolderName,
        })
        allPaths.push(...paths)
      }

      // Pack-identifying dummy .osu (just shows the pack banner in song select)
      const firstEntry = packEntries[indices[0]]
      const firstCfg = packConfigsRef.current.get(indices[0]) || configFromEntry(firstEntry)
      await invoke<string>('create_dummy_diff', {
        title: packFolderName,
        creator: settings.creator || firstCfg.creator,
        packBannerPath,
        outputDir: workDir,
      })

      if (useOsz) {
        const oszPath = `${exportDir}/${packFolderName}.osz`
        await invoke<string>('zip_folder', { folderPath: workDir, outputPath: oszPath })
        setLastExportPath(oszPath)
        setExportPath(oszPath)
      } else {
        setLastExportPath(allPaths.join('\n'))
        setExportPath(exportDir)
      }
      trackEvent('pack_conversion_completed', { count: String(indices.length), mode: settings.mode })
    } catch (e: unknown) {
      const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : 'Pack conversion failed'
      setError(msg)
      trackEvent('pack_conversion_failed', { error: msg })
    } finally {
      setConverting(false)
    }
  }, [packEntries, packSelected, packConvertAllMode, packFolder, packBannerPath, setConverting, setError, setExportPath])

  const handlePackSettingsCancel = useCallback(() => {
    setShowPackSettings(false)
  }, [])

  const handleSelectDifficulty = useCallback(async (index: number) => {
    if (!beatmap?.source_file) return
    setError(null)
    setSwitchingDifficulty(true)
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const bm = await invoke<Beatmap>('select_difficulty', { path: beatmap.source_file, index })

      // Update beatmap + config first (preserves user-customized fields, syncs rest from new beatmap)
      useConverterStore.getState().updateBeatmapDifficulty(bm)
      if (queueActiveId) {
        queueUpdateItem(queueActiveId, { beatmap: bm })
      }

      // Load media using config values — now correctly reflects user customizations
      // while falling back to the new difficulty's defaults for non-customized fields
      const cfg = useConverterStore.getState().config
      const [audio, bg, banner] = await Promise.all([
        loadMediaAsDataUrl(bm.source_dir, cfg.audio_filename || bm.audio_filename),
        loadMediaAsDataUrl(bm.source_dir, cfg.background_filename || bm.background_filename),
        loadMediaAsDataUrl(bm.source_dir, cfg.banner_filename || bm.banner_filename),
      ])
      useConverterStore.getState().setMediaUrls({ audio, background: bg, banner })
    } catch (e: unknown) {
      setError(typeof e === 'string' ? e : e instanceof Error ? e.message : 'Failed to select difficulty')
    } finally {
      setSwitchingDifficulty(false)
    }
  }, [beatmap, setError, queueActiveId, queueUpdateItem])

  const handleChangeFile = useCallback(async (field: string, _current: string | null): Promise<void> => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        multiple: false,
        filters: [
          { name: 'Media files', extensions: ['mp3', 'ogg', 'wav', 'jpg', 'jpeg', 'png', 'gif'] },
        ],
      })
      if (selected) {
        const { invoke } = await import('@tauri-apps/api/core')
        const url = await invoke<string>('read_file_as_data_url', { path: selected })
        const key = field === 'cdtitle' ? 'cdtitle_filename' : `${field}_filename`
        const store = useConverterStore.getState()
        store.updateConfig({ [key]: selected })
        if (field !== 'cdtitle') {
          store.setMediaUrls({ ...store.mediaUrls, [field]: url })
        }
      }
    } catch { /* ignore */ }
  }, [])

  const handleOpenInOsu = useCallback(async () => {
    const path = exportPath || lastExportPath
    if (!path) return
    const { invoke } = await import('@tauri-apps/api/core')
    try {
      await invoke('open_file', { path })
    } catch { /* ignore */ }
  }, [lastExportPath, exportPath])

  const handleReset = useCallback(() => {
    queueClearAll()
    reset()
  }, [queueClearAll, reset])

  const handleDismissExport = useCallback(() => {
    setLastExportPath(null)
  }, [])

  // Drag-and-drop (Tauri native events provide real paths)
  const lastDropRef = useRef(0)
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false
    getCurrentWindow().onDragDropEvent((evt) => {
      if (cancelled) return
      if (evt.payload.type === 'enter') {
        setDragging(true)
      } else if (evt.payload.type === 'leave') {
        setDragging(false)
      } else if (evt.payload.type === 'drop') {
        setDragging(false)
        const now = Date.now()
        if (now - lastDropRef.current < 500) return
        lastDropRef.current = now
        const seen = new Set<string>()
        const files: string[] = []
        const dirs: string[] = []
        for (const p of evt.payload.paths) {
          if (seen.has(p)) continue
          seen.add(p)
          const ext = p.match(/\.[^.]+$/)?.[0]?.toLowerCase()
          if (!ext || !ACCEPTED_EXTS.includes(ext)) dirs.push(p)
          else files.push(p)
        }
        if (dirs.length > 0) handleOpenPack(dirs[0])
        if (files.length > 0) handleFilesSelected(files)
      }
    }).then(fn => { unlisten = fn })
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [setDragging, handleFilesSelected, handleOpenPack])

  const tapCount = beatmap?.notes.filter(n => !n.hold).length ?? 0
  const holdCount = beatmap?.notes.filter(n => n.hold).length ?? 0

  return (
    <ErrorBoundary>
      <div
        className="h-full flex flex-col relative overflow-hidden animate-app-entrance select-none hide-scrollbar"
        onContextMenu={(e) => e.preventDefault()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={(e) => { e.preventDefault(); setDragging(false) }}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
        }}
      >
        {mediaUrls.background && (
          <div className="absolute inset-0 -z-10 overflow-hidden animate-bg-fade-in">
            <div
              className="w-full h-full bg-cover bg-center animate-zoom"
              style={{
                backgroundImage: `url(${mediaUrls.background})`,
                filter: 'blur(20px) brightness(0.5) saturate(0.5)',
              }}
            />
            <div className="absolute inset-0 bg-[#0c1a35]/45" />
          </div>
        )}
        {!mediaUrls.background && (
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-surface-950 via-[#0c1123] to-surface-950 animate-gradient-shift" />
        )}

        <div className="relative z-10 flex flex-col h-full">
          <Header direction={direction} onSetDirection={(dir) => { setDirection(dir); queueClearAll(); reset() }} />

          <ConversionQueue
            items={queueItems}
            activeId={queueActiveId}
            isConverting={isConverting}
            onSelect={handleQueueSelect}
            onRemove={handleQueueRemove}
            onAddFiles={handleQueueAddFiles}
            onConvertAll={doBatchConversion}
            onResetAll={handleResetAll}
            onClearCompleted={handleQueueClearCompleted}
            onClearAll={handleQueueClearAll}
          />

          <main className="flex-1 flex flex-col items-center p-4 sm:p-6 gap-3 sm:gap-5 overflow-auto hide-scrollbar">
            {packFolder && packEditing === null && (
              <PackBrowser
                entries={packEntries}
                selected={packSelected}
                onToggleSelect={(i) => {
                  setPackSelected(prev => {
                    const next = new Set(prev)
                    if (next.has(i)) next.delete(i)
                    else next.add(i)
                    return next
                  })
                }}
                onEditSong={handlePackEditSong}
                onSelectAll={handleSelectAll}
                onConvert={handlePackConvert}
                onConvertAll={handlePackConvertAll}
                onBack={handlePackClose}
                bannerUrl={packBannerUrl}
                isConverting={isConverting}
              />
            )}

            {packFolder && packEditing !== null && beatmap && (
              <div className="w-full max-w-xl animate-fade-in">
                <button
                  onClick={handlePackBack}
                  className="flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-medium
                    bg-white/10 border border-white/15 text-surface-300
                    hover:bg-white/[0.14] hover:text-white
                    active:scale-[0.97] transition-all duration-75 mb-4 w-full justify-center"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to pack
                </button>
                <MetadataPanel
                  beatmap={beatmap}
                  config={config}
                  mediaUrls={mediaUrls}
                  tapCount={tapCount}
                  holdCount={holdCount}
                  isConverting={isConverting}
                  switchingDifficulty={switchingDifficulty}
                  direction={direction}
                  onUpdateConfig={(p) => useConverterStore.getState().updateConfig(p)}
                  onChangeFile={handleChangeFile}
                  onConvert={handleConvert}
                  onReset={reset}
                  onSelectDifficulty={handleSelectDifficulty}
                />
              </div>
            )}

            {!packFolder && queueItems.length === 0 && !beatmap && !packLoading && (
              <>
              <FallingArrows />
              <div className="flex flex-col items-center gap-4 w-full max-w-lg my-auto relative z-10">
                <DropZone dragging={dragging} onFilesSelected={handleFilesSelected} direction={direction} />
                <div className="flex items-center gap-3 w-full max-w-md">
                  <div className="flex-1 h-px bg-white/5" />
                  <span className="text-[11px] text-surface-500 tracking-widest uppercase">or</span>
                  <div className="flex-1 h-px bg-white/5" />
                </div>
                <button
                  onClick={() => handleOpenPack()}
                  className="h-11 px-6 rounded-xl text-sm font-medium
                    bg-white/[0.04] border border-white/8 text-surface-400
                    hover:bg-white/[0.07] hover:text-surface-200
                    active:scale-[0.97] transition-all duration-75"
                >
                  Open pack folder
                </button>
              </div>
              </>
            )}

            {!packFolder && packLoading && (
              <div className="flex flex-col items-center gap-4 animate-fade-in my-auto">
                <div className="w-10 h-10 rounded-xl border-2 border-accent/30 border-t-accent animate-spin" />
                <p className="text-sm text-surface-400">Scanning pack...</p>
              </div>
            )}

            {!packFolder && queueItems.length > 0 && (
              <div className="flex flex-col items-center w-full max-w-lg my-auto">
                {(() => {
                  const activeItem = queueItems.find(i => i.id === queueActiveId)
                  if (queueLoading) {
                    return (
                      <div className="flex flex-col items-center gap-4 animate-fade-in my-auto">
                        <div className="w-8 h-8 rounded-xl border-2 border-accent/30 border-t-accent animate-spin" />
                        <p className="text-sm text-surface-400">Loading...</p>
                      </div>
                    )
                  }
                  if (activeItem?.status === 'parsing') {
                    return (
                      <div className="flex flex-col items-center gap-4 animate-fade-in my-auto">
                        <div className="w-8 h-8 rounded-xl border-2 border-accent/30 border-t-accent animate-spin" />
                        <p className="text-sm text-surface-400">Parsing {activeItem.fileName}...</p>
                      </div>
                    )
                  }
                  if (activeItem?.status === 'error' && !activeItem.beatmap) {
                    return (
                      <div className="flex flex-col items-center gap-6 animate-fade-in my-auto">
                        <div className="text-center">
                          <p className="text-sm text-red-400 mb-1">Failed to load {activeItem.fileName}</p>
                          <p className="text-xs text-surface-500">{activeItem.error}</p>
                        </div>
                        <DropZone dragging={dragging} onFilesSelected={handleFilesSelected} direction={direction} />
                      </div>
                    )
                  }
                  if (activeItem?.beatmap) {
                    return (
                      <MetadataPanel
                        beatmap={activeItem.beatmap}
                        config={config}
                        mediaUrls={mediaUrls}
                        tapCount={tapCount}
                        holdCount={holdCount}
                        isConverting={isConverting}
                        switchingDifficulty={switchingDifficulty}
                        direction={activeItem.direction}
                        onUpdateConfig={(p) => useConverterStore.getState().updateConfig(p)}
                        onChangeFile={handleChangeFile}
                        onConvert={handleConvert}
                        onReset={handleReset}
                        onSelectDifficulty={handleSelectDifficulty}
                      />
                    )
                  }
                  return (
                    <div className="flex flex-col items-center gap-6 animate-fade-in my-auto">
                      <p className="text-sm text-surface-500">Select a file from the queue above</p>
                      <DropZone dragging={dragging} onFilesSelected={handleFilesSelected} direction={direction} />
                    </div>
                  )
                })()}
              </div>
            )}

            {!packFolder && queueItems.length === 0 && beatmap && (
              <div className="w-full max-w-lg">
                <MetadataPanel
                  beatmap={beatmap}
                  config={config}
                  mediaUrls={mediaUrls}
                  tapCount={tapCount}
                  holdCount={holdCount}
                  isConverting={isConverting}
                  switchingDifficulty={switchingDifficulty}
                  direction={direction}
                  onUpdateConfig={(p) => useConverterStore.getState().updateConfig(p)}
                  onChangeFile={handleChangeFile}
                  onConvert={handleConvert}
                  onReset={handleReset}
                  onSelectDifficulty={handleSelectDifficulty}
                />
              </div>
            )}

            {error && (
              <div className="bg-red-900/40 backdrop-blur border border-red-800/50 rounded-xl px-5 py-3 text-red-300 text-sm max-w-lg animate-slide-down">
                {error}
              </div>
            )}
          </main>

          {beatmap && mediaUrls.audio && (!packFolder || packEditing !== null) && (
            <>
              {audioLoading && (
                <div className="absolute top-0 left-0 right-0 h-0.5 z-50 overflow-hidden pointer-events-none">
                  <div className="h-full bg-accent/60 animate-pulse" style={{ animation: 'loading-bar 1.2s ease-in-out infinite', width: '40%' }} />
                  <style>{`@keyframes loading-bar { 0% { transform: translateX(-100%); } 100% { transform: translateX(350%); } }`}</style>
                </div>
              )}
              <AudioPlayer
                audioPlayerRef={audioPlayerRef}
                audioPlaying={audioPlaying}
                audioDuration={audioDuration}
                previewTime={beatmap.preview_time}
                onOpenPreview={() => setShowPreview(true)}
              />
            </>
          )}

          {!beatmap && !packFolder && (
            <footer className="px-4 sm:px-6 py-2 sm:py-3 border-t border-surface-800/50 text-center text-[10px] sm:text-xs text-surface-500">
              © {new Date().getFullYear()} made by Kaan &#x2764; &middot; Henkan — osu!mania ↔ Etterna converter
            </footer>
          )}
        </div>

        {/* Preview overlay */}
        {showPreview && beatmap && mediaUrls.audio && (
          <PreviewOverlay
            audioPlayerRef={audioPlayerRef}
            playing={audioPlaying}
            duration={audioDuration}
            notes={beatmap.notes}
            keys={beatmap.keys}
            bpm={Math.round(60000 / (beatmap.timing_points.find(tp => tp.uninherited)?.beat_length ?? 600))}
            backgroundUrl={mediaUrls.background}
            previewTime={beatmap.preview_time}
            sourceFormat={beatmap.source_format}
            onSetPreviewTime={handleSetPreviewTime}
            onClose={() => setShowPreview(false)}
          />
        )}

        {/* Convert dialog */}
        {beatmap && (
          <ConvertDialog
            open={showConvertDialog}
            difficulties={beatmap.available_difficulties}
            currentIndex={beatmap.available_difficulties.findIndex(d => d.name === beatmap.difficulty_name)}
            onConfirm={handleConvertDialogConfirm}
            onCancel={() => setShowConvertDialog(false)}
          />
        )}

        {/* Bulk convert dialog */}
        {direction === 'etterna-to-osu' && (
          <BulkConvertDialog
            open={showBulkConvert}
            onCancel={() => setShowBulkConvert(false)}
          />
        )}

        {/* Multi-audio warning dialog */}
        {showMultiAudioWarning && (
          <MultiAudioWarning
            onSeparateSongs={handleSeparateSongs}
            onCombineAnyway={handleCombineAnyway}
            onCancel={handleMultiAudioCancel}
          />
        )}

        {/* Pack settings dialog */}
        <PackSettingsDialog
          open={showPackSettings}
          packName={packFolder ? packFolder.split(/[/\\]+/).filter(Boolean).pop() || 'pack' : 'pack'}
          isConverting={isConverting}
          defaultSettings={{
            mode: 'osz',
            creator: useConverterStore.getState().config.creator,
            hp_drain: useConverterStore.getState().config.hp_drain,
            overall_difficulty: useConverterStore.getState().config.overall_difficulty,
          }}
          onConfirm={(settings) => {
            setShowPackSettings(false)
            runPackConversion(settings)
          }}
          onCancel={handlePackSettingsCancel}
        />

        {/* Post-export overlay */}
        {lastExportPath && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-surface-900 border border-surface-700/50 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 animate-scale-in">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center animate-scale-in">
                  <svg className="w-8 h-8 text-emerald-400 animate-scale-in" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-surface-100 mb-1 animate-fade-in">Export complete!</h2>
                <div className="text-xs text-surface-400 mb-6 space-y-1 max-h-24 overflow-y-auto animate-fade-in">
                  {lastExportPath.split('\n').map((p, i) => (
                    <p key={i} className="break-all">{p}</p>
                  ))}
                </div>
                <div className="flex gap-3 justify-center animate-fade-in">
                  <button
                    onClick={handleOpenInOsu}
                    className="px-6 py-2.5 rounded-xl bg-accent text-white font-medium text-sm
                               hover:bg-accent-hover active:scale-[0.97] transition-all duration-75 shadow-lg shadow-accent/25"
                  >
                    {direction === 'etterna-to-osu' ? 'Open in osu!' : 'Show in explorer'}
                  </button>
                  <button
                    onClick={handleDismissExport}
                    className="px-6 py-2.5 rounded-xl bg-surface-800 border border-surface-700/40 text-surface-400 font-medium text-sm
                               hover:bg-surface-700 hover:text-surface-200 active:scale-[0.97] transition-all duration-75"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {volumeToast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[9999] pointer-events-none">
          <div
            className={`${volumeToast.leaving ? 'animate-[toastOut_0.2s_ease-in_forwards]' : 'animate-[toastIn_0.2s_ease-out]'} text-white/90 text-xs font-medium bg-white/12 px-5 py-2 rounded-full backdrop-blur-md border border-white/8 shadow-lg`}
          >
            {volumeToast.msg}
          </div>
        </div>
      )}

      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-16px) scale(0.92); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes toastOut {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(-8px) scale(0.95); }
        }
      `}</style>
    </ErrorBoundary>
  )
}

export default App
