import type { Beatmap } from '../types/beatmap'
import { BeatmapInfo } from './BeatmapInfo'
import { ResultPanel } from './ResultPanel'

interface ConvertPanelProps {
  beatmap: Beatmap
  isConverting: boolean
  convertedContent: string | null
  onConvert: () => void
  onReset: () => void
}

export function ConvertPanel({
  beatmap,
  isConverting,
  convertedContent,
  onConvert,
  onReset,
}: ConvertPanelProps) {
  const targetFormat = beatmap.source_format === 'OsuMania' ? '.sm' : '.osu'

  return (
    <div className="w-full max-w-2xl space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-surface-200">
          {beatmap.source_format === 'OsuMania' ? 'osu!mania' : 'Etterna'} Beatmap
        </h2>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-md bg-surface-800 text-xs text-surface-400 font-mono">
            {beatmap.source_format === 'OsuMania' ? 'osu!mania' : 'StepMania'}
          </span>
        </div>
      </div>

      <BeatmapInfo beatmap={beatmap} />

      <div className="flex items-center gap-3">
        <button
          onClick={onConvert}
          disabled={isConverting}
          className={`
            flex-1 px-6 py-3 rounded-xl font-medium text-sm
            transition-all duration-200 ease-out
            ${isConverting
              ? 'bg-accent/50 text-white/70 cursor-wait'
              : 'bg-accent text-white hover:bg-accent-hover active:scale-[0.98] shadow-lg shadow-accent/20'
            }
          `}
        >
          {isConverting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Converting...
            </span>
          ) : (
            `Convert to ${targetFormat}`
          )}
        </button>

        <button
          onClick={onReset}
          className="px-4 py-3 rounded-xl text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-all text-sm"
        >
          New file
        </button>
      </div>

      {convertedContent && (
        <ResultPanel content={convertedContent} filename={targetFormat} />
      )}
    </div>
  )
}
