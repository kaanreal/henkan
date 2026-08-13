import { Link } from 'react-router'
import { Trans, useT } from '../i18n'
import { SEO } from '../components/SEO'
import { SiteHeader, SiteFooter } from '../components/SiteLayout'

const code = (key: string) => (
  <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">{key}</code>
)

export function ConvertPage() {
  const t = useT()
  return (
    <div className="min-h-screen bg-surface-950 text-surface-200 flex flex-col">
      <SEO
        title={t('convertPage.seoTitle')}
        description={t('convertPage.seoDescription')}
        path="/osu-to-stepmania"
      />
      <SiteHeader />

      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-12">
          <p className="text-xs font-medium text-accent tracking-widest uppercase mb-3">{t('convertPage.badge')}</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-surface-100 leading-tight mb-4">
            {t('convertPage.title')}
          </h1>
          <p className="text-lg text-surface-400 leading-relaxed max-w-2xl">
            <Trans i18nKey="convertPage.intro" components={{ osu: code('.osu'), osz: code('.osz'), sm: code('.sm') }} />
          </p>
        </section>

        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
          <div className="rounded-2xl overflow-hidden border border-surface-800/50 mb-12">
            <img src="/screenshots/main-menu.png" alt={t('convertPage.screenshotAlt')} className="w-full" />
          </div>

          <div className="space-y-10">
            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">{t('convertPage.whatItConverts')}</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-surface-900/50 border border-surface-800/50 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-surface-200 mb-1">{t('convertPage.osuToEtterna')}</h3>
                  <p className="text-xs text-surface-500"><Trans i18nKey="convertPage.osuToEtternaDesc" components={{ osu: code('.osu'), osz: code('.osz'), sm: code('.sm') }} /></p>
                </div>
                <div className="bg-surface-900/50 border border-surface-800/50 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-surface-200 mb-1">{t('convertPage.etternaToOsu')}</h3>
                  <p className="text-xs text-surface-500"><Trans i18nKey="convertPage.etternaToOsuDesc" components={{ osu: code('.osu'), sm: code('.sm') }} /></p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">{t('convertPage.keyFeatures')}</h2>
              <ul className="space-y-2 text-sm text-surface-400">
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><Trans i18nKey="convertPage.featureTiming" /></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><Trans i18nKey="convertPage.featureMetadata" /></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><Trans i18nKey="convertPage.featureHolds" /></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><Trans i18nKey="convertPage.featureDifficulties" /></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><Trans i18nKey="convertPage.featureRate" /></span>
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">{t('convertPage.beatmapSearch')}</h2>
              <p className="text-sm text-surface-400 leading-relaxed">
                {t('convertPage.beatmapSearchDesc')}
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">{t('convertPage.previewTitle')}</h2>
              <p className="text-sm text-surface-400 leading-relaxed">
                {t('convertPage.previewDesc')}
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">{t('convertPage.crossPlatform')}</h2>
              <p className="text-sm text-surface-400 leading-relaxed">
                {t('convertPage.crossPlatformDesc')}
              </p>
            </div>
          </div>

          <div className="mt-12 flex flex-col sm:flex-row gap-3">
            <Link to="/" className="px-6 py-3 rounded-xl bg-accent text-white font-medium text-sm text-center hover:bg-accent-hover transition-colors">
              {t('landing.openConverter')}
            </Link>
            <Link to="/osu-mania-pack-creator" className="px-6 py-3 rounded-xl bg-surface-800 border border-surface-700/40 text-surface-300 font-medium text-sm text-center hover:bg-surface-700 hover:text-surface-100 transition-colors">
              {t('landing.batchConvertPacks')}
            </Link>
            <Link to="/how-to-convert-osu-mania-to-stepmania" className="px-6 py-3 rounded-xl bg-surface-800 border border-surface-700/40 text-surface-300 font-medium text-sm text-center hover:bg-surface-700 hover:text-surface-100 transition-colors">
              {t('landing.conversionGuide')}
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
