import { useT } from '../i18n'
import type { OsuLibraryScanProgress, OsuStatus } from '../lib/osuLibrary'
import { OsuLibraryProgress } from './OsuLibraryProgress'

type Props = {
  status: OsuStatus | null
  scanning: boolean
  progress: OsuLibraryScanProgress | null
  error: string | null
  onConfirm: () => void
  onLater: () => void
}

export function OsuLibraryPrompt({ status, scanning, progress, error, onConfirm, onLater }: Props) {
  const t = useT()
  const detected = Boolean(status?.installed && status.root)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="osu-library-prompt-title"
        className="w-full max-w-md rounded-2xl border border-white/10 bg-surface-900 p-6 shadow-2xl animate-scale-in"
      >
        <div className="mb-5 flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent-muted">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75A2.25 2.25 0 016 4.5h4.19a2.25 2.25 0 011.59.66l1.06 1.06a2.25 2.25 0 001.59.66H18a2.25 2.25 0 012.25 2.25v8.12A2.25 2.25 0 0118 19.5H6a2.25 2.25 0 01-2.25-2.25V6.75z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 14.25l1.75-1.75 1.5 1.5 2.75-3 2 2" />
            </svg>
          </div>
          <div>
            <h2 id="osu-library-prompt-title" className="text-base font-semibold text-surface-100">
              {t('osuLibrary.firstRunTitle')}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-surface-400">
              {t('osuLibrary.firstRunDescription')}
            </p>
          </div>
        </div>

        <div className="mb-5 rounded-xl border border-white/6 bg-white/[0.03] px-3.5 py-3 text-xs text-surface-400">
          <p className="font-medium text-surface-300">
            {detected ? t('osuLibrary.detectedInstall') : t('osuLibrary.noInstallDetected')}
          </p>
          {status?.root && <p className="mt-1 break-all font-mono text-[11px] text-surface-600">{status.root}</p>}
        </div>

        {error && <p className="mb-4 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

        {scanning && <div className="mb-4"><OsuLibraryProgress progress={progress} /></div>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onLater}
            disabled={scanning}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-surface-500 transition-colors hover:bg-white/[0.04] hover:text-surface-300 disabled:opacity-50"
          >
            {t('osuLibrary.notNow')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={scanning}
            className="flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60"
          >
            {scanning && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
            {scanning
              ? t('osuLibrary.scanning')
              : detected
                ? t('osuLibrary.scanNow')
                : t('osuLibrary.chooseFolder')}
          </button>
        </div>
      </div>
    </div>
  )
}
