import type { Beatmap, ExportConfig, PackEntry } from './types/beatmap'
import { useCallback, useState, useEffect, useRef, startTransition } from 'react'
import { useConverterStore } from './stores/useConverterStore'
import { useQueueStore, type QueueItem, buildConfig, emptyConfig, generateId, detectDirection } from './stores/useQueueStore'
import { ErrorBoundary } from './components/ErrorBoundary'
import { trackEvent } from './services/analytics'
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
import { UpdateDialog } from './components/UpdateDialog'
import { BeatmapMirrorDialog } from './components/BeatmapMirrorDialog'
import { WebAudioPlayer } from './lib/WebAudioPlayer'
import { isTauri } from './services/environment'
import { openFiles as dialogOpenFiles, openDirectory as dialogOpenDirectory, saveFile as dialogSaveFile } from './services/dialogs'
import { fileInputCache, getCachedFile, clearFileCache } from './services/fileCache'
import { readFileAsDataUrl, resolveMediaFile, saveBlobToFile } from './services/files'
import { parseFile, selectDifficulty, convertBeatmap, ensureOszMediaCached } from './services/convert'
import { exportBeatmap, exportAllBeatmaps, zipFolder, addCdtitleToZip } from './services/export'
import { scanPack, scanSongsFolder, loadPackBannerUrl, createDummyDiff, cleanDir, generateDummyDiffContent } from './services/pack'
import { openFile } from './services/platform'

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

async function loadMediaAsDataUrl(sourceDir: string, filename: string | null | undefined): Promise<string | null> {
  try {
    const resolved = await resolveMediaFile(sourceDir, filename ?? '')
    if (!resolved) return null
    return await readFileAsDataUrl(resolved)
  } catch {
    return null
  }
}

const _avatarCache = new Map<string, string>()

async function loadCdtitleAsDataUrl(sourceDir: string, filename: string | null | undefined, creator?: string | null): Promise<string | null> {
  try {
    if (filename) {
      const resolved = await resolveMediaFile(sourceDir, filename)
      if (resolved) return await readFileAsDataUrl(resolved)
    }
  } catch { /* fall through */ }

  if (creator) {
    const cached = _avatarCache.get(creator)
    if (cached) return cached
    try {
      const resp = await fetch(`/api/avatar?user=${encodeURIComponent(creator)}`)
      if (resp.ok) {
        const blob = await resp.blob()
        const url = URL.createObjectURL(blob)
        _avatarCache.set(creator, url)
        return url
      }
    } catch { /* fall through */ }
  }

  try {
    const resp = await fetch('/cdtitle_default.png')
    const blob = await resp.blob()
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

async function resolveMediaName(sourceDir: string, filename: string | null | undefined): Promise<string | null> {
  if (filename) return filename
  try {
    const resolved = await resolveMediaFile(sourceDir, '')
    if (!resolved) return null
    return resolved.split(/[/\\]+/).pop() || null
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

  // Update checking state
  const [pendingUpdate, setPendingUpdate] = useState<{ version: string; body: string | null; date: string | null } | null>(null)
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [installing, setInstalling] = useState(false)

  // Version dialog state
  const [appVersion, setAppVersion] = useState<string | null>(isTauri() ? null : '1.0.0')
  const [showVersionDialog, setShowVersionDialog] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<'up-to-date' | 'update-found' | 'error' | null>(null)

  // Beatmap mirror state
  const [showMirror, setShowMirror] = useState(false)

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
  const [packType, setPackType] = useState<'sm' | 'osu'>('sm')
  const [packBannerUrl, setPackBannerUrl] = useState<string | null>(null)
  const [packBannerPath, setPackBannerPath] = useState<string | null>(null)
  const packBannerFileRef = useRef<File | null>(null)
  const packConfigsRef = useRef<Map<number, ExportConfig>>(new Map())

  // Shared audio player — owned by App, used by AudioPlayer and PreviewOverlay
  const audioPlayerRef = useRef<WebAudioPlayer | null>(null)
  const audioFileRef = useRef<File | string | null>(null)
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
        if (!showPreview) {
          const player = audioPlayerRef.current
          if (player && player.paused && player.el.readyState >= 2) {
            player.play().catch(() => {})
          }
          setShowPreview(true)
        }
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

  // Check for updates on mount (Tauri only)
  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    const check = async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater')
        const update = await check()
        if (!update || cancelled) return
        const storageKey = `henkan-update-dismissed-${update.version}`
        if (localStorage.getItem(storageKey)) return
        setPendingUpdate({
          version: update.version,
          body: update.body ?? null,
          date: update.date ?? null,
        })
        setShowUpdateDialog(true)
      } catch { /* ignore */ }
    }
    check()
    return () => { cancelled = true }
  }, [])

  // Get app version (Tauri only)
  useEffect(() => {
    if (!isTauri()) return
    import('@tauri-apps/api/app').then(({ getVersion }) => {
      getVersion().then(setAppVersion)
    })
  }, [])

  const handleCheckForUpdates = async (): Promise<{ version: string; body: string | null; date: string | null } | null> => {
    if (!isTauri()) return null
    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()
      if (!update) return null
      setPendingUpdate({
        version: update.version,
        body: update.body ?? null,
        date: update.date ?? null,
      })
      return {
        version: update.version,
        body: update.body ?? null,
        date: update.date ?? null,
      }
    } catch {
      return null
    }
  }

  const handleUpdate = async () => {
    if (!pendingUpdate) return
    setInstalling(true)
    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()
      if (update) {
        await update.downloadAndInstall()
        const { relaunch } = await import('@tauri-apps/plugin-process')
        await relaunch()
      }
    } catch { /* ignore */ }
    setInstalling(false)
  }

  const handleDismissUpdate = (dontAskAgain: boolean) => {
    if (dontAskAgain && pendingUpdate) {
      try {
        localStorage.setItem(`henkan-update-dismissed-${pendingUpdate.version}`, 'true')
      } catch { /* ignore */ }
    }
    setShowUpdateDialog(false)
  }

  const handleMirrorDownload = async (setId: number, filename: string) => {
    const { downloadBeatmapPath } = await import('./services/beatmapMirror')
    const { path, error } = await downloadBeatmapPath(setId, filename)
    if (error || !path) throw new Error(error ?? 'Download failed')
    handleFilesSelected([path])
  }

  const handleCheckVersion = async () => {
    setChecking(true)
    setCheckResult(null)
    try {
      const result = await handleCheckForUpdates()
      setCheckResult(result ? 'update-found' : 'up-to-date')
    } catch {
      setCheckResult('error')
    }
    setChecking(false)
  }

  // Decode audio whenever the data URL changes
  useEffect(() => {
    const player = audioPlayerRef.current
    if (!player) return
    if (mediaUrls.audio) {
      setAudioLoading(true)
      const source = audioFileRef.current || mediaUrls.audio
      player.load(source).finally(() => {
        setAudioLoading(false)
        const bm = useConverterStore.getState().beatmap
        if (bm && bm.preview_time > 0) {
          player.currentTime = bm.preview_time / 1000
        } else {
          player.currentTime = 0
        }
        // Stay paused at preview point — no autoplay
      })
    } else {
      player.stop()
      audioFileRef.current = null
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
    console.log('[media] loadQueueMedia start', { source_file: bm.source_file, source_dir: bm.source_dir, audio: bm.audio_filename, bg: bm.background_filename })
    if (bm.source_file) {
      await ensureOszMediaCached(bm.source_file)
    }
    const audioFile = bm.audio_filename
      ? await resolveMediaFile(bm.source_dir, bm.audio_filename).then(r => {
          console.log('[media] resolveMediaFile audio', { requested: bm.audio_filename, resolved: r })
          return r ? getCachedFile(r) ?? null : null
        })
      : null
    if (audioFile) console.log('[media] audioFile found', { name: audioFile.name, size: audioFile.size })
    else console.log('[media] audioFile is null')
    audioFileRef.current = audioFile
    const [audio, bg, banner, cdtitle] = await Promise.all([
      audioFile ? readFileAsDataUrl(audioFile) : loadMediaAsDataUrl(bm.source_dir, bm.audio_filename),
      loadMediaAsDataUrl(bm.source_dir, bm.background_filename),
      loadMediaAsDataUrl(bm.source_dir, bm.banner_filename),
      loadCdtitleAsDataUrl(bm.source_dir, bm.cdtitle_filename, bm.creator),
    ])
    console.log('[media] loadQueueMedia done', { audio: audio?.slice(0, 40), bg: bg?.slice(0, 40), banner: banner?.slice(0, 40), cdtitle: cdtitle?.slice(0, 40) })
    setMediaUrls({ audio, background: bg, banner, cdtitle })
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
        const dir = detectDirection(path)
        const result = await parseFile(path, dir)
        const cfg = buildConfig(result)
        queueUpdateItem(id, { beatmap: result, config: cfg, status: 'ready' })

        // Auto-activate the first newly added item
        if (i === 0 && queueItems.length === 0) {
          queueSetActiveId(id)
          setDirection(dir)
          setBeatmap(result, dir)
          useConverterStore.getState().updateConfig(cfg)
          try {
            await loadQueueMedia(result)
          } catch (e) {
            console.error('[media] loadQueueMedia failed:', e)
          }
        }
      } catch (e: unknown) {
        const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : 'Failed to parse file'
        console.error('ParseFile error:', e)
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
    useConverterStore.getState().setMediaUrls({ audio: null, background: null, banner: null, cdtitle: null })
    audioFileRef.current = null
    audioPlayerRef.current?.stop()
    setAudioPlaying(false)
    setLastExportPath(null)
    setError(null)
    // Load the new item's data
    queueSetActiveId(item.id)
    setDirection(item.direction)
    try {
      // Ensure media files for this source are in the cache (restores OSZ media if previously cleared)
      if (item.beatmap.source_file) {
        await ensureOszMediaCached(item.beatmap.source_file)
      }
      const audioFile = item.beatmap.audio_filename
        ? await resolveMediaFile(item.beatmap.source_dir, item.beatmap.audio_filename).then(r => r ? getCachedFile(r) ?? null : null)
        : null
      audioFileRef.current = audioFile
      const [audio, bg, banner, cdtitle] = await Promise.all([
        audioFile ? readFileAsDataUrl(audioFile) : loadMediaAsDataUrl(item.beatmap.source_dir, item.beatmap.audio_filename),
        loadMediaAsDataUrl(item.beatmap.source_dir, item.beatmap.background_filename),
        loadMediaAsDataUrl(item.beatmap.source_dir, item.beatmap.banner_filename),
        loadCdtitleAsDataUrl(item.beatmap.source_dir, item.beatmap.cdtitle_filename, item.beatmap.creator),
      ])
      useConverterStore.getState().setMediaUrls({ audio, background: bg, banner, cdtitle })
      setBeatmap(item.beatmap, item.direction)
      useConverterStore.getState().updateConfig(item.config)
    } catch {
      setError('Failed to load media')
    } finally {
      setQueueLoading(false)
    }
  }, [queueActiveId, queueUpdateItem, queueSetActiveId, setDirection, setBeatmap, loadMediaAsDataUrl])

  const handleQueueAddFiles = useCallback(async () => {
    const selected = await dialogOpenFiles({
      multiple: true,
      filters: [{ name: 'Beatmap Files', extensions: ['osu', 'osz', 'sm'] }],
    })
    if (selected) {
      handleFilesSelected(selected)
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
    clearFileCache()
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

    const baseDir = isTauri() ? await dialogOpenDirectory({ title: 'Export all to folder' }) : ''
    if (baseDir === null) { setConverting(false); return }

    const allPaths: string[] = []

    for (const item of readyItems) {
      const cfg = { ...item.config, output_format: activeCfg.output_format }
      queueUpdateItem(item.id, { status: 'converting' })
      try {
        const diffCount = item.beatmap?.available_difficulties?.length || 1

        if (isTauri()) {
          if (diffCount <= 1) {
            // Single diff — export flat
            if (item.filePath.endsWith('.sm') || item.filePath.endsWith('.osz')) {
              const paths = await exportAllBeatmaps(item.filePath, cfg, baseDir)
              allPaths.push(...paths)
            } else {
              const bm = await selectDifficulty(item.filePath, 0)
              const content = await convertBeatmap(bm, cfg)
              const result = await exportBeatmap(bm, cfg, content, baseDir, bm.difficulty_name)
              allPaths.push(result)
            }
          } else {
            // Multi-diff — export to baseDir/songName/diffName/file.sm
            const itemTitle = cfg.title || item.beatmap?.title || item.fileName.replace(/\.[^.]+$/, '')
            const safeName = itemTitle.replace(/[/\\?%*:|"<>]/g, '_')
            const { invoke } = await import('@tauri-apps/api/core')
            for (let i = 0; i < diffCount; i++) {
              const bm = await selectDifficulty(item.filePath, i)
              const diffName = bm.difficulty_name || `Diff ${i+1}`
              const safeDiff = diffName.replace(/[/\\?%*:|"<>]/g, '_')
              const diffDir = `${baseDir}/${safeName}/${safeDiff}`
              try { await invoke('clean_dir', { path: diffDir }) } catch {}
              const diffCfg = {
                ...cfg,
                audio_filename: bm.audio_filename || cfg.audio_filename,
                background_filename: bm.background_filename ?? cfg.background_filename,
                difficulty_name: bm.difficulty_name,
              }
              const content = await convertBeatmap(bm, diffCfg)
              const result = await exportBeatmap(bm, diffCfg, content, diffDir, diffName, true)
              allPaths.push(result)
            }
          }
        } else if (diffCount > 1) {
          // Web multi-diff: single zip with folder structure
          const itemTitle = cfg.title || item.beatmap?.title || item.fileName.replace(/\.[^.]+$/, '')
          const safeName = itemTitle.replace(/[/\\?%*:|"<>]/g, '_')
          const JSZip = (await import('jszip')).default
          const zip = new JSZip()
          const addedMedia = new Set<string>()
          for (let i = 0; i < diffCount; i++) {
            const bm = await selectDifficulty(item.filePath, i)
            const diffName = bm.difficulty_name || `Diff ${i+1}`
            const safeDiff = diffName.replace(/[/\\?%*:|"<>]/g, '_')
            const diffCfg = {
              ...cfg,
              audio_filename: bm.audio_filename || cfg.audio_filename,
              background_filename: bm.background_filename ?? cfg.background_filename,
              difficulty_name: bm.difficulty_name,
            }
            const content = await convertBeatmap(bm, diffCfg)
            const ext = bm.source_format === 'OsuMania' ? '.sm' : '.osu'
            const filename = `${safeName}${diffName ? ` [${diffName}]` : ''}${ext}`
            zip.file(`${safeName}/${safeDiff}/${filename}`, content)
            const mediaFields: string[] = [diffCfg.audio_filename]
            if (diffCfg.background_filename) mediaFields.push(diffCfg.background_filename)
            if (bm.banner_filename) mediaFields.push(bm.banner_filename)
            for (const field of mediaFields) {
              if (!field) continue
              const key = await resolveMediaFile(bm.source_dir, field)
              if (!key) continue
              const file = getCachedFile(key)
              if (!file) continue
              const mediaName = field.split('/').pop() || field
              const mediaPath = `${safeName}/${safeDiff}/${mediaName}`
              if (addedMedia.has(mediaPath)) continue
              addedMedia.add(mediaPath)
              zip.file(mediaPath, await file.arrayBuffer())
            }
            await addCdtitleToZip(zip, bm.source_dir, bm.cdtitle_filename, `${safeName}/${safeDiff}/cdtitle.png`, bm.creator)
          }
          const blob = await zip.generateAsync({ type: 'blob' })
          const zipName = `${safeName}.zip`
          await saveBlobToFile(blob, zipName)
          allPaths.push(zipName)
        } else {
          // Web single-diff: download individually
          const bm = await selectDifficulty(item.filePath, 0)
          const content = await convertBeatmap(bm, cfg)
          const result = await exportBeatmap(bm, cfg, content, '', bm.difficulty_name)
          allPaths.push(result)
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
      let exportDir: string | null = null

      if (isTauri()) {
        if (cur.output_format === 'osz') {
          exportDir = await dialogSaveFile({
            title: 'Export as .osz',
            defaultPath: `${cur.artist} - ${cur.title} (${cur.creator}).osz`,
            filters: [{ name: 'osu! beatmap package', extensions: ['osz'] }],
          })
        } else {
          exportDir = await dialogOpenDirectory({
            title: 'Choose export folder',
          })
        }
      } else {
        exportDir = ''
      }

      if (exportDir === null) { setConverting(false); return }

      const allPaths: string[] = []

      if (separateSongs) {
        if (!isTauri() && indices.length > 1) {
          // Web multi-diff: single zip with folder structure
          const songName = cur.title || beatmap?.title || 'export'
          const safeName = songName.replace(/[/\\?%*:|"<>]/g, '_')
          const JSZip = (await import('jszip')).default
          const zip = new JSZip()
          const addedMedia = new Set<string>()
          for (const idx of indices) {
            const bm = await selectDifficulty(beatmap.source_file, idx)
            const diffLabel = bm.difficulty_name || `Diff ${idx}`
            const safeDiff = diffLabel.replace(/[/\\?%*:|"<>]/g, '_')
            const diffCfg = {
              ...cur,
              audio_filename: bm.audio_filename || cur.audio_filename,
              background_filename: bm.background_filename ?? cur.background_filename,
              difficulty_name: bm.difficulty_name,
              preview_time: bm.preview_time,
            }
            const content = await convertBeatmap(bm, diffCfg)
            const ext = bm.source_format === 'OsuMania' ? '.sm' : '.osu'
            const filename = `${safeName}${diffLabel ? ` [${diffLabel}]` : ''}${ext}`
            zip.file(`${safeName}/${safeDiff}/${filename}`, content)
            const mediaFields: string[] = [diffCfg.audio_filename]
            if (diffCfg.background_filename) mediaFields.push(diffCfg.background_filename)
            if (bm.banner_filename) mediaFields.push(bm.banner_filename)
            for (const field of mediaFields) {
              if (!field) continue
              const key = await resolveMediaFile(bm.source_dir, field)
              if (!key) continue
              const file = getCachedFile(key)
              if (!file) continue
              const mediaName = field.split('/').pop() || field
              const mediaPath = `${safeName}/${safeDiff}/${mediaName}`
              if (addedMedia.has(mediaPath)) continue
              addedMedia.add(mediaPath)
              zip.file(mediaPath, await file.arrayBuffer())
            }
            await addCdtitleToZip(zip, bm.source_dir, bm.cdtitle_filename, `${safeName}/${safeDiff}/cdtitle.png`, bm.creator)
          }
          const blob = await zip.generateAsync({ type: 'blob' })
          const zipName = `${safeName}.zip`
          await saveBlobToFile(blob, zipName)
          allPaths.push(zipName)
        } else if (isTauri() && indices.length > 1) {
          // Desktop multi-diff
          for (const idx of indices) {
            const bm = await selectDifficulty(beatmap.source_file, idx)
            const diffLabel = bm.difficulty_name || `Diff ${idx}`
            const diffCfg = {
              ...cur,
              audio_filename: bm.audio_filename || cur.audio_filename,
              background_filename: bm.background_filename ?? cur.background_filename,
              difficulty_name: bm.difficulty_name,
              preview_time: bm.preview_time,
            }
            const content = await convertBeatmap(bm, diffCfg)
            const songName = cur.title || beatmap?.title || 'export'
            const safeName = songName.replace(/[/\\?%*:|"<>]/g, '_')
            const safeDiff = diffLabel.replace(/[/\\?%*:|"<>]/g, '_')
            const diffDir = `${exportDir}/${safeName}/${safeDiff}`
            const { invoke } = await import('@tauri-apps/api/core')
            try { await invoke('clean_dir', { path: diffDir }) } catch {}
            const result = await exportBeatmap(bm, diffCfg, content, diffDir, diffLabel, true)
            allPaths.push(result)
          }
        } else {
          // Single-diff (both platforms)
          for (const idx of indices) {
            const bm = await selectDifficulty(beatmap.source_file, idx)
            const diffLabel = bm.difficulty_name || `Diff ${idx}`
            const diffCfg = {
              ...cur,
              audio_filename: bm.audio_filename || cur.audio_filename,
              background_filename: bm.background_filename ?? cur.background_filename,
              difficulty_name: bm.difficulty_name,
              preview_time: bm.preview_time,
            }
            const content = await convertBeatmap(bm, diffCfg)
            const result = await exportBeatmap(bm, diffCfg, content, exportDir, diffLabel)
            allPaths.push(result)
          }
        }
      } else {
        const allAtOne = Math.abs(cur.conversion_rate - 1) < 0.01
        const isOsz = beatmap.source_file.toLowerCase().endsWith('.osz')
        if (isOsz && direction === 'osu-to-etterna' && indices.length > 1 && allAtOne) {
          const paths = await exportAllBeatmaps(beatmap.source_file, cur, exportDir, indices)
          allPaths.push(...paths)
        } else {
          for (const idx of indices) {
            const bm = await selectDifficulty(beatmap.source_file, idx)
            const cfg = { ...cur }
            const content = await convertBeatmap(bm, cfg)
            const result = await exportBeatmap(bm, cfg, content, exportDir)
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
      clearFileCache()
      const picked = await dialogOpenDirectory({ title: 'Select pack folder' })
      if (!picked) return
      folder = picked
    }
    setPackFolder(folder)
    setPackEditing(null)
    setPackSelected(new Set())
    setPackLoading(true)
    setError(null)
    setPackBannerUrl(null)
    setPackBannerPath(null)
    packBannerFileRef.current = null

    // Try scanning for .sm files first (existing etterna pack behavior)
    let entries: PackEntry[] = []
    let detectedType: 'sm' | 'osu' = 'sm'
    try {
      entries = await scanPack(folder)
      console.log('[handleOpenPack] scanPack returned', entries.length, 'entries')
    } catch (e) {
      console.log('[handleOpenPack] scanPack error:', e)
      entries = []
    }

    // If no sm files found, try scanning for .osu files
    if (entries.length === 0) {
      try {
        console.log('[handleOpenPack] calling scanSongsFolder for:', folder)
        entries = await scanSongsFolder(folder)
        console.log('[handleOpenPack] scanSongsFolder returned', entries.length, 'entries')
        detectedType = 'osu'
      } catch (e: unknown) {
        const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : 'Failed to scan folder'
        console.error('[handleOpenPack] scanSongsFolder error:', msg)
        setError(msg)
        setPackFolder(null)
        setPackLoading(false)
        return
      }
    }

    if (entries.length === 0) {
      const msg = 'No .sm or .osu files found in the selected folder (scanned: ' + folder + ')'
      console.error('[handleOpenPack]', msg)
      setError(msg)
      setPackFolder(null)
      setPackLoading(false)
      return
    }

    setPackType(detectedType)
    setPackEntries(entries)
    if (detectedType === 'osu' && direction !== 'osu-to-etterna') {
      setDirection('osu-to-etterna')
    }

    // Load pack banner separately so a failure doesn't undo the pack
    try {
      const result = await loadPackBannerUrl(folder)
      if (result) {
        setPackBannerPath(result.filePath)
        setPackBannerUrl(result.url)
        packBannerFileRef.current = result.file ?? null
      }
    } catch {
      // banner is optional
    } finally {
      setPackLoading(false)
    }
  }, [setDirection, setError])

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
    useConverterStore.getState().setMediaUrls({ audio: null, background: null, banner: null, cdtitle: null })
    audioFileRef.current = null
    const audio = audioPlayerRef.current
    if (audio) {
      audio.stop()
    }
    setAudioPlaying(false)

    try {
      const direction = packType === 'osu' ? 'osu-to-etterna' : 'etterna-to-osu'
      console.log('[handlePackEditSong] parsing', entry.source_file, 'dir:', direction)
      const bm = await parseFile(entry.source_file, direction)

      // Load media
      const audioFile = bm.audio_filename
        ? await resolveMediaFile(bm.source_dir, bm.audio_filename).then(r => r ? getCachedFile(r) ?? null : null)
        : null
      audioFileRef.current = audioFile
      const [newAudio, bg, cdtitle, bgName] = await Promise.all([
        audioFile ? readFileAsDataUrl(audioFile) : loadMediaAsDataUrl(bm.source_dir, bm.audio_filename),
        loadMediaAsDataUrl(bm.source_dir, bm.background_filename),
        loadCdtitleAsDataUrl(bm.source_dir, bm.cdtitle_filename, bm.creator),
        resolveMediaName(bm.source_dir, bm.background_filename),
      ])
      useConverterStore.getState().setMediaUrls({ audio: newAudio, background: bg, banner: null, cdtitle })
      useConverterStore.getState().setBeatmap(bm, direction)

      // Restore any saved config for this song (after setBeatmap resets it)
      const saved = packConfigsRef.current.get(index)
      if (saved) {
        useConverterStore.getState().updateConfig(saved)
      }

      // If background was auto-discovered, update config so the FilePicker
      // shows the actual filename instead of "auto"
      const finalConfig = useConverterStore.getState().config
      if (bgName && !finalConfig.background_filename) {
        useConverterStore.getState().updateConfig({ background_filename: bgName })
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
    useConverterStore.getState().setMediaUrls({ audio: null, background: null, banner: null, cdtitle: null })
    audioFileRef.current = null
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
    clearFileCache()
    setPackFolder(null)
    setPackEntries([])
    setPackEditing(null)
    setPackSelected(new Set())
    setPackBannerUrl(null)
    setPackType('sm')
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
      const packFolderName = packFolder ? packFolder.split(/[/\\]+/).filter(Boolean).pop() || 'pack' : 'pack'
      const useOsz = settings.mode === 'osz'

      if (!isTauri()) {
        // Web path: single .osz matching desktop pack output
        const JSZip = (await import('jszip')).default
        const zip = new JSZip()
        const { parseSmAll, parseFile } = await import('./services/convert')
        const addedMedia = new Set<string>()

        for (const idx of indices) {
          const entry = packEntries[idx]
          if (!entry) continue

          const savedCfg = packConfigsRef.current.get(idx)
          const baseCfg = savedCfg || configFromEntry(entry)
          const safeTitle = (baseCfg.title || entry.title).replace(/[/\\?%*:|"<>]/g, '_') || `song_${idx}`

          const cfg = {
            ...baseCfg,
            output_format: 'folder' as const,
            creator: settings.creator || baseCfg.creator,
            hp_drain: settings.hp_drain,
            overall_difficulty: settings.overall_difficulty,
          }

          if (packType === 'osu') {
            // Osu pack: each entry is a single .osu file, convert directly to .sm
            const bm = await parseFile(entry.source_file, 'osu-to-etterna')
            const smContent = await convertBeatmap(bm, cfg)

            // Audio
            const audioOrig = entry.available_difficulties[0]?.audio_filename
            if (audioOrig) {
              const ext = audioOrig.split('.').pop() || 'mp3'
              const renamed = `${safeTitle}.${ext}`
              const key = await resolveMediaFile(entry.source_dir, audioOrig)
              if (key && !addedMedia.has(renamed)) {
                const file = getCachedFile(key)
                if (file) {
                  addedMedia.add(renamed)
                  zip.file(renamed, await file.arrayBuffer())
                }
              }
              // Replace audio filename reference in sm content
              const fixed = smContent.replace(audioOrig, renamed)
              zip.file(`${safeTitle}.sm`, fixed)
            } else {
              zip.file(`${safeTitle}.sm`, smContent)
            }

            // Background
            if (entry.background_filename) {
              const bgOrig = entry.background_filename.split('/').pop() || entry.background_filename
              const ext = bgOrig.split('.').pop() || 'png'
              const renamed = `${safeTitle}.${ext}`
              const key = await resolveMediaFile(entry.source_dir, entry.background_filename)
              if (key && !addedMedia.has(renamed)) {
                const file = getCachedFile(key)
                if (file) {
                  addedMedia.add(renamed)
                  zip.file(renamed, await file.arrayBuffer())
                }
              }
            }
          } else {
            // SM pack (existing behavior)
            const beatmaps = await parseSmAll(entry.source_file)

            // Build rename map: original filename → song-prefixed name (matching desktop pack mode)
            const renameMap = new Map<string, string>()
            const audioOrig = entry.available_difficulties[0]?.audio_filename
            if (audioOrig) {
              const ext = audioOrig.split('.').pop() || 'mp3'
              renameMap.set(audioOrig, `${safeTitle}.${ext}`)
            }
            let bgOrig: string | null = null
            if (entry.background_filename) {
              const resolved = await resolveMediaFile(entry.source_dir, entry.background_filename)
              if (resolved) bgOrig = resolved.split('/').pop() || entry.background_filename
            }
            if (!bgOrig) {
              bgOrig = await resolveMediaFile(entry.source_dir, '').then(r => r?.split('/').pop() || null)
            }
            if (bgOrig) {
              const ext = bgOrig.split('.').pop() || 'jpg'
              renameMap.set(bgOrig, `${safeTitle}.${ext}`)
            }

            for (let bi = 0; bi < beatmaps.length; bi++) {
              const bm = beatmaps[bi]
              if (!bm) continue
              let content = await convertBeatmap(bm, cfg)
              // Fix hardcoded "bg.jpg" reference to the actual background filename
              for (const [orig, renamed] of renameMap) {
                content = content.replaceAll(orig, renamed)
              }
              if (bgOrig && renameMap.get(bgOrig)) {
                content = content.replaceAll('"bg.jpg"', `"${renameMap.get(bgOrig)}"`)
              }
              const safeDiff = (cfg.difficulty_name || bm.difficulty_name || '').replace(/[/\\?%*:|"<>]/g, '_')
              const ext = '.osu'
              const filename = safeDiff ? `${safeTitle} [${safeDiff}]${ext}` : `${safeTitle}${ext}`
              zip.file(filename, content)
            }

            for (const [orig, renamed] of renameMap) {
              if (addedMedia.has(renamed)) continue
              const key = await resolveMediaFile(entry.source_dir, orig)
              if (!key) continue
              const file = getCachedFile(key)
              if (!file) continue
              addedMedia.add(renamed)
              zip.file(renamed, await file.arrayBuffer())
            }
          }
        }

        // Add cdtitle.png (default fallback)
        await addCdtitleToZip(zip, '', null, 'cdtitle.png')

        // Only add dummy diff for SM packs (osu→etterna direction doesn't need it)
        if (packType !== 'osu') {
          const bannerFile = packBannerFileRef.current || (packBannerPath ? getCachedFile(packBannerPath) : null)
          const bannerName = bannerFile?.name || packBannerPath?.split(/[/\\]+/).pop()
          const dummyContent = generateDummyDiffContent(packFolderName, settings.creator, bannerName)
          zip.file(`${packFolderName}.osu`, dummyContent)

          // Add pack banner at root
          if (bannerFile && bannerName) {
            zip.file(bannerName, await bannerFile.arrayBuffer())
          }
        }

        const blob = await zip.generateAsync({ type: 'blob' })
        await saveBlobToFile(blob, `${packFolderName}.osz`)
        setLastExportPath(`${packFolderName}.osz`)
        if (packType === 'osu') {
          trackEvent('songs_folder_conversion_completed', { count: String(indices.length), mode: 'osz' })
        } else {
          trackEvent('pack_conversion_completed', { count: String(indices.length), mode: 'osz' })
        }
      } else {
        // Tauri path
        const exportDir = await dialogOpenDirectory({
          title: useOsz ? 'Choose where to save the .osz' : 'Choose export folder',
        })
        if (!exportDir) { setConverting(false); return }

        const workDir = useOsz
          ? `${exportDir}/__henkan_pack_${packFolderName}`
          : `${exportDir}/${packFolderName}`

        await cleanDir(workDir)

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
          if (packType === 'osu') {
            // Osu pack: each entry is a single .osu file, convert directly to .sm
            const bm = await parseFile(entry.source_file, 'osu-to-etterna')
            const smContent = await convertBeatmap(bm, cfg)
            const result = await exportBeatmap(bm, cfg, smContent, workDir, bm.difficulty_name, false)
            allPaths.push(result)
          } else {
            const paths = await exportAllBeatmaps(entry.source_file, cfg, workDir, undefined, packFolderName)
            allPaths.push(...paths)
          }
        }

        if (packType !== 'osu') {
          const firstEntry = packEntries[indices[0]]
          const firstCfg = packConfigsRef.current.get(indices[0]) || configFromEntry(firstEntry)
          await createDummyDiff(packFolderName, settings.creator || firstCfg.creator, packBannerPath, workDir)
        }

        if (useOsz) {
          const oszPath = `${exportDir}/${packFolderName}.osz`
          await zipFolder(workDir, oszPath)
          setLastExportPath(oszPath)
          setExportPath(oszPath)
        } else {
          setLastExportPath(allPaths.join('\n'))
          setExportPath(exportDir)
        }
        trackEvent('pack_conversion_completed', { count: String(indices.length), mode: settings.mode })
      }
    } catch (e: unknown) {
      const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : 'Pack conversion failed'
      setError(msg)
      trackEvent('pack_conversion_failed', { error: msg })
    } finally {
      setConverting(false)
    }
  }, [packEntries, packSelected, packConvertAllMode, packFolder, packBannerPath, packType, setConverting, setError, setExportPath])

  const handlePackSettingsCancel = useCallback(() => {
    setShowPackSettings(false)
  }, [])

  const handleSelectDifficulty = useCallback(async (index: number) => {
    if (!beatmap?.source_file) return
    setError(null)
    setSwitchingDifficulty(true)
    try {
      const bm = await selectDifficulty(beatmap.source_file, index)

      // Update beatmap + config first (preserves user-customized fields, syncs rest from new beatmap)
      useConverterStore.getState().updateBeatmapDifficulty(bm)
      if (queueActiveId) {
        queueUpdateItem(queueActiveId, { beatmap: bm })
      }

      // Load media using config values — now correctly reflects user customizations
      // while falling back to the new difficulty's defaults for non-customized fields
      const cfg = useConverterStore.getState().config
      const audioFilename = cfg.audio_filename || bm.audio_filename
      const audioFile = audioFilename
        ? await resolveMediaFile(bm.source_dir, audioFilename).then(r => r ? getCachedFile(r) ?? null : null)
        : null
      audioFileRef.current = audioFile
      const [audio, bg, banner, cdtitle] = await Promise.all([
        audioFile ? readFileAsDataUrl(audioFile) : loadMediaAsDataUrl(bm.source_dir, audioFilename),
        loadMediaAsDataUrl(bm.source_dir, cfg.background_filename || bm.background_filename),
        loadMediaAsDataUrl(bm.source_dir, cfg.banner_filename || bm.banner_filename),
        loadCdtitleAsDataUrl(bm.source_dir, cfg.cdtitle_filename || bm.cdtitle_filename, cfg.creator || bm.creator),
      ])
      useConverterStore.getState().setMediaUrls({ audio, background: bg, banner, cdtitle })
    } catch (e: unknown) {
      setError(typeof e === 'string' ? e : e instanceof Error ? e.message : 'Failed to select difficulty')
    } finally {
      setSwitchingDifficulty(false)
    }
  }, [beatmap, setError, queueActiveId, queueUpdateItem])

  const handleChangeFile = useCallback(async (field: string, _current: string | null): Promise<void> => {
    try {
      const selected = await dialogOpenFiles({
        multiple: false,
        filters: [
          { name: 'Media files', extensions: ['mp3', 'ogg', 'wav', 'jpg', 'jpeg', 'png', 'gif'] },
        ],
      })
      if (selected && selected.length > 0) {
        const path = selected[0]
        const url = await readFileAsDataUrl(path)
        const key = field === 'cdtitle' ? 'cdtitle_filename' : `${field}_filename`
        const store = useConverterStore.getState()
        store.updateConfig({ [key]: path })
        if (url) {
          store.setMediaUrls({ ...store.mediaUrls, [field]: url })
        }
      }
    } catch { /* ignore */ }
  }, [])

  const handleOpenInOsu = useCallback(async () => {
    const path = exportPath || lastExportPath
    if (!path) return
    try {
      await openFile(path)
    } catch { /* ignore */ }
  }, [lastExportPath, exportPath])

  const handleReset = useCallback(() => {
    clearFileCache()
    queueClearAll()
    reset()
  }, [queueClearAll, reset])

  const handleDismissExport = useCallback(() => {
    setLastExportPath(null)
  }, [])

  // Drag-and-drop
  const lastDropRef = useRef(0)
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false

    if (isTauri()) {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        if (cancelled) return
        getCurrentWindow().onDragDropEvent(async (evt) => {
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
            let folderPath: string | null = null
            for (const p of evt.payload.paths) {
              if (seen.has(p)) continue
              seen.add(p)
              const ext = p.match(/\.[^.]+$/)?.[0]?.toLowerCase()
              if (!ext || !ACCEPTED_EXTS.includes(ext)) {
                if (folderPath === null) folderPath = p
              } else {
                files.push(p)
              }
            }
            if (folderPath) {
              const { isDir } = await import('./services/platform')
              const isDirectory = await isDir(folderPath)
              if (isDirectory) {
                handleOpenPack(folderPath)
              } else {
                // Non-directory, non-accepted file — just ignore or try to add it anyway
                console.log('[drop] skipping non-directory, non-accepted path:', folderPath)
              }
            }
            if (files.length > 0) handleFilesSelected(files)
          }
        }).then(fn => { unlisten = fn })
      }).catch(() => {})
    }

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
        onDrop={async (e) => {
          e.preventDefault()
          setDragging(false)
          if (isTauri()) return
          const files = Array.from(e.dataTransfer?.files || [])
          if (!files.length) return
          const now = Date.now()
          if (now - lastDropRef.current < 500) return
          lastDropRef.current = now
          fileInputCache.push(...files)

          // Detect folder drop
          const hasWebkitPath = files.some(f => (f as any).webkitRelativePath)
          if (hasWebkitPath) {
            const rootFolder = (files[0] as any).webkitRelativePath.split('/')[0]
            handleOpenPack(rootFolder)
            return
          }

          // Detect folder drop via webkitGetAsEntry (works in Firefox/Edge)
          // Firefox returns stub File objects in e.dataTransfer.files for folder drops;
          // real file contents are only accessible through FileSystemDirectoryReader.
          const items = Array.from(e.dataTransfer?.items || [])
          const dirEntry = items.find(item => {
            const entry = item.webkitGetAsEntry?.()
            return entry?.isDirectory
          })?.webkitGetAsEntry?.()
          if (dirEntry && dirEntry.isDirectory) {
            const readDir = (entry: FileSystemDirectoryEntry): Promise<File[]> =>
              new Promise((resolve) => {
                const reader = entry.createReader()
                const all: File[] = []
                const readBatch = () => {
                  reader.readEntries(async (entries) => {
                    if (entries.length === 0) { resolve(all); return }
                    for (const e of entries) {
                      if (e.isFile) {
                        const f = await new Promise<File | null>(r => (e as FileSystemFileEntry).file(r, () => r(null)))
                        if (f) all.push(f)
                      } else if (e.isDirectory) {
                        const sub = await readDir(e as FileSystemDirectoryEntry)
                        all.push(...sub)
                      }
                    }
                    readBatch()
                  }, () => resolve(all))
                }
                readBatch()
              })
            const realFiles = await readDir(dirEntry)
            if (realFiles.length > 0) {
              fileInputCache.length = 0
              fileInputCache.push(...realFiles)
            }
            handleOpenPack(dirEntry.name)
            return
          }

          // Fallback heuristic: multiple .osu or .sm files = folder drop
          const osuFiles = files.filter(f => f.name.toLowerCase().endsWith('.osu'))
          const smFiles = files.filter(f => f.name.toLowerCase().endsWith('.sm'))
          const isFolderDrop = files.length > 1 && (osuFiles.length > 0 || smFiles.length > 0)

          if (isFolderDrop) {
            handleOpenPack('Dropped')
            return
          }

          // Single/multiple file drops — skip extensionless entries
          const knownExts = ['.sm', '.osu', '.osz']
          const seen = new Set<string>()
          const filePaths: string[] = []
          for (const f of files) {
            const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
            if (!knownExts.includes(ext)) continue
            const p = (f as any).path || f.name
            if (seen.has(p)) continue
            seen.add(p)
            filePaths.push(p)
          }
          if (filePaths.length > 0) handleFilesSelected(filePaths)
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
          <Header direction={direction} onSetDirection={(dir) => { setDirection(dir); queueClearAll(); reset() }} appVersion={appVersion} onShowVersionDialog={() => { setShowVersionDialog(true); setCheckResult(null) }} />

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
                  onClick={() => setShowMirror(true)}
                  className="h-11 px-6 rounded-xl text-sm font-medium
                    bg-white/[0.04] border border-white/8 text-surface-400
                    hover:bg-white/[0.07] hover:text-surface-200
                    active:scale-[0.97] transition-all duration-75 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Search beatmaps
                </button>
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
          <div>
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
          </div>
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

        {/* Update dialog */}
        <UpdateDialog
          open={showUpdateDialog}
          updateInfo={pendingUpdate}
          installing={installing}
          onUpdate={handleUpdate}
          onDismiss={handleDismissUpdate}
        />

        {/* Version info dialog */}
        {showVersionDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowVersionDialog(false)}>
            <div className="bg-surface-900 border border-surface-700/50 rounded-2xl shadow-2xl max-w-sm w-full mx-4 animate-scale-in p-6" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <img src="/logo32.png" alt="Henkan" className="w-10 h-10 rounded-xl" />
                <div>
                  <h2 className="text-lg font-semibold text-surface-100">Henkan</h2>
                  <p className="text-sm text-surface-400 font-mono">v{appVersion || '—'}</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 mb-5">
                {isTauri() && (
                  <button
                    onClick={handleCheckVersion}
                    disabled={checking}
                    className="w-full px-4 py-2.5 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent-hover active:scale-[0.97] transition-all duration-75 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {checking ? (
                      <>
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Checking...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Check for updates
                      </>
                    )}
                  </button>
                )}

                {checkResult === 'up-to-date' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 text-xs font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    You're up to date
                  </div>
                )}

                {checkResult === 'error' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 text-red-400 text-xs font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Could not check for updates
                  </div>
                )}

                {checkResult === 'update-found' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/10 text-accent text-xs font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    A new version is available!
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowVersionDialog(false)}
                className="w-full px-4 py-2 rounded-xl bg-surface-800 border border-surface-700/40 text-surface-400 font-medium text-sm hover:bg-surface-700 hover:text-surface-200 active:scale-[0.97] transition-all duration-75"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Beatmap mirror dialog */}
        <BeatmapMirrorDialog
          open={showMirror}
          onClose={() => setShowMirror(false)}
          onDownloadAndQueue={handleMirrorDownload}
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
                  {isTauri() && (
                    <button
                      onClick={handleOpenInOsu}
                      className="px-6 py-2.5 rounded-xl bg-accent text-white font-medium text-sm
                                 hover:bg-accent-hover active:scale-[0.97] transition-all duration-75 shadow-lg shadow-accent/25"
                    >
                      {direction === 'etterna-to-osu' ? 'Open in osu!' : 'Show in explorer'}
                    </button>
                  )}
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
