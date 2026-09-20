import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useT } from '../i18n'
import { isTauri } from '../services/environment'
import { openDirectory } from '../services/dialogs'
import { openFile } from '../services/platform'
import { archiveSkinFolderPath, setPendingSkinInput } from '../services/skinInput'
import type { OsuLibrarySkin } from '../lib/osuLibrary'
import { useOsuLibraryStore } from '../stores/useOsuLibraryStore'
import { OsuLibraryProgress } from '../components/OsuLibraryProgress'
import { SkinLibraryPreview } from '../components/SkinLibraryPreview'
import { SiteFooter, SiteHeader } from '../components/SiteLayout'

function skinSearchText(skin: OsuLibrarySkin): string {
  return [skin.name, skin.author, skin.path].join(' ').toLowerCase()
}

function SkinCard({ skin }: { skin: OsuLibrarySkin }) {
  const t = useT()
  const navigate = useNavigate()
  const [noteIcon, setNoteIcon] = useState<string | null>(null)
  const handleNoteIcon = useCallback((url: string | null) => setNoteIcon(url), [])
  const addToConverter = useCallback(async () => {
    const input = skin.archive ? skin.path : await archiveSkinFolderPath(skin.path)
    setPendingSkinInput(input)
    navigate('/skin-converter')
  }, [navigate, skin.archive, skin.path])
  return (
    <article className="skin-library-card group">
      <div className="skin-library-card__preview">
        <SkinLibraryPreview skin={skin} onNoteIcon={handleNoteIcon} />
      </div>
      <div className="skin-library-card__content">
        <div className="flex min-w-0 items-start gap-2">
          <div className="skin-library-card__icon">
            {noteIcon && <img src={noteIcon} alt="" draggable="false" />}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-medium text-surface-200" title={skin.path}>{skin.name}</h3>
            <p className="mt-0.5 truncate text-xs text-surface-500">{skin.author || t('osuLibrary.unknownAuthor')}</p>
          </div>
          <button type="button" onClick={() => void addToConverter()} className="skin-library-card__open shrink-0" aria-label={t('osuLibrary.open')}>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5H19.5V10.5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 13.5L19.25 4.75" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5V18.25C19.5 18.94 18.94 19.5 18.25 19.5H5.75C5.06 19.5 4.5 18.94 4.5 18.25V5.75C4.5 5.06 5.06 4.5 5.75 4.5H10.5" />
            </svg>
          </button>
        </div>
        <div className="skin-library-card__meta">
          <span>{skin.fileCount.toLocaleString()} {t('osuLibrary.files')}</span>
          <span className="skin-library-card__type">{skin.archive ? t('osuLibrary.archive') : t('osuLibrary.folder')}</span>
        </div>
      </div>
    </article>
  )
}

export function OsuLibraryPage() {
  const t = useT()
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const library = useOsuLibraryStore(s => s.library)
  const status = useOsuLibraryStore(s => s.status)
  const scanning = useOsuLibraryStore(s => s.scanning)
  const scanProgress = useOsuLibraryStore(s => s.scanProgress)
  const hydrating = useOsuLibraryStore(s => s.hydrating)
  const error = useOsuLibraryStore(s => s.error)
  const refreshStatus = useOsuLibraryStore(s => s.refreshStatus)
  const scan = useOsuLibraryStore(s => s.scan)
  const clearError = useOsuLibraryStore(s => s.clearError)

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  const matchingSkins = useMemo(() => {
    if (!library) return []
    return library.skins.filter(skin => !deferredQuery || skinSearchText(skin).includes(deferredQuery))
  }, [deferredQuery, library])

  const visibleSkins = matchingSkins.slice(0, 200)

  const handleScan = async () => {
    clearError()
    let root = status?.root || library?.root || null
    if (!root) root = await openDirectory({ title: t('osuLibrary.chooseFolderTitle') })
    if (!root) return
    await scan(root)
  }

  const handleChooseFolder = async () => {
    clearError()
    const root = await openDirectory({ title: t('osuLibrary.chooseFolderTitle') })
    if (root) await scan(root)
  }

  return (
    <div className="min-h-screen bg-surface-950 text-surface-200">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-5 border-b border-white/8 pb-7 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-widest text-accent">{t('osuLibrary.badge')}</p>
            <h1 className="text-3xl font-bold tracking-tight text-surface-100 sm:text-4xl">{t('osuLibrary.title')}</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-surface-500">{t('osuLibrary.description')}</p>
          </div>
          {library && (
            <div className="max-w-xs border-l border-white/10 pl-4 text-right">
              <p className="text-[10px] font-medium uppercase tracking-widest text-surface-600">{t('settings.installationFolder')}</p>
              <p className="mt-1 truncate font-mono text-xs text-surface-400" title={library.root}>{library.root}</p>
            </div>
          )}
        </div>

        {!isTauri() ? (
          <div className="mt-10 rounded-2xl border border-white/8 bg-white/[0.03] p-6 text-sm text-surface-400">
            {t('osuLibrary.desktopOnly')}
          </div>
        ) : hydrating ? (
          <div className="mt-10 rounded-2xl border border-white/8 bg-white/[0.025] p-6 sm:p-8">
            <div className="h-4 w-32 animate-pulse rounded bg-white/[0.08]" />
            <div className="mt-4 h-10 w-full animate-pulse rounded-xl bg-white/[0.05]" />
            <div className="mt-5 h-32 animate-pulse rounded-2xl bg-white/[0.04]" />
          </div>
        ) : !library ? (
          <div className="mt-10 overflow-hidden rounded-2xl border border-white/8 bg-white/[0.025]">
            <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:p-8">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent/10 text-accent-muted">
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75A2.25 2.25 0 016 4.5h4.19a2.25 2.25 0 011.59.66l1.06 1.06a2.25 2.25 0 001.59.66H18a2.25 2.25 0 012.25 2.25v8.12A2.25 2.25 0 0118 19.5H6a2.25 2.25 0 01-2.25-2.25V6.75z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 14.25l1.75-1.75 1.5 1.5 2.75-3 2 2" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-surface-200">{t('osuLibrary.emptyTitle')}</p>
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-surface-500">{t('osuLibrary.emptyDescription')}</p>
              </div>
              <button
                type="button"
                onClick={() => void handleScan()}
                disabled={scanning}
                className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-wait disabled:opacity-50"
              >
                {scanning && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                {scanning ? t('osuLibrary.scanning') : t('osuLibrary.chooseFolder')}
              </button>
            </div>
            {scanning && <div className="border-t border-white/6 px-6 py-4 sm:px-8"><OsuLibraryProgress progress={scanProgress} /></div>}
          </div>
        ) : (
          <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_15rem]">
            <section className="min-w-0">
              <div className="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.025]">
                <div className="p-3">
                  <label className="relative block">
                    <span className="sr-only">{t('osuLibrary.search')}</span>
                    <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.1-5.15a6.25 6.25 0 11-12.5 0 6.25 6.25 0 0112.5 0z" />
                    </svg>
                    <input
                      value={query}
                      onChange={event => setQuery(event.target.value)}
                      placeholder={t('osuLibrary.searchPlaceholder')}
                      className="h-11 w-full rounded-xl border border-white/8 bg-black/10 pl-9 pr-3 text-sm text-surface-200 outline-none placeholder:text-surface-600 focus:border-accent/50"
                    />
                  </label>
                </div>
                <div className="flex items-center justify-end border-t border-white/6 px-3 py-2 text-[11px] tabular-nums text-surface-600">
                  {visibleSkins.length.toLocaleString()} / {matchingSkins.length.toLocaleString()}
                </div>
              </div>

              {error && <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>}

              {visibleSkins.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.02] px-6 py-14 text-center text-sm text-surface-500">
                  {t('osuLibrary.noResults')}
                </div>
              ) : (
                <section className="mt-5 overflow-hidden rounded-2xl bg-surface-950 shadow-[0_18px_42px_rgb(0_0_0_/_0.18)]">
                  <div className="flex items-center justify-between px-5 py-4">
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-surface-400">{t('osuLibrary.skins')}</h2>
                    <span className="text-[11px] tabular-nums text-surface-600">{matchingSkins.length.toLocaleString()}</span>
                  </div>
                  <div className="skin-library-grid">{visibleSkins.map(skin => <SkinCard key={skin.path} skin={skin} />)}</div>
                </section>
              )}
              {matchingSkins.length > visibleSkins.length && (
                <p className="mt-4 text-center text-xs text-surface-600">{t('osuLibrary.resultLimit', { count: visibleSkins.length })}</p>
              )}
            </section>

            <aside className="space-y-3">
              <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-surface-400">{t('osuLibrary.results')}</h2>
                <dl className="mt-4 divide-y divide-white/6 text-xs">
                  <div className="flex items-center justify-between py-2 first:pt-0"><dt className="text-surface-500">{t('osuLibrary.skins')}</dt><dd className="font-medium tabular-nums text-surface-200">{library.skins.length.toLocaleString()}</dd></div>
                  <div className="flex items-center justify-between py-2 last:pb-0"><dt className="text-surface-500">{t('osuLibrary.lastScanned')}</dt><dd className="font-medium text-surface-200">{new Date(library.scannedAt * 1000).toLocaleDateString()}</dd></div>
                </dl>
              </section>
              <section className="rounded-2xl border border-white/8 bg-white/[0.025] p-4">
                <button
                  type="button"
                  onClick={() => void handleScan()}
                  disabled={scanning}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-xs font-medium text-white transition-colors hover:bg-accent-hover disabled:cursor-wait disabled:opacity-50"
                >
                  {scanning && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                  {scanning ? t('osuLibrary.scanning') : t('osuLibrary.scanAgain')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleChooseFolder()}
                  disabled={scanning}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs font-medium text-surface-400 transition-colors hover:bg-white/[0.08] hover:text-surface-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('osuLibrary.chooseFolder')}
                </button>
                <button
                  type="button"
                  onClick={() => void openFile(library.root)}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs font-medium text-surface-400 transition-colors hover:bg-white/[0.08] hover:text-surface-200"
                >
                  {t('osuLibrary.openFolder')}
                </button>
                {scanning && <div className="mt-3"><OsuLibraryProgress progress={scanProgress} /></div>}
              </section>
            </aside>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}
