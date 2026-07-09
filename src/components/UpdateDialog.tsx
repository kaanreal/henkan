import { useState } from 'react'

interface UpdateInfo {
  version: string
  body: string | null
  date: string | null
}

interface UpdateDialogProps {
  open: boolean
  updateInfo: UpdateInfo | null
  installing: boolean
  onUpdate: () => void
  onDismiss: (dontAskAgain: boolean) => void
}

export function UpdateDialog({ open, updateInfo, installing, onUpdate, onDismiss }: UpdateDialogProps) {
  const [dontAskAgain, setDontAskAgain] = useState(false)

  if (!open || !updateInfo) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface-900 border border-surface-700/50 rounded-2xl shadow-2xl max-w-lg w-full mx-4 animate-scale-in overflow-hidden">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-surface-100">Update available</h2>
              <p className="text-sm text-surface-400">Henkan {updateInfo.version} is ready to install</p>
            </div>
          </div>
        </div>

        {updateInfo.body && (
          <div className="px-6 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-3.5 h-3.5 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">Release Notes</span>
            </div>
            <div className="bg-black/20 rounded-xl p-4 max-h-64 overflow-y-auto text-sm text-surface-300 leading-relaxed whitespace-pre-wrap">
              {updateInfo.body}
            </div>
          </div>
        )}

        <div className="px-6 pb-4">
          <label className="flex items-center gap-2.5 cursor-pointer group" onClick={() => setDontAskAgain(!dontAskAgain)}>
            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all duration-75 ${dontAskAgain ? 'bg-accent border-accent' : 'border-surface-600 group-hover:border-surface-500'}`}>
              {dontAskAgain && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span className="text-xs text-surface-400 group-hover:text-surface-300 transition-colors">Don't ask again for this version</span>
          </label>
        </div>

        <div className="px-6 pb-6 flex gap-3 justify-end">
          <button
            onClick={() => { onDismiss(dontAskAgain); setDontAskAgain(false) }}
            disabled={installing}
            className="px-5 py-2 rounded-xl bg-surface-800 border border-surface-700/40 text-surface-400 font-medium text-sm hover:bg-surface-700 hover:text-surface-200 active:scale-[0.97] transition-all duration-75 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Not now
          </button>
          <button
            onClick={onUpdate}
            disabled={installing}
            className="px-5 py-2 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent-hover active:scale-[0.97] transition-all duration-75 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {installing ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Installing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Update
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
