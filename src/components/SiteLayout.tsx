import { Link } from 'react-router'
import { useT } from '../i18n'

export function SiteFooter() {
  const t = useT()
  return (
    <footer className="border-t border-surface-800/50 bg-surface-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 text-xs text-surface-500">
          <div>
            <h4 className="font-medium text-surface-300 mb-2">{t('siteFooter.tools')}</h4>
            <ul className="space-y-1.5">
              <li><Link to="/skin-converter" className="hover:text-surface-300 transition-colors">{t('siteFooter.skinConverter')}</Link></li>
              <li><Link to="/?tool=mirror" className="hover:text-surface-300 transition-colors">{t('siteFooter.mapMirror')}</Link></li>
              <li><Link to="/osu-mania-pack-creator" className="hover:text-surface-300 transition-colors">{t('siteFooter.packConverter')}</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-surface-300 mb-2">Documentation</h4>
            <ul className="space-y-1.5">
              <li><Link to="/docs" className="hover:text-surface-300 transition-colors">Overview</Link></li>
              <li><Link to="/docs#convert-a-map" className="hover:text-surface-300 transition-colors">{t('siteFooter.convertingMaps')}</Link></li>
              <li><Link to="/docs#batch-conversion" className="hover:text-surface-300 transition-colors">{t('siteFooter.packCreator')}</Link></li>
              <li><Link to="/docs#troubleshooting" className="hover:text-surface-300 transition-colors">Troubleshooting</Link></li>
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
