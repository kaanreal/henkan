import { useEffect, useState } from 'react'
import { useT } from '../i18n'

export interface PackReviewItem {
  index: number
  title: string
  artist: string
  subtitle: string
  difficulty: string
  difficultyCount: number
}

interface Props {
  items: PackReviewItem[]
  onConfirm: (items: PackReviewItem[]) => void
  onCancel: () => void
}

export function PackReviewDialog({ items, onConfirm, onCancel }: Props) {
  const t = useT()
  const [drafts, setDrafts] = useState(() => items.map(item => ({ ...item })))

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  const update = (index: number, key: 'title' | 'artist' | 'subtitle', value: string) => {
    setDrafts(current => current.map(item => (
      item.index === index ? { ...item, [key]: value } : item
    )))
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="pack-review-title">
      <button
        type="button"
        className="absolute inset-0 bg-black/75 animate-fade-in"
        onClick={onCancel}
        aria-label={t('common.close')}
      />

      <div className="relative flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-surface-900/95 shadow-2xl shadow-black/60 animate-scale-in">
        <div className="flex items-start gap-4 border-b border-white/[0.06] px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="pack-review-title" className="text-base font-semibold tracking-tight text-surface-100">
                {t('packReview.title')}
              </h2>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] text-surface-400">
                {t('packReview.chartCount', { count: drafts.length })}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-surface-500">{t('packReview.description')}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-surface-500 transition-colors hover:bg-white/[0.06] hover:text-surface-200"
            aria-label={t('common.close')}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          <div className="sticky top-0 z-10 hidden grid-cols-[minmax(8rem,1.15fr)_minmax(7rem,1fr)_minmax(8rem,1fr)] gap-3 border-b border-white/[0.05] bg-surface-900/95 px-6 py-2 text-[10px] font-medium uppercase tracking-wider text-surface-600 backdrop-blur-md sm:grid">
            <span>{t('packReview.titleLabel')}</span>
            <span>{t('packReview.artistLabel')}</span>
            <span>{t('packReview.subtitleLabel')}</span>
          </div>

          <div className="space-y-2 p-4 sm:px-6">
            {drafts.map((item, position) => (
              <div key={item.index} className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
                <div className="mb-2 flex min-w-0 items-center gap-2 text-[10px] text-surface-600">
                  <span className="font-mono">{String(position + 1).padStart(2, '0')}</span>
                  <span className="h-3 w-px bg-white/[0.08]" />
                  <span className="truncate text-surface-500">{item.difficulty || t('packReview.unnamedDifficulty')}</span>
                  {item.difficultyCount > 1 && (
                    <span className="shrink-0">{t('packBrowser.diffCount', { count: item.difficultyCount })}</span>
                  )}
                </div>
                <div className="grid gap-2 sm:grid-cols-[minmax(8rem,1.15fr)_minmax(7rem,1fr)_minmax(8rem,1fr)] sm:gap-3">
                  <label className="min-w-0">
                    <span className="mb-1 block text-[10px] text-surface-600 sm:hidden">{t('packReview.titleLabel')}</span>
                    <input
                      type="text"
                      value={item.title}
                      onChange={event => update(item.index, 'title', event.target.value)}
                      className="h-9 w-full rounded-lg border border-white/[0.07] bg-black/15 px-3 text-xs text-surface-200 outline-none transition-colors placeholder:text-surface-700 focus:border-accent/50 focus:bg-white/[0.04]"
                    />
                  </label>
                  <label className="min-w-0">
                    <span className="mb-1 block text-[10px] text-surface-600 sm:hidden">{t('packReview.artistLabel')}</span>
                    <input
                      type="text"
                      value={item.artist}
                      onChange={event => update(item.index, 'artist', event.target.value)}
                      className="h-9 w-full rounded-lg border border-white/[0.07] bg-black/15 px-3 text-xs text-surface-200 outline-none transition-colors placeholder:text-surface-700 focus:border-accent/50 focus:bg-white/[0.04]"
                    />
                  </label>
                  <label className="min-w-0">
                    <span className="mb-1 block text-[10px] text-surface-600 sm:hidden">{t('packReview.subtitleLabel')}</span>
                    <input
                      type="text"
                      value={item.subtitle}
                      onChange={event => update(item.index, 'subtitle', event.target.value)}
                      placeholder={t('packReview.subtitlePlaceholder')}
                      className="h-9 w-full rounded-lg border border-white/[0.07] bg-black/15 px-3 text-xs text-surface-200 outline-none transition-colors placeholder:text-surface-700 focus:border-accent/50 focus:bg-white/[0.04]"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-white/[0.06] bg-surface-900/95 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 text-sm font-medium text-surface-400 transition-colors hover:bg-white/[0.07] hover:text-surface-200"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onConfirm(drafts)}
            className="h-10 rounded-xl bg-accent px-5 text-sm font-medium text-white transition-all hover:bg-accent-hover active:scale-[0.98]"
          >
            {t('packReview.continue')}
          </button>
        </div>
      </div>
    </div>
  )
}
