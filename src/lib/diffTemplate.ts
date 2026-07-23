import type { Beatmap, ExportConfig } from '../types/beatmap'

export interface DiffPreset {
  id: string
  name: string
  template: string
}

export interface TemplateContext {
  beatmap?: Beatmap | null
  config?: ExportConfig | null
}

export const PLACEHOLDERS = [
  { tag: '<diff>', description: 'Original difficulty name' },
  { tag: '<creator>', description: 'Mapper / charter' },
  { tag: '<title>', description: 'Song title' },
  { tag: '<artist>', description: 'Song artist' },
  { tag: '<msd>', description: 'Difficulty rating (MSD / Minacalc)' },
  { tag: '<bpm>', description: 'Song BPM' },
  { tag: '<rate>', description: 'Conversion rate (e.g. 1.5x)' },
]

export const DEFAULT_PRESETS: DiffPreset[] = [
  { id: 'keep', name: 'Keep Original', template: '<diff>' },
  { id: 'diff-creator', name: 'Diff - Creator', template: '<diff> - <creator>' },
  { id: 'diff-rate', name: 'Diff [Rate]', template: '<diff> [<rate>]' },
  { id: 'diff-msd', name: 'MSD Rating', template: '<msd>' },
]

function getBpm(beatmap: Beatmap): string {
  const bpms = beatmap.timing_points
    .filter(tp => tp.uninherited && tp.beat_length > 0)
    .map(tp => Math.round(60_000 / tp.beat_length))
  if (bpms.length === 0) return '0'
  if (bpms.length === 1) return String(bpms[0])
  const min = Math.min(...bpms)
  const max = Math.max(...bpms)
  return min === max ? String(min) : `${min}-${max}`
}

export function expandDiffTemplate(
  template: string,
  beatmap: Beatmap,
  config: ExportConfig,
  conversionRate?: number,
): string {
  if (!template) return config.difficulty_name || beatmap.difficulty_name

  const rate = conversionRate ?? config.conversion_rate ?? 1
  const rateLabel = Math.abs(rate - 1) < 0.01 ? '' : `${rate.toFixed(2).replace(/\.?0+$/, '')}x`

  const vars: Record<string, string> = {
    '<diff>': config.difficulty_name || beatmap.difficulty_name || '',
    '<creator>': config.creator || beatmap.creator || '',
    '<title>': config.title || beatmap.title || '',
    '<artist>': config.artist || beatmap.artist || '',
    '<bpm>': getBpm(beatmap),
    '<rate>': rateLabel,
    '<msd>': beatmap.difficulty_rating != null
      ? (beatmap.difficulty_rating % 1 === 0
          ? String(Math.round(beatmap.difficulty_rating))
          : beatmap.difficulty_rating.toFixed(2))
      : '',
  }

  let result = template
  for (const [tag, value] of Object.entries(vars)) {
    result = result.replaceAll(tag, value)
  }
  return result
}

export function expandDiffTemplateFromContext(
  template: string,
  ctx: TemplateContext,
  conversionRate?: number,
): string {
  const beatmap = ctx.beatmap
  const config = ctx.config
  if (!beatmap || !config) return template
  return expandDiffTemplate(template, beatmap, config, conversionRate)
}

export function generatePresetId(): string {
  return `preset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}
