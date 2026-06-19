interface Props {
  label: string
  value: string | null
  hasPreview?: boolean
  onPick: () => void
  onClear?: () => void
}

export function FilePicker({ label, value, hasPreview, onPick, onClear }: Props) {
  const short = value
    ? value.split('/').pop()?.split('\\').pop() || value
    : 'auto'

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-[11px] text-surface-500 font-medium w-20 shrink-0">{label}</span>
      <button
        onClick={onPick}
        className="flex-1 flex items-center gap-2 bg-white/[0.03] border border-white/8 rounded-lg px-3 h-9
          text-surface-500 hover:text-surface-300 hover:border-white/15 transition-all duration-75 text-left truncate"
      >
        {hasPreview && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
        )}
        <span className="truncate text-sm">{short}</span>
        <svg className="w-3 h-3 ml-auto shrink-0 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      </button>
      {onClear && value && (
        <button onClick={onClear} className="text-surface-600 hover:text-surface-400 transition-colors shrink-0">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}