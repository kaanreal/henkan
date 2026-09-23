import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useT } from '../i18n'
import { isTauri } from '../services/environment'
import { getGithubStars, openUrl } from '../services/platform'
import { LanguageSwitcher } from './LanguageSwitcher'
import { DesktopAppMenu } from './DesktopAppMenu'
import { scrollAppToTop } from '../lib/appScroll'

const REPO = 'kaanreal/henkan'
const GITHUB_URL = `https://github.com/${REPO}`
const SUPPORTER_URL = 'https://buymeacoffee.com/kaandev'
const DESKTOP_HINT_LAST_SHOWN = 'henkan.desktop-app-hint.last-shown'
const DESKTOP_HINT_DISMISSED = 'henkan.desktop-app-hint.dismissed'
const DESKTOP_HINT_COOLDOWN = 1000 * 60 * 60 * 24 * 7

interface HeaderProps {
  appVersion: string | null
  onShowVersionDialog?: () => void
  onHomeClick?: () => void
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
  onHomeClick,
}: HeaderProps) {
  const t = useT()
  const [stars, setStars] = useState<string | null>(null)
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false)
  const [desktopHintOpen, setDesktopHintOpen] = useState(false)
  const web = !isTauri()

  useEffect(() => {
    getGithubStars(REPO)
      .then((count) => {
        if (count) setStars(count)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!web || desktopMenuOpen) return
    try {
      if (localStorage.getItem(DESKTOP_HINT_DISMISSED)) return
      const lastShown = Number(localStorage.getItem(DESKTOP_HINT_LAST_SHOWN) || 0)
      if (Date.now() - lastShown < DESKTOP_HINT_COOLDOWN) return
    } catch {
      // Private browsing can block localStorage. The hint can still show once.
    }

    let hideTimer: number | undefined
    const timer = window.setTimeout(() => {
      if (Math.random() > 0.68) return
      try {
        localStorage.setItem(DESKTOP_HINT_LAST_SHOWN, String(Date.now()))
      } catch {
        // Keep the hint non-blocking if storage is unavailable.
      }
      setDesktopHintOpen(true)
      hideTimer = window.setTimeout(() => setDesktopHintOpen(false), 9000)
    }, 16000)

    return () => {
      window.clearTimeout(timer)
      if (hideTimer !== undefined) window.clearTimeout(hideTimer)
    }
  }, [desktopMenuOpen, web])

  const dismissDesktopHint = () => {
    setDesktopHintOpen(false)
    try {
      localStorage.setItem(DESKTOP_HINT_DISMISSED, '1')
    } catch {
      // Dismissing the hint still works for this session without storage.
    }
  }

  const versionClass =
    'hidden sm:flex shrink-0 items-center gap-1 px-2 py-0.5 rounded-md border border-white/5 bg-white/[0.03] text-surface-500 text-[11px] font-mono font-medium'

  return (
    <>
    <header className="app-header sticky top-0 z-50 flex shrink-0 items-center justify-between gap-3 border-b border-white/5 bg-surface-950/85 px-3 py-3 backdrop-blur-md animate-fade-in sm:px-6">
      <div className="flex items-center gap-2.5 min-w-0">
        <Link
          to="/"
          onClick={() => {
            onHomeClick?.()
            scrollAppToTop()
          }}
          className="flex shrink-0 items-center gap-2.5"
          title={t('header.backToConverter')}
        >
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

        <Link
          to="/docs"
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-surface-400 transition-all duration-75 hover:bg-white/[0.08] hover:text-surface-200"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 5.25A2.25 2.25 0 016.75 3h4.5A2.25 2.25 0 0113.5 5.25v15A2.25 2.25 0 0011.25 18h-4.5a2.25 2.25 0 00-2.25 2.25v-15z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 5.25A2.25 2.25 0 0017.25 3h-1.5a2.25 2.25 0 00-2.25 2.25v15A2.25 2.25 0 0115.75 18h1.5a2.25 2.25 0 012.25 2.25v-15z" />
          </svg>
          <span className="hidden xl:inline">{t('siteHeader.docs')}</span>
        </Link>

        <LanguageSwitcher />
      </div>

      <div className="hidden shrink-0 items-center justify-end gap-2 lg:flex">
        {web && (
          <div className="desktop-app-button-wrap relative">
            <button
              type="button"
              onClick={() => { setDesktopHintOpen(false); setDesktopMenuOpen(true) }}
              className="flex shrink-0 items-center gap-2 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-lg hover:shadow-accent/20"
            >
              Get the desktop app
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l4-4m-4 4l-4-4M5 21h14" />
              </svg>
            </button>
            {desktopHintOpen && (
              <div className="desktop-app-hint absolute right-0 top-[calc(100%+12px)] z-50 w-64 rounded-xl border border-accent/25 bg-surface-950 p-3.5 text-left shadow-xl shadow-black/35" role="status">
                <span className="desktop-app-hint__arrow" aria-hidden="true" />
                <div className="flex items-start gap-2.5">
                  <span className="desktop-app-hint__spark mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/15 text-sm text-accent-muted">✦</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-surface-100">A tiny desktop tip</p>
                    <p className="mt-1 text-[11px] leading-5 text-surface-400">The desktop app can watch osu! and Etterna for you.</p>
                  </div>
                  <button type="button" onClick={dismissDesktopHint} className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-surface-600 transition-colors hover:bg-white/[0.06] hover:text-surface-200" aria-label="Dismiss desktop app tip">
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
                <button type="button" onClick={() => { setDesktopHintOpen(false); setDesktopMenuOpen(true) }} className="mt-3 text-[11px] font-semibold text-accent-muted transition-colors hover:text-accent">Show me around <span aria-hidden="true">↗</span></button>
              </div>
            )}
          </div>
        )}
        <button
          onClick={() => openUrl(SUPPORTER_URL)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#FFDD00]/40 hover:border-[#FFDD00] bg-[#FFDD00]/[0.06] hover:bg-[#FFDD00]/[0.12] text-surface-300 hover:text-white text-xs font-medium transition-all duration-75 shrink-0"
        >
          {t('header.buyMeACoffee')}
        </button>
      </div>
    </header>
    {web && <DesktopAppMenu open={desktopMenuOpen} onClose={() => setDesktopMenuOpen(false)} />}
    </>
  )
}

export function AppHeader() {
  const [appVersion, setAppVersion] = useState<string | null>(import.meta.env.VITE_APP_VERSION || null)

  useEffect(() => {
    if (!isTauri()) return
    import('@tauri-apps/api/app').then(({ getVersion }) => {
      getVersion().then(setAppVersion)
    })
  }, [])

  return <Header appVersion={appVersion} />
}
