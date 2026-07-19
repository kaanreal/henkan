import { useState } from 'react'
import type { Beatmap, ConvertDirection, ExportConfig } from '../types/beatmap'
import { FilePicker } from './FilePicker'

interface Props {
  beatmap: Beatmap
  config: ExportConfig
  mediaUrls: { audio: string | null; background: string | null; banner: string | null; cdtitle: string | null }
  tapCount: number
  holdCount: number
  isConverting: boolean
  switchingDifficulty: boolean
  direction: ConvertDirection
  onUpdateConfig: (partial: Partial<ExportConfig>) => void
  onChangeFile: (field: string, current: string | null) => void
  onConvert: () => void
  onReset: () => void
  onSelectDifficulty: (index: number) => void
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
  isConverting, switchingDifficulty, direction,
  onUpdateConfig, onChangeFile, onConvert, onReset, onSelectDifficulty,
}: Props) {
  const isOsu = beatmap.source_format === 'OsuMania'
  const targetExt = isOsu ? '.sm' : '.osu'
  const totalNotes = tapCount + holdCount
  const [showAdvanced, setShowAdvanced] = useState(false)

  return (
    <div className="w-full max-w-xl space-y-5 animate-fade-in">

      {/* Beatmap identity */}
      <div className="space-y-0.5 animate-fade-in">
        <h1 className="text-lg font-semibold text-surface-100 tracking-tight leading-tight">
          {config.artist} - {config.title}
        </h1>
        <p className="text-sm text-surface-500">
          mapped by {config.creator} · {config.difficulty_name}
        </p>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { label: 'Keys', value: `${beatmap.keys}K` },
          { label: 'Notes', value: totalNotes.toLocaleString() },
          { label: 'BPM', value: BpmDisplay(beatmap.timing_points) },
          { label: 'Length', value: fmt(beatmap.duration_ms / 1000) },
          { label: 'Source', value: isOsu ? 'osu!mania' : 'StepMania' },
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
            <h2 className="text-[11px] font-semibold text-surface-500 tracking-widest uppercase">Difficulties</h2>
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
                    {active && switchingDifficulty ? 'Loading…' : `${d.keys}K · ${d.note_count} notes`}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Metadata editor */}
      <div className=" animate-fade-in">
        <div className="flex items-center gap-2 mb-2.5">
          <h2 className="text-[11px] font-semibold text-surface-500 tracking-widest uppercase">Metadata</h2>
          <div className="h-px flex-1 bg-white/5" />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Title" value={config.title} onChange={v => onUpdateConfig({ title: v })} />
          <Field label="Artist" value={config.artist} onChange={v => onUpdateConfig({ artist: v })} />
          <Field label="Mapper" value={config.creator} onChange={v => onUpdateConfig({ creator: v })} />
          <Field label="Difficulty" value={config.difficulty_name} onChange={v => onUpdateConfig({ difficulty_name: v })} />
        </div>
      </div>

      {/* Difficulty settings */}
      {direction === 'etterna-to-osu' && (
        <div className=" animate-fade-in">
          <div className="flex items-center gap-2 mb-2.5">
            <h2 className="text-[11px] font-semibold text-surface-500 tracking-widest uppercase">Difficulty Settings</h2>
            <div className="h-px flex-1 bg-white/5" />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <NumberField label="HP Drain" value={config.hp_drain} min={0} max={10} step={0.1} onChange={v => onUpdateConfig({ hp_drain: v })} />
            <NumberField label="OD" value={config.overall_difficulty} min={0} max={10} step={0.1} onChange={v => onUpdateConfig({ overall_difficulty: v })} />
          </div>
        </div>
      )}

      {/* Conversion rate - only for SM→osu */}
      {direction === 'etterna-to-osu' && (
        <div className=" animate-fade-in">
          <div className="flex items-center gap-2 mb-2">
            <h2 className="text-[11px] font-semibold text-surface-500 tracking-widest uppercase">Rate</h2>
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
              Reset
            </button>
          </div>
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.preserve_pitch}
              onChange={e => onUpdateConfig({ preserve_pitch: e.target.checked })}
              className="w-3.5 h-3.5 rounded border-white/20 accent-[#6366f1]"
            />
            <span className="text-xs text-surface-400">Preserve pitch</span>
          </label>
        </div>
      )}

      {/* File pickers */}
      <div className=" animate-fade-in">
        <div className="flex items-center gap-2 mb-2.5">
          <h2 className="text-[11px] font-semibold text-surface-500 tracking-widest uppercase">Files</h2>
          <div className="h-px flex-1 bg-white/5" />
        </div>
        <div className="space-y-1.5">
          <FilePicker
            label="Audio"
            value={config.audio_filename}
            onPick={() => onChangeFile('audio', config.audio_filename)}
          />
          <FilePicker
            label="Background"
            value={config.background_filename}
            hasPreview={!!mediaUrls.background}
            onPick={() => onChangeFile('background', config.background_filename)}
            onClear={() => onUpdateConfig({ background_filename: null })}
          />
          {direction === 'osu-to-etterna' && (
            <FilePicker
              label="Banner"
              value={config.banner_filename}
              hasPreview={!!mediaUrls.banner}
              onPick={() => onChangeFile('banner', config.banner_filename)}
              onClear={() => onUpdateConfig({ banner_filename: null })}
            />
          )}
          {/* CD Title - only for SM target */}
          {direction === 'osu-to-etterna' && (
            <FilePicker
              label="CD Title"
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
            <span>{showAdvanced ? 'Hide' : 'Show'} Advanced (.sm Metadata)</span>
          </button>
          {showAdvanced && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Subtitle (#SUBTITLE)" value={config.subtitle ?? ''} onChange={v => onUpdateConfig({ subtitle: v || null })} />
                <Field label="Title Translit (#TITLETRANSLIT)" value={config.title_translit ?? ''} onChange={v => onUpdateConfig({ title_translit: v || null })} />
                <Field label="Subtitle Translit (#SUBTITLETRANSLIT)" value={config.subtitle_translit ?? ''} onChange={v => onUpdateConfig({ subtitle_translit: v || null })} />
                <Field label="Artist Translit (#ARTISTTRANSLIT)" value={config.artist_translit ?? ''} onChange={v => onUpdateConfig({ artist_translit: v || null })} />
                <Field label="Genre (#GENRE)" value={config.genre ?? ''} onChange={v => onUpdateConfig({ genre: v || null })} />
                <Field label="Credit (#CREDIT)" value={config.credit ?? ''} onChange={v => onUpdateConfig({ credit: v || null })} />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Display BPM (#DISPLAYBPM)" value={config.display_bpm ?? ''} onChange={v => onUpdateConfig({ display_bpm: v || null })} placeholder="180 / 120:240 / *" />
                <NullableNumberField label="Sample Start (#SAMPLESTART)" value={config.sample_start ?? ''} onChange={v => onUpdateConfig({ sample_start: v || null })} />
                <NullableNumberField label="Sample Length (#SAMPLELENGTH)" value={config.sample_length ?? ''} onChange={v => onUpdateConfig({ sample_length: v || null })} />
              </div>
              <div>
                <span className="text-[11px] text-surface-500 ml-1 font-medium">Selectable (#SELECTABLE)</span>
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
        <span className="text-[11px] font-semibold text-surface-500 tracking-widest uppercase mr-1">Format</span>
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
          {isConverting ? 'Converting…' : `Convert to ${targetExt}`}
        </button>
        <button
          onClick={onReset}
          className="h-11 px-5 rounded-xl text-sm font-medium
            bg-white/[0.04] border border-white/8 text-surface-400
            hover:bg-white/[0.07] hover:text-surface-200 active:scale-[0.97] transition-all duration-75"
        >
          New file
        </button>
      </div>

    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-surface-500 ml-1 font-medium">{label}</span>
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

function NullableNumberField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
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
        placeholder="omit"
        onChange={e => setLocal(e.target.value)}
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