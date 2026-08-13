import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { en } from './locales/en'
import { de } from './locales/de'
import { tr } from './locales/tr'
import { ru } from './locales/ru'
import { zh } from './locales/zh'
import { ja } from './locales/ja'
import { ko } from './locales/ko'
import { es } from './locales/es'
import {
  LANGUAGES,
  detectLocale,
  registerCatalog,
  resolveLocale,
  translate,
  type Locale,
  type MessageKey,
  type PartialCatalog,
} from './core'

const TRANSLATIONS: [Locale, PartialCatalog][] = [
  ['de', de],
  ['tr', tr],
  ['ru', ru],
  ['zh', zh],
  ['ja', ja],
  ['ko', ko],
  ['es', es],
]

const realDe = de

beforeAll(() => {
  for (const [locale, catalog] of TRANSLATIONS) registerCatalog(locale, catalog)
})

afterEach(() => {
  registerCatalog('de', realDe)
})

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
}

function baseKey(key: string): string {
  return key.replace(/\.(zero|one|two|few|many|other)$/, '')
}

describe('resolveLocale', () => {
  it('maps regional tags to supported locales', () => {
    expect(resolveLocale('de-AT')).toBe('de')
    expect(resolveLocale('tr-TR')).toBe('tr')
    expect(resolveLocale('ru-RU')).toBe('ru')
    expect(resolveLocale('zh')).toBe('zh')
    expect(resolveLocale('zh-CN')).toBe('zh')
    expect(resolveLocale('zh-TW')).toBe('zh')
    expect(resolveLocale('ja-JP')).toBe('ja')
    expect(resolveLocale('ko-KR')).toBe('ko')
    expect(resolveLocale('es-MX')).toBe('es')
    expect(resolveLocale('en-US')).toBe('en')
  })

  it('returns null for unsupported languages', () => {
    expect(resolveLocale('fr')).toBeNull()
    expect(resolveLocale('')).toBeNull()
    expect(resolveLocale(null)).toBeNull()
    expect(resolveLocale(undefined)).toBeNull()
  })
})

describe('detectLocale', () => {
  function withLanguages(languages: string[], language = languages[0]) {
    vi.stubGlobal('navigator', { languages, language })
  }

  it('picks the browser preferred language', () => {
    withLanguages(['de-DE', 'en-US'])
    expect(detectLocale()).toBe('de')
  })

  it('skips unsupported languages and takes the first supported one', () => {
    withLanguages(['fr-FR', 'it-IT', 'ru-RU', 'en-US'])
    expect(detectLocale()).toBe('ru')
  })

  it('maps regional variants onto the shipped locale', () => {
    withLanguages(['zh-TW'])
    expect(detectLocale()).toBe('zh')
    vi.unstubAllGlobals()
    withLanguages(['pt-PT'])
    expect(detectLocale()).toBe('en')
  })

  it('falls back to navigator.language when languages is empty', () => {
    vi.stubGlobal('navigator', { languages: [], language: 'tr-TR' })
    expect(detectLocale()).toBe('tr')
  })

  it('falls back to English when nothing is supported', () => {
    withLanguages(['fr-FR', 'it-IT'])
    expect(detectLocale()).toBe('en')
  })

  it('falls back to English when navigator is unavailable', () => {
    vi.stubGlobal('navigator', undefined)
    expect(detectLocale()).toBe('en')
  })
})

describe('translate', () => {
  it('interpolates named params', () => {
    expect(
      translate('en', 'services.skin.requires4kManiaFound', { modes: '7K, 8K' }),
    ).toBe('This converter currently produces Etterna dance noteskins, which require a 4K [Mania] section. Found: 7K, 8K.')
  })

  it('formats numeric params', () => {
    expect(translate('en', 'converter.volume', { value: 57 })).toBe('Volume 57%')
    expect(translate('en', 'converter.volume', { value: 1000 })).toBe('Volume 1,000%')
  })

  it('leaves unknown placeholders untouched', () => {
    expect(
      translate('en', 'services.skin.archiveTooManyFiles', { count: '5' }),
    ).toBe('The archive contains 5 files; the safe limit is {limit}.')
  })

  it('selects English plural forms by count', () => {
    expect(translate('en', 'convertDialog.difficultyCount', { count: 1 })).toBe(
      '1 difficulty · select which to convert',
    )
    expect(translate('en', 'convertDialog.difficultyCount', { count: 3 })).toBe(
      '3 difficulties · select which to convert',
    )
  })

  it('selects Russian one/few/many forms', () => {
    expect(translate('ru', 'convertDialog.notes', { count: 1, keys: 4 })).toBe(
      '4K · 1 нота',
    )
    expect(translate('ru', 'convertDialog.notes', { count: 2, keys: 4 })).toBe(
      '4K · 2 ноты',
    )
    expect(translate('ru', 'convertDialog.notes', { count: 5, keys: 4 })).toBe(
      '4K · 5 нот',
    )
  })

  it('uses the single Chinese plural form for any count', () => {
    expect(translate('zh', 'convertDialog.notes', { count: 1, keys: 4 })).toBe(
      '4K · 1 个音符',
    )
    expect(translate('zh', 'convertDialog.notes', { count: 9, keys: 4 })).toBe(
      '4K · 9 个音符',
    )
  })

  it('falls back to English for untranslated keys', () => {
    registerCatalog('de', { 'common.cancel': 'Abbrechen' })
    expect(translate('de', 'common.cancel')).toBe('Abbrechen')
    expect(translate('de', 'common.save')).toBe('Save')
  })

  it('returns the key itself when nothing is found', () => {
    expect(translate('en', 'does.not.exist' as MessageKey)).toBe('does.not.exist')
  })
})

describe('lazy catalogs', () => {
  it('ships English up front and loads the rest on demand', async () => {
    vi.resetModules()
    const core = await import('./core')
    expect(core.isCatalogLoaded('en')).toBe(true)
    expect(core.isCatalogLoaded('tr')).toBe(false)
    expect(core.translate('tr', 'common.cancel')).toBe('Cancel')

    await core.loadCatalog('tr')
    expect(core.isCatalogLoaded('tr')).toBe(true)
    expect(core.translate('tr', 'common.cancel')).toBe('İptal')
  })
})

describe('catalogs', () => {
  it('declares every locale in LANGUAGES', () => {
    expect(LANGUAGES.map((l) => l.code).sort()).toEqual(
      ['de', 'en', 'es', 'ja', 'ko', 'ru', 'tr', 'zh'].sort(),
    )
  })

  it.each(TRANSLATIONS)('%s has no keys missing from English', (_, catalog) => {
    const englishBases = new Set(Object.keys(en).map(baseKey))
    const keys = Object.keys(catalog).map(baseKey)
    const orphans = Object.keys(catalog).filter(
      (key) => !englishBases.has(baseKey(key)),
    )
    const missing = [...englishBases].filter((base) => !keys.includes(base))
    expect(orphans).toEqual([])
    expect(missing).toEqual([])
  })

  it.each(TRANSLATIONS)('%s keeps the same placeholders', (_, catalog) => {
    const mismatches: string[] = []
    for (const [key, value] of Object.entries(catalog)) {
      const source =
        (en as Record<string, string | undefined>)[key] ??
        (en as Record<string, string | undefined>)[`${baseKey(key)}.other`]
      if (!source || !value) continue
      const expected = placeholders(source)
      const actual = placeholders(value)
      if (expected.join(',') !== actual.join(',')) {
        mismatches.push(`${key}: expected ${expected} got ${actual}`)
      }
    }
    expect(mismatches).toEqual([])
  })

  it.each(TRANSLATIONS)('%s has no empty strings', (_, catalog) => {
    const empties = Object.entries(catalog)
      .filter(([, value]) => typeof value === 'string' && value.trim() === '')
      .map(([key]) => key)
    expect(empties).toEqual([])
  })
})
