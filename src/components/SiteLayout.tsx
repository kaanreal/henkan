import { useState } from 'react'
import { Link } from 'react-router'
import { useT } from '../i18n'
import type { MessageKey } from '../i18n/core'
import { LanguageSwitcher } from './LanguageSwitcher'

const NAV_LINKS: Array<{ to: string; labelKey: MessageKey }> = [
  { to: '/osu-to-stepmania', labelKey: 'siteHeader.converter' },
  { to: '/skin-converter', labelKey: 'siteHeader.skins' },
  { to: '/osu-mania-pack-creator', labelKey: 'siteHeader.packCreator' },
  { to: '/osu-mania-map-viewer', labelKey: 'siteHeader.mapViewer' },
]

export function SiteHeader() {
  const t = useT()
  const [open, setOpen] = useState(false)

  const linkClass = 'px-3 py-1.5 text-xs text-surface-400 hover:text-surface-200 rounded-lg hover:bg-white/5 transition-all'

  return (
    <header className="border-b border-surface-800/50 bg-surface-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2.5 text-surface-100 hover:text-white transition-colors shrink-0">
          <img src="/logo.png" alt="Henkan" className="w-7 h-7 rounded-lg" />
          <span className="font-semibold text-sm">Henkan</span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map(link => (
            <Link key={link.to} to={link.to} className={linkClass}>{t(link.labelKey)}</Link>
          ))}
          <a href="https://github.com/kaanreal/henkan" target="_blank" rel="noopener noreferrer" className={linkClass}>{t('siteHeader.github')}</a>
          <LanguageSwitcher />
        </nav>

        <div className="flex md:hidden items-center gap-2">
          <LanguageSwitcher />
          <button
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            aria-label={t('siteHeader.menu')}
            className="h-9 w-9 grid place-items-center rounded-lg border border-white/10 bg-white/[0.04] text-surface-400 hover:text-surface-200 transition-all duration-75"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {open
                ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav className="md:hidden border-t border-surface-800/50 px-2 py-2 space-y-1">
          {NAV_LINKS.map(link => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setOpen(false)}
              className="block px-3 py-2.5 text-sm text-surface-400 hover:text-surface-200 rounded-lg hover:bg-white/5 transition-all"
            >
              {t(link.labelKey)}
            </Link>
          ))}
          <a
            href="https://github.com/kaanreal/henkan"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="block px-3 py-2.5 text-sm text-surface-400 hover:text-surface-200 rounded-lg hover:bg-white/5 transition-all"
          >
            {t('siteHeader.github')}
          </a>
        </nav>
      )}
    </header>
  )
}

export function SiteFooter() {
  const t = useT()
  return (
    <footer className="border-t border-surface-800/50 bg-surface-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-xs text-surface-500">
          <div>
            <h4 className="font-medium text-surface-300 mb-2">{t('siteFooter.tools')}</h4>
            <ul className="space-y-1.5">
              <li><Link to="/osu-to-stepmania" className="hover:text-surface-300 transition-colors">{t('siteFooter.converter')}</Link></li>
              <li><Link to="/skin-converter" className="hover:text-surface-300 transition-colors">{t('siteFooter.skinConverter')}</Link></li>
              <li><Link to="/osu-mania-pack-creator" className="hover:text-surface-300 transition-colors">{t('siteFooter.packCreator')}</Link></li>
              <li><Link to="/osu-mania-map-viewer" className="hover:text-surface-300 transition-colors">{t('siteFooter.mapViewer')}</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-surface-300 mb-2">{t('siteFooter.guides')}</h4>
            <ul className="space-y-1.5">
              <li><Link to="/how-to-make-an-osu-mania-map" className="hover:text-surface-300 transition-colors">{t('siteFooter.makingMaps')}</Link></li>
              <li><Link to="/how-to-convert-osu-mania-to-stepmania" className="hover:text-surface-300 transition-colors">{t('siteFooter.convertingMaps')}</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-surface-300 mb-2">{t('siteFooter.download')}</h4>
            <ul className="space-y-1.5">
              <li><a href="https://github.com/kaanreal/henkan/releases" target="_blank" rel="noopener noreferrer" className="hover:text-surface-300 transition-colors">{t('siteFooter.githubReleases')}</a></li>
              <li><Link to="/" className="hover:text-surface-300 transition-colors">{t('siteFooter.webApp')}</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-surface-300 mb-2">{t('siteFooter.community')}</h4>
            <ul className="space-y-1.5">
              <li><a href="https://github.com/kaanreal/henkan" target="_blank" rel="noopener noreferrer" className="hover:text-surface-300 transition-colors">{t('siteFooter.github')}</a></li>
              <li><a href="https://github.com/kaanreal/henkan/issues" target="_blank" rel="noopener noreferrer" className="hover:text-surface-300 transition-colors">{t('siteFooter.reportIssues')}</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-surface-800/50 text-center text-[10px] text-surface-600">
          {t('siteFooter.madeBy')} <a href="https://github.com/kaanreal" target="_blank" rel="noopener noreferrer" className="text-accent-muted hover:text-accent transition-colors">Kaan</a>
        </div>
      </div>
    </footer>
  )
}
