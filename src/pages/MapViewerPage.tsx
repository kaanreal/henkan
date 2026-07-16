import { Link } from 'react-router'
import { SEO } from '../components/SEO'
import { SiteHeader, SiteFooter } from '../components/SiteLayout'

export function MapViewerPage() {
  return (
    <div className="min-h-screen bg-surface-950 text-surface-200 flex flex-col">
      <SEO
        title="osu!mania Map Viewer - Preview and Play Beatmaps"
        description="Preview osu!mania and Etterna beatmaps with a full canvas-rendered note display, hitsound playback, and adjustable scroll speed."
        path="/osu-mania-map-viewer"
      />
      <SiteHeader />

      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-12">
          <p className="text-xs font-medium text-accent tracking-widest uppercase mb-3">Map Viewer</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-surface-100 leading-tight mb-4">
            osu!mania Map Viewer
          </h1>
          <p className="text-lg text-surface-400 leading-relaxed max-w-2xl">
            Preview beatmaps before converting. See the notes scroll by with synced audio, hitsounds, and a note density graph.
          </p>
        </section>

        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
          <div className="rounded-2xl overflow-hidden border border-surface-800/50 mb-12">
            <img src="/screenshots/preview.png" alt="Henkan preview overlay showing a canvas-rendered note scrolling display with audio playback controls" className="w-full" />
          </div>

          <div className="space-y-10">
            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">Preview features</h2>
              <ul className="space-y-2 text-sm text-surface-400">
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><strong className="text-surface-200">Canvas-rendered notes</strong> - Full note scrolling visualization, not just a static image.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><strong className="text-surface-200">Hitsound playback</strong> - Plays hit sounds synced to note positions with dynamic gain.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><strong className="text-surface-200">Adjustable scroll speed</strong> - Mouse wheel controls look-ahead from 150ms to 600ms.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><strong className="text-surface-200">Playback rate control</strong> - Ctrl+Scroll to change rate in the preview.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><strong className="text-surface-200">Note density graph</strong> - See note distribution across the chart in the timeline.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><strong className="text-surface-200">Preview point setter</strong> - Press Tab to set the preview point at the current playback position.</span>
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">Keyboard shortcuts</h2>
              <div className="bg-surface-900/50 border border-surface-800/50 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-800/50">
                      <th className="text-left px-4 py-2.5 text-surface-400 font-medium">Key</th>
                      <th className="text-left px-4 py-2.5 text-surface-400 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="text-surface-300">
                    <tr className="border-b border-surface-800/30"><td className="px-4 py-2 font-mono text-xs">Space</td><td className="px-4 py-2">Open preview / Play</td></tr>
                    <tr className="border-b border-surface-800/30"><td className="px-4 py-2 font-mono text-xs">Esc</td><td className="px-4 py-2">Close preview</td></tr>
                    <tr className="border-b border-surface-800/30"><td className="px-4 py-2 font-mono text-xs">Right-click</td><td className="px-4 py-2">Play / Pause</td></tr>
                    <tr className="border-b border-surface-800/30"><td className="px-4 py-2 font-mono text-xs">Ctrl+Scroll</td><td className="px-4 py-2">Change playback rate</td></tr>
                    <tr className="border-b border-surface-800/30"><td className="px-4 py-2 font-mono text-xs">Alt+Scroll</td><td className="px-4 py-2">Volume control</td></tr>
                    <tr className="border-b border-surface-800/30"><td className="px-4 py-2 font-mono text-xs">Tab</td><td className="px-4 py-2">Set preview point</td></tr>
                    <tr><td className="px-4 py-2 font-mono text-xs">H</td><td className="px-4 py-2">Toggle hitsounds</td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">How to use the viewer</h2>
              <ol className="space-y-3 text-surface-400 text-sm leading-relaxed list-decimal list-inside">
                <li>Drag a <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">.osu</code>, <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">.osz</code>, or <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">.sm</code> file onto the converter.</li>
                <li>The audio player appears at the bottom with playback controls.</li>
                <li>Press Space or click the preview button to open the full-screen note display.</li>
                <li>Use the mouse wheel to adjust scroll speed, Ctrl+Scroll for playback rate.</li>
              </ol>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">Why preview before converting</h2>
              <p className="text-sm text-surface-400 leading-relaxed">
                Previewing lets you verify the chart looks right before exporting. Check timing accuracy, note placement, and audio sync. If something looks off, you can adjust the conversion settings and preview again.
              </p>
            </div>
          </div>

          <div className="mt-12 flex flex-col sm:flex-row gap-3">
            <Link to="/" className="px-6 py-3 rounded-xl bg-accent text-white font-medium text-sm text-center hover:bg-accent-hover transition-colors">
              Open the Converter
            </Link>
            <Link to="/osu-to-stepmania" className="px-6 py-3 rounded-xl bg-surface-800 border border-surface-700/40 text-surface-300 font-medium text-sm text-center hover:bg-surface-700 hover:text-surface-100 transition-colors">
              Convert Beatmaps
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
