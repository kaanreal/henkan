import { useEffect, useState } from 'react'

interface UpdateInfo {
  version: string
  body: string | null
  date: string | null
}

interface UpdateDialogProps {
  open: boolean
  updateInfo: UpdateInfo | null
  installing: boolean
  error: string | null
  updatePhase: 'idle' | 'downloading' | 'installing' | 'done'
  downloadProgress: { downloaded: number; total: number } | null
  onUpdate: () => void
  onManualRestart: () => void
  onDismiss: (dontAskAgain: boolean) => void
}

function renderMarkdown(md: string): string {
  const html = md
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-semibold text-surface-200 mt-3 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-sm font-semibold text-surface-200 mt-4 mb-1">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-surface-200">$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-accent hover:underline" target="_blank" rel="noopener">$1</a>')
    .replace(/^(\*|-) (.+)$/gm, '<li class="ml-4 list-disc text-surface-400">$2</li>')
    .replace(/`([^`]+)`/g, '<code class="text-xs bg-black/30 px-1.5 py-0.5 rounded text-surface-300">$1</code>')
  const lines = html.split('\n')
  const result: string[] = []
  let inList = false
  for (const line of lines) {
    if (line.startsWith('<li ') && !inList) {
      result.push('<ul class="my-1 space-y-0.5">')
      inList = true
    } else if (!line.startsWith('<li ') && inList) {
      result.push('</ul>')
      inList = false
    }
    result.push(line)
  }
  if (inList) result.push('</ul>')
  return result.join('\n')
}

export function UpdateDialog({ open, updateInfo, installing, error, updatePhase, downloadProgress, onUpdate, onManualRestart, onDismiss }: UpdateDialogProps) {
  const [dontAskAgain, setDontAskAgain] = useState(false)
  const [releaseNotes, setReleaseNotes] = useState<string | null>(null)
  const [fetchedVersion, setFetchedVersion] = useState<string | null>(null)

  const currentTag = open && updateInfo ? `v${updateInfo.version}` : null
  const notesLoading = currentTag !== null && fetchedVersion !== currentTag && releaseNotes === null

  useEffect(() => {
    if (!currentTag || fetchedVersion === currentTag) return
    let cancelled = false
    fetch(`https://api.github.com/repos/kaanreal/henkan/releases/tags/${currentTag}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelled && data?.body) {
          setReleaseNotes(data.body)
          setFetchedVersion(currentTag)
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFetchedVersion(prev => prev === currentTag ? prev : currentTag) })
    return () => { cancelled = true }
  }, [currentTag, fetchedVersion])

  if (!open || !updateInfo) return null

  const progressPercent = downloadProgress && downloadProgress.total > 0
    ? Math.round((downloadProgress.downloaded / downloadProgress.total) * 100)
    : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in">
      <div className="bg-surface-900 border border-surface-700/50 rounded-2xl shadow-2xl max-w-lg w-full mx-4 animate-scale-in overflow-hidden">
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center shrink-0">
              {updatePhase === 'done' ? (
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : installing ? (
                <svg className="w-5 h-5 text-accent animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-surface-100">
                {updatePhase === 'done' ? 'Update installed' : 'Update available'}
              </h2>
              <p className="text-sm text-surface-400">
                {updatePhase === 'done'
                  ? 'Henkan will restart momentarily'
                  : `Henkan ${updateInfo.version} is ready to install`}
              </p>
            </div>
          </div>
        </div>

        {installing && (
          <div className="px-6 pb-4">
            <div className="bg-black/20 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs text-surface-400">
                  {updatePhase === 'downloading' && 'Downloading update...'}
                  {updatePhase === 'installing' && 'Installing update...'}
                  {updatePhase === 'done' && 'Update installed successfully'}
                </span>
                {progressPercent !== null && updatePhase === 'downloading' && (
                  <span className="text-xs text-surface-500 ml-auto">{progressPercent}%</span>
                )}
              </div>
              {progressPercent !== null && updatePhase === 'downloading' && (
                <div className="w-full h-1.5 bg-surface-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              )}
              {updatePhase === 'installing' && (
                <div className="w-full h-1.5 bg-surface-800 rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full animate-pulse" style={{ width: '100%' }} />
                </div>
              )}
            </div>
          </div>
        )}

        {(releaseNotes || notesLoading) && !installing && (
          <div className="px-6 pb-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-3.5 h-3.5 text-surface-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="text-xs font-medium text-surface-500 uppercase tracking-wider">Release Notes</span>
            </div>
            <div className="bg-black/20 rounded-xl p-4 max-h-64 overflow-y-auto text-sm text-surface-300 leading-relaxed">
              {notesLoading && !releaseNotes ? (
                <div className="flex items-center gap-2 text-surface-500 text-xs">
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Loading release notes...
                </div>
              ) : (
                <div
                  className="prose-sm prose-invert max-w-none [&_h2]:text-surface-200 [&_h3]:text-surface-200 [&_strong]:text-surface-200 [&_a]:text-accent [&_li]:text-surface-400"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(releaseNotes || '') }}
                />
              )}
            </div>
          </div>
        )}

        {!installing && (
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
        )}

        {error && (
          <div className="px-6 pb-4">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/10 text-red-400 text-xs font-medium">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          </div>
        )}

        <div className="px-6 pb-6 flex gap-3 justify-end">
          {updatePhase === 'done' ? (
            <button
              onClick={onManualRestart}
              className="px-5 py-2 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent-hover active:scale-[0.97] transition-all duration-75 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Restart now
            </button>
          ) : (
            <>
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
                    {updatePhase === 'downloading' ? 'Downloading...' : 'Installing...'}
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}
