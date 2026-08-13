import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Beatmap, ConvertDirection, ExportConfig } from '../types/beatmap'
import { FilePicker } from './FilePicker'
import { useDiffPresetsStore } from '../stores/useDiffPresetsStore'
import { expandDiffTemplate } from '../lib/diffTemplate'

interface Props {
  beatmap: Beatmap
  config: ExportConfig
  mediaUrls: { audio: string | null; background: string | null; banner: string | null; cdtitle: string | null }
  tapCount: number
  holdCount: number
  isConverting: boolean
  switchingDifficulty: boolean
  direction: ConvertDirection
  diffNameTemplate: string
  onUpdateConfig: (partial: Partial<ExportConfig>) => void
  onChangeFile: (field: string, current: string | null) => void
  onConvert: () => void
  onReset: () => void
  onSelectDifficulty: (index: number) => void
  onUpdateDiffNameTemplate: (template: string) => void
  onOpenPresetManager: () => void
}

function fmt(s: number) {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function BpmDisplay(timing_points: Beatmap['timing_points']) {
  const bpm = timing_points
    .filter(tp => tp.uninherited && tp.beat_length > 0)
    .map(tp => (60_000 / tp.beat_length).toFixed(1))
    .join(', ')
  return bpm || '-'
}

export function MetadataPanel({
  beatmap, config, mediaUrls, tapCount, holdCount,
  isConverting, switchingDifficulty, direction, diffNameTemplate,
  onUpdateConfig, onChangeFile, onConvert, onReset, onSelectDifficulty,
  onUpdateDiffNameTemplate, onOpenPresetManager,
}: Props) {
  const { t } = useTranslation()
  const isOsu = beatmap.source_format === 'OsuMania'
  const targetExt = isOsu ? '.sm' : '.osu'
  const totalNotes = tapCount + holdCount
  const [showAdvanced, setShowAdvanced] = useState(false)
  const { presets } = useDiffPresetsStore()

  const hasTemplate = diffNameTemplate.length > 0
  const expandedDiffName = hasTemplate
    ? expandDiffTemplate(diffNameTemplate, beatmap, config, config.conversion_rate)
    : config.difficulty_name

  return (
    <div className="w-full max-w-xl space-y-5 animate-fade-in">

      {/* Beatmap identity */}
      <div className="space-y-0.5 animate-fade-in">
        <h1 className="text-lg font-semibold text-surface-100 tracking-tight leading-tight">
          {config.artist} - {config.title}
        </h1>
        <p className="text-sm text-surface-500">
          {t('metadataPanel.mappedBy', { creator: config.creator, difficulty: expandedDiffName || config.difficulty_name })}
        </p>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { label: t('beatmapInfo.keys'), value: `${beatmap.keys}K` },
          { label: t('beatmapInfo.notes'), value: totalNotes.toLocaleString() },
          { label: 'BPM', value: BpmDisplay(beatmap.timing_points) },
          { label: t('metadataPanel.length'), value: fmt(beatmap.duration_ms / 1000) },
          { label: t('metadataPanel.source'), value: isOsu ? 'osu!mania' : 'StepMania' },
        ].map((s, i) => (
          <span key={i}
            className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/5 text-xs text-surface-400 font-medium tracking-wide"
          >
            {s.label} <span className="text-surface-200 ml-1">{s.value}</span>
          </span>
        ))}
      </div>

      {/* Difficulty selector */}
      {beatmap.available_difficulties.length > 1 && (
        <div className="animate-fade-in">
          <div className="flex items-center gap-2 mb-2.5">
            <h2 className="text-[11px] font-semibold text-surface-500 tracking-widest uppercase">{t('metadataPanel.difficulties')}</h2>
            <div className="h-px flex-1 bg-white/5" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {beatmap.available_difficulties.map((d, i) => {
              const active = d.name === beatmap.difficulty_name
              return (
                <button
                  key={i}
                  onClick={() => onSelectDifficulty(i)}
                  disabled={switchingDifficulty}
                  className={`
                    relative text-left px-3.5 py-2.5 rounded-xl text-xs font-medium
                    transition-all duration-100 active:scale-[0.97]
                    ${active
                      ? 'bg-accent/15 border border-accent/40 text-accent-muted shadow-sm shadow-accent/10'
                      : switchingDifficulty
                        ? 'bg-white/[0.02] border border-white/5 text-surface-500 cursor-wait'
                        : 'bg-white/[0.03] border border-white/5 text-surface-400 hover:bg-white/[0.06] hover:text-surface-200 hover:border-white/10'
                    }
                  `}
                >
                  <div className="font-medium mb-0.5">{d.name}</div>
                  <div className={`text-[10px] ${active ? 'text-accent/60' : 'text-surface-500'}`}>
                    {active && switchingDifficulty ? t('common.loading') : t('convertDialog.notes', { keys: d.keys, count: d.note_count })}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Metadata editor */}
      <div className="animate-fade-in">
        <div className="flex items-center gap-2 mb-2.5">
          <h2 className="text-[11px] font-semibold text-surface-500 tracking-widest uppercase">{t('metadataPanel.metadata')}</h2>
          <div className="h-px flex-1 bg-white/5" />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label={t('beatmapInfo.title')} value={config.title} onChange={v => onUpdateConfig({ title: v })} />
          <Field label={t('beatmapInfo.artist')} value={config.artist} onChange={v => onUpdateConfig({ artist: v })} />
          <Field label={t('beatmapInfo.mapper')} value={config.creator} onChange={v => onUpdateConfig({ creator: v })} />
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-surface-500 ml-1 font-medium">{t('packSettings.difficultyName')}</span>
              <button
                onClick={onOpenPresetManager}
                className="text-[10px] text-surface-500 hover:text-accent-muted transition-colors"
                title={t('packSettings.managePresets')}
              >
                {t('packSettings.managePresets')}
              </button>
            </div>
            <div className="flex gap-1.5">
              <input
                type="text"
                value={diffNameTemplate}
                onChange={e => onUpdateDiffNameTemplate(e.target.value)}
                placeholder={config.difficulty_name || '<diff> - <creator>'}
                className="flex-1 h-9 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 text-sm text-surface-200 font-mono
                  placeholder-surface-600 outline-none transition-all duration-75
                  focus:border-accent/40 focus:bg-white/[0.06]"
              />
              <select
                value={hasTemplate ? (presets.find(p => p.template === diffNameTemplate)?.id ?? '__custom') : '__none'}
                onChange={e => {
                  const val = e.target.value
                  if (val === '__none') {
                    onUpdateDiffNameTemplate('')
                  } else if (val === '__custom') {
                    // keep current template
                  } else {
                    const preset = presets.find(p => p.id === val)
                    if (preset) onUpdateDiffNameTemplate(preset.template)
                  }
                }}
                className="h-9 bg-white/[0.04] border border-white/[0.06] rounded-lg px-2 text-xs text-surface-200
                  outline-none transition-all duration-75 appearance-none cursor-pointer w-8 shrink-0
                  focus:border-accent/40 focus:bg-accent/[0.03]"
                title={t('packSettings.templatePresets')}
              >
                <option value="__none" className="bg-surface-900">···</option>
                {presets.map(p => (
                  <option key={p.id} value={p.id} className="bg-surface-900">{p.name}</option>
                ))}
                {hasTemplate && !presets.some(p => p.template === diffNameTemplate) && (
                  <option value="__custom" className="bg-surface-900">{t('packSettings.custom')}</option>
                )}
              </select>
            </div>
          </div>
        </div>

        {/* Live preview */}
        {hasTemplate && (
          <div className="mt-1.5 px-2 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.03]">
            <span className="text-[10px] text-surface-500">
              {t('metadataPanel.result')}: <span className="text-surface-300 font-medium">{expandedDiffName || t('metadataPanel.empty')}</span>
            </span>
          </div>
        )}
      </div>

      {/* Difficulty settings */}
      {direction === 'etterna-to-osu' && (
        <div className="animate-fade-in">
          <div className="flex items-center gap-2 mb-2.5">
            <h2 className="text-[11px] font-semibold text-surface-500 tracking-widest uppercase">{t('metadataPanel.difficultySettings')}</h2>
            <div className="h-px flex-1 bg-white/5" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <NumberField label={t('packSettings.hpDrain')} value={config.hp_drain} min={0} max={10} step={0.1} onChange={v => onUpdateConfig({ hp_drain: v })} />
            <NumberField label={t('metadataPanel.od')} value={config.overall_difficulty} min={0} max={10} step={0.1} onChange={v => onUpdateConfig({ overall_difficulty: v })} />
          </div>
        </div>
      )}

      {/* Conversion rate - only for SM→osu */}
      {direction === 'etterna-to-osu' && (
        <div className="animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-[11px] font-semibold text-surface-500 tracking-widest uppercase">{t('metadataPanel.rate')}</h2>
            <div className="h-px flex-1 bg-white/5" />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-surface-400 w-16 shrink-0">{config.conversion_rate.toFixed(2)}x</span>
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.05}
              value={config.conversion_rate}
              onChange={e => onUpdateConfig({ conversion_rate: parseFloat(e.target.value) })}
              className="flex-1 h-2 rounded-full bg-white/15 cursor-pointer"
              style={{ accentColor: '#6366f1' }}
            />
            <button
              onClick={() => onUpdateConfig({ conversion_rate: 1 })}
              className="text-[11px] text-surface-500 hover:text-surface-300 transition-colors px-1"
            >
              {t('metadataPanel.reset')}
            </button>
          </div>
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.preserve_pitch}
              onChange={e => onUpdateConfig({ preserve_pitch: e.target.checked })}
              className="w-3.5 h-3.5 rounded border-white/20 accent-[#6366f1]"
            />
            <span className="text-xs text-surface-400">{t('metadataPanel.preservePitch')}</span>
          </label>
        </div>
      )}

      {/* File pickers */}
      <div className="animate-fade-in">
        <div className="flex items-center gap-2 mb-2.5">
          <h2 className="text-[11px] font-semibold text-surface-500 tracking-widest uppercase">{t('metadataPanel.files')}</h2>
          <div className="h-px flex-1 bg-white/5" />
        </div>
        <div className="space-y-1.5">
          <FilePicker
            label={t('metadataPanel.audio')}
            value={config.audio_filename}
            onPick={() => onChangeFile('audio', config.audio_filename)}
          />
          <FilePicker
            label={t('metadataPanel.background')}
            value={config.background_filename}
            hasPreview={!!mediaUrls.background}
            onPick={() => onChangeFile('background', config.background_filename)}
            onClear={() => onUpdateConfig({ background_filename: null })}
          />
          {direction === 'osu-to-etterna' && (
            <FilePicker
              label={t('metadataPanel.banner')}
              value={config.banner_filename}
              hasPreview={!!mediaUrls.banner}
              onPick={() => onChangeFile('banner', config.banner_filename)}
              onClear={() => onUpdateConfig({ banner_filename: null })}
            />
          )}
          {direction === 'osu-to-etterna' && (
            <FilePicker
              label={t('metadataPanel.cdTitle')}
              value={config.cdtitle_filename}
              hasPreview={!!mediaUrls.cdtitle}
              onPick={() => onChangeFile('cdtitle', config.cdtitle_filename)}
              onClear={() => onUpdateConfig({ cdtitle_filename: null })}
            />
          )}
        </div>
      </div>

      {/* Advanced .sm metadata */}
      {direction === 'osu-to-etterna' && (
        <div className="animate-fade-in">
          <button
            onClick={() => setShowAdvanced(s => !s)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
              bg-white/[0.03] border border-dashed border-white/10
              text-xs font-medium text-surface-400
              hover:bg-white/[0.06] hover:border-white/15 hover:text-surface-200
              active:scale-[0.97] transition-all duration-100 cursor-pointer"
          >
            <span className={`text-surface-500 transition-transform duration-150 ${showAdvanced ? 'rotate-90' : ''}`}>▸</span>
            <span>{t(showAdvanced ? 'metadataPanel.hideAdvanced' : 'metadataPanel.showAdvanced')}</span>
          </button>
          {showAdvanced && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <Field label={t('metadataPanel.subtitle')} value={config.subtitle ?? ''} onChange={v => onUpdateConfig({ subtitle: v || null })} />
                <Field label={t('metadataPanel.titleTranslit')} value={config.title_translit ?? ''} onChange={v => onUpdateConfig({ title_translit: v || null })} />
                <Field label={t('metadataPanel.subtitleTranslit')} value={config.subtitle_translit ?? ''} onChange={v => onUpdateConfig({ subtitle_translit: v || null })} />
                <Field label={t('metadataPanel.artistTranslit')} value={config.artist_translit ?? ''} onChange={v => onUpdateConfig({ artist_translit: v || null })} />
                <Field label={t('metadataPanel.genre')} value={config.genre ?? ''} onChange={v => onUpdateConfig({ genre: v || null })} />
                <Field label={t('metadataPanel.credit')} value={config.credit ?? ''} onChange={v => onUpdateConfig({ credit: v || null })} />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label={t('metadataPanel.displayBpm')} value={config.display_bpm ?? ''} onChange={v => onUpdateConfig({ display_bpm: v || null })} placeholder="180 / 120:240 / *" />
                <NullableNumberField label={t('metadataPanel.sampleStart')} value={config.sample_start ?? ''} placeholder={t('metadataPanel.omit')} onChange={v => onUpdateConfig({ sample_start: v || null })} />
                <NullableNumberField label={t('metadataPanel.sampleLength')} value={config.sample_length ?? ''} placeholder={t('metadataPanel.omit')} onChange={v => onUpdateConfig({ sample_length: v || null })} />
              </div>
              <div>
                <span className="text-[11px] text-surface-500 ml-1 font-medium">{t('metadataPanel.selectable')}</span>
                <div className="flex bg-white/[0.04] rounded-lg border border-white/5 p-0.5 gap-0.5 mt-1">
                  {['YES', 'NO', 'ROULETTE'].map(o => (
                    <button
                      key={o}
                      onClick={() => onUpdateConfig({ selectable: o === 'YES' ? null : o })}
                      className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-75
                        ${(config.selectable ?? 'YES') === o
                          ? 'bg-accent text-white shadow-sm'
                          : 'text-surface-400 hover:text-surface-200'
                        }`}
                    >
                      {o}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Output format */}
      <div className="flex items-center gap-2 animate-fade-in">
        <span className="text-[11px] font-semibold text-surface-500 tracking-widest uppercase mr-1">{t('metadataPanel.format')}</span>
        <FormatToggle
          options={isOsu
            ? [{ label: '.sm folder', value: 'folder' }]
            : [
                { label: '.osu', value: 'osu' },
                { label: '.osz', value: 'osz' },
              ]
          }
          value={config.output_format}
          onChange={v => onUpdateConfig({ output_format: v as 'folder' | 'osu' | 'osz' })}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 animate-fade-in">
        <button
          onClick={onConvert}
          disabled={isConverting}
          className="flex-1 h-11 rounded-xl text-sm font-medium
            bg-white/[0.04] border border-white/8 text-surface-400
            hover:bg-white/[0.07] hover:text-surface-200 active:scale-[0.97] transition-all duration-75
            disabled:opacity-50 disabled:cursor-wait"
        >
          {isConverting ? t('common.converting') : t('convertPanel.convertTo', { format: targetExt })}
        </button>
        <button
          onClick={onReset}
          className="h-11 px-5 rounded-xl text-sm font-medium
            bg-white/[0.04] border border-white/8 text-surface-400
            hover:bg-white/[0.07] hover:text-surface-200 active:scale-[0.97] transition-all duration-75"
        >
          {t('convertPanel.newFile')}
        </button>
      </div>

    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1">
      {label && <span className="text-[11px] text-surface-500 ml-1 font-medium">{label}</span>}
      <input
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full h-9 bg-white/[0.04] border border-white/8 rounded-lg px-3 text-sm text-surface-200
          outline-none transition-all duration-75 placeholder:text-surface-600
          focus:border-accent/40 focus:bg-white/[0.06]"
      />
    </label>
  )
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  const [local, setLocal] = useState<string | null>(null)
  const display = local !== null ? local : String(value)

  const commit = (raw: string) => {
    const v = parseFloat(raw)
    if (!isNaN(v)) {
      onChange(Math.min(max, Math.max(min, v)))
    }
    setLocal(null)
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-surface-500 ml-1 font-medium">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={display}
        onChange={e => setLocal(e.target.value)}
        onFocus={() => setLocal(String(value))}
        onBlur={() => commit(local ?? String(value))}
        onKeyDown={e => { if (e.key === 'Enter') commit(local ?? String(value)) }}
        className="w-full h-9 bg-white/[0.04] border border-white/8 rounded-lg px-3 text-sm text-surface-200
          outline-none transition-all duration-75
          focus:border-accent/40 focus:bg-white/[0.06]"
      />
    </label>
  )
}

function NullableNumberField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder?: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState<string | null>(null)
  const display = local !== null ? local : value

  const commit = (raw: string) => {
    if (raw === '') {
      onChange('')
    } else {
      const v = parseFloat(raw)
      if (!isNaN(v) && v >= 0) {
        onChange(String(v))
      }
    }
    setLocal(null)
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-surface-500 ml-1 font-medium">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={display}
        placeholder={placeholder}        onChange={e => setLocal(e.target.value)}
        onFocus={() => setLocal(value)}
        onBlur={() => commit(local ?? value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(local ?? value) }}
        className="w-full h-9 bg-white/[0.04] border border-white/8 rounded-lg px-3 text-sm text-surface-200
          outline-none transition-all duration-75 placeholder:text-surface-600
          focus:border-accent/40 focus:bg-white/[0.06]"
      />
    </label>
  )
}

function FormatToggle({ options, value, onChange }: {
  options: { label: string; value: string }[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex bg-white/[0.04] rounded-lg border border-white/5 p-0.5 gap-0.5">
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all duration-75
            ${o.value === value
              ? 'bg-accent text-white shadow-sm'
              : 'text-surface-400 hover:text-surface-200'
            }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
