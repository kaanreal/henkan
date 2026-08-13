import { Link } from 'react-router'
import { Trans, useTranslation } from 'react-i18next'
import { SEO } from '../components/SEO'
import { SiteHeader, SiteFooter } from '../components/SiteLayout'

const code = (key: string) => (
  <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">{key}</code>
)

const strong = <strong className="text-surface-200" />

export function ConversionGuide() {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-surface-950 text-surface-200 flex flex-col">
      <SEO
        title={t('conversionGuide.seoTitle')}
        description={t('conversionGuide.seoDescription')}
        path="/how-to-convert-osu-mania-to-stepmania"
      />
      <SiteHeader />

      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-12">
          <p className="text-xs font-medium text-accent tracking-widest uppercase mb-3">{t('landing.guide')}</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-surface-100 leading-tight mb-4">
            {t('conversionGuide.title')}
          </h1>
          <p className="text-lg text-surface-400 leading-relaxed max-w-2xl">
            {t('conversionGuide.intro')}
          </p>
        </section>

        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 space-y-10">
          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">{t('conversionGuide.s1Title')}</h2>
            <ol className="space-y-3 text-surface-400 text-sm leading-relaxed list-decimal list-inside">
              <li><Trans i18nKey="conversionGuide.s1Step1" components={{ osu: code('.osu') }} /></li>
              <li>{t('conversionGuide.s1Step2')}</li>
              <li>{t('conversionGuide.s1Step3')}</li>
              <li><Trans i18nKey="conversionGuide.s1Step4" components={{ strong, sm: code('.sm') }} /></li>
              <li><Trans i18nKey="conversionGuide.s1Step5" components={{ sm: code('.sm') }} /></li>
            </ol>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">{t('conversionGuide.s2Title')}</h2>
            <p className="text-sm text-surface-400 leading-relaxed mb-3">
              <Trans i18nKey="conversionGuide.s2Desc" components={{ osz: code('.osz') }} />
            </p>
            <ol className="space-y-3 text-surface-400 text-sm leading-relaxed list-decimal list-inside">
              <li><Trans i18nKey="conversionGuide.s2Step1" components={{ osz: code('.osz') }} /></li>
              <li>{t('conversionGuide.s2Step2')}</li>
              <li>{t('conversionGuide.s2Step3')}</li>
              <li><Trans i18nKey="conversionGuide.s2Step4" components={{ sm: code('.sm') }} /></li>
            </ol>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">{t('conversionGuide.s3Title')}</h2>
            <p className="text-sm text-surface-400 leading-relaxed mb-3">
              {t('conversionGuide.s3Desc')}
            </p>
            <ol className="space-y-3 text-surface-400 text-sm leading-relaxed list-decimal list-inside">
              <li><Trans i18nKey="conversionGuide.s3Step1" components={{ osu: code('.osu') }} /></li>
              <li>{t('conversionGuide.s3Step2')}</li>
              <li><Trans i18nKey="conversionGuide.s3Step3" components={{ strong }} /></li>
              <li><Trans i18nKey="conversionGuide.s3Step4" components={{ osz: code('.osz') }} /></li>
            </ol>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">{t('conversionGuide.s4Title')}</h2>
            <p className="text-sm text-surface-400 leading-relaxed">
              <Trans i18nKey="conversionGuide.s4Desc" components={{ sm: code('.sm'), osu: code('.osu') }} />
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">{t('conversionGuide.s5Title')}</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-surface-900/50 border border-surface-800/50 rounded-xl p-4">
                <h3 className="text-sm font-medium text-surface-200 mb-1">{t('conversionGuide.preservedTiming')}</h3>
                <p className="text-xs text-surface-500">{t('conversionGuide.preservedTimingDesc')}</p>
              </div>
              <div className="bg-surface-900/50 border border-surface-800/50 rounded-xl p-4">
                <h3 className="text-sm font-medium text-surface-200 mb-1">{t('conversionGuide.preservedHolds')}</h3>
                <p className="text-xs text-surface-500">{t('conversionGuide.preservedHoldsDesc')}</p>
              </div>
              <div className="bg-surface-900/50 border border-surface-800/50 rounded-xl p-4">
                <h3 className="text-sm font-medium text-surface-200 mb-1">{t('conversionGuide.preservedMetadata')}</h3>
                <p className="text-xs text-surface-500">{t('conversionGuide.preservedMetadataDesc')}</p>
              </div>
              <div className="bg-surface-900/50 border border-surface-800/50 rounded-xl p-4">
                <h3 className="text-sm font-medium text-surface-200 mb-1">{t('conversionGuide.preservedMedia')}</h3>
                <p className="text-xs text-surface-500">{t('conversionGuide.preservedMediaDesc')}</p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">{t('conversionGuide.s6Title')}</h2>
            <ul className="space-y-3 text-sm text-surface-400">
              <li>
                <strong className="text-surface-200">{t('conversionGuide.tTimingTitle')}</strong>
                <p className="mt-1">{t('conversionGuide.tTimingDesc')}</p>
              </li>
              <li>
                <strong className="text-surface-200">{t('conversionGuide.tAudioTitle')}</strong>
                <p className="mt-1"><Trans i18nKey="conversionGuide.tAudioDesc" components={{ sm: code('.sm'), audiofile: code('#AUDIOFILE') }} /></p>
              </li>
              <li>
                <strong className="text-surface-200">{t('conversionGuide.tBgTitle')}</strong>
                <p className="mt-1">{t('conversionGuide.tBgDesc')}</p>
              </li>
            </ul>
          </div>

          <div className="mt-8 p-6 bg-surface-900/50 border border-surface-800/50 rounded-xl">
            <h3 className="text-base font-semibold text-surface-100 mb-2">{t('conversionGuide.ctaTitle')}</h3>
            <p className="text-sm text-surface-400 leading-relaxed mb-4">
              {t('conversionGuide.ctaDesc')}
            </p>
            <Link to="/" className="inline-block px-5 py-2 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent-hover transition-colors">
              {t('landing.openConverter')}
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
