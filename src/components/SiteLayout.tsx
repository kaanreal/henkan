import { Link } from 'react-router'

export function SiteHeader() {
  return (
    <header className="border-b border-surface-800/50 bg-surface-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 text-surface-100 hover:text-white transition-colors">
          <img src="/logo32.png" alt="Henkan" className="w-7 h-7 rounded-lg" />
          <span className="font-semibold text-sm">Henkan</span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link to="/osu-to-stepmania" className="px-3 py-1.5 text-xs text-surface-400 hover:text-surface-200 rounded-lg hover:bg-white/5 transition-all">Converter</Link>
          <Link to="/osu-mania-pack-creator" className="px-3 py-1.5 text-xs text-surface-400 hover:text-surface-200 rounded-lg hover:bg-white/5 transition-all">Pack Creator</Link>
          <Link to="/osu-mania-map-viewer" className="px-3 py-1.5 text-xs text-surface-400 hover:text-surface-200 rounded-lg hover:bg-white/5 transition-all">Map Viewer</Link>
          <a href="https://github.com/kaanreal/henkan" target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 text-xs text-surface-400 hover:text-surface-200 rounded-lg hover:bg-white/5 transition-all">GitHub</a>
        </nav>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-surface-800/50 bg-surface-950">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-xs text-surface-500">
          <div>
            <h4 className="font-medium text-surface-300 mb-2">Tools</h4>
            <ul className="space-y-1.5">
              <li><Link to="/osu-to-stepmania" className="hover:text-surface-300 transition-colors">Converter</Link></li>
              <li><Link to="/osu-mania-pack-creator" className="hover:text-surface-300 transition-colors">Pack Creator</Link></li>
              <li><Link to="/osu-mania-map-viewer" className="hover:text-surface-300 transition-colors">Map Viewer</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-surface-300 mb-2">Guides</h4>
            <ul className="space-y-1.5">
              <li><Link to="/how-to-make-an-osu-mania-map" className="hover:text-surface-300 transition-colors">Making Maps</Link></li>
              <li><Link to="/how-to-convert-osu-mania-to-stepmania" className="hover:text-surface-300 transition-colors">Converting Maps</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-surface-300 mb-2">Download</h4>
            <ul className="space-y-1.5">
              <li><a href="https://github.com/kaanreal/henkan/releases" target="_blank" rel="noopener noreferrer" className="hover:text-surface-300 transition-colors">GitHub Releases</a></li>
              <li><Link to="/" className="hover:text-surface-300 transition-colors">Web App</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-surface-300 mb-2">Community</h4>
            <ul className="space-y-1.5">
              <li><a href="https://github.com/kaanreal/henkan" target="_blank" rel="noopener noreferrer" className="hover:text-surface-300 transition-colors">GitHub</a></li>
              <li><a href="https://github.com/kaanreal/henkan/issues" target="_blank" rel="noopener noreferrer" className="hover:text-surface-300 transition-colors">Report Issues</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-8 pt-6 border-t border-surface-800/50 text-center text-[10px] text-surface-600">
          Made by <a href="https://github.com/kaanreal" target="_blank" rel="noopener noreferrer" className="text-accent-muted hover:text-accent transition-colors">Kaan</a>
        </div>
      </div>
    </footer>
  )
}
