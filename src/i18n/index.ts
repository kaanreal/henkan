import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en'
import de from './locales/de'
import tr from './locales/tr'
import ru from './locales/ru'
import zh from './locales/zh'
import ja from './locales/ja'
import ko from './locales/ko'
import es from './locales/es'

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

export const LANGUAGE_STORAGE_KEY = 'henkan_language'

function loadSavedLanguage(): string {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    if (saved && LANGUAGES.some(l => l.code === saved)) return saved
  } catch { /* ignore */ }
  return 'en'
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    de: { translation: de },
    tr: { translation: tr },
    ru: { translation: ru },
    zh: { translation: zh },
    ja: { translation: ja },
    ko: { translation: ko },
    es: { translation: es },
  },
  lng: loadSavedLanguage(),
  fallbackLng: 'en',
  supportedLngs: LANGUAGES.map(l => l.code),
  nonExplicitSupportedLngs: true,
  load: 'languageOnly',
  interpolation: { escapeValue: false },
  returnNull: false,
  react: { useSuspense: false },
})

export function setLanguage(code: string) {
  void i18n.changeLanguage(code)
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, code)
  } catch { /* ignore */ }
}

export default i18n
