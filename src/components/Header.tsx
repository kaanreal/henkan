import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useT } from '../i18n'
import { getGithubStars, openUrl } from '../services/platform'
import { LanguageSwitcher } from './LanguageSwitcher'

const REPO = 'kaanreal/henkan'
const GITHUB_URL = `https://github.com/${REPO}`
const SUPPORTER_URL = 'https://buymeacoffee.com/kaandev'

interface HeaderProps {
  appVersion: string | null
  onShowVersionDialog?: () => void
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8" />
    </svg>
  )
}

export function Header({
  appVersion,
  onShowVersionDialog,
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
    'hidden sm:flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-md border border-white/5 bg-white/[0.03] text-surface-500 text-[11px] font-mono font-medium'

  return (
    <header className="app-header flex shrink-0 items-center justify-between gap-3 border-b border-white/5 bg-black/20 px-3 py-3 backdrop-blur-md animate-fade-in sm:px-6">
      <div className="flex items-center gap-2.5 min-w-0">
        <Link to="/" className="flex shrink-0 items-center gap-2.5" title={t('header.backToConverter')}>
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
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-medium text-surface-400 transition-all duration-75 hover:bg-white/[0.08] hover:text-surface-200"
          aria-label="GitHub"
        >
          <GithubIcon />
          <span className="hidden sm:inline">{stars !== null ? stars : '-'}</span>
        </button>

        <Link
          to="/osu-library"
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-surface-400 transition-all duration-75 hover:bg-white/[0.08] hover:text-surface-200"
          title={t('header.library')}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75A2.25 2.25 0 016 4.5h4.19c.6 0 1.17.24 1.59.66l1.06 1.06c.42.42.99.66 1.59.66H18A2.25 2.25 0 0120.25 9v8.25A2.25 2.25 0 0118 19.5H6a2.25 2.25 0 01-2.25-2.25V6.75z" />
          </svg>
          <span className="hidden md:inline">{t('header.library')}</span>
        </Link>

        <Link
          to="/settings"
          className="flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-surface-400 hover:text-surface-200 text-xs font-medium transition-all duration-75"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 3.75h3l.55 2.2a6.75 6.75 0 011.7.98l2.12-.72 1.5 2.6-1.57 1.64c.2.58.3 1.17.3 1.8s-.1 1.22-.3 1.8l1.57 1.64-1.5 2.6-2.12-.72a6.75 6.75 0 01-1.7.98l-.55 2.2h-3l-.55-2.2a6.75 6.75 0 01-1.7-.98l-2.12.72-1.5-2.6 1.57-1.64a6.75 6.75 0 01-.3-1.8c0-.63.1-1.22.3-1.8L4.63 8.8l1.5-2.6 2.12.72a6.75 6.75 0 011.7-.98l.55-2.2z" />
            <circle cx="12" cy="12" r="2.4" />
          </svg>
          <span className="hidden xl:inline">{t('header.settings')}</span>
        </Link>

        <LanguageSwitcher />
      </div>

      <div className="hidden shrink-0 justify-end lg:flex">
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
