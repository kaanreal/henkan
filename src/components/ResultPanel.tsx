import { useTranslation } from 'react-i18next'
import { saveContentToFile } from '../services/files'
import { saveFile } from '../services/dialogs'

interface ResultPanelProps {
  content: string
  filename: string
}

export function ResultPanel({ content, filename }: ResultPanelProps) {
  const { t } = useTranslation()
  const handleSave = async () => {
    try {
      const path = await saveFile({
        defaultPath: filename,
        filters: [{ name: t('resultPanel.filterBeatmap'), extensions: [filename.replace('.', '')] }],
      })
      if (path) {
        await saveContentToFile(path, content)
      }
    } catch {
      const blob = new Blob([content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `converted${filename}`
      a.click()
      URL.revokeObjectURL(url)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
  }

  const lines = content.split('\n')
  const truncated = lines.length > 30
  const preview = truncated ? lines.slice(0, 30).join('\n') + '\n... ' + t('resultPanel.truncated') : content

  return (
    <div className="bg-surface-900/60 rounded-xl border border-surface-800 overflow-hidden animate-slide-up">
      <div className="flex items-center justify-between px-5 py-3 border-b border-surface-800">
        <span className="text-sm font-medium text-surface-300">{t('resultPanel.convertedResult')}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="px-3 py-1.5 rounded-lg text-xs text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
          >
            {t('common.copy')}
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 rounded-lg text-xs bg-accent/10 text-accent hover:bg-accent/20 transition-colors"
          >
            {t('common.save')}
          </button>
        </div>
      </div>

      <pre className="p-5 text-xs font-mono text-surface-400 leading-relaxed overflow-auto custom-scrollbar max-h-72 select-all">
        {preview}
      </pre>

      {truncated && (
        <p className="px-5 pb-3 text-xs text-surface-500">
          {t('resultPanel.totalLines', { count: content.split('\n').length })}
        </p>
      )}
    </div>
  )
}
