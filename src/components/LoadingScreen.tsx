interface Props {
  show: boolean
  label: string
  detail?: string | null
}

export function LoadingScreen({ show, label, detail }: Props) {
  if (!show) return null

  return (
    <div
      className="henkan-loading-screen fixed inset-0 z-[100] grid place-items-center bg-surface-950/82 backdrop-blur-md"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="flex max-w-xs flex-col items-center px-6 text-center">
        <div className="henkan-loading-mark" aria-hidden="true">
          <span className="henkan-loading-orbit henkan-loading-orbit--outer" />
          <span className="henkan-loading-orbit henkan-loading-orbit--inner" />
          <span className="henkan-loading-core">
            <img src="/logo32.png" alt="" />
          </span>
        </div>
        <p className="mt-5 text-sm font-medium text-surface-200">{label}</p>
        {detail && <p className="mt-1 max-w-full truncate text-xs text-surface-500">{detail}</p>}
        <div className="henkan-loading-dots mt-4" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  )
}
