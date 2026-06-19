import type { Beatmap } from '../types/beatmap'

interface BeatmapInfoProps {
  beatmap: Beatmap
}

export function BeatmapInfo({ beatmap }: BeatmapInfoProps) {
  const tapCount = beatmap.notes.filter(n => !n.hold).length
  const holdCount = beatmap.notes.filter(n => n.hold).length
  const bpmChanges = beatmap.timing_points.filter(tp => tp.uninherited && tp.beat_length > 0).length

  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: 'Title', value: beatmap.title || '-' },
        { label: 'Artist', value: beatmap.artist || '-' },
        { label: 'Mapper', value: beatmap.creator || '-' },
        { label: 'Difficulty', value: beatmap.difficulty_name || '-' },
        { label: 'Keys', value: `${beatmap.keys}K` },
        { label: 'Notes', value: `${tapCount + holdCount} (${tapCount} taps, ${holdCount} holds)` },
        { label: 'BPM Changes', value: `${bpmChanges}` },
        { label: 'Timing Points', value: `${beatmap.timing_points.length}` },
        { label: 'Duration', value: `${(beatmap.duration_ms / 1000).toFixed(1)}s` },
      ].map((item, i) => (
        <div
          key={item.label}
          className="bg-surface-900/50 rounded-lg px-4 py-3 border border-surface-800"
          style={{ animation: `fade-in 0.3s ease-out ${i * 0.05}s both` }}
        >
          <p className="text-xs text-surface-500 mb-0.5">{item.label}</p>
          <p className="text-sm font-medium text-surface-200 truncate">{item.value}</p>
        </div>
      ))}
    </div>
  )
}
