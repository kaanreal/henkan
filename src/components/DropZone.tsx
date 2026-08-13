import { useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConvertDirection } from '../types/beatmap'
import { openFiles } from '../services/dialogs'
import { fileInputCache } from '../services/fileCache'

interface DropZoneProps {
  dragging: boolean
  onFilesSelected: (paths: string[]) => void
  direction: ConvertDirection
}

export function DropZone({ dragging, onFilesSelected }: DropZoneProps) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)

  const handleClick = useCallback(async () => {
    try {
      const selected = await openFiles({
        multiple: true,
        filters: [{ name: t('dropZone.filterName'), extensions: ['osu', 'osz', 'sm', 'osk', 'zip'] }],
      })
      if (selected) {
        onFilesSelected(selected)
      }
    } catch {
      inputRef.current?.click()
    }
  }, [onFilesSelected, t])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    fileInputCache.push(...files)
    const paths = files.map((file) => (file as File & { path?: string }).path || file.name)
    onFilesSelected(paths)
  }, [onFilesSelected])

  return (
    <div
      onClick={handleClick}
        className={`
        relative w-full max-w-lg cursor-pointer rounded-3xl border-2 border-dashed
        transition-all duration-150 ease-out overflow-hidden
        ${dragging
          ? 'border-accent bg-accent/5 scale-[1.02]'
          : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".osu,.osz,.sm,.osk,.zip"
        className="hidden"
        multiple
        onChange={handleFileChange}
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
            {dragging ? t('dropZone.releaseToDetect') : t('dropZone.dropBeatmapOrSkin')}
          </p>
          <p className="text-sm text-surface-500">
            {t('dropZone.clickToBrowse')}
          </p>
        </div>
      </div>
    </div>
  )
}
