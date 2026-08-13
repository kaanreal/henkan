import { useState, useEffect } from 'react'
import { useT } from '../i18n'
import { useDiffPresetsStore } from '../stores/useDiffPresetsStore'
import { presetDisplayName } from '../lib/diffTemplate'

interface PackSettings {
  mode: 'osz' | 'folder'
  creator: string
  hp_drain: number
  overall_difficulty: number
  diff_name_template: string
}

interface Props {
  open: boolean
  packName: string
  defaultSettings: PackSettings
  isConverting: boolean
  onConfirm: (settings: PackSettings) => void
  onCancel: () => void
  onOpenPresetManager: () => void
}

export function PackSettingsDialog({ open, packName, defaultSettings, isConverting, onConfirm, onCancel, onOpenPresetManager }: Props) {
  const t = useT()
  const [settings, setSettings] = useState<PackSettings>(defaultSettings)
  const [leaving, setLeaving] = useState(false)
  const { presets } = useDiffPresetsStore()

  useEffect(() => {
    if (open) {
      setSettings(defaultSettings)
      setLeaving(false)
    }
  }, [open, defaultSettings])

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

  const hasTemplate = settings.diff_name_template.length > 0

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
        style={{ accentColor: '#6366f1' }}
      />
      <span className="text-xs text-surface-300 w-8 text-right font-mono">{settings[key].toFixed(1)}</span>
    </div>
  )

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${leaving ? 'pointer-events-none' : ''}`}>
      <div
        className={`absolute inset-0 bg-black/70 ${leaving ? 'animate-fade-out' : 'animate-fade-in'}`}
        onClick={handleCancel}
      />
      <div className={`relative w-full max-w-md mx-4 ${leaving ? 'animate-fade-out' : 'animate-scale-in'}`}>
        <div className="bg-surface-900/95 border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
          <div className="h-0.5 bg-gradient-to-r from-accent via-accent-muted to-accent/40" />
          <div className="px-5 pt-5 pb-4 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-surface-100 tracking-tight">{t('packSettings.title')}</h2>
              <p className="text-[11px] text-surface-500 mt-px">{packName}</p>
            </div>

            {/* Mode toggle */}
            <div className="flex gap-1.5 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <button
                onClick={() => update('mode', 'folder')}
                className={`flex-1 h-8 rounded-lg text-xs font-medium transition-all duration-75 ${settings.mode === 'folder' ? 'bg-accent text-white shadow-sm shadow-accent/20' : 'text-surface-400 hover:text-surface-200'}`}
              >
                {t('packSettings.folder')}
              </button>
              <button
                onClick={() => update('mode', 'osz')}
                className={`flex-1 h-8 rounded-lg text-xs font-medium transition-all duration-75 ${settings.mode === 'osz' ? 'bg-accent text-white shadow-sm shadow-accent/20' : 'text-surface-400 hover:text-surface-200'}`}
              >
                {t('packSettings.oszArchive')}
              </button>
            </div>

            {/* Mapper */}
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-surface-500 ml-1 font-medium">{t('packSettings.mapper')}</span>
              <input
                type="text"
                value={settings.creator}
                onChange={e => update('creator', e.target.value)}
                className="w-full h-9 px-3 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-surface-200 placeholder-surface-600 outline-none focus:border-accent/40 focus:bg-white/[0.06] transition-colors"
                placeholder={t('packSettings.creatorPlaceholder')}
              />
            </div>

            {/* Diff Name */}
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
                  value={settings.diff_name_template}
                  onChange={e => update('diff_name_template', e.target.value)}
                  placeholder="<diff> - <creator>"
                  className="flex-1 h-9 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 text-sm text-surface-200 font-mono
                    placeholder-surface-600 outline-none transition-all duration-75
                    focus:border-accent/40 focus:bg-white/[0.06]"
                />
                <select
                  value={hasTemplate ? (presets.find(p => p.template === settings.diff_name_template)?.id ?? '__custom') : '__none'}
                  onChange={e => {
                    const val = e.target.value
                    if (val === '__none') {
                      update('diff_name_template', '')
                    } else if (val === '__custom') {
                      // keep current template
                    } else {
                      const preset = presets.find(p => p.id === val)
                      if (preset) update('diff_name_template', preset.template)
                    }
                  }}
                  className="h-9 bg-white/[0.04] border border-white/[0.06] rounded-lg px-2 text-xs text-surface-200
                    outline-none transition-all duration-75 appearance-none cursor-pointer w-8 shrink-0
                    focus:border-accent/40 focus:bg-accent/[0.03]"
                  title={t('packSettings.templatePresets')}
                >
                  <option value="__none" className="bg-surface-900">···</option>
                  {presets.map(p => (
                    <option key={p.id} value={p.id} className="bg-surface-900">{presetDisplayName(p)}</option>
                  ))}
                  {hasTemplate && !presets.some(p => p.template === settings.diff_name_template) && (
                    <option value="__custom" className="bg-surface-900">{t('packSettings.custom')}</option>
                  )}
                </select>
              </div>
            </div>

            <div className="h-px bg-white/[0.04]" />

            {slider(t('packSettings.hpDrain'), 'hp_drain')}
            {slider(t('packSettings.overallDiff'), 'overall_difficulty')}
          </div>

          <div className="flex items-center gap-2 px-5 pb-5 pt-1">
            <button
              onClick={handleCancel}
              disabled={isConverting}
              className="flex-1 h-10 rounded-xl text-sm font-medium
                bg-white/[0.04] border border-white/8 text-surface-400
                hover:bg-white/[0.07] hover:text-surface-200
                transition-all duration-75
                disabled:opacity-40"
            >
              {t('common.cancel')}
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
              {isConverting ? t('common.converting') : t('convertDialog.title')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
