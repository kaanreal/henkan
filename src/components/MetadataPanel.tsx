import { useState } from 'react'
import type { Beatmap, ConvertDirection, ExportConfig } from '../types/beatmap'
import { FilePicker } from './FilePicker'

interface Props {
  beatmap: Beatmap
  config: ExportConfig
  mediaUrls: { audio: string | null; background: string | null; banner: string | null }
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
  return bpm || '—'
}

export function MetadataPanel({
  beatmap, config, mediaUrls, tapCount, holdCount,
  isConverting, switchingDifficulty, direction,
  onUpdateConfig, onChangeFile, onConvert, onReset, onSelectDifficulty,
}: Props) {
  const isOsu = beatmap.source_format === 'OsuMania'
  const targetExt = isOsu ? '.sm' : '.osu'
  const totalNotes = tapCount + holdCount

  return (
    <div className="w-full max-w-xl space-y-5 animate-fade-in">

      {/* Beatmap identity */}
      <div className="space-y-0.5 animate-fade-in">
        <h1 className="text-lg font-semibold text-surface-100 tracking-tight leading-tight">
          {config.artist} — {config.title}
        </h1>
        <p className="text-sm text-surface-500">
          mapped by {config.creator} · {config.difficulty_name}
        </p>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-2 flex-wrap animate-fade-in delay-100">
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
        <div className="animate-fade-in delay-150">
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
      <div className="animate-fade-in delay-200">
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
        <div className="animate-fade-in delay-200">
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

      {/* Conversion rate */}
      <div className="animate-fade-in delay-200">
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
            style={{ accentColor: '#6c5ce7' }}
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
            className="w-3.5 h-3.5 rounded border-white/20 accent-[#6c5ce7]"
          />
          <span className="text-xs text-surface-400">Preserve pitch</span>
        </label>
      </div>

      {/* File pickers */}
      <div className="animate-fade-in delay-250">
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
          {/* CD Title row with inline name field — only for SM target */}
          {direction === 'osu-to-etterna' && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[11px] text-surface-500 font-medium w-20 shrink-0">CD Title</span>
            <button
              onClick={() => onChangeFile('cdtitle', config.cdtitle_filename)}
              className="flex-1 flex items-center gap-2 bg-white/[0.03] border border-white/8 rounded-lg px-3 h-9
                text-surface-500 hover:text-surface-300 hover:border-white/15 transition-all duration-75 text-left truncate"
            >
              <span className="truncate text-sm">
                {config.cdtitle_filename
                  ? config.cdtitle_filename.split('/').pop()?.split('\\').pop() || config.cdtitle_filename
                  : 'auto'}
              </span>
              <svg className="w-3 h-3 ml-auto shrink-0 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            </button>
            {config.cdtitle_filename && (
              <button
                onClick={() => onUpdateConfig({ cdtitle_filename: null })}
                className="text-surface-600 hover:text-surface-400 transition-colors shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            <input
              value={config.cdtitle_name}
              onChange={e => onUpdateConfig({ cdtitle_name: e.target.value })}
              placeholder="Name"
              className="w-16 h-9 bg-white/[0.04] border border-white/8 rounded-lg px-2 text-sm text-surface-200
                outline-none transition-all duration-75 placeholder:text-surface-600 text-center
                focus:border-accent/40 focus:bg-white/[0.06]"
            />
          </div>
        )}
        </div>
      </div>

      {/* Output format */}
      <div className="flex items-center gap-2 animate-fade-in delay-300">
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
      <div className="flex items-center gap-2 pt-1 animate-fade-in delay-300">
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

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-surface-500 ml-1 font-medium">{label}</span>
      <input
        value={value}
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
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all duration-75 active:scale-[0.97]
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