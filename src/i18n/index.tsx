import {
  cloneElement,
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import {
  detectLocale,
  isCatalogLoaded,
  loadCatalog,
  resolveLocale,
  setActiveLocale,
  translate,
  type Locale,
  type MessageKey,
  type TranslateParams,
} from './core'

export { LANGUAGES, t } from './core'
export type { Locale, MessageKey, PartialCatalog, TranslateParams } from './core'

export const LANGUAGE_STORAGE_KEY = 'henkan_language'

function loadSavedLocale(): Locale | null {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    return saved ? resolveLocale(saved) : null
  } catch {
    return null
  }
}

function saveLocale(locale: Locale) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, locale)
  } catch {
    // storage may be unavailable (private mode, SSR)
  }
}

function initialLocale(): Locale {
  return loadSavedLocale() ?? detectLocale()
}

export function preloadLocale(): Promise<void> {
  const locale = initialLocale()
  setActiveLocale(locale)
  if (typeof document !== 'undefined') document.documentElement.lang = locale
  if (isCatalogLoaded(locale)) return Promise.resolve()
  return Promise.race([
    loadCatalog(locale),
    new Promise<void>((resolve) => setTimeout(resolve, 2000)),
  ])
}

export type LocaleState = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, params?: TranslateParams) => string
}

const LocaleContext = createContext<LocaleState | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    setActiveLocale(locale)
    if (typeof document !== 'undefined') document.documentElement.lang = locale
    if (isCatalogLoaded(locale)) return
    let cancelled = false
    void loadCatalog(locale).then(() => {
      if (!cancelled) setRevision((n) => n + 1)
    })
    return () => {
      cancelled = true
    }
  }, [locale])

  const setLocale = useCallback((next: Locale) => {
    setActiveLocale(next)
    saveLocale(next)
    setLocaleState(next)
  }, [])

  const value = useMemo<LocaleState>(() => ({
    locale,
    setLocale,
    t: (key, params) => translate(locale, key, params),
    // revision is referenced so translations refresh once a lazy catalog arrives
  }), [locale, setLocale, revision]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LocaleContext.Provider value={value}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale(): LocaleState {
  const ctx = useContext(LocaleContext)
  if (!ctx) throw new Error('useLocale must be used within a LocaleProvider')
  return ctx
}

export function useT() {
  return useLocale().t
}

type TransProps = {
  i18nKey: MessageKey
  components?: Record<string, ReactElement<{ children?: ReactNode }>>
  params?: TranslateParams
}

const TAG_RE = /<(\w+)>([^<]*)<\/\1>/g

export function Trans({ i18nKey, components, params }: TransProps) {
  const { t } = useLocale()
  const text = t(i18nKey, params)
  const parts: ReactNode[] = []
  let lastIndex = 0
  for (const match of text.matchAll(TAG_RE)) {
    const index = match.index ?? 0
    if (index > lastIndex) parts.push(text.slice(lastIndex, index))
    const tag = match[1]
    const content = match[2]
    const element = components?.[tag]
    parts.push(
      element
        ? cloneElement(element, { key: parts.length, children: content })
        : createElement(tag, { key: parts.length }, content),
    )
    lastIndex = index + match[0].length
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  return <>{parts}</>
}
