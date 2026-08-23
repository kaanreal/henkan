import { useRef, useState, useCallback, useEffect } from 'react'
import { useT } from '../i18n'
import type { WebAudioPlayer } from '../lib/WebAudioPlayer'
import { useConverterStore } from '../stores/useConverterStore'

interface Props {
  audioPlayerRef: { current: WebAudioPlayer | null }
  audioPlaying: boolean
  audioDuration: number
  previewTime: number
  onOpenPreview?: () => void
}

const fmt = (s: number) => {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export function AudioPlayer({
  audioPlayerRef, audioPlaying, audioDuration,
  previewTime, onOpenPreview,
}: Props) {
  const t = useT()
  const conversionRate = useConverterStore(s => s.config.conversion_rate)
  const preservePitch = useConverterStore(s => s.config.preserve_pitch)
  const [showVolume, setShowVolume] = useState(false)
  const [volume, setVolumeState] = useState(0.15)
  const volumeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  
  const progressFillRef = useRef<HTMLDivElement>(null)
  const progressThumbRef = useRef<HTMLDivElement>(null)
  const timeTextRef = useRef<HTMLSpanElement>(null)

  // Event callbacks are handled by App.tsx via WebAudioPlayer.onXxx properties

  useEffect(() => {
    const el = audioPlayerRef.current
    if (!el) return
    el.volume = volume
  }, [audioPlayerRef, volume])

  useEffect(() => {
    let rafId = 0
    const loop = () => {
      const el = audioPlayerRef.current
      if (el) {
        const c = el.currentTime
        const pct = audioDuration > 0 ? (c / audioDuration) * 100 : 0
        if (progressFillRef.current) progressFillRef.current.style.width = `${pct}%`
        if (progressThumbRef.current) progressThumbRef.current.style.left = `calc(${pct}% - 6px)`
        if (timeTextRef.current) timeTextRef.current.innerText = `${fmt(c)} / ${fmt(audioDuration)}`
      }
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [audioPlayerRef, audioDuration])

  useEffect(() => {
    const el = audioPlayerRef.current
    if (!el) return
    el.playbackRate = conversionRate
  }, [audioPlayerRef, conversionRate])

  useEffect(() => {
    const el = audioPlayerRef.current
    if (!el) return
    el.preservesPitch = preservePitch
  }, [audioPlayerRef, preservePitch])

  const toggle = useCallback(() => {
    const el = audioPlayerRef.current
    if (!el) return
    if (audioPlaying) { el.pause() }
    else { el.play().catch(() => {}) }
  }, [audioPlayerRef, audioPlaying])

  const stop = useCallback(() => {
    const el = audioPlayerRef.current
    if (!el) return
    el.pause()
    el.currentTime = previewTime > 0 ? previewTime / 1000 : 0
  }, [audioPlayerRef, previewTime])

  const isMuted = volume === 0

  const toggleMute = useCallback(() => {
    const el = audioPlayerRef.current
    if (!el) return
    if (isMuted) {
      const v = 0.15
      el.volume = v; el.muted = false
      setVolumeState(v)
    } else {
      el.muted = true
      setVolumeState(0)
    }
  }, [audioPlayerRef, isMuted])

  const setVolume = useCallback((v: number) => {
    const el = audioPlayerRef.current
    if (!el) return
    const clamped = Math.max(0, Math.min(1, v))
    el.volume = clamped
    setVolumeState(clamped)
    el.muted = clamped === 0
  }, [audioPlayerRef])

  const handleVolumeEnter = useCallback(() => {
    if (volumeTimer.current) clearTimeout(volumeTimer.current)
    setShowVolume(true)
  }, [])

  const handleVolumeLeave = useCallback(() => {
    volumeTimer.current = setTimeout(() => setShowVolume(false), 200)
  }, [])


  return (
    <div className="shrink-0 px-6 py-2.5 border-t border-white/5 bg-black/30 flex items-center gap-2.5 animate-slide-up">
      {/* Play/Pause */}
      <button
        onClick={toggle}
        className="w-8 h-8 rounded-lg bg-surface-800 hover:bg-surface-700 flex items-center justify-center transition-all duration-75 shrink-0"
        title={audioPlaying ? t('audioPlayer.pause') : t('audioPlayer.play')}
      >
        {audioPlaying ? (
          <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
            <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Stop */}
      <button
        onClick={stop}
        className="w-8 h-8 rounded-lg bg-surface-800 hover:bg-surface-700 flex items-center justify-center transition-all duration-75 shrink-0"
        title={t('audioPlayer.stop')}
      >
        <svg className="w-3.5 h-3.5 text-surface-400" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="1" />
        </svg>
      </button>

      {/* Preview */}
      <button
        onClick={onOpenPreview}
        className="w-8 h-8 rounded-lg bg-surface-800 hover:bg-surface-700 flex items-center justify-center transition-all duration-75 shrink-0"
        title={t('audioPlayer.previewBeatmap')}
      >
        <svg className="w-4 h-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      <span ref={timeTextRef} className="text-xs text-surface-500 tabular-nums w-16 shrink-0 select-none">0:00 / 0:00</span>

      {/* Progress bar */}
      <div className="flex-1 h-2 bg-white/[0.06] rounded-full cursor-pointer group relative"
        onClick={(e) => {
          const el = audioPlayerRef.current
          if (!el || !audioDuration) return
          const rect = e.currentTarget.getBoundingClientRect()
          const pct = (e.clientX - rect.left) / rect.width
          el.currentTime = pct * audioDuration
        }}
      >
        <div
          ref={progressFillRef}
          className="h-full bg-accent rounded-full transition-none"
          style={{ width: '0%' }}
        />
        <div
          ref={progressThumbRef}
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-sm border-2 border-accent opacity-0 group-hover:opacity-100 transition-opacity duration-100"
          style={{ left: '-6px' }}
        />
      </div>

      {/* Rate */}
      <div className="h-8 px-2.5 rounded-lg bg-surface-800 text-xs text-accent font-medium flex items-center shrink-0 select-none">
        {conversionRate.toFixed(2)}x
      </div>

      {/* Volume */}
      <div className="flex items-center gap-1.5 group/vol shrink-0">
        <button
          onClick={toggleMute}
        className="w-8 h-8 rounded-lg bg-surface-800 hover:bg-surface-700 flex items-center justify-center transition-all duration-75 shrink-0"
          title={isMuted ? t('audioPlayer.unmute') : t('audioPlayer.mute')}
        >
          {isMuted ? (
            <svg className="w-4 h-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-surface-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657A8 8 0 0017.657 7.343m-2.829 2.828a4 4 0 010 5.657" />
            </svg>
          )}
        </button>

        <div className="flex items-center gap-1.5 overflow-hidden transition-all duration-200"
          style={{
            width: showVolume ? 80 : 0,
            opacity: showVolume ? 1 : 0,
          }}
          onMouseEnter={handleVolumeEnter}
          onMouseLeave={handleVolumeLeave}
        >
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-16 h-1 appearance-none bg-surface-700 rounded-full cursor-pointer accent-accent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-md"
          />
          <span className="text-[10px] text-surface-500 select-none tabular-nums">{Math.round(volume * 100)}%</span>
        </div>
      </div>
    </div>
  )
}