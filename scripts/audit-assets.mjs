import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { decode } from 'fast-png'

const root = resolve(import.meta.dirname, '..')
const failures = []

function check(condition, message) {
  if (!condition) failures.push(message)
}

function png(path, width, height, { alpha = true } = {}) {
  const file = resolve(root, path)
  try {
    const image = decode(readFileSync(file))
    check(image.width === width && image.height === height, `${path}: expected ${width}x${height}, got ${image.width}x${image.height}`)
    if (alpha) check(image.channels === 4, `${path}: expected an RGBA PNG`)
  } catch (error) {
    failures.push(`${path}: ${error.message}`)
  }
}

png('public/og.png', 1731, 909, { alpha: false })
png('public/logo.png', 1254, 1254)
png('public/logo32.png', 32, 32)
png('public/apple-touch-icon.png', 180, 180, { alpha: false })

for (const [name, size] of [
  ['32x32.png', 32],
  ['64x64.png', 64],
  ['128x128.png', 128],
  ['128x128@2x.png', 256],
  ['icon.png', 512],
]) png(`src-tauri/icons/${name}`, size, size)

for (const size of [30, 44, 71, 89, 107, 142, 150, 284, 310]) {
  png(`src-tauri/icons/Square${size}x${size}Logo.png`, size, size)
}
png('src-tauri/icons/StoreLogo.png', 50, 50)

// These are Tauri 2's generated dimensions (the hdpi launcher is intentionally 49px).
const android = { mdpi: [48, 108], hdpi: [49, 162], xhdpi: [96, 216], xxhdpi: [144, 324], xxxhdpi: [192, 432] }
for (const [density, [launcher, foreground]] of Object.entries(android)) {
  png(`src-tauri/icons/android/mipmap-${density}/ic_launcher.png`, launcher, launcher)
  png(`src-tauri/icons/android/mipmap-${density}/ic_launcher_round.png`, launcher, launcher)
  png(`src-tauri/icons/android/mipmap-${density}/ic_launcher_foreground.png`, foreground, foreground)
}

const ios = [
  ['AppIcon-20x20@1x.png', 20], ['AppIcon-20x20@2x.png', 40], ['AppIcon-20x20@2x-1.png', 40], ['AppIcon-20x20@3x.png', 60],
  ['AppIcon-29x29@1x.png', 29], ['AppIcon-29x29@2x.png', 58], ['AppIcon-29x29@2x-1.png', 58], ['AppIcon-29x29@3x.png', 87],
  ['AppIcon-40x40@1x.png', 40], ['AppIcon-40x40@2x.png', 80], ['AppIcon-40x40@2x-1.png', 80], ['AppIcon-40x40@3x.png', 120],
  ['AppIcon-60x60@2x.png', 120], ['AppIcon-60x60@3x.png', 180], ['AppIcon-76x76@1x.png', 76], ['AppIcon-76x76@2x.png', 152],
  ['AppIcon-83.5x83.5@2x.png', 167], ['AppIcon-512@2x.png', 1024],
]
for (const [name, size] of ios) png(`src-tauri/icons/ios/${name}`, size, size, { alpha: false })

try {
  const ico = readFileSync(resolve(root, 'src-tauri/icons/icon.ico'))
  const count = ico.readUInt16LE(4)
  const sizes = new Set()
  for (let i = 0; i < count; i++) {
    const offset = 6 + i * 16
    sizes.add(ico[offset] || 256)
  }
  for (const size of [16, 24, 32, 48, 64, 256]) check(sizes.has(size), `icon.ico: missing ${size}px layer`)
} catch (error) {
  failures.push(`src-tauri/icons/icon.ico: ${error.message}`)
}

try {
  const icns = readFileSync(resolve(root, 'src-tauri/icons/icon.icns'))
  check(icns.subarray(0, 4).toString() === 'icns', 'icon.icns: invalid header')
  check(icns.readUInt32BE(4) === icns.length, 'icon.icns: incorrect container length')
} catch (error) {
  failures.push(`src-tauri/icons/icon.icns: ${error.message}`)
}

const html = readFileSync(resolve(root, 'index.html'), 'utf8')
check(html.includes('og:image:width" content="1731"'), 'index.html: OG width does not match public/og.png')
check(html.includes('og:image:height" content="909"'), 'index.html: OG height does not match public/og.png')
check(html.includes('https://henkan.kaanreal.me/og.png'), 'index.html: OG URL must use the live canonical domain')

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log('asset audit passed: web, desktop, mobile, and store icons')
