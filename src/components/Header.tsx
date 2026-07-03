import { useEffect, useState } from 'react'
import { openUrl, getGithubStars } from '../services/platform'
import type { ConvertDirection } from '../types/beatmap'

const REPO = 'kaanreal/henkan'
const GITHUB_URL = `https://github.com/${REPO}`
const SUPPORTER_URL = 'https://osu.ppy.sh/store/products/supporter-tag?target=Kxxn'

interface HeaderProps {
  direction: ConvertDirection
  onSetDirection: (dir: ConvertDirection) => void
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8" />
    </svg>
  )
}

function HeartIcon() {
  return <span className="text-[#FF57A0]">&#x2764;</span>
}

export function Header({ direction, onSetDirection }: HeaderProps) {
  const [stars, setStars] = useState<string | null>(null)

  useEffect(() => {
    getGithubStars(REPO)
      .then((count) => {
        if (count) setStars(count)
      })
      .catch(() => {})
  }, [])

  return (
    <header className="px-6 py-3 border-b border-white/5 bg-black/20 backdrop-blur-md flex items-center justify-between shrink-0 animate-fade-in gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <img src="/logo32.png" alt="Henkan" className="w-8 h-8 rounded-lg shrink-0" />
        <span className="text-base font-semibold tracking-tight text-surface-100">Henkan</span>

        <button
          onClick={() => openUrl(GITHUB_URL)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-surface-400 hover:text-surface-200 text-[11px] font-medium transition-all duration-75 active:scale-[0.97]"
        >
          <GithubIcon />
          {stars !== null ? stars : '—'}
        </button>
      </div>

      <div className="flex bg-white/[0.04] rounded-lg border border-white/5 p-0.5 gap-0.5">
        <button
          onClick={() => onSetDirection('osu-to-etterna')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-75 active:scale-[0.97]
            ${direction === 'osu-to-etterna'
              ? 'bg-accent text-white shadow-sm'
              : 'text-surface-400 hover:text-surface-200'
            }`}
        >
          .osu / .osz
        </button>
        <span className="text-surface-600 self-center text-xs">→</span>
        <button
          onClick={() => onSetDirection('etterna-to-osu')}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-75 active:scale-[0.97]
            ${direction === 'etterna-to-osu'
              ? 'bg-accent text-white shadow-sm'
              : 'text-surface-400 hover:text-surface-200'
            }`}
        >
          .sm
        </button>
      </div>

      <button
        onClick={() => openUrl(SUPPORTER_URL)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#FF57A0]/40 hover:border-[#FF57A0] bg-[#FF57A0]/[0.06] hover:bg-[#FF57A0]/[0.12] text-surface-300 hover:text-white text-xs font-medium transition-all duration-75 active:scale-[0.97] shrink-0"
      >
        <HeartIcon />
        buy me osu! supporter
      </button>
    </header>
  )
}
