import { Link } from 'react-router'
import { Trans, useT } from '../i18n'
import { SEO } from '../components/SEO'
import { SiteHeader, SiteFooter } from '../components/SiteLayout'

const code = (key: string) => (
  <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">{key}</code>
)

export function PackCreatorPage() {
  const t = useT()
  return (
    <div className="min-h-screen bg-surface-950 text-surface-200 flex flex-col">
      <SEO
        title={t('packCreator.seoTitle')}
        description={t('packCreator.seoDescription')}
        path="/osu-mania-pack-creator"
      />
      <SiteHeader />

      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-12">
          <p className="text-xs font-medium text-accent tracking-widest uppercase mb-3">{t('packCreator.badge')}</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-surface-100 leading-tight mb-4">
            {t('packCreator.title')}
          </h1>
          <p className="text-lg text-surface-400 leading-relaxed max-w-2xl">
            {t('packCreator.intro')}
          </p>
        </section>

        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
          <div className="rounded-2xl overflow-hidden border border-surface-800/50 mb-12">
            <img src="/screenshots/pack-conversion.png" alt={t('packCreator.screenshotAlt')} className="w-full" />
          </div>

          <div className="space-y-10">
            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">{t('packCreator.howItWorks')}</h2>
              <ol className="space-y-3 text-surface-400 text-sm leading-relaxed list-decimal list-inside">
                <li><Trans i18nKey="packCreator.step1" components={{ sm: code('.sm') }} /></li>
                <li>{t('packCreator.step2')}</li>
                <li>{t('packCreator.step3')}</li>
                <li>{t('packCreator.step4')}</li>
                <li><Trans i18nKey="packCreator.step5" components={{ osz: code('.osz') }} /></li>
              </ol>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">{t('packCreator.supportedTypes')}</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-surface-900/50 border border-surface-800/50 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-surface-200 mb-1">{t('packCreator.etternaPacks')}</h3>
                  <p className="text-xs text-surface-500"><Trans i18nKey="packCreator.etternaPacksDesc" components={{ sm: code('.sm') }} /></p>
                </div>
                <div className="bg-surface-900/50 border border-surface-800/50 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-surface-200 mb-1">{t('packCreator.osuSongs')}</h3>
                  <p className="text-xs text-surface-500"><Trans i18nKey="packCreator.osuSongsDesc" components={{ osu: code('.osu'), sm: code('.sm') }} /></p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">{t('packCreator.bannerSupport')}</h2>
              <p className="text-sm text-surface-400 leading-relaxed">
                {t('packCreator.bannerSupportDesc')}
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">{t('packCreator.whyTitle')}</h2>
              <p className="text-sm text-surface-400 leading-relaxed">
                {t('packCreator.whyDesc')}
              </p>
            </div>
          </div>

          <div className="mt-12 flex flex-col sm:flex-row gap-3">
            <Link to="/" className="px-6 py-3 rounded-xl bg-accent text-white font-medium text-sm text-center hover:bg-accent-hover transition-colors">
              {t('landing.openConverter')}
            </Link>
            <Link to="/how-to-convert-osu-mania-to-stepmania" className="px-6 py-3 rounded-xl bg-surface-800 border border-surface-700/40 text-surface-300 font-medium text-sm text-center hover:bg-surface-700 hover:text-surface-100 transition-colors">
              {t('landing.readConversionGuide')}
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
