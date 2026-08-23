export class WebAudioPlayer {
  el: HTMLAudioElement
  private _preservesPitch: boolean = true
  private _currentBlobUrl: string | null = null

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

  async load(source: string | File) {
    this.stop()

    // Revoke previous blob URL
    if (this._currentBlobUrl) {
      URL.revokeObjectURL(this._currentBlobUrl)
      this._currentBlobUrl = null
    }

    let targetUrl: string

    if (source instanceof File) {
      // Web path: File object → WAV blob URL if MP3
      try {
        if (source.type === 'audio/mpeg') {
          const buf = await source.arrayBuffer()
          const ctx = new AudioContext()
          const audioBuffer = await ctx.decodeAudioData(buf)
          ctx.close()
          targetUrl = URL.createObjectURL(audioBufferToWavBlob(audioBuffer))
          this._currentBlobUrl = targetUrl
        } else {
          targetUrl = URL.createObjectURL(source)
          this._currentBlobUrl = targetUrl
        }
      } catch {
        targetUrl = URL.createObjectURL(source)
        this._currentBlobUrl = targetUrl
      }
    } else if (source.startsWith('data:audio/mpeg;base64,')) {
      // Tauri path: base64 data URL → WAV blob URL
      try {
        const b64 = source.substring(source.indexOf(',') + 1)
        const binaryStr = atob(b64)
        const len = binaryStr.length
        const bytes = new Uint8Array(len)
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryStr.charCodeAt(i)
        }
        const buf = bytes.buffer
        const ctx = new AudioContext()
        const audioBuffer = await ctx.decodeAudioData(buf)
        ctx.close()
        targetUrl = URL.createObjectURL(audioBufferToWavBlob(audioBuffer))
        this._currentBlobUrl = targetUrl
      } catch {
        targetUrl = source
      }
    } else {
      targetUrl = source
      if (targetUrl.startsWith('blob:')) {
        this._currentBlobUrl = targetUrl
      }
    }

    this.el.src = targetUrl

    // Wait for metadata so duration is known (or error)
    if (this.el.readyState < 1) {
      await new Promise<void>((resolve) => {
        let cancelled = false
        const onMeta = () => { if (!cancelled) { cancelled = true; cleanup(); resolve() } }
        const onError = () => {
          if (!cancelled) {
            cancelled = true; cleanup()
            resolve()
          }
        }
        const cleanup = () => {
          this.el.removeEventListener('loadedmetadata', onMeta)
          this.el.removeEventListener('error', onError)
        }
        this.el.addEventListener('loadedmetadata', onMeta)
        this.el.addEventListener('error', onError)
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
    this.el.preservesPitch = this._preservesPitch
  }
}

function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  let result: Float32Array;
  if (numChannels === 2) {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    result = new Float32Array(left.length + right.length);
    for (let i = 0, j = 0; i < left.length; i++) {
      result[j++] = left[i];
      result[j++] = right[i];
    }
  } else {
    result = buffer.getChannelData(0);
  }
  
  const bufferLength = result.length * (bitDepth / 8);
  const arrayBuffer = new ArrayBuffer(44 + bufferLength);
  const view = new DataView(arrayBuffer);
  
  const writeString = (offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + bufferLength, true);
  writeString(8, 'WAVE');
  
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  
  writeString(36, 'data');
  view.setUint32(40, bufferLength, true);
  
  let offset = 44;
  for (let i = 0; i < result.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, result[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  
  return new Blob([view], { type: 'audio/wav' });
}
