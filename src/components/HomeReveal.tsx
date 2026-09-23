import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import { useT } from '../i18n'
import type { MessageKey } from '../i18n/core'
import { SiteFooter } from './SiteLayout'

const DO_ITEMS: MessageKey[] = [
  'home.doConvert',
  'home.doPacks',
  'home.doTiming',
  'home.doMetadata',
  'home.doSkins',
  'home.doViewer',
]

export function HomeReveal() {
  const t = useT()
  const rootRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
    if (!targets.length) return
    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('reveal-visible'))
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('reveal-visible')
          observer.unobserve(entry.target)
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
    // Only reveal after the user actually scrolls. On tall windows part of the
    // section already sits inside the viewport, and revealing it on load looks
    // like content appearing out of nowhere.
    const scroller = (document.getElementById('root') ?? document.scrollingElement) as HTMLElement
    const startAfterFirstScroll = () => {
      if (scroller.scrollTop <= 0) return
      targets.forEach((el) => observer.observe(el))
      scroller.removeEventListener('scroll', startAfterFirstScroll)
    }
    scroller.addEventListener('scroll', startAfterFirstScroll, { passive: true })
    return () => {
      observer.disconnect()
      scroller.removeEventListener('scroll', startAfterFirstScroll)
    }
  }, [])

  const scrollToTop = () => {
    const scroller = document.getElementById('root') ?? document.scrollingElement ?? window
    if ('scrollTo' in scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <section ref={rootRef} className="home-reveal select-text bg-surface-950">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-12">
        <div data-reveal className="reveal">
          <p className="text-xs font-medium text-accent tracking-widest uppercase mb-3">{t('home.badge')}</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-surface-100 leading-tight mb-4">{t('home.title')}</h2>
          <p className="text-lg text-surface-400 leading-relaxed max-w-2xl">{t('home.intro')}</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-12 space-y-14">
        <div data-reveal className="reveal">
          <h3 className="text-xl font-semibold text-surface-100 mb-4">{t('home.whatToDo')}</h3>
          <ul className="space-y-2.5 text-sm text-surface-400">
            {DO_ITEMS.map((key) => (
              <li key={key} className="flex items-start gap-2">
                <span className="text-accent mt-0.5">&#10003;</span>
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div data-reveal className="reveal">
          <h3 className="text-xl font-semibold text-surface-100 mb-4">Documentation</h3>
          <Link
            to="/docs"
            className="group flex items-center justify-between gap-6 rounded-xl border border-surface-800/50 bg-surface-900/50 p-5 transition-all hover:border-surface-700 hover:bg-surface-900/70"
          >
            <div>
              <h4 className="text-sm font-medium text-surface-200 transition-colors group-hover:text-surface-100">
                Henkan documentation
              </h4>
              <p className="mt-1 text-xs leading-relaxed text-surface-500">Formats, conversion settings, pack tools, previews, skins, and troubleshooting in one place.</p>
            </div>
            <span className="shrink-0 text-lg text-accent" aria-hidden="true">&#8594;</span>
          </Link>

          <button
            onClick={scrollToTop}
            className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-surface-800 border border-surface-700/40
                       text-surface-300 font-medium text-sm hover:bg-surface-700 hover:text-surface-100 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
            {t('home.backToTop')}
          </button>
        </div>
      </div>

      <SiteFooter />
    </section>
  )
}
