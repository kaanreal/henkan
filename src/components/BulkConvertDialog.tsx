import { useState, useCallback } from 'react'
import type { PackEntry } from '../types/beatmap'
import { openDirectory } from '../services/dialogs'
import { scanPack } from '../services/pack'
import { selectDifficulty, convertBeatmap } from '../services/convert'
import { exportBeatmap } from '../services/export'

interface Props {
  open: boolean
  onCancel: () => void
}

export function BulkConvertDialog({ open, onCancel }: Props) {
  const [folder, setFolder] = useState<string | null>(null)
  const [entries, setEntries] = useState<(PackEntry & { expanded: boolean })[]>([])
  const [scanning, setScanning] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [leaving, setLeaving] = useState(false)
  const [converting, setConverting] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)

  function handleCancel() {
    setLeaving(true)
    setTimeout(() => onCancel(), 200)
  }

  const pickFolder = useCallback(async () => {
    const picked = await openDirectory({ title: 'Select pack folder' })
    if (!picked) return
    setFolder(picked)
    setScanning(true)
    setEntries([])
    setSelected(new Set())
    try {
      const result = await scanPack(picked)
      setEntries(result.map(e => ({ ...e, expanded: true })))
    } catch (e) {
      console.error('Scan failed', e)
    } finally {
      setScanning(false)
    }
  }, [])

  const allSelected = entries.length > 0 && selected.size === totalDiffs()

  function totalDiffs() {
    let count = 0
    for (const e of entries) {
      count += e.available_difficulties.length
    }
    return count
  }

  function key(fileIdx: number, diffIdx: number) {
    return `${fileIdx}:${diffIdx}`
  }

  function toggleDiff(fileIdx: number, diffIdx: number) {
    const k = key(fileIdx, diffIdx)
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  function toggleFile(fileIdx: number) {
    const entry = entries[fileIdx]
    if (!entry) return
    const allFileKeys = entry.available_difficulties.map((_, i) => key(fileIdx, i))
    const allInFile = allFileKeys.every(k => selected.has(k))
    setSelected(prev => {
      const next = new Set(prev)
      for (const k of allFileKeys) {
        if (allInFile) next.delete(k)
        else next.add(k)
      }
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      const all = new Set<string>()
      for (let fi = 0; fi < entries.length; fi++) {
        for (let di = 0; di < entries[fi].available_difficulties.length; di++) {
          all.add(key(fi, di))
        }
      }
      setSelected(all)
    }
  }

  async function handleConvert() {
    if (selected.size === 0 || !folder) return
    setConverting(true)
    setProgress(null)

    try {
      const exportDir = await openDirectory({ title: 'Choose export folder' })
      if (!exportDir) { setConverting(false); return }

      const sel = [...selected]
      let converted = 0
      const results: string[] = []

      for (const k of sel) {
        const [fi, di] = k.split(':').map(Number)
        const entry = entries[fi]
        if (!entry) continue

        setProgress(`${entry.artist} — ${entry.title} [${entry.available_difficulties[di]?.name ?? ''}]`)
        await new Promise(r => setTimeout(r, 10))

        const bm = await selectDifficulty(entry.source_file, di)

        const cfg = {
          title: entry.title,
          artist: entry.artist,
          creator: (bm as { creator: string }).creator,
          difficulty_name: (bm as { difficulty_name: string }).difficulty_name,
          source: '',
          tags: '',
          audio_filename: (bm as { audio_filename: string }).audio_filename,
          background_filename: (bm as { background_filename: string | null }).background_filename,
          banner_filename: null,
          cdtitle_filename: null,
          global_timing_ms: 50,
          output_format: 'osz' as const,
          hp_drain: 7,
          overall_difficulty: 7,
          preview_time: 0,
          conversion_rate: 1,
          preserve_pitch: true,
        }

        const content = await convertBeatmap(bm, cfg)
        const result = await exportBeatmap(bm, cfg, content, exportDir)
        results.push(result)
        converted++
      }

      setProgress(`Done — ${converted} file${converted > 1 ? 's' : ''} converted`)
    } catch (e) {
      console.error('Bulk convert failed', e)
      setProgress('Conversion failed')
    } finally {
      setConverting(false)
    }
  }

  if (!open && !leaving) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-all duration-200 ${!leaving ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={handleCancel}
      />

      <div className={`relative w-full max-w-lg mx-4 transition-all duration-200 ease-out ${!leaving ? 'scale-100 opacity-100 translate-y-0' : 'scale-90 opacity-0 pointer-events-none translate-y-4'}`}>
        <div className="bg-surface-900/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
          {/* Accent bar */}
          <div className="h-0.5 bg-gradient-to-r from-accent via-accent-muted to-accent/40" />

          {/* Header */}
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center shadow-sm shadow-accent/10">
                <svg className="w-4.5 h-4.5 text-accent-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-surface-100 tracking-tight">Bulk convert</h2>
                <p className="text-[11px] text-surface-500 mt-px">Convert an entire pack folder</p>
              </div>
            </div>
          </div>

          {/* Folder picker */}
          <div className="px-5 pb-2">
            <div className="flex items-center gap-3">
              <button
                onClick={pickFolder}
                disabled={scanning || converting}
                className="h-9 px-4 rounded-lg text-xs font-medium
                  bg-white/[0.04] border border-white/8 text-surface-400
                  hover:bg-white/[0.07] hover:text-surface-200
                  active:scale-[0.97] transition-all duration-75 shrink-0
                  disabled:opacity-40 disabled:cursor-wait"
              >
                {scanning ? 'Scanning…' : 'Pick folder'}
              </button>
              <span className="text-xs text-surface-500 truncate">
                {folder || 'No folder selected'}
              </span>
            </div>
          </div>

          {/* Scan results */}
          {entries.length > 0 && (
            <>
              <div className="px-5 py-2 max-h-80 overflow-y-auto hide-scrollbar space-y-2">
                {entries.map((entry, fi) => {
                  const allFileDiffs = entry.available_difficulties.map((_, di) => key(fi, di))
                  const allInFile = allFileDiffs.every(k => selected.has(k))
                  const someInFile = allFileDiffs.some(k => selected.has(k))

                  return (
                    <div key={fi} style={{ animationDelay: `${fi * 30}ms` }} className="animate-fade-in">
                      {/* Song header */}
                      <div className="flex items-center gap-2 px-1 py-1">
                        <button
                          onClick={() => toggleFile(fi)}
                          className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 transition-all duration-75
                            ${allInFile
                              ? 'bg-accent border-accent'
                              : someInFile
                                ? 'border-accent/50 bg-accent/10'
                                : 'border-white/15'
                            }`}
                        >
                          {allInFile && (
                            <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </button>
                        <span className="text-xs font-medium text-surface-300 truncate flex-1">
                          {entry.artist} — {entry.title}
                        </span>
                        <span className="text-[10px] text-surface-500">{entry.available_difficulties.length}</span>
                      </div>

                      {/* Diff list */}
                      <div className="ml-5 space-y-0.5">
                        {entry.available_difficulties.map((d, di) => {
                          const k = key(fi, di)
                          const checked = selected.has(k)
                          return (
                            <button
                              key={di}
                              onClick={() => toggleDiff(fi, di)}
                              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-xs transition-all duration-75
                                ${checked ? 'text-surface-200' : 'text-surface-500 hover:text-surface-400'}
                              `}
                            >
                              <div className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 transition-all duration-75
                                ${checked ? 'bg-accent border-accent' : 'border-white/12'}
                              `}>
                                {checked && (
                                  <svg className="w-1.5 h-1.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                              <span className="flex-1 truncate">{d.name}</span>
                              <span className="text-[10px] text-surface-600">{d.keys}K · {d.note_count.toLocaleString()}</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Select all */}
              <div className="px-5 py-2">
                <button
                  onClick={toggleAll}
                  className="w-full flex items-center gap-3 py-1 text-xs text-surface-500 hover:text-surface-300 transition-colors group"
                >
                  <div className="flex-1 h-px bg-white/[0.04] group-hover:bg-white/[0.08] transition-colors" />
                  <span className="shrink-0 tracking-wide">
                    {allSelected ? 'Deselect all' : `Select all (${totalDiffs()})`}
                  </span>
                  <div className="flex-1 h-px bg-white/[0.04] group-hover:bg-white/[0.08] transition-colors" />
                </button>
              </div>
            </>
          )}

          {scanning && (
            <div className="px-5 py-8 text-center text-xs text-surface-500">
              <div className="animate-pulse-soft mb-2">Scanning folder…</div>
              <div className="h-0.5 w-full bg-white/[0.04] rounded-full overflow-hidden">
                <div className="h-full w-1/3 bg-accent/40 rounded-full animate-shimmer" />
              </div>
            </div>
          )}

          {entries.length === 0 && !scanning && folder && (
            <div className="px-5 py-8 text-center text-xs text-surface-500">
              No .sm files found in this folder
            </div>
          )}

          {/* Progress */}
          {progress && (
            <div className="px-5 pb-2">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent/[0.06] border border-accent/10 text-xs text-surface-400">
                {converting && <div className="w-2 h-2 rounded-full bg-accent animate-pulse-soft shrink-0" />}
                <span className="truncate">{progress}</span>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-2 px-5 pb-5 pt-1">
            <button
              onClick={handleCancel}
              disabled={converting}
              className="flex-1 h-10 rounded-xl text-sm font-medium
                bg-white/[0.04] border border-white/8 text-surface-400
                hover:bg-white/[0.07] hover:text-surface-200
                active:scale-[0.97] transition-all duration-75
                disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleConvert}
              disabled={selected.size === 0 || converting || !folder}
              className="flex-1 h-10 rounded-xl text-sm font-medium
                bg-accent text-white
                hover:bg-accent-hover active:scale-[0.97]
                transition-all duration-75
                disabled:opacity-40 disabled:cursor-not-allowed
                shadow-lg shadow-accent/25"
            >
              {converting ? 'Converting…' : `Convert (${selected.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
