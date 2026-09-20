import { useEffect } from 'react'
import { Link } from 'react-router'
import { useT } from '../i18n'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { SiteFooter, SiteHeader } from '../components/SiteLayout'
import { isTauri } from '../services/environment'
import { openDirectory } from '../services/dialogs'
import { openFile, openUrl } from '../services/platform'
import { useOsuLibraryStore } from '../stores/useOsuLibraryStore'
import { OsuLibraryProgress } from '../components/OsuLibraryProgress'

const OSU_DOWNLOAD_URL = 'https://osu.ppy.sh/home/download'

export function SettingsPage() {
  const t = useT()
  const library = useOsuLibraryStore(s => s.library)
  const status = useOsuLibraryStore(s => s.status)
  const scanning = useOsuLibraryStore(s => s.scanning)
  const scanProgress = useOsuLibraryStore(s => s.scanProgress)
  const error = useOsuLibraryStore(s => s.error)
  const refreshStatus = useOsuLibraryStore(s => s.refreshStatus)
  const scan = useOsuLibraryStore(s => s.scan)
  const clearError = useOsuLibraryStore(s => s.clearError)

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  const handleScan = async () => {
    clearError()
    let root = status?.root || library?.root || null
    if (!root) root = await openDirectory({ title: t('osuLibrary.chooseFolderTitle') })
    if (root) await scan(root)
  }

  const handleChooseFolder = async () => {
    clearError()
    const root = await openDirectory({ title: t('osuLibrary.chooseFolderTitle') })
    if (root) await scan(root)
  }

  return (
    <div className="min-h-screen bg-surface-950 text-surface-200">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-accent">{t('settings.badge')}</p>
        <h1 className="text-3xl font-bold tracking-tight text-surface-100">{t('settings.title')}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-surface-500">{t('settings.description')}</p>

        <div className="mt-8 space-y-4">
          <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-sm font-semibold text-surface-200">{t('settings.osuLibraryTitle')}</h2>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-surface-500">{t('settings.osuLibraryDescription')}</p>
              </div>
              <span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-medium ${library ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/[0.06] text-surface-500'}`}>
                {library ? t('settings.indexReady') : t('settings.notIndexed')}
              </span>
            </div>

            <div className="mt-5 rounded-xl border border-white/6 bg-black/10 px-3.5 py-3">
              <p className="text-[10px] font-medium uppercase tracking-widest text-surface-600">{t('settings.installationFolder')}</p>
              <p className="mt-1 break-all font-mono text-xs text-surface-400">
                {library?.root || status?.root || t('settings.folderNotSelected')}
              </p>
            </div>

            {error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleScan()}
                disabled={!isTauri() || scanning}
                className="flex items-center gap-2 rounded-xl bg-accent px-3.5 py-2.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {scanning && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                {scanning ? t('osuLibrary.scanning') : t('settings.scanLibrary')}
              </button>
              <button
                type="button"
                onClick={() => void handleChooseFolder()}
                disabled={!isTauri() || scanning}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-xs font-medium text-surface-400 transition-colors hover:bg-white/[0.08] hover:text-surface-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('osuLibrary.chooseFolder')}
              </button>
              {library && (
                <button
                  type="button"
                  onClick={() => void openFile(library.root)}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-xs font-medium text-surface-400 transition-colors hover:bg-white/[0.08] hover:text-surface-200"
                >
                  {t('osuLibrary.openFolder')}
                </button>
              )}
              <Link
                to="/osu-library"
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-xs font-medium text-surface-400 transition-colors hover:bg-white/[0.08] hover:text-surface-200"
              >
                {t('settings.openLibrary')}
              </Link>
              <button
                type="button"
                onClick={() => void openUrl(OSU_DOWNLOAD_URL)}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-xs font-medium text-surface-400 transition-colors hover:bg-white/[0.08] hover:text-surface-200"
              >
                {t('settings.osuInstallationLink')}
              </button>
            </div>

            {scanning && <div className="mt-4"><OsuLibraryProgress progress={scanProgress} /></div>}

            {library && (
              <p className="mt-4 text-[11px] text-surface-600">
                {t('settings.indexSummary', { skins: library.skins.length })}
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-surface-200">{t('settings.interfaceTitle')}</h2>
                <p className="mt-1 text-xs text-surface-500">{t('settings.interfaceDescription')}</p>
              </div>
              <LanguageSwitcher />
            </div>
          </section>

          <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-5 sm:p-6">
            <h2 className="text-sm font-semibold text-surface-200">{t('settings.featuresTitle')}</h2>
            <p className="mt-1 text-xs text-surface-500">{t('settings.featuresDescription')}</p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {[
                ['settings.featureConverter', '/'],
                ['settings.featureRate', '/'],
                ['settings.featurePreview', '/'],
                ['settings.featureLiveHook', '/'],
                ['settings.featureSkins', '/skin-converter'],
                ['settings.featurePacks', '/osu-mania-pack-creator'],
              ].map(([key, to]) => (
                <Link
                  key={key}
                  to={to}
                  className="flex items-center justify-between rounded-xl border border-white/6 bg-white/[0.02] px-3.5 py-3 text-xs text-surface-400 transition-colors hover:border-white/12 hover:bg-white/[0.05] hover:text-surface-200"
                >
                  {t(key as 'settings.featureConverter')}
                  <span className="text-surface-600">→</span>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
