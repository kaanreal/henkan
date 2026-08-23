import { useRef } from 'react'
import { useT } from '../i18n'
import type { QueueItem } from '../stores/useQueueStore'

interface Props {
  items: QueueItem[]
  activeId: string | null
  isConverting: boolean
  onSelect: (item: QueueItem) => void
  onRemove: (id: string) => void
  onAddFiles: () => void
  onConvertAll: () => void
  onResetAll: () => void
  onClearCompleted: () => void
  onClearAll: () => void
}

function statusIcon(status: QueueItem['status']) {
  switch (status) {
    case 'parsing':
    case 'converting':
      return (
        <svg className="w-3 h-3 animate-spin" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeLinecap="round" className="opacity-30" />
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="10 18" strokeLinecap="round" />
        </svg>
      )
    case 'completed':
      return (
        <svg className="w-3 h-3 text-emerald-400" viewBox="0 0 16 16" fill="none">
          <path d="M4 8l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'error':
      return (
        <svg className="w-3 h-3 text-red-400" viewBox="0 0 16 16" fill="none">
          <path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    default:
      return (
        <svg className="w-3 h-3 text-surface-500" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="3" fill="currentColor" />
        </svg>
      )
  }
}

function truncateName(name: string, max: number): string {
  if (name.length <= max) return name
  const ext = name.lastIndexOf('.')
  if (ext === -1) return name.slice(0, max - 3) + '...'
  const stem = name.slice(0, ext)
  const suffix = name.slice(ext)
  const keep = max - suffix.length - 3
  if (keep < 1) return name.slice(0, max - 3) + '...'
  return stem.slice(0, keep) + '...' + suffix
}

export function ConversionQueue({
  items, activeId, isConverting, onSelect, onRemove, onAddFiles, onConvertAll, onResetAll, onClearCompleted, onClearAll,
}: Props) {
  const t = useT()
  const scrollRef = useRef<HTMLDivElement>(null)
  if (items.length === 0) return null

  const doneCount = items.filter((i) => i.status === 'completed').length
  const readyCount = items.filter((i) => i.status === 'ready').length
  const retryableCount = items.filter((i) => (i.status === 'error' || i.status === 'completed') && i.beatmap).length
  const hasRetryable = retryableCount > 0

  return (
    <div className="w-full bg-surface-900/80 border-b border-surface-800/50 px-3 py-2 shrink-0 z-20">
      <div className="flex items-center gap-2 max-w-5xl mx-auto">
        <span className="text-[11px] font-semibold text-surface-500 tracking-widest uppercase shrink-0 mr-1">
          {t('queue.queue')}
          <span className="ml-1.5 text-surface-600 font-normal normal-case tracking-normal">
            {items.length}
          </span>
        </span>

        <div
          ref={scrollRef}
          onWheel={(e) => {
            if (scrollRef.current) {
              scrollRef.current.scrollLeft += e.deltaY
            }
          }}
          className="flex-1 flex items-center gap-1.5 overflow-x-auto hide-scrollbar"
        >
          {items.map((item) => {
            const active = item.id === activeId
            const isRetryable = (item.status === 'completed' || item.status === 'error') && item.beatmap
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item)}
                className={`
                  group relative flex items-center gap-1.5 px-2.5 h-7 rounded-lg text-xs font-medium
                  transition-all duration-75 shrink-0
                  ${active
                    ? 'bg-accent/15 border border-accent/30 text-accent-muted shadow-sm'
                    : item.status === 'completed'
                      ? 'bg-emerald-500/8 border border-emerald-500/15 text-surface-400 hover:bg-emerald-500/12 hover:text-surface-200'
                      : item.status === 'error'
                        ? 'bg-red-500/8 border border-red-500/15 text-surface-400 hover:bg-red-500/12 hover:text-surface-200'
                        : 'bg-white/[0.03] border border-white/5 text-surface-400 hover:bg-white/[0.06] hover:text-surface-200'
                  }
                `}
                title={isRetryable ? t('queue.retryTitle', { error: item.error || item.status }) : item.fileName}
              >
                {statusIcon(item.status)}
                <span className="truncate max-w-[120px] sm:max-w-[160px]">
                  {truncateName(item.fileName, 24)}
                </span>
                {isRetryable && (
                  <span
                    onClick={(e) => { e.stopPropagation(); onSelect(item) }}
                    className="ml-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-white/12 text-surface-500 hover:text-surface-200 transition-all"
                    title={t('queue.clickToRetry')}
                  >
                    <svg className="w-2.5 h-2.5" viewBox="0 0 16 16" fill="none">
                      <path d="M2 8a6 6 0 0111.33-3M14 2v4h-4M14 8a6 6 0 01-11.33 3M2 14v-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
                <span
                  onClick={(e) => { e.stopPropagation(); onRemove(item.id) }}
                  className="ml-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 text-surface-600 hover:text-surface-300 transition-all"
                >
                  <svg className="w-2.5 h-2.5" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {hasRetryable && (
            <button
              onClick={onResetAll}
              disabled={isConverting}
              className="flex items-center gap-1 px-2 h-7 rounded-lg text-[11px] font-medium
                bg-amber-500/10 border border-amber-500/25 text-amber-400
                hover:bg-amber-500/15 hover:text-amber-300 transition-all duration-75
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
                <path d="M2 8a6 6 0 0111.33-3M14 2v4h-4M14 8a6 6 0 01-11.33 3M2 14v-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t('queue.resetWithCount', { count: retryableCount })}
            </button>
          )}
          {doneCount > 0 && (
            <button
              onClick={onClearCompleted}
              className="px-2 h-7 rounded-lg text-[11px] font-medium
                bg-white/[0.04] border border-white/8 text-surface-500
                hover:bg-white/[0.07] hover:text-surface-300 transition-all duration-75"
            >
              {t('queue.clearDone')}
            </button>
          )}
          <button
            onClick={onClearAll}
            className="px-2 h-7 rounded-lg text-[11px] font-medium
              bg-white/[0.04] border border-white/8 text-surface-500
              hover:bg-white/[0.07] hover:text-surface-300 transition-all duration-75"
            >
            {t('queue.clearAll')}
          </button>
          <button
            onClick={onAddFiles}
            className="flex items-center gap-1 px-2 h-7 rounded-lg text-[11px] font-medium
              bg-white/[0.04] border border-white/8 text-surface-400
              hover:bg-white/[0.07] hover:text-surface-200 transition-all duration-75"
          >
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            {t('queue.add')}
          </button>
          <button
            onClick={onConvertAll}
            disabled={readyCount === 0 || isConverting}
            className="flex items-center gap-1 px-3 h-7 rounded-lg text-[11px] font-medium
              bg-accent/15 border border-accent/30 text-accent-muted
              hover:bg-accent/20 hover:text-accent transition-all duration-75
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none">
              <path d="M2 8l4-4v8L2 8zM9 8l4-4v8l-4-4z" fill="currentColor" />
            </svg>
            {t('queue.convertAll')}{readyCount > 0 ? ` (${readyCount})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}