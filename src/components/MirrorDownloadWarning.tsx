import { useCallback, useEffect, useState } from 'react'
import { useT } from '../i18n'
import type { MirrorProgress } from '../services/mirrorMedia'

interface Props {
  title: string
  artist: string
  progress: MirrorProgress | null
  unmatched?: boolean
  onConfirm: () => void
  onCancel: () => void
}

function DownloadIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
  )
}

export function MirrorDownloadWarning({ title, artist, progress, unmatched = false, onConfirm, onCancel }: Props) {
  const t = useT()
  const [leaving, setLeaving] = useState(false)

  const downloading = progress !== null && progress.phase !== 'done'
  const extracting = progress?.phase === 'extracting'
  const percent = downloading && typeof progress?.percent === 'number' ? progress.percent : null

  const cancel = useCallback(() => {
    setLeaving(true)
    setTimeout(onCancel, 150)
  }, [onCancel])

  // Escape dismisses, but never while a download is running.
  useEffect(() => {
    if (downloading) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [downloading, cancel])

  // The parent clears the request when the download finishes; render nothing
  // for the intermediate frame so the confirm UI doesn't flash back in.
  if (progress?.phase === 'done') return null

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${leaving ? 'pointer-events-none' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={downloading ? t('mirrorWarning.downloading') : t('mirrorWarning.missingMedia')}
    >
      <div
        className={`absolute inset-0 bg-[#02040a]/85 backdrop-blur-sm transition-opacity duration-200 ${leaving ? 'opacity-0' : 'opacity-100'}`}
        onClick={downloading ? undefined : cancel}
      />
      <div className={`relative w-full max-w-sm transition-all duration-200 ${leaving ? 'scale-95 opacity-0' : 'scale-100 opacity-100'}`}>
        <div className="relative bg-[#0f111a]/95 border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden animate-scale-in">
          <div className="px-6 pt-7 pb-6">
            {/* Kicker */}
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-1.5 h-1.5 rounded-full ${downloading ? 'bg-accent animate-pulse-soft' : unmatched ? 'bg-rose-400' : 'bg-amber-400'}`} />
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-surface-500">
                {downloading ? (extracting ? t('mirrorWarning.extracting') : t('mirrorWarning.downloading')) : unmatched ? t('mirrorWarning.notOnMirror') : t('mirrorWarning.missingMedia')}
              </span>
            </div>

            {/* Map identity */}
            <h2 className="text-lg font-bold text-white tracking-tight leading-snug line-clamp-2">{title}</h2>
            <p className="text-[13px] text-surface-400 mt-0.5 truncate">{artist}</p>

            {downloading ? (
              <div className="mt-6">
                <div className="flex items-end justify-between gap-4">
                  <p className="text-xs text-surface-400 leading-relaxed">
                    {extracting
                      ? t('mirrorWarning.extractingBody')
                      : t('mirrorWarning.downloadingBody')}
                  </p>
                  {percent !== null && (
                    <span className="text-3xl font-bold text-white tabular-nums leading-none shrink-0">
                      {percent}
                      <span className="text-sm text-surface-500 ml-0.5">%</span>
                    </span>
                  )}
                </div>

                <div className="mt-3 h-1.5 rounded-full bg-white/[0.06] overflow-hidden relative">
                  {percent !== null ? (
                    <div
                      className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
                      style={{ width: `${percent}%` }}
                    />
                  ) : (
                    <div className="absolute inset-y-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-accent to-transparent animate-[loading-bar_1.2s_ease-in-out_infinite]" />
                  )}
                </div>

                <p className="mt-3 text-[11px] text-surface-500">
                  {t('mirrorWarning.lockedNote')}
                </p>
              </div>
            ) : unmatched ? (
              <div className="mt-6">
                <p className="text-[13px] text-surface-400 leading-relaxed">
                  {t('mirrorWarning.unmatchedBody')}
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <button
                    onClick={cancel}
                    autoFocus
                    className="flex-1 h-11 rounded-xl text-sm font-semibold transition-all duration-150
                      bg-accent text-white hover:bg-accent-hover active:scale-[0.97]"
                  >
                    {t('mirrorWarning.gotIt')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6">
                <p className="text-[13px] text-surface-400 leading-relaxed">
                  {t('mirrorWarning.missingBody')}
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <button
                    onClick={cancel}
                    className="flex-1 h-11 rounded-xl text-sm font-semibold transition-all duration-150
                      bg-white/[0.04] border border-white/10 text-surface-300
                      hover:bg-white/[0.08] hover:text-white active:scale-[0.97]"
                  >
                    {t('mirrorWarning.notNow')}
                  </button>
                  <button
                    onClick={onConfirm}
                    autoFocus
                    className="flex-1 h-11 rounded-xl text-sm font-semibold transition-all duration-150
                      bg-accent text-white hover:bg-accent-hover active:scale-[0.97] flex items-center justify-center gap-2"
                  >
                    <DownloadIcon />
                    {t('mirrorWarning.download')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
