import { en } from './locales/en'

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'ru', label: 'Русский' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'es', label: 'Español' },
] as const

export type Locale = (typeof LANGUAGES)[number]['code']

export type PluralSuffix = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other'

type CatalogKey = keyof typeof en

type StripPlural<K extends string> = K extends `${infer Base}.${PluralSuffix}`
  ? Base
  : K

export type MessageKey = StripPlural<CatalogKey>

export type Catalog = Record<CatalogKey, string>

export type PartialCatalog = Partial<Record<CatalogKey, string>> &
  Partial<Record<`${MessageKey}.${PluralSuffix}`, string>>

export const DEFAULT_LOCALE: Locale = 'en'

const CATALOGS: Partial<Record<Locale, PartialCatalog>> = { en }

const LOADERS: Record<string, () => Promise<PartialCatalog>> = {
  de: () => import('./locales/de').then((m) => m.de),
  tr: () => import('./locales/tr').then((m) => m.tr),
  ru: () => import('./locales/ru').then((m) => m.ru),
  zh: () => import('./locales/zh').then((m) => m.zh),
  ja: () => import('./locales/ja').then((m) => m.ja),
  ko: () => import('./locales/ko').then((m) => m.ko),
  es: () => import('./locales/es').then((m) => m.es),
}

const pending = new Map<Locale, Promise<void>>()

export function registerCatalog(locale: Locale, catalog: PartialCatalog): void {
  CATALOGS[locale] = catalog
}

export function isCatalogLoaded(locale: Locale): boolean {
  return CATALOGS[locale] !== undefined
}

export function loadCatalog(locale: Locale): Promise<void> {
  const loaded = pending.get(locale)
  if (loaded) return loaded
  if (isCatalogLoaded(locale)) return Promise.resolve()
  const loader = LOADERS[locale]
  if (!loader) return Promise.resolve()
  const task = loader()
    .then((catalog) => registerCatalog(locale, catalog))
    // Drop the failed attempt so a later locale switch can retry the load
    .catch(() => { pending.delete(locale) })
  pending.set(locale, task)
  return task
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && LANGUAGES.some((l) => l.code === value)
}

export function resolveLocale(tag: string | null | undefined): Locale | null {
  if (!tag) return null
  if (isLocale(tag)) return tag
  const base = tag.toLowerCase().split('-')[0]
  return isLocale(base) ? base : null
}

export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE
  const tags = navigator.languages?.length
    ? navigator.languages
    : [navigator.language]
  for (const tag of tags) {
    const match = resolveLocale(tag)
    if (match) return match
  }
  return DEFAULT_LOCALE
}

export type TranslateParams = Record<string, string | number>

const pluralRules = new Map<Locale, Intl.PluralRules>()

function pluralCategory(locale: Locale, count: number): string {
  let rules = pluralRules.get(locale)
  if (!rules) {
    try {
      rules = new Intl.PluralRules(locale)
    } catch {
      rules = new Intl.PluralRules(DEFAULT_LOCALE)
    }
    pluralRules.set(locale, rules)
  }
  return rules.select(count)
}

function lookup(locale: Locale, key: string): string | undefined {
  const catalog = CATALOGS[locale] as Record<string, string | undefined>
  const hit = catalog?.[key]
  if (hit !== undefined) return hit
  if (locale !== DEFAULT_LOCALE) {
    const fallback = CATALOGS[DEFAULT_LOCALE] as Record<string, string | undefined>
    return fallback?.[key]
  }
  return undefined
}

function resolveKey(
  locale: Locale,
  key: MessageKey,
  params?: TranslateParams,
): string {
  const count = params?.count
  if (typeof count === 'number') {
    const category = pluralCategory(locale, count)
    return (
      lookup(locale, `${key}.${category}`) ??
      lookup(locale, `${key}.other`) ??
      lookup(locale, key) ??
      key
    )
  }
  return lookup(locale, key) ?? key
}

function interpolate(
  template: string,
  locale: Locale,
  params?: TranslateParams,
): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name]
    if (value === undefined) return whole
    if (typeof value === 'number') return formatNumber(value, locale)
    return value
  })
}

export function translate(
  locale: Locale,
  key: MessageKey,
  params?: TranslateParams,
): string {
  return interpolate(resolveKey(locale, key, params), locale, params)
}

const numberFormats = new Map<string, Intl.NumberFormat>()

export function formatNumber(value: number, locale: Locale): string {
  const cacheKey = `${locale}:${Number.isInteger(value)}`
  let formatter = numberFormats.get(cacheKey)
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat(locale, {
        maximumFractionDigits: Number.isInteger(value) ? 0 : 3,
      })
    } catch {
      formatter = new Intl.NumberFormat(DEFAULT_LOCALE)
    }
    numberFormats.set(cacheKey, formatter)
  }
  return formatter.format(value)
}

let activeLocale: Locale = DEFAULT_LOCALE

export function getActiveLocale(): Locale {
  return activeLocale
}

export function setActiveLocale(locale: Locale): void {
  activeLocale = locale
}

export function t(key: MessageKey, params?: TranslateParams): string {
  return translate(activeLocale, key, params)
}
