import { useT } from '../i18n'
import type { OsuLibraryScanProgress } from '../lib/osuLibrary'

type Props = {
  progress: OsuLibraryScanProgress | null
}

export function OsuLibraryProgress({ progress }: Props) {
  const t = useT()
  const total = progress?.total ?? 0
  const completed = progress?.completed ?? 0
  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0
  const label = t('osuLibrary.scanningSkins')

  return (
    <div className="rounded-xl border border-white/8 bg-black/10 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3 text-[11px]">
        <span className="text-surface-400">{label}</span>
        <span className="tabular-nums text-surface-600">{total > 0 ? `${completed.toLocaleString()} / ${total.toLocaleString()}` : '...'}</span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total || undefined}
        aria-valuenow={total ? completed : undefined}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-200"
          style={{ width: `${total ? percent : 8}%` }}
        />
      </div>
    </div>
  )
}
