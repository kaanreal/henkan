import type { CSSProperties } from 'react'
import { useT } from '../i18n'
import { useOsuMapBackground } from '../hooks/useOsuMapBackground'
import { osuMapLabel, osuMapName, type OsuSelectedMap } from '../lib/osuDesktop'

type Props = {
  map: OsuSelectedMap
  busy?: boolean
  onConvert: () => void
}

export function OsuMapPrompt({ map, busy = false, onConvert }: Props) {
  const t = useT()
  const background = useOsuMapBackground(map)
  const { artist, title } = osuMapName(map)
  const key = `${map.folder}\n${map.file}`

  return (
    <section
      key={key}
      aria-label={t('osuHook.title')}
      className="relative isolate w-full max-w-lg overflow-hidden rounded-2xl border border-white/15 bg-surface-900/80 text-left shadow-2xl backdrop-blur-md animate-slide-up"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-cover bg-center blur-[2px] saturate-110"
        style={background ? { backgroundImage: `url(${background})`, transform: 'scale(1.06)' } : undefined}
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-surface-950/75" />
      <div className="flex items-center gap-4 p-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-muted">
            {t('osuHook.title')}
          </p>
          <h2 className="mt-1 truncate text-base font-bold text-white" title={title}>
            {title || map.folder}
          </h2>
          {artist && <p className="truncate text-sm text-surface-300" title={artist}>{artist}</p>}
          {(map.difficulty || map.creator) && (
            <p className="mt-1 truncate text-xs text-surface-400">
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
          aria-label={t('osuHook.convertAria', { name: osuMapLabel(map) })}
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-white transition-[background-color,transform] duration-150 hover:bg-accent-hover active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none" />
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
        className="absolute inset-[-2%] animate-bg-fade-in bg-cover bg-center blur-[18px] saturate-75"
        style={{ backgroundImage: `url(${url})` } as CSSProperties}
      />
      <div className="absolute inset-0 bg-surface-950/65" />
    </div>
  )
}
