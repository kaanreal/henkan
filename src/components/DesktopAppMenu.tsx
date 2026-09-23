import { useEffect, useState } from 'react'
import { openUrl } from '../services/platform'

const DOWNLOAD_URL = 'https://github.com/kaanreal/henkan/releases/latest'

type DesktopSlide = {
  image: string
  imageFit?: 'cover' | 'contain'
  eyebrow: string
  title: string
  description: string
}

const slides: DesktopSlide[] = [
  {
    image: '/desktop-gallery/library.png',
    eyebrow: 'Library',
    title: 'Your osu! setup, in one place',
    description: 'Scan installed maps and skins, search locally, and open anything without leaving Henkan.',
  },
  {
    image: '/desktop-gallery/live-map.png',
    eyebrow: 'Live tools',
    title: 'Follow what you are playing',
    description: 'Pick up the current map from osu! or the current song from Etterna and bring it straight into the converter.',
  },
  {
    image: '/desktop-gallery/folder-workflow.png',
    eyebrow: 'Native workflow',
    title: 'Work with real folders',
    description: 'Open map folders and save results directly where you want them.',
  },
  {
    image: '/desktop-gallery/game-folder-save.png',
    imageFit: 'contain',
    eyebrow: 'Direct saves',
    title: 'Save straight into your game',
    description: 'Enable a shortcut for a detected osu!stable or Etterna install, then send conversions straight to its Songs folder.',
  },
  {
    image: '/desktop-gallery/skin-tools.png',
    eyebrow: 'Skins',
    title: 'Preview and convert installed skins',
    description: 'Load skin folders and archives with the same four-lane preview used by the converter.',
  },
]

function GalleryImage({ src, alt, fit = 'cover' }: { src: string; alt: string; fit?: 'cover' | 'contain' }) {
  const [missing, setMissing] = useState(false)

  if (missing) {
    return (
      <div className="flex h-full items-center justify-center bg-surface-950/80 px-6 text-center">
        <div>
          <svg className="mx-auto h-7 w-7 text-surface-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 5.25A2.25 2.25 0 016 3h12a2.25 2.25 0 012.25 2.25v13.5A2.25 2.25 0 0118 21H6a2.25 2.25 0 01-2.25-2.25V5.25z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 15.75l4.72-4.72a2.25 2.25 0 013.18 0l1.1 1.1 1.22-1.22a2.25 2.25 0 013.18 0l3.1 3.1M15.75 7.5h.008v.008h-.008V7.5z" />
          </svg>
          <p className="mt-2 text-[11px] font-medium text-surface-500">Screenshot slot</p>
        </div>
      </div>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={`desktop-gallery-image h-full w-full ${fit === 'contain' ? 'object-contain p-5' : 'object-cover'}`}
      onError={() => setMissing(true)}
    />
  )
}

interface DesktopAppMenuProps {
  open: boolean
  onClose: () => void
}

export function DesktopAppMenu({ open, onClose }: DesktopAppMenuProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [direction, setDirection] = useState<'next' | 'previous'>('next')
  const [paused, setPaused] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!open || paused) return
    const timer = window.setInterval(() => {
      setDirection('next')
      setActiveIndex((current) => (current + 1) % slides.length)
    }, 6500)
    return () => window.clearInterval(timer)
  }, [open, paused, activeIndex])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (expanded) setExpanded(false)
        else onClose()
      }
      if (event.key === 'ArrowRight') {
        setDirection('next')
        setActiveIndex((current) => (current + 1) % slides.length)
      }
      if (event.key === 'ArrowLeft') {
        setDirection('previous')
        setActiveIndex((current) => (current - 1 + slides.length) % slides.length)
      }
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [expanded, onClose, open])

  if (!open) return null

  const slide = slides[activeIndex]

  const move = (step: number) => {
    setDirection(step > 0 ? 'next' : 'previous')
    setActiveIndex((current) => (current + step + slides.length) % slides.length)
  }

  return (
    <div
      className="desktop-app-backdrop fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="desktop-app-title"
        className="desktop-app-panel flex max-h-[min(860px,calc(100vh-24px))] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface-950 shadow-2xl shadow-black/60"
        onMouseDown={(event) => event.stopPropagation()}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div className="flex items-start justify-between gap-5 border-b border-white/[0.07] px-5 py-5 sm:px-7 sm:py-6">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Henkan desktop
            </div>
            <h2 id="desktop-app-title" className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
              Built for your actual game library
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-surface-400">
              Native folders, installed maps and skins, live game detection, and direct exports around the converter you already know.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-surface-500 transition-all duration-200 hover:rotate-90 hover:bg-white/[0.06] hover:text-white"
            aria-label="Close desktop app details"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="desktop-app-scroll overflow-y-auto px-5 py-5 sm:px-7 sm:py-6">
          <div className="desktop-carousel-window" aria-live="polite">
            <div key={`${activeIndex}-${direction}`} className={`desktop-carousel-slide desktop-carousel-slide--${direction}`}>
              <div className="desktop-carousel-media">
                <button
                  type="button"
                  className="desktop-carousel-image-button absolute inset-0"
                  onClick={() => setExpanded(true)}
                  aria-label={`Expand ${slide.title} screenshot`}
                >
                  <GalleryImage src={slide.image} alt={`${slide.title} in Henkan desktop`} fit={slide.imageFit} />
                </button>
                <div className="desktop-carousel-media-shade" />
                <span className="pointer-events-none absolute bottom-3 left-3 rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-[10px] font-medium text-surface-300 backdrop-blur-sm">
                  {String(activeIndex + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
                </span>
              </div>
              <div className="flex flex-col justify-center px-1 py-5 sm:px-7 sm:py-8">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-muted">{slide.eyebrow}</p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-surface-100 sm:text-3xl">{slide.title}</h3>
                <p className="mt-3 max-w-md text-sm leading-6 text-surface-400">{slide.description}</p>
                <div className="mt-6 flex items-center gap-2 text-[11px] text-surface-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  Desktop feature
                </div>
              </div>
            </div>

            <button type="button" onClick={() => move(-1)} className="desktop-carousel-control desktop-carousel-control--left" aria-label="Previous desktop feature">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button type="button" onClick={() => move(1)} className="desktop-carousel-control desktop-carousel-control--right" aria-label="Next desktop feature">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>

          <div className="mt-5 flex items-center justify-between gap-4">
            <p className="text-[11px] text-surface-600">{paused ? 'Paused' : 'Cycles automatically'} · Use ← → to browse</p>
            <div className="flex items-center gap-1.5" aria-label="Desktop feature slides">
              {slides.map((item, index) => (
                <button
                  key={item.image}
                  type="button"
                  data-henkan-control
                  onClick={() => {
                    setDirection(index >= activeIndex ? 'next' : 'previous')
                    setActiveIndex(index)
                  }}
                  className={`h-1.5 rounded-full transition-all duration-300 ${index === activeIndex ? 'w-6 bg-accent' : 'w-1.5 bg-surface-700 hover:bg-surface-500'}`}
                  aria-label={`Show ${item.eyebrow} feature`}
                  aria-current={index === activeIndex ? 'true' : undefined}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-white/[0.07] bg-black/20 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
          <p className="text-[11px] text-surface-500">Windows, macOS, and Linux</p>
          <button
            type="button"
            onClick={() => openUrl(DOWNLOAD_URL)}
            className="group inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-lg hover:shadow-accent/20"
          >
            Download the desktop app
            <svg className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l4-4m-4 4l-4-4M5 21h14" />
            </svg>
          </button>
        </div>
      </section>
      {expanded && (
        <div
          className="desktop-image-lightbox fixed inset-0 z-[120] flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-8"
          onMouseDown={(event) => { event.stopPropagation(); setExpanded(false) }}
        >
          <div
            className="desktop-image-lightbox__panel relative flex max-h-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface-950 shadow-2xl shadow-black/70"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-white/[0.07] px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent-muted">{slide.eyebrow}</p>
                <p className="mt-1 truncate text-sm font-medium text-surface-200">{slide.title}</p>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] text-surface-500 transition-all duration-200 hover:rotate-90 hover:bg-white/[0.06] hover:text-white"
                aria-label="Close expanded screenshot"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="desktop-image-lightbox__image-wrap">
              <img src={slide.image} alt={`${slide.title} enlarged`} className="desktop-image-lightbox__image" />
            </div>
            <p className="border-t border-white/[0.07] px-4 py-3 text-xs text-surface-500 sm:px-5">Click outside or press Escape to close.</p>
          </div>
        </div>
      )}
    </div>
  )
}
