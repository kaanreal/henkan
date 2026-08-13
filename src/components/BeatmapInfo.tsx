import { useTranslation } from 'react-i18next'
import type { Beatmap } from '../types/beatmap'

interface BeatmapInfoProps {
  beatmap: Beatmap
}

export function BeatmapInfo({ beatmap }: BeatmapInfoProps) {
  const { t } = useTranslation()
  const tapCount = beatmap.notes.filter(n => !n.hold).length
  const holdCount = beatmap.notes.filter(n => n.hold).length
  const bpmChanges = beatmap.timing_points.filter(tp => tp.uninherited && tp.beat_length > 0).length

  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: t('beatmapInfo.title'), value: beatmap.title || '-' },
        { label: t('beatmapInfo.artist'), value: beatmap.artist || '-' },
        { label: t('beatmapInfo.mapper'), value: beatmap.creator || '-' },
        { label: t('beatmapInfo.difficulty'), value: beatmap.difficulty_name || '-' },
        { label: t('beatmapInfo.keys'), value: `${beatmap.keys}K` },
        {
          label: t('beatmapInfo.notes'),
          value: t('beatmapInfo.notesValue', { total: tapCount + holdCount, taps: tapCount, holds: holdCount }),
        },
        { label: t('beatmapInfo.bpmChanges'), value: `${bpmChanges}` },
        { label: t('beatmapInfo.timingPoints'), value: `${beatmap.timing_points.length}` },
        { label: t('beatmapInfo.duration'), value: t('beatmapInfo.durationValue', { seconds: (beatmap.duration_ms / 1000).toFixed(1) }) },
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
