import { Link } from 'react-router'
import { SEO } from '../components/SEO'
import { SiteHeader, SiteFooter } from '../components/SiteLayout'

export function MappingGuide() {
  return (
    <div className="min-h-screen bg-surface-950 text-surface-200 flex flex-col">
      <SEO
        title="How to Make an osu!mania Map - Beginner's Guide"
        description="Step-by-step guide to creating osu!mania beatmaps. Learn timing, note placement, holds, metadata, and how to convert your maps to Etterna format."
        path="/how-to-make-an-osu-mania-map"
      />
      <SiteHeader />

      <main className="flex-1">
        <section className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-12">
          <p className="text-xs font-medium text-accent tracking-widest uppercase mb-3">Guide</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-surface-100 leading-tight mb-4">
            How to Make an osu!mania Map
          </h1>
          <p className="text-lg text-surface-400 leading-relaxed max-w-2xl">
            A practical guide to creating osu!mania beatmaps from scratch. Covers timing, note placement, holds, and metadata setup.
          </p>
        </section>

        <section className="max-w-3xl mx-auto px-4 sm:px-6 pb-16 space-y-10">
          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">1. Get the right tools</h2>
            <p className="text-sm text-surface-400 leading-relaxed mb-3">
              You need an audio editor and a beatmap editor. The osu! editor has a built-in mania mode, but many mappers prefer dedicated tools.
            </p>
            <ul className="space-y-1.5 text-sm text-surface-400 list-disc list-inside">
              <li><strong className="text-surface-200">osu! editor</strong> - Built into the game. Good for beginners. Switch the mode to osu!mania in the editor settings.</li>
              <li><strong className="text-surface-200">Audio editor</strong> - Audacity (free) for trimming audio and setting the exact BPM.</li>
              <li><strong className="text-surface-200">Henkan</strong> - Convert your finished maps to Etterna format to share with StepMania players.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">2. Set the timing correctly</h2>
            <p className="text-sm text-surface-400 leading-relaxed">
              Timing is the most critical part of a beatmap. If the timing is off, the entire chart feels wrong. Use a BPM tapper or audio analysis to find the exact BPM. In the osu! editor, place timing points at the start of each measure. If the song has BPM changes, add new uninherited timing points at each change.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">3. Place notes</h2>
            <p className="text-sm text-surface-400 leading-relaxed mb-3">
              Start by mapping the main rhythm - the kick drum, snare, or melody line. Build complexity gradually through the song. Common patterns:
            </p>
            <ul className="space-y-1.5 text-sm text-surface-400 list-disc list-inside">
              <li><strong className="text-surface-200">Jack</strong> - Same column repeated (111 pattern). Good for emphasis.</li>
              <li><strong className="text-surface-200">Trill</strong> - Alternating two columns (1212 pattern). Smooth and flowing.</li>
              <li><strong className="text-surface-200">Staircase</strong> - Sequential columns (1234 pattern). Good for fast passages.</li>
              <li><strong className="text-surface-200">Chord</strong> - Multiple columns at once. Use for strong beats or breaks.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">4. Add holds (long notes)</h2>
            <p className="text-sm text-surface-400 leading-relaxed">
              Hold notes in osu!mania have a start time and end time. Place them on sustained sounds - vocal notes, basslines, or pads. Make sure the hold starts and ends on a beat or sub-beat for clean timing. Avoid short holds (under 1/4 beat) as they feel awkward to play.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">5. Set metadata</h2>
            <p className="text-sm text-surface-400 leading-relaxed mb-3">
              Complete metadata before submitting. The editor requires:
            </p>
            <ul className="space-y-1.5 text-sm text-surface-400 list-disc list-inside">
              <li>Title and Artist</li>
              <li>Creator name (your username)</li>
              <li>Difficulty name</li>
              <li>Audio filename and preview time</li>
              <li>Background image</li>
              <li>Source (game or anime the song is from)</li>
              <li>Tags (for searchability)</li>
            </ul>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-3">6. Test and submit</h2>
            <p className="text-sm text-surface-400 leading-relaxed">
              Playtest your chart multiple times. Check for awkward patterns, timing issues, and visual clarity. After testing, submit to the osu! beatmap submission system. Once ranked, use Henkan to convert your map to Etterna format and share it with the StepMania community.
            </p>
          </div>

          <div className="mt-8 p-6 bg-surface-900/50 border border-surface-800/50 rounded-xl">
            <h3 className="text-base font-semibold text-surface-100 mb-2">Convert your maps with Henkan</h3>
            <p className="text-sm text-surface-400 leading-relaxed mb-4">
              Once your osu!mania map is ready, use Henkan to convert it to Etterna format. The converter preserves your timing, holds, and metadata exactly.
            </p>
            <Link to="/osu-to-stepmania" className="inline-block px-5 py-2 rounded-xl bg-accent text-white font-medium text-sm hover:bg-accent-hover transition-colors">
              Open the Converter
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
