import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { SEO } from '../components/SEO'
import { SiteHeader, SiteFooter } from '../components/SiteLayout'

export function MappingGuide() {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen bg-surface-950 text-surface-200 flex flex-col">
      <SEO
        title={t('mappingGuide.seoTitle')}
        description={t('mappingGuide.seoDescription')}
        path="/how-to-make-an-osu-mania-map"
      />
      <SiteHeader />

      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-12">
          <p className="text-xs font-medium text-accent tracking-widest uppercase mb-3">{t('landing.guide')}</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-surface-100 leading-tight mb-4">
            {t('mappingGuide.title')}
          </h1>
          <p className="text-lg text-surface-400 leading-relaxed max-w-2xl">
            {t('mappingGuide.intro')}
          </p>
        </section>

        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 space-y-10">
          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">{t('mappingGuide.s1Title')}</h2>
            <p className="text-sm text-surface-400 leading-relaxed mb-3">
              {t('mappingGuide.s1Desc')}
            </p>
            <ul className="space-y-1.5 text-sm text-surface-400 list-disc list-inside">
              <li>{t('mappingGuide.s1OsuEditor')}</li>
              <li>{t('mappingGuide.s1AudioEditor')}</li>
              <li>{t('mappingGuide.s1Henkan')}</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">{t('mappingGuide.s2Title')}</h2>
            <p className="text-sm text-surface-400 leading-relaxed">
              {t('mappingGuide.s2Desc')}
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">{t('mappingGuide.s3Title')}</h2>
            <p className="text-sm text-surface-400 leading-relaxed mb-3">
              {t('mappingGuide.s3Desc')}
            </p>
            <ul className="space-y-1.5 text-sm text-surface-400 list-disc list-inside">
              <li>{t('mappingGuide.s3Jack')}</li>
              <li>{t('mappingGuide.s3Trill')}</li>
              <li>{t('mappingGuide.s3Staircase')}</li>
              <li>{t('mappingGuide.s3Chord')}</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">{t('mappingGuide.s4Title')}</h2>
            <p className="text-sm text-surface-400 leading-relaxed">
              {t('mappingGuide.s4Desc')}
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">{t('mappingGuide.s5Title')}</h2>
            <p className="text-sm text-surface-400 leading-relaxed mb-3">
              {t('mappingGuide.s5Desc')}
            </p>
            <ul className="space-y-1.5 text-sm text-surface-400 list-disc list-inside">
              <li>{t('mappingGuide.s5TitleArtist')}</li>
              <li>{t('mappingGuide.s5Creator')}</li>
              <li>{t('mappingGuide.s5DiffName')}</li>
              <li>{t('mappingGuide.s5Audio')}</li>
              <li>{t('mappingGuide.s5Background')}</li>
              <li>{t('mappingGuide.s5Source')}</li>
              <li>{t('mappingGuide.s5Tags')}</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">{t('mappingGuide.s6Title')}</h2>
            <p className="text-sm text-surface-400 leading-relaxed">
              {t('mappingGuide.s6Desc')}
            </p>
          </div>

          <div className="mt-8 p-6 bg-surface-900/50 border border-surface-800/50 rounded-xl">
            <h3 className="text-base font-semibold text-surface-100 mb-2">{t('mappingGuide.ctaTitle')}</h3>
            <p className="text-sm text-surface-400 leading-relaxed mb-4">
              {t('mappingGuide.ctaDesc')}
            </p>
            <Link to="/osu-to-stepmania" className="inline-block px-5 py-2 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent-hover transition-colors">
              {t('landing.openConverter')}
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
