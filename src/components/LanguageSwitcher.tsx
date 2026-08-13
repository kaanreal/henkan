import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LANGUAGES, setLanguage } from '../i18n'

function GlobeIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
    </svg>
  )
}

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  const currentCode = LANGUAGES.some(l => l.code === i18n.resolvedLanguage)
    ? i18n.resolvedLanguage as typeof LANGUAGES[number]['code']
    : 'en'
  const currentLabel = LANGUAGES.find(l => l.code === currentCode)?.label

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        title={t('language.switch')}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-surface-400 hover:text-surface-200 text-xs font-medium transition-all duration-75"
      >
        <GlobeIcon />
        <span className="hidden sm:inline">{currentLabel}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 z-50 w-44 py-1.5 rounded-xl border border-white/10 bg-surface-900/95 backdrop-blur-md shadow-2xl animate-scale-in"
        >
          {LANGUAGES.map(l => (
            <button
              key={l.code}
              role="menuitem"
              onClick={() => {
                setLanguage(l.code)
                setOpen(false)
              }}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors duration-75 ${
                l.code === currentCode
                  ? 'text-accent bg-white/[0.06]'
                  : 'text-surface-400 hover:text-surface-200 hover:bg-white/[0.04]'
              }`}
            >
              <span>{l.label}</span>
              {l.code === currentCode && (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
