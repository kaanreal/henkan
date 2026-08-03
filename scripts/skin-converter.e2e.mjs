import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { copyFile, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, relative } from 'node:path'
import JSZip from 'jszip'

const PNG = await readFile(join(process.cwd(), 'public', 'logo32.png'))
const workspace = await mkdtemp(join(tmpdir(), 'henkan-skin-e2e-'))
const downloads = join(workspace, 'downloads')
const profile = join(workspace, 'edge-profile')
const osuPath = join(workspace, 'Fixture.osk')
const etternaPath = join(workspace, 'FixtureEtterna.zip')
const realOsuPath = join(workspace, 'RealOsu.osk')
const realEtternaPath = join(workspace, "Kori'sPick.zip")
const realClairPath = join(workspace, 'RealClair.zip')
const realMyukaPath = join(workspace, 'RealMyuka.zip')
const realHamsterPath = join(workspace, '--] hamster kombat edition.osk')
const realColorChangingPath = join(workspace, 'idk color changing.osk')
const realSheepPath = join(workspace, "sheepex_'s gay girls skin.osk")
const realTekkitoPath = join(workspace, '# - tekkito2 ft jb the voice tu perfume a chanel.osk')
const realOsuSource = 'C:\\STUFF\\osu!\\Skins\\f8wq pro gamer catgirl skin'
const realEtternaSource = "C:\\STUFF\\Etterna\\NoteSkins\\dance\\Kori'sPick"
const realClairSource = 'C:\\STUFF\\Etterna\\NoteSkins\\dance\\clairpis'
const realMyukaSource = 'C:\\STUFF\\Etterna\\NoteSkins\\dance\\myuka'
const realHamsterSource = 'C:\\STUFF\\osu!\\Skins\\--] hamster kombat edition'
const realColorChangingSource = 'C:\\STUFF\\osu!\\Skins\\idk color changing'
const realSheepSource = "C:\\STUFF\\osu!\\Skins\\sheepex_'s gay girls skin"
const realTekkitoSource = 'C:\\Users\\Kaan\\Downloads\\# - tekkito2 ft jb the voice tu perfume a chanel'
const appUrl = 'http://127.0.0.1:4178/skin-converter'
const debugPort = 9338

async function makeFixtures() {
  const osu = new JSZip()
  osu.file('skin.ini', `[General]\nName: Fixture\nAuthor: Henkan test\nVersion: 2.5\n\n[Mania]\nKeys: 4\nColumnWidth: 64,64,64,64\n${[0, 1, 2, 3].flatMap((lane) => [
    `NoteImage${lane}: note-${lane}`,
    `NoteImage${lane}H: head-${lane}`,
    `NoteImage${lane}L: body-${lane}`,
    `NoteImage${lane}T: tail-${lane}`,
    `KeyImage${lane}: key-${lane}`,
  ]).join('\n')}\n`)
  for (let lane = 0; lane < 4; lane++) {
    for (const prefix of ['note', 'head', 'body', 'tail', 'key']) osu.file(`${prefix}-${lane}.png`, PNG)
  }
  await writeFile(osuPath, await osu.generateAsync({ type: 'nodebuffer' }))

  const etterna = new JSZip()
  etterna.file('NoteSkin.lua', `local ret = ... or {}
ret.RedirTable = { Left = "Down", Down = "Down", Up = "Down", Right = "Down" }
ret.PartsToRotate = { ["Tap Note"] = true, ["Hold Head Active"] = true, ["Receptor"] = true }
ret.Rotate = { Left = 90, Down = 0, Up = 180, Right = -90 }
if string.find(sElement, "Head") then sElement = "Tap Note" end
return ret
`)
  etterna.file('metrics.ini', '[Global]\nFallbackNoteSkin=common\n')
  etterna.file('Down Tap Note.lua', 'return Def.Sprite { Texture = "_arrow" }\n')
  etterna.file('Down Receptor.lua', 'return Def.Sprite { Texture = "_receptor" }\n')
  etterna.file('_arrow 1x8.png', PNG)
  etterna.file('_receptor.png', PNG)
  etterna.file('Down Hold Body Active.png', PNG)
  etterna.file('Down Hold BottomCap Active.png', PNG)
  await writeFile(etternaPath, await etterna.generateAsync({ type: 'nodebuffer' }))

  if (existsSync(realOsuSource)) await zipDirectory(realOsuSource, realOsuPath)
  if (existsSync(realEtternaSource)) await zipDirectory(realEtternaSource, realEtternaPath)
  if (existsSync(realClairSource)) await zipDirectory(realClairSource, realClairPath)
  if (existsSync(realMyukaSource)) await zipDirectory(realMyukaSource, realMyukaPath)
  if (existsSync(realHamsterSource)) await zipDirectory(realHamsterSource, realHamsterPath)
  if (existsSync(realColorChangingSource)) await zipDirectory(realColorChangingSource, realColorChangingPath)
  if (existsSync(realSheepSource)) await zipDirectory(realSheepSource, realSheepPath)
  if (existsSync(realTekkitoSource)) await zipDirectory(realTekkitoSource, realTekkitoPath)
}

async function zipDirectory(source, destination) {
  const archive = new JSZip()
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name)
      if (entry.isDirectory()) await walk(absolute)
      else if (entry.isFile()) archive.file(relative(source, absolute).replace(/\\/g, '/'), await readFile(absolute))
    }
  }
  await walk(source)
  await writeFile(destination, await archive.generateAsync({ type: 'nodebuffer' }))
}

function findBrowser() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ]
  return candidates.find(existsSync)
}

async function waitFor(check, label, timeout = 15_000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    try {
      const value = await check()
      if (value) return value
    } catch { /* retry until the deadline */ }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function connectCdp() {
  const pages = await waitFor(async () => {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json`)
    const entries = await response.json()
    return entries.find((entry) => entry.type === 'page' && entry.url === appUrl) ? entries : null
  }, 'browser debugging endpoint')
  const page = pages.find((entry) => entry.type === 'page' && entry.url === appUrl)
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let id = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (!message.id || !pending.has(message.id)) return
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) reject(new Error(message.error.message))
    else resolve(message.result)
  })
  return {
    call(method, params = {}) {
      return new Promise((resolve, reject) => {
        const messageId = ++id
        pending.set(messageId, { resolve, reject })
        socket.send(JSON.stringify({ id: messageId, method, params }))
      })
    },
    close() { socket.close() },
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}

async function setFile(cdp, filePath) {
  const document = await cdp.call('DOM.getDocument')
  const input = await cdp.call('DOM.querySelector', { nodeId: document.root.nodeId, selector: 'input[type=file]' })
  await cdp.call('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [filePath] })
  await evaluate(cdp, `document.querySelector('input[type=file]').dispatchEvent(new Event('change', { bubbles: true }))`)
}

async function dropEtternaFolder(cdp) {
  const pngBase64 = PNG.toString('base64')
  await evaluate(cdp, `(() => {
    const text = (name, value) => ({
      isFile: true, isDirectory: false, name,
      file(resolve) { resolve(new File([value], name, { type: 'text/plain' })) }
    })
    const binary = (name, base64) => ({
      isFile: true, isDirectory: false, name,
      file(resolve) {
        const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
        resolve(new File([bytes], name, { type: 'image/png' }))
      }
    })
    const entries = [
      text('NoteSkin.lua', 'return {}'),
      text('metrics.ini', '[Global]\\nFallbackNoteSkin=common\\n'),
      binary('Down Tap Note.png', '${pngBase64}'),
      binary('Down Receptor.png', '${pngBase64}'),
      binary('Down Hold Body Active.png', '${pngBase64}'),
      binary('Down Hold BottomCap Active.png', '${pngBase64}')
    ]
    const directory = {
      isFile: false,
      isDirectory: true,
      name: 'DroppedEtterna',
      createReader() {
        let delivered = false
        return { readEntries(resolve) { resolve(delivered ? [] : (delivered = true, entries)) } }
      }
    }
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', {
      value: { files: [], items: [{ webkitGetAsEntry: () => directory }] }
    })
    document.querySelector('.animate-app-entrance').dispatchEvent(event)
  })()`)
}

async function assertResponsive(cdp) {
  for (const width of [320, 375, 414, 768]) {
    await cdp.call('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: false })
    const layout = await evaluate(cdp, `(() => {
      const controls = [...document.querySelectorAll('.header-direction button')]
      const preview = document.querySelector('.skin-preview__stage')?.getBoundingClientRect()
      return {
        innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clippedControls: controls.filter((node) => node.scrollWidth > node.clientWidth + 1).map((node) => node.textContent.trim()),
        escapedControls: controls.filter((node) => { const box = node.getBoundingClientRect(); return box.left < 0 || box.right > innerWidth }).map((node) => node.textContent.trim()),
        previewEscapes: preview ? preview.left < 0 || preview.right > innerWidth : false,
      }
    })()`)
    if (layout.scrollWidth > layout.innerWidth || layout.clippedControls.length || layout.escapedControls.length || layout.previewEscapes) {
      throw new Error(`Responsive check failed at ${width}px: ${JSON.stringify(layout)}`)
    }
  }
  await cdp.call('Emulation.setDeviceMetricsOverride', { width: 1100, height: 750, deviceScaleFactor: 1, mobile: false })
}

async function assertPreview(cdp, expectedHitPosition = 420) {
  const preview = await waitFor(async () => evaluate(cdp, `(() => {
    const stage = document.querySelector('.skin-preview__stage')
    if (!stage) return null
    return {
      hitPosition: Number(stage.dataset.hitPosition),
      lanes: stage.querySelectorAll('.skin-preview__lane').length,
      images: stage.querySelectorAll('img').length,
      brokenImages: [...stage.querySelectorAll('img')].filter((node) => !node.complete || node.naturalWidth < 1).length,
      receptorTops: [...stage.querySelectorAll('.skin-preview__receptor')].map((node) => Math.round(node.getBoundingClientRect().top)),
      holdParts: ['tail', 'body', 'head'].map((part) => {
        const rect = stage.querySelector('.skin-preview__hold-' + part).getBoundingClientRect()
        return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), width: Math.round(rect.width) }
      }),
    }
  })()`), 'skin gameplay preview')
  const receptorSpread = Math.max(...preview.receptorTops) - Math.min(...preview.receptorTops)
  const holdWidthSpread = Math.max(...preview.holdParts.map((part) => part.width)) - Math.min(...preview.holdParts.map((part) => part.width))
  const holdHasGapOrOverlap = Math.abs(preview.holdParts[0].bottom - preview.holdParts[1].top) > 1
    || Math.abs(preview.holdParts[1].bottom - preview.holdParts[2].top) > 1
  if (preview.hitPosition !== expectedHitPosition || preview.lanes !== 4 || preview.images < 7 || preview.brokenImages
    || receptorSpread > 1 || holdWidthSpread > 1 || holdHasGapOrOverlap) {
    throw new Error(`Skin preview is incomplete: ${JSON.stringify(preview)}`)
  }
}

async function setHitPosition(cdp, value) {
  await evaluate(cdp, `(() => {
    const input = document.querySelector('[data-hit-position-input]')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, ${value})
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })()`)
  await waitFor(async () => evaluate(cdp, `document.querySelector('.skin-preview__stage')?.dataset.hitPosition === '${value}'`), 'updated hit position preview')
}

async function waitForReport(cdp, expectedName) {
  const state = await waitFor(async () => evaluate(cdp, `(() => {
    const error = document.querySelector('.skin-error')?.textContent || ''
    const title = document.querySelector('.skin-report__summary')?.parentElement?.querySelector('h2')?.textContent || ''
    return error || (title.includes(${JSON.stringify(expectedName)}) ? 'report' : '')
  })()`), 'conversion report')
  if (state !== 'report') throw new Error(`Skin inspection failed in the browser: ${state}`)
  const counts = await evaluate(cdp, `[...document.querySelectorAll('.skin-report__summary strong')].map((node) => node.textContent)`)
  if (Number(counts[0]) < 4) throw new Error(`Expected mapped assets, received ${counts.join('/')}`)
}

async function assertMappingSource(cdp, targetText, expectedSource) {
  const sources = await evaluate(cdp, `[...document.querySelectorAll('.skin-report__summary + div > div')]
    .filter((row) => row.children[1]?.textContent.includes(${JSON.stringify(targetText)}))
    .map((row) => row.children[2]?.getAttribute('title') || row.children[2]?.textContent || '')`)
  if (!sources.length || sources.some((source) => !source.toLowerCase().includes(expectedSource.toLowerCase()))) {
    throw new Error(`Expected ${targetText} to resolve ${expectedSource}, received ${sources.join(', ') || 'nothing'}`)
  }
}

async function clickConvert(cdp) {
  await evaluate(cdp, `document.querySelector('.skin-convert-button').click()`)
  const state = await waitFor(async () => evaluate(cdp, `document.querySelector('.skin-convert-button').dataset.state === 'complete' ? 'complete' : (document.querySelector('.skin-error')?.textContent || '')`), 'completed conversion', 120_000)
  if (state !== 'complete') throw new Error(`Skin conversion failed in the browser: ${state}`)
}

async function newestDownload(extension, nameIncludes = '') {
  const name = await waitFor(async () => {
    const files = await readdir(downloads).catch(() => [])
    const matches = await Promise.all(files
      .filter((file) => file.toLowerCase().endsWith(extension) && file.toLowerCase().includes(nameIncludes.toLowerCase()))
      .map(async (file) => ({ file, modified: (await stat(join(downloads, file))).mtimeMs })))
    return matches.sort((a, b) => b.modified - a.modified)[0]?.file
  }, `${extension} download`)
  return join(downloads, name)
}

async function assertArchive(filePath, required) {
  const archive = await JSZip.loadAsync(await readFile(filePath), { checkCRC32: true })
  const names = Object.keys(archive.files).map((name) => name.toLowerCase())
  for (const expected of required) {
    if (!names.includes(expected.toLowerCase())) throw new Error(`${filePath} is missing ${expected}`)
  }
  return archive
}

function pngSize(data) {
  const bytes = Buffer.from(data)
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

async function alphaBounds(cdp, data) {
  const base64 = Buffer.from(data).toString('base64')
  return evaluate(cdp, `(async () => {
    const binary = atob('${base64}')
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'image/png' })
    const image = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    image.close()
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    let minX = canvas.width, minY = canvas.height, maxX = -1, maxY = -1
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] === 0) continue
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
    }
    return { minX, minY, maxX, maxY }
  })()`)
}

async function cornerAlpha(cdp, data) {
  const base64 = Buffer.from(data).toString('base64')
  return evaluate(cdp, `(async () => {
    const binary = atob('${base64}')
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    image.close()
    return context.getImageData(0, 0, 1, 1).data[3]
  })()`)
}

async function rowOpaquePixels(cdp, data, y) {
  const base64 = Buffer.from(data).toString('base64')
  return evaluate(cdp, `(async () => {
    const binary = atob('${base64}')
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const image = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    image.close()
    const pixels = context.getImageData(0, ${y}, canvas.width, 1).data
    let count = 0
    for (let x = 0; x < canvas.width; x++) {
      if (pixels[x * 4 + 3] > 4) count++
    }
    return count
  })()`)
}

async function assertOsuArchive(cdp, filePath, { rotated = false, kori = false, clairpis = false, myuka = false, splitHolds = false, expectedHitPosition = 420 } = {}) {
  const archive = await assertArchive(filePath, [
    'skin.ini', '_blank.png', 'mania/notes/1/1.png', 'mania/notes/4/4.png',
    splitHolds ? 'mania/notes/ln/ln1-1.png' : 'mania/notes/ln/ln1.png',
    splitHolds ? 'mania/notes/ln/ln2-1.png' : 'mania/notes/ln/ln2.png',
    'mania/receptors/left.png', 'mania/receptors/left_other.png',
    'mania/receptors/left@2x.png', 'mania/receptors/left_other@2x.png',
    'mania/receptors/right.png', 'mania/receptors/right_other.png',
    'cursor.png', 'menu-button-background.png', 'applause.mp3', 'font/score-0.png',
    'mania/hitbursts/mania-hit300.png', 'mania/stage/4K/stageleft.png',
  ])
  const ini = await archive.file('skin.ini').async('string')
  const idkFourKeySettings = [
    'Keys: 4',
    'ColumnStart: 286',
    `HitPosition: ${expectedHitPosition}`,
    'UpsideDown: 0',
    'JudgementLine: 0',
    'ScorePosition: 190',
    'ComboPosition: 150',
    'ColumnWidth: 70,70,70,70',
    'BarlineHeight: 0',
    'ColumnLineWidth: 0,0,0,0,0',
    'LightingN: _blank',
    'LightingL: _blank',
    'KeysUnderNotes: 1',
  ]
  for (const setting of idkFourKeySettings) {
    if (!ini.split(/\r?\n/).includes(setting)) {
      throw new Error(`Generated osu! skin changed an idk color green 4K setting: ${setting}`)
    }
  }
  const leftKeyBounds = await alphaBounds(cdp, await archive.file('mania/receptors/left.png').async('uint8array'))
  const receptorCenterY = (leftKeyBounds.minY + leftKeyBounds.maxY) / 2
  const expectedReceptorCenterY = 145 + (expectedHitPosition - 420) * 100 / 70
  if (Math.abs(receptorCenterY - expectedReceptorCenterY) > 12) {
    throw new Error(`Exported receptor is not aligned to HitPosition ${expectedHitPosition}: center=${receptorCenterY}, expected=${expectedReceptorCenterY}`)
  }
  if (!/^NoteBodyStyle:\s*1$/m.test(ini)) {
    throw new Error('Generated osu! skin does not use a seamless cascading long-note body.')
  }
  for (let lane = 0; lane < 4; lane++) {
    if (!new RegExp(`^NoteFlipWhenUpsideDown${lane}T:\\s*0$`, 'm').test(ini)) {
      throw new Error(`Generated osu! skin can flip and clip the long-note tail in lane ${lane + 1}.`)
    }
  }
  if (!/^\s*CursorCentre:\s*1$/m.test(ini) || !/^\s*Hit300:\s*mania\/hitbursts\/mania-hit300$/m.test(ini) || !/^\s*StageLeft:\s*mania\/stage\/4K\/stageleft$/m.test(ini)) {
    throw new Error('Generated osu! skin did not retain the template UI and mania presentation settings.')
  }
  if (/^(?:KeyImage|NoteImage)\d+(?:D|H|L|T)?:\s*mania\/arrows\//m.test(ini) || archive.file('mania/arrows/holdbody.png')) {
    throw new Error('Generated osu! skin retained template gameplay assets that should have been replaced.')
  }
  const notes = await Promise.all([1, 2, 3, 4].map((lane) => archive.file(`mania/notes/${lane}/${lane}.png`).async('uint8array')))
  for (let lane = 0; lane < 4; lane++) {
    const headPath = ini.match(new RegExp(`^NoteImage${lane}H:\\s*(.+)$`, 'm'))?.[1].trim()
    if (!headPath || !archive.file(`${headPath}.png`)) {
      throw new Error(`Etterna hold head is missing in osu! lane ${lane + 1}.`)
    }
  }
  if (rotated && Buffer.from(notes[0]).equals(Buffer.from(notes[1]))) {
    throw new Error('Etterna lane rotations were lost while generating osu! notes.')
  }
  if (kori) {
    const key = await archive.file('mania/receptors/left.png').async('uint8array')
    const size = pngSize(key)
    if (size.width !== 100 || size.height !== 284) throw new Error(`Kori receptor has invalid osu! key canvas: ${size.width}x${size.height}`)
    const bounds = await alphaBounds(cdp, key)
    if (bounds.minY < 94 || bounds.maxY > 195 || bounds.minX < 0 || bounds.maxX > 99) {
      throw new Error(`Kori receptor left its stable osu!mania key canvas: ${JSON.stringify(bounds)}`)
    }
    const hdKeySize = pngSize(await archive.file('mania/receptors/left@2x.png').async('uint8array'))
    if (hdKeySize.width !== 200 || hdKeySize.height !== 568) throw new Error(`Kori HD receptor was downsampled: ${hdKeySize.width}x${hdKeySize.height}`)
    const note = await archive.file('mania/notes/1/1.png').async('uint8array')
    const noteBounds = await alphaBounds(cdp, note)
    if (Math.abs((noteBounds.maxX - noteBounds.minX) - (noteBounds.maxY - noteBounds.minY)) > 1) {
      throw new Error(`Kori circular note was distorted: ${JSON.stringify(noteBounds)}`)
    }
    const noteWidthRatio = (noteBounds.maxX - noteBounds.minX + 1) / 64
    const receptorWidthRatio = (bounds.maxX - bounds.minX + 1) / 100
    if (Math.abs(noteWidthRatio - receptorWidthRatio) > 0.015) {
      throw new Error(`Kori note and receptor display at different diameters: note=${noteWidthRatio}, receptor=${receptorWidthRatio}`)
    }
    const headPath = ini.match(/^NoteImage0H:\s*(.+)$/m)?.[1].trim()
    if (!headPath || headPath === 'mania/notes/1/1') {
      throw new Error('Kori tap-based hold head was not joined to its body.')
    }
    const head = await archive.file(`${headPath}.png`).async('uint8array')
    const headTopWidth = await rowOpaquePixels(cdp, head, 0)
    const headJoinWidth = await rowOpaquePixels(cdp, head, 31)
    if (headTopWidth < 55 || headJoinWidth < 55) {
      throw new Error(`Kori hold head still exposes its circular upper edge: top=${headTopWidth}, join=${headJoinWidth}`)
    }
    const body = await archive.file('mania/notes/ln/ln1.png').async('uint8array')
    const bodySize = pngSize(body)
    const tail = await archive.file('mania/notes/ln/ln2.png').async('uint8array')
    const tailSize = pngSize(tail)
    if (bodySize.width !== 64 || bodySize.height !== 8192 || tailSize.width !== 64 || tailSize.height !== 64) {
      throw new Error(`Kori hold geometry is invalid: body ${bodySize.width}x${bodySize.height}, tail ${tailSize.width}x${tailSize.height}`)
    }
    const tailBounds = await alphaBounds(cdp, tail)
    const tailWidth = tailBounds.maxX - tailBounds.minX + 1
    if (Math.abs(tailWidth / 64 - receptorWidthRatio) > 0.015) {
      throw new Error(`Kori rounded hold end does not match its receptor: ${JSON.stringify(tailBounds)}`)
    }
    const exposedWidth = await rowOpaquePixels(cdp, body, 0)
    const joinWidth = await rowOpaquePixels(cdp, body, 31)
    const tailJoinWidth = await rowOpaquePixels(cdp, tail, 0)
    const tailOuterWidth = await rowOpaquePixels(cdp, tail, tailSize.height - 1)
    if (exposedWidth !== 0 || joinWidth < 55 || tailJoinWidth < 55 || tailOuterWidth !== 0) {
      throw new Error(`Kori seamless hold is invalid: exposed=${exposedWidth}, join=${joinWidth}, tailJoin=${tailJoinWidth}, tailOuter=${tailOuterWidth}`)
    }
  }
  if (clairpis) {
    for (const name of ['left.png', 'left_other.png', 'down.png', 'down_other.png']) {
      const key = await archive.file(`mania/receptors/${name}`).async('uint8array')
      const size = pngSize(key)
      if (size.width !== 100 || size.height !== 284) {
        throw new Error(`clairpis receptor does not use the stable osu!mania key canvas: ${name} is ${size.width}x${size.height}`)
      }
      const bounds = await alphaBounds(cdp, key)
      if (bounds.minY < 94 || bounds.maxY > 195 || bounds.minX < 0 || bounds.maxX > 99) {
        throw new Error(`clairpis receptor left its osu!mania key column: ${name} ${JSON.stringify(bounds)}`)
      }
    }
  }
  if (myuka) {
    for (let lane = 0; lane < 4; lane++) {
      if (!new RegExp(`^NoteImage${lane}H:\\s*mania/notes/${lane + 1}/${lane + 1}$`, 'm').test(ini)) {
        throw new Error(`Myuka's directional arrow was covered by the long-note body in lane ${lane + 1}.`)
      }
    }
  }
}

async function assertEtternaArchive(filePath) {
  const archive = await JSZip.loadAsync(await readFile(filePath), { checkCRC32: true })
  const names = Object.keys(archive.files)
  const noteSkinPath = names.find((name) => /^[^/]+\/NoteSkin\.lua$/i.test(name))
  if (!noteSkinPath) throw new Error('Generated Etterna archive does not contain exactly one installable skin folder.')
  const base = noteSkinPath.slice(0, -'NoteSkin.lua'.length)
  const folderName = base.slice(0, -1)
  if (/-Etterna$/i.test(folderName)) {
    throw new Error(`Generated folder still has a converter suffix: ${folderName}`)
  }
  if (/\s|,/.test(folderName)) {
    throw new Error(`Etterna's PlayerOptions parser cannot select the generated folder name: ${folderName}`)
  }
  for (const expected of ['metrics.ini', 'Left Tap Note.lua', 'Down Tap Note.lua', 'Down Receptor.lua', '_down receptor idle (doubleres).png', '_down receptor pressed (doubleres).png', 'HENKAN-REPORT.txt', 'HENKAN-INSTALL.txt']) {
    if (!archive.file(`${base}${expected}`)) throw new Error(`${filePath} is missing ${base}${expected}`)
  }
  for (const column of ['left', 'down']) {
    if (!names.some((name) => new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_${column} tap note \\(res 64x\\d+\\)\\.png$`, 'i').test(name))) {
      throw new Error(`${filePath} is missing a resolution-tagged ${column} tap texture.`)
    }
  }
  for (const cap of ['Topcap', 'Bottomcap']) {
    if (!names.some((name) => name.startsWith(`${base}Left Hold ${cap} Active (res 64x`) && name.endsWith(').png'))) {
      throw new Error(`${filePath} is missing a resolution-tagged Left Hold ${cap} Active texture.`)
    }
  }
  const metrics = await archive.file(`${base}metrics.ini`)?.async('string')
  if (!/^FallbackNoteSkin=default$/m.test(metrics || '')) {
    throw new Error('Generated Etterna noteskin must fall back to dance/default before common.')
  }
  for (const metric of ['TapNote', 'HoldHead', 'HoldBody', 'HoldBottomCap']) {
    if (!new RegExp(`^${metric}NoteColorTextureCoordSpacingY=0$`, 'm').test(metrics || '')) {
      throw new Error(`Generated Etterna noteskin inherited quantisation slicing for ${metric}.`)
    }
  }
  for (const metric of [
    'UseStretchHolds=0',
    'UseShrinkHolds=1',
    'FlipHoldBodyWhenReverse=0',
    'StartDrawingHoldBodyOffsetFromHead=-1',
    'StopDrawingHoldBodyOffsetFromTail=-1',
  ]) {
    if (!metrics?.split(/\r?\n/).includes(metric)) {
      throw new Error(`Generated Etterna noteskin can clip long notes because ${metric} is missing.`)
    }
  }
  const lua = await archive.file(`${base}NoteSkin.lua`)?.async('string')
  if (!/function ret\.Load\(\)/.test(lua || '') || !/ret\.LocalElements\[element\]/.test(lua || '')) {
    throw new Error('Generated Etterna noteskin does not use its local actor loader.')
  }
  if (!/\["Tap Explosion Bright"\] = true/.test(lua || '') || !/\["Tap Explosion Dim"\] = true/.test(lua || '')) {
    throw new Error('Generated Etterna noteskin still falls back to default hit arrows.')
  }
  if (!/\["Hold BottomCap Active"\] = "Hold Bottomcap Active"/.test(lua || '') || !/\["Hold Bottomcap Active"\] = true/.test(lua || '')) {
    throw new Error('Generated Etterna noteskin can fall through to the default rounded hold cap.')
  }
  if (!/\["Hold TopCap Active"\] = "Hold Topcap Active"/.test(lua || '') || !/\["Hold Topcap Active"\] = true/.test(lua || '')) {
    throw new Error('Generated Etterna noteskin leaves reverse/downscroll hold ends flat.')
  }
  const actor = await archive.file(`${base}Down Tap Note.lua`)?.async('string')
  if (!/NOTESKIN:GetPath\("_down", "tap note"\)/.test(actor || '')) {
    throw new Error('Generated tap actor does not resolve its uniquely named texture.')
  }
  const filesByStem = new Map()
  for (const name of names.filter((entry) => entry.startsWith(base) && /\.(lua|png)$/i.test(entry))) {
    const key = name.replace(/\.(lua|png)$/i, '').toLowerCase()
    filesByStem.set(key, [...(filesByStem.get(key) || []), name])
  }
  const collision = [...filesByStem.values()].find((matches) => matches.length > 1)
  if (collision) {
    throw new Error(`Etterna would reject ambiguous actor files: ${collision.join(', ')}`)
  }
}

async function assertTekkitoReceptors(cdp, filePath) {
  const archive = await JSZip.loadAsync(await readFile(filePath), { checkCRC32: true })
  const noteSkinPath = Object.keys(archive.files).find((name) => /^[^/]+\/NoteSkin\.lua$/i.test(name))
  const base = noteSkinPath?.slice(0, -'NoteSkin.lua'.length)
  if (!base) throw new Error('Tekkito conversion has no installable noteskin folder.')
  const idle = await archive.file(`${base}_down receptor idle (doubleres).png`)?.async('uint8array')
  const pressed = await archive.file(`${base}_down receptor pressed (doubleres).png`)?.async('uint8array')
  if (!idle || !pressed) throw new Error('Tekkito conversion is missing receptor states.')
  const idleSize = pngSize(idle)
  const pressedSize = pngSize(pressed)
  if (idleSize.width !== 128 || idleSize.height !== 128
    || idleSize.width !== pressedSize.width || idleSize.height !== pressedSize.height) {
    throw new Error(`Tekkito pressed receptor geometry changed: idle=${JSON.stringify(idleSize)}, pressed=${JSON.stringify(pressedSize)}`)
  }
  const [idleBounds, pressedBounds] = await Promise.all([alphaBounds(cdp, idle), alphaBounds(cdp, pressed)])
  if (JSON.stringify(idleBounds) !== JSON.stringify(pressedBounds)) {
    throw new Error(`Tekkito pressed receptor includes stray key artwork: idle=${JSON.stringify(idleBounds)}, pressed=${JSON.stringify(pressedBounds)}`)
  }
}

async function assertHamsterEtterna(cdp, filePath) {
  const archive = await JSZip.loadAsync(await readFile(filePath), { checkCRC32: true })
  const noteSkinPath = Object.keys(archive.files).find((name) => /^[^/]+\/NoteSkin\.lua$/i.test(name))
  if (!noteSkinPath) throw new Error('Hamster conversion has no installable noteskin folder.')
  const base = noteSkinPath.slice(0, -'NoteSkin.lua'.length)
  if (base.startsWith('--')) throw new Error(`Hamster conversion retained Etterna's non-selectable -- prefix: ${base}`)
  if (base !== 'hamster-kombat-edition/') {
    throw new Error(`Hamster conversion did not use its selectable single-token folder name: ${base}`)
  }
  const expectedSizes = new Map([
    ['_left tap note (res 64x64).png', [512, 512]],
    ['Left Hold Head Active (res 64x64).png', [512, 512]],
    ['Left Hold Body Active (res 64x1).png', [148, 2]],
    ['Left Hold Topcap Active (res 64x64).png', [148, 148]],
    ['Left Hold Bottomcap Active (res 64x1).png', [128, 1]],
    ['_left receptor idle (doubleres).png', [128, 128]],
    ['_left receptor pressed (doubleres).png', [128, 128]],
  ])
  for (const [name, [width, height]] of expectedSizes) {
    const entry = archive.file(`${base}${name}`)
    if (!entry) throw new Error(`Hamster conversion is missing ${name}`)
    const size = pngSize(await entry.async('uint8array'))
    if (size.width !== width || size.height !== height) {
      throw new Error(`Hamster ${name} is still raw-sized: ${size.width}x${size.height}`)
    }
  }
  const cap = await archive.file(`${base}Left Hold Topcap Active (res 64x64).png`).async('uint8array')
  if (await cornerAlpha(cdp, cap) !== 0) {
    throw new Error('Hamster long-note cap retained its opaque black source background.')
  }
  const receptorActor = await archive.file(`${base}Left Receptor.lua`)?.async('string')
  if (!/PressCommand/.test(receptorActor || '') || !/GetPath\("_left receptor", "pressed"\)/.test(receptorActor || '')) {
    throw new Error('Hamster pressed receptor state was not converted.')
  }
}

async function assertColorChangingEtterna(filePath) {
  const archive = await JSZip.loadAsync(await readFile(filePath), { checkCRC32: true })
  const bodyName = Object.keys(archive.files).find((name) => /Left Hold Body Active \(res 64x\d+\)\.png$/i.test(name))
  if (!bodyName) throw new Error('Color-changing conversion is missing its long-note body.')
  const bodySize = pngSize(await archive.file(bodyName).async('uint8array'))
  if (bodySize.width !== 138 || bodySize.height < 39000) {
    throw new Error(`Color-changing cascade was flattened to ${bodySize.width}x${bodySize.height}.`)
  }
}

async function assertSheepEtterna(cdp, filePath) {
  const archive = await JSZip.loadAsync(await readFile(filePath), { checkCRC32: true })
  const noteSkinPath = Object.keys(archive.files).find((name) => /^[^/]+\/NoteSkin\.lua$/i.test(name))
  if (!noteSkinPath) throw new Error('Sheepex conversion has no installable noteskin folder.')
  const base = noteSkinPath.slice(0, -'NoteSkin.lua'.length)
  const capName = `${base}Left Hold Topcap Active (res 64x64).png`
  const bodyName = `${base}Left Hold Body Active (res 64x1).png`
  const cap = await archive.file(capName)?.async('uint8array')
  const body = await archive.file(bodyName)?.async('uint8array')
  if (!cap || !body) throw new Error('Sheepex conversion is missing its long-note body or derived cap.')
  const capSize = pngSize(cap)
  const bodySize = pngSize(body)
  if (capSize.width !== 104 || capSize.height !== 104 || bodySize.width !== 104 || bodySize.height !== 2) {
    throw new Error(`Sheepex long-note geometry is invalid: cap=${capSize.width}x${capSize.height}, body=${bodySize.width}x${bodySize.height}`)
  }
  const bounds = await alphaBounds(cdp, cap)
  const tipWidth = await rowOpaquePixels(cdp, cap, 35)
  const joinWidth = await rowOpaquePixels(cdp, cap, 103)
  if (bounds.minY > 36 || bounds.maxY !== 103 || tipWidth < 20 || joinWidth < 80) {
    throw new Error(`Sheepex's transparent NoteImageT was not replaced by the body endpoint: ${JSON.stringify(bounds)}`)
  }
}

async function killTree(process) {
  if (!process?.pid) return
  await new Promise((resolve) => {
    const killer = spawn('taskkill.exe', ['/PID', String(process.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    killer.once('close', resolve)
    killer.once('error', resolve)
  })
}

await makeFixtures()
const browserPath = findBrowser()
if (!browserPath) throw new Error('Edge or Chrome is required for this test.')
const server = spawn('cmd.exe', ['/d', '/s', '/c', 'npm.cmd run dev -- --host 127.0.0.1 --port 4178'], { cwd: process.cwd(), stdio: 'ignore', windowsHide: true })
let browser
let cdp
try {
  await waitFor(async () => (await fetch(appUrl)).ok, 'Vite server')
  browser = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    appUrl,
  ], { stdio: 'ignore', windowsHide: true })
  cdp = await connectCdp()
  await cdp.call('Page.navigate', { url: appUrl })
  await cdp.call('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads, eventsEnabled: true })
  try {
    await waitFor(async () => evaluate(cdp, `document.readyState === 'complete' && Boolean(document.querySelector('.skin-page'))`), 'skin converter page')
  } catch (error) {
    const diagnostic = await evaluate(cdp, `({ href: location.href, readyState: document.readyState, text: document.body?.innerText?.slice(0, 500), html: document.body?.innerHTML?.slice(0, 500) })`)
    throw new Error(`${error.message}: ${JSON.stringify(diagnostic)}`)
  }
  await assertResponsive(cdp)
  if (await evaluate(cdp, `Boolean(document.querySelector('.header-direction'))`)) {
    throw new Error('Skin converter must not expose a manual direction switch.')
  }

  if (process.env.HENKAN_ONLY_TEKKITO) {
    if (!existsSync(realTekkitoPath)) throw new Error('The tekkito regression skin is unavailable.')
    await setFile(cdp, realTekkitoPath)
    await waitForReport(cdp, '# - tekkito2 ft jb the voice tu perfume a chanel')
    await assertPreview(cdp, 412)
    await clickConvert(cdp)
    const convertedTekkito = await newestDownload('.zip', '# - tekkito2 ft jb the voice tu perfume a chanel')
    await assertEtternaArchive(convertedTekkito)
    await assertTekkitoReceptors(cdp, convertedTekkito)
    if (process.env.HENKAN_TEKKITO_OUTPUT) await copyFile(convertedTekkito, process.env.HENKAN_TEKKITO_OUTPUT)
  } else {
  await setFile(cdp, osuPath)
  await waitForReport(cdp, 'Fixture')
  await assertPreview(cdp)
  await clickConvert(cdp)
  const fixtureEtterna = await newestDownload('.zip')
  if (basename(fixtureEtterna) !== 'Fixture.zip') throw new Error(`Unexpected Etterna output name: ${basename(fixtureEtterna)}`)
  await assertEtternaArchive(fixtureEtterna)

  await setFile(cdp, etternaPath)
  await waitForReport(cdp, 'FixtureEtterna')
  await assertPreview(cdp)
  await assertResponsive(cdp)
  await setHitPosition(cdp, 360)
  await assertPreview(cdp, 360)
  await clickConvert(cdp)
  const fixtureOsu = await newestDownload('.osk')
  if (basename(fixtureOsu) !== 'FixtureEtterna.osk') throw new Error(`Unexpected osu! output name: ${basename(fixtureOsu)}`)
  await assertOsuArchive(cdp, fixtureOsu, { rotated: true, splitHolds: true, expectedHitPosition: 360 })

  if (!process.env.HENKAN_SKIP_INSTALLED && existsSync(realOsuPath) && existsSync(realEtternaPath)) {
    await setFile(cdp, realOsuPath)
    await waitForReport(cdp, 'RealOsu')
    await clickConvert(cdp)
    await assertEtternaArchive(await newestDownload('.zip'))

    if (existsSync(realHamsterPath)) {
      await setFile(cdp, realHamsterPath)
      await waitForReport(cdp, '--] hamster kombat edition')
      await assertMappingSource(cdp, 'Left tap', 'mania/arrows/left.png')
      await assertMappingSource(cdp, 'Left receptor', 'mania/arrows/k_left@2x.png')
      await assertMappingSource(cdp, 'Left pressed receptor', 'mania/arrows/kd_left@2x.png')
      await clickConvert(cdp)
      const convertedHamster = await newestDownload('.zip', 'hamster kombat edition')
      await assertEtternaArchive(convertedHamster)
      await assertHamsterEtterna(cdp, convertedHamster)
      if (process.env.HENKAN_HAMSTER_OUTPUT) await copyFile(convertedHamster, process.env.HENKAN_HAMSTER_OUTPUT)
    }

    if (existsSync(realColorChangingPath)) {
      await setFile(cdp, realColorChangingPath)
      await waitForReport(cdp, 'idk color changing')
      await clickConvert(cdp)
      const convertedColorChanging = await newestDownload('.zip', 'idk color changing')
      await assertEtternaArchive(convertedColorChanging)
      await assertColorChangingEtterna(convertedColorChanging)
      if (process.env.HENKAN_COLOR_OUTPUT) await copyFile(convertedColorChanging, process.env.HENKAN_COLOR_OUTPUT)
    }

    if (existsSync(realSheepPath)) {
      await setFile(cdp, realSheepPath)
      await waitForReport(cdp, "sheepex_'s gay girls skin")
      await clickConvert(cdp)
      const convertedSheep = await newestDownload('.zip', "sheepex_'s gay girls skin")
      await assertEtternaArchive(convertedSheep)
      await assertSheepEtterna(cdp, convertedSheep)
      if (process.env.HENKAN_SHEEP_OUTPUT) await copyFile(convertedSheep, process.env.HENKAN_SHEEP_OUTPUT)
    }

    if (existsSync(realTekkitoPath)) {
      await setFile(cdp, realTekkitoPath)
      await waitForReport(cdp, '# - tekkito2 ft jb the voice tu perfume a chanel')
      await assertPreview(cdp)
      await clickConvert(cdp)
      const convertedTekkito = await newestDownload('.zip', '# - tekkito2 ft jb the voice tu perfume a chanel')
      await assertEtternaArchive(convertedTekkito)
      if (process.env.HENKAN_TEKKITO_OUTPUT) await copyFile(convertedTekkito, process.env.HENKAN_TEKKITO_OUTPUT)
    }

    await setFile(cdp, realEtternaPath)
    await waitForReport(cdp, "Kori'sPick")
    await assertMappingSource(cdp, ' note', '_down tap note 1x8 (doubleres).png')
    await assertMappingSource(cdp, ' key', '_Down Go Receptor Go (doubleres).png')
    await clickConvert(cdp)
    const convertedKori = await newestDownload('.osk', "Kori'sPick")
    if (basename(convertedKori) !== "Kori'sPick.osk") throw new Error(`Unexpected Kori output name: ${basename(convertedKori)}`)
    await assertOsuArchive(cdp, convertedKori, { kori: true })
    if (process.env.HENKAN_OSU_OUTPUT) await copyFile(convertedKori, process.env.HENKAN_OSU_OUTPUT)

    if (existsSync(realClairPath)) {
      await setFile(cdp, realClairPath)
      await waitForReport(cdp, 'RealClair')
      await assertMappingSource(cdp, 'lane 1 note', '_one Tap Note (res 64x64).png')
      await assertMappingSource(cdp, 'lane 1 key', 'Stage/1 button idle.png')
      await assertMappingSource(cdp, 'lane 1 pressed key', 'Stage/1 button pressed.png')
      await assertMappingSource(cdp, 'lane 1 hold body', '_White Body (doubleres).png')
      await assertMappingSource(cdp, 'lane 2 hold body', '_Blue Body (doubleres).png')
      await clickConvert(cdp)
      await assertOsuArchive(cdp, await newestDownload('.osk', 'RealClair'), { clairpis: true })
    }

    if (existsSync(realMyukaPath)) {
      await setFile(cdp, realMyukaPath)
      await waitForReport(cdp, 'RealMyuka')
      await assertMappingSource(cdp, 'lane 1 note', 'Notes/_Left Tap Note 1x1 (res 64x64).png')
      await assertMappingSource(cdp, 'lane 1 key', 'Receptors/release left (res 64x64).png')
      await assertMappingSource(cdp, 'lane 1 pressed key', 'Receptors/pressed left (res 64x64).png')
      await assertMappingSource(cdp, 'lane 2 note', 'Notes/_Down Tap Note 1x1 (res 64x64).png')
      await clickConvert(cdp)
      const convertedMyuka = await newestDownload('.osk', 'RealMyuka')
      if (basename(convertedMyuka) !== 'RealMyuka.osk') throw new Error(`Unexpected Myuka output name: ${basename(convertedMyuka)}`)
      await assertOsuArchive(cdp, convertedMyuka, { myuka: true })
      if (process.env.HENKAN_MYUKA_OUTPUT) await copyFile(convertedMyuka, process.env.HENKAN_MYUKA_OUTPUT)
    }
  }

  await evaluate(cdp, `location.assign('/')`)
  await waitFor(async () => evaluate(cdp, `location.pathname === '/' && Boolean(document.querySelector('input[type=file][accept*=".osk"]'))`), 'main converter drop zone')
  await setFile(cdp, osuPath)
  await waitFor(async () => evaluate(cdp, `location.pathname === '/skin-converter'`), 'automatic skin mode routing')
  await waitForReport(cdp, 'Fixture')

  await evaluate(cdp, `location.assign('/')`)
  await waitFor(async () => evaluate(cdp, `location.pathname === '/' && Boolean(document.querySelector('input[type=file][accept*=".osk"]'))`), 'main converter folder drop zone')
  await dropEtternaFolder(cdp)
  await waitFor(async () => evaluate(cdp, `location.pathname === '/skin-converter'`), 'automatic skin folder routing')
  await waitForReport(cdp, 'DroppedEtterna')
  }

  console.log(process.env.HENKAN_ONLY_TEKKITO
    ? 'Skin converter tekkito regression passed: tall PNG decode, preview, and osu!mania to Etterna conversion'
    : process.env.HENKAN_SKIP_INSTALLED
    ? 'Skin converter E2E passed: synthetic fixtures, auto-routing, preview, HitPosition, naming, and responsive layouts'
    : 'Skin converter E2E passed: synthetic and installed osu!mania/Etterna skins, including hamster, clairpis, and myuka')
} finally {
  cdp?.close()
  await Promise.all([killTree(browser), killTree(server)])
  await rm(workspace, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 }).catch(() => {})
}
