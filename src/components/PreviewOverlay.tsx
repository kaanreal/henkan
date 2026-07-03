import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import type { Note, SourceFormat } from '../types/beatmap'
import type { WebAudioPlayer } from '../lib/WebAudioPlayer'
import { useConverterStore } from '../stores/useConverterStore'

interface Props {
  audioPlayerRef: { current: WebAudioPlayer | null }
  playing: boolean
  duration: number
  notes: Note[]
  keys: number
  bpm: number
  backgroundUrl: string | null
  previewTime: number
  sourceFormat: SourceFormat
  onSetPreviewTime: (ms: number) => void
  onClose: () => void
}

const KEYBINDS = [
  ['Space / Esc', 'Close preview'],
  ['Right-click', 'Pause / Play'],
  ['Scroll wheel', 'Scroll speed'],
  ['Ctrl+Scroll', 'Playback rate'],
  ['Alt+Scroll', 'Volume'],
  ['Tab', 'Set preview point'],
  ['H', 'Toggle hitsounds'],
]

const BAR_W = 0.85
const BAR_H_RATIO = 0.3
const BODY_W = 0.84
const HIT_Y_RATIO = 0.88
const SCROLL_H_RATIO = 1.25
const FLASH_DURATION = 120
const LOOK_AHEAD_MIN = 150
const LOOK_AHEAD_MAX = 600
const LOOK_AHEAD_DEFAULT = 380
const TIMING_OFFSET = 0 // Web Audio API's decodeAudioData handles LAME padding natively; no manual shift needed

// Persist settings across preview open/close
let _scrollSpeed = LOOK_AHEAD_DEFAULT
let _rate = useConverterStore.getState().config.conversion_rate
let _hitsound = true

export function PreviewOverlay({
  audioPlayerRef, playing, duration,
  notes, keys, bpm, backgroundUrl, previewTime, sourceFormat, onSetPreviewTime, onClose,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafId = useRef(0)
  const [closing, setClosing] = useState(false)
  const scrollRef = useRef(_scrollSpeed)
  const [rate, setRate] = useState(_rate)
  const rateRef = useRef(_rate)
  const hitsoundRef = useRef(_hitsound)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const compressorRef = useRef<DynamicsCompressorNode | null>(null)
  const firedKeys = useRef(new Set<string>())
  const groups = useRef(new Map<number, number>())
  const prevNowMs = useRef(0)
  const useOffsetRef = useRef(sourceFormat === 'Etterna')
  const [toast, setToast] = useState<{ msg: string; leaving?: boolean } | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  const smoothTimeRef = useRef(0)
  const warmupFrames = useRef(2)

  // Sync rate + preservePitch from store on mount (in case they changed since last preview session)
  useEffect(() => {
    const el = audioPlayerRefRef.current.current
    const storeRate = useConverterStore.getState().config.conversion_rate
    _rate = storeRate
    rateRef.current = storeRate
    setRate(storeRate)
    if (el) {
      el.playbackRate = storeRate
      el.preservesPitch = useConverterStore.getState().config.preserve_pitch
    }
  }, [])

  const timelineGlowRef = useRef<HTMLDivElement>(null)
  const timelineFillRef = useRef<HTMLDivElement>(null)
  const timelineThumbRef = useRef<HTMLDivElement>(null)
  const timeLabelRef = useRef<HTMLSpanElement>(null)
  
  const [currentBucket, setCurrentBucket] = useState(-1)
  const currentBucketRef = useRef(-1)

  const notesRef = useRef(notes)
  const keysRef = useRef(keys)
  const audioPlayerRefRef = useRef(audioPlayerRef)
  const onCloseRef = useRef(onClose)
  const onSetRef = useRef(onSetPreviewTime)

  useEffect(() => {
    notesRef.current = notes
    keysRef.current = keys
    audioPlayerRefRef.current = audioPlayerRef
    onCloseRef.current = onClose
    onSetRef.current = onSetPreviewTime
  })

  const close = useCallback(() => {
    if (closing) return
    setClosing(true)
    setTimeout(() => onCloseRef.current(), 200)
  }, [closing])

  const showToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ msg, leaving: false })
    toastTimer.current = window.setTimeout(() => {
      setToast(prev => prev ? { ...prev, leaving: true } : null)
      toastTimer.current = window.setTimeout(() => setToast(null), 220)
    }, 1400)
  }, [])

  // ── Hitsound buffer (osu skin) ──
  const clapBufRef = useRef<AudioBuffer | null>(null)

  const ensureClap = useCallback(async () => {
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContext()
      const ctx = audioCtxRef.current
      if (clapBufRef.current) return
      const res = await fetch('/soft-hitnormal.wav')
      const arr = await res.arrayBuffer()
      const buf = await ctx.decodeAudioData(arr)
      clapBufRef.current = buf
    } catch { /* ignore */ }
  }, [])

  const gainForCount = (n: number) => {
    if (n >= 4) return 0.25
    if (n === 3) return 0.20
    if (n === 2) return 0.14
    return 0.08
  }

  const playHit = useCallback((gain: number = 0.08) => {
    try {
      const ctx = audioCtxRef.current
      if (!ctx || !clapBufRef.current) return
      if (ctx.state === 'suspended') ctx.resume()
      const src = ctx.createBufferSource()
      src.buffer = clapBufRef.current
      const g = ctx.createGain()
      g.gain.setValueAtTime(gain, ctx.currentTime)
      src.connect(g)
      g.connect(compressorRef.current ?? ctx.destination)
      src.start()
    } catch { /* ignore */ }
  }, [])

  // ── Init hitsound AudioContext ──
  useEffect(() => {
    const ctx = new AudioContext()
    audioCtxRef.current = ctx
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.setValueAtTime(-18, ctx.currentTime)
    comp.knee.setValueAtTime(3, ctx.currentTime)
    comp.ratio.setValueAtTime(20, ctx.currentTime)
    comp.attack.setValueAtTime(0.002, ctx.currentTime)
    comp.release.setValueAtTime(0.05, ctx.currentTime)
    comp.connect(ctx.destination)
    compressorRef.current = comp
    ensureClap()

    const mainEl = audioPlayerRef.current
    if (!mainEl?.src) {
      return () => { ctx.close(); audioCtxRef.current = null }
    }

    return () => {
      ctx.close()
      audioCtxRef.current = null
    }
  }, [audioPlayerRef, ensureClap])



  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F12') { e.preventDefault(); return }
      if (e.key === 'Escape' || e.code === 'Space') {
        e.preventDefault()
        close()
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const el = audioPlayerRefRef.current.current
        if (el) {
          onSetRef.current(el.currentTime * 1000)
          showToast('Preview point set')
        }
        return
      }
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault()
        hitsoundRef.current = !hitsoundRef.current
        _hitsound = hitsoundRef.current
        showToast(hitsoundRef.current ? 'Hitsounds on' : 'Hitsounds off')
        if (hitsoundRef.current) ensureClap()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [close, ensureClap, showToast])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.altKey) return
    if (e.ctrlKey) {
      const delta = e.deltaY > 0 ? -0.05 : 0.05
      const newRate = Math.max(0.5, Math.min(3, +(rateRef.current + delta).toFixed(2)))
      rateRef.current = newRate
      _rate = newRate
      setRate(newRate)
      const el = audioPlayerRefRef.current.current
      if (el) el.playbackRate = newRate
      useConverterStore.getState().updateConfig({ conversion_rate: newRate })
      showToast(`${newRate.toFixed(2)}x`)
    } else {
      const delta = e.deltaY > 0 ? 25 : -25
      const prev = scrollRef.current
      scrollRef.current = Math.max(LOOK_AHEAD_MIN, Math.min(LOOK_AHEAD_MAX, scrollRef.current + delta))
      _scrollSpeed = scrollRef.current
      if (scrollRef.current !== prev) showToast(`${scrollRef.current}ms`)
    }
  }, [showToast])

  const [hoverPct, setHoverPct] = useState<number | null>(null)
  const [graphHover, setGraphHover] = useState<{ pct: number; x: number } | null>(null)

  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  // ── Single rAF loop ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      const p = canvas.parentElement
      if (!p) return
      const w = p.clientWidth
      const h = p.clientHeight
      canvas.width = w * devicePixelRatio
      canvas.height = h * devicePixelRatio
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
    }
    resize()
    window.addEventListener('resize', resize)

    const loop = () => {
      const w = canvas.width
      const h = canvas.height
      const dpr = devicePixelRatio
      ctx.clearRect(0, 0, w, h)

      const el = audioPlayerRefRef.current.current
      const audioTimeMs = (el ? el.currentTime * 1000 : 0) + (useOffsetRef.current ? TIMING_OFFSET : 0)

      // EMA smoothing to prevent sub-frame jitter from affecting note positions
      smoothTimeRef.current += (audioTimeMs - smoothTimeRef.current) * 0.3
      const nowMs = smoothTimeRef.current

      if (nowMs < prevNowMs.current - 200) firedKeys.current.clear()
      prevNowMs.current = nowMs
      const cols = keysRef.current
      const lookAhead = scrollRef.current * (rateRef.current || 1)
      const colW = w / cols
      const hitY = h * HIT_Y_RATIO
      const allNotes = notesRef.current
      const barW = colW * BAR_W
      const barH = colW * BAR_H_RATIO
      const scrollH = Math.max(Math.min(h * SCROLL_H_RATIO, w * 1.8), hitY + barH)
      const cornerR = barH * 0.25
      const bodyW = barW * BODY_W
      const halfBodyW = bodyW / 2
      const halfBarW = barW / 2
      const halfBarH = barH / 2

      // Update timeline DOM directly
      const pct = duration > 0 ? Math.min(100, ((nowMs / 1000) / duration) * 100) : 0
      if (timelineGlowRef.current) timelineGlowRef.current.style.width = `${pct}%`
      if (timelineFillRef.current) timelineFillRef.current.style.width = `${pct}%`
      if (timelineThumbRef.current) timelineThumbRef.current.style.left = `${pct}%`
      if (timeLabelRef.current) timeLabelRef.current.innerText = fmt(nowMs / 1000)

      const bucket = duration > 0 ? Math.floor(((nowMs / 1000) / duration) * 80) : -1
      if (bucket !== currentBucketRef.current) {
        currentBucketRef.current = bucket
        setCurrentBucket(bucket)
      }

      // Column dividers
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'
      ctx.lineWidth = 1 * dpr
      for (let i = 1; i < cols; i++) {
        ctx.beginPath()
        ctx.moveTo(i * colW, 0)
        ctx.lineTo(i * colW, h)
        ctx.stroke()
      }

      const drawNotes = warmupFrames.current <= 0
      if (drawNotes) {
        // Hit flashes + hitsounds
        const flashes = new Array(cols).fill(0)
        const hsOn = hitsoundRef.current
        for (let i = 0; i < allNotes.length; i++) {
          const nt = allNotes[i]
          const t = nt.time_ms
          if (t > nowMs + FLASH_DURATION) continue
          if (t + 200 < nowMs) continue

          if (t >= nowMs - FLASH_DURATION && t <= nowMs) {
            const age = (nowMs - t) / FLASH_DURATION
            flashes[nt.column] = Math.max(flashes[nt.column], 1 - age)
          }

          if (hsOn && el && !el.paused) {
            const diff = Math.abs(t - nowMs)
            if (diff < 30) {
              const bucket = Math.round(t / 10) * 10
              const key = `b:${bucket}`
              if (!firedKeys.current.has(key)) {
                firedKeys.current.add(key)
                const bucketCount = (groups.current.get(bucket) ?? 0) + 1
                groups.current.set(bucket, bucketCount)
              }
            }
          }
        }

        // Fire batched hitsounds
        if (groups.current.size > 0) {
          for (const count of groups.current.values()) {
            playHit(gainForCount(count))
          }
          groups.current.clear()
        }

        // Receptor — dark by default, bright flash on hit
        const glowH = colW * 0.5
        const linePad = 4 * dpr
        for (let i = 0; i < cols; i++) {
          const f = flashes[i]
          const isHit = f > 0

          // Fade below the line
          const glowAlpha = isHit ? 0.1 + f * 0.5 : 0.03
          const grad = ctx.createLinearGradient(0, hitY, 0, hitY + glowH)
          grad.addColorStop(0, `rgba(255,255,255,${glowAlpha})`)
          grad.addColorStop(1, 'transparent')
          ctx.fillStyle = grad
          ctx.fillRect(i * colW + 2, hitY, colW - 4, glowH)

          // Hit line
          const lineAlpha = isHit ? f : 0.15
          ctx.strokeStyle = `rgba(255,255,255,${lineAlpha})`
          ctx.lineWidth = 1.5 * dpr
          ctx.strokeRect(i * colW + linePad, hitY - 0.5 * dpr, colW - linePad * 2, 1 * dpr)
        }
      }
      if (warmupFrames.current > 0) warmupFrames.current--

      // Notes
      if (drawNotes) for (let i = 0; i < allNotes.length; i++) {
        const note = allNotes[i]
        const t = note.time_ms
        if (t > nowMs + lookAhead) continue
        const cx = note.column * colW + colW / 2

        if (note.hold && note.hold_end_ms) {
          if (note.hold_end_ms < nowMs) continue

          const y = hitY - ((t - nowMs) / lookAhead) * scrollH
          const endY = hitY - ((note.hold_end_ms - nowMs) / lookAhead) * scrollH
          const top = Math.min(y, endY)
          const bot = Math.max(y, endY)
          const drawTop = Math.max(top, 0)
          const drawBot = Math.min(bot, hitY)

          if (drawBot - drawTop > 3) {
            const grad = ctx.createLinearGradient(0, drawTop, 0, drawBot)
            grad.addColorStop(0, 'rgba(255,255,255,0)')
            grad.addColorStop(0.35, 'rgba(255,255,255,0.25)')
            grad.addColorStop(1, 'rgba(255,255,255,0.25)')
            ctx.fillStyle = grad
            ctx.fillRect(cx - halfBodyW, drawTop, bodyW, drawBot - drawTop)
          }

          if (t >= nowMs) {
            ctx.fillStyle = '#ffffff'
            roundRect(ctx, cx - halfBarW, y - halfBarH, barW, barH, cornerR)
          }
        } else {
          if (t < nowMs) continue

          const y = hitY - ((t - nowMs) / lookAhead) * scrollH
          ctx.fillStyle = '#ffffff'
          roundRect(ctx, cx - halfBarW, y - halfBarH, barW, barH, cornerR)
        }
      }

      rafId.current = requestAnimationFrame(loop)
    }

    rafId.current = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(rafId.current)
      window.removeEventListener('resize', resize)
    }
  }, [playHit, duration])

  const prvPct = duration > 0 ? (previewTime / 1000 / duration) * 100 : 0

  const NUM_BUCKETS = 80
  const MAX_DOTS = 4
  const buckets = useMemo(() => {
    const b = new Array(NUM_BUCKETS).fill(0)
    if (duration <= 0) return b
    for (const n of notes) {
      const pct = n.time_ms / 1000 / duration
      const idx = Math.min(NUM_BUCKETS - 1, Math.floor(pct * NUM_BUCKETS))
      b[idx]++
    }
    return b
  }, [notes, duration])
  const maxCount = Math.max(...buckets, 1)

  return (
    <div className={`fixed inset-0 z-50 flex flex-col select-none bg-[#080c18] ${closing ? 'animate-fade-out' : 'animate-fade-in'}`}
      onContextMenu={(e) => {
        e.preventDefault()
        const el = audioPlayerRef.current
        if (!el) return
        if (el.paused) { el.play().catch(() => {}); showToast('Playing') }
        else { el.pause(); showToast('Paused') }
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-[11px] shrink-0 bg-black/40">
        <div className="flex items-center gap-4">
          <span className="text-white/80 font-semibold text-sm tracking-widest">PREVIEW</span>
          <span className="h-3 w-px bg-white/8" />
          <div className="flex items-center gap-2.5 text-[11px] text-white/35 tracking-wide">
            <span>{notes.length} notes</span>
            <span className="text-white/15">·</span>
            <span>{bpm} BPM</span>
            <span className="text-white/15">·</span>
            <span className="tabular-nums">{rate.toFixed(2)}x</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-white/50">{playing ? '▶' : '⏸'}</span>
          <span className="text-[10px] text-white/25">Esc / Space</span>
          <button onClick={close}
            className="w-7 h-7 rounded-full bg-white/8 hover:bg-white/20 flex items-center justify-center transition-all"
          >
            <svg className="w-3.5 h-3.5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Playfield */}
      <div className="flex-1 relative" onWheel={handleWheel}>
        {backgroundUrl && (
          <>
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${backgroundUrl})`, filter: 'blur(16px) saturate(0.4)' }} />
            <div className="absolute inset-0 bg-[#080c18]/70" />
          </>
        )}

        {/* Keybinds */}
        <div className="absolute left-4 top-4 z-10 flex flex-col gap-1.5 pointer-events-none">
          {KEYBINDS.map(([key, desc]) => (
            <div key={key} className="flex items-center gap-2 text-[11px]">
              <span className="text-white/50 font-mono tracking-wide bg-white/5 px-1.5 py-0.5 rounded leading-none">{key}</span>
              <span className="text-white/30">{desc}</span>
            </div>
          ))}
        </div>

        {/* Toast notification */}
        {toast && (
          <div className="absolute top-20 left-0 right-0 z-20 flex justify-center pointer-events-none">
            <div
              className={`${toast.leaving ? 'animate-[toastOut_0.2s_ease-in_forwards]' : 'animate-[toastIn_0.2s_ease-out]'} text-white/90 text-xs font-medium bg-white/12 px-5 py-2 rounded-full backdrop-blur-md border border-white/8 shadow-lg`}
            >
              {toast.msg}
            </div>
          </div>
        )}

        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-full max-w-sm lg:max-w-xl h-full relative">
            <canvas ref={canvasRef} className="w-full h-full" />
          </div>
        </div>

        {!playing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 cursor-pointer z-10"
            onClick={() => {
              const el = audioPlayerRef.current
              if (!el) return
              el.play().catch(() => {})
            }}
          >
            <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-sm">
              <svg className="w-7 h-7 text-white/70 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
            <span className="text-white/60 text-sm">Click to play</span>
          </div>
        )}
      </div>

      {/* Timeline */}
      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(-16px) scale(0.92); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes toastOut {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(-8px) scale(0.95); }
        }
      `}</style>
      <div className="shrink-0 bg-black/50">
        <div className="px-6 pb-[3px] pt-2">

          {/* Time labels */}
          <div className="flex justify-between text-[11px] mb-1.5">
            <span ref={timeLabelRef} className="font-mono text-white/35">0:00</span>
            {previewTime >= 0 && (
              <span className="text-emerald-400/50 text-[10px] tracking-wide font-mono">
                ◉ {fmt(previewTime / 1000)}
              </span>
            )}
            <span className="font-mono text-white/35">{fmt(duration)}</span>
          </div>

          {/* Note density graph (dotted bars) */}
          <div className="relative h-[36px] mb-[3px] cursor-pointer"
            onClick={(e) => {
              const el = audioPlayerRef.current
              if (!el) return
              const rect = e.currentTarget.getBoundingClientRect()
              el.currentTime = ((e.clientX - rect.left) / rect.width) * duration
            }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const pct = ((e.clientX - rect.left) / rect.width) * 100
              setGraphHover({ pct, x: e.clientX })
            }}
            onMouseLeave={() => setGraphHover(null)}
          >
            <div className="flex items-end h-full" style={{ gap: 0 }}>
              {buckets.map((count: number, i: number) => {
                const numDots = Math.max(0, Math.round((count / maxCount) * MAX_DOTS))
                const filled = i <= currentBucket
                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col-reverse items-center"
                    style={{ gap: '1px' }}
                  >
                    {Array.from({ length: MAX_DOTS }).map((_, j) => {
                      const isOn = j < numDots
                      const isActive = filled && isOn
                      return (
                        <div
                          key={j}
                          className="rounded-full"
                          style={{
                            width: '4px',
                            height: '4px',
                            backgroundColor: isActive
                              ? '#fff'
                              : isOn
                                ? 'rgba(255,255,255,0.12)'
                                : 'transparent',
                          }}
                        />
                      )
                    })}
                  </div>
                )
              })}
            </div>

            {/* Hover tooltip on graph */}
            {graphHover !== null && (
              <div
                className="absolute -top-7 -translate-x-1/2 pointer-events-none z-20 transition-opacity duration-100"
                style={{ left: `${graphHover.pct}%` }}
              >
                <div className="bg-black/80 backdrop-blur-sm text-white/80 text-[10px] px-2 py-1 rounded tracking-wide font-mono flex flex-col items-center gap-0.5 whitespace-nowrap">
                  <span className="text-white/90">{fmt((graphHover.pct / 100) * duration)}</span>
                  <span className="text-white/40 text-[9px]">
                    {buckets[Math.min(NUM_BUCKETS - 1, Math.floor((graphHover.pct / 100) * NUM_BUCKETS))] || 0} notes
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Progress bar */}
          <div className="relative h-9 flex items-center cursor-pointer group"
            onClick={(e) => {
              const el = audioPlayerRef.current
              if (!el) return
              const rect = e.currentTarget.getBoundingClientRect()
              const pct = (e.clientX - rect.left) / rect.width
              el.currentTime = pct * duration
            }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              setHoverPct(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)))
            }}
            onMouseLeave={() => setHoverPct(null)}
          >
            <div className="absolute inset-x-0 h-[3px] bg-white/8 rounded-full" />
            <div ref={timelineGlowRef} className="absolute left-0 h-[14px] -translate-y-1/2 top-1/2 rounded-full bg-white/8 blur-md pointer-events-none"
              style={{ width: '0%' }}
            />
            <div ref={timelineFillRef} className="absolute left-0 h-[3px] rounded-full bg-gradient-to-r from-white/30 via-white/70 to-white pointer-events-none"
              style={{ width: '0%' }}
            />
            <div ref={timelineThumbRef} className="absolute w-[11px] h-[11px] rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)] pointer-events-none transition-none"
              style={{ left: '0%', transform: 'translate(-50%, 0)' }}
            />
            {previewTime >= 0 && duration > 0 && (
              <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 group/preview"
                style={{ left: `${prvPct}%` }}
                onClick={(e) => {
                  e.stopPropagation()
                  const el = audioPlayerRef.current
                  if (el) el.currentTime = previewTime / 1000
                }}
              >
                <div className="w-[5px] h-[5px] rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 opacity-0 group-hover/preview:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap">
                  <div className="bg-black/80 backdrop-blur-sm text-white/80 text-[10px] px-2 py-0.5 rounded tracking-wide font-mono">
                    preview · {fmt(previewTime / 1000)}
                  </div>
                </div>
              </div>
            )}
            {hoverPct !== null && (
              <div className="absolute -top-6 -translate-x-1/2 pointer-events-none transition-none"
                style={{ left: `${hoverPct}%` }}
              >
                <div className="bg-black/80 backdrop-blur-sm text-white/70 text-[10px] px-1.5 py-0.5 rounded font-mono">
                  {fmt((hoverPct / 100) * duration)}
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
  ctx.fill()
}
