import { useState, useRef, useEffect } from 'react'
import { searchBeatmaps, coverUrl, type MirrorBeatmapSet, type RankStatus } from '../services/beatmapMirror'

interface BeatmapMirrorDialogProps {
  open: boolean
  onClose: () => void
  onDownloadAndQueue: (setId: number) => Promise<void>
}

function SearchIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
  )
}

export function BeatmapMirrorDialog({ open, onClose, onDownloadAndQueue }: BeatmapMirrorDialogProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MirrorBeatmapSet[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  const [downloading, setDownloading] = useState<number | null>(null)
  const [keys, setKeys] = useState<number>(4)
  const [status, setStatus] = useState<RankStatus>('ranked')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [open])

  const handleSearch = async () => {
    const q = query.trim()
    if (!q) return
    setLoading(true)
    setError(null)
    setSearched(true)
    const { results: r, error: e } = await searchBeatmaps(q, status, keys)
    setResults(r)
    if (e) setError(e)
    setLoading(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch()
  }

  const handleDownload = async (setId: number) => {
    setDownloading(setId)
    setError(null)
    try {
      await onDownloadAndQueue(setId)
    } catch {
      setError('Download failed')
    }
    setDownloading(null)
  }

  const handleKeyFilter = (k: number) => {
    setKeys(k)
    if (searched && query.trim()) {
      setLoading(true)
      searchBeatmaps(query.trim(), status, k).then(({ results: r, error: e }) => {
        setResults(r)
        if (e) setError(e)
        setLoading(false)
      })
    }
  }

  const handleStatusFilter = (s: RankStatus) => {
    setStatus(s)
    if (searched && query.trim()) {
      setLoading(true)
      searchBeatmaps(query.trim(), s, keys).then(({ results: r, error: e }) => {
        setResults(r)
        if (e) setError(e)
        setLoading(false)
      })
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-900 border border-surface-700/50 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-4 border-b border-white/5 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-surface-100">Search beatmaps</h2>
            <button onClick={onClose} className="text-surface-500 hover:text-surface-300 transition-colors p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search by song title or artist..."
                className="w-full px-4 py-2.5 pl-10 rounded-xl bg-black/40 border border-white/10 text-surface-200 text-sm placeholder-surface-500 focus:outline-none focus:border-accent/50 transition-colors"
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none">
                <SearchIcon />
              </div>
            </div>
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="px-5 py-2.5 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent-hover active:scale-[0.97] transition-all duration-75 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : 'Search'}
            </button>
          </div>

          <div className="flex gap-1.5 mt-3">
            {[4, 5, 6, 7, 8, null].map(k => (
              <button
                key={k ?? 0}
                onClick={() => handleKeyFilter(k ?? 0)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-75 active:scale-[0.97] ${keys === k ? 'bg-accent text-white' : 'bg-white/[0.04] text-surface-400 hover:text-surface-200 border border-white/5'}`}
              >
                {k ? `${k}K` : 'All'}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 mt-2">
            {(['ranked', 'qualified', 'loved', 'pending', 'wip', 'graveyard'] as const).map(s => (
              <button
                key={s}
                onClick={() => handleStatusFilter(s)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-all duration-75 active:scale-[0.97] ${status === s ? 'bg-accent text-white' : 'bg-white/[0.04] text-surface-400 hover:text-surface-200 border border-white/5'}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 text-red-400 text-sm">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          {!searched && !loading && (
            <div className="flex flex-col items-center justify-center py-16 text-surface-500">
              <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <p className="text-sm">Search for osu!mania beatmaps to convert</p>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <svg className="w-8 h-8 animate-spin text-accent mb-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm text-surface-400">Searching...</p>
            </div>
          )}

          {searched && !loading && results.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-16 text-surface-500">
              <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm">No results found</p>
            </div>
          )}

          {searched && !loading && results.length > 0 && (
            <div className="flex flex-col gap-2">
              {results.map(set => {
                const h = (set.id * 137.508) % 360
                return (
                <div key={set.id} className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-colors group">
                  <div
                    className="shrink-0 w-16 h-9 rounded-lg overflow-hidden bg-cover bg-center"
                    style={{
                      backgroundImage: `url(${coverUrl(set.id)}), linear-gradient(135deg, hsl(${h}, 45%, 28%), hsl(${(h + 60) % 360}, 35%, 18%))`
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-surface-100 truncate">{set.title}</div>
                    <div className="text-xs text-surface-400 truncate">{set.artist}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-surface-500">{set.creator}</span>
                      {set.bpm > 0 && (
                        <>
                          <span className="text-[11px] text-surface-600">·</span>
                          <span className="text-[11px] text-surface-500">{Math.round(set.bpm)} BPM</span>
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {set.beatmaps.slice(0, 6).map(bm => (
                        <span key={bm.id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/[0.04] text-[10px] text-surface-400">
                          <svg className="w-2.5 h-2.5 text-amber-400/70" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          {bm.difficulty_rating.toFixed(2)}
                        </span>
                      ))}
                      {set.beatmaps.length > 6 && (
                        <span className="text-[10px] text-surface-500 px-1 py-0.5">+{set.beatmaps.length - 6}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownload(set.id)}
                    disabled={downloading === set.id}
                    className="shrink-0 px-3 py-2 rounded-xl bg-accent text-white text-xs font-medium hover:bg-accent-hover active:scale-[0.97] transition-all duration-75 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {downloading === set.id ? (
                      <>
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        ...
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Get
                      </>
                    )}
                  </button>
                </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
