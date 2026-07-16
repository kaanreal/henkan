import { Link } from 'react-router'
import { SEO } from '../components/SEO'
import { SiteHeader, SiteFooter } from '../components/SiteLayout'

export function ConversionGuide() {
  return (
    <div className="min-h-screen bg-surface-950 text-surface-200 flex flex-col">
      <SEO
        title="How to Convert osu!mania to StepMania - Complete Guide"
        description="Step-by-step guide to converting osu!mania beatmaps to Etterna and StepMania format using Henkan. Covers batch conversion, pack handling, and troubleshooting."
        path="/how-to-convert-osu-mania-to-stepmania"
      />
      <SiteHeader />

      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-12">
          <p className="text-xs font-medium text-accent tracking-widest uppercase mb-3">Guide</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-surface-100 leading-tight mb-4">
            How to Convert osu!mania to StepMania
          </h1>
          <p className="text-lg text-surface-400 leading-relaxed max-w-2xl">
            A complete guide to converting osu!mania beatmaps to Etterna and StepMania format using Henkan.
          </p>
        </section>

        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 space-y-10">
          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">Single file conversion</h2>
            <ol className="space-y-3 text-surface-400 text-sm leading-relaxed list-decimal list-inside">
              <li>Drag a <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">.osu</code> file onto the converter, or use the file picker.</li>
              <li>Henkan parses the beatmap and shows the metadata panel with title, artist, difficulty, and timing info.</li>
              <li>Adjust settings if needed - creator name, HP drain, overall difficulty, output format.</li>
              <li>Click <strong className="text-surface-200">Convert</strong> and choose where to save the <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">.sm</code> file.</li>
              <li>Drop the exported <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">.sm</code> file and audio into your Etterna Songs folder.</li>
            </ol>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">OSZ archive conversion</h2>
            <p className="text-sm text-surface-400 leading-relaxed mb-3">
              An <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">.osz</code> file contains multiple difficulties and media files. Henkan handles them automatically:
            </p>
            <ol className="space-y-3 text-surface-400 text-sm leading-relaxed list-decimal list-inside">
              <li>Drag the <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">.osz</code> file onto the converter.</li>
              <li>Select which difficulties to convert from the list.</li>
              <li>If difficulties have different audio files, Henkan warns you and offers to export as separate songs or combine them.</li>
              <li>Export as individual <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">.sm</code> files or as a single archive.</li>
            </ol>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">Batch conversion with pack browser</h2>
            <p className="text-sm text-surface-400 leading-relaxed mb-3">
              Convert many beatmaps at once using the pack browser:
            </p>
            <ol className="space-y-3 text-surface-400 text-sm leading-relaxed list-decimal list-inside">
              <li>Drag your osu! Songs folder onto the converter. Henkan scans all subfolders for <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">.osu</code> files.</li>
              <li>Browse all songs with thumbnail cards. Select the ones you want to convert.</li>
              <li>Click <strong className="text-surface-200">Convert</strong> and configure batch settings - creator name, HP drain, output format.</li>
              <li>Henkan converts all selected songs and exports them as a single <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">.osz</code> file.</li>
            </ol>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">Reverse direction: Etterna to osu!mania</h2>
            <p className="text-sm text-surface-400 leading-relaxed">
              Henkan also converts Etterna <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">.sm</code> files to osu!mania <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">.osu</code> format. Drop an <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">.sm</code> file and switch the direction to "Etterna to osu!mania". You can also adjust the conversion rate from 0.5x to 3.0x with optional pitch preservation.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">What gets preserved</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="bg-surface-900/50 border border-surface-800/50 rounded-xl p-4">
                <h3 className="text-sm font-medium text-surface-200 mb-1">Timing</h3>
                <p className="text-xs text-surface-500">Millisecond-accurate timing with BPM changes preserved. No flattening.</p>
              </div>
              <div className="bg-surface-900/50 border border-surface-800/50 rounded-xl p-4">
                <h3 className="text-sm font-medium text-surface-200 mb-1">Holds</h3>
                <p className="text-xs text-surface-500">Long note start and end times translated correctly between formats.</p>
              </div>
              <div className="bg-surface-900/50 border border-surface-800/50 rounded-xl p-4">
                <h3 className="text-sm font-medium text-surface-200 mb-1">Metadata</h3>
                <p className="text-xs text-surface-500">Title, artist, creator, difficulty name, preview point, background, source, tags.</p>
              </div>
              <div className="bg-surface-900/50 border border-surface-800/50 rounded-xl p-4">
                <h3 className="text-sm font-medium text-surface-200 mb-1">Media</h3>
                <p className="text-xs text-surface-500">Audio files and background images are included in the export.</p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">Troubleshooting</h2>
            <ul className="space-y-3 text-sm text-surface-400">
              <li>
                <strong className="text-surface-200">Timing feels off after conversion</strong>
                <p className="mt-1">Henkan preserves exact timing. If it feels off, the original map may have had timing issues. Check the timing points in the osu! editor.</p>
              </li>
              <li>
                <strong className="text-surface-200">Audio doesn't play in Etterna</strong>
                <p className="mt-1">Make sure the audio file is in the same folder as the <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">.sm</code> file and the filename matches what's in the <code className="text-surface-300 bg-surface-800/50 px-1.5 py-0.5 rounded text-xs">#AUDIOFILE</code> line.</p>
              </li>
              <li>
                <strong className="text-surface-200">Background image is missing</strong>
                <p className="mt-1">Check that the background file is included in the export. Henkan copies it automatically, but some beatmaps reference backgrounds by relative path.</p>
              </li>
            </ul>
          </div>

          <div className="mt-8 p-6 bg-surface-900/50 border border-surface-800/50 rounded-xl">
            <h3 className="text-base font-semibold text-surface-100 mb-2">Ready to convert?</h3>
            <p className="text-sm text-surface-400 leading-relaxed mb-4">
              Open Henkan and drop your first beatmap. The converter handles everything automatically.
            </p>
            <Link to="/" className="inline-block px-5 py-2 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent-hover transition-colors">
              Open the Converter
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
