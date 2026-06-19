import { useRef, useState, useCallback, useEffect } from 'react'

interface Props {
  audioRef: { current: HTMLAudioElement | null }
  audioPlaying: boolean
  audioCurrent: number
  audioDuration: number
  onSetAudioPlaying: (v: boolean) => void
  onSetAudioCurrent: (v: number) => void
  onSetAudioDuration: (v: number) => void
  previewTime: number
  onOpenPreview?: () => void
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2]

export function AudioPlayer({
  audioRef, audioPlaying, audioCurrent, audioDuration,
  onSetAudioPlaying, onSetAudioCurrent, onSetAudioDuration,
  previewTime, onOpenPreview,
}: Props) {
  const [hasAutoPlayed, setHasAutoPlayed] = useState(false)
  const [showVolume, setShowVolume] = useState(false)
  const [volume, setVolumeState] = useState(0.15)
  const [rate, setRate] = useState(1)
  const [preservePitch, setPreservePitch] = useState(true)
  const [showRatePopup, setShowRatePopup] = useState(false)
  const volumeTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const rateMenuTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onMeta = () => onSetAudioDuration(el.duration)
    const onTime = () => onSetAudioCurrent(el.currentTime)
    const onEnd = () => onSetAudioPlaying(false)
    const onP = () => onSetAudioPlaying(true)
    const onPa = () => onSetAudioPlaying(false)
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('ended', onEnd)
    el.addEventListener('play', onP)
    el.addEventListener('pause', onPa)
    if (el.duration) onSetAudioDuration(el.duration)
    return () => {
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('ended', onEnd)
      el.removeEventListener('play', onP)
      el.removeEventListener('pause', onPa)
    }
  }, [audioRef, onSetAudioPlaying, onSetAudioCurrent, onSetAudioDuration])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.volume = volume
  }, [audioRef, volume])

  useEffect(() => {
    const el = audioRef.current
    if (!el || hasAutoPlayed || audioDuration === 0) return
    el.volume = volume
    if (previewTime > 0) el.currentTime = previewTime / 1000
    el.play().then(() => setHasAutoPlayed(true)).catch(() => {})
  }, [audioRef, audioDuration, hasAutoPlayed, previewTime, volume])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.playbackRate = rate
  }, [audioRef, rate])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.preservesPitch = preservePitch
  }, [audioRef, preservePitch])

  const toggle = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    if (audioPlaying) { el.pause() }
    else { el.play().then(() => setHasAutoPlayed(true)).catch(() => {}) }
  }, [audioRef, audioPlaying])

  const stop = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    el.pause()
    el.currentTime = previewTime > 0 ? previewTime / 1000 : 0
  }, [audioRef, previewTime])

  const isMuted = volume === 0

  const toggleMute = useCallback(() => {
    const el = audioRef.current
    if (!el) return
    if (isMuted) {
      const v = 0.15
      el.volume = v; el.muted = false
      setVolumeState(v)
    } else {
      el.muted = true
      setVolumeState(0)
    }
  }, [audioRef, isMuted])

  const setVolume = useCallback((v: number) => {
    const el = audioRef.current
    if (!el) return
    const clamped = Math.max(0, Math.min(1, v))
    el.volume = clamped
    setVolumeState(clamped)
    el.muted = clamped === 0
  }, [audioRef])

  const handleVolumeEnter = useCallback(() => {
    if (volumeTimer.current) clearTimeout(volumeTimer.current)
    setShowVolume(true)
  }, [])

  const handleVolumeLeave = useCallback(() => {
    volumeTimer.current = setTimeout(() => setShowVolume(false), 200)
  }, [])

  const handleRateEnter = useCallback(() => {
    if (rateMenuTimer.current) clearTimeout(rateMenuTimer.current)
    setShowRatePopup(true)
  }, [])

  const handleRateLeave = useCallback(() => {
    rateMenuTimer.current = setTimeout(() => setShowRatePopup(false), 300)
  }, [])

  const fmt = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div className="shrink-0 px-6 py-2.5 border-t border-white/5 bg-black/30 backdrop-blur-md flex items-center gap-2.5 animate-slide-up">
      {/* Play/Pause */}
      <button
        onClick={toggle}
        className="w-8 h-8 rounded-lg bg-surface-800 hover:bg-surface-700 flex items-center justify-center transition-all duration-75 shrink-0 active:scale-[0.95]"
        title={audioPlaying ? 'Pause' : 'Play'}
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
        className="w-8 h-8 rounded-lg bg-surface-800 hover:bg-surface-700 flex items-center justify-center transition-all duration-75 shrink-0 active:scale-[0.95]"
        title="Stop"
      >
        <svg className="w-3.5 h-3.5 text-surface-400" fill="currentColor" viewBox="0 0 24 24">
          <rect x="6" y="6" width="12" height="12" rx="1" />
        </svg>
      </button>

      {/* Preview */}
      <button
        onClick={onOpenPreview}
        className="w-8 h-8 rounded-lg bg-surface-800 hover:bg-surface-700 flex items-center justify-center transition-all duration-75 shrink-0 active:scale-[0.95]"
        title="Preview beatmap"
      >
        <svg className="w-4 h-4 text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      <span className="text-xs text-surface-500 tabular-nums w-16 shrink-0 select-none">{fmt(audioCurrent)} / {fmt(audioDuration)}</span>

      {/* Progress bar */}
      <div className="flex-1 h-2 bg-white/[0.06] rounded-full cursor-pointer group relative"
        onClick={(e) => {
          const el = audioRef.current
          if (!el || !audioDuration) return
          const rect = e.currentTarget.getBoundingClientRect()
          const pct = (e.clientX - rect.left) / rect.width
          el.currentTime = pct * audioDuration
        }}
      >
        <div
          className="h-full bg-accent rounded-full transition-[width] duration-75"
          style={{ width: `${audioDuration ? (audioCurrent / audioDuration) * 100 : 0}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-sm border-2 border-accent opacity-0 group-hover:opacity-100 transition-opacity duration-100"
          style={{ left: `calc(${audioDuration ? (audioCurrent / audioDuration) * 100 : 0}% - 6px)` }}
        />
      </div>

      {/* Rate control */}
      <div
        className="relative shrink-0"
        onMouseEnter={handleRateEnter}
        onMouseLeave={handleRateLeave}
      >
        <button
          className="h-8 px-2.5 rounded-lg bg-surface-800 hover:bg-surface-700 text-xs text-surface-300 font-medium transition-all duration-75 active:scale-[0.95]"
          title="Playback speed"
        >
          {rate}x
        </button>
        {showRatePopup && (
          <div className="absolute bottom-full mb-2 right-0 bg-surface-800 border border-white/10 rounded-xl p-2 shadow-xl z-30 min-w-[140px]"
            onMouseEnter={handleRateEnter}
            onMouseLeave={handleRateLeave}
          >
            <div className="flex flex-col gap-1">
              {RATES.map(r => (
                <button
                  key={r}
                  onClick={() => { setRate(r); setShowRatePopup(false) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-75 text-left active:scale-[0.97]
                    ${r === rate
                      ? 'bg-accent text-white'
                      : 'text-surface-300 hover:bg-surface-700'
                    }`}
                >
                  {r}x
                </button>
              ))}
              <div className="border-t border-white/10 my-1" />
              <label className="flex items-center gap-2 px-3 py-1.5 text-xs text-surface-300 cursor-pointer select-none">
                <div
                  className={`w-4 h-4 rounded border transition-all duration-100 flex items-center justify-center shrink-0 ${
                    preservePitch ? 'bg-accent border-accent' : 'bg-surface-700 border-white/20'
                  }`}
                  onClick={() => setPreservePitch(p => !p)}
                >
                  {preservePitch && (
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                Preserve pitch
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Volume */}
      <div className="flex items-center gap-1.5 group/vol shrink-0">
        <button
          onClick={toggleMute}
          className="w-8 h-8 rounded-lg bg-surface-800 hover:bg-surface-700 flex items-center justify-center transition-all duration-75 shrink-0 active:scale-[0.95]"
          title={isMuted ? 'Unmute' : 'Mute'}
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