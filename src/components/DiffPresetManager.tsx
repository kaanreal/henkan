import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDiffPresetsStore } from '../stores/useDiffPresetsStore'
import { PLACEHOLDERS, DEFAULT_PRESETS, placeholderDescription, presetDisplayName } from '../lib/diffTemplate'
import type { Beatmap, ExportConfig } from '../types/beatmap'
import { expandDiffTemplate } from '../lib/diffTemplate'

interface Props {
  open: boolean
  beatmap: Beatmap | null
  config: ExportConfig | null
  onClose: () => void
}

export function DiffPresetManager({ open, beatmap, config, onClose }: Props) {
  const { t } = useTranslation()
  const { presets, addPreset, updatePreset, deletePreset, resetToDefaults } = useDiffPresetsStore()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [newTemplate, setNewTemplate] = useState('')
  const [leaving, setLeaving] = useState(false)

  function handleClose() {
    setLeaving(true)
    setEditingId(null)
    setTimeout(() => { setLeaving(false); onClose() }, 150)
  }

  function handleAdd() {
    if (!newName.trim() || !newTemplate.trim()) return
    addPreset(newName.trim(), newTemplate.trim())
    setNewName('')
    setNewTemplate('')
  }

  function handleUpdate(id: string, name: string, template: string) {
    updatePreset(id, { name, template })
    setEditingId(null)
  }

  if (!open && !leaving) return null

  const preview = (template: string) => {
    if (!beatmap || !config) return template
    return expandDiffTemplate(template, beatmap, config)
  }

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${leaving ? 'pointer-events-none' : ''}`}>
      <div
        className={`absolute inset-0 bg-black/70 ${leaving ? 'animate-fade-out' : 'animate-fade-in'}`}
        onClick={handleClose}
      />
      <div className={`relative w-full max-w-lg mx-4 max-h-[80vh] flex flex-col ${leaving ? 'animate-fade-out' : 'animate-scale-in'}`}>
        <div className="bg-surface-900/95 border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col max-h-full">
          <div className="h-0.5 bg-gradient-to-r from-accent via-accent-muted to-accent/40 shrink-0" />
          <div className="px-5 pt-5 pb-4 space-y-4 overflow-y-auto custom-scrollbar min-h-0">
            <div>
              <h2 className="text-base font-semibold text-surface-100 tracking-tight">{t('diffPreset.title')}</h2>
              <p className="text-[11px] text-surface-500 mt-px">{t('diffPreset.subtitle')}</p>
            </div>

            {/* Placeholder reference */}
            <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
              <p className="text-[10px] font-semibold text-surface-500 tracking-widest uppercase mb-2">{t('diffPreset.availablePlaceholders')}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {PLACEHOLDERS.map(p => (
                  <div key={p.tag} className="flex items-baseline gap-2">
                    <code className="text-[11px] text-accent-muted font-mono shrink-0">{p.tag}</code>
                    <span className="text-[10px] text-surface-500 truncate">{placeholderDescription(p.key)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Existing presets */}
            <div className="space-y-1.5">
              {presets.map(p => (
                <div key={p.id}>
                  {editingId === p.id ? (
                    <PresetEditor
                      name={p.name}
                      template={p.template}
                      preview={preview(p.template)}
                      onSave={(name, template) => handleUpdate(p.id, name, template)}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <div className="flex items-center gap-2 group">
                      <button
                        onClick={() => { setEditingId(p.id) }}
                        className="flex-1 text-left px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.05]
                          hover:bg-white/[0.06] hover:border-white/10 transition-all duration-75"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-surface-200">{presetDisplayName(p)}</span>
                          <span className="text-[10px] text-surface-500 font-mono">{p.template}</span>
                        </div>
                        <div className="text-[10px] text-surface-500 mt-0.5">
                          {t('diffPreset.result')}: <span className="text-surface-400">{preview(p.template) || t('diffPreset.empty')}</span>
                        </div>
                      </button>
                      {!DEFAULT_PRESETS.some(d => d.id === p.id) && (
                        <button
                          onClick={() => deletePreset(p.id)}
                          className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center
                            text-surface-600 hover:text-red-400 hover:bg-red-400/10
                            opacity-0 group-hover:opacity-100 transition-all duration-75"
                          title={t('diffPreset.deletePreset')}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="h-px bg-white/[0.04]" />

            {/* Add new preset */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-surface-500 tracking-widest uppercase">{t('diffPreset.newPreset')}</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder={t('diffPreset.presetName')}
                  className="flex-1 h-9 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 text-xs text-surface-200 placeholder-surface-600 outline-none focus:border-accent/40 focus:bg-accent/[0.03] transition-colors"
                />
                <button
                  onClick={handleAdd}
                  disabled={!newName.trim() || !newTemplate.trim()}
                  className="h-9 px-4 rounded-lg bg-accent text-white text-xs font-medium
                    hover:bg-accent-hover active:scale-[0.97] transition-all duration-75
                    disabled:opacity-40 disabled:cursor-not-allowed
                    shadow-sm shadow-accent/20"
                >
                  {t('queue.add')}
                </button>
              </div>
              <input
                type="text"
                value={newTemplate}
                onChange={e => setNewTemplate(e.target.value)}
                placeholder="e.g. <diff> - <creator> [<rate>]"
                className="w-full h-9 bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 text-xs text-surface-200 font-mono placeholder-surface-600 outline-none focus:border-accent/40 focus:bg-accent/[0.03] transition-colors"
              />
              {newTemplate && (
                <div className="text-[10px] text-surface-500 px-1">
                  {t('diffPreset.preview')}: <span className="text-surface-400">{preview(newTemplate) || t('diffPreset.empty')}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 px-5 pb-5 pt-1 shrink-0">
            <button
              onClick={() => { resetToDefaults(); setEditingId(null) }}
              className="h-10 px-4 rounded-xl text-xs font-medium
                bg-white/[0.04] border border-white/8 text-surface-400
                hover:bg-white/[0.07] hover:text-surface-200
                transition-all duration-75"
            >
              {t('diffPreset.resetDefaults')}
            </button>
            <div className="flex-1" />
            <button
              onClick={handleClose}
              className="h-10 px-6 rounded-xl text-sm font-medium
                bg-white/[0.04] border border-white/8 text-surface-400
                hover:bg-white/[0.07] hover:text-surface-200
                transition-all duration-75"
            >
              {t('common.done')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PresetEditor({ name, template, preview, onSave, onCancel }: {
  name: string
  template: string
  preview: string
  onSave: (name: string, template: string) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [editName, setEditName] = useState(name)
  const [editTemplate, setEditTemplate] = useState(template)

  return (
    <div className="px-3 py-2.5 rounded-xl bg-white/[0.05] border border-accent/30 space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={editName}
          onChange={e => setEditName(e.target.value)}
          className="flex-1 h-8 bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 text-xs text-surface-200 outline-none focus:border-accent/40"
        />
      </div>
      <input
        type="text"
        value={editTemplate}
        onChange={e => setEditTemplate(e.target.value)}
        className="w-full h-8 bg-white/[0.04] border border-white/[0.06] rounded-lg px-2.5 text-xs text-surface-200 font-mono outline-none focus:border-accent/40"
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-surface-500">{t('diffPreset.preview')}: <span className="text-surface-400">{preview || t('diffPreset.empty')}</span></span>
        <div className="flex gap-1.5">
          <button onClick={onCancel} className="px-3 py-1 rounded-lg text-[10px] font-medium text-surface-400 hover:text-surface-200 transition-colors">
            {t('common.cancel')}
          </button>
          <button
            onClick={() => onSave(editName, editTemplate)}
            disabled={!editName.trim() || !editTemplate.trim()}
            className="px-3 py-1 rounded-lg text-[10px] font-medium bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-40"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
