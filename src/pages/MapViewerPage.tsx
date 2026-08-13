import { Link } from 'react-router'
import { Trans, useT } from '../i18n'
import { SEO } from '../components/SEO'
import { SiteHeader, SiteFooter } from '../components/SiteLayout'

const code = (key: string) => (
  <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">{key}</code>
)

const kbd = (key: string) => <td className="px-4 py-2 font-mono text-xs">{key}</td>

export function MapViewerPage() {
  const t = useT()
  return (
    <div className="min-h-screen bg-surface-950 text-surface-200 flex flex-col">
      <SEO
        title={t('mapViewer.seoTitle')}
        description={t('mapViewer.seoDescription')}
        path="/osu-mania-map-viewer"
      />
      <SiteHeader />

      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-12">
          <p className="text-xs font-medium text-accent tracking-widest uppercase mb-3">{t('mapViewer.badge')}</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-surface-100 leading-tight mb-4">
            {t('mapViewer.title')}
          </h1>
          <p className="text-lg text-surface-400 leading-relaxed max-w-2xl">
            {t('mapViewer.intro')}
          </p>
        </section>

        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
          <div className="rounded-2xl overflow-hidden border border-surface-800/50 mb-12">
            <img src="/screenshots/preview.png" alt={t('mapViewer.screenshotAlt')} className="w-full" />
          </div>

          <div className="space-y-10">
            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">{t('mapViewer.previewFeatures')}</h2>
              <ul className="space-y-2 text-sm text-surface-400">
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><Trans i18nKey="mapViewer.featureCanvas" /></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><Trans i18nKey="mapViewer.featureHitsound" /></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><Trans i18nKey="mapViewer.featureScroll" /></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><Trans i18nKey="mapViewer.featureRate" /></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><Trans i18nKey="mapViewer.featureDensity" /></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><Trans i18nKey="mapViewer.featurePreviewPoint" /></span>
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">{t('mapViewer.shortcuts')}</h2>
              <div className="bg-surface-900/50 border border-surface-800/50 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-800/50">
                      <th className="text-left px-4 py-2.5 text-surface-400 font-medium">{t('mapViewer.key')}</th>
                      <th className="text-left px-4 py-2.5 text-surface-400 font-medium">{t('mapViewer.action')}</th>
                    </tr>
                  </thead>
                  <tbody className="text-surface-300">
                    <tr className="border-b border-surface-800/30">{kbd('Space')}<td className="px-4 py-2">{t('mapViewer.shortcutOpenPlay')}</td></tr>
                    <tr className="border-b border-surface-800/30">{kbd('Esc')}<td className="px-4 py-2">{t('mapViewer.shortcutClose')}</td></tr>
                    <tr className="border-b border-surface-800/30">{kbd('Right-click')}<td className="px-4 py-2">{t('mapViewer.shortcutPlayPause')}</td></tr>
                    <tr className="border-b border-surface-800/30">{kbd('Ctrl+Scroll')}<td className="px-4 py-2">{t('mapViewer.shortcutRate')}</td></tr>
                    <tr className="border-b border-surface-800/30">{kbd('Alt+Scroll')}<td className="px-4 py-2">{t('mapViewer.shortcutVolume')}</td></tr>
                    <tr className="border-b border-surface-800/30">{kbd('Tab')}<td className="px-4 py-2">{t('mapViewer.shortcutPreviewPoint')}</td></tr>
                    <tr>{kbd('H')}<td className="px-4 py-2">{t('mapViewer.shortcutHitsounds')}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">{t('mapViewer.howToUse')}</h2>
              <ol className="space-y-3 text-surface-400 text-sm leading-relaxed list-decimal list-inside">
                <li><Trans i18nKey="mapViewer.howToStep1" components={{ osu: code('.osu'), osz: code('.osz'), sm: code('.sm') }} /></li>
                <li>{t('mapViewer.howToStep2')}</li>
                <li>{t('mapViewer.howToStep3')}</li>
                <li>{t('mapViewer.howToStep4')}</li>
              </ol>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">{t('mapViewer.whyPreview')}</h2>
              <p className="text-sm text-surface-400 leading-relaxed">
                {t('mapViewer.whyPreviewDesc')}
              </p>
            </div>
          </div>

          <div className="mt-12 flex flex-col sm:flex-row gap-3">
            <Link to="/" className="px-6 py-3 rounded-xl bg-accent text-white font-medium text-sm text-center hover:bg-accent-hover transition-colors">
              {t('landing.openConverter')}
            </Link>
            <Link to="/osu-to-stepmania" className="px-6 py-3 rounded-xl bg-surface-800 border border-surface-700/40 text-surface-300 font-medium text-sm text-center hover:bg-surface-700 hover:text-surface-100 transition-colors">
              {t('landing.convertBeatmaps')}
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
