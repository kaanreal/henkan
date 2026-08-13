import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from './LanguageSwitcher'

export function SiteHeader() {
  const { t } = useTranslation()
  return (
    <header className="border-b border-surface-800/50 bg-surface-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-2.5 text-surface-100 hover:text-white transition-colors shrink-0">
          <img src="/logo32.png" alt="Henkan" className="w-7 h-7 rounded-lg" />
          <span className="font-semibold text-sm">Henkan</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link to="/osu-to-stepmania" className="px-3 py-1.5 text-xs text-surface-400 hover:text-surface-200 rounded-lg hover:bg-white/5 transition-all">{t('siteHeader.converter')}</Link>
          <Link to="/skin-converter" className="px-3 py-1.5 text-xs text-surface-400 hover:text-surface-200 rounded-lg hover:bg-white/5 transition-all">{t('siteHeader.skins')}</Link>
          <Link to="/osu-mania-pack-creator" className="px-3 py-1.5 text-xs text-surface-400 hover:text-surface-200 rounded-lg hover:bg-white/5 transition-all">{t('siteHeader.packCreator')}</Link>
          <Link to="/osu-mania-map-viewer" className="px-3 py-1.5 text-xs text-surface-400 hover:text-surface-200 rounded-lg hover:bg-white/5 transition-all">{t('siteHeader.mapViewer')}</Link>
          <a href="https://github.com/kaanreal/henkan" target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs text-surface-400 hover:text-surface-200 rounded-lg hover:bg-white/5 transition-all">{t('siteHeader.github')}</a>
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  )
}

export function SiteFooter() {
  const { t } = useTranslation()
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
