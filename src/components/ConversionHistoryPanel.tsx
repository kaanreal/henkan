import { useDeferredValue, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useT } from '../i18n'
import { isTauri } from '../services/environment'
import { openDirectory, openFiles } from '../services/dialogs'
import { openFile } from '../services/platform'
import { setPendingConversionReplay, type ConversionKind, type ConversionRecord, type ConversionReplay } from '../services/conversionLibrary'
import { useConversionLibraryStore } from '../stores/useConversionLibraryStore'

function recordSearchText(record: ConversionRecord): string {
  return [
    record.title,
    record.artist,
    record.creator,
    record.sourceName,
    record.outputFormat,
    ...record.outputNames,
  ].join(' ').toLowerCase()
}

function kindLabel(t: ReturnType<typeof useT>, kind: ConversionKind): string {
  if (kind === 'pack') return t('library.pack')
  if (kind === 'skin') return t('library.skin')
  return t('library.beatmap')
}

function directionLabel(t: ReturnType<typeof useT>, direction: ConversionRecord['direction']): string {
  return direction === 'osu-to-etterna' ? t('library.osuToEtterna') : t('library.etternaToOsu')
}

function formatOutput(record: ConversionRecord): string {
  if (record.outputFormat === 'folder') return 'folder'
  return record.outputFormat.toUpperCase()
}

function outputLabel(record: ConversionRecord): string {
  if (record.outputNames.length === 0) return record.outputPath || formatOutput(record)
  if (record.outputNames.length === 1) return record.outputNames[0]
  return `${record.outputNames[0]} + ${record.outputNames.length - 1}`
}

function ConversionRow({ record, reconverting, onReconvert }: { record: ConversionRecord; reconverting: boolean; onReconvert: () => void }) {
  const t = useT()
  const remove = useConversionLibraryStore(s => s.remove)
  const canOpen = isTauri() && Boolean(record.outputPath)

  return (
    <article className="rounded-2xl border border-white/8 bg-white/[0.025] p-4 transition-colors hover:bg-white/[0.04] sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent-muted">
          {record.kind === 'skin' ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 6.75A2.25 2.25 0 0 1 6.75 4.5h10.5a2.25 2.25 0 0 1 2.25 2.25v10.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 17.25V6.75Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m7.5 15 2.4-2.4 1.8 1.8 2.8-3.15 2 2.25" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0 4-4m-4 4-4-4M5.25 19.5h13.5" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 6.75h3m7.5 0h3" />
            </svg>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 truncate text-sm font-semibold text-surface-100" title={record.title}>{record.title}</h2>
            <span className="shrink-0 rounded-md border border-white/8 bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-surface-500">{kindLabel(t, record.kind)}</span>
          </div>
          <p className="mt-1 truncate text-xs text-surface-500">{[record.artist, record.creator].filter(Boolean).join(' · ') || record.sourceName}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-surface-500">
            <span>{directionLabel(t, record.direction)}</span>
            <span className="text-surface-700">·</span>
            <span>{record.itemCount === 1 ? t('library.oneItem') : t('library.itemCount', { count: record.itemCount })}</span>
            {record.difficulty && <><span className="text-surface-700">·</span><span className="truncate" title={record.difficulty}>{record.difficulty}</span></>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onReconvert}
            disabled={reconverting}
            className="rounded-lg px-2.5 py-1.5 text-xs text-accent-muted transition-colors hover:bg-accent/[0.08] hover:text-accent disabled:cursor-wait disabled:opacity-50"
          >
            {reconverting ? t('common.loading') : t('library.reconvert')}
          </button>
          {canOpen && (
            <button
              type="button"
              onClick={() => void openFile(record.outputPath!)}
              className="rounded-lg px-2.5 py-1.5 text-xs text-surface-500 transition-colors hover:bg-white/[0.06] hover:text-surface-200"
            >
              {t('library.openOutput')}
            </button>
          )}
          <button
            type="button"
            onClick={() => remove(record.id)}
            aria-label={t('library.remove')}
            className="grid h-8 w-8 place-items-center rounded-lg text-surface-600 transition-colors hover:bg-red-400/10 hover:text-red-300"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 6.75 10.5 10.5m0-10.5-10.5 10.5" />
            </svg>
          </button>
        </div>
      </div>

      <div className="mt-3 flex min-w-0 items-center justify-between gap-3 border-t border-white/6 pt-3 text-[11px] text-surface-600">
        <span className="truncate" title={record.sourceName}>{t('library.from')} {record.sourceName}</span>
        <span className="shrink-0 text-right uppercase tracking-wide">
          <span className="block">{outputLabel(record)}</span>
          <span className="mt-0.5 block normal-case tracking-normal text-surface-700">{new Date(record.createdAt).toLocaleString()}</span>
        </span>
      </div>
    </article>
  )
}

export function ConversionHistoryPanel() {
  const t = useT()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [reconvertingId, setReconvertingId] = useState<string | null>(null)
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const records = useConversionLibraryStore(s => s.records)
  const hydrating = useConversionLibraryStore(s => s.hydrating)
  const clear = useConversionLibraryStore(s => s.clear)

  async function handleReconvert(record: ConversionRecord): Promise<void> {
    setReconvertingId(record.id)
    try {
      const replay: ConversionReplay = record.replay || {
        sourcePath: record.sourcePath,
        config: null,
        difficultyIndices: null,
        separateSongs: null,
        packSettings: null,
        skinOptions: null,
      }
      let sourcePath = replay.sourcePath || record.sourcePath

      if (record.kind === 'pack') {
        if (!isTauri() || !sourcePath) {
          sourcePath = await openDirectory({ title: t('dialogs.titleSelectPackFolder') })
        }
      } else if (record.kind === 'skin') {
        if (!isTauri() || !sourcePath) {
          const selected = await openFiles({
            filters: [{ name: t('skinConverter.filterSkinArchives'), extensions: ['osk', 'zip'] }],
          })
          sourcePath = selected?.[0] || null
        }
      } else if (!isTauri() || !sourcePath) {
        const selected = await openFiles({
          filters: [{ name: t('dialogs.filterBeatmapFiles'), extensions: ['osu', 'osz', 'sm'] }],
        })
        sourcePath = selected?.[0] || null
      }

      if (!sourcePath) return
      setPendingConversionReplay({
        kind: record.kind,
        sourcePath,
        replay: { ...replay, sourcePath },
      })
      navigate(record.kind === 'skin' ? '/skin-converter' : '/')
    } finally {
      setReconvertingId(null)
    }
  }

  const matchingRecords = useMemo(() => (
    deferredQuery
      ? records.filter(record => recordSearchText(record).includes(deferredQuery))
      : records
  ), [deferredQuery, records])

  if (hydrating) {
    return (
      <div className="mt-7 rounded-2xl border border-white/8 bg-white/[0.025] p-6 sm:p-8">
        <div className="h-11 animate-pulse rounded-xl bg-white/[0.06]" />
        <div className="mt-5 space-y-3">
          <div className="h-24 animate-pulse rounded-2xl bg-white/[0.04]" />
          <div className="h-24 animate-pulse rounded-2xl bg-white/[0.04]" />
        </div>
      </div>
    )
  }

  return (
    <section className="mt-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">{t('library.search')}</span>
          <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.1-5.15a6.25 6.25 0 1 1-12.5 0 6.25 6.25 0 0 1 12.5 0Z" />
          </svg>
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('library.searchPlaceholder')}
            className="h-11 w-full rounded-xl border border-white/8 bg-black/10 pl-9 pr-3 text-sm text-surface-200 outline-none placeholder:text-surface-600 focus:border-accent/50"
          />
        </label>
        {records.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t('library.clearConfirm'))) clear()
            }}
            className="h-11 shrink-0 rounded-xl border border-white/8 bg-white/[0.03] px-3 text-xs text-surface-500 transition-colors hover:border-red-400/25 hover:bg-red-400/[0.06] hover:text-red-300"
          >
            {t('library.clearHistory')}
          </button>
        )}
      </div>

      {records.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
          <p className="text-sm font-medium text-surface-300">{t('library.emptyTitle')}</p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-surface-500">{t('library.emptyDescription')}</p>
        </div>
      ) : matchingRecords.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-white/8 bg-white/[0.02] px-6 py-16 text-center text-sm text-surface-500">
          {t('library.noResults')}
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between px-1 text-[11px] uppercase tracking-widest text-surface-600">
            <span>{t('library.recent')}</span>
            <span>{matchingRecords.length.toLocaleString()}</span>
          </div>
          {matchingRecords.map(record => (
            <ConversionRow
              key={record.id}
              record={record}
              reconverting={reconvertingId === record.id}
              onReconvert={() => void handleReconvert(record)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
