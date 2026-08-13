import { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  onSeparateSongs: () => void
  onCombineAnyway: () => void
  onCancel: () => void
}

export function MultiAudioWarning({ onSeparateSongs, onCombineAnyway, onCancel }: Props) {
  const { t } = useTranslation()
  const [leaving, setLeaving] = useState(false)
  const [choice, setChoice] = useState<'separate' | 'combine' | null>(null)

  function handleCancel() {
    setLeaving(true)
    setTimeout(() => onCancel(), 200)
  }

  function handleSeparate() {
    setChoice('separate')
  }

  function handleCombine() {
    setChoice('combine')
  }

  function handleConfirm() {
    if (!choice) return
    setLeaving(true)
    setTimeout(() => {
      if (choice === 'separate') onSeparateSongs()
      else onCombineAnyway()
    }, 200)
  }

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${leaving ? 'pointer-events-none' : ''}`}>
      <div
        className={`absolute inset-0 bg-black/70 transition-all duration-200 ${!leaving ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={handleCancel}
      />
      <div className={`relative w-full max-w-sm mx-4 transition-all duration-200 ease-out ${!leaving ? 'scale-100 opacity-100 translate-y-0' : 'scale-90 opacity-0 translate-y-4'}`}>
        <div className="bg-surface-900/95 border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">

          <div className="px-5 pt-5 pb-3">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div>
                <h2 className="text-base font-semibold text-surface-100 tracking-tight">{t('multiAudio.title')}</h2>
                <p className="text-[11px] text-surface-500 mt-px">{t('multiAudio.subtitle')}</p>
              </div>
            </div>
          </div>

          <div className="px-5 py-2">
            <p className="text-xs text-surface-400 leading-relaxed">
              {t('multiAudio.description')}
            </p>
            <div className="mt-4 space-y-2">
              <button
                onClick={handleSeparate}
                className={`w-full flex items-start gap-3 px-3.5 py-3 rounded-xl text-left text-sm border transition-all duration-150
                  ${choice === 'separate'
                    ? 'bg-accent/[0.06] border-accent/20 text-surface-100'
                    : 'border-white/[0.04] text-surface-300 hover:bg-white/[0.03] hover:border-white/10'
                  }`}
              >
                <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-all duration-150
                  ${choice === 'separate'
                    ? 'bg-accent shadow-sm shadow-accent/30'
                    : 'border border-white/12'
                  }`}>
                  {choice === 'separate' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </div>
                <div>
                  <div className="font-medium">{t('multiAudio.separateTitle')}</div>
                  <div className="text-[11px] text-surface-500 mt-px leading-relaxed">
                    {t('multiAudio.separateDescription')}
                  </div>
                  <div className="mt-1">
                    <span className="inline-block text-[10px] font-medium text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">{t('multiAudio.recommended')}</span>
                  </div>
                </div>
              </button>
              <button
                onClick={handleCombine}
                className={`w-full flex items-start gap-3 px-3.5 py-3 rounded-xl text-left text-sm border transition-all duration-150
                  ${choice === 'combine'
                    ? 'bg-amber-400/[0.06] border-amber-400/20 text-surface-100'
                    : 'border-white/[0.04] text-surface-400 hover:bg-white/[0.03] hover:border-white/10 hover:text-surface-300'
                  }`}
              >
                <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-all duration-150
                  ${choice === 'combine'
                    ? 'bg-amber-400 shadow-sm shadow-amber-400/30'
                    : 'border border-white/12'
                  }`}>
                  {choice === 'combine' && (
                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </div>
                <div>
                  <div className="font-medium">{t('multiAudio.combineTitle')}</div>
                  <div className="text-[11px] text-surface-500 mt-px leading-relaxed">
                    {t('multiAudio.combineDescription')}
                  </div>
                  <div className="mt-1">
                    <span className="inline-block text-[10px] font-medium text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">{t('multiAudio.notRecommended')}</span>
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 px-5 pb-5 pt-1">
            <button
              onClick={handleCancel}
              className="flex-1 h-10 rounded-xl text-sm font-medium
                bg-white/[0.04] border border-white/8 text-surface-400
                hover:bg-white/[0.07] hover:text-surface-200
                active:scale-[0.97] transition-all duration-75"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleConfirm}
              disabled={!choice}
              className="flex-1 h-10 rounded-xl text-sm font-medium
                bg-accent text-white
                hover:bg-accent-hover active:scale-[0.97]
                transition-all duration-75
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {choice === 'separate' ? t('multiAudio.convertSeparate') : choice === 'combine' ? t('multiAudio.combineAnyway') : t('multiAudio.chooseOption')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}