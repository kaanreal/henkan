import { useState, useEffect } from 'react'
import type { PackEntry } from '../types/beatmap'

const _bgCache = new Map<string, string>()

interface Props {
  entries: PackEntry[]
  selected: Set<number>
  onToggleSelect: (index: number) => void
  onEditSong: (index: number) => void
  onSelectAll: (select: boolean) => void
  onConvert: () => void
  onConvertAll: () => void
  onBack: () => void
  bannerUrl: string | null
  isConverting: boolean
}

function PackCard({ entry, checked, onToggle, onEdit }: {
  entry: PackEntry
  index: number
  checked: boolean
  onToggle: () => void
  onEdit: () => void
}) {
  const [bgUrl, setBgUrl] = useState<string | null>(() => {
    const key = `${entry.source_dir}|${entry.background_filename}`
    return _bgCache.get(key) ?? null
  })

  useEffect(() => {
    let cancelled = false
    if (entry.background_filename) {
      const key = `${entry.source_dir}|${entry.background_filename}`
      if (_bgCache.has(key)) return
      const load = async () => {
        try {
          const { invoke } = await import('@tauri-apps/api/core')
          const resolved = await invoke<string>('resolve_file', {
            sourceDir: entry.source_dir,
            filename: entry.background_filename,
          })
          if (cancelled) return
          const url = await invoke<string>('read_file_as_data_url', { path: resolved })
          if (cancelled) return
          _bgCache.set(key, url)
          setBgUrl(url)
        } catch {
          // no background
        }
      }
      load()
    }
    return () => { cancelled = true }
  }, [entry.source_dir, entry.background_filename])

  return (
    <div
      onClick={onToggle}
      className={`
        group relative w-full text-left rounded-xl overflow-hidden border-2
        transition-all duration-150 active:scale-[0.98] cursor-pointer
        ${checked
          ? 'border-emerald-400/70 border-dashed animate-pulse-border shadow-[0_0_12px_rgba(52,211,153,0.15)]'
          : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10'
        }
      `}
    >
      {/* Background thumbnail */}
      <div className="relative h-24 overflow-hidden">
        {bgUrl ? (
          <img
            src={bgUrl}
            alt=""
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-accent/[0.04] to-surface-800" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-surface-950/90 via-surface-950/30 to-transparent" />

        {/* Edit button */}
        <div
          onClick={(e) => { e.stopPropagation(); onEdit() }}
          className="absolute top-2.5 right-2.5 w-7 h-7 rounded-lg bg-black/50 backdrop-blur-sm
            border border-white/10 flex items-center justify-center
            opacity-0 group-hover:opacity-100 transition-opacity duration-100
            hover:bg-white/15 cursor-pointer"
        >
          <svg className="w-3.5 h-3.5 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
          </svg>
        </div>

        {/* Difficulty badge */}
        <div className="absolute bottom-2.5 left-3">
          <span className="text-[10px] font-medium text-white/70 bg-black/40 px-2 py-0.5 rounded-full">
            {entry.available_difficulties.length} diff{entry.available_difficulties.length > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Info */}
      <div className="px-3 py-2.5">
        <div className="text-sm font-medium text-surface-200 truncate leading-tight">{entry.title}</div>
        <div className="text-[11px] text-surface-500 truncate mt-0.5">{entry.artist}</div>
      </div>
    </div>
  )
}

export function PackBrowser({ entries, selected, onToggleSelect, onEditSong, onSelectAll, onConvert, onConvertAll, onBack, bannerUrl, isConverting }: Props) {
  const allSelected = selected.size === entries.length

  return (
    <div className="w-full max-w-3xl mx-auto animate-fade-in overflow-visible">
      {/* Pack banner */}
      {bannerUrl && (
        <div className="relative w-full h-24 sm:h-36 md:h-48 rounded-xl sm:rounded-2xl overflow-hidden mb-4 sm:mb-5 border border-white/[0.06]">
          <img
            src={bannerUrl}
            alt="pack banner"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-950 via-surface-950/40 to-transparent" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-medium
            bg-white/10 border border-white/15 text-surface-300
            hover:bg-white/[0.14] hover:text-white
            active:scale-[0.97] transition-all duration-75"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div className="h-4 w-px bg-white/10" />
        <span className="text-sm text-surface-400">{entries.length} song{entries.length > 1 ? 's' : ''}</span>
        <div className="flex-1" />
        {entries.length > 0 && (
          <button
            onClick={() => onSelectAll(!allSelected)}
            className="h-8 px-3 rounded-lg text-xs font-medium
              bg-white/[0.06] border border-white/10 text-surface-400
              hover:bg-white/[0.1] hover:text-surface-200
              active:scale-[0.97] transition-all duration-75"
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        )}
      </div>

      {/* Song grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 hide-scrollbar">
        {entries.map((entry, i) => (
          <PackCard
            key={i}
            entry={entry}
            index={i}
            checked={selected.has(i)}
            onToggle={() => onToggleSelect(i)}
            onEdit={() => onEditSong(i)}
          />
        ))}
      </div>

      {/* Bottom bar */}
      {entries.length > 0 && (
        <div className="sticky bottom-0 mt-6 pt-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              className="h-11 px-5 rounded-xl text-sm font-medium
                bg-white/10 border border-white/15 text-surface-300
                hover:bg-white/[0.14] hover:text-white
                active:scale-[0.97] transition-all duration-75"
            >
              Close
            </button>
            <div className="flex-1" />
            <button
              onClick={onConvertAll}
              disabled={isConverting}
              className="h-11 px-5 rounded-xl text-sm font-medium
                bg-white/10 border border-white/15 text-surface-300
                hover:bg-white/[0.14] hover:text-white
                active:scale-[0.97] transition-all duration-75
                disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Convert all
            </button>
            <button
              onClick={onConvert}
              disabled={selected.size === 0 || isConverting}
              className="h-11 px-5 rounded-xl text-sm font-semibold tracking-wide
                bg-accent text-white
                hover:bg-accent-hover active:scale-[0.97]
                transition-all duration-75
                disabled:opacity-30 disabled:cursor-not-allowed
                shadow-lg shadow-accent/25"
            >
              Convert selected{selected.size > 0 ? ` (${selected.size})` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
