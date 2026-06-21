import { useRef, useCallback } from 'react'
import type { ConvertDirection } from '../types/beatmap'

interface DropZoneProps {
  dragging: boolean
  onFileSelected: (file: File) => void
  direction: ConvertDirection
}

export function DropZone({ dragging, onFileSelected }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClick = useCallback(() => {
    inputRef.current?.click()
  }, [])

  return (
    <div
      onClick={handleClick}
        className={`
        relative w-full max-w-lg cursor-pointer rounded-3xl border-2 border-dashed
        backdrop-blur-sm transition-all duration-150 ease-out overflow-hidden
        ${dragging
          ? 'border-accent bg-accent/5 scale-[1.02]'
          : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'
        }
      `}
    >
      {/* Decorative blurred orbs */}
      <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-accent/8 blur-2xl animate-pulse-soft" style={{animationDuration: '4s'}} />
      <div className="absolute -bottom-6 -left-6 w-20 h-20 rounded-full bg-purple-500/8 blur-2xl animate-pulse-soft" style={{animationDuration: '5s'}} />
      <div className="absolute top-1/3 -left-3 w-8 h-8 rounded-full bg-accent/5 blur-xl" />

      {/* Subtle grid pattern */}
      <div className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,1) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />

      <input
        ref={inputRef}
        type="file"
        accept=".osu,.osz,.sm"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFileSelected(file)
        }}
      />

      <div className="flex flex-col items-center gap-4 sm:gap-5 py-10 sm:py-16 px-6 sm:px-8 relative">
        <div className={`w-14 h-14 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl flex items-center justify-center transition-all duration-300 ${
          dragging
            ? 'bg-accent/15 scale-110 rotate-3 shadow-lg shadow-accent/10'
            : 'bg-white/[0.04]'
        }`}>
          <svg
            className={`w-7 h-7 sm:w-10 sm:h-10 transition-all duration-300 ${
              dragging ? 'text-accent' : 'text-surface-400'
            }`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}
          >
            <path
              strokeLinecap="round" strokeLinejoin="round"
              d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
            />
          </svg>
        </div>

        <div className="text-center space-y-1 sm:space-y-1.5">
          <p className="text-lg sm:text-xl font-semibold text-surface-200">
            {dragging ? 'let go!' : 'drop a beatmap'}
          </p>
          <p className="text-sm text-surface-500">
            or click to browse &mdash; .osu, .osz, .sm
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/5 text-surface-500 font-medium">osu!mania</span>
          <span className="text-surface-600 text-lg">&harr;</span>
          <span className="px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/5 text-surface-500 font-medium">StepMania</span>
        </div>
      </div>
    </div>
  )
}
