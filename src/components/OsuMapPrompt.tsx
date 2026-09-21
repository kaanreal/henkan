import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { useOsuMapBackground } from '../hooks/useOsuMapBackground'
import { osuClientName, osuMapLabel, osuMapName, type OsuSelectedMap } from '../lib/osuDesktop'

type Props = {
  map: OsuSelectedMap
  busy?: boolean
  onConvert: () => void
  sourceLabel?: string
  backgroundUrl?: string | null
}

export type LiveMapStackItem = {
  id: string
  map: OsuSelectedMap
  busy?: boolean
  onConvert: () => void
  sourceLabel?: string
  backgroundUrl?: string | null
}

export function OsuMapPrompt({ map, busy = false, onConvert, sourceLabel, backgroundUrl }: Props) {
  const t = useT()
  const nativeBackground = useOsuMapBackground(backgroundUrl === undefined ? map : null)
  const background = backgroundUrl === undefined ? nativeBackground : backgroundUrl
  const { artist, title } = osuMapName(map)
  const clientName = sourceLabel ?? osuClientName(map)
  const hookTitle = sourceLabel ? `Currently open in ${sourceLabel}` : t('osuHook.title')

  return (
    <section
      aria-label={hookTitle}
      className="relative z-20 w-full min-w-0 max-w-3xl min-h-[8rem] flex-none overflow-hidden rounded-xl border border-white/10 bg-surface-950/90 text-left shadow-xl animate-slide-up"
    >
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-2.5">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
        <p className="min-w-0 truncate text-[11px] font-medium text-surface-400">{hookTitle}</p>
        <span className="ml-auto shrink-0 text-[10px] tracking-[0.08em] text-surface-600">{clientName}</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-3 p-3 sm:p-4">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04]">
          {background ? (
            <img src={background} alt="" className="h-full w-full object-cover" />
          ) : (
            <img src="/logo.png" alt="" className="h-full w-full object-cover p-3 opacity-60" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold text-surface-100" title={title}>
            {title || map.folder}
          </h2>
          {artist && (
            <p className="mt-0.5 truncate text-sm text-surface-300" title={artist}>
              {artist}
            </p>
          )}
          {(map.difficulty || map.creator) && (
            <p className="mt-1 truncate text-xs text-surface-500">
              {map.difficulty || t('osuHook.mapFallback', { name: map.creator })}
              {map.difficulty && map.creator ? ` · ${map.creator}` : ''}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onConvert}
          disabled={busy}
          aria-busy={busy}
          aria-label={
            sourceLabel
              ? `Convert ${osuMapLabel(map)} from ${sourceLabel}`
              : t('osuHook.convertAria', { name: osuMapLabel(map) })
          }
          className="flex min-h-10 w-full basis-full items-center justify-center gap-2 whitespace-normal text-center leading-tight rounded-lg bg-accent px-3.5 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:basis-auto sm:shrink-0 sm:whitespace-nowrap"
        >
          {busy ? (
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none"
            />
          ) : null}
          {busy ? t('osuHook.loading') : t('osuHook.convert')}
        </button>
      </div>
    </section>
  )
}

/** Shows simultaneous live-map sources as a layered, hoverable card deck. */
export function LiveMapStack({
  items,
  onPriorityChange,
}: {
  items: LiveMapStackItem[]
  onPriorityChange?: (id: string) => void
}) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? '')
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const previousMaps = useRef(new Map<string, string>())
  const hoverClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clickLock = useRef(false)
  const itemSignature = items.map((item) => `${item.id}:${item.map.folder}\n${item.map.file}`).join('\0')

  const previewItem = (id: string) => {
    if (clickLock.current) return
    if (hoverClearTimer.current !== null) {
      clearTimeout(hoverClearTimer.current)
      hoverClearTimer.current = null
    }
    setHoveredId(id)
  }

  const clearPreview = () => {
    clickLock.current = false
    if (hoverClearTimer.current !== null) clearTimeout(hoverClearTimer.current)
    hoverClearTimer.current = setTimeout(() => {
      hoverClearTimer.current = null
      setHoveredId(null)
    }, 120)
  }

  const selectItem = (id: string) => {
    clickLock.current = true
    if (hoverClearTimer.current !== null) clearTimeout(hoverClearTimer.current)
    setActiveId(id)
    setHoveredId(id)
  }

  useEffect(() => {
    return () => {
      if (hoverClearTimer.current !== null) clearTimeout(hoverClearTimer.current)
    }
  }, [])

  useEffect(() => {
    const currentMaps = new Map(
      items.map((item) => [item.id, `${item.map.folder}\n${item.map.file}`]),
    )
    const previous = previousMaps.current
    const hasPreviousItems = previous.size > 0
    const changed = hasPreviousItems
      ? items.find((item) => previous.get(item.id) !== currentMaps.get(item.id))
      : null

    previousMaps.current = currentMaps
    setActiveId((current) => {
      if (changed) return changed.id
      if (items.some((item) => item.id === current)) return current
      return items[0]?.id ?? ''
    })
  }, [itemSignature])

  const frontId = items.some((item) => item.id === activeId) ? activeId : (items[0]?.id ?? '')
  const priorityId = hoveredId ?? frontId

  useEffect(() => {
    onPriorityChange?.(priorityId)
  }, [onPriorityChange, priorityId])

  if (items.length === 0) return null
  const stacked = items.length > 1

  return (
    <div
      className={`live-map-stack relative w-full max-w-3xl ${stacked ? 'live-map-stack--stacked' : ''}`}
      role={stacked ? 'group' : undefined}
      aria-label={stacked ? `${items.length} live maps available` : undefined}
      onMouseLeave={clearPreview}
    >
      <div className="live-map-stack__deck">
        {items.map((item, index) => {
          const isFront = item.id === frontId
          const isHovered = item.id === hoveredId
          const behindIndex = items.filter((candidate) => candidate.id !== frontId).findIndex((candidate) => candidate.id === item.id)
          const offset = Math.max(behindIndex, 0)
          const angle = offset % 2 === 0 ? 2.2 : -1.8

          return (
            <div
              key={item.id}
              className={`live-map-stack__item ${isFront ? 'live-map-stack__item--front' : 'live-map-stack__item--behind'} ${isHovered && !isFront ? 'live-map-stack__item--hovered' : ''}`}
              style={
                {
                  '--stack-x': isFront ? '0rem' : `calc(clamp(1.5rem, 5vw, 2.25rem) + ${offset * 0.55}rem)`,
                  '--stack-y': isFront ? '0rem' : `${0.12 + offset * 0.16}rem`,
                  '--stack-rotate': isFront ? '0deg' : `${angle}deg`,
                  '--stack-scale': isFront ? '1' : `${0.985 - offset * 0.012}`,
                  zIndex: isHovered ? items.length + 10 : isFront ? items.length + 5 : items.length - index,
                } as CSSProperties
              }
              onMouseEnter={() => previewItem(item.id)}
              onFocus={() => previewItem(item.id)}
              onClick={() => {
                selectItem(item.id)
              }}
            >
              <OsuMapPrompt
                map={item.map}
                busy={item.busy}
                onConvert={() => {
                  selectItem(item.id)
                  item.onConvert()
                }}
                sourceLabel={item.sourceLabel}
                backgroundUrl={item.backgroundUrl}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Keeps the menu artwork from flashing when osu! changes songs. */
export function OsuBackground({ url }: { url: string | null }) {
  const [currentUrl, setCurrentUrl] = useState<string | null>(url)
  const [incomingUrl, setIncomingUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!url) {
      setCurrentUrl(null)
      setIncomingUrl(null)
    } else if (!currentUrl) {
      setCurrentUrl(url)
      setIncomingUrl(null)
    } else if (url === currentUrl) {
      setIncomingUrl(null)
    } else if (url !== currentUrl) {
      if (url !== incomingUrl) setIncomingUrl(url)
    }
  }, [currentUrl, incomingUrl, url])

  if (!currentUrl && !incomingUrl) return null

  const commitIncoming = () => {
    if (!incomingUrl) return
    setCurrentUrl(incomingUrl)
    setIncomingUrl(null)
  }

  return (
    <div className="absolute inset-0 overflow-hidden bg-surface-950" aria-hidden="true">
      {currentUrl && (
        <div
          className="absolute inset-[-2%] bg-cover bg-center blur-[12px] brightness-75 saturate-75"
          style={{ backgroundImage: `url(${currentUrl})` } as CSSProperties}
        />
      )}
      {incomingUrl && (
        <div
          key={incomingUrl}
          className="absolute inset-[-2%] animate-bg-fade-in bg-cover bg-center blur-[12px] brightness-75 saturate-75"
          style={{ backgroundImage: `url(${incomingUrl})` } as CSSProperties}
          onAnimationEnd={commitIncoming}
        />
      )}
      <div className="absolute inset-0 bg-surface-950/35" />
    </div>
  )
}
