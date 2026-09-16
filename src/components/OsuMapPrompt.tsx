import type { CSSProperties } from 'react'
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

export function OsuMapPrompt({ map, busy = false, onConvert, sourceLabel, backgroundUrl }: Props) {
  const t = useT()
  const nativeBackground = useOsuMapBackground(backgroundUrl === undefined ? map : null)
  const background = backgroundUrl === undefined ? nativeBackground : backgroundUrl
  const { artist, title } = osuMapName(map)
  const clientName = sourceLabel ?? osuClientName(map)
  const hookTitle = sourceLabel ? `Currently open in ${sourceLabel}` : t('osuHook.title')
  const key = `${map.folder}\n${map.file}`

  return (
    <section
      key={key}
      aria-label={hookTitle}
      className="relative z-20 w-full min-w-0 max-w-lg min-h-[8rem] flex-none overflow-hidden rounded-xl border border-white/10 bg-surface-950/90 text-left shadow-xl animate-slide-up"
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

/** Keeps the menu artwork from flashing when osu! changes songs. */
export function OsuBackground({ url }: { url: string | null }) {
  if (!url) return null
  return (
    <div className="absolute inset-0 overflow-hidden bg-surface-950" aria-hidden="true">
      <div
        className="absolute inset-[-2%] animate-bg-fade-in bg-cover bg-center blur-[12px] brightness-75 saturate-75"
        style={{ backgroundImage: `url(${url})` } as CSSProperties}
      />
      <div className="absolute inset-0 bg-surface-950/35" />
    </div>
  )
}
