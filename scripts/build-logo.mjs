// Derives the small raster assets from the master public/logo.png:
//   - public/logo32.png: 32px box-average downscale (legacy + OG image source)
//   - public/favicon.svg: transparent PNG embed of the emblem (48px)
//   - public/apple-touch-icon.png: 180px opaque icon for iOS home screens
// The master stays untouched. Run with `npm run build:logo`.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { decode, encode } from 'fast-png'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const master = resolve(root, 'public/logo.png')

const { width: sw, height: sh, data } = decode(readFileSync(master))

// Box-average downscale: each destination pixel averages its source region.
// Smooths away shimmer when the detail-heavy 1254px emblem shrinks to 32px.
function downscale(dw, dh) {
  const out = new Uint8Array(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor((y * sh) / dh)
    const y1 = Math.max(y0, Math.floor(((y + 1) * sh) / dh) - 1)
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor((x * sw) / dw)
      const x1 = Math.max(x0, Math.floor(((x + 1) * sw) / dw) - 1)
      const o = (y * dw + x) * 4
      let n = 0
      const acc = [0, 0, 0, 0]
      for (let sy = y0; sy <= y1; sy++) {
        for (let sx = x0; sx <= x1; sx++) {
          const i = (sy * sw + sx) * 4
          acc[0] += data[i]
          acc[1] += data[i + 1]
          acc[2] += data[i + 2]
          acc[3] += data[i + 3]
          n++
        }
      }
      out[o] = acc[0] / n
      out[o + 1] = acc[1] / n
      out[o + 2] = acc[2] / n
      out[o + 3] = acc[3] / n
    }
  }
  return out
}

const img32 = downscale(32, 32)
writeFileSync(resolve(root, 'public/logo32.png'), new Uint8Array(encode({ width: 32, height: 32, data: img32 })))

const img48 = downscale(48, 48)
const b64 = Buffer.from(encode({ width: 48, height: 48, data: img48 })).toString('base64')
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><image href="data:image/png;base64,${b64}"/></svg>`
writeFileSync(resolve(root, 'public/favicon.svg'), favicon)

// Apple recommends an opaque 180px touch icon. Composite the transparent
// emblem over Henkan's app background so iOS never substitutes a black fill.
const touch = downscale(180, 180)
for (let i = 0; i < touch.length; i += 4) {
  const alpha = touch[i + 3] / 255
  touch[i] = Math.round(touch[i] * alpha + 2 * (1 - alpha))
  touch[i + 1] = Math.round(touch[i + 1] * alpha + 6 * (1 - alpha))
  touch[i + 2] = Math.round(touch[i + 2] * alpha + 23 * (1 - alpha))
  touch[i + 3] = 255
}
writeFileSync(
  resolve(root, 'public/apple-touch-icon.png'),
  new Uint8Array(encode({ width: 180, height: 180, data: touch })),
)

console.log('wrote favicon, 32px logo, and 180px Apple touch icon')
