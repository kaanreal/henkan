import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useT } from '../i18n'
import type { OsuLibrarySkin } from '../lib/osuLibrary'
import {
  buildSkinPreview,
  DEFAULT_OSU_COLUMN_WIDTH,
  DEFAULT_OSU_HIT_POSITION,
  detectSkinArchive,
} from '../services/skinConverter'
import { archiveSkinPreviewPath } from '../services/skinInput'
import { loadCachedSkinPreview, saveCachedSkinPreview } from '../services/skinPreviewCache'
import { resolvePreviewEventWindow } from '../services/skinPreviewTiming'
import type { SkinPreview } from '../types/skin'

type PreviewUrls = {
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

const CYCLE_MS = 12000
const LOOK_AHEAD_MS = 500
const SCROLL_HEIGHT_RATIO = 1.25
const BAR_HEIGHT_RATIO = 0.3

let previewQueue: Promise<unknown> = Promise.resolve()

function queuePreview<T>(task: () => Promise<T>): Promise<T> {
  const next = previewQueue.then(task, task)
  previewQueue = next.then(() => undefined, () => undefined)
  return next
}

function createPreviewUrls(preview: SkinPreview): PreviewUrls {
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

function revokePreviewUrls(preview: PreviewUrls | null): void {
  if (!preview) return
  for (const lane of preview.lanes) {
    Object.values(lane).forEach((url) => URL.revokeObjectURL(url))
  }
}

function createPreviewEvents(): PreviewEvent[] {
  const events: PreviewEvent[] = []
  for (let lane = 0; lane < 4; lane++) {
    let timeMs = 420 + lane * 85
    let eventIndex = 0
    while (timeMs < CYCLE_MS - 1800) {
      const kind = eventIndex === 0 || (lane + eventIndex) % 4 === 0 ? 'hold' : 'tap'
      const holdLength = kind === 'hold' ? 760 + ((lane * 173 + eventIndex * 241) % 840) : 0
      events.push({
        id: `library-preview-${lane}-${eventIndex}`,
        lane,
        kind,
        timeMs,
        holdEndMs: kind === 'hold' ? timeMs + holdLength : undefined,
      })
      timeMs += holdLength + 500 + ((lane * 97 + eventIndex * 149) % 650)
      eventIndex++
    }
  }
  return events
}

export function SkinLibraryPreview({ skin, onNoteIcon }: { skin: OsuLibrarySkin, onNoteIcon?: (url: string | null) => void }) {
  const t = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<PreviewUrls | null>(null)
  const eventElementsRef = useRef(new Map<string, HTMLElement>())
  const [requested, setRequested] = useState(() => typeof IntersectionObserver === 'undefined')
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')
  const [preview, setPreview] = useState<PreviewUrls | null>(null)
  const [error, setError] = useState<string | null>(null)
  const events = useMemo(() => createPreviewEvents(), [])

  const registerEventElement = useCallback((id: string, element: HTMLElement | null) => {
    if (element) eventElementsRef.current.set(id, element)
    else eventElementsRef.current.delete(id)
  }, [])

  useEffect(() => {
    const element = containerRef.current
    if (!element || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting)
      if (entry.isIntersecting) setRequested(true)
    }, { rootMargin: '128px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!requested) return
    let cancelled = false
    const revision = skin.previewRevision || `legacy-${skin.fileCount}-${skin.archive ? 'archive' : 'folder'}`

    void queuePreview(async () => {
      const cached = await loadCachedSkinPreview(skin.path, revision)
      if (cached) return createPreviewUrls(cached)
      const input = skin.archive ? skin.path : await archiveSkinPreviewPath(skin.path)
      const detected = await detectSkinArchive(input)
      const built = await buildSkinPreview(input, detected.direction)
      await saveCachedSkinPreview(skin.path, revision, built)
      return createPreviewUrls(built)
    }).then((nextPreview) => {
      if (cancelled) {
        revokePreviewUrls(nextPreview)
        return
      }
      previewRef.current = nextPreview
      setPreview(nextPreview)
      onNoteIcon?.(nextPreview.lanes[0]?.note ?? null)
    }).catch((reason) => {
      if (cancelled) return
      setError(reason instanceof Error ? reason.message : t('skinConverter.inspectFailed'))
    })

    return () => {
      cancelled = true
      revokePreviewUrls(previewRef.current)
      previewRef.current = null
    }
  }, [onNoteIcon, requested, skin.archive, skin.fileCount, skin.path, skin.previewRevision, t])

  const hitPosition = preview?.hitPosition || DEFAULT_OSU_HIT_POSITION
  // The converter retains the authored hit position. The compact library card
  // caps only its display position so receptors and hold tails stay in frame.
  const previewHitPosition = Math.min(hitPosition, 410)
  const columnWidth = preview?.columnWidth || DEFAULT_OSU_COLUMN_WIDTH
  const previewStyle = {
    '--hit-y': `${previewHitPosition / 480 * 100}%`,
    '--column-scale': columnWidth / DEFAULT_OSU_COLUMN_WIDTH,
    position: 'absolute',
    top: '0.75rem',
    right: '15%',
    bottom: '0.75rem',
    left: '15%',
    width: 'auto',
    maxWidth: 'none',
    height: 'auto',
    margin: 0,
  } as CSSProperties

  useEffect(() => {
    if (!preview || !visible) return
    const startedAt = performance.now()
    let frame = 0

    const update = () => {
      const stage = stageRef.current
      if (!stage) {
        frame = requestAnimationFrame(update)
        return
      }

      const stageWidth = stage.clientWidth
      const stageHeight = stage.clientHeight
      const hitY = stageHeight * (previewHitPosition / 480)
      const laneWidth = stageWidth / 4
      const barHeight = laneWidth * BAR_HEIGHT_RATIO
      const scrollHeight = Math.max(
        Math.min(stageHeight * SCROLL_HEIGHT_RATIO, stageWidth * 1.8),
        hitY + barHeight,
      )
      const elapsedMs = performance.now() - startedAt

      for (const event of events) {
        const root = eventElementsRef.current.get(event.id)
        if (!root) continue
        const { headDelta, tailDelta } = resolvePreviewEventWindow(
          event.timeMs,
          event.holdEndMs,
          elapsedMs,
          CYCLE_MS,
          LOOK_AHEAD_MS,
        )
        const headY = hitY - (headDelta / LOOK_AHEAD_MS) * scrollHeight

        if (event.kind === 'tap') {
          root.style.top = `${headY}px`
          root.style.opacity = headDelta >= 0 && headDelta <= LOOK_AHEAD_MS ? '1' : '0'
          continue
        }

        const tailY = hitY - (tailDelta / LOOK_AHEAD_MS) * scrollHeight
        const bodyTop = Math.max(0, Math.min(headY, tailY))
        const bodyBottom = Math.min(hitY, Math.max(headY, tailY))
        const bodyHeight = Math.max(0, bodyBottom - bodyTop)
        const head = root.querySelector<HTMLElement>('[data-preview-part="head"]')
        const body = root.querySelector<HTMLElement>('[data-preview-part="body"]')
        const tail = root.querySelector<HTMLElement>('[data-preview-part="tail"]')
        root.style.opacity = tailDelta >= 0 && headDelta <= LOOK_AHEAD_MS && bodyHeight > 0 ? '1' : '0'
        body?.style.setProperty('--hold-body-top', `${bodyTop}px`)
        body?.style.setProperty('--hold-body-height', `${bodyHeight}px`)
        if (head) {
          head.style.top = `${headY}px`
          head.style.opacity = headDelta >= 0 && headDelta <= LOOK_AHEAD_MS ? '1' : '0'
        }
        if (tail) {
          tail.style.top = `${tailY}px`
          tail.style.opacity = tailDelta >= 0 && tailDelta <= LOOK_AHEAD_MS ? '1' : '0'
        }
      }

      frame = requestAnimationFrame(update)
    }

    frame = requestAnimationFrame(update)
    return () => cancelAnimationFrame(frame)
  }, [events, preview, previewHitPosition, visible])

  return (
    <div ref={containerRef} className="skin-library-preview relative h-full w-full overflow-hidden">
      {preview ? (
        <div
          className="skin-preview__stage absolute inset-x-8 inset-y-3 m-0 w-auto max-w-none"
          ref={stageRef}
          style={previewStyle}
          aria-label={t('skinConverter.gameplayPreview')}
        >
          {preview.lanes.map((lane, laneIndex) => (
            <div className="skin-preview__lane" key={laneIndex}>
              {events.filter((event) => event.lane === laneIndex).map((event) => event.kind === 'hold' ? (
                <div
                  className="skin-preview__hold"
                  key={event.id}
                  ref={(element) => registerEventElement(event.id, element)}
                  aria-hidden="true"
                >
                  <img src={lane.holdTail} data-preview-part="tail" className="skin-preview__hold-tail" alt="" draggable="false" />
                  <img src={lane.holdBody} data-preview-part="body" className="skin-preview__hold-body" alt="" draggable="false" />
                  <img src={lane.holdHead} data-preview-part="head" className="skin-preview__hold-head" alt="" draggable="false" />
                </div>
              ) : (
                <img
                  key={event.id}
                  ref={(element) => registerEventElement(event.id, element)}
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
      ) : error ? (
        <div className="absolute inset-3 grid place-items-center rounded-lg border border-red-500/15 bg-red-500/[0.04] px-4 text-center">
          <p className="line-clamp-2 text-xs text-red-300/80" title={error}>{error}</p>
        </div>
      ) : (
        <div className="absolute inset-3 grid place-items-center rounded-lg border border-white/8 bg-white/[0.025]">
          <div className="flex items-center gap-2 text-xs text-surface-600">
            {requested && <span className="h-3 w-3 animate-spin rounded-full border border-white/20 border-t-surface-400" />}
            <span>{requested ? t('skinConverter.readingArchive') : t('skinConverter.gameplayPreview')}</span>
          </div>
        </div>
      )}
    </div>
  )
}
