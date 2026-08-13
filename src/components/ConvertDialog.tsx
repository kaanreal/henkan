import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Difficulty {
  name: string
  keys: number
  note_count: number
}

interface Props {
  open: boolean
  difficulties: Difficulty[]
  currentIndex: number
  onConfirm: (indices: number[]) => void
  onCancel: () => void
}

export function ConvertDialog({ open, difficulties, currentIndex, onConfirm, onCancel }: Props) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState<Set<number>>(new Set([currentIndex]))
  const [leaving, setLeaving] = useState(false)

  // Reset state when dialog opens - called synchronously during first render
  if (open && leaving) {
    setLeaving(false)
  }
  if (open && selected.size === 1 && !selected.has(currentIndex)) {
    setSelected(new Set([currentIndex]))
  }

  const allSelected = selected.size === difficulties.length

  function toggle(i: number) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(difficulties.map((_, i) => i)))
    }
  }

  function handleCancel() {
    setLeaving(true)
    setTimeout(() => onCancel(), 200)
  }

  function handleConfirm() {
    setLeaving(true)
    setTimeout(() => onConfirm([...selected]), 200)
  }

  if (!open && !leaving) return null

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${leaving ? 'pointer-events-none' : ''}`}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/70 transition-all duration-200 ${!leaving ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={handleCancel}
      />

      {/* Panel */}
      <div className={`relative w-full max-w-sm mx-4 transition-all duration-200 ease-out ${!leaving ? 'scale-100 opacity-100 translate-y-0' : 'scale-90 opacity-0 translate-y-4'}`}>
        <div className="bg-surface-900/95 border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">

          {/* Accent glow bar */}
          <div className="h-0.5 bg-gradient-to-r from-accent via-accent-muted to-accent/40" />

          {/* Header */}
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center shadow-sm shadow-accent/10">
                <svg className="w-4.5 h-4.5 text-accent-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                </svg>
              </div>
              <div>
                <h2 className="text-base font-semibold text-surface-100 tracking-tight">{t('convertDialog.title')}</h2>
                <p className="text-[11px] text-surface-500 mt-px">{t('convertDialog.difficultyCount', { count: difficulties.length })}</p>
              </div>
            </div>
          </div>

          {/* Diff list */}
          <div className="px-3 py-1 max-h-60 overflow-y-auto hide-scrollbar space-y-1">
            {difficulties.map((d, i) => {
              const checked = selected.has(i)
              return (
                <button
                  key={i}
                  onClick={() => toggle(i)}
                  style={{ animationDelay: `${i * 45}ms` }}
                  className={`
                    w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left text-sm
                    border transition-all duration-150
                    animate-fade-in
                    ${checked
                      ? 'bg-accent/[0.06] border-accent/20 text-surface-100 shadow-sm shadow-accent/5'
                      : 'border-white/[0.04] text-surface-400 hover:bg-white/[0.03] hover:border-white/10 hover:text-surface-200'
                    }
                  `}
                >
                  <div className={`
                    w-4 h-4 rounded flex items-center justify-center shrink-0 transition-all duration-150
                    ${checked
                      ? 'bg-accent shadow-sm shadow-accent/30'
                      : 'border border-white/12'
                    }
                  `}>
                    {checked && (
                      <svg className="w-2.5 h-2.5 text-white animate-scale-in" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate leading-tight">{d.name}</div>
                    <div className="text-[11px] text-surface-500 mt-px">{t('convertDialog.notes', { keys: d.keys, count: d.note_count })}</div>
                  </div>
                  {i === currentIndex && (
                    <span className="text-[10px] font-medium text-accent-muted/50">{t('convertDialog.current')}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Select all */}
          <div className="px-5 pt-2 pb-1">
            <button
              onClick={toggleAll}
              className="w-full flex items-center gap-3 py-1 text-xs text-surface-500 hover:text-surface-300 transition-colors group"
            >
              <div className="flex-1 h-px bg-white/[0.04] group-hover:bg-white/[0.08] transition-colors" />
              <span className="shrink-0 tracking-wide">
                {allSelected ? t('common.deselectAll') : t('common.selectAll')}
              </span>
              <div className="flex-1 h-px bg-white/[0.04] group-hover:bg-white/[0.08] transition-colors" />
            </button>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 px-5 pb-5 pt-1">
            <button
              onClick={handleCancel}
              className="flex-1 h-10 rounded-xl text-sm font-medium
                bg-white/[0.04] border border-white/8 text-surface-400
                hover:bg-white/[0.07] hover:text-surface-200
                transition-all duration-75"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleConfirm}
              disabled={selected.size === 0}
              className="flex-1 h-10 rounded-xl text-sm font-medium
                bg-accent text-white
                hover:bg-accent-hover active:scale-[0.97]
                transition-all duration-75
                disabled:opacity-40 disabled:cursor-not-allowed
                shadow-lg shadow-accent/25"
            >
              {selected.size === difficulties.length
                ? t('convertDialog.convertAll')
                : t('convertDialog.convertWithCount', { count: selected.size })}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
