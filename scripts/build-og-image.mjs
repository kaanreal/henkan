// Renders the branded 1200x630 link-preview card to public/og.png.
// Framed app-window composition: the real main-menu screenshot inside
// window chrome on a near-black page. Run with `npm run build:og`.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pkg from '@resvg/resvg-js'

const { Resvg } = pkg

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const logo = readFileSync(resolve(root, 'public/logo32.png')).toString('base64')
const shotFile = resolve(root, 'public/screenshots', process.env.SHOT || 'osu-conversion.png')
const shot = readFileSync(shotFile).toString('base64')

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="1200" height="630" viewBox="0 0 1200 630">

  <defs>
    <clipPath id="shot-clip">
      <path d="M287 118 H913 V548 A14 14 0 0 1 899 562 H301 A14 14 0 0 1 287 548 Z"/>
    </clipPath>
  </defs>

  <rect width="1200" height="630" fill="#020617"/>

  <image x="44" y="28" width="28" height="28" rx="8" href="data:image/png;base64,${logo}"/>
  <text x="84" y="47" font-family="Satoshi, 'Segoe UI', 'Yu Gothic UI', 'Microsoft YaHei', system-ui, sans-serif"
        font-size="22" font-weight="700" fill="#f1f5f9">Henkan<tspan fill="#a5b4fc"> 変換</tspan></text>

  <rect x="287" y="70" width="626" height="492" rx="14" fill="#0c1327"/>
  <path d="M287 84 A14 14 0 0 1 301 70 H899 A14 14 0 0 1 913 84 V118 H287 Z" fill="#141d36"/>
  <line x1="287" y1="118" x2="913" y2="118" stroke="rgba(255,255,255,0.06)"/>

  <circle cx="305" cy="94" r="6" fill="#ff6461"/>
  <circle cx="323" cy="94" r="6" fill="#ffbc3f"/>
  <circle cx="341" cy="94" r="6" fill="#3ecf6b"/>
  <text x="600" y="100" text-anchor="middle"
        font-family="Satoshi, 'Segoe UI', system-ui, sans-serif"
        font-size="17" font-weight="500" fill="#94a3b8">henkan</text>

  <image x="287" y="118" width="626" height="444" clip-path="url(#shot-clip)"
         href="data:image/png;base64,${shot}"/>
  <rect x="287" y="70" width="626" height="492" rx="14"
        fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="2"/>

  <text x="600" y="596" text-anchor="middle"
        font-family="Satoshi, 'Segoe UI', system-ui, sans-serif"
        font-size="24" font-weight="500" fill="#a5b4fc">henkan.app</text>
</svg>
`

const rendered = new Resvg(svg, {
  font: { loadSystemFonts: true },
  logLevel: 'error',
}).render()

const out = resolve(root, 'public/og.png')
writeFileSync(out, rendered.asPng())
console.log(`wrote ${out} (${rendered.width}x${rendered.height})`)