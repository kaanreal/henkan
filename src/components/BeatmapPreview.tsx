import { useRef, useMemo } from 'react'
import type { Note } from '../types/beatmap'

interface Props {
  notes: Note[]
  keys: number
  currentTime: number
  duration: number
  previewTime: number
  onSetPreviewTime: (ms: number) => void
}

const CONTAINER_H = 110
const VISIBLE_MS = 2500
const NOTE_H = 6
const RECEPTOR_Y = CONTAINER_H - 8

function getNoteY(noteTimeMs: number, currentMs: number): number {
  const rel = noteTimeMs - currentMs
  return (1 - rel / VISIBLE_MS) * CONTAINER_H
}

export function BeatmapPreview({ notes, keys, currentTime, duration, previewTime, onSetPreviewTime }: Props) {
  const currentMs = currentTime * 1000
  const containerRef = useRef<HTMLDivElement>(null)

  const handleClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const pct = 1 - y / CONTAINER_H
    const clickedTime = currentMs + pct * VISIBLE_MS
    onSetPreviewTime(Math.max(0, Math.min(clickedTime, duration * 1000)))
  }

  const visibleNotes = useMemo(() => {
    const shown: { note: Note; y: number; isHold: boolean }[] = []
    for (const n of notes) {
      const y = getNoteY(n.time_ms, currentMs)
      if (y < -NOTE_H * 3 || y > CONTAINER_H + NOTE_H * 3) continue
      shown.push({ note: n, y, isHold: false })
      if (n.hold && n.hold_end_ms) {
        const endY = getNoteY(n.hold_end_ms, currentMs)
        shown.push({ note: n, y: endY, isHold: true })
      }
    }
    return shown
  }, [notes, currentMs])

  const previewY = getNoteY(previewTime, currentMs)
  const showPreviewMarker = previewY > -10 && previewY < CONTAINER_H + 10

  return (
    <div className="shrink-0 px-6 py-1.5 border-t border-white/5 bg-black/20">
      <div className="max-w-2xl mx-auto">
        <div className="text-[10px] text-surface-500 mb-1 flex items-center gap-2 select-none">
          <span>Preview</span>
          <span className="text-surface-600">·</span>
          <span className="text-surface-600">click timeline to set preview point</span>
          <span className="text-surface-600">·</span>
          <kbd className="px-1 py-0.5 rounded bg-surface-800 text-surface-400 text-[9px] font-mono border border-white/10">Space</kbd>
          <span className="text-surface-600">play/pause</span>
        </div>
        <div
          ref={containerRef}
          className="relative w-full overflow-hidden rounded-xl bg-surface-950/60 border border-white/5 cursor-pointer group"
          style={{ height: CONTAINER_H }}
          onClick={handleClick}
        >
          {/* Columns */}
          {Array.from({ length: keys }).map((_, i) => {
            const left = (i / keys) * 100
            const w = (1 / keys) * 100
            return (
              <div
                key={i}
                className="absolute bottom-0 border-l border-white/[0.03]"
                style={{ left: `${left}%`, width: `${w}%`, height: '100%' }}
              />
            )
          })}

          {/* Receptor line */}
          <div
            className="absolute left-0 right-0 border-t border-white/10"
            style={{ top: RECEPTOR_Y }}
          />

          {/* Notes */}
          {visibleNotes.map(({ note, y, isHold }) => {
            const left = (note.column / keys) * 100
            const w = (1 / keys) * 100
            return (
              <div
                key={`${note.time_ms}-${note.column}-${isHold ? 'end' : 'start'}`}
                className="absolute rounded-sm transition-none pointer-events-none"
                style={{
                  left: `${left + 2}%`,
                  width: `${w - 4}%`,
                  top: isHold ? getNoteY(note.time_ms, currentMs) : y - NOTE_H / 2,
                  height: isHold ? Math.max(NOTE_H, y - getNoteY(note.time_ms, currentMs)) : NOTE_H,
                  backgroundColor: isHold ? 'rgba(99, 102, 241, 0.25)' : 'rgb(99, 102, 241)',
                  border: isHold ? '1px solid rgba(99, 102, 241, 0.4)' : 'none',
                  borderRadius: isHold ? '2px' : '1px',
                }}
              />
            )
          })}

          {/* Preview point marker */}
          {showPreviewMarker && (
            <div
              className="absolute left-0 right-0 flex items-center pointer-events-none z-10"
              style={{ top: previewY }}
            >
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-500/50 shrink-0 ml-1" />
              <div className="flex-1 border-t border-emerald-400/40 border-dashed" />
            </div>
          )}

          {/* Time indicator on hover */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none">
            <span className="text-[10px] text-surface-600 bg-surface-950/80 px-2 py-0.5 rounded">
              {duration > 0 ? `${Math.floor(currentTime / 60)}:${(currentTime % 60).toFixed(0).padStart(2, '0')}` : '0:00'}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
