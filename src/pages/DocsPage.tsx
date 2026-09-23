import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { AppHeader } from '../components/Header'
import { SEO } from '../components/SEO'

type DocLink = {
  id: string
  title: string
  summary: string
}

const groups: Array<{ title: string; links: DocLink[] }> = [
  {
    title: 'Start here',
    links: [
      { id: 'overview', title: 'Overview', summary: 'What Henkan converts and what it keeps.' },
      { id: 'formats', title: 'Supported formats', summary: 'Accepted files and export types.' },
      { id: 'convert-a-map', title: 'Convert a map', summary: 'The normal conversion flow.' },
    ],
  },
  {
    title: 'Workflows',
    links: [
      { id: 'conversion-settings', title: 'Conversion settings', summary: 'Timing, rate, metadata, and output.' },
      { id: 'batch-conversion', title: 'Batch conversion', summary: 'Convert packs and Songs folders.' },
      { id: 'preview', title: 'Map preview', summary: 'Check notes and audio before export.' },
      { id: 'map-mirror', title: 'Map mirror', summary: 'Find missing maps and media.' },
      { id: 'skins', title: 'Skin conversion', summary: 'Move 4K skins between games.' },
    ],
  },
  {
    title: 'Reference',
    links: [
      { id: 'desktop-and-web', title: 'Desktop and web', summary: 'What changes between builds.' },
      { id: 'troubleshooting', title: 'Troubleshooting', summary: 'Common import and export problems.' },
    ],
  },
]

const allLinks = groups.flatMap((group) => group.links)

function InlineCode({ children }: { children: string }) {
  return <code className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[0.82em] text-surface-200">{children}</code>
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="my-6 rounded-lg border border-accent/20 bg-accent/[0.06] px-4 py-3 text-sm leading-6 text-surface-300">
      {children}
    </div>
  )
}

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <li className="relative grid grid-cols-[2rem_1fr] gap-3 pb-7 last:pb-0">
      <span className="relative z-10 grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-surface-900 text-xs font-semibold text-surface-300">
        {number}
      </span>
      <div className="pt-1">
        <h3 className="font-medium text-surface-100">{title}</h3>
        <div className="mt-1.5 text-sm leading-6 text-surface-400">{children}</div>
      </div>
    </li>
  )
}

function Search({ mobile = false }: { mobile?: boolean }) {
  const [query, setQuery] = useState('')
  const matches = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return []
    return allLinks.filter((link) => `${link.title} ${link.summary}`.toLowerCase().includes(value)).slice(0, 6)
  }, [query])

  const open = (id: string) => {
    window.history.replaceState(null, '', `#${id}`)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setQuery('')
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (matches[0]) open(matches[0].id)
  }

  return (
    <form onSubmit={submit} className={`relative ${mobile ? 'lg:hidden' : ''}`} role="search">
      <svg className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-surface-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m1.1-5.4a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
      </svg>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search documentation"
        aria-label="Search documentation"
        className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.035] pl-9 pr-3 text-xs text-surface-200 outline-none transition-colors placeholder:text-surface-600 focus:border-accent/50 focus:bg-white/[0.05]"
      />
      {query && (
        <div className="absolute left-0 right-0 top-11 z-30 overflow-hidden rounded-lg border border-white/10 bg-surface-900 p-1 shadow-2xl shadow-black/40">
          {matches.length > 0 ? matches.map((match) => (
            <button key={match.id} type="button" onClick={() => open(match.id)} className="block w-full rounded-md px-3 py-2 text-left hover:bg-white/[0.05]">
              <span className="block text-xs font-medium text-surface-200">{match.title}</span>
              <span className="mt-0.5 block text-[11px] text-surface-500">{match.summary}</span>
            </button>
          )) : (
            <p className="px-3 py-4 text-center text-xs text-surface-500">No matching section</p>
          )}
        </div>
      )}
    </form>
  )
}

export function DocsPage() {
  return (
    <div className="min-h-screen bg-surface-950 text-surface-200">
      <SEO
        title="Henkan Documentation"
        description="Learn how to convert osu!mania, Etterna, and StepMania maps and skins with Henkan."
        path="/docs"
      />
      <AppHeader />

      <div className="mx-auto grid w-full max-w-[90rem] grid-cols-[minmax(0,1fr)] lg:grid-cols-[15rem_minmax(0,52rem)] xl:grid-cols-[15rem_minmax(0,52rem)_12rem]">
        <aside className="hidden border-r border-white/[0.06] px-5 py-8 lg:block">
          <div className="sticky top-8">
            <Search />
            <nav className="mt-7 space-y-7" aria-label="Documentation">
              {groups.map((group) => (
                <div key={group.title}>
                  <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-surface-600">{group.title}</p>
                  <ul className="space-y-0.5">
                    {group.links.map((link) => (
                      <li key={link.id}>
                        <a href={`#${link.id}`} className="block rounded-md px-2 py-1.5 text-xs text-surface-400 transition-colors hover:bg-white/[0.04] hover:text-surface-200">
                          {link.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
            <Link to="/" className="mt-8 flex items-center gap-2 border-t border-white/[0.06] px-2 pt-5 text-xs text-surface-500 transition-colors hover:text-surface-200">
              <span aria-hidden="true">&#8592;</span>
              Back to converter
            </Link>
          </div>
        </aside>

        <main className="min-w-0 px-5 py-10 sm:px-8 lg:px-12 lg:py-16">
          <Search mobile />
          <details className="mt-4 rounded-lg border border-white/[0.08] bg-white/[0.025] lg:hidden">
            <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-surface-300">Browse sections</summary>
            <nav className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/[0.06] px-4 py-4" aria-label="Documentation">
              {allLinks.map((link) => <a key={link.id} href={`#${link.id}`} className="text-xs text-surface-500 hover:text-surface-200">{link.title}</a>)}
            </nav>
          </details>

          <article className="docs-content mt-10 lg:mt-0">
            <section id="overview" className="scroll-mt-8 border-b border-white/[0.07] pb-14">
              <p className="text-xs font-medium text-accent">Documentation</p>
              <h1 className="mt-3 text-4xl font-bold tracking-tight text-surface-50 sm:text-5xl">Henkan</h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-surface-400">
                Convert osu!mania, Etterna, and StepMania charts without rebuilding the map around them. Henkan keeps the parts that matter: timing changes, holds, metadata, preview points, audio, and artwork.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/" className="henkan-button rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover">Open converter</Link>
                <a href="#convert-a-map" className="rounded-lg border border-white/10 bg-white/[0.035] px-4 py-2 text-sm font-medium text-surface-300 transition-colors hover:bg-white/[0.06] hover:text-surface-100">Read the quick start</a>
              </div>
            </section>

            <section id="formats" className="scroll-mt-8 py-14">
              <p className="eyebrow">Start here</p>
              <h2>Supported formats</h2>
              <p>Henkan detects the direction from the file you open. You do not need to choose a source format first.</p>
              <div className="mt-6 overflow-hidden rounded-lg border border-white/[0.08]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-white/[0.035] text-xs text-surface-400">
                    <tr><th className="px-4 py-3 font-medium">Input</th><th className="px-4 py-3 font-medium">Output</th><th className="hidden px-4 py-3 font-medium sm:table-cell">Use it for</th></tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] text-surface-300">
                    <tr><td className="px-4 py-3"><InlineCode>.osu</InlineCode> / <InlineCode>.osz</InlineCode></td><td className="px-4 py-3"><InlineCode>.sm</InlineCode> song folder</td><td className="hidden px-4 py-3 text-surface-500 sm:table-cell">osu!mania to Etterna or StepMania</td></tr>
                    <tr><td className="px-4 py-3"><InlineCode>.sm</InlineCode></td><td className="px-4 py-3"><InlineCode>.osu</InlineCode> / <InlineCode>.osz</InlineCode></td><td className="hidden px-4 py-3 text-surface-500 sm:table-cell">Etterna or StepMania to osu!mania</td></tr>
                    <tr><td className="px-4 py-3"><InlineCode>.osk</InlineCode> / <InlineCode>.zip</InlineCode></td><td className="px-4 py-3">noteskin archive</td><td className="hidden px-4 py-3 text-surface-500 sm:table-cell">4K gameplay skin conversion</td></tr>
                  </tbody>
                </table>
              </div>
              <Callout>Henkan converts mania charts. Standard osu! maps are not turned into mania charts automatically.</Callout>
            </section>

            <section id="convert-a-map" className="scroll-mt-8 py-14">
              <p className="eyebrow">Quick start</p>
              <h2>Convert a map</h2>
              <ol className="relative mt-8 before:absolute before:bottom-3 before:left-4 before:top-3 before:w-px before:bg-white/[0.08]">
                <Step number={1} title="Open the source">Drop a <InlineCode>.osu</InlineCode>, <InlineCode>.osz</InlineCode>, or <InlineCode>.sm</InlineCode> onto the window. You can also click the drop area and choose one or several files.</Step>
                <Step number={2} title="Pick a difficulty">Archives and song files can contain several charts. Choose one difficulty, several of them, or all of them when Henkan asks.</Step>
                <Step number={3} title="Review the map">Check the title, artist, mapper, difficulty name, timing correction, and output format. The audio player and map preview are useful for catching a bad source file before export.</Step>
                <Step number={4} title="Convert and save">Click Convert. The desktop app asks for a destination. The web app downloads the result, using a zip when several files or media assets belong together.</Step>
              </ol>
            </section>

            <section id="conversion-settings" className="scroll-mt-8 py-14">
              <p className="eyebrow">Workflows</p>
              <h2>Conversion settings</h2>
              <p>Most maps only need a quick metadata check. These controls are there when the source needs help.</p>
              <dl className="mt-7 divide-y divide-white/[0.07] border-y border-white/[0.07]">
                <div><dt>Global timing</dt><dd>Moves the whole chart without changing the spacing between notes. Use it when every note feels early or late by the same amount.</dd></div>
                <div><dt>Conversion rate</dt><dd>Scales chart timing and audio together from 0.5x to 3.0x when converting Etterna charts to osu!mania.</dd></div>
                <div><dt>Preserve pitch</dt><dd>Changes the audio duration without raising or lowering the song's pitch. Re-encoded audio keeps the detected source bitrate when possible.</dd></div>
                <div><dt>Difficulty name template</dt><dd>Builds consistent names from map metadata and rate values, which is handy for packs with many charts.</dd></div>
                <div><dt>Output format</dt><dd>Etterna exports use a song folder. osu!mania exports can be a plain <InlineCode>.osu</InlineCode> file or a complete <InlineCode>.osz</InlineCode> package.</dd></div>
              </dl>
              <Callout>Fix timing mistakes in the source map when you can. Global timing is for a consistent offset, not for repairing individual unsnapped notes.</Callout>
            </section>

            <section id="batch-conversion" className="scroll-mt-8 py-14">
              <p className="eyebrow">Workflows</p>
              <h2>Batch conversion</h2>
              <p>Use a folder when you want to move a pack or an osu! Songs library instead of opening maps one by one.</p>
              <ul>
                <li>Drop an Etterna or StepMania pack folder to scan its <InlineCode>.sm</InlineCode> files.</li>
                <li>Drop an osu! Songs folder to find beatmap sets below it.</li>
                <li>Select individual difficulties, whole songs, or everything in the pack.</li>
                <li>Review pack-wide settings before the conversion starts.</li>
              </ul>
              <p>The desktop app can write a folder tree directly. In the browser, Henkan prepares a downloadable archive instead.</p>
              <div className="mt-7 overflow-hidden rounded-lg border border-white/[0.08] bg-black/20">
                <img src="/screenshots/pack-conversion.png" alt="Henkan pack browser with several maps selected for conversion" className="w-full" loading="lazy" />
              </div>
            </section>

            <section id="preview" className="scroll-mt-8 py-14">
              <p className="eyebrow">Workflows</p>
              <h2>Map preview</h2>
              <p>The preview uses the loaded chart and audio, so it is the quickest place to check note placement, holds, timing changes, and sync.</p>
              <div className="mt-6 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                {[
                  ['Space', 'Open the preview or play'], ['Esc', 'Close the preview'], ['Right-click', 'Play or pause'], ['Scroll', 'Change the visible look-ahead'],
                  ['Ctrl + Scroll', 'Change playback rate'], ['Alt + Scroll', 'Change volume'], ['Tab', 'Set the preview point'], ['H', 'Toggle hitsounds'],
                ].map(([key, action]) => (
                  <div key={key} className="flex items-center justify-between gap-4 border-b border-white/[0.06] py-2.5 text-sm">
                    <kbd className="font-mono text-xs text-surface-300">{key}</kbd>
                    <span className="text-right text-surface-500">{action}</span>
                  </div>
                ))}
              </div>
            </section>

            <section id="map-mirror" className="scroll-mt-8 py-14">
              <p className="eyebrow">Workflows</p>
              <h2>Map mirror</h2>
              <p>Open Map Mirror from the converter when you need a beatmap set that is not already on disk. Search results can be filtered by key mode and status, then downloaded straight into the conversion queue.</p>
              <p>If you open a lone <InlineCode>.osu</InlineCode> without its audio or background, the desktop app can look up the matching set and asks before downloading the missing media.</p>
              <Link to="/?tool=mirror" className="mt-5 inline-flex text-sm font-medium text-accent-muted hover:text-accent">Open Map Mirror <span className="ml-1" aria-hidden="true">&#8594;</span></Link>
            </section>

            <section id="skins" className="scroll-mt-8 py-14">
              <p className="eyebrow">Workflows</p>
              <h2>Skin conversion</h2>
              <p>Henkan can convert the 4K gameplay part of an osu!mania skin into an Etterna noteskin, and can build an osu! skin from a compatible Etterna noteskin.</p>
              <ul>
                <li>Open an <InlineCode>.osk</InlineCode>, <InlineCode>.zip</InlineCode>, or skin folder.</li>
                <li>Check the four-lane preview and adjust the hit position if needed.</li>
                <li>Export the converted archive and install it in the target game.</li>
              </ul>
              <Callout>Menus, sounds, cursors, and non-gameplay skin elements are outside this converter. The output focuses on the playable 4K lane assets.</Callout>
              <Link to="/skin-converter" className="inline-flex text-sm font-medium text-accent-muted hover:text-accent">Open skin converter <span className="ml-1" aria-hidden="true">&#8594;</span></Link>
            </section>

            <section id="desktop-and-web" className="scroll-mt-8 py-14">
              <p className="eyebrow">Reference</p>
              <h2>Desktop and web</h2>
              <p>Both builds use the same conversion core. The difference is how much access Henkan has to your local game folders and filesystem.</p>
              <div className="mt-7 grid gap-5 sm:grid-cols-2">
                <div className="rounded-lg border border-white/[0.08] p-5"><h3>Desktop app</h3><p>Folder scanning, native save dialogs, osu! library access, live map detection, direct folder exports, and opening exported files in Explorer.</p></div>
                <div className="rounded-lg border border-white/[0.08] p-5"><h3>Web app</h3><p>File and archive conversion in the browser. Multi-file results are packaged for download because a browser cannot write directly into your game folders.</p></div>
              </div>
            </section>

            <section id="troubleshooting" className="scroll-mt-8 py-14">
              <p className="eyebrow">Reference</p>
              <h2>Troubleshooting</h2>
              <div className="mt-7 space-y-8">
                <div><h3>No beatmaps were found</h3><p>Choose the pack folder or osu! Songs folder itself. Henkan looks below that folder for <InlineCode>.sm</InlineCode> and <InlineCode>.osu</InlineCode> files.</p></div>
                <div><h3>Audio or artwork is missing</h3><p>A plain <InlineCode>.osu</InlineCode> only contains chart data. Keep its referenced media beside it, use the original <InlineCode>.osz</InlineCode>, or allow the desktop app to fetch the matching set when prompted.</p></div>
                <div><h3>The map is early or late</h3><p>Preview a few sections first. If the offset is consistent, change Global timing. If it drifts or only some notes are wrong, repair the source timing instead.</p></div>
                <div><h3>Different difficulties use different audio</h3><p>Export them as separate songs. Combining them would attach the wrong audio to at least one chart, so Henkan warns before continuing.</p></div>
                <div><h3>A skin archive is rejected</h3><p>Make sure it contains a readable osu!mania or Etterna 4K gameplay skin. General-purpose archives without lane and note assets are not treated as skins.</p></div>
                <div><h3>The browser did not save a folder</h3><p>Browser builds download files or zip archives. Use the desktop app when you need direct folder output or access to an installed game library.</p></div>
              </div>
              <div className="mt-10 flex flex-wrap gap-3">
                <a href="https://github.com/kaanreal/henkan/issues" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-white/10 bg-white/[0.035] px-4 py-2 text-sm font-medium text-surface-300 transition-colors hover:bg-white/[0.06] hover:text-surface-100">Report a problem</a>
              <Link to="/" className="henkan-button rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover">Back to converter</Link>
              </div>
            </section>
          </article>
        </main>

        <aside className="hidden px-5 py-16 xl:block">
          <nav className="sticky top-8" aria-label="On this page">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-surface-600">On this page</p>
            <ul className="space-y-2 text-[11px] text-surface-500">
              {allLinks.map((link) => <li key={link.id}><a href={`#${link.id}`} className="transition-colors hover:text-surface-200">{link.title}</a></li>)}
            </ul>
          </nav>
        </aside>
      </div>
    </div>
  )
}
