import { useState, useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { searchBeatmaps, coverUrl, previewUrl, type MirrorBeatmapSet, type RankStatus } from '../services/beatmapMirror'

interface BeatmapMirrorDialogProps {
  open: boolean
  onClose: () => void
  onDownloadAndQueue: (setId: number, filename: string) => Promise<void>
}

const KEY_OPTIONS: { label: string; value: number }[] = [
  { label: 'All', value: 0 },
  { label: '4K', value: 4 },
  { label: '5K', value: 5 },
  { label: '6K', value: 6 },
  { label: '7K', value: 7 },
  { label: '8K', value: 8 },
]

const STATUS_OPTIONS: RankStatus[] = ['ranked', 'qualified', 'loved', 'pending', 'wip', 'graveyard']

function Spinner({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M6 6h12v12H6z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function StarIcon() {
  return (
    <svg className="w-2.5 h-2.5 text-amber-400/70" fill="currentColor" viewBox="0 0 20 20">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  )
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

type DownloadState = 'idle' | 'downloading' | 'done'

export function BeatmapMirrorDialog({ open, onClose, onDownloadAndQueue }: BeatmapMirrorDialogProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MirrorBeatmapSet[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [keys, setKeys] = useState<number>(0)       // 0 = all
  const [status, setStatus] = useState<RankStatus>('ranked')
  const [dlState, setDlState] = useState<Record<number, DownloadState>>({})
  const [dlError, setDlError] = useState<string | null>(null)
  const [previewingId, setPreviewingId] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Focus input when dialog opens; reset state when it closes
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 120)
    } else {
      // Small delay so the close animation doesn't cause a flash reset
      const t = setTimeout(() => {
        setQuery('')
        setResults([])
        setSearched(false)
        setError(null)
        setDlError(null)
        setPage(1)
        setHasMore(false)
        setDlState({})
        setPreviewingId(null)
        if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
      }, 200)
      return () => clearTimeout(t)
    }
  }, [open])

  const handlePreview = (setId: number) => {
    if (previewingId === setId) {
      // Stop
      audioRef.current?.pause()
      audioRef.current = null
      setPreviewingId(null)
      return
    }
    // Stop previous
    audioRef.current?.pause()
    const audio = new Audio(previewUrl(setId))
    audio.volume = 0.35
    audio.onended = () => setPreviewingId(null)
    audio.onerror = () => setPreviewingId(null)
    audio.play().catch(() => setPreviewingId(null))
    audioRef.current = audio
    setPreviewingId(setId)
  }

  // Cleanup audio on unmount
  useEffect(() => {
    return () => { audioRef.current?.pause(); audioRef.current = null }
  }, [])

  const runSearch = useCallback(async (q: string, st: RankStatus, ks: number, pg: number, append: boolean) => {
    if (!q.trim()) return
    if (append) setLoadingMore(true)
    else { setLoading(true); setError(null); setDlError(null) }
    const { results: r, error: e } = await searchBeatmaps(q.trim(), st, ks, pg)
    if (append) {
      setResults(prev => [...prev, ...r])
      setLoadingMore(false)
    } else {
      setResults(r)
      setSearched(true)
      setLoading(false)
    }
    if (e) setError(e)
    // Either source returning a full page (50) means more could exist
    setHasMore(r.length >= 50)
  }, [])

  const handleSearch = () => {
    setPage(1)
    runSearch(query, status, keys, 1, false)
  }

  const handleLoadMore = () => {
    const next = page + 1
    setPage(next)
    runSearch(query, status, keys, next, true)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  // Re-search immediately when a filter changes (if a search has already been done)
  const applyFilter = (newStatus: RankStatus, newKeys: number) => {
    setStatus(newStatus)
    setKeys(newKeys)
    if (searched && query.trim()) {
      setPage(1)
      runSearch(query, newStatus, newKeys, 1, false)
    }
  }

  const handleDownload = async (set: MirrorBeatmapSet) => {
    // Stop any playing preview
    audioRef.current?.pause()
    audioRef.current = null
    setPreviewingId(null)

    setDlState(prev => ({ ...prev, [set.id]: 'downloading' }))
    setDlError(null)
    try {
      const safeName = `${set.artist} - ${set.title}`.replace(/[<>:"/\\|?*]+/g, '_')
      const filename = `${safeName}.osz`
      await onDownloadAndQueue(set.id, filename)
      setDlState(prev => ({ ...prev, [set.id]: 'done' }))
      // Auto-close after a brief "done" flash when it's the only item or first one
      setTimeout(() => onClose(), 800)
    } catch (e) {
      setDlState(prev => ({ ...prev, [set.id]: 'idle' }))
      setDlError(e instanceof Error ? e.message : t('beatmapMirror.downloadFailed'))
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#02040a]/80 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative bg-[#0f111a]/95 border border-white/[0.08] rounded-3xl max-w-3xl w-full mx-4 max-h-[85vh] flex flex-col overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="px-8 pt-7 pb-5 border-b border-white/[0.06] shrink-0 relative z-10">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <span>{t('beatmapMirror.title')}</span>
                <span className="px-2 py-0.5 rounded-full bg-accent/20 text-accent text-[10px] font-bold uppercase tracking-wider">Beta</span>
              </h2>
              <p className="text-xs text-surface-400 mt-1">{t('beatmapMirror.subtitle')}</p>
            </div>
            <button
              onClick={onClose}
              className="text-surface-500 hover:text-white transition-all duration-200 p-2 rounded-xl hover:bg-white/[0.08]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search bar */}
          <div className="flex gap-3">
            <div className="flex-1 relative group">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('beatmapMirror.searchPlaceholder')}
                className="w-full px-5 py-3.5 pl-12 rounded-2xl bg-white/[0.03] border border-white/[0.06]
                  text-white text-sm placeholder-surface-500 shadow-inner
                  focus:outline-none focus:border-accent/50 focus:bg-white/[0.06] focus:ring-4 focus:ring-accent/10
                  transition-all duration-300"
              />
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400 group-focus-within:text-accent transition-colors duration-300 pointer-events-none">
                <SearchIcon />
              </div>
            </div>
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="px-6 py-3.5 rounded-2xl bg-accent text-white font-semibold text-sm
                hover:bg-accent-hover active:scale-[0.97] transition-all duration-200
                disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shrink-0"
            >
              {loading ? <Spinner className="w-4 h-4" /> : <SearchIcon />}
              {t('beatmapMirror.search')}
            </button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4 mt-4">
            {/* Keys */}
            <div className="flex bg-white/[0.03] p-1 rounded-xl border border-white/[0.04]">
              {KEY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => applyFilter(status, opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200
                    ${keys === opt.value
                      ? 'bg-white/[0.1] text-white shadow-sm'
                      : 'text-surface-500 hover:text-surface-300 hover:bg-white/[0.05]'
                    }`}
                >
                  {opt.value === 0 ? t('beatmapMirror.all') : opt.label}
                </button>
              ))}
            </div>

            {/* Status */}
            <div className="flex flex-wrap gap-1 bg-white/[0.03] p-1 rounded-xl border border-white/[0.04]">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => applyFilter(s, keys)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all duration-200
                    ${status === s
                      ? 'bg-white/[0.1] text-white shadow-sm'
                      : 'text-surface-500 hover:text-surface-300 hover:bg-white/[0.05]'
                    }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Results ── */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-8 py-6 min-h-0 space-y-3 relative z-10 custom-scrollbar">

          {/* Error banner */}
          {(error || dlError) && (
            <div className="flex items-start gap-2.5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/15 text-red-400 text-sm">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{dlError || error}</span>
            </div>
          )}

          {/* Empty state - not yet searched */}
          {!searched && !loading && (
            <div className="flex flex-col items-center justify-center py-20 text-surface-500 select-none animate-fade-in">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.03] flex items-center justify-center mb-5 border border-white/[0.05] shadow-inner">
                <svg className="w-8 h-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
              <p className="text-base font-semibold text-surface-300">{t('beatmapMirror.searchTitle')}</p>
              <p className="text-sm mt-1.5 text-surface-500">{t('beatmapMirror.streamedFrom')}</p>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <Spinner className="w-7 h-7 text-accent mb-3" />
              <p className="text-sm text-surface-400">{t('beatmapMirror.searching')}</p>
            </div>
          )}

          {/* No results */}
          {searched && !loading && results.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-16 text-surface-500 select-none">
              <svg className="w-10 h-10 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium text-surface-400">{t('beatmapMirror.noResults')}</p>
              <p className="text-xs mt-1 text-surface-600">{t('beatmapMirror.noResultsHint')}</p>
            </div>
          )}

          {/* Result cards */}
          {searched && !loading && results.length > 0 && results.map((set, i) => {
            const state = dlState[set.id] ?? 'idle'
            const isDone = state === 'done'
            const isDownloading = state === 'downloading'
            
            const getStatusColor = (s: RankStatus) => {
              switch(s) {
                case 'ranked': return 'bg-sky-500/90 text-white'
                case 'loved': return 'bg-pink-500/90 text-white'
                case 'qualified': return 'bg-emerald-500/90 text-white'
                case 'pending':
                case 'wip': return 'bg-amber-500/90 text-white'
                default: return 'bg-surface-700/90 text-surface-200'
              }
            }

            return (
              <div
                key={set.id}
                className="group relative flex items-center justify-between p-4 rounded-2xl border border-white/[0.08]
                  hover:border-white/[0.15] hover:shadow-2xl hover:-translate-y-0.5
                  transition-all duration-300 ease-out overflow-hidden bg-surface-900"
                style={{ animationDelay: `${Math.min(i * 30, 300)}ms` }}
              >
                {/* Full-width Cover Background */}
                <img
                  src={coverUrl(set.id)}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                  className="absolute inset-0 w-full h-full object-cover blur-sm scale-110 pointer-events-none"
                />

                {/* Dark overlay */}
                <div className="absolute inset-0 bg-surface-950/75" />

                {/* Info */}
                <div className="relative flex-1 min-w-0 py-0.5 z-10">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-widest shadow-sm ${getStatusColor(set.status)}`}>
                      {set.status}
                    </span>
                  </div>
                  <div className="text-lg font-bold text-white truncate leading-tight tracking-tight drop-shadow-md">
                    {set.title}
                  </div>
                  <div className="text-sm text-surface-300 truncate mt-0.5 font-medium drop-shadow-sm">
                    {set.artist}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 drop-shadow-sm">
                    <span className="text-[12px] text-surface-200 font-medium">{t('beatmapMirror.mappedBy', { creator: set.creator })}</span>
                    {set.bpm > 0 && (
                      <>
                        <span className="text-[10px] text-surface-400 font-bold">·</span>
                        <span className="text-[12px] text-surface-200 font-medium">{Math.round(set.bpm)} BPM</span>
                      </>
                    )}
                  </div>
                  
                  {/* Difficulty pills */}
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {set.beatmaps.slice(0, 7).map(bm => (
                      <span
                        key={bm.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/40 border border-white/[0.08] text-[11px] font-bold text-surface-100 shadow-sm"
                        title={`${bm.version} · ${bm.total_length ? formatDuration(bm.total_length) : ''}`}
                      >
                        <StarIcon />
                        {bm.difficulty_rating.toFixed(2)}
                        <span className="text-surface-400 ml-0.5">{bm.cs}K</span>
                      </span>
                    ))}
                    {set.beatmaps.length > 7 && (
                      <span className="text-[11px] font-bold text-surface-300 px-1 py-0.5 bg-black/20 rounded-md">
                        +{set.beatmaps.length - 7}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="relative z-10 shrink-0 flex flex-col items-center justify-center gap-2 pr-4 pl-2">
                  <button
                    onClick={() => handlePreview(set.id)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200
                      ${previewingId === set.id
                        ? 'bg-accent/25 text-accent border border-accent/40'
                        : 'bg-white/10 text-surface-300 border border-white/10 hover:bg-white/20 hover:text-white hover:border-white/30'
                      }`}
                    title={previewingId === set.id ? t('beatmapMirror.stopPreview') : t('beatmapMirror.preview')}
                  >
                    {previewingId === set.id ? <StopIcon /> : <PlayIcon />}
                  </button>
                  <button
                    onClick={() => state === 'idle' && handleDownload(set)}
                    disabled={isDownloading}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200
                      ${isDone
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 cursor-default'
                        : isDownloading
                          ? 'bg-accent/20 text-accent border border-accent/40 cursor-wait'
                          : 'bg-white/10 text-surface-300 border border-white/10 hover:bg-white/20 hover:text-white hover:border-white/30'
                      }`}
                    title={isDone ? t('beatmapMirror.downloaded') : isDownloading ? t('beatmapMirror.downloading') : t('beatmapMirror.download')}
                  >
                    {isDownloading ? <Spinner className="w-3.5 h-3.5" /> : isDone ? <CheckIcon /> : <DownloadIcon />}
                  </button>
                </div>
              </div>
            )
          })}

          {/* Load more */}
          {searched && !loading && hasMore && (
            <div className="pt-2 pb-1 flex justify-center">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-5 py-2 rounded-xl text-xs font-medium text-surface-400
                  bg-white/[0.04] border border-white/5
                  hover:bg-white/[0.07] hover:text-surface-200
                  active:scale-[0.97] transition-all duration-75
                  disabled:opacity-50 flex items-center gap-2"
              >
                {loadingMore ? <><Spinner className="w-3 h-3" />{t('common.loading')}</> : t('beatmapMirror.loadMore')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
