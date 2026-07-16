import { Link } from 'react-router'
import { SEO } from '../components/SEO'
import { SiteHeader, SiteFooter } from '../components/SiteLayout'

export function ConvertPage() {
  return (
    <div className="min-h-screen bg-surface-950 text-surface-200 flex flex-col">
      <SEO
        title="osu!mania to StepMania Converter - Convert Beatmaps Between Formats"
        description="Convert osu!mania beatmaps to Etterna and StepMania format, and vice versa. Millisecond-accurate timing with BPM changes preserved."
        path="/osu-to-stepmania"
      />
      <SiteHeader />

      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-12">
          <p className="text-xs font-medium text-accent tracking-widest uppercase mb-3">Bidirectional Converter</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-surface-100 leading-tight mb-4">
            osu!mania &lt;-&gt; Etterna Converter
          </h1>
          <p className="text-lg text-surface-400 leading-relaxed max-w-2xl">
            Convert beatmaps between osu!mania and Etterna/StepMania. Drop a <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">.osu</code>, <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">.osz</code>, or <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">.sm</code> file and it just works.
          </p>
        </section>

        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
          <div className="rounded-2xl overflow-hidden border border-surface-800/50 mb-12">
            <img src="/screenshots/main-menu.png" alt="Henkan main interface showing the converter with metadata panel, audio player, and drop zone" className="w-full" />
          </div>

          <div className="space-y-10">
            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">What it converts</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-surface-900/50 border border-surface-800/50 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-surface-200 mb-1">osu!mania to Etterna</h3>
                  <p className="text-xs text-surface-500">Convert <code>.osu</code> and <code>.osz</code> files to Etterna <code>.sm</code> format. Timing, holds, and BPM changes are all preserved.</p>
                </div>
                <div className="bg-surface-900/50 border border-surface-800/50 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-surface-200 mb-1">Etterna to osu!mania</h3>
                  <p className="text-xs text-surface-500">Convert <code>.sm</code> files to osu!mania <code>.osu</code> format. Includes rate/pitch conversion and metadata mapping.</p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">Key features</h2>
              <ul className="space-y-2 text-sm text-surface-400">
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><strong className="text-surface-200">Millisecond-accurate timing</strong> - BPM changes are preserved, not flattened.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><strong className="text-surface-200">Full metadata mapping</strong> - Title, artist, creator, difficulty, preview point, background, and more.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><strong className="text-surface-200">Hold/long notes</strong> - Start and end times translated correctly between formats.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><strong className="text-surface-200">Multiple difficulties</strong> - Select and convert individual or all difficulties from a beatmap set.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-accent mt-0.5">&#10003;</span>
                  <span><strong className="text-surface-200">Rate conversion</strong> - Adjust playback rate from 0.5x to 3.0x with optional pitch preservation.</span>
                </li>
              </ul>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">Built-in beatmap search</h2>
              <p className="text-sm text-surface-400 leading-relaxed">
                Search and download osu!mania beatmaps directly from within the converter using the built-in mirror integration. Filter by key mode, rank status, and more. One-click download puts the beatmap straight into the conversion queue.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">Preview before you convert</h2>
              <p className="text-sm text-surface-400 leading-relaxed">
                The built-in preview player renders notes on a canvas with hitsound playback. Scroll through the chart, adjust playback rate, and set the preview point before exporting.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">Cross-platform</h2>
              <p className="text-sm text-surface-400 leading-relaxed">
                Use the web version in your browser, or download the desktop app for native performance. Available on macOS (Homebrew), Windows (Winget, Chocolatey), and Linux (AUR).
              </p>
            </div>
          </div>

          <div className="mt-12 flex flex-col sm:flex-row gap-3">
            <Link to="/" className="px-6 py-3 rounded-xl bg-accent text-white font-medium text-sm text-center hover:bg-accent-hover transition-colors">
              Open the Converter
            </Link>
            <Link to="/osu-mania-pack-creator" className="px-6 py-3 rounded-xl bg-surface-800 border border-surface-700/40 text-surface-300 font-medium text-sm text-center hover:bg-surface-700 hover:text-surface-100 transition-colors">
              Batch Convert Packs
            </Link>
            <Link to="/how-to-convert-osu-mania-to-stepmania" className="px-6 py-3 rounded-xl bg-surface-800 border border-surface-700/40 text-surface-300 font-medium text-sm text-center hover:bg-surface-700 hover:text-surface-100 transition-colors">
              Conversion Guide
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
