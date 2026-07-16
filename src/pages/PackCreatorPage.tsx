import { Link } from 'react-router'
import { SEO } from '../components/SEO'
import { SiteHeader, SiteFooter } from '../components/SiteLayout'

export function PackCreatorPage() {
  return (
    <div className="min-h-screen bg-surface-950 text-surface-200 flex flex-col">
      <SEO
        title="osu!mania Pack Creator - Batch Convert Beatmap Packs"
        description="Create osu!mania packs from Etterna and StepMania beatmaps. Batch convert entire packs, customize metadata, and export as .osz or folder structure."
        path="/osu-mania-pack-creator"
      />
      <SiteHeader />

      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-12">
          <p className="text-xs font-medium text-accent tracking-widest uppercase mb-3">Pack Creator</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-surface-100 leading-tight mb-4">
            osu!mania Pack Creator
          </h1>
          <p className="text-lg text-surface-400 leading-relaxed max-w-2xl">
            Convert entire Etterna and StepMania packs to osu!mania format in one go.
            Drop a pack folder, select the songs you want, and export them all at once.
          </p>
        </section>

        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16">
          <div className="rounded-2xl overflow-hidden border border-surface-800/50 mb-12">
            <img src="/screenshots/pack-conversion.png" alt="Henkan pack conversion interface showing a list of beatmaps with thumbnails and selection checkboxes" className="w-full" />
          </div>

          <div className="space-y-10">
            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">How it works</h2>
              <ol className="space-y-3 text-surface-400 text-sm leading-relaxed list-decimal list-inside">
                <li>Drag an Etterna pack folder (containing <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">.sm</code> files) or an osu! Songs folder onto the converter.</li>
                <li>Browse all songs in the pack with thumbnail cards and difficulty info.</li>
                <li>Select individual songs or convert the entire pack at once.</li>
                <li>Customize creator name, HP drain, and overall difficulty per song.</li>
                <li>Export as a single <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">.osz</code> file or as a folder structure.</li>
              </ol>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">Supported pack types</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-surface-900/50 border border-surface-800/50 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-surface-200 mb-1">Etterna / StepMania packs</h3>
                  <p className="text-xs text-surface-500">Drop a folder containing <code>.sm</code> files. Henkan detects the pack structure, loads banner images, and preserves all metadata.</p>
                </div>
                <div className="bg-surface-900/50 border border-surface-800/50 rounded-xl p-4">
                  <h3 className="text-sm font-medium text-surface-200 mb-1">osu! Songs folders</h3>
                  <p className="text-xs text-surface-500">Drop your osu! Songs folder to browse and batch convert <code>.osu</code> files to Etterna <code>.sm</code> format.</p>
                </div>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">Pack banner support</h2>
              <p className="text-sm text-surface-400 leading-relaxed">
                Henkan automatically detects and displays pack banner images. When exporting, banners are included in the output so your packs look right in Etterna.
              </p>
            </div>

            <div>
              <h2 className="text-xl font-semibold text-surface-100 mb-2">Why use Henkan for pack conversion</h2>
              <p className="text-sm text-surface-400 leading-relaxed">
                Other converters flatten BPM changes and mess up timing. Henkan preserves millisecond-accurate timing, holds, BPM changes, and all metadata across formats. The pack browser gives you full control over which songs to convert and how to configure them.
              </p>
            </div>
          </div>

          <div className="mt-12 flex flex-col sm:flex-row gap-3">
            <Link to="/" className="px-6 py-3 rounded-xl bg-accent text-white font-medium text-sm text-center hover:bg-accent-hover transition-colors">
              Open the Converter
            </Link>
            <Link to="/how-to-convert-osu-mania-to-stepmania" className="px-6 py-3 rounded-xl bg-surface-800 border border-surface-700/40 text-surface-300 font-medium text-sm text-center hover:bg-surface-700 hover:text-surface-100 transition-colors">
              Read the Conversion Guide
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
