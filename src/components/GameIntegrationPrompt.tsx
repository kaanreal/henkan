import { useT } from '../i18n'
import type { GameInstallations } from '../lib/gameIntegrations'

type Props = {
  installations: GameInstallations
  onConfirm: () => void
  onLater: () => void
}

export function GameIntegrationPrompt({ installations, onConfirm, onLater }: Props) {
  const t = useT()
  const found = [
    installations.osu.songs
      ? { name: 'osu!stable', path: installations.osu.songs }
      : null,
    installations.etterna.songs
      ? { name: 'Etterna', path: installations.etterna.songs }
      : null,
  ].filter((item): item is { name: string; path: string } => item !== null)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm animate-fade-in">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-integration-prompt-title"
        className="w-full max-w-md rounded-2xl border border-white/10 bg-surface-900 p-6 shadow-2xl animate-scale-in"
      >
        <div className="mb-5 flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent-muted">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75A2.25 2.25 0 016 4.5h4.19a2.25 2.25 0 011.59.66l1.06 1.06a2.25 2.25 0 001.59.66H18a2.25 2.25 0 012.25 2.25v8.12A2.25 2.25 0 0118 19.5H6a2.25 2.25 0 01-2.25-2.25V6.75z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 12h7.5m-3-3 3 3-3 3" />
            </svg>
          </div>
          <div>
            <h2 id="game-integration-prompt-title" className="text-base font-semibold text-surface-100">
              {t('gameIntegrations.firstRunTitle')}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-surface-400">
              {t('gameIntegrations.firstRunDescription')}
            </p>
          </div>
        </div>

        <div className="mb-5 space-y-2">
          {found.map(item => (
            <div key={item.name} className="rounded-xl border border-white/6 bg-white/[0.03] px-3.5 py-3">
              <p className="text-xs font-medium text-surface-300">{item.name}</p>
              <p className="mt-1 break-all font-mono text-[11px] text-surface-600">{item.path}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onLater}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-surface-500 transition-colors hover:bg-white/[0.04] hover:text-surface-300"
          >
            {t('gameIntegrations.notNow')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            {t('gameIntegrations.enable')}
          </button>
        </div>
      </div>
    </div>
  )
}
