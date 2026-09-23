import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useT } from '../i18n'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { SiteFooter } from '../components/SiteLayout'
import { AppHeader } from '../components/Header'
import { OsuLibraryProgress } from '../components/OsuLibraryProgress'
import { isTauri } from '../services/environment'
import { openDirectory } from '../services/dialogs'
import { openFile, openUrl } from '../services/platform'
import { useOsuLibraryStore } from '../stores/useOsuLibraryStore'
import { useInterfaceSettingsStore } from '../stores/useInterfaceSettingsStore'
import { useGameIntegrationsStore } from '../stores/useGameIntegrationsStore'
import { hasDetectedGame } from '../lib/gameIntegrations'

const OSU_DOWNLOAD_URL = 'https://osu.ppy.sh/home/download'

function SettingsCard({ children }: { children: ReactNode }) {
  return <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-5 sm:p-6">{children}</section>
}

function SettingsSwitch({ checked, label, disabled = false, onChange }: {
  checked: boolean
  label: string
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:cursor-not-allowed disabled:opacity-40 ${checked ? 'border-accent bg-accent' : 'border-white/15 bg-white/[0.06]'}`}
    >
      <span className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )
}

function SettingsRow({ title, description, children }: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-5 py-4 first:pt-0 last:pb-0">
      <div>
        <h3 className="text-sm font-medium text-surface-200">{title}</h3>
        <p className="mt-1 max-w-xl text-xs leading-relaxed text-surface-500">{description}</p>
      </div>
      {children}
    </div>
  )
}

function FolderPath({ label, path }: { label: string; path: string }) {
  return (
    <div className="rounded-xl border border-white/6 bg-black/10 px-3.5 py-3">
      <p className="text-[10px] font-medium uppercase tracking-widest text-surface-600">{label}</p>
      <p className="mt-1 break-all font-mono text-xs text-surface-400">{path}</p>
    </div>
  )
}

export function SettingsPage() {
  const t = useT()
  const desktop = isTauri()
  const library = useOsuLibraryStore(s => s.library)
  const status = useOsuLibraryStore(s => s.status)
  const scanning = useOsuLibraryStore(s => s.scanning)
  const scanProgress = useOsuLibraryStore(s => s.scanProgress)
  const error = useOsuLibraryStore(s => s.error)
  const refreshStatus = useOsuLibraryStore(s => s.refreshStatus)
  const scan = useOsuLibraryStore(s => s.scan)
  const clearError = useOsuLibraryStore(s => s.clearError)
  const showFallingArrows = useInterfaceSettingsStore(s => s.showFallingArrows)
  const osuHookEnabled = useInterfaceSettingsStore(s => s.osuHookEnabled)
  const etternaHookEnabled = useInterfaceSettingsStore(s => s.etternaHookEnabled)
  const setShowFallingArrows = useInterfaceSettingsStore(s => s.setShowFallingArrows)
  const setOsuHookEnabled = useInterfaceSettingsStore(s => s.setOsuHookEnabled)
  const setEtternaHookEnabled = useInterfaceSettingsStore(s => s.setEtternaHookEnabled)
  const installations = useGameIntegrationsStore(s => s.installations)
  const gameFoldersEnabled = useGameIntegrationsStore(s => s.enabled)
  const detectGameIntegrations = useGameIntegrationsStore(s => s.detect)
  const setGameFoldersEnabled = useGameIntegrationsStore(s => s.setEnabled)
  const hasGameFolders = hasDetectedGame(installations)

  useEffect(() => {
    if (!desktop) return
    void refreshStatus()
    void detectGameIntegrations()
  }, [desktop, detectGameIntegrations, refreshStatus])

  const scanLibrary = async (chooseFolder: boolean) => {
    clearError()
    let root = chooseFolder ? null : status?.root || library?.root || null
    if (!root) root = await openDirectory({ title: t('osuLibrary.chooseFolderTitle') })
    if (root) await scan(root)
  }

  return (
    <div className="min-h-screen bg-surface-950 text-surface-200">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="mb-2 text-xs font-medium uppercase tracking-widest text-accent">{t('settings.badge')}</p>
        <h1 className="text-3xl font-bold tracking-tight text-surface-100">{t('settings.title')}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-surface-500">{t('settings.description')}</p>

        <div className="mt-8 space-y-4">
          <SettingsCard>
            <h2 className="text-sm font-semibold text-surface-200">{t('settings.interfaceTitle')}</h2>
            <p className="mt-1 text-xs text-surface-500">{t('settings.interfaceDescription')}</p>
            <div className="mt-5 divide-y divide-white/6 border-t border-white/6 pt-4">
              <SettingsRow title={t('settings.languageTitle')} description={t('settings.languageDescription')}>
                <LanguageSwitcher />
              </SettingsRow>
              <SettingsRow title={t('settings.fallingArrowsTitle')} description={t('settings.fallingArrowsDescription')}>
                <SettingsSwitch checked={showFallingArrows} label={t('settings.fallingArrowsTitle')} onChange={setShowFallingArrows} />
              </SettingsRow>
            </div>
          </SettingsCard>

          {desktop && (
            <>
              <SettingsCard>
                <h2 className="text-sm font-semibold text-surface-200">{t('settings.desktopTitle')}</h2>
                <p className="mt-1 text-xs text-surface-500">{t('settings.desktopDescription')}</p>
                <div className="mt-5 divide-y divide-white/6 border-t border-white/6 pt-4">
                  <SettingsRow title={t('settings.osuHookTitle')} description={t('settings.osuHookDescription')}>
                    <SettingsSwitch checked={osuHookEnabled} label={t('settings.osuHookTitle')} onChange={setOsuHookEnabled} />
                  </SettingsRow>
                  <SettingsRow title={t('settings.etternaHookTitle')} description={t('settings.etternaHookDescription')}>
                    <SettingsSwitch checked={etternaHookEnabled} label={t('settings.etternaHookTitle')} onChange={setEtternaHookEnabled} />
                  </SettingsRow>
                </div>
              </SettingsCard>

              <SettingsCard>
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <h2 className="text-sm font-semibold text-surface-200">{t('settings.gameFoldersTitle')}</h2>
                    <p className="mt-1 max-w-xl text-xs leading-relaxed text-surface-500">{t('settings.gameFoldersDescription')}</p>
                  </div>
                  <SettingsSwitch checked={gameFoldersEnabled} label={t('settings.gameFoldersTitle')} disabled={!hasGameFolders} onChange={setGameFoldersEnabled} />
                </div>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  {installations?.osu.songs && <FolderPath label="osu!stable" path={installations.osu.songs} />}
                  {installations?.etterna.songs && <FolderPath label="Etterna" path={installations.etterna.songs} />}
                  {!hasGameFolders && <p className="text-xs text-surface-500">{t('settings.noGameFoldersFound')}</p>}
                </div>
              </SettingsCard>

              <SettingsCard>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold text-surface-200">{t('settings.osuLibraryTitle')}</h2>
                    <p className="mt-1 max-w-xl text-xs leading-relaxed text-surface-500">{t('settings.osuLibraryDescription')}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${library ? 'bg-emerald-400/10 text-emerald-300' : 'bg-white/[0.06] text-surface-500'}`}>
                    {library ? t('settings.indexReady') : t('settings.notIndexed')}
                  </span>
                </div>
                <div className="mt-5">
                  <FolderPath label={t('settings.installationFolder')} path={library?.root || status?.root || t('settings.folderNotSelected')} />
                </div>
                {error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void scanLibrary(false)} disabled={scanning} className="henkan-button px-3.5 py-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-50">{scanning ? t('osuLibrary.scanning') : t('settings.scanLibrary')}</button>
                  <button type="button" onClick={() => void scanLibrary(true)} disabled={scanning} className="henkan-button px-3.5 py-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-50">{t('osuLibrary.chooseFolder')}</button>
                  {library && <button type="button" onClick={() => void openFile(library.root)} className="henkan-button px-3.5 py-2.5 text-xs">{t('osuLibrary.openFolder')}</button>}
                  <Link to="/osu-library" className="henkan-button px-3.5 py-2.5 text-xs">{t('settings.openLibrary')}</Link>
                  <button type="button" onClick={() => void openUrl(OSU_DOWNLOAD_URL)} className="henkan-button px-3.5 py-2.5 text-xs">{t('settings.osuInstallationLink')}</button>
                </div>
                {scanning && <div className="mt-4"><OsuLibraryProgress progress={scanProgress} /></div>}
                {library && <p className="mt-4 text-[11px] text-surface-600">{t('settings.indexSummary', { skins: library.skins.length })}</p>}
              </SettingsCard>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
