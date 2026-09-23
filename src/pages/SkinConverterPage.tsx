import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Helmet } from 'react-helmet-async'
import { t, useT } from '../i18n'
import { Header } from '../components/Header'
import { LoadingScreen } from '../components/LoadingScreen'
import { trackEvent } from '../services/analytics'
import { openFiles, saveFile } from '../services/dialogs'
import { isTauri } from '../services/environment'
import { fileInputCache } from '../services/fileCache'
import { saveBlobToFile } from '../services/files'
import { useConversionLibraryStore } from '../stores/useConversionLibraryStore'
import { consumePendingConversionReplay, type ConversionReplay } from '../services/conversionLibrary'
import {
  archiveSkinFolderFiles,
  archiveSkinFolderPath,
  consumePendingSkinInput,
  containsSkinMarker,
  isSkinFolderPath,
  readDroppedDirectory,
  type SkinInput,
} from '../services/skinInput'
import {
  buildSkinPreview,
  convertSkinArchive,
  DEFAULT_OSU_COLUMN_WIDTH,
  DEFAULT_OSU_HIT_POSITION,
  detectSkinArchive,
  MAX_OSU_COLUMN_WIDTH,
  MAX_OSU_HIT_POSITION,
  MIN_OSU_COLUMN_WIDTH,
  MIN_OSU_HIT_POSITION,
} from '../services/skinConverter'
import { resolvePreviewEventWindow } from '../services/skinPreviewTiming'
import type { SkinDirection, SkinInspection, SkinPreview } from '../types/skin'

type SkinPreviewUrls = {
  lanes: Array<Record<'note' | 'holdHead' | 'holdBody' | 'holdTail' | 'receptor', string>>
  hitPosition?: number
  columnWidth?: number
}

type PreviewEvent = {
  id: string
  lane: number
  kind: 'tap' | 'hold'
  timeMs: number
  holdEndMs?: number
}

const SKIN_PREVIEW_CYCLE_MS = 12000
const SKIN_PREVIEW_LOOK_AHEAD_MS = 500
const SKIN_PREVIEW_SCROLL_H_RATIO = 1.25
const SKIN_PREVIEW_BAR_H_RATIO = 0.3

function previewObjectUrls(preview: SkinPreview): SkinPreviewUrls {
  return {
    hitPosition: preview.hitPosition,
    columnWidth: preview.columnWidth,
    lanes: preview.lanes.map((lane) => ({
      note: URL.createObjectURL(lane.note.blob),
      holdHead: URL.createObjectURL(lane.holdHead.blob),
      holdBody: URL.createObjectURL(lane.holdBody.blob),
      holdTail: URL.createObjectURL(lane.holdTail.blob),
      receptor: URL.createObjectURL(lane.receptor.blob),
    })),
  }
}

function revokePreviewObjectUrls(preview: SkinPreviewUrls | null): void {
  if (!preview) return
  for (const lane of preview.lanes) Object.values(lane).forEach((url) => URL.revokeObjectURL(url))
}

function fileLabel(input: SkinInput): string {
  return input instanceof File ? input.name : input.split(/[/\\]+/).pop() || input
}

function ArchiveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-7 h-7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 5.25A2.25 2.25 0 0 1 6.75 3h6.69a2.25 2.25 0 0 1 1.59.66l3.31 3.31A2.25 2.25 0 0 1 19 8.56v10.69a1.75 1.75 0 0 1-1.75 1.75H6.75A2.25 2.25 0 0 1 4.5 18.75V5.25Z" />
      <path strokeLinecap="round" d="M9 3v2m0 2v2m0 2v2m0 2v2" />
    </svg>
  )
}

async function persistArchive(blob: Blob, filename: string): Promise<string | null> {
  if (!isTauri()) {
    await saveBlobToFile(blob, filename)
    return filename
  }
  const path = await saveFile({
    title: t('skinConverter.saveConvertedSkin'),
    defaultPath: filename,
    filters: [{ name: filename.endsWith('.osk') ? t('skinConverter.filterOsuSkin') : t('skinConverter.filterEtternaSkin'), extensions: [filename.endsWith('.osk') ? 'osk' : 'zip'] }],
  })
  if (!path) return null
  const { invoke } = await import('@tauri-apps/api/core')
  await invoke('write_file_bytes', { path, content: Array.from(new Uint8Array(await blob.arrayBuffer())) })
  return path
}

export function SkinConverterPage() {
  const t = useT()
  const [direction, setDirection] = useState<SkinDirection | null>(null)
  const [input, setInput] = useState<SkinInput | null>(null)
  const [inspection, setInspection] = useState<SkinInspection | null>(null)
  const [previewUrls, setPreviewUrls] = useState<SkinPreviewUrls | null>(null)
  const [hitPosition, setHitPosition] = useState(DEFAULT_OSU_HIT_POSITION)
  const [columnWidth, setColumnWidth] = useState(DEFAULT_OSU_COLUMN_WIDTH)
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState<'idle' | 'inspecting' | 'converting' | 'complete'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [previewEvents, setPreviewEvents] = useState<PreviewEvent[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const previewStageRef = useRef<HTMLDivElement>(null)
  const previewUrlsRef = useRef<SkinPreviewUrls | null>(null)
  const selectedInputRef = useRef<SkinInput | null>(null)
  const previewEventElementsRef = useRef(new Map<string, HTMLElement>())

  const registerPreviewEventElement = useCallback((id: string, element: HTMLElement | null) => {
    if (element) previewEventElementsRef.current.set(id, element)
    else previewEventElementsRef.current.delete(id)
  }, [])

  const replacePreview = useCallback((nextPreview: SkinPreview | null) => {
    revokePreviewObjectUrls(previewUrlsRef.current)
    const nextUrls = nextPreview ? previewObjectUrls(nextPreview) : null
    previewUrlsRef.current = nextUrls
    setPreviewUrls(nextUrls)
  }, [])

  const loadInput = useCallback(async (nextInput: SkinInput, replayOptions?: ConversionReplay['skinOptions']) => {
    selectedInputRef.current = nextInput
    setInput(nextInput)
    setDirection(null)
    setInspection(null)
    replacePreview(null)
    setHitPosition(replayOptions?.hitPosition ?? DEFAULT_OSU_HIT_POSITION)
    setColumnWidth(replayOptions?.columnWidth ?? DEFAULT_OSU_COLUMN_WIDTH)
    setError(null)
    setStatus('inspecting')
    try {
      const detected = await detectSkinArchive(nextInput)
      if (selectedInputRef.current !== nextInput) return
      setDirection(detected.direction)
      setInspection(detected.inspection)
      const nextPreview = await buildSkinPreview(nextInput, detected.direction).catch(() => null)
      if (selectedInputRef.current === nextInput) replacePreview(nextPreview)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('skinConverter.inspectFailed'))
    } finally {
      setStatus('idle')
    }
  }, [replacePreview, t])

  const chooseArchive = useCallback(async () => {
    try {
      const selected = await openFiles({ filters: [{ name: t('skinConverter.filterSkinArchives'), extensions: ['osk', 'zip'] }] })
      if (!selected?.[0]) return
      const selectedName = selected[0].split(/[/\\]+/).pop()
      const cached = [...fileInputCache].reverse().find((file) => file.name === selectedName || file.webkitRelativePath === selected[0])
      await loadInput(cached || selected[0])
    } catch {
      inputRef.current?.click()
    }
  }, [loadInput, t])

  const loadFolderFiles = useCallback(async (files: File[], folderName: string) => {
    if (!containsSkinMarker(files)) {
      setError(t('skinConverter.notSkinFolder'))
      return
    }
    fileInputCache.length = 0
    fileInputCache.push(...files)
    await loadInput(await archiveSkinFolderFiles(files, folderName))
  }, [loadInput, t])

  const reset = useCallback(() => {
    selectedInputRef.current = null
    setDirection(null)
    setInput(null)
    setInspection(null)
    replacePreview(null)
    setHitPosition(DEFAULT_OSU_HIT_POSITION)
    setColumnWidth(DEFAULT_OSU_COLUMN_WIDTH)
    setError(null)
    setStatus('idle')
    if (inputRef.current) inputRef.current.value = ''
  }, [replacePreview])

  const convert = useCallback(async () => {
    if (!input || !inspection || !direction || (status !== 'idle' && status !== 'complete')) return
    setStatus('converting')
    setError(null)
    try {
      const result = await convertSkinArchive(input, direction, { hitPosition, columnWidth })
      const saved = await persistArchive(result.blob, result.filename)
      setInspection(result.inspection)
      setStatus(saved ? 'complete' : 'idle')
      if (saved) {
        useConversionLibraryStore.getState().remember({
          kind: 'skin',
          title: result.inspection.name,
          artist: '',
          creator: '',
          sourceName: fileLabel(input),
          sourceFormat: null,
          direction,
          outputFormat: result.filename.split('.').pop() || 'archive',
          outputNames: [result.filename],
          outputPath: isTauri() ? saved : null,
          itemCount: 1,
          difficulty: null,
          sourcePath: typeof input === 'string' ? input : null,
          replay: {
            sourcePath: typeof input === 'string' ? input : null,
            config: null,
            difficultyIndices: null,
            separateSongs: null,
            packSettings: null,
            skinOptions: { hitPosition, columnWidth },
          },
        })
        void trackEvent('skin_conversion_completed', { direction })
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('skinConverter.convertFailed'))
      setStatus('idle')
      void trackEvent('skin_conversion_failed', { direction })
    }
  }, [columnWidth, direction, hitPosition, input, inspection, status, t])

  useEffect(() => {
    return () => revokePreviewObjectUrls(previewUrlsRef.current)
  }, [])

  useEffect(() => {
    const pendingReplay = consumePendingConversionReplay()
    if (pendingReplay) {
      if (pendingReplay.kind === 'skin') {
        queueMicrotask(() => void loadInput(pendingReplay.sourcePath, pendingReplay.replay.skinOptions))
      }
      return
    }
    const pending = consumePendingSkinInput()
    if (pending) queueMicrotask(() => void loadInput(pending))
  }, [loadInput, t])

  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    let cancelled = false
    import('@tauri-apps/api/webview').then(({ getCurrentWebview }) => {
      getCurrentWebview().onDragDropEvent(async (event) => {
        if (event.payload.type === 'over') setDragging(true)
        if (event.payload.type === 'leave') setDragging(false)
        if (event.payload.type === 'drop') {
          setDragging(false)
          const path = event.payload.paths.find((candidate) => /\.(osk|zip)$/i.test(candidate))
          if (path) {
            await loadInput(path)
            return
          }
          const folder = event.payload.paths[0]
          if (folder && await isSkinFolderPath(folder)) {
            await loadInput(await archiveSkinFolderPath(folder))
          }
        }
      }).then((cleanup) => {
        if (cancelled) cleanup()
        else unlisten = cleanup
      })
    }).catch(() => {})
    return () => {
      cancelled = true
      unlisten?.()
    }
  }, [loadInput, t])

  useEffect(() => {
    let cancelled = false
    previewEventElementsRef.current.clear()

    if (!previewUrls) {
      window.setTimeout(() => {
        if (!cancelled) setPreviewEvents([])
      }, 0)
      return () => { cancelled = true }
    }

    const events: PreviewEvent[] = []
    for (let lane = 0; lane < 4; lane++) {
      let timeMs = 400 + Math.random() * 500
      let eventIndex = 0
      while (timeMs < SKIN_PREVIEW_CYCLE_MS - 1800) {
        const kind = eventIndex === 0 || Math.random() < 0.28 ? 'hold' : 'tap'
        const holdLength = kind === 'hold' ? 700 + Math.random() * 900 : 0
        events.push({
          id: `preview-${lane}-${eventIndex}`,
          lane,
          kind,
          timeMs,
          holdEndMs: kind === 'hold' ? timeMs + holdLength : undefined,
        })
        timeMs += holdLength + 500 + Math.random() * 650
        eventIndex++
    }
    }
    const updateTimer = window.setTimeout(() => {
      if (!cancelled) setPreviewEvents(events)
    }, 0)
    return () => {
      cancelled = true
      window.clearTimeout(updateTimer)
    }
  }, [previewUrls])

  const mapped = inspection?.mappings.filter((item) => item.status === 'mapped').length || 0
  const fallbacks = inspection?.mappings.filter((item) => item.status === 'fallback').length || 0
  const missing = inspection?.mappings.filter((item) => item.status === 'missing').length || 0
  const outputLabel = direction === 'osu-to-etterna' ? t('skinConverter.outputEtterna') : t('skinConverter.outputOsu')
  const previewHitPosition = direction === 'etterna-to-osu'
    ? hitPosition
    : previewUrls?.hitPosition || DEFAULT_OSU_HIT_POSITION
  const previewColumnWidth = direction === 'etterna-to-osu'
    ? columnWidth
    : previewUrls?.columnWidth || DEFAULT_OSU_COLUMN_WIDTH
  const previewStyle = {
    '--hit-y': `${previewHitPosition / 480 * 100}%`,
    '--column-scale': previewColumnWidth / DEFAULT_OSU_COLUMN_WIDTH,
  } as CSSProperties

  useEffect(() => {
    if (!previewUrls || !previewEvents.length) return
    const startedAt = performance.now()
    let frame = 0

    const update = () => {
      const stage = previewStageRef.current
      if (!stage) {
        frame = requestAnimationFrame(update)
        return
      }
      const stageWidth = stage.clientWidth
      const stageHeight = stage.clientHeight
      const hitY = stageHeight * (previewHitPosition / 480)
      const columnWidth = stageWidth / 4
      const barHeight = columnWidth * SKIN_PREVIEW_BAR_H_RATIO
      const scrollHeight = Math.max(
        Math.min(stageHeight * SKIN_PREVIEW_SCROLL_H_RATIO, stageWidth * 1.8),
        hitY + barHeight,
      )
      const elapsedMs = performance.now() - startedAt

      for (const event of previewEvents) {
        const root = previewEventElementsRef.current.get(event.id)
        if (!root) continue
        const { headDelta, tailDelta } = resolvePreviewEventWindow(
          event.timeMs,
          event.holdEndMs,
          elapsedMs,
          SKIN_PREVIEW_CYCLE_MS,
          SKIN_PREVIEW_LOOK_AHEAD_MS,
        )
        const headY = hitY - (headDelta / SKIN_PREVIEW_LOOK_AHEAD_MS) * scrollHeight

        if (event.kind === 'tap') {
          root.style.top = `${headY}px`
          root.style.opacity = headDelta >= 0 && headDelta <= SKIN_PREVIEW_LOOK_AHEAD_MS ? '1' : '0'
          continue
        }

        const tailY = hitY - (tailDelta / SKIN_PREVIEW_LOOK_AHEAD_MS) * scrollHeight
        const bodyTop = Math.max(0, Math.min(headY, tailY))
        const bodyBottom = Math.min(hitY, Math.max(headY, tailY))
        const bodyHeight = Math.max(0, bodyBottom - bodyTop)
        const head = root.querySelector<HTMLElement>('[data-preview-part="head"]')
        const body = root.querySelector<HTMLElement>('[data-preview-part="body"]')
        const tail = root.querySelector<HTMLElement>('[data-preview-part="tail"]')
        root.style.opacity = tailDelta >= 0 && headDelta <= SKIN_PREVIEW_LOOK_AHEAD_MS && bodyHeight > 0 ? '1' : '0'
        body?.style.setProperty('--hold-body-top', `${bodyTop}px`)
        body?.style.setProperty('--hold-body-height', `${bodyHeight}px`)
        if (head) {
          head.style.top = `${headY}px`
          head.style.opacity = headDelta >= 0 && headDelta <= SKIN_PREVIEW_LOOK_AHEAD_MS ? '1' : '0'
        }
        if (tail) {
          tail.style.top = `${tailY}px`
          tail.style.opacity = tailDelta >= 0 && tailDelta <= SKIN_PREVIEW_LOOK_AHEAD_MS ? '1' : '0'
        }
      }
      frame = requestAnimationFrame(update)
    }

    frame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frame)
  }, [previewColumnWidth, previewEvents, previewHitPosition, previewUrls])

  return (
    <div className="skin-page h-full flex flex-col bg-surface-950 text-surface-100 overflow-hidden">
      <Helmet>
        <title>{t('skinConverter.seoTitle')}</title>
        <meta name="description" content={t('skinConverter.seoDescription')} />
      </Helmet>
      <Header
        appVersion={import.meta.env.VITE_APP_VERSION || null}
      />

      <main className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-6 sm:py-8">
        <section className="w-full max-w-xl mx-auto animate-fade-in" aria-labelledby="skin-converter-title">
          <div className="mb-5">
            <h1 id="skin-converter-title" className="text-lg font-semibold tracking-tight">{t('skinConverter.title')}</h1>
            <p className="mt-1 text-sm text-surface-500">{t('skinConverter.subtitle')}</p>
          </div>

          <button
            type="button"
            data-henkan-control
            className={`skin-drop w-full min-h-40 rounded-2xl border-2 border-dashed px-5 py-6 flex items-center justify-center gap-4 text-left transition-colors duration-75 ${dragging ? 'border-accent bg-accent/5' : input ? 'border-white/10 bg-white/[0.04]' : 'border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'}`}
            onClick={chooseArchive}
            onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault()
              setDragging(false)
              const directory = Array.from(event.dataTransfer.items)
                .map((item) => item.webkitGetAsEntry?.())
                .find((entry): entry is FileSystemDirectoryEntry => Boolean(entry?.isDirectory))
              if (directory) {
                void readDroppedDirectory(directory).then((files) => loadFolderFiles(files, directory.name))
                return
              }
              const file = Array.from(event.dataTransfer.files).find((candidate) => /\.(osk|zip)$/i.test(candidate.name))
              if (file) void loadInput(file)
            }}
            aria-busy={status === 'inspecting'}
          >
            <span className="w-12 h-12 rounded-xl bg-white/[0.05] text-surface-400 grid place-items-center shrink-0"><ArchiveIcon /></span>
            <span className="min-w-0 flex flex-col gap-1">
              <strong className="text-sm text-surface-200 break-all">{status === 'inspecting' ? t('skinConverter.readingArchive') : input ? fileLabel(input) : t('skinConverter.dropArchive')}</strong>
              <span className="text-xs text-surface-500">{input ? t('skinConverter.chooseAnother') : t('skinConverter.dropHint')}</span>
            </span>
          </button>
          <input
            ref={inputRef}
            className="sr-only"
            type="file"
            accept=".osk,.zip"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void loadInput(file)
            }}
          />

          <p className="mt-3 text-xs leading-5 text-surface-600">
            {!direction
              ? t('skinConverter.formatHint')
              : direction === 'osu-to-etterna'
              ? t('skinConverter.osuHint')
              : t('skinConverter.etternaHint')}
          </p>

          {error && (
            <div className="skin-error mt-5 rounded-xl border border-red-800/50 bg-red-900/30 px-4 py-3" role="alert">
              <strong className="text-sm text-red-300">{t('skinConverter.errorTitle')}</strong>
              <p className="mt-1 text-xs leading-5 text-red-300/80">{error}</p>
            </div>
          )}

          {inspection && (
            <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.025] overflow-hidden" aria-live="polite">
              <div className="px-4 py-3 flex items-center justify-between gap-4 border-b border-white/5">
                <div className="min-w-0">
                  <h2 className="text-sm font-medium text-surface-200 truncate">{inspection.name}</h2>
                  <p className="mt-0.5 text-[11px] text-surface-500">{t('skinConverter.fileCount', { count: inspection.fileCount.toLocaleString() })} · {outputLabel}</p>
                </div>
                <button type="button" onClick={reset} className="text-xs text-surface-500 hover:text-surface-300">{t('skinConverter.remove')}</button>
              </div>

              {previewUrls && (
                <div className="skin-preview px-4 py-4 border-b border-white/5">
                  <div className="skin-preview__header">
                    <div>
                      <h3 className="text-xs font-medium text-surface-300">{t('skinConverter.gameplayPreview')}</h3>
                      <p className="mt-0.5 text-[11px] text-surface-600">{t('skinConverter.notesFall')}</p>
                    </div>
                    {direction === 'etterna-to-osu' && (
                      <div className="flex items-center gap-2">
                        <label className="skin-hit-position">
                          <span>{t('skinConverter.hitPosition')}</span>
                          <input
                            type="number"
                              min={MIN_OSU_HIT_POSITION}
                              max={MAX_OSU_HIT_POSITION}
                            value={hitPosition}
                            onChange={(event) => {
                              const value = Number(event.target.value)
                              if (Number.isFinite(value)) setHitPosition(Math.max(MIN_OSU_HIT_POSITION, Math.min(MAX_OSU_HIT_POSITION, Math.round(value))))
                            }}
                            aria-label={t('skinConverter.hitPositionValueAria')}
                          />
                        </label>
                        <label className="skin-hit-position">
                          <span>{t('skinConverter.columnWidth')}</span>
                          <input
                            type="number"
                            min={MIN_OSU_COLUMN_WIDTH}
                            max={MAX_OSU_COLUMN_WIDTH}
                            value={columnWidth}
                            onChange={(event) => {
                              const value = Number(event.target.value)
                              if (Number.isFinite(value)) setColumnWidth(Math.max(MIN_OSU_COLUMN_WIDTH, Math.min(MAX_OSU_COLUMN_WIDTH, Math.round(value))))
                            }}
                            aria-label={t('skinConverter.columnWidthValueAria')}
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  <div
                    className="skin-preview__stage"
                    ref={previewStageRef}
                    style={previewStyle}
                    data-hit-position={previewHitPosition}
                    data-column-width={previewColumnWidth}
                    aria-label={t('skinConverter.previewAria', { position: previewHitPosition })}
                  >
                    {previewUrls.lanes.map((lane, index) => (
                      <div className="skin-preview__lane" key={index}>
                        {previewEvents.filter((event) => event.lane === index).map((event) => event.kind === 'hold' ? (
                          <div
                            className="skin-preview__hold"
                            key={event.id}
                            ref={(element) => registerPreviewEventElement(event.id, element)}
                            aria-hidden="true"
                          >
                            <img src={lane.holdTail} data-preview-part="tail" className="skin-preview__hold-tail" alt="" draggable="false" />
                            <img src={lane.holdBody} data-preview-part="body" className="skin-preview__hold-body" alt="" draggable="false" />
                            <img src={lane.holdHead} data-preview-part="head" className="skin-preview__hold-head" alt="" draggable="false" />
                          </div>
                        ) : (
                          <img
                            key={event.id}
                            ref={(element) => registerPreviewEventElement(event.id, element)}
                            src={lane.note}
                            className="skin-preview__note"
                            alt=""
                            draggable="false"
                            aria-hidden="true"
                          />
                        ))}
                        <img src={lane.receptor} className="skin-preview__receptor" alt="" draggable="false" aria-hidden="true" />
                      </div>
                    ))}
                  </div>

                  {direction === 'etterna-to-osu' && (
                    <div className="space-y-2">
                      <div className="skin-hit-slider">
                        <span aria-hidden="true">{MIN_OSU_HIT_POSITION}</span>
                        <input
                          type="range"
                          min={MIN_OSU_HIT_POSITION}
                          max={MAX_OSU_HIT_POSITION}
                          step="1"
                          value={hitPosition}
                          onChange={(event) => setHitPosition(Number(event.target.value))}
                          aria-label={t('skinConverter.adjustHitPositionAria')}
                          data-hit-position-input
                        />
                        <span aria-hidden="true">{MAX_OSU_HIT_POSITION}</span>
                        {hitPosition !== DEFAULT_OSU_HIT_POSITION && (
                          <button type="button" onClick={() => setHitPosition(DEFAULT_OSU_HIT_POSITION)}>{t('skinConverter.resetTo', { value: 420 })}</button>
                        )}
                      </div>
                      <div className="skin-hit-slider">
                        <span aria-hidden="true">{MIN_OSU_COLUMN_WIDTH}</span>
                        <input
                          type="range"
                          min={MIN_OSU_COLUMN_WIDTH}
                          max={MAX_OSU_COLUMN_WIDTH}
                          step="1"
                          value={columnWidth}
                          onChange={(event) => setColumnWidth(Number(event.target.value))}
                          aria-label={t('skinConverter.adjustColumnWidthAria')}
                          data-column-width-input
                        />
                        <span aria-hidden="true">{MAX_OSU_COLUMN_WIDTH}</span>
                        {columnWidth !== DEFAULT_OSU_COLUMN_WIDTH && (
                          <button type="button" onClick={() => setColumnWidth(DEFAULT_OSU_COLUMN_WIDTH)}>{t('skinConverter.resetTo', { value: 70 })}</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="skin-report__summary px-4 py-2.5 flex items-center gap-4 text-[11px] text-surface-500 border-b border-white/5">
                <span><strong className="text-emerald-400 font-medium">{mapped}</strong> {t('skinConverter.mapped')}</span>
                <span><strong className="text-amber-400 font-medium">{fallbacks}</strong> {t('skinConverter.fallback')}</span>
                <span><strong className={missing ? 'text-red-400 font-medium' : 'text-surface-400 font-medium'}>{missing}</strong> {t('skinConverter.missing')}</span>
              </div>

              <div className="max-h-56 overflow-y-auto custom-scrollbar">
                {inspection.mappings.map((item) => (
                  <div key={item.target} className="grid grid-cols-[8px_minmax(7rem,1fr)_minmax(5rem,.8fr)] items-center gap-2 min-h-9 px-4 border-b border-white/5 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full ${item.status === 'mapped' ? 'bg-emerald-400' : item.status === 'fallback' ? 'bg-amber-400' : 'bg-red-400'}`} aria-label={item.status} />
                    <span className="text-surface-300 truncate">{item.target}</span>
                    <span className="text-surface-600 truncate text-right" title={item.source || t('skinConverter.generatedFallback')}>{item.source?.split('/').pop() || t('skinConverter.generated')}</span>
                  </div>
                ))}
              </div>

              {inspection.warnings.length > 0 && (
                <div className="px-4 py-3 space-y-1 border-t border-white/5">
                  {inspection.warnings.map((warning) => <p key={warning} className="text-[11px] leading-4 text-surface-500">{warning}</p>)}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            className="skin-convert-button mt-5 w-full h-11 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-white flex items-center justify-center gap-2 transition-colors duration-75"
            disabled={!inspection || status === 'inspecting' || status === 'converting'}
            data-state={status}
            onClick={convert}
          >
            {status === 'converting' ? t('common.converting') : status === 'complete' ? t('skinConverter.convertAgain') : direction === 'osu-to-etterna' ? t('skinConverter.convertToEtterna') : direction === 'etterna-to-osu' ? t('skinConverter.convertToOsu') : t('skinConverter.convert')}
          </button>
          <p className="mt-2 text-center text-[11px] text-surface-600">{
            status === 'complete'
              ? direction === 'osu-to-etterna' ? t('skinConverter.savedEtterna') : t('skinConverter.saved')
              : direction === 'osu-to-etterna' ? t('skinConverter.zipReady') : t('skinConverter.oskCombines')
          }</p>
        </section>
      </main>
      <LoadingScreen
        show={status === 'inspecting' || status === 'converting'}
        label={status === 'converting' ? t('common.converting') : t('skinConverter.readingArchive')}
        detail={input ? fileLabel(input) : null}
      />
    </div>
  )
}
