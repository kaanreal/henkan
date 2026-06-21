export class WebAudioPlayer {
  el: HTMLAudioElement
  private _preservesPitch: boolean = true

  onDurationChange?: (duration: number) => void
  onTimeUpdate?: (time: number) => void
  onEnded?: () => void
  onPlay?: () => void
  onPause?: () => void

  constructor() {
    this.el = new Audio()
    this.el.addEventListener('loadedmetadata', () => {
      this.onDurationChange?.(this.el.duration)
    })
    this.el.addEventListener('timeupdate', () => {
      this.onTimeUpdate?.(this.el.currentTime)
    })
    this.el.addEventListener('ended', () => {
      this.onEnded?.()
    })
    this.el.addEventListener('play', () => {
      this.onPlay?.()
    })
    this.el.addEventListener('pause', () => {
      this.onPause?.()
    })
  }

  async load(dataUrl: string) {
    this.stop()
    this.el.src = dataUrl
    // Wait for metadata so duration is known
    if (this.el.readyState < 1) {
      await new Promise<void>((resolve) => {
        const onMeta = () => { this.el.removeEventListener('loadedmetadata', onMeta); resolve() }
        this.el.addEventListener('loadedmetadata', onMeta)
      })
    }
  }

  get duration(): number {
    return this.el.duration || 0
  }

  get currentTime(): number {
    return this.el.currentTime
  }

  set currentTime(time: number) {
    this.el.currentTime = Math.max(0, time)
  }

  async play(): Promise<void> {
    await this.el.play()
  }

  pause() {
    this.el.pause()
  }

  stop() {
    this.el.pause()
    this.el.currentTime = 0
    this.onTimeUpdate?.(0)
  }

  get playbackRate(): number { return this.el.playbackRate }
  set playbackRate(rate: number) {
    this.el.playbackRate = rate
    this.applyPreservesPitch()
  }

  get preservesPitch(): boolean { return this._preservesPitch }
  set preservesPitch(v: boolean) {
    this._preservesPitch = v
    this.applyPreservesPitch()
  }

  get volume(): number { return this.el.volume }
  set volume(v: number) {
    this.el.volume = Math.max(0, Math.min(1, v))
    this.el.muted = this.el.volume === 0
  }

  get muted(): boolean { return this.el.muted }
  set muted(m: boolean) {
    this.el.muted = m
  }

  get paused(): boolean { return this.el.paused }
  get src(): boolean { return !!this.el.src }

  private applyPreservesPitch() {
    (this.el as any).preservesPitch = this._preservesPitch
  }
}
