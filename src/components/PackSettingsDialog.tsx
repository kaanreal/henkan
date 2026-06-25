import { useState } from 'react'

interface PackSettings {
  mode: 'osz' | 'folder'
  creator: string
  hp_drain: number
  overall_difficulty: number
}

interface Props {
  open: boolean
  packName: string
  defaultSettings: PackSettings
  isConverting: boolean
  onConfirm: (settings: PackSettings) => void
  onCancel: () => void
}

export function PackSettingsDialog({ open, packName, defaultSettings, isConverting, onConfirm, onCancel }: Props) {
  const [settings, setSettings] = useState<PackSettings>(defaultSettings)
  const [leaving, setLeaving] = useState(false)

  // Reset state when dialog opens
  if (open && leaving) {
    setLeaving(false)
  }
  if (open && (settings.mode !== defaultSettings.mode || settings.creator !== defaultSettings.creator)) {
    setSettings(defaultSettings)
  }

  function update<K extends keyof PackSettings>(key: K, value: PackSettings[K]) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  function handleCancel() {
    setLeaving(true)
    setTimeout(() => onCancel(), 150)
  }

  function handleConfirm() {
    if (isConverting) return
    setLeaving(true)
    setTimeout(() => onConfirm(settings), 150)
  }

  if (!open && !leaving) return null

  const slider = (label: string, key: 'hp_drain' | 'overall_difficulty', min = 0, max = 10) => (
    <div className="flex items-center gap-3">
      <span className="text-xs text-surface-400 w-24 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.1}
        value={settings[key]}
        onChange={e => update(key, parseFloat(e.target.value))}
        className="flex-1 h-2 rounded-full bg-white/15 cursor-pointer"
        style={{ accentColor: '#6c5ce7' }}
      />
      <span className="text-xs text-surface-300 w-8 text-right font-mono">{settings[key].toFixed(1)}</span>
    </div>
  )

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${leaving ? 'pointer-events-none' : ''}`}>
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm ${leaving ? 'animate-fade-out' : 'animate-fade-in'}`}
        onClick={handleCancel}
      />
      <div className={`relative w-full max-w-sm mx-4 ${leaving ? 'animate-fade-out' : 'animate-scale-in'}`}>
        <div className="bg-surface-900/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
          <div className="h-0.5 bg-gradient-to-r from-accent via-accent-muted to-accent/40" />
          <div className="px-5 pt-5 pb-4 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-surface-100 tracking-tight">Pack settings</h2>
              <p className="text-[11px] text-surface-500 mt-px">{packName}</p>
            </div>

            {/* Mode toggle */}
            <div className="flex gap-1.5 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <button
                onClick={() => update('mode', 'folder')}
                className={`flex-1 h-8 rounded-lg text-xs font-medium transition-all duration-75 ${settings.mode === 'folder' ? 'bg-accent text-white shadow-sm shadow-accent/20' : 'text-surface-400 hover:text-surface-200'}`}
              >
                Folder
              </button>
              <button
                onClick={() => update('mode', 'osz')}
                className={`flex-1 h-8 rounded-lg text-xs font-medium transition-all duration-75 ${settings.mode === 'osz' ? 'bg-accent text-white shadow-sm shadow-accent/20' : 'text-surface-400 hover:text-surface-200'}`}
              >
                .osz archive
              </button>
            </div>

            {/* Mapper */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-surface-400 w-24 shrink-0">Mapper</span>
              <input
                type="text"
                value={settings.creator}
                onChange={e => update('creator', e.target.value)}
                className="flex-1 h-8 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-surface-200 placeholder-surface-600 outline-none focus:border-accent/40 focus:bg-accent/[0.03] transition-colors"
                placeholder="Creator name"
              />
            </div>

            <div className="h-px bg-white/[0.04]" />

            {slider('HP Drain', 'hp_drain')}
            {slider('Overall Diff', 'overall_difficulty')}
          </div>

          <div className="flex items-center gap-2 px-5 pb-5 pt-1">
            <button
              onClick={handleCancel}
              disabled={isConverting}
              className="flex-1 h-10 rounded-xl text-sm font-medium
                bg-white/[0.04] border border-white/8 text-surface-400
                hover:bg-white/[0.07] hover:text-surface-200
                active:scale-[0.97] transition-all duration-75
                disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={isConverting}
              className="flex-1 h-10 rounded-xl text-sm font-medium
                bg-accent text-white
                hover:bg-accent-hover active:scale-[0.97]
                transition-all duration-75
                disabled:opacity-40 disabled:cursor-not-allowed
                shadow-lg shadow-accent/25"
            >
              {isConverting ? 'Converting…' : 'Convert'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
