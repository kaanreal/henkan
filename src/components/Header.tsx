import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useT } from '../i18n'
import { getGithubStars, openUrl } from '../services/platform'
import type { ConvertDirection } from '../types/beatmap'
import { LanguageSwitcher } from './LanguageSwitcher'

const REPO = 'kaanreal/henkan'
const GITHUB_URL = `https://github.com/${REPO}`
const SUPPORTER_URL = 'https://buymeacoffee.com/kaandev'

interface HeaderProps {
  direction?: ConvertDirection
  onSetDirection?: (dir: ConvertDirection) => void
  appVersion: string | null
  onShowVersionDialog?: () => void
  directionLabels?: readonly [string, string]
  directionAriaLabel?: string
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8" />
    </svg>
  )
}

export function Header({
  direction,
  onSetDirection,
  appVersion,
  onShowVersionDialog,
  directionLabels = ['.osu / .osz', '.sm'],
  directionAriaLabel,
}: HeaderProps) {
  const t = useT()
  const [stars, setStars] = useState<string | null>(null)

  useEffect(() => {
    getGithubStars(REPO)
      .then((count) => {
        if (count) setStars(count)
      })
      .catch(() => {})
  }, [])

  const versionClass =
    'hidden sm:flex items-center gap-1 px-2 py-0.5 rounded-md border border-white/5 bg-white/[0.03] text-surface-500 text-[11px] font-mono font-medium'

  return (
    <header className="app-header px-3 sm:px-6 py-3 border-b border-white/5 bg-black/20 backdrop-blur-md grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-3 items-center shrink-0 animate-fade-in gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <Link to="/" className="flex items-center gap-2.5 min-w-0" title={t('header.backToConverter')}>
          <img src="/logo.png" alt="Henkan" className="w-8 h-8 rounded-lg shrink-0" />
          <span className="hidden sm:inline text-base font-semibold tracking-tight text-surface-100">Henkan</span>
        </Link>

        {onShowVersionDialog ? (
          <button
            onClick={onShowVersionDialog}
            className={`${versionClass} hover:bg-white/[0.08] hover:text-surface-300 transition-all duration-75`}
            title={t('header.versionInfo')}
          >
            v{appVersion || '-'}
          </button>
        ) : (
          <span className={versionClass}>v{appVersion || '-'}</span>
        )}

        <button
          onClick={() => openUrl(GITHUB_URL)}
          className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-surface-400 hover:text-surface-200 text-[11px] font-medium transition-all duration-75"
        >
          <GithubIcon />
          {stars !== null ? stars : '-'}
        </button>

        <LanguageSwitcher />
      </div>

      <div className="flex justify-end md:justify-center">
        {direction && onSetDirection && (
          <div
            className="header-direction flex bg-white/[0.04] rounded-lg border border-white/5 p-0.5 gap-0.5"
            role="group"
            aria-label={directionAriaLabel ?? t('header.directionAria')}
          >
            <button
              onClick={() => onSetDirection('osu-to-etterna')}
              aria-pressed={direction === 'osu-to-etterna'}
              className={`px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all duration-75 ${
                direction === 'osu-to-etterna'
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              {directionLabels[0]}
            </button>
            <span className="text-surface-600 self-center text-xs">→</span>
            <button
              onClick={() => onSetDirection('etterna-to-osu')}
              aria-pressed={direction === 'etterna-to-osu'}
              className={`px-2 sm:px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all duration-75 ${
                direction === 'etterna-to-osu'
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-surface-400 hover:text-surface-200'
              }`}
            >
              {directionLabels[1]}
            </button>
          </div>
        )}
      </div>

      <div className="hidden md:flex justify-end">
        <button
          onClick={() => openUrl(SUPPORTER_URL)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#FFDD00]/40 hover:border-[#FFDD00] bg-[#FFDD00]/[0.06] hover:bg-[#FFDD00]/[0.12] text-surface-300 hover:text-white text-xs font-medium transition-all duration-75 shrink-0"
        >
          {t('header.buyMeACoffee')}
        </button>
      </div>
    </header>
  )
}
