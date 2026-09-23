import type { Beatmap, ExportConfig, PackEntry } from '../types/beatmap'
import { useCallback, useState, useEffect, useMemo, useRef, startTransition } from 'react'
import { Link, useNavigate } from 'react-router'
import { useT } from '../i18n'
import { useConverterStore } from '../stores/useConverterStore'
import {
  useQueueStore,
  type QueueItem,
  buildConfig,
  emptyConfig,
  generateId,
  detectDirection,
} from '../stores/useQueueStore'
import type { FileWithPath } from '../services/fileCache'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { trackEvent } from '../services/analytics'
import { Header } from '../components/Header'
import { DropZone } from '../components/DropZone'
import { ConversionQueue } from '../components/ConversionQueue'
import { MetadataPanel } from '../components/MetadataPanel'
import { AudioPlayer } from '../components/AudioPlayer'
import { PreviewOverlay } from '../components/PreviewOverlay'
import { LoadingScreen } from '../components/LoadingScreen'
import { MirrorDownloadWarning } from '../components/MirrorDownloadWarning'
import { BulkConvertDialog } from '../components/BulkConvertDialog'
import { PackBrowser } from '../components/PackBrowser'
import { FallingArrows } from '../components/FallingArrows'
import { LiveMapStack, type LiveMapStackItem, OsuBackground } from '../components/OsuMapPrompt'
import { PackSettingsDialog } from '../components/PackSettingsDialog'
import { PackReviewDialog, type PackReviewItem } from '../components/PackReviewDialog'
import { DiffPresetManager } from '../components/DiffPresetManager'
import { UpdateDialog } from '../components/UpdateDialog'
import { BeatmapMirrorDialog } from '../components/BeatmapMirrorDialog'
import { GameIntegrationPrompt } from '../components/GameIntegrationPrompt'
import { HomeReveal } from '../components/HomeReveal'
import { WebAudioPlayer } from '../lib/WebAudioPlayer'
import { isTauri } from '../services/environment'
import {
  openFiles as dialogOpenFiles,
  openDirectory as dialogOpenDirectory,
  saveFile as dialogSaveFile,
} from '../services/dialogs'
import { fileInputCache, getCachedFile, clearFileCache } from '../services/fileCache'
import { readFileAsDataUrl, resolveMediaFile, resolveAudioFallback, saveBlobToFile } from '../services/files'
import { parseFile, selectDifficulty, selectDifficulties, convertBeatmap, expandDiffName, ensureOszMediaCached } from '../services/convert'
import { fetchMissingMedia, type MirrorProgress, type FetchLookupInfo } from '../services/mirrorMedia'
import { exportBeatmap, exportAllBeatmaps, zipFolder, addCdtitleToZip } from '../services/export'
import {
  scanPack,
  scanSongsFolder,
  loadPackBannerUrl,
  createDummyDiff,
  cleanDir,
  generateDummyDiffContent,
} from '../services/pack'
import { openFile } from '../services/platform'
import {
  archiveSkinFolderFiles,
  archiveSkinFolderPath,
  containsSkinMarker,
  isSkinArchiveName,
  isSkinFolderPath,
  readDroppedDirectory,
  setPendingSkinInput,
  type SkinInput,
} from '../services/skinInput'
import { detectSkinArchive } from '../services/skinConverter'
import { useOsuLive } from '../hooks/useOsuLive'
import { useOsuMapBackground } from '../hooks/useOsuMapBackground'
import { osuReadMap, type OsuSelectedMap } from '../lib/osuDesktop'
import { useEtternaLive } from '../hooks/useEtternaLive'
import { useEtternaMapBackground } from '../hooks/useEtternaMapBackground'
import { etternaClientName, etternaReadMap } from '../lib/etternaDesktop'
import { useOsuLibraryStore } from '../stores/useOsuLibraryStore'
import { useConversionLibraryStore } from '../stores/useConversionLibraryStore'
import { useGameIntegrationsStore } from '../stores/useGameIntegrationsStore'
import { directSaveFolder, hasDetectedGame } from '../lib/gameIntegrations'
import { scrollAppToTop } from '../lib/appScroll'
import { useInterfaceSettingsStore } from '../stores/useInterfaceSettingsStore'
import { consumePendingConversionReplay, type PackReplay } from '../services/conversionLibrary'
import { loadLastOpenedMapBackground, saveLastOpenedMapBackground } from '../services/lastOpenedMapBackground'
import {
  configForSeparateBeatmap,
  normalizeCompilationMetadata,
  normalizeParsedOsuPackMetadata,
  packEntryMetadata,
} from '../lib/packMetadata'

const ACCEPTED_EXTS = ['.osu', '.osz', '.sm']

// Older updater manifests store the GitHub release URL in `notes`, which the
// plugin surfaces as `body`. Fetch the real markdown notes from the API.
async function resolveUpdateBody(version: string, body: string | null): Promise<string | null> {
  if (body && !/^https?:\/\//.test(body)) return body
  // Prefer the tag from the URL itself; fall back to v<version>
  const tag = body?.match(/releases\/tag\/([^/?#]+)/)?.[1] ?? `v${version}`
  try {
    const resp = await fetch(`https://api.github.com/repos/kaanreal/henkan/releases/tags/${encodeURIComponent(tag)}`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!resp.ok) return null
    const release = await resp.json()
    const notes: unknown = release?.body
    if (typeof notes !== 'string' || !notes.trim()) return null
    return notes
  } catch {
    // No usable notes; better to hide the section than show a bare link
    return null
  }
}

function configFromEntry(entry: PackEntry, useDifficultyAsTitle = false): ExportConfig {
  const fallback =
    entry.source_file
      .split(/[/\\]+/)
      .filter(Boolean)
      .pop()
      ?.replace(/\.[^.]+$/, '') || 'Untitled'
  const metadata = packEntryMetadata(entry, useDifficultyAsTitle)
  return {
    title: metadata.title || fallback,
    artist: metadata.artist,
    creator: '',
    difficulty_name: metadata.difficultyName,
    source: '',
    tags: '',
    audio_filename: metadata.audioFilename,
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
    subtitle: metadata.subtitle,
    title_translit: null,
    subtitle_translit: null,
    artist_translit: null,
    genre: null,
    credit: null,
    display_bpm: null,
    sample_start: null,
    sample_length: null,
    selectable: null,
    diff_name_template: null,
  }
}

function normalizePackConfig(
  entry: PackEntry,
  entries: PackEntry[],
  config: ExportConfig,
  compilationStyle: boolean,
): ExportConfig {
  if (!compilationStyle) return config
  return {
    ...config,
    ...normalizeCompilationMetadata(entry, entries, config),
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

async function loadBackgroundAsDataUrl(
  sourceDir: string,
  filename: string | null | undefined,
): Promise<string | null> {
  try {
    const resolved = await resolveMediaFile(sourceDir, filename ?? '')
    if (!resolved) return null
    if (!isTauri()) {
      const file = getCachedFile(resolved)
      if (file) return await backgroundBlobToDataUrl(file)
    }
    return await readFileAsDataUrl(resolved)
  } catch {
    return null
  }
}

async function loadBackgroundBlob(url: string): Promise<Blob | null> {
  try {
    if (url.startsWith('data:')) {
      const comma = url.indexOf(',')
      if (comma < 0) return null
      const metadata = url.slice(5, comma)
      const data = url.slice(comma + 1)
      const mimeType = metadata.split(';')[0]
      if (metadata.toLowerCase().includes(';base64')) {
        const binary = atob(data)
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
        return new Blob([bytes], { type: mimeType })
      }
      return new Blob([decodeURIComponent(data)], { type: mimeType })
    }

    const response = await fetch(url)
    return response.ok ? await response.blob() : null
  } catch {
    return null
  }
}

function backgroundBlobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(blob)
  })
}

const _avatarCache = new Map<string, string>()
const BACKGROUND_PARALLAX_PX = 10
const BACKGROUND_PARALLAX_EASE = 7

async function loadCdtitleAsDataUrl(
  sourceDir: string,
  filename: string | null | undefined,
  creator?: string | null,
): Promise<string | null> {
  try {
    if (filename) {
      const resolved = await resolveMediaFile(sourceDir, filename)
      if (resolved) return await readFileAsDataUrl(resolved)
    }
  } catch {
    /* fall through */
  }

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
    } catch {
      /* fall through */
    }
  }

  try {
    const resp = await fetch('/cdtitle_default.png')
    if (!resp.ok) return null
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

interface MediaLoadOptions {
  audioFilename?: string | null
  backgroundFilename?: string | null
  bannerFilename?: string | null
  cdtitleFilename?: string | null
  creator?: string | null
  resolveBgName?: boolean
  /** Ask the user before downloading missing media from the mirror. */
  confirmFetch?: (bm: Beatmap, info: FetchLookupInfo) => Promise<boolean>
  /** Report download/extraction progress to the UI. */
  onMirrorProgress?: (p: MirrorProgress) => void
}

interface MediaLoadResult {
  audio: string | null
  background: string | null
  banner: string | null
  cdtitle: string | null
  audioFile: File | null
  sourceDir: string
  bgName: string | null
}

async function resolveBeatmapMedia(bm: Beatmap, opts: MediaLoadOptions = {}): Promise<MediaLoadResult> {
  if (bm.source_file) {
    await ensureOszMediaCached(bm.source_file)
  }

  let sourceDir = bm.source_dir
  const audioFilename = opts.audioFilename ?? bm.audio_filename
  const backgroundFilename = opts.backgroundFilename ?? bm.background_filename
  const bannerFilename = opts.bannerFilename ?? bm.banner_filename
  const cdtitleFilename = opts.cdtitleFilename ?? bm.cdtitle_filename
  const creator = opts.creator ?? bm.creator

  let audioPath = audioFilename ? await resolveMediaFile(sourceDir, audioFilename) : null

  // Lone .osu with no local audio: fetch the set's media from the mirror
  if (!audioPath && audioFilename && bm.source_format === 'OsuMania') {
    const fetched = await fetchMissingMedia(bm, {
      confirmFetch: opts.confirmFetch,
      onProgress: opts.onMirrorProgress,
    })
    if (fetched) {
      sourceDir = fetched.source_dir
      audioPath = audioFilename ? await resolveMediaFile(sourceDir, audioFilename) : null
      // The .osu may reference an audio file the set doesn't ship under that
      // exact name — fall back to the set's main audio so the preview still works.
      if (!audioPath) {
        audioPath = await resolveAudioFallback(sourceDir)
      }
    }
  }

  const audioFile = audioPath ? (getCachedFile(audioPath) ?? null) : null
  const [audio, background, banner, cdtitle, bgName] = await Promise.all([
    audioFile ? readFileAsDataUrl(audioFile) : loadMediaAsDataUrl(sourceDir, audioFilename),
    loadBackgroundAsDataUrl(sourceDir, backgroundFilename),
    loadMediaAsDataUrl(sourceDir, bannerFilename),
    loadCdtitleAsDataUrl(sourceDir, cdtitleFilename, creator),
    opts.resolveBgName ? resolveMediaName(sourceDir, backgroundFilename) : Promise.resolve(null),
  ])
  return { audio, background, banner, cdtitle, audioFile, sourceDir, bgName }
}

export default function ConverterPage() {
  const navigate = useNavigate()
  const t = useT()
  const showFallingArrows = useInterfaceSettingsStore(s => s.showFallingArrows)
  const osuHookEnabled = useInterfaceSettingsStore(s => s.osuHookEnabled)
  const etternaHookEnabled = useInterfaceSettingsStore(s => s.etternaHookEnabled)
  const markOsuPromptSeen = useOsuLibraryStore(s => s.markPromptSeen)
  const installations = useGameIntegrationsStore(s => s.installations)
  const integrationsChecked = useGameIntegrationsStore(s => s.checked)
  const integrationsEnabled = useGameIntegrationsStore(s => s.enabled)
  const integrationsPromptSeen = useGameIntegrationsStore(s => s.promptSeen)
  const detectGameIntegrations = useGameIntegrationsStore(s => s.detect)
  const acceptGameIntegrations = useGameIntegrationsStore(s => s.accept)
  const dismissGameIntegrations = useGameIntegrationsStore(s => s.dismiss)
  const showGameIntegrationPrompt = isTauri()
    && integrationsChecked
    && !integrationsPromptSeen
    && hasDetectedGame(installations)
  const {
    beatmap,
    config,
    direction,
    mediaUrls,
    isConverting,
    exportPath,
    error,
    dragging,
    setBeatmap,
    setMediaUrls,
    setDirection,
    setConverting,
    setExportPath,
    setError,
    setDragging,
    reset,
  } = useConverterStore()
  const directOutputDir = integrationsEnabled
    ? directSaveFolder(installations, direction)
    : null
  const directSaveLabel = directOutputDir
    ? direction === 'osu-to-etterna'
      ? t('convertDialog.saveIntoEtterna')
      : t('convertDialog.saveIntoOsu')
    : null
  const allDifficultyIndices = useMemo(
    () => beatmap?.available_difficulties.map((_, index) => index) ?? [],
    [beatmap?.available_difficulties],
  )

  useEffect(() => {
    if (!isTauri()) return
    void detectGameIntegrations()
  }, [detectGameIntegrations])

  const enableGameIntegrations = () => {
    acceptGameIntegrations()
    markOsuPromptSeen()
  }

  const skipGameIntegrations = () => {
    dismissGameIntegrations()
    markOsuPromptSeen()
  }

  const [lastExportPath, setLastExportPath] = useState<string | null>(null)
  const [lastExportWasDirect, setLastExportWasDirect] = useState(false)
  const [lastOpenedMapBackgroundUrl, setLastOpenedMapBackgroundUrl] = useState<string | null>(null)
  const backgroundSectionRef = useRef<HTMLElement | null>(null)
  const backgroundLayerRef = useRef<HTMLDivElement | null>(null)
  const lastOpenedBackgroundRevisionRef = useRef(0)
  useEffect(() => {
    let cancelled = false
    const revision = lastOpenedBackgroundRevisionRef.current
    void loadLastOpenedMapBackground().then((blob) => {
      if (cancelled || !blob || revision !== lastOpenedBackgroundRevisionRef.current) return
      void backgroundBlobToDataUrl(blob).then((url) => {
        if (cancelled || !url || revision !== lastOpenedBackgroundRevisionRef.current) return
        setLastOpenedMapBackgroundUrl(url)
      })
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const section = backgroundSectionRef.current
    const layer = backgroundLayerRef.current
    if (!section || !layer || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const parallax = { x: 0, y: 0, targetX: 0, targetY: 0 }
    let frame = 0
    let previousTime = 0

    const animate = (time: number) => {
      const dt = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 1 / 60
      previousTime = time
      const amount = 1 - Math.exp(-BACKGROUND_PARALLAX_EASE * dt)
      let moving = false
      const dx = parallax.targetX - parallax.x
      const dy = parallax.targetY - parallax.y
      if (Math.abs(dx) < 0.05) {
        if (parallax.x !== parallax.targetX) moving = true
        parallax.x = parallax.targetX
      } else {
        parallax.x += dx * amount
        moving = true
      }
      if (Math.abs(dy) < 0.05) {
        if (parallax.y !== parallax.targetY) moving = true
        parallax.y = parallax.targetY
      } else {
        parallax.y += dy * amount
        moving = true
      }

      layer.style.transform = `translate3d(${parallax.x}px, ${parallax.y}px, 0)`
      if (moving) frame = window.requestAnimationFrame(animate)
      else frame = 0
    }

    const schedule = () => {
      if (frame) return
      previousTime = 0
      frame = window.requestAnimationFrame(animate)
    }

    const clamp = (value: number) => Math.max(-BACKGROUND_PARALLAX_PX, Math.min(BACKGROUND_PARALLAX_PX, value))
    const move = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      const bounds = section.getBoundingClientRect()
      if (bounds.width < 1 || bounds.height < 1) return
      parallax.targetX = clamp(((event.clientX - bounds.left) / bounds.width - 0.5) * 2 * BACKGROUND_PARALLAX_PX)
      parallax.targetY = clamp(((event.clientY - bounds.top) / bounds.height - 0.5) * 2 * BACKGROUND_PARALLAX_PX)
      schedule()
    }
    const leave = () => {
      parallax.targetX = 0
      parallax.targetY = 0
      schedule()
    }

    section.addEventListener('pointermove', move, { passive: true })
    section.addEventListener('pointerleave', leave)
    return () => {
      section.removeEventListener('pointermove', move)
      section.removeEventListener('pointerleave', leave)
      if (frame) window.cancelAnimationFrame(frame)
      layer.style.transform = ''
    }
  }, [])

  const rememberLastOpenedBackground = useCallback(async (backgroundUrl: string | null) => {
    if (!backgroundUrl) return
    const revision = ++lastOpenedBackgroundRevisionRef.current
    const blob = await loadBackgroundBlob(backgroundUrl)
    if (!blob || revision !== lastOpenedBackgroundRevisionRef.current || !blob.size || blob.type.startsWith('video/')) return
    const durableUrl = await backgroundBlobToDataUrl(blob)
    if (!durableUrl || revision !== lastOpenedBackgroundRevisionRef.current) return
    setLastOpenedMapBackgroundUrl(durableUrl)
    await saveLastOpenedMapBackground(blob)
  }, [])

  useEffect(() => {
    if (!mediaUrls.background) return
    void rememberLastOpenedBackground(mediaUrls.background)
  }, [mediaUrls.background, rememberLastOpenedBackground])

  const [showPreview, setShowPreview] = useState(false)
  const [switchingDifficulty, setSwitchingDifficulty] = useState(false)
  const [difficultySelection, setDifficultySelection] = useState<number[] | null>(null)
  const [reconvertPackSettings, setReconvertPackSettings] = useState<PackReplay | null>(null)
  const [showBulkConvert, setShowBulkConvert] = useState(false)
  const [showPackSettings, setShowPackSettings] = useState(false)
  const [packReviewItems, setPackReviewItems] = useState<PackReviewItem[] | null>(null)
  const [mirrorFetchRequest, setMirrorFetchRequest] = useState<{
    resolve: (ok: boolean) => void
    title: string
    artist: string
    unmatched: boolean
  } | null>(null)
  const [mirrorProgress, setMirrorProgress] = useState<MirrorProgress | null>(null)
  const [packConvertAllMode, setPackConvertAllMode] = useState(false)
  const [queueLoading, setQueueLoading] = useState(false)
  const [osuHookBusy, setOsuHookBusy] = useState(false)
  const [etternaHookBusy, setEtternaHookBusy] = useState(false)
  const [livePriorityId, setLivePriorityId] = useState('')
  const { live: osuLive } = useOsuLive(isTauri() && osuHookEnabled)
  const osuSelected = osuLive.connected ? osuLive.map : null
  const osuSources = osuLive.sources ?? []
  const stableSource = osuSources.find((source) => source.id === 'osu-stable')
  const lazerSource = osuSources.find((source) => source.id === 'osu-lazer')
  const stableSelected = stableSource?.map ?? (osuSelected && !osuSelected.folder.startsWith('lazer:') ? osuSelected : null)
  const lazerSelected = lazerSource?.map ?? (osuSelected?.folder.startsWith('lazer:') ? osuSelected : null)
  const stableBackgroundUrl = useOsuMapBackground(stableSelected)
  const lazerBackgroundUrl = useOsuMapBackground(lazerSelected)
  const { live: etternaLive } = useEtternaLive(isTauri() && etternaHookEnabled)
  const etternaSelected = etternaLive.connected ? etternaLive.map : null
  const etternaBackgroundUrl = useEtternaMapBackground(etternaSelected)
  const livePromptItems = ([
    stableSelected
      ? {
          id: 'osu-stable',
          map: stableSelected,
          sourceLabel: stableSource?.clientName,
          backgroundUrl: stableBackgroundUrl,
          busy: osuHookBusy,
          onConvert: () => void handleConvertOsuMap(stableSelected),
        }
      : null,
    lazerSelected
      ? {
          id: 'osu-lazer',
          map: lazerSelected,
          sourceLabel: lazerSource?.clientName,
          backgroundUrl: lazerBackgroundUrl,
          busy: osuHookBusy,
          onConvert: () => void handleConvertOsuMap(lazerSelected),
        }
      : null,
    etternaSelected
      ? {
          id: 'etterna',
          map: etternaSelected,
          sourceLabel: etternaClientName(),
          backgroundUrl: etternaBackgroundUrl,
          busy: etternaHookBusy,
          onConvert: () => void handleConvertEtternaMap(),
        }
      : null,
  ] as (LiveMapStackItem | null)[]).filter((item): item is LiveMapStackItem => item !== null)
  const priorityItem = livePromptItems.find((item) => item.id === livePriorityId) ?? livePromptItems[0]
  const liveBackgroundUrl = priorityItem?.backgroundUrl ?? null
  const menuBackgroundUrl = mediaUrls.background ?? lastOpenedMapBackgroundUrl

  const routeSkinInput = useCallback(
    async (input: SkinInput): Promise<boolean> => {
      try {
        await detectSkinArchive(input)
        setPendingSkinInput(input)
        navigate('/skin-converter')
        return true
      } catch {
        return false
      }
    },
    [navigate],
  )

  // Update checking state
  const [pendingUpdate, setPendingUpdate] = useState<{
    version: string
    body: string | null
    date: string | null
  } | null>(null)
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [installing, setInstalling] = useState(false)

  // Version dialog state
  const [appVersion, setAppVersion] = useState<string | null>(isTauri() ? null : import.meta.env.VITE_APP_VERSION)
  const [showVersionDialog, setShowVersionDialog] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<'up-to-date' | 'update-found' | 'error' | null>(null)

  // Beatmap mirror state
  const [showMirror, setShowMirror] = useState(() => (
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tool') === 'mirror'
  ))

  // Queue state
  const queueItems = useQueueStore((s) => s.items)
  const queueActiveId = useQueueStore((s) => s.activeId)
  const queueAddItem = useQueueStore((s) => s.addItem)
  const queueRemoveItem = useQueueStore((s) => s.removeItem)
  const queueSetActiveId = useQueueStore((s) => s.setActiveId)
  const queueUpdateItem = useQueueStore((s) => s.updateItem)
  const queueClearCompleted = useQueueStore((s) => s.clearCompleted)
  const queueClearAll = useQueueStore((s) => s.clearAll)

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
  // Opening multiple .osu files through the pack browser means each file is a
  // song entry. Do not rely on scanned audio metadata here: some packs reuse or
  // omit it, while Version is still the per-song name users see in osu.
  const usePackDifficultyTitles = packType === 'osu' && packEntries.length > 1

  // Diff name template state
  const [diffNameTemplate, setDiffNameTemplate] = useState('')
  const [showPresetManager, setShowPresetManager] = useState(false)

  // Shared audio player - owned by App, used by AudioPlayer and PreviewOverlay
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
      const tag = (e.target as HTMLElement)?.tagName
      if (e.code === 'Space' && beatmap && mediaUrls.audio && tag !== 'INPUT' && tag !== 'TEXTAREA') {
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
      setVolumeToast({ msg: t('converter.volume', { value: newVol }) })
      volumeToastTimer.current = window.setTimeout(() => {
        setVolumeToast((v) => (v ? { ...v, leaving: true } : null))
        volumeToastTimer.current = window.setTimeout(() => setVolumeToast(null), 220)
      }, 1000)
    }
    window.addEventListener('wheel', handler, { passive: false })
    return () => window.removeEventListener('wheel', handler)
  }, [t])

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
          body: await resolveUpdateBody(update.version, update.body ?? null),
          date: update.date ?? null,
        })
        setShowUpdateDialog(true)
      } catch {
        /* ignore */
      }
    }
    check()
    return () => {
      cancelled = true
    }
  }, [])

  // Get app version (Tauri only)
  useEffect(() => {
    if (!isTauri()) return
    import('@tauri-apps/api/app').then(({ getVersion }) => {
      getVersion().then(setAppVersion)
    })
  }, [])

  const handleCheckForUpdates = async (): Promise<{
    version: string
    body: string | null
    date: string | null
  } | null> => {
    if (!isTauri()) return null
    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const update = await check()
      if (!update) return null
      const body = await resolveUpdateBody(update.version, update.body ?? null)
      setPendingUpdate({
        version: update.version,
        body,
        date: update.date ?? null,
      })
      return {
        version: update.version,
        body,
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
    } catch {
      /* ignore */
    }
    setInstalling(false)
  }

  const handleDismissUpdate = (dontAskAgain: boolean) => {
    if (dontAskAgain && pendingUpdate) {
      try {
        localStorage.setItem(`henkan-update-dismissed-${pendingUpdate.version}`, 'true')
      } catch {
        /* ignore */
      }
    }
    setShowUpdateDialog(false)
  }

  const handleMirrorDownload = async (setId: number, filename: string) => {
    const { downloadBeatmapPath } = await import('../services/beatmapMirror')
    const { path, error } = await downloadBeatmapPath(setId, filename)
    if (error || !path) throw new Error(error ?? t('beatmapMirror.downloadFailed'))
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
      // loading has to flip before the async decode kicks off
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
        // Stay paused at preview point - no autoplay
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

  const requestMirrorFetch = useCallback(
    (bm: Beatmap, info: FetchLookupInfo) =>
      new Promise<boolean>((resolve) => {
        setMirrorFetchRequest({ resolve, title: bm.title, artist: bm.artist, unmatched: info.status === 'unmatched' })
      }),
    [],
  )

  const reportMirrorProgress = useCallback((p: MirrorProgress) => {
    // 'done' only means "stop showing the warning"; no need to round-trip it through state
    if (p.phase === 'done') {
      setMirrorProgress(null)
      setMirrorFetchRequest(null)
    } else {
      setMirrorProgress(p)
    }
  }, [])

  const loadQueueMedia = useCallback(
    async (bm: Beatmap) => {
      const result = await resolveBeatmapMedia(bm, {
        confirmFetch: requestMirrorFetch,
        onMirrorProgress: reportMirrorProgress,
      })
      // Tauri: point the active beatmap at the mirror-extracted media dir so
      // later loads (difficulty switch, re-selection) don't re-download.
      if (result.sourceDir !== bm.source_dir) {
        const updated = { ...bm, source_dir: result.sourceDir }
        const store = useConverterStore.getState()
        store.setBeatmap(updated, store.direction)
        const activeId = useQueueStore.getState().activeId
        if (activeId) {
          queueUpdateItem(activeId, { beatmap: updated })
        }
      }
      audioFileRef.current = result.audioFile
      setMediaUrls({
        audio: result.audio,
        background: result.background,
        banner: result.banner,
        cdtitle: result.cdtitle,
      })
    },
    [setMediaUrls, queueUpdateItem, requestMirrorFetch, reportMirrorProgress],
  )

  const handleFilesSelected = useCallback(
    async (paths: string[], forceActivate = false) => {
      const newIds: string[] = []
      for (const path of paths) {
        const id = generateId()
        const fileName =
          path
            .split(/[/\\]+/)
            .filter(Boolean)
            .pop() || path
        const dir = detectDirection(path)
        newIds.push(id)
        queueAddItem({
          id,
          filePath: path,
          fileName,
          direction: dir,
          beatmap: null,
          config: emptyConfig(),
          status: 'parsing',
          error: null,
          exportPath: null,
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
          if (i === 0 && (queueItems.length === 0 || forceActivate)) {
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
          const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : t('converter.failedToParseFile')
          console.error('ParseFile error:', e)
          queueUpdateItem(id, { status: 'error', error: msg })
        }
      }
    },
    [queueAddItem, queueUpdateItem, queueSetActiveId, queueItems.length, setDirection, setBeatmap, loadQueueMedia, t],
  )

  const handleMainFilesSelected = useCallback(
    async (paths: string[], forceActivate = false) => {
      setDifficultySelection(null)
      const skinPath = paths.find(isSkinArchiveName)
      if (skinPath) {
        const input = getCachedFile(skinPath) || skinPath
        if (await routeSkinInput(input)) return
        setError(t('converter.notReadableSkin'))
        return
      }
      await handleFilesSelected(paths, forceActivate)
    },
    [handleFilesSelected, routeSkinInput, setError, t],
  )

  const handleConvertOsuMap = useCallback(async (map: OsuSelectedMap) => {
    if (osuHookBusy) return
    setOsuHookBusy(true)
    setError(null)
    try {
      const path = await osuReadMap(map.folder)
      await handleMainFilesSelected([path])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('converter.failedToParseFile'))
    } finally {
      setOsuHookBusy(false)
    }
  }, [handleMainFilesSelected, osuHookBusy, setError, t])

  const handleConvertEtternaMap = useCallback(async () => {
    if (!etternaSelected || etternaHookBusy) return
    setEtternaHookBusy(true)
    setError(null)
    try {
      const path = await etternaReadMap(etternaSelected.folder, etternaSelected.file)
      await handleMainFilesSelected([path])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('converter.failedToParseFile'))
    } finally {
      setEtternaHookBusy(false)
    }
  }, [etternaHookBusy, etternaSelected, handleMainFilesSelected, setError, t])

  const handleQueueSelect = useCallback(
    async (item: QueueItem) => {
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
      setDifficultySelection(null)
      setError(null)
      // Load the new item's data
      queueSetActiveId(item.id)
      setDirection(item.direction)
      try {
        const result = await resolveBeatmapMedia(item.beatmap, {
          confirmFetch: requestMirrorFetch,
          onMirrorProgress: reportMirrorProgress,
        })
        audioFileRef.current = result.audioFile
        useConverterStore
          .getState()
          .setMediaUrls({
            audio: result.audio,
            background: result.background,
            banner: result.banner,
            cdtitle: result.cdtitle,
          })
        setBeatmap(item.beatmap, item.direction)
        useConverterStore.getState().updateConfig(item.config)
      } catch {
        setError(t('converter.failedToLoadMedia'))
      } finally {
        setQueueLoading(false)
      }
    },
    [
      queueActiveId,
      queueUpdateItem,
      queueSetActiveId,
      setDirection,
      setBeatmap,
      requestMirrorFetch,
      reportMirrorProgress,
      t,
    ],
  )

  const handleQueueAddFiles = useCallback(async () => {
    const selected = await dialogOpenFiles({
      multiple: true,
      filters: [{ name: t('dialogs.filterBeatmapFiles'), extensions: ['osu', 'osz', 'sm'] }],
    })
    if (selected) {
      handleFilesSelected(selected)
    }
  }, [handleFilesSelected, t])

  const handleQueueRemove = useCallback(
    (id: string) => {
      const idx = queueItems.findIndex((i) => i.id === id)
      if (id === queueActiveId) {
        const remaining = queueItems.filter((i) => i.id !== id)
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
    },
    [queueItems, queueActiveId, queueRemoveItem, queueSetActiveId, setDirection, setBeatmap, loadQueueMedia, reset],
  )

  const handleQueueClearAll = useCallback(() => {
    clearFileCache()
    queueClearAll()
    reset()
  }, [queueClearAll, reset])

  const handleQueueClearCompleted = useCallback(() => {
    const hadActiveCompleted =
      queueActiveId !== null && queueItems.find((i) => i.id === queueActiveId)?.status === 'completed'
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
  }, [
    queueActiveId,
    queueItems,
    queueClearCompleted,
    queueSetActiveId,
    setDirection,
    setBeatmap,
    loadQueueMedia,
    reset,
  ])

  const handleResetAll = useCallback(() => {
    for (const item of queueItems) {
      if ((item.status === 'completed' || item.status === 'error') && item.beatmap) {
        queueUpdateItem(item.id, { status: 'ready', exportPath: null, error: null })
      }
    }
  }, [queueItems, queueUpdateItem])

  const doBatchConversion = useCallback(async () => {
    const readyItems = queueItems.filter((i) => i.status === 'ready' && i.beatmap)
    if (readyItems.length === 0 || isConverting) return

    // Save active config before starting
    const activeCfg = useConverterStore.getState().config
    if (queueActiveId) {
      queueUpdateItem(queueActiveId, { config: activeCfg })
    }

    setConverting(true)
    setError(null)
    setLastExportPath(null)
    setLastExportWasDirect(false)

    const baseDir = isTauri() ? await dialogOpenDirectory({ title: t('dialogs.titleExportAllFolder') }) : ''
    if (baseDir === null) {
      setConverting(false)
      return
    }

    const allPaths: string[] = []

    for (const item of readyItems) {
      const cfg = { ...item.config, output_format: activeCfg.output_format }
      queueUpdateItem(item.id, { status: 'converting' })
      try {
        const itemPathStart = allPaths.length
        const diffCount = item.beatmap?.available_difficulties?.length || 1

        if (isTauri()) {
          if (diffCount <= 1) {
            // Single diff - export flat
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
            // Multi-diff - export to baseDir/songName/diffName/file.sm
            const itemTitle = cfg.title || item.beatmap?.title || item.fileName.replace(/\.[^.]+$/, '')
            const safeName = itemTitle.replace(/[/\\?%*:|"<>]/g, '_')
            const { invoke } = await import('@tauri-apps/api/core')
            for (let i = 0; i < diffCount; i++) {
              const bm = await selectDifficulty(item.filePath, i)
              const diffName = bm.difficulty_name || `Diff ${i + 1}`
              const safeDiff = diffName.replace(/[/\\?%*:|"<>]/g, '_')
              const diffDir = `${baseDir}/${safeName}/${safeDiff}`
              try {
                await invoke('clean_dir', { path: diffDir })
              } catch {
                /* dir may not exist yet */
              }
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
            const diffName = bm.difficulty_name || `Diff ${i + 1}`
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
              const originalName = field.split('/').pop() || field
              const isBg = field === diffCfg.background_filename
              const isBn = field === bm.banner_filename
              const mediaName = isBg
                ? bm.source_format === 'OsuMania'
                  ? 'bg.png'
                  : 'bg.jpg'
                : isBn
                  ? 'banner.png'
                  : originalName
              const mediaPath = `${safeName}/${safeDiff}/${mediaName}`
              if (addedMedia.has(mediaPath)) continue
              addedMedia.add(mediaPath)
              zip.file(mediaPath, await file.arrayBuffer())
            }
            if (bm.source_format === 'OsuMania') {
              await addCdtitleToZip(
                zip,
                bm.source_dir,
                bm.cdtitle_filename,
                `${safeName}/${safeDiff}/cdtitle.png`,
                bm.creator,
              )
            }
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
        const itemPaths = allPaths.slice(itemPathStart)
        queueUpdateItem(item.id, { status: 'completed', exportPath: itemPaths[itemPaths.length - 1], config: cfg })
        if (item.beatmap && itemPaths.length > 0) {
          useConversionLibraryStore.getState().remember({
            kind: 'beatmap',
            title: cfg.title || item.beatmap.title || item.fileName,
            artist: cfg.artist || item.beatmap.artist,
            creator: cfg.creator || item.beatmap.creator,
            sourceName: item.filePath.split(/[/\\]+/).pop() || item.fileName,
            sourceFormat: item.beatmap.source_format,
            direction: item.direction,
            outputFormat: cfg.output_format,
            outputNames: itemPaths,
            outputPath: isTauri() ? baseDir : null,
            itemCount: diffCount,
            difficulty: diffCount === 1
              ? item.beatmap.available_difficulties?.[0]?.name || cfg.difficulty_name || null
              : null,
            sourcePath: item.filePath,
            replay: {
              sourcePath: item.filePath,
              config: { ...cfg },
              difficultyIndices: Array.from({ length: diffCount }, (_, index) => index),
              separateSongs: diffCount > 1,
              packSettings: null,
              skinOptions: null,
            },
          })
        }
      } catch (e: unknown) {
        const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : t('converter.conversionFailed')
        queueUpdateItem(item.id, { status: 'error', error: msg, config: cfg })
      }
    }

    if (allPaths.length > 0) {
      setLastExportPath(allPaths.join('\n'))
      setExportPath(baseDir)
      trackEvent('batch_conversion_completed', { count: String(readyItems.length) })
    }
    setConverting(false)
  }, [queueItems, queueActiveId, isConverting, queueUpdateItem, setConverting, setError, setExportPath, t])

  const doConversion = useCallback(
    async (indices: number[], separateSongs: boolean, directOutput: string | null = null) => {
      if (!beatmap?.source_file || indices.length === 0) return
      setConverting(true)
      setError(null)
      setLastExportPath(null)

      const currentConfig = useConverterStore.getState().config
      const cur = directOutput
        ? { ...currentConfig, output_format: 'folder' as const }
        : currentConfig
      try {
        let exportDir: string | null = null

        if (isTauri()) {
          if (directOutput) {
            exportDir = directOutput
          } else if (cur.output_format === 'osz') {
            exportDir = await dialogSaveFile({
              title: t('dialogs.titleExportOsz'),
              defaultPath: `${cur.artist} - ${cur.title} (${cur.creator}).osz`,
              filters: [{ name: t('dialogs.filterOsuPackage'), extensions: ['osz'] }],
            })
          } else {
            exportDir = await dialogOpenDirectory({
              title: t('dialogs.titleExportFolder'),
            })
          }
        } else {
          exportDir = ''
        }

        if (exportDir === null) {
          setConverting(false)
          return
        }

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
              const sourceConfig = configForSeparateBeatmap(cur, bm)
              const safeDiff = diffLabel.replace(/[/\\?%*:|"<>]/g, '_')
              const diffCfg = {
                ...sourceConfig,
                difficulty_name: diffNameTemplate
                  ? await expandDiffName(diffNameTemplate, bm, sourceConfig, sourceConfig.conversion_rate)
                  : bm.difficulty_name,
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
                const originalName = field.split('/').pop() || field
                const isBg = field === diffCfg.background_filename
                const isBn = field === bm.banner_filename
                const mediaName = isBg
                  ? bm.source_format === 'OsuMania'
                    ? 'bg.png'
                    : 'bg.jpg'
                  : isBn
                    ? 'banner.png'
                    : originalName
                const mediaPath = `${safeName}/${safeDiff}/${mediaName}`
                if (addedMedia.has(mediaPath)) continue
                addedMedia.add(mediaPath)
                zip.file(mediaPath, await file.arrayBuffer())
              }
              if (bm.source_format === 'OsuMania') {
                await addCdtitleToZip(
                  zip,
                  bm.source_dir,
                  bm.cdtitle_filename,
                  `${safeName}/${safeDiff}/cdtitle.png`,
                  bm.creator,
                )
              }
            }
            const blob = await zip.generateAsync({ type: 'blob' })
            const zipName = `${safeName}.zip`
            await saveBlobToFile(blob, zipName)
            allPaths.push(zipName)
          } else if (isTauri() && indices.length > 1) {
            // Desktop multi-diff
            const selectedBeatmaps = await selectDifficulties(beatmap.source_file, indices)
            for (const [position, bm] of selectedBeatmaps.entries()) {
              const diffLabel = bm.difficulty_name || `Diff ${indices[position]}`
              const sourceConfig = configForSeparateBeatmap(cur, bm)
              const diffCfg = {
                ...sourceConfig,
                difficulty_name: diffNameTemplate
                  ? await expandDiffName(diffNameTemplate, bm, sourceConfig, sourceConfig.conversion_rate)
                  : bm.difficulty_name,
              }
              const content = await convertBeatmap(bm, diffCfg)
              const songName = cur.title || beatmap?.title || 'export'
              const safeName = songName.replace(/[/\\?%*:|"<>]/g, '_')
              const safeDiff = diffLabel.replace(/[/\\?%*:|"<>]/g, '_')
              const diffDir = `${exportDir}/${safeName}/${safeDiff}`
              const { invoke } = await import('@tauri-apps/api/core')
              try {
                await invoke('clean_dir', { path: diffDir })
              } catch {
                /* dir may not exist yet */
              }
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
                difficulty_name: diffNameTemplate
                  ? await expandDiffName(diffNameTemplate, bm, cur, cur.conversion_rate)
                  : cur.difficulty_name || bm.difficulty_name,
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
          if (directOutput && direction === 'etterna-to-osu' && indices.length > 1) {
            const paths = await exportAllBeatmaps(beatmap.source_file, cur, exportDir, indices)
            allPaths.push(...paths)
          } else if (isOsz && direction === 'osu-to-etterna' && indices.length > 1 && allAtOne) {
            // Apply template to config before passing to exportAllBeatmaps
            const cfgWithTemplate = diffNameTemplate
              ? { ...cur, difficulty_name: await expandDiffName(diffNameTemplate, beatmap!, cur, cur.conversion_rate) }
              : cur
            const paths = await exportAllBeatmaps(beatmap.source_file, cfgWithTemplate, exportDir, indices)
            allPaths.push(...paths)
          } else {
            for (const idx of indices) {
              const bm = await selectDifficulty(beatmap.source_file, idx)
              const cfg = {
                ...cur,
                difficulty_name: diffNameTemplate
                  ? await expandDiffName(diffNameTemplate, bm, cur, cur.conversion_rate)
                  : cur.difficulty_name || bm.difficulty_name,
              }
              const content = await convertBeatmap(bm, cfg)
              const result = await exportBeatmap(bm, cfg, content, exportDir)
              allPaths.push(result)
            }
          }
        }

        if (allPaths.length > 0) {
          useConversionLibraryStore.getState().remember({
            kind: 'beatmap',
            title: cur.title || beatmap.title,
            artist: cur.artist || beatmap.artist,
            creator: cur.creator || beatmap.creator,
            sourceName: beatmap.source_file.split(/[/\\]+/).pop() || beatmap.source_file,
            sourceFormat: beatmap.source_format,
            direction: direction || (beatmap.source_format === 'OsuMania' ? 'osu-to-etterna' : 'etterna-to-osu'),
            outputFormat: cur.output_format,
            outputNames: allPaths,
            outputPath: isTauri() ? exportDir : null,
            itemCount: indices.length,
            difficulty: indices.length === 1
              ? beatmap.available_difficulties?.[indices[0]]?.name || cur.difficulty_name || null
              : null,
            sourcePath: beatmap.source_file,
            replay: {
              sourcePath: beatmap.source_file,
              config: { ...cur },
              difficultyIndices: [...indices],
              separateSongs,
              packSettings: null,
              skinOptions: null,
            },
          })
        }
        setLastExportPath(allPaths.join('\n'))
        setLastExportWasDirect(Boolean(directOutput))
        setExportPath(exportDir)
        if (queueActiveId) {
          queueUpdateItem(queueActiveId, {
            status: 'completed',
            exportPath: allPaths.join('\n') || exportDir,
            config: cur,
          })
        }
        trackEvent('conversion_completed', { count: String(indices.length), format: cur.output_format })
      } catch (e: unknown) {
        if (queueActiveId) {
          const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : t('converter.conversionFailed')
          queueUpdateItem(queueActiveId, { status: 'error', error: msg, config: cur })
        }
        const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : t('converter.conversionFailed')
        setError(msg)
        trackEvent('conversion_failed', { error: msg })
      } finally {
        setConverting(false)
      }
    },
    [beatmap, direction, diffNameTemplate, queueActiveId, queueUpdateItem, setConverting, setError, setExportPath, t],
  )

  const handleConvertSelection = useCallback(
    async (indices: number[], directOutput: string | null = null) => {
      if (!beatmap?.source_file || indices.length === 0) return

      const isOsz = beatmap.source_file.toLowerCase().endsWith('.osz')
      const curRate = useConverterStore.getState().config.conversion_rate
      const allAtOne = Math.abs(curRate - 1) < 0.01
      if (isOsz && direction === 'osu-to-etterna' && indices.length > 1 && allAtOne) {
        const audioFiles = new Set(
          indices.map((i) => beatmap.available_difficulties[i]?.audio_filename).filter(Boolean),
        )
        if (audioFiles.size > 1) {
          await doConversion(indices, true, directOutput)
          return
        }
      }

      await doConversion(indices, false, directOutput)
    },
    [beatmap, direction, doConversion],
  )

  const selectedDifficultyIndices = difficultySelection ?? allDifficultyIndices

  const handleToggleDifficulty = useCallback((index: number) => {
    setDifficultySelection(current => {
      const selected = new Set(current ?? allDifficultyIndices)
      if (selected.has(index)) selected.delete(index)
      else selected.add(index)
      return [...selected].sort((left, right) => left - right)
    })
  }, [allDifficultyIndices])

  const handleSelectAllDifficulties = useCallback(() => {
    setDifficultySelection([...allDifficultyIndices])
  }, [allDifficultyIndices])

  const handleDeselectAllDifficulties = useCallback(() => {
    setDifficultySelection([])
  }, [])

  const handleConvert = useCallback(() => {
    void handleConvertSelection(selectedDifficultyIndices)
  }, [handleConvertSelection, selectedDifficultyIndices])

  const handleDirectSave = useCallback(async () => {
      if (!directOutputDir) return
      await handleConvertSelection(selectedDifficultyIndices, directOutputDir)
  }, [directOutputDir, handleConvertSelection, selectedDifficultyIndices])

  // ── Pack browsing ──────────────────────────────────────────

  const handleOpenPack = useCallback(
    async (folder?: string) => {
      setReconvertPackSettings(null)
      if (!folder) {
        clearFileCache()
        const picked = await dialogOpenDirectory({ title: t('dialogs.titleSelectPackFolder') })
        if (!picked) return
        folder = picked
      }

      // Try scanning for .sm files first (existing etterna pack behavior)
      let entries: PackEntry[]
      let detectedType: 'sm' | 'osu' = 'sm'
      try {
        entries = await scanPack(folder)
      } catch {
        entries = []
      }

      // If no sm files found, try scanning for .osu files
      if (entries.length === 0) {
        try {
          entries = await scanSongsFolder(folder)
          detectedType = 'osu'
        } catch (e: unknown) {
          const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : t('converter.failedToScanFolder')
          console.error('[handleOpenPack] scanSongsFolder error:', msg)
          setError(msg)
          setPackFolder(null)
          setPackLoading(false)
          return
        }
      }

      if (entries.length === 0) {
        const msg = t('converter.noBeatmapsFound', { folder })
        console.error('[handleOpenPack]', msg)
        setError(msg)
        setPackFolder(null)
        setPackLoading(false)
        return
      }

      // Single file in folder - load directly as a single map, not a pack
      if (entries.length === 1) {
        setPackFolder(null)
        setPackLoading(false)
        handleFilesSelected([entries[0].source_file])
        return
      }

      setPackFolder(folder)
      setPackEditing(null)
      setPackSelected(new Set())
      setPackReviewItems(null)
      setShowPackSettings(false)
      setPackLoading(true)
      setError(null)
      setPackBannerUrl(null)
      setPackBannerPath(null)
      packBannerFileRef.current = null
      packConfigsRef.current.clear()

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
    },
    [handleFilesSelected, setDirection, setError, t],
  )

  useEffect(() => {
    const pending = consumePendingConversionReplay()
    if (!pending || pending.kind === 'skin') return
    let cancelled = false

    const restore = async () => {
      if (pending.kind === 'pack') {
        await handleOpenPack(pending.sourcePath)
        if (cancelled) return
        const packSettings = pending.replay.packSettings
        setPackSelected(new Set(packSettings?.indices || []))
        packConfigsRef.current.clear()
        for (const saved of packSettings?.songConfigs || []) {
          packConfigsRef.current.set(saved.index, { ...saved.config })
        }
        setReconvertPackSettings(packSettings)
        return
      }

      await handleMainFilesSelected([pending.sourcePath], true)
      if (cancelled) return
      if (pending.replay.config) {
        useConverterStore.getState().updateConfig(pending.replay.config)
      }
      setDifficultySelection(pending.replay.difficultyIndices)
    }

    void restore().catch(reason => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : t('converter.failedToParseFile'))
    })
    return () => {
      cancelled = true
    }
  }, [handleMainFilesSelected, handleOpenPack, setError, t])

  const handlePackEditSong = useCallback(
    async (index: number) => {
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
        const bm = await parseFile(entry.source_file, direction)

        // Load media
        const result = await resolveBeatmapMedia(bm, {
          resolveBgName: true,
          confirmFetch: requestMirrorFetch,
          onMirrorProgress: reportMirrorProgress,
        })
        audioFileRef.current = result.audioFile
        useConverterStore
          .getState()
          .setMediaUrls({ audio: result.audio, background: result.background, banner: null, cdtitle: result.cdtitle })
        useConverterStore.getState().setBeatmap(bm, direction)

        // Restore any saved config for this song (after setBeatmap resets it)
        const saved = packConfigsRef.current.get(index)
        if (saved) {
          useConverterStore.getState().updateConfig(saved)
        } else if (usePackDifficultyTitles) {
          const defaults = configFromEntry(entry, true)
          useConverterStore.getState().updateConfig({
            title: defaults.title,
            subtitle: defaults.subtitle,
            difficulty_name: defaults.difficulty_name,
          })
        }

        // If background was auto-discovered, update config so the FilePicker
        // shows the actual filename instead of "auto"
        const finalConfig = useConverterStore.getState().config
        if (result.bgName && !finalConfig.background_filename) {
          useConverterStore.getState().updateConfig({ background_filename: result.bgName })
        }
      } catch (e: unknown) {
        setError(typeof e === 'string' ? e : e instanceof Error ? e.message : t('converter.failedToLoadSong'))
        setPackEditing(null)
      }
    },
    [packEntries, packEditing, setAudioPlaying, setError, requestMirrorFetch, reportMirrorProgress, t, usePackDifficultyTitles],
  )

  const handlePackBack = useCallback(async () => {
    // Save current config
    if (packEditing !== null) {
      const cur = useConverterStore.getState().config
      packConfigsRef.current.set(packEditing, { ...cur })
    }
    await rememberLastOpenedBackground(useConverterStore.getState().mediaUrls.background)
    setPackEditing(null)
    useConverterStore.getState().setBeatmap(null)
    useConverterStore.getState().setMediaUrls({ audio: null, background: null, banner: null, cdtitle: null })
    audioFileRef.current = null
    const audio = audioPlayerRef.current
    if (audio) {
      audio.stop()
    }
    setAudioPlaying(false)
  }, [packEditing, rememberLastOpenedBackground, setAudioPlaying])

  const handlePackClose = useCallback(async () => {
    if (packEditing !== null) {
      const cur = useConverterStore.getState().config
      packConfigsRef.current.set(packEditing, { ...cur })
    }
    await rememberLastOpenedBackground(useConverterStore.getState().mediaUrls.background)
    clearFileCache()
    setPackFolder(null)
    setPackEntries([])
    setPackEditing(null)
    setPackSelected(new Set())
    setPackBannerUrl(null)
    setPackType('sm')
    setReconvertPackSettings(null)
    packConfigsRef.current.clear()
    queueClearAll()
    reset()
  }, [packEditing, queueClearAll, rememberLastOpenedBackground, reset])

  const handleSelectAll = useCallback(
    (select: boolean) => {
      startTransition(() => {
        if (select) {
          setPackSelected(new Set(packEntries.map((_, i) => i)))
        } else {
          setPackSelected(new Set())
        }
      })
    },
    [packEntries],
  )

  const handlePackConvert = useCallback(async () => {
    if (packSelected.size === 0 || isConverting) return
    setPackConvertAllMode(false)
    const items = [...packSelected].sort((a, b) => a - b).flatMap(index => {
      const entry = packEntries[index]
      if (!entry) return []
      const config = normalizePackConfig(
        entry,
        packEntries,
        packConfigsRef.current.get(index) || configFromEntry(entry, usePackDifficultyTitles),
        usePackDifficultyTitles,
      )
      return [{
        index,
        title: config.title,
        artist: config.artist,
        subtitle: config.subtitle || '',
        difficulty: entry.available_difficulties[0]?.name || '',
        difficultyCount: entry.available_difficulties.length,
      }]
    })
    setPackReviewItems(items)
  }, [packEntries, packSelected, isConverting, usePackDifficultyTitles])

  const handlePackConvertAll = useCallback(async () => {
    if (packEntries.length === 0 || isConverting) return
    setPackConvertAllMode(true)
    setPackReviewItems(packEntries.map((entry, index) => {
      const config = normalizePackConfig(
        entry,
        packEntries,
        packConfigsRef.current.get(index) || configFromEntry(entry, usePackDifficultyTitles),
        usePackDifficultyTitles,
      )
      return {
        index,
        title: config.title,
        artist: config.artist,
        subtitle: config.subtitle || '',
        difficulty: entry.available_difficulties[0]?.name || '',
        difficultyCount: entry.available_difficulties.length,
      }
    }))
  }, [packEntries, isConverting, usePackDifficultyTitles])

  const handlePackReviewConfirm = useCallback((items: PackReviewItem[]) => {
    for (const item of items) {
      const entry = packEntries[item.index]
      if (!entry) continue
      const config = normalizePackConfig(
        entry,
        packEntries,
        packConfigsRef.current.get(item.index) || configFromEntry(entry, usePackDifficultyTitles),
        usePackDifficultyTitles,
      )
      packConfigsRef.current.set(item.index, {
        ...config,
        title: item.title.trim() || config.title,
        artist: item.artist.trim(),
        subtitle: item.subtitle.trim() || null,
      })
    }
    setPackReviewItems(null)
    setShowPackSettings(true)
  }, [packEntries, usePackDifficultyTitles])

  const runPackConversion = useCallback(
    async (settings: {
      mode: string
      creator: string
      hp_drain: number
      overall_difficulty: number
      diff_name_template: string
    }) => {
      const indices = packConvertAllMode ? packEntries.map((_, i) => i) : [...packSelected]

      if (indices.length === 0) return
      setConverting(true)
      setError(null)
      try {
        const packFolderName = packFolder
          ? packFolder
              .split(/[/\\]+/)
              .filter(Boolean)
              .pop() || 'pack'
          : 'pack'
        const useOsz = settings.mode === 'osz'
        const replaySongConfigs = Array.from(packConfigsRef.current.entries()).map(([index, config]) => ({
          index,
          config: { ...config },
        }))

        if (!isTauri()) {
          // Web path: single .osz matching desktop pack output
          const JSZip = (await import('jszip')).default
          const zip = new JSZip()
          const { parseSmAll, parseFile } = await import('../services/convert')
          const addedMedia = new Set<string>()

          for (const idx of indices) {
            const entry = packEntries[idx]
            if (!entry) continue

            const savedCfg = packConfigsRef.current.get(idx)
            const baseCfg = normalizePackConfig(
              entry,
              packEntries,
              savedCfg || configFromEntry(entry, usePackDifficultyTitles),
              usePackDifficultyTitles,
            )
            const cfg = {
              ...baseCfg,
              output_format: 'folder' as const,
              creator: settings.creator || baseCfg.creator,
              hp_drain: settings.hp_drain,
              overall_difficulty: settings.overall_difficulty,
              diff_name_template: settings.diff_name_template || null,
            }

            if (packType === 'osu') {
              // Osu pack: each entry is a single .osu file, convert directly to .sm
              const bm = await parseFile(entry.source_file, 'osu-to-etterna')
              const parsedCfg = {
                ...cfg,
                ...normalizeParsedOsuPackMetadata(bm, packEntries, cfg),
              }
              const osuCfg = settings.diff_name_template
                ? {
                    ...parsedCfg,
                    difficulty_name: await expandDiffName(
                      settings.diff_name_template,
                      bm,
                      { ...parsedCfg, creator: bm.creator || parsedCfg.creator },
                      parsedCfg.conversion_rate,
                    ),
                  }
                : parsedCfg
              const safeTitle = (osuCfg.title || bm.difficulty_name || entry.title).replace(/[/\\?%*:|"<>]/g, '_') || `song_${idx}`
              const smContent = await convertBeatmap(bm, osuCfg)

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
              const safeTitle = (cfg.title || entry.title).replace(/[/\\?%*:|"<>]/g, '_') || `song_${idx}`
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
                bgOrig = await resolveMediaFile(entry.source_dir, '').then((r) => r?.split('/').pop() || null)
              }
              if (bgOrig) {
                const ext = bgOrig.split('.').pop() || 'jpg'
                renameMap.set(bgOrig, `${safeTitle}.${ext}`)
              }

              for (let bi = 0; bi < beatmaps.length; bi++) {
                const bm = beatmaps[bi]
                if (!bm) continue
                const bmCfg = settings.diff_name_template
                  ? {
                      ...cfg,
                      difficulty_name: await expandDiffName(
                        settings.diff_name_template,
                        bm,
                        { ...cfg, creator: bm.creator || cfg.creator },
                        cfg.conversion_rate,
                      ),
                    }
                  : cfg
                let content = await convertBeatmap(bm, bmCfg)
                // Fix hardcoded "bg.jpg" reference to the actual background filename
                for (const [orig, renamed] of renameMap) {
                  content = content.replaceAll(orig, renamed)
                }
                if (bgOrig && renameMap.get(bgOrig)) {
                  content = content.replaceAll('"bg.jpg"', `"${renameMap.get(bgOrig)}"`)
                }
                const safeDiff = (bmCfg.difficulty_name || bm.difficulty_name || '').replace(/[/\\?%*:|"<>]/g, '_')
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

          // Add cdtitle.png (default fallback) - only for osu→etterna (SM destination)
          if (packType === 'osu') {
            await addCdtitleToZip(zip, '', null, 'cdtitle.png')
          }

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
          const outputName = `${packFolderName}.osz`
          await saveBlobToFile(blob, outputName)
          useConversionLibraryStore.getState().remember({
            kind: 'pack',
            title: packFolderName,
            artist: '',
            creator: settings.creator,
            sourceName: packFolderName,
            sourceFormat: packType === 'osu' ? 'OsuMania' : 'Etterna',
            direction: packType === 'osu' ? 'osu-to-etterna' : 'etterna-to-osu',
            outputFormat: 'osz',
            outputNames: [outputName],
            outputPath: null,
            itemCount: indices.length,
            difficulty: null,
            sourcePath: packFolder,
            replay: {
              sourcePath: packFolder,
              config: null,
              difficultyIndices: null,
              separateSongs: null,
              packSettings: {
                mode: settings.mode as 'osz' | 'folder',
                creator: settings.creator,
                hp_drain: settings.hp_drain,
                overall_difficulty: settings.overall_difficulty,
                diff_name_template: settings.diff_name_template,
                indices: [...indices],
                songConfigs: replaySongConfigs,
              },
              skinOptions: null,
            },
          })
          setLastExportPath(outputName)
          setLastExportWasDirect(false)
          if (packType === 'osu') {
            trackEvent('songs_folder_conversion_completed', { count: String(indices.length), mode: 'osz' })
          } else {
            trackEvent('pack_conversion_completed', { count: String(indices.length), mode: 'osz' })
          }
        } else {
          // Tauri path
          const exportDir = await dialogOpenDirectory({
            title: useOsz ? t('dialogs.titleChooseOszFolder') : t('dialogs.titleExportFolder'),
          })
          if (!exportDir) {
            setConverting(false)
            return
          }

          const workDir = useOsz ? `${exportDir}/__henkan_pack_${packFolderName}` : `${exportDir}/${packFolderName}`

          await cleanDir(workDir)

          const allPaths: string[] = []

          for (const idx of indices) {
            const entry = packEntries[idx]
            if (!entry) continue
            const savedCfg = packConfigsRef.current.get(idx)
            const baseCfg = normalizePackConfig(
              entry,
              packEntries,
              savedCfg || configFromEntry(entry, usePackDifficultyTitles),
              usePackDifficultyTitles,
            )
            const cfg = {
              ...baseCfg,
              output_format: 'folder' as const,
              creator: settings.creator || baseCfg.creator,
              hp_drain: settings.hp_drain,
              overall_difficulty: settings.overall_difficulty,
              diff_name_template: settings.diff_name_template || null,
            }
            if (packType === 'osu') {
              // Osu pack: each entry is a single .osu file, convert directly to .sm
              const bm = await parseFile(entry.source_file, 'osu-to-etterna')
              const parsedCfg = {
                ...cfg,
                ...normalizeParsedOsuPackMetadata(bm, packEntries, cfg),
              }
              const osuCfg = settings.diff_name_template
                ? {
                    ...parsedCfg,
                    difficulty_name: await expandDiffName(
                      settings.diff_name_template,
                      bm,
                      { ...parsedCfg, creator: bm.creator || parsedCfg.creator },
                      parsedCfg.conversion_rate,
                    ),
                  }
                : parsedCfg
              const smContent = await convertBeatmap(bm, osuCfg)
              const result = await exportBeatmap(bm, osuCfg, smContent, workDir, bm.difficulty_name, false)
              allPaths.push(result)
            } else {
              const paths = await exportAllBeatmaps(entry.source_file, cfg, workDir, undefined, packFolderName)
              allPaths.push(...paths)
            }
          }

          if (packType !== 'osu') {
            const firstEntry = packEntries[indices[0]]
            const firstCfg = packConfigsRef.current.get(indices[0]) || configFromEntry(firstEntry, usePackDifficultyTitles)
            await createDummyDiff(packFolderName, settings.creator || firstCfg.creator, packBannerPath, workDir)
          }

          if (useOsz) {
            const oszPath = `${exportDir}/${packFolderName}.osz`
            await zipFolder(workDir, oszPath)
            useConversionLibraryStore.getState().remember({
              kind: 'pack',
              title: packFolderName,
              artist: '',
              creator: settings.creator,
              sourceName: packFolderName,
              sourceFormat: packType === 'osu' ? 'OsuMania' : 'Etterna',
              direction: packType === 'osu' ? 'osu-to-etterna' : 'etterna-to-osu',
              outputFormat: 'osz',
              outputNames: [oszPath],
              outputPath: oszPath,
              itemCount: indices.length,
              difficulty: null,
              sourcePath: packFolder,
              replay: {
                sourcePath: packFolder,
                config: null,
                difficultyIndices: null,
                separateSongs: null,
                packSettings: {
                  mode: settings.mode as 'osz' | 'folder',
                  creator: settings.creator,
                  hp_drain: settings.hp_drain,
                  overall_difficulty: settings.overall_difficulty,
                  diff_name_template: settings.diff_name_template,
                  indices: [...indices],
                  songConfigs: replaySongConfigs,
                },
                skinOptions: null,
              },
            })
            setLastExportPath(oszPath)
            setLastExportWasDirect(false)
            setExportPath(oszPath)
          } else {
            useConversionLibraryStore.getState().remember({
              kind: 'pack',
              title: packFolderName,
              artist: '',
              creator: settings.creator,
              sourceName: packFolderName,
              sourceFormat: packType === 'osu' ? 'OsuMania' : 'Etterna',
              direction: packType === 'osu' ? 'osu-to-etterna' : 'etterna-to-osu',
              outputFormat: 'folder',
              outputNames: allPaths,
              outputPath: exportDir,
              itemCount: indices.length,
              difficulty: null,
              sourcePath: packFolder,
              replay: {
                sourcePath: packFolder,
                config: null,
                difficultyIndices: null,
                separateSongs: null,
                packSettings: {
                  mode: settings.mode as 'osz' | 'folder',
                  creator: settings.creator,
                  hp_drain: settings.hp_drain,
                  overall_difficulty: settings.overall_difficulty,
                  diff_name_template: settings.diff_name_template,
                  indices: [...indices],
                  songConfigs: replaySongConfigs,
                },
                skinOptions: null,
              },
            })
            setLastExportPath(allPaths.join('\n'))
            setLastExportWasDirect(false)
            setExportPath(exportDir)
          }
          trackEvent('pack_conversion_completed', { count: String(indices.length), mode: settings.mode })
        }

      } catch (e: unknown) {
        const msg = typeof e === 'string' ? e : e instanceof Error ? e.message : t('converter.packConversionFailed')
        setError(msg)
        trackEvent('pack_conversion_failed', { error: msg })
      } finally {
        setConverting(false)
      }
    },
    [
      packEntries,
      packSelected,
      packConvertAllMode,
      packFolder,
      packBannerPath,
      packType,
      usePackDifficultyTitles,
      setConverting,
      setError,
      setExportPath,
      t,
    ],
  )

  const handlePackSettingsCancel = useCallback(() => {
    setShowPackSettings(false)
  }, [])

  const handleSelectDifficulty = useCallback(
    async (index: number) => {
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

        // Load media using config values - now correctly reflects user customizations
        // while falling back to the new difficulty's defaults for non-customized fields
        const cfg = useConverterStore.getState().config
        const result = await resolveBeatmapMedia(bm, {
          audioFilename: cfg.audio_filename || bm.audio_filename,
          backgroundFilename: cfg.background_filename || bm.background_filename,
          bannerFilename: cfg.banner_filename || bm.banner_filename,
          cdtitleFilename: cfg.cdtitle_filename || bm.cdtitle_filename,
          creator: cfg.creator || bm.creator,
          confirmFetch: requestMirrorFetch,
          onMirrorProgress: reportMirrorProgress,
        })
        audioFileRef.current = result.audioFile
        useConverterStore
          .getState()
          .setMediaUrls({
            audio: result.audio,
            background: result.background,
            banner: result.banner,
            cdtitle: result.cdtitle,
          })
      } catch (e: unknown) {
        setError(typeof e === 'string' ? e : e instanceof Error ? e.message : t('converter.failedToSelectDifficulty'))
      } finally {
        setSwitchingDifficulty(false)
      }
    },
    [beatmap, setError, queueActiveId, queueUpdateItem, requestMirrorFetch, reportMirrorProgress, t],
  )

  const handleChangeFile = useCallback(
    async (field: string, _current: string | null): Promise<void> => {
      try {
        const selected = await dialogOpenFiles({
          multiple: false,
          filters: [
            { name: t('dialogs.filterMediaFiles'), extensions: ['mp3', 'ogg', 'wav', 'jpg', 'jpeg', 'png', 'gif'] },
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
      } catch {
        /* ignore */
      }
    },
    [t],
  )

  const handleOpenInOsu = useCallback(async () => {
    const path = exportPath || lastExportPath
    if (!path) return
    try {
      await openFile(path)
    } catch {
      /* ignore */
    }
  }, [lastExportPath, exportPath])

  const handleReset = useCallback(async () => {
    await rememberLastOpenedBackground(useConverterStore.getState().mediaUrls.background)
    clearFileCache()
    queueClearAll()
    setDifficultySelection(null)
    reset()
    scrollAppToTop()
  }, [queueClearAll, rememberLastOpenedBackground, reset])

  const handleHome = useCallback(async () => {
    if (packFolder) await handlePackClose()
    else await handleReset()
    scrollAppToTop()
  }, [handlePackClose, handleReset, packFolder])

  const handleDismissExport = useCallback(() => {
    setLastExportPath(null)
  }, [])

  // Drag-and-drop
  const lastDropRef = useRef(0)
  // Latest-ref pattern: the callbacks change identity with queue state, and
  // re-registering the native drag-drop listener on every change is wasteful
  const dropHandlers = useRef({ setDragging, handleMainFilesSelected, handleOpenPack, routeSkinInput })
  useEffect(() => {
    dropHandlers.current = { setDragging, handleMainFilesSelected, handleOpenPack, routeSkinInput }
  })
  useEffect(() => {
    let unlisten: (() => void) | undefined
    let cancelled = false

    if (isTauri()) {
      import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) => {
          if (cancelled) return
          getCurrentWindow()
            .onDragDropEvent(async (evt) => {
              if (cancelled) return
              const { setDragging, handleMainFilesSelected, handleOpenPack, routeSkinInput } = dropHandlers.current
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
                  if (isSkinArchiveName(p) && (await routeSkinInput(p))) return
                  const ext = p.match(/\.[^.]+$/)?.[0]?.toLowerCase()
                  if (!ext || !ACCEPTED_EXTS.includes(ext)) {
                    if (folderPath === null) folderPath = p
                  } else {
                    files.push(p)
                  }
                }
                if (folderPath) {
                  const { isDir } = await import('../services/platform')
                  const isDirectory = await isDir(folderPath)
                  if (isDirectory) {
                    if (await isSkinFolderPath(folderPath)) {
                      const archive = await archiveSkinFolderPath(folderPath)
                      if (await routeSkinInput(archive)) return
                    }
                    handleOpenPack(folderPath)
                  } else {
                    // Non-directory, non-accepted file - just ignore or try to add it anyway
                    console.log('[drop] skipping non-directory, non-accepted path:', folderPath)
                  }
                }
                if (files.length > 0) handleMainFilesSelected(files)
              }
            })
            .then((fn) => {
              unlisten = fn
            })
        })
        .catch(() => {})
    }

    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [setDragging])

  const notes = beatmap?.notes
  const tapCount = useMemo(() => notes?.filter((n) => !n.hold).length ?? 0, [notes])
  const holdCount = useMemo(() => notes?.filter((n) => n.hold).length ?? 0, [notes])

  useEffect(() => {
    if (!beatmap && !packFolder && queueItems.length === 0 && !packLoading) {
      scrollAppToTop()
    }
  }, [beatmap, packFolder, packLoading, queueItems.length])

  return (
    <ErrorBoundary>
      <div
        className="min-h-screen w-full flex flex-col relative animate-app-entrance select-none hide-scrollbar"
        onContextMenu={(e) => e.preventDefault()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(e) => {
          e.preventDefault()
          setDragging(false)
        }}
        onDrop={async (e) => {
          e.preventDefault()
          setDragging(false)
          if (isTauri()) return
          const now = Date.now()
          if (now - lastDropRef.current < 500) return
          lastDropRef.current = now

          const items = Array.from(e.dataTransfer?.items || [])
          const dirEntry = items
            .map((item) => item.webkitGetAsEntry?.())
            .find((entry): entry is FileSystemDirectoryEntry => Boolean(entry?.isDirectory))
          if (dirEntry) {
            const realFiles = await readDroppedDirectory(dirEntry)
            if (!realFiles.length) return
            fileInputCache.length = 0
            fileInputCache.push(...realFiles)
            if (containsSkinMarker(realFiles)) {
              const archive = await archiveSkinFolderFiles(realFiles, dirEntry.name)
              if (await routeSkinInput(archive)) return
            }
            handleOpenPack(dirEntry.name)
            return
          }

          const files = Array.from(e.dataTransfer?.files || [])
          if (!files.length) return
          fileInputCache.push(...files)

          const skinArchive = files.find((file) => isSkinArchiveName(file.name))
          if (skinArchive) {
            if (await routeSkinInput(skinArchive)) return
            setError(t('converter.notReadableSkin'))
            return
          }

          // Detect folder drop
          const hasWebkitPath = files.some((f) => !!f.webkitRelativePath)
          if (hasWebkitPath) {
            const rootFolder = files[0].webkitRelativePath.split('/')[0]
            if (containsSkinMarker(files)) {
              const archive = await archiveSkinFolderFiles(files, rootFolder)
              if (await routeSkinInput(archive)) return
            }
            handleOpenPack(rootFolder)
            return
          }

          // Fallback heuristic: multiple .osu or .sm files = folder drop
          const osuFiles = files.filter((f) => f.name.toLowerCase().endsWith('.osu'))
          const smFiles = files.filter((f) => f.name.toLowerCase().endsWith('.sm'))
          const isFolderDrop = files.length > 1 && (osuFiles.length > 0 || smFiles.length > 0)

          if (isFolderDrop) {
            handleOpenPack('Dropped')
            return
          }

          // Single/multiple file drops - skip extensionless entries
          const knownExts = ['.sm', '.osu', '.osz']
          const seen = new Set<string>()
          const filePaths: string[] = []
          for (const f of files) {
            const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
            if (!knownExts.includes(ext)) continue
            const p = (f as FileWithPath).path || f.name
            if (seen.has(p)) continue
            seen.add(p)
            filePaths.push(p)
          }
          if (filePaths.length > 0) handleMainFilesSelected(filePaths)
        }}
      >
        <Header
          appVersion={appVersion}
          onHomeClick={handleHome}
          onShowVersionDialog={() => {
            setShowVersionDialog(true)
            setCheckResult(null)
          }}
        />

        <section
          ref={backgroundSectionRef}
          className="converter-first-screen relative flex min-h-0 w-full shrink-0 flex-col overflow-hidden"
        >
        <div
          ref={backgroundLayerRef}
          className="converter-background-parallax pointer-events-none absolute -inset-5 z-0 overflow-hidden"
        >
          {!menuBackgroundUrl && !liveBackgroundUrl && <div className="absolute inset-0 bg-surface-950" />}
          {menuBackgroundUrl ? (
            <div
              className="w-full h-full bg-cover bg-center animate-bg-fade-in"
              style={{
                backgroundImage: `url(${menuBackgroundUrl})`,
                filter: 'blur(22px) brightness(0.4) saturate(0.45)',
              }}
            />
          ) : (
            <OsuBackground url={liveBackgroundUrl} />
          )}
          {(menuBackgroundUrl || liveBackgroundUrl) && <div className="absolute inset-0 bg-surface-950/50" />}
        </div>
        {showFallingArrows && <FallingArrows />}

        <div className="relative z-10 flex min-h-[calc(100dvh-3.5625rem)] flex-1 flex-col">
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

          <main className="min-w-0 flex-1 flex flex-col items-center p-4 sm:p-6 gap-3 sm:gap-5">
            {packFolder && packEditing === null && (
              <PackBrowser
                entries={packEntries}
                useDifficultyTitles={usePackDifficultyTitles}
                selected={packSelected}
                onToggleSelect={(i) => {
                  setPackSelected((prev) => {
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
                    transition-all duration-75 mb-4 w-full justify-center"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  {t('converter.backToPack')}
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
                  diffNameTemplate={diffNameTemplate}
                  onUpdateConfig={(p) => useConverterStore.getState().updateConfig(p)}
                  onChangeFile={handleChangeFile}
                  onConvert={handleConvert}
                  directSaveLabel={directSaveLabel}
                  onDirectSave={directSaveLabel ? handleDirectSave : undefined}
                  onReset={handleReset}
                  onSelectDifficulty={handleSelectDifficulty}
                  selectedDifficultyIndices={selectedDifficultyIndices}
                  onToggleDifficulty={handleToggleDifficulty}
                  onSelectAllDifficulties={handleSelectAllDifficulties}
                  onDeselectAllDifficulties={handleDeselectAllDifficulties}
                  onUpdateDiffNameTemplate={setDiffNameTemplate}
                  onOpenPresetManager={() => setShowPresetManager(true)}
                />
              </div>
            )}

            {!packFolder && queueItems.length === 0 && !beatmap && !packLoading && (
              <div className="converter-home">
                <LiveMapStack items={livePromptItems} onPriorityChange={setLivePriorityId} />
                <div className="converter-home__import">
                  <DropZone dragging={dragging} onFilesSelected={handleMainFilesSelected} direction={direction} />
                  <div className="flex items-center gap-3 w-full max-w-md">
                    <div className="flex-1 h-px bg-white/5" />
                    <span className="text-[11px] text-surface-500 tracking-widest uppercase">{t('common.or')}</span>
                    <div className="flex-1 h-px bg-white/5" />
                  </div>
                  <button
                    onClick={() => setShowMirror(true)}
                    className="h-11 px-6 rounded-xl text-sm font-medium
                    bg-white/[0.04] border border-white/8 text-surface-400
                    hover:bg-white/[0.07] hover:text-surface-200
                    transition-all duration-75 flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                    {t('converter.searchBeatmaps')}
                  </button>
                  <button
                    onClick={() => handleOpenPack()}
                    className="h-11 px-6 rounded-xl text-sm font-medium
                    bg-white/[0.04] border border-white/8 text-surface-400
                    hover:bg-white/[0.07] hover:text-surface-200
                    transition-all duration-75"
                  >
                    {t('converter.openPackFolder')}
                  </button>
                  <Link
                    to="/skin-converter"
                    className="mt-2 text-xs text-surface-500 transition-colors duration-75 hover:text-surface-300"
                  >
                    {t('converter.convertSkinInstead')} →
                  </Link>
                </div>
              </div>
            )}

            {!packFolder && queueItems.length > 0 && (
              <div className="flex flex-col items-center w-full max-w-lg my-auto">
                {(() => {
                  const activeItem = queueItems.find((i) => i.id === queueActiveId)
                  if (queueLoading) {
                    return null
                  }
                  if (activeItem?.status === 'parsing') {
                    return null
                  }
                  if (activeItem?.status === 'error' && !activeItem.beatmap) {
                    return (
                      <div className="flex flex-col items-center gap-6 animate-fade-in my-auto">
                        <div className="text-center">
                          <p className="text-sm text-red-400 mb-1">
                            {t('converter.failedToLoadFile', { fileName: activeItem.fileName })}
                          </p>
                          <p className="text-xs text-surface-500">{activeItem.error}</p>
                        </div>
                        <DropZone dragging={dragging} onFilesSelected={handleMainFilesSelected} direction={direction} />
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
                        diffNameTemplate={diffNameTemplate}
                        onUpdateConfig={(p) => useConverterStore.getState().updateConfig(p)}
                        onChangeFile={handleChangeFile}
                        onConvert={handleConvert}
                        directSaveLabel={directSaveLabel}
                        onDirectSave={directSaveLabel ? handleDirectSave : undefined}
                        onReset={handleReset}
                        onSelectDifficulty={handleSelectDifficulty}
                        selectedDifficultyIndices={selectedDifficultyIndices}
                        onToggleDifficulty={handleToggleDifficulty}
                        onSelectAllDifficulties={handleSelectAllDifficulties}
                        onDeselectAllDifficulties={handleDeselectAllDifficulties}
                        onUpdateDiffNameTemplate={setDiffNameTemplate}
                        onOpenPresetManager={() => setShowPresetManager(true)}
                      />
                    )
                  }
                  return (
                    <div className="flex flex-col items-center gap-6 animate-fade-in my-auto">
                      <p className="text-sm text-surface-500">{t('converter.selectFileFromQueue')}</p>
                      <DropZone dragging={dragging} onFilesSelected={handleMainFilesSelected} direction={direction} />
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
                  diffNameTemplate={diffNameTemplate}
                  onUpdateConfig={(p) => useConverterStore.getState().updateConfig(p)}
                  onChangeFile={handleChangeFile}
                  onConvert={handleConvert}
                  directSaveLabel={directSaveLabel}
                  onDirectSave={directSaveLabel ? handleDirectSave : undefined}
                  onReset={handleReset}
                  onSelectDifficulty={handleSelectDifficulty}
                  selectedDifficultyIndices={selectedDifficultyIndices}
                  onToggleDifficulty={handleToggleDifficulty}
                  onSelectAllDifficulties={handleSelectAllDifficulties}
                  onDeselectAllDifficulties={handleDeselectAllDifficulties}
                  onUpdateDiffNameTemplate={setDiffNameTemplate}
                  onOpenPresetManager={() => setShowPresetManager(true)}
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
            <AudioPlayer
              audioPlayerRef={audioPlayerRef}
              audioPlaying={audioPlaying}
              audioDuration={audioDuration}
              previewTime={beatmap.preview_time}
              onOpenPreview={() => setShowPreview(true)}
            />
          )}

          {!beatmap && !packFolder && (
            <footer className="relative z-20 shrink-0 bg-gradient-to-t from-surface-950 via-surface-950/95 to-transparent px-4 pb-2 pt-5 text-center text-[10px] text-surface-500 sm:px-6 sm:pb-3 sm:text-xs">
              © {new Date().getFullYear()} {t('converter.madeBy')}{' '}
              <a
                href="https://github.com/kaanreal"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-muted hover:text-accent transition-colors"
              >
                Kaan
              </a>{' '}
              &#x2764;
            </footer>
          )}
        </div>

        </section>

        {!beatmap && !packFolder && queueItems.length === 0 && !packLoading && <HomeReveal />}

        {/* Preview overlay */}
        {showPreview && beatmap && mediaUrls.audio && (
          <div>
            <PreviewOverlay
              audioPlayerRef={audioPlayerRef}
              playing={audioPlaying}
              duration={audioDuration}
              notes={beatmap.notes}
              keys={beatmap.keys}
              bpm={Math.round(60000 / (beatmap.timing_points.find((tp) => tp.uninherited)?.beat_length ?? 600))}
              backgroundUrl={mediaUrls.background}
              previewTime={beatmap.preview_time}
              sourceFormat={beatmap.source_format}
              onSetPreviewTime={handleSetPreviewTime}
              onClose={() => setShowPreview(false)}
            />
          </div>
        )}

        {/* Bulk convert dialog */}
        {direction === 'etterna-to-osu' && (
          <BulkConvertDialog open={showBulkConvert} onCancel={() => setShowBulkConvert(false)} />
        )}

        {/* Mirror download confirmation */}
        {mirrorFetchRequest && (
          <MirrorDownloadWarning
            title={mirrorFetchRequest.title}
            artist={mirrorFetchRequest.artist}
            progress={mirrorProgress}
            unmatched={mirrorFetchRequest.unmatched}
            onConfirm={() => {
              mirrorFetchRequest.resolve(true)
            }}
            onCancel={() => {
              mirrorFetchRequest.resolve(false)
              setMirrorFetchRequest(null)
              setMirrorProgress(null)
            }}
          />
        )}

        {/* Pack settings dialog */}
        {packReviewItems && (
          <PackReviewDialog
            items={packReviewItems}
            onConfirm={handlePackReviewConfirm}
            onCancel={() => setPackReviewItems(null)}
          />
        )}

        <PackSettingsDialog
          open={showPackSettings}
          packName={
            packFolder
              ? packFolder
                  .split(/[/\\]+/)
                  .filter(Boolean)
                  .pop() || 'pack'
              : 'pack'
          }
          isConverting={isConverting}
          defaultSettings={{
            ...(reconvertPackSettings || {
              mode: 'osz' as const,
              creator: useConverterStore.getState().config.creator,
              hp_drain: useConverterStore.getState().config.hp_drain,
              overall_difficulty: useConverterStore.getState().config.overall_difficulty,
              diff_name_template: diffNameTemplate,
            }),
          }}
          onConfirm={(settings) => {
            setReconvertPackSettings(null)
            setShowPackSettings(false)
            runPackConversion(settings)
          }}
          onCancel={handlePackSettingsCancel}
          onOpenPresetManager={() => setShowPresetManager(true)}
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
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setShowVersionDialog(false)}
          >
            <div
              className="bg-surface-900 border border-surface-700/50 rounded-2xl shadow-2xl max-w-sm w-full mx-4 animate-scale-in p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 mb-4">
                <img src="/logo.png" alt="Henkan" className="w-10 h-10 rounded-xl" />
                <div>
                  <h2 className="text-lg font-semibold text-surface-100">Henkan</h2>
                  <p className="text-sm text-surface-400 font-mono">v{appVersion || '-'}</p>
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
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        {t('converter.checking')}
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                          />
                        </svg>
                        {t('converter.checkForUpdates')}
                      </>
                    )}
                  </button>
                )}

                {checkResult === 'up-to-date' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-400 text-xs font-medium">
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {t('converter.upToDate')}
                  </div>
                )}

                {checkResult === 'error' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 text-red-400 text-xs font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {t('converter.updateCheckFailed')}
                  </div>
                )}

                {checkResult === 'update-found' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/10 text-accent text-xs font-medium">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    {t('converter.newVersionAvailable')}
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowVersionDialog(false)}
                className="w-full px-4 py-2 rounded-xl bg-surface-800 border border-surface-700/40 text-surface-400 font-medium text-sm hover:bg-surface-700 hover:text-surface-200 transition-all duration-75"
              >
                {t('common.close')}
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

        {/* Diff preset manager dialog */}
        <DiffPresetManager
          open={showPresetManager}
          beatmap={beatmap}
          config={config}
          onClose={() => setShowPresetManager(false)}
        />

        {/* Post-export overlay */}
        {lastExportPath && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in">
            <div className="bg-surface-900 border border-surface-700/50 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 animate-scale-in">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <svg
                    className="w-8 h-8 text-emerald-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-xl font-semibold text-surface-100 mb-1">{t('converter.exportComplete')}</h2>
                <div className="text-xs text-surface-400 mb-6 space-y-1 max-h-24 overflow-y-auto custom-scrollbar">
                  {lastExportPath.split('\n').map((p, i) => (
                    <p key={i} className="break-all">
                      {p}
                    </p>
                  ))}
                </div>
                <div className="flex gap-3 justify-center">
                  {isTauri() && (
                    <button
                      onClick={handleOpenInOsu}
                      className="px-6 py-2.5 rounded-xl bg-accent text-white font-medium text-sm
                                 hover:bg-accent-hover active:scale-[0.97] transition-all duration-75"
                    >
                      {!lastExportWasDirect && direction === 'etterna-to-osu'
                        ? t('converter.openInOsu')
                        : t('converter.showInExplorer')}
                    </button>
                  )}
                  <button
                    onClick={handleDismissExport}
                    className="px-6 py-2.5 rounded-xl bg-surface-800 border border-surface-700/40 text-surface-400 font-medium text-sm
                               hover:bg-surface-700 hover:text-surface-200 transition-all duration-75"
                  >
                    {t('common.done')}
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

      {showGameIntegrationPrompt && installations && (
        <GameIntegrationPrompt
          installations={installations}
          onConfirm={enableGameIntegrations}
          onLater={skipGameIntegrations}
        />
      )}

      <LoadingScreen
        show={isConverting || switchingDifficulty || audioLoading || packLoading || queueLoading || queueItems.some(item => item.status === 'parsing')}
        label={
          isConverting
            ? t('common.converting')
            : packLoading
              ? t('converter.scanningPack')
              : t('common.loading')
        }
        detail={
          switchingDifficulty
            ? beatmap?.difficulty_name
            : queueItems.find(item => item.status === 'parsing')?.fileName
        }
      />
    </ErrorBoundary>
  )
}
