import type { JSZipObject } from 'jszip'
import { decode as decodePng } from 'fast-png'
import * as UTIF from 'utif'
import { readFileArrayBuffer } from './files'
import type {
  SkinAssetMapping,
  SkinConversionOptions,
  SkinConversionResult,
  SkinDirection,
  SkinInspection,
  SkinPreview,
} from '../types/skin'

const MAX_ARCHIVE_BYTES = 250 * 1024 * 1024
const MAX_EXPANDED_BYTES = 500 * 1024 * 1024
const MAX_ARCHIVE_FILES = 4_000
const MAX_IMAGE_PIXELS = 50_000_000
const OSU_CASCADE_HEIGHT = 16_384
export const DEFAULT_OSU_HIT_POSITION = 420
export const MIN_OSU_HIT_POSITION = 355
export const MAX_OSU_HIT_POSITION = 480
export const DEFAULT_OSU_COLUMN_WIDTH = 70
export const MIN_OSU_COLUMN_WIDTH = 40
export const MAX_OSU_COLUMN_WIDTH = 140
const DANCE_COLUMNS = ['Left', 'Down', 'Up', 'Right'] as const
const OSU_RECEPTOR_NAMES = ['left', 'down', 'up', 'right'] as const
const OSU_RECEPTOR_LAYOUT = {
  width: 200,
  height: 568,
  artworkX: 0,
  artworkY: 188,
  artworkWidth: 200,
  artworkHeight: 204,
} as const

interface LoadedArchive {
  files: JSZipObject[]
  name: string
}

const fileArchiveCache = new WeakMap<File, Promise<LoadedArchive>>()
let pathArchiveCache: { path: string; archive: Promise<LoadedArchive> } | null = null

interface IniSection {
  name: string
  values: Map<string, string>
}

interface ResolvedAsset {
  entry: JSZipObject | null
  source: string | null
  status: SkinAssetMapping['status']
  renderWidth?: number
  renderHeight?: number
}

interface RasterAsset {
  blob: Blob
  width: number
  height: number
}

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  close: () => void
}

interface DecodedPixels {
  width: number
  height: number
  data: Uint8ClampedArray
}

type SizedZipObject = JSZipObject & { _data?: { uncompressedSize?: number } }

function archiveName(input: File | string): string {
  const raw = input instanceof File ? input.name : input.split(/[/\\]+/).pop() || 'skin'
  return raw.replace(/\.(osk|zip)$/i, '') || 'skin'
}

function safeName(value: string): string {
  const forbidden = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*'])
  const cleaned = Array.from(value)
    .filter((character) => character.charCodeAt(0) >= 32 && !forbidden.has(character))
    .join('')
    .trim()
  return (cleaned || 'Converted skin').slice(0, 80)
}

function safeEtternaName(value: string): string {
  // Etterna's noteskin option is passed through PlayerOptions::FromOneModString,
  // which splits on spaces and validates only the final token as the skin name.
  // Keep the folder name to one token so a listed skin can actually be selected.
  const stem = safeName(value)
    .replace(/^--+\s*[\][(){}>._\s-]*/, '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  const token = (stem || 'converted-skin').slice(0, 70).replace(/-+$/g, '')
  return token
}

function normalisePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+|\/+$/g, '').toLowerCase()
}

function stem(value: string): string {
  return normalisePath(value)
    .replace(/\.(png|jpg|jpeg|bmp|gif|webp|lua|redir)$/i, '')
    .replace(/@2x$/i, '')
    .replace(/\s*\(doubleres\)$/i, '')
    .replace(/\s*\(res\s+\d+x\d+\)$/i, '')
    .replace(/\s+\d+x\d+$/i, '')
}

async function readArchive(input: File | string): Promise<LoadedArchive> {
  const data = await readFileArrayBuffer(input)
  if (data.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error('This archive is larger than 250 MB. Remove unrelated UI assets and try again.')
  }

  const JSZip = (await import('jszip')).default
  let zip: InstanceType<typeof JSZip>
  try {
    zip = await JSZip.loadAsync(data)
  } catch {
    throw new Error('The selected file is not a readable .osk or .zip archive.')
  }

  const files = Object.values(zip.files).filter((entry) => !entry.dir && !entry.name.includes('__MACOSX/'))
  if (files.length === 0) throw new Error('The archive does not contain any files.')
  if (files.length > MAX_ARCHIVE_FILES) {
    throw new Error(`The archive contains ${files.length.toLocaleString()} files; the safe limit is ${MAX_ARCHIVE_FILES.toLocaleString()}.`)
  }
  const expandedBytes = files.reduce((total, entry) =>
    total + ((entry as SizedZipObject)._data?.uncompressedSize || 0), 0)
  if (expandedBytes > MAX_EXPANDED_BYTES) {
    throw new Error('The archive expands beyond the 500 MB safety limit. Remove unrelated assets and try again.')
  }

  return { files, name: archiveName(input) }
}

function loadArchive(input: File | string): Promise<LoadedArchive> {
  if (input instanceof File) {
    const cached = fileArchiveCache.get(input)
    if (cached) return cached
    const archive = readArchive(input)
    fileArchiveCache.set(input, archive)
    archive.catch(() => fileArchiveCache.delete(input))
    return archive
  }

  if (pathArchiveCache?.path === input) return pathArchiveCache.archive
  const archive = readArchive(input)
  pathArchiveCache = { path: input, archive }
  archive.catch(() => {
    if (pathArchiveCache?.archive === archive) pathArchiveCache = null
  })
  return archive
}

function findFile(files: JSZipObject[], references: string[]): JSZipObject | null {
  const refs = references.filter(Boolean)
  for (const reference of refs) {
    const wanted = normalisePath(reference)
    const exact = files.find((entry) => normalisePath(entry.name) === wanted)
      || files.find((entry) => normalisePath(entry.name).endsWith(`/${wanted}`))
    if (exact) return exact
  }

  for (const reference of refs) {
    const wantedStem = stem(reference)
    const match = files.find((entry) => stem(entry.name) === wantedStem)
      || files.find((entry) => stem(entry.name).endsWith(`/${wantedStem}`))
    if (match) return match
  }
  return null
}

function findImage(files: JSZipObject[], references: string[]): JSZipObject | null {
  const expanded = references.flatMap((reference) => {
    const withoutExtension = reference.replace(/\.(png|jpg|jpeg|bmp|gif|webp)$/i, '')
    return [
      `${withoutExtension}@2x.png`,
      `${withoutExtension}.png`,
      `${withoutExtension}-0@2x.png`,
      `${withoutExtension}-0.png`,
      reference,
    ]
  })
  return findFile(files.filter((entry) => /\.(png|jpg|jpeg|bmp|gif|webp)$/i.test(entry.name)), expanded)
}

function findEtternaTexture(files: JSZipObject[], references: string[]): JSZipObject | null {
  const exact = findImage(files, references)
  if (exact) return exact
  const images = files.filter((entry) => /\.(png|jpg|jpeg|bmp|gif|webp)$/i.test(entry.name))
  for (const reference of references.filter(Boolean)) {
    const wanted = (stem(reference).split('/').pop() || '').replace(/^_+/, '')
    const candidates = images
      .filter((entry) => {
        const candidate = (stem(entry.name).split('/').pop() || '').replace(/^_+/, '')
        return candidate.startsWith(`${wanted} `)
      })
      .sort((left, right) => stem(left.name).length - stem(right.name).length)
    if (candidates[0]) return candidates[0]
  }
  return null
}

async function readText(entry: JSZipObject): Promise<string> {
  const data = await entry.async('uint8array')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data)
  } catch {
    return new TextDecoder('windows-1252').decode(data)
  }
}

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch { /* use the HTML image decoder below */ }
  }

  const url = URL.createObjectURL(blob)
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => {} })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('The browser could not decode this image.'))
    }
    image.src = url
  })
}

function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 24
    && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
}

function isTiff(bytes: Uint8Array): boolean {
  return bytes.length >= 8 && (
    (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00)
    || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)
  )
}

function checkedPixelCount(width: number, height: number, format: string): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
    || width * height > MAX_IMAGE_PIXELS) {
    throw new Error(`This ${format} exceeds the ${MAX_IMAGE_PIXELS.toLocaleString()}-pixel image safety limit.`)
  }
}

function tiffDimension(ifd: UTIF.IFD, tag: 't256' | 't257'): number {
  const value = ifd[tag]
  return Array.isArray(value) ? Number(value[0]) : 0
}

async function decodeImagePixels(blob: Blob): Promise<DecodedPixels> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  if (isTiff(bytes)) {
    const ifd = UTIF.decode(buffer)[0]
    if (!ifd) throw new Error('This TIFF image does not contain a readable frame.')
    checkedPixelCount(tiffDimension(ifd, 't256'), tiffDimension(ifd, 't257'), 'TIFF')
    UTIF.decodeImage(buffer, ifd)
    checkedPixelCount(ifd.width, ifd.height, 'TIFF')
    return { width: ifd.width, height: ifd.height, data: new Uint8ClampedArray(UTIF.toRGBA8(ifd)) }
  }
  if (!isPng(bytes)) throw new Error('The browser could not decode this image format.')
  const width = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0
  const height = ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0
  checkedPixelCount(width, height, 'PNG')

  const decoded = decodePng(bytes)
  const rgba = new Uint8ClampedArray(decoded.width * decoded.height * 4)
  const max = decoded.depth === 16 ? 65535 : (1 << decoded.depth) - 1
  const channel = (index: number) => Math.round(Number(decoded.data[index]) * 255 / max)
  for (let pixel = 0; pixel < decoded.width * decoded.height; pixel++) {
    const source = pixel * decoded.channels
    const target = pixel * 4
    if (decoded.channels === 1) {
      const gray = channel(source)
      rgba[target] = gray
      rgba[target + 1] = gray
      rgba[target + 2] = gray
      rgba[target + 3] = 255
    } else if (decoded.channels === 2) {
      const gray = channel(source)
      rgba[target] = gray
      rgba[target + 1] = gray
      rgba[target + 2] = gray
      rgba[target + 3] = channel(source + 1)
    } else {
      rgba[target] = channel(source)
      rgba[target + 1] = channel(source + 1)
      rgba[target + 2] = channel(source + 2)
      rgba[target + 3] = decoded.channels === 4 ? channel(source + 3) : 255
    }
  }
  return { width: decoded.width, height: decoded.height, data: rgba }
}

function drawPixelRegion(
  context: CanvasRenderingContext2D,
  image: DecodedPixels,
  sourceX: number,
  sourceY: number,
  sourceWidth: number,
  sourceHeight: number,
  targetX: number,
  targetY: number,
  targetWidth: number,
  targetHeight: number,
): void {
  const pixels = new Uint8ClampedArray(sourceWidth * sourceHeight * 4)
  for (let y = 0; y < sourceHeight; y++) {
    const sourceStart = ((sourceY + y) * image.width + sourceX) * 4
    pixels.set(image.data.subarray(sourceStart, sourceStart + sourceWidth * 4), y * sourceWidth * 4)
  }
  const scratch = document.createElement('canvas')
  scratch.width = sourceWidth
  scratch.height = sourceHeight
  const scratchContext = scratch.getContext('2d')
  if (!scratchContext) throw new Error('Canvas image conversion is unavailable in this environment.')
  scratchContext.putImageData(new ImageData(pixels, sourceWidth, sourceHeight), 0, 0)
  context.drawImage(scratch, 0, 0, sourceWidth, sourceHeight, targetX, targetY, targetWidth, targetHeight)
}

function parseIni(content: string): IniSection[] {
  const sections: IniSection[] = []
  let current: IniSection | null = null

  for (const sourceLine of content.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = sourceLine.trim()
    if (!line || line.startsWith('//') || line.startsWith(';')) continue
    const sectionMatch = line.match(/^\[([^\]]+)]$/)
    if (sectionMatch) {
      current = { name: sectionMatch[1].trim(), values: new Map() }
      sections.push(current)
      continue
    }
    if (!current) continue
    const delimiter = line.indexOf(':')
    if (delimiter < 1) continue
    const key = line.slice(0, delimiter).trim().toLowerCase()
    const value = line.slice(delimiter + 1).replace(/\s+\/\/.*$/, '').trim()
    current.values.set(key, value)
  }
  return sections
}

function defaultOsuLaneStem(index: number, keyCount: number, suffix = ''): string {
  if (keyCount % 2 === 1 && index === Math.floor(keyCount / 2)) return `mania-noteS${suffix}`
  const distanceFromEdge = Math.min(index, keyCount - index - 1)
  return `mania-note${distanceFromEdge % 2 === 0 ? '1' : '2'}${suffix}`
}

function osuAsset(
  files: JSZipObject[],
  mania: IniSection,
  property: string,
  fallbacks: string[],
): ResolvedAsset {
  const configured = mania.values.get(property.toLowerCase())?.replace(/^"|"$/g, '')
  const direct = configured ? findImage(files, [configured]) : null
  if (direct) return { entry: direct, source: direct.name, status: 'mapped' }

  const fallback = findImage(files, fallbacks)
  if (fallback) return { entry: fallback, source: fallback.name, status: configured ? 'fallback' : 'mapped' }
  return { entry: null, source: null, status: 'missing' }
}

function mapping(target: string, asset: ResolvedAsset): SkinAssetMapping {
  return { target, source: asset.source, status: asset.status }
}

async function inspectOsu(archive: LoadedArchive): Promise<{ inspection: SkinInspection; mania: IniSection; assets: ResolvedAsset[][]; bodyStyle: number }> {
  const skinIni = findFile(archive.files, ['skin.ini'])
  if (!skinIni) throw new Error('No skin.ini was found. Select an exported osu! skin (.osk), not a beatmap archive.')
  const sections = parseIni(await readText(skinIni))
  const maniaSections = sections.filter((section) => section.name.toLowerCase() === 'mania')
  const keyModes = maniaSections
    .map((section) => Number(section.values.get('keys')))
    .filter((keys) => Number.isInteger(keys) && keys > 0)
  const mania = maniaSections.find((section) => Number(section.values.get('keys')) === 4)
  if (!mania) {
    const found = keyModes.length ? ` Found: ${keyModes.join('K, ')}K.` : ''
    throw new Error(`This converter currently produces Etterna dance noteskins, which require a 4K [Mania] section.${found}`)
  }

  const assets = DANCE_COLUMNS.map((_, index) => {
    const tap = osuAsset(archive.files, mania, `NoteImage${index}`, [defaultOsuLaneStem(index, 4)])
    const head = osuAsset(archive.files, mania, `NoteImage${index}H`, [defaultOsuLaneStem(index, 4, 'H')])
    const body = osuAsset(archive.files, mania, `NoteImage${index}L`, [defaultOsuLaneStem(index, 4, 'L')])
    const tail = osuAsset(archive.files, mania, `NoteImage${index}T`, [defaultOsuLaneStem(index, 4, 'T')])
    const receptor = osuAsset(archive.files, mania, `KeyImage${index}`, [
      `mania-key${index + 1}`,
      `mania-key${index % 2 === 0 ? '1' : '2'}`,
    ])
    const receptorPressed = osuAsset(archive.files, mania, `KeyImage${index}D`, [
      `mania-key${index + 1}D`,
      `mania-key${index % 2 === 0 ? '1' : '2'}D`,
    ])
    return [tap, head, body, tail, receptor, receptorPressed]
  })

  const mappings = assets.flatMap((lane, index) => [
    mapping(`${DANCE_COLUMNS[index]} tap`, lane[0]),
    mapping(`${DANCE_COLUMNS[index]} hold head`, lane[1]),
    mapping(`${DANCE_COLUMNS[index]} hold body`, lane[2]),
    mapping(`${DANCE_COLUMNS[index]} hold tail`, lane[3]),
    mapping(`${DANCE_COLUMNS[index]} receptor`, lane[4]),
    mapping(`${DANCE_COLUMNS[index]} pressed receptor`, lane[5]),
  ])
  const missingTapCount = assets.filter((lane) => !lane[0].entry).length
  if (missingTapCount === 4) throw new Error('The 4K section does not reference any readable mania note images.')

  const warnings = [
    'Only osu!mania gameplay assets are converted. Menu, ranking, audio, and other osu! modes stay out of the output.',
  ]
  if (mappings.some((item) => item.status === 'missing')) {
    warnings.push('Some hold or receptor assets are missing; Henkan will reuse the nearest compatible note asset.')
  }

  return {
    inspection: {
      name: archive.name,
      format: 'osu!mania skin',
      fileCount: archive.files.length,
      keyModes,
      mappings,
      warnings,
    },
    mania,
    assets,
    bodyStyle: Math.max(0, Math.min(2, Number(mania.values.get('notebodystyle')) || 0)),
  }
}

function parseRedirections(noteSkinLua: string): Map<string, string> {
  const redirects = new Map<string, string>()
  for (const tableMatch of noteSkinLua.matchAll(/(?:RedirTable|ButtonRedirs?)\s*=\s*{([\s\S]*?)}/gi)) {
    for (const match of tableMatch[1].matchAll(/([A-Za-z0-9_]+)\s*=\s*["']([^"']+)["']/g)) {
      redirects.set(match[1].toLowerCase(), match[2])
    }
  }
  return redirects
}

function parseElementRedirections(noteSkinLua: string): Map<string, string> {
  const redirects = new Map<string, string>()
  for (const tableMatch of noteSkinLua.matchAll(/ElementRedirs?\s*=\s*{([\s\S]*?)}/gi)) {
    for (const match of tableMatch[1].matchAll(/\[?["']([^"']+)["']\]?\s*=\s*["']([^"']+)["']/g)) {
      redirects.set(match[1].toLowerCase(), match[2])
    }
  }
  return redirects
}

function parseBooleanTable(noteSkinLua: string, name: string): Map<string, boolean> {
  const values = new Map<string, boolean>()
  const table = noteSkinLua.match(new RegExp(`\\b${name}\\s*=\\s*{([\\s\\S]*?)}`, 'i'))?.[1]
  if (!table) return values
  for (const match of table.matchAll(/\[?["']?([^="'\],]+)["']?\]?\s*=\s*(true|false)/gi)) {
    values.set(match[1].trim().toLowerCase(), match[2].toLowerCase() === 'true')
  }
  return values
}

function parseNumberTable(noteSkinLua: string, name: string): Map<string, number> {
  const values = new Map<string, number>()
  const table = noteSkinLua.match(new RegExp(`\\b${name}\\s*=\\s*{([\\s\\S]*?)}`, 'i'))?.[1]
  if (!table) return values
  for (const match of table.matchAll(/\[?["']?([^="'\],]+)["']?\]?\s*=\s*(-?\d+(?:\.\d+)?)/g)) {
    values.set(match[1].trim().toLowerCase(), Number(match[2]))
  }
  return values
}

function redirectsHeadsToTap(noteSkinLua: string): boolean {
  return /(?:find\s*\(\s*sElement\s*,\s*["']Head["']|sElement\s*==\s*["'][^"']*Head[^"']*["'])[\s\S]{0,180}?(?:sElement|Element)\s*=\s*["']Tap Note["']/i.test(noteSkinLua)
}

type ActorTextureRole = 'default' | 'receptor-idle' | 'receptor-pressed'

interface ActorTextureReference {
  path: string
  renderWidth?: number
  renderHeight?: number
}

interface ResolvedActorTexture extends ActorTextureReference {
  entry: JSZipObject
}

function evaluateLuaString(expression: string, constants: Map<string, string>): string | null {
  const parts = expression.trim().replace(/[;,]\s*$/, '').split(/\s*\.\.\s*/)
  const result: string[] = []
  for (const rawPart of parts) {
    const part = rawPart.trim()
    const quoted = part.match(/^["']([^"']*)["']$/)
    if (quoted) {
      result.push(quoted[1])
      continue
    }
    if (constants.has(part)) {
      result.push(constants.get(part) || '')
      continue
    }
    return null
  }
  return result.join('')
}

function actorTextureReferences(source: string, sourceButton: string | undefined, role: ActorTextureRole): ActorTextureReference[] {
  const constants = new Map<string, string>()
  for (const match of source.matchAll(/(?:local\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']([^"']*)["']/g)) {
    constants.set(match[1], match[2])
  }
  if (sourceButton) {
    constants.set('direction', sourceButton)
    constants.set('sButton', sourceButton)
    constants.set('button', sourceButton)
  }
  let actorSource = source
  if (sourceButton) {
    const escaped = sourceButton.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const branch = source.match(new RegExp(`if\\s+Var\\s*["']Button["']\\s*==\\s*["']${escaped}["']\\s*then([\\s\\S]*?)(?=\\nend\\b)`, 'i'))
    if (branch) actorSource = branch[1]
  }

  const references: ActorTextureReference[] = []
  for (const match of actorSource.matchAll(/Texture\s*=\s*([^\r\n;]+)[;]?/gi)) {
    const expression = match[1].trim().replace(/,\s*$/, '')
    const getPath = expression.match(/NOTESKIN:GetPath\s*\(\s*(.*?)\s*,\s*(.*?)\s*\)\s*$/i)
    const pathButton = getPath ? evaluateLuaString(getPath[1], constants) : null
    const pathElement = getPath ? evaluateLuaString(getPath[2], constants) : null
    const value = getPath
      ? (pathButton !== null && pathElement !== null ? [pathButton, pathElement].filter(Boolean).join(' ') : null)
      : evaluateLuaString(expression, constants)
    if (!value || references.some((reference) => normalisePath(reference.path) === normalisePath(value))) continue
    const actorTail = actorSource.slice((match.index || 0) + match[0].length)
    const actorBlock = actorTail.slice(0, actorTail.search(/\n\s*};/) >= 0 ? actorTail.search(/\n\s*};/) : undefined)
    const zoomTo = actorBlock.match(/(?:self:)?zoomto\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\)/i)
    references.push({
      path: value,
      renderWidth: zoomTo ? Number(zoomTo[1]) : undefined,
      renderHeight: zoomTo ? Number(zoomTo[2]) : undefined,
    })
  }
  if (role !== 'default') {
    const preferred = role === 'receptor-pressed'
      ? /button pressed|pressed button|(?:^|\/)pressed\b/i
      : /button idle|idle button|(?:^|\/)release\b/i
    references.sort((left, right) => Number(!preferred.test(left.path)) - Number(!preferred.test(right.path)))
  }
  return references
}

async function inlineNoteSkinAsset(
  files: JSZipObject[],
  noteSkinLua: string,
  sourceButton: string,
  element: 'tap' | 'receptor',
  role: ActorTextureRole = 'default',
): Promise<ResolvedAsset> {
  const references = actorTextureReferences(noteSkinLua, sourceButton, role)
    .filter((reference) => element === 'tap'
      ? /tap note/i.test(reference.path)
      : /(?:^|\/)receptors?\//i.test(reference.path) || /\breceptor\b/i.test(reference.path))
  for (const reference of references) {
    const image = findEtternaTexture(files, [reference.path])
    if (!image) continue
    return {
      entry: image,
      source: image.name,
      status: 'mapped',
      renderWidth: reference.renderWidth,
      renderHeight: reference.renderHeight,
    }
  }
  return { entry: null, source: null, status: 'missing' }
}

async function textureFromActor(
  files: JSZipObject[],
  actorName: string,
  visited = new Set<string>(),
  sourceButton?: string,
  role: ActorTextureRole = 'default',
): Promise<ResolvedActorTexture | null> {
  const lookup = normalisePath(actorName)
  if (visited.has(lookup)) return null
  visited.add(lookup)

  const actorFiles = files.filter((entry) => /\.(lua|redir)$/i.test(entry.name))
  const actor = findFile(actorFiles, [`${actorName}.lua`])
  if (!actor) {
    const redir = findFile(actorFiles, [`${actorName}.redir`])
    if (!redir) return null
    const target = (await readText(redir)).trim().replace(/\.(lua|png)$/i, '')
    const redirected = await textureFromActor(files, target, visited, sourceButton, role)
    const image = findImage(files, [target])
    return redirected || (image ? { entry: image, path: image.name } : null)
  }
  const source = await readText(actor)
  for (const reference of actorTextureReferences(source, sourceButton, role)) {
    const image = findEtternaTexture(files, [reference.path])
    if (image) return { ...reference, entry: image }
  }
  const getPath = source.match(/NOTESKIN:GetPath\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/i)
  if (getPath) {
    const target = `${getPath[1]} ${getPath[2]}`
    const image = findEtternaTexture(files, [target, `${getPath[1]}${getPath[2]}`])
    if (image) return { entry: image, path: image.name }
    if (/LoadActor\s*\(\s*NOTESKIN:GetPath/i.test(source)) return textureFromActor(files, target, visited, sourceButton, role)
  }
  return null
}

async function etternaAsset(
  files: JSZipObject[],
  base: string,
  element: string,
  fallbacks: string[] = [],
  actorAliases: string[] = [],
  sourceButton?: string,
  role: ActorTextureRole = 'default',
): Promise<ResolvedAsset> {
  for (const actorElement of [element, ...actorAliases]) {
    const actorName = /^Fallback\b/i.test(actorElement) ? actorElement : `${base} ${actorElement}`
    const actorAsset = await textureFromActor(files, actorName, new Set<string>(), sourceButton, role)
    if (actorAsset) return {
      entry: actorAsset.entry,
      source: actorAsset.entry.name,
      status: 'mapped',
      renderWidth: actorAsset.renderWidth,
      renderHeight: actorAsset.renderHeight,
    }
  }
  const direct = findImage(files, [`${base} ${element}`, ...fallbacks])
  if (direct) return { entry: direct, source: direct.name, status: 'mapped' }
  return { entry: null, source: null, status: 'missing' }
}

async function inspectEtterna(archive: LoadedArchive): Promise<{
  inspection: SkinInspection
  assets: ResolvedAsset[][]
  rotations: { tap: number; head: number; receptor: number }[]
}> {
  const noteSkinFile = findFile(archive.files, ['NoteSkin.lua'])
  const metricsFile = findFile(archive.files, ['metrics.ini'])
  if (!noteSkinFile && !metricsFile) {
    throw new Error('No NoteSkin.lua or metrics.ini was found. Select an Etterna noteskin archive, not a theme archive.')
  }
  const noteSkinLua = noteSkinFile ? await readText(noteSkinFile) : ''
  const redirects = parseRedirections(noteSkinLua)
  const elementRedirects = parseElementRedirections(noteSkinLua)
  const partsToRotate = parseBooleanTable(noteSkinLua, 'PartsToRotate')
  const buttonRotations = parseNumberTable(noteSkinLua, 'Rotate')
  const headsUseTap = redirectsHeadsToTap(noteSkinLua)
    || elementRedirects.get('hold head active')?.toLowerCase() === 'tap note'

  const assets = await Promise.all(DANCE_COLUMNS.map(async (column) => {
    const base = redirects.get(column.toLowerCase()) || column
    const inlineTap = await inlineNoteSkinAsset(archive.files, noteSkinLua, column, 'tap')
    const tap = inlineTap.entry
      ? inlineTap
      : await etternaAsset(archive.files, base, 'Tap Note', [`${column} Tap Note`, '_arrow', '_tap note'], [], column)
    const inlineReceptor = await inlineNoteSkinAsset(archive.files, noteSkinLua, column, 'receptor', 'receptor-idle')
    const receptor = inlineReceptor.entry
      ? inlineReceptor
      : await etternaAsset(archive.files, base, 'Receptor', ['_receptor'], [], column, 'receptor-idle')
    const inlineReceptorPressed = await inlineNoteSkinAsset(archive.files, noteSkinLua, column, 'receptor', 'receptor-pressed')
    const receptorPressed = inlineReceptorPressed.entry
      ? inlineReceptorPressed
      : await etternaAsset(archive.files, base, 'Receptor', ['_receptor'], [], column, 'receptor-pressed')
    const head = headsUseTap
      ? { ...tap }
      : await etternaAsset(archive.files, base, 'Hold Head Active', [
        `${base} Hold Head Inactive`,
        tap.source || '',
      ], ['Hold Head'], column)
    const body = await etternaAsset(archive.files, base, 'Hold Body Active', [
      `${base} Hold Body Inactive`,
      'Fallback Hold Body active',
    ], ['Fallback Hold Body Active'], column)
    const tail = await etternaAsset(archive.files, base, 'Hold BottomCap Active', [
      `${base} Hold BottomCap Inactive`,
      `${base} Hold Tail Active`,
      `${base} Hold Tail Inactive`,
    ], [], column)
    return [tap, head, body, tail, receptor, receptorPressed]
  }))
  const rotations = DANCE_COLUMNS.map((column) => {
    const degrees = buttonRotations.get(column.toLowerCase()) || 0
    return {
      tap: partsToRotate.get('tap note') ? degrees : 0,
      head: partsToRotate.get('hold head active') ? degrees : 0,
      receptor: partsToRotate.get('receptor') ? degrees : 0,
    }
  })

  const mappings = assets.flatMap((lane, index) => [
    mapping(`osu!mania lane ${index + 1} note`, lane[0]),
    mapping(`osu!mania lane ${index + 1} hold head`, lane[1]),
    mapping(`osu!mania lane ${index + 1} hold body`, lane[2]),
    mapping(`osu!mania lane ${index + 1} hold tail`, lane[3]),
    mapping(`osu!mania lane ${index + 1} key`, lane[4]),
    mapping(`osu!mania lane ${index + 1} pressed key`, lane[5]),
  ])
  if (assets.every((lane) => !lane[0].entry)) {
    throw new Error('Henkan could not find a usable tap-note image. This noteskin may create textures at runtime or use a Lua path pattern that is not supported yet.')
  }

  const warnings = [
    'Etterna Lua motion, quantisation colours, mines, explosions, and theme judgements cannot be represented by osu!mania skin.ini.',
  ]
  if (mappings.some((item) => item.status === 'missing')) {
    warnings.push('Some hold or receptor textures are missing; Henkan will derive conservative fallbacks from the tap notes.')
  }

  return {
    inspection: {
      name: archive.name,
      format: 'Etterna noteskin',
      fileCount: archive.files.length,
      keyModes: [4],
      mappings,
      warnings,
    },
    assets,
    rotations,
  }
}

function spriteGrid(filename: string): { columns: number; rows: number } {
  const match = filename.match(/(?:^|\s)(\d+)x(\d+)(?:\s|\.|\()/i)
  return match
    ? { columns: Math.max(1, Number(match[1])), rows: Math.max(1, Number(match[2])) }
    : { columns: 1, rows: 1 }
}

async function rasterise(entry: JSZipObject, cropSheet = true): Promise<RasterAsset> {
  const source = await entry.async('blob')
  let image: DecodedImage
  try {
    image = await decodeImage(source)
  } catch {
    throw new Error(`Could not decode ${entry.name}. Convert that asset to PNG and try again.`)
  }
  if (image.width * image.height > MAX_IMAGE_PIXELS) {
    image.close()
    throw new Error(`${entry.name} exceeds the 50-megapixel image safety limit.`)
  }
  const grid = cropSheet ? spriteGrid(entry.name) : { columns: 1, rows: 1 }
  const density = /@2x|\(doubleres\)/i.test(entry.name) ? 2 : 1
  const sourceWidth = Math.max(1, Math.floor(image.width / grid.columns))
  const sourceHeight = Math.max(1, Math.floor(image.height / grid.rows))
  // Keep every converted gameplay sprite in osu!'s HD coordinate space.
  // Native Etterna doubleres pixels are retained; standard-resolution input
  // is promoted to the matching @2x canvas instead of mixing densities.
  const width = Math.max(1, Math.round(sourceWidth * 2 / density))
  const height = Math.max(1, Math.round(sourceHeight * 2 / density))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas image conversion is unavailable in this environment.')
  context.drawImage(image.source, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height)
  image.close()
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error(`Could not encode ${entry.name}.`)), 'image/png')
  })
  return { blob, width, height }
}

async function resizeRaster(asset: RasterAsset, width?: number, height?: number): Promise<RasterAsset> {
  const targetWidth = width && width > 0 ? Math.round(width) : asset.width
  const targetHeight = height && height > 0 ? Math.round(height) : asset.height
  if (targetWidth === asset.width && targetHeight === asset.height) return asset
  const image = await decodeImage(asset.blob)
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas image conversion is unavailable in this environment.')
  context.drawImage(image.source, 0, 0, targetWidth, targetHeight)
  image.close()
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not resize an Etterna sprite.')), 'image/png')
  })
  return { blob, width: targetWidth, height: targetHeight }
}

async function rasteriseResolved(asset: ResolvedAsset, cropSheet = true): Promise<RasterAsset> {
  if (!asset.entry) throw new Error('Could not rasterise a missing skin asset.')
  return resizeRaster(
    await rasterise(asset.entry, cropSheet),
    asset.renderWidth ? asset.renderWidth * 2 : undefined,
    asset.renderHeight ? asset.renderHeight * 2 : undefined,
  )
}

async function bodyFromTap(tap: RasterAsset): Promise<RasterAsset> {
  const image = await decodeImage(tap.blob)
  const height = Math.min(12, Math.max(4, Math.round(tap.height / 6)))
  const sourceY = Math.max(0, Math.floor((tap.height - height) / 2))
  const canvas = document.createElement('canvas')
  canvas.width = tap.width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas image conversion is unavailable in this environment.')
  context.drawImage(image.source, 0, sourceY, tap.width, height, 0, 0, tap.width, height)
  image.close()
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not derive a hold body.')), 'image/png')
  })
  return { blob, width: tap.width, height }
}

async function joinTapHeadToBody(head: RasterAsset, body: RasterAsset): Promise<RasterAsset> {
  const [headImage, bodyImage] = await Promise.all([decodeImage(head.blob), decodeImage(body.blob)])
  const canvas = document.createElement('canvas')
  canvas.width = head.width
  canvas.height = head.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas image conversion is unavailable in this environment.')

  context.drawImage(headImage.source, 0, 0, head.width, head.height)
  const pattern = context.createPattern(bodyImage.source, 'repeat')
  if (!pattern) throw new Error('Could not join the Etterna hold head to its body.')
  context.fillStyle = pattern
  // Etterna draws the body through the upper half of tap-based hold heads.
  // Bake that overlap into one osu! sprite so independently dimmed,
  // antialiased layers cannot leave the tap circle visible inside the hold.
  context.fillRect(0, 0, head.width, Math.ceil(head.height / 2) + 1)
  headImage.close()
  bodyImage.close()

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not build a seamless hold head.')), 'image/png')
  })
  return { blob, width: canvas.width, height: canvas.height }
}

async function joinTailToBody(tail: RasterAsset, body: RasterAsset): Promise<RasterAsset> {
  const [tailImage, bodyImage] = await Promise.all([decodeImage(tail.blob), decodeImage(body.blob)])
  const canvas = document.createElement('canvas')
  canvas.width = tail.width
  canvas.height = tail.height * 2
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas image conversion is unavailable in this environment.')

  const pattern = context.createPattern(bodyImage.source, 'repeat')
  if (!pattern) throw new Error('Could not join the Etterna hold tail to its body.')
  context.fillStyle = pattern
  // osu! overlaps the inner half of a tail sprite with the body. Give it a
  // body-matching inner half so the rectangle begins only after the rounded
  // outer half has reached full width, instead of protruding through it.
  context.fillRect(0, 0, tail.width, tail.height)
  context.drawImage(tailImage.source, 0, tail.height, tail.width, tail.height)
  tailImage.close()
  bodyImage.close()

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not build a seamless hold tail.')), 'image/png')
  })
  return { blob, width: canvas.width, height: canvas.height }
}

async function rotateRaster(asset: RasterAsset, degrees: number): Promise<RasterAsset> {
  const angle = ((degrees % 360) + 360) % 360
  if (angle === 0) return asset
  const radians = angle * Math.PI / 180
  const sin = Math.abs(Math.sin(radians))
  const cos = Math.abs(Math.cos(radians))
  const width = Math.max(1, Math.round(asset.width * cos + asset.height * sin))
  const height = Math.max(1, Math.round(asset.width * sin + asset.height * cos))
  const image = await decodeImage(asset.blob)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas image conversion is unavailable in this environment.')
  context.translate(width / 2, height / 2)
  context.rotate(radians)
  context.drawImage(image.source, -asset.width / 2, -asset.height / 2)
  image.close()
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not rotate an Etterna sprite.')), 'image/png')
  })
  return { blob, width, height }
}

async function visibleBounds(asset: RasterAsset): Promise<{ minX: number; minY: number; width: number; height: number }> {
  const image = await decodeImage(asset.blob)
  const canvas = document.createElement('canvas')
  canvas.width = asset.width
  canvas.height = asset.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas image conversion is unavailable in this environment.')
  context.drawImage(image.source, 0, 0, asset.width, asset.height)
  image.close()
  const pixels = context.getImageData(0, 0, asset.width, asset.height).data
  let minX = asset.width
  let minY = asset.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < asset.height; y++) {
    for (let x = 0; x < asset.width; x++) {
      if (pixels[(y * asset.width + x) * 4 + 3] <= 4) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }
  return maxX >= minX
    ? { minX, minY, width: maxX - minX + 1, height: maxY - minY + 1 }
    : { minX: 0, minY: 0, width: asset.width, height: asset.height }
}

async function isTwoAxisSymmetric(asset: RasterAsset): Promise<boolean> {
  const image = await decodeImage(asset.blob)
  const canvas = document.createElement('canvas')
  canvas.width = asset.width
  canvas.height = asset.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Canvas image conversion is unavailable in this environment.')
  context.drawImage(image.source, 0, 0, asset.width, asset.height)
  image.close()
  const pixels = context.getImageData(0, 0, asset.width, asset.height).data
  const opaque = (x: number, y: number) => pixels[(y * asset.width + x) * 4 + 3] > 16
  let horizontalMismatch = 0
  let verticalMismatch = 0
  let compared = 0
  for (let y = 0; y < asset.height; y++) {
    for (let x = 0; x < asset.width; x++) {
      const value = opaque(x, y)
      if (value !== opaque(asset.width - x - 1, y)) horizontalMismatch++
      if (value !== opaque(x, asset.height - y - 1)) verticalMismatch++
      compared++
    }
  }
  // Circles tolerate a little source-frame and antialiasing asymmetry. A
  // directional arrow necessarily fails at least one mirrored axis.
  return horizontalMismatch / compared < 0.06 && verticalMismatch / compared < 0.06
}

async function cascadeHoldBody(body: RasterAsset, cap: RasterAsset | null): Promise<RasterAsset> {
  const bodyImage = await decodeImage(body.blob)
  const capImage = cap ? await decodeImage(cap.blob) : null
  const canvas = document.createElement('canvas')
  canvas.width = body.width
  // Cascade bodies wrap when osu! exhausts the texture. Keep the one rounded
  // release cap outside the range reached by ordinary long notes and high
  // scroll speeds; in SD coordinates this provides an 8192px cascade.
  canvas.height = OSU_CASCADE_HEIGHT
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas image conversion is unavailable in this environment.')

  // The separate tail disappears as soon as a hold is released. Put the same
  // rounded end at the start of the body atlas so the remaining clipped body
  // does not reveal a flat rectangle for its final frame.
  if (cap && capImage) {
    context.save()
    context.translate(0, cap.height)
    context.scale(1, -1)
    context.drawImage(capImage.source, 0, 0, cap.width, cap.height)
    context.restore()
  }

  const pattern = context.createPattern(bodyImage.source, 'repeat')
  if (!pattern) throw new Error('Could not repeat the Etterna hold body for osu!.')
  context.fillStyle = pattern
  const bodyStart = cap?.height || 0
  context.fillRect(0, bodyStart, canvas.width, canvas.height - bodyStart)
  bodyImage.close()
  capImage?.close()

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not build a seamless osu! hold body.')), 'image/png')
  })
  return { blob, width: canvas.width, height: canvas.height }
}

async function keyFromReceptor(
  receptor: RasterAsset,
  tap: RasterAsset,
  hitPosition: number,
  columnWidth: number,
): Promise<RasterAsset> {
  const image = await decodeImage(receptor.blob)
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = receptor.width
  sourceCanvas.height = receptor.height
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) throw new Error('Canvas image conversion is unavailable in this environment.')
  sourceContext.drawImage(image.source, 0, 0, receptor.width, receptor.height)
  image.close()

  const receptorBounds = await visibleBounds(receptor)
  const tapBounds = await visibleBounds(tap)
  const { minX, minY } = receptorBounds
  const sourceWidth = receptorBounds.width
  const sourceHeight = receptorBounds.height
  // osu!mania scales KeyImage from its conventional 100px-wide canvas to
  // the configured column width, while notes are scaled from their own
  // canvas. Compensate for both canvas scales so their visible widths meet
  // in-game, without distorting the receptor's aspect ratio.
  const targetArtworkWidth = Math.min(
    OSU_RECEPTOR_LAYOUT.artworkWidth,
    tapBounds.width * OSU_RECEPTOR_LAYOUT.width / tap.width,
  )
  const scale = Math.min(
    targetArtworkWidth / sourceWidth,
    OSU_RECEPTOR_LAYOUT.artworkHeight / sourceHeight,
  )
  const drawWidth = Math.max(1, Math.round(sourceWidth * scale))
  const drawHeight = Math.max(1, Math.round(sourceHeight * scale))
  const drawX = OSU_RECEPTOR_LAYOUT.artworkX + Math.round((OSU_RECEPTOR_LAYOUT.artworkWidth - drawWidth) / 2)
  // KeyImage itself stays anchored by osu!mania. Move the artwork inside its
  // transparent HD canvas by the same screen-space delta as HitPosition so
  // receptors remain centred on the note hit point.
  const hitPositionOffset = Math.round(
    (hitPosition - DEFAULT_OSU_HIT_POSITION) * OSU_RECEPTOR_LAYOUT.width / columnWidth,
  )
  const drawY = OSU_RECEPTOR_LAYOUT.artworkY
    + hitPositionOffset
    + Math.round((OSU_RECEPTOR_LAYOUT.artworkHeight - drawHeight) / 2)

  const canvas = document.createElement('canvas')
  canvas.width = OSU_RECEPTOR_LAYOUT.width
  canvas.height = OSU_RECEPTOR_LAYOUT.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas image conversion is unavailable in this environment.')
  context.drawImage(sourceCanvas, minX, minY, sourceWidth, sourceHeight, drawX, drawY, drawWidth, drawHeight)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not place an Etterna receptor on the osu! key canvas.')), 'image/png')
  })
  return { blob, width: OSU_RECEPTOR_LAYOUT.width, height: OSU_RECEPTOR_LAYOUT.height }
}

async function sdRaster(asset: RasterAsset): Promise<RasterAsset> {
  return resizeRaster(asset, Math.max(1, Math.round(asset.width / 2)), Math.max(1, Math.round(asset.height / 2)))
}

async function transparentPng(): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not create the blank stage image.')), 'image/png')
  })
}

async function sameRaster(left: RasterAsset, right: RasterAsset): Promise<boolean> {
  if (left.width !== right.width || left.height !== right.height || left.blob.size !== right.blob.size) return false
  const [leftBytes, rightBytes] = await Promise.all([left.blob.arrayBuffer(), right.blob.arrayBuffer()])
  const a = new Uint8Array(leftBytes)
  const b = new Uint8Array(rightBytes)
  return a.every((value, index) => value === b[index])
}

function mergeTemplateSkinIni(
  template: string,
  skinName: string,
  gameplayLines: string[],
  hitPosition: number,
  columnWidth: number,
): string {
  let result = template.replace(/\r\n/g, '\n')
  const headers = [...result.matchAll(/^\[([^\]]+)]\s*$/gm)]
  const maniaIndex = headers.findIndex((header, index) => {
    if (header[1].toLowerCase() !== 'mania') return false
    const end = headers[index + 1]?.index ?? result.length
    return /^\s*Keys\s*:\s*4\s*$/im.test(result.slice(header.index, end))
  })
  if (maniaIndex < 0) throw new Error('The bundled osu! template does not contain a 4K [Mania] section.')

  const maniaStart = headers[maniaIndex].index
  const maniaEnd = headers[maniaIndex + 1]?.index ?? result.length
  const maniaLines = result.slice(maniaStart, maniaEnd).split('\n')
    .map((line) => {
      if (/^\s*HitPosition\s*:/i.test(line)) return `HitPosition: ${hitPosition}`
      if (/^\s*ColumnWidth\s*:/i.test(line)) {
        const count = line.split(',').length || 4
        return `ColumnWidth: ${Array(count).fill(columnWidth).join(',')}`
      }
      return line
    })
    .filter((line) => !/^\s*`?(?:(?:KeyImage|NoteImage)\d+(?:D|H|L|T)?|NoteBodyStyle(?:\d+)?|NoteFlipWhenUpsideDown\d+T)\s*:/i.test(line))
  const imageIndex = maniaLines.findIndex((line) => /^\s*Hit0\s*:/i.test(line))
  maniaLines.splice(imageIndex < 0 ? maniaLines.length : imageIndex, 0, '// Converted notes and receptors', ...gameplayLines, '')
  result = `${result.slice(0, maniaStart)}${maniaLines.join('\n')}${result.slice(maniaEnd)}`

  const refreshedHeaders = [...result.matchAll(/^\[([^\]]+)]\s*$/gm)]
  const generalIndex = refreshedHeaders.findIndex((header) => header[1].toLowerCase() === 'general')
  if (generalIndex >= 0) {
    const start = refreshedHeaders[generalIndex].index
    const end = refreshedHeaders[generalIndex + 1]?.index ?? result.length
    const general = result.slice(start, end).replace(/^\s*Name\s*:[^\n]*$/im, `Name: ${skinName}`)
    result = `${result.slice(0, start)}${general}${result.slice(end)}`
  }
  return result.endsWith('\n') ? result : `${result}\n`
}

async function receptorFromOsuKey(entry: JSZipObject): Promise<RasterAsset> {
  const key = await rasterise(entry, false)
  const image = await decodeImage(key.blob)
  const sourceCanvas = document.createElement('canvas')
  sourceCanvas.width = key.width
  sourceCanvas.height = key.height
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) throw new Error('Canvas image conversion is unavailable in this environment.')
  sourceContext.drawImage(image.source, 0, 0, key.width, key.height)
  image.close()

  const pixels = sourceContext.getImageData(0, 0, key.width, key.height).data
  // Key images sometimes contain a separate key-light or indicator far away
  // from the receptor itself. Cropping all non-transparent pixels together
  // crushes the receptor when that image is adapted to Etterna. Keep the
  // largest connected piece of artwork instead.
  const visited = new Uint8Array(key.width * key.height)
  const queue = new Int32Array(key.width * key.height)
  let minX = key.width
  let minY = key.height
  let maxX = -1
  let maxY = -1
  let largest = 0
  for (let start = 0; start < visited.length; start++) {
    if (visited[start] || pixels[start * 4 + 3] <= 4) continue
    let head = 0
    let tail = 0
    let componentMinX = key.width
    let componentMinY = key.height
    let componentMaxX = -1
    let componentMaxY = -1
    queue[tail++] = start
    visited[start] = 1
    while (head < tail) {
      const position = queue[head++]
      const x = position % key.width
      const y = Math.floor(position / key.width)
      componentMinX = Math.min(componentMinX, x)
      componentMinY = Math.min(componentMinY, y)
      componentMaxX = Math.max(componentMaxX, x)
      componentMaxY = Math.max(componentMaxY, y)
      for (let adjacentY = Math.max(0, y - 1); adjacentY <= Math.min(key.height - 1, y + 1); adjacentY++) {
        for (let adjacentX = Math.max(0, x - 1); adjacentX <= Math.min(key.width - 1, x + 1); adjacentX++) {
          const adjacent = adjacentY * key.width + adjacentX
          if (visited[adjacent] || pixels[adjacent * 4 + 3] <= 4) continue
          visited[adjacent] = 1
          queue[tail++] = adjacent
        }
      }
    }
    if (tail > largest) {
      largest = tail
      minX = componentMinX
      minY = componentMinY
      maxX = componentMaxX
      maxY = componentMaxY
    }
  }
  if (maxX < minX || maxY < minY) return transparentRaster(128, 128)

  const sourceWidth = maxX - minX + 1
  const sourceHeight = maxY - minY + 1
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas image conversion is unavailable in this environment.')
  context.drawImage(
    sourceCanvas,
    minX, minY, sourceWidth, sourceHeight,
    0, 0, canvas.width, canvas.height,
  )
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error(`Could not crop ${entry.name}.`)), 'image/png')
  })
  return { blob, width: canvas.width, height: canvas.height }
}

async function transparentRaster(width: number, height: number): Promise<RasterAsset> {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not create a transparent skin texture.')), 'image/png')
  })
  return { blob, width, height }
}

function clearConnectedEdgeBackground(context: CanvasRenderingContext2D, width: number, height: number): void {
  const image = context.getImageData(0, 0, width, height)
  const pixels = image.data
  const reference = [pixels[0], pixels[1], pixels[2], pixels[3]]
  if (reference[3] === 0) return
  const matches = (index: number) => pixels[index + 3] > 0
    && Math.abs(pixels[index] - reference[0]) <= 8
    && Math.abs(pixels[index + 1] - reference[1]) <= 8
    && Math.abs(pixels[index + 2] - reference[2]) <= 8
  const visited = new Uint8Array(width * height)
  const queue: number[] = []
  const enqueue = (x: number, y: number) => {
    const pixel = y * width + x
    if (visited[pixel] || !matches(pixel * 4)) return
    visited[pixel] = 1
    queue.push(pixel)
  }
  for (let x = 0; x < width; x++) {
    enqueue(x, 0)
    enqueue(x, height - 1)
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(0, y)
    enqueue(width - 1, y)
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const pixel = queue[cursor]
    const x = pixel % width
    const y = Math.floor(pixel / width)
    pixels[pixel * 4 + 3] = 0
    if (x > 0) enqueue(x - 1, y)
    if (x + 1 < width) enqueue(x + 1, y)
    if (y > 0) enqueue(x, y - 1)
    if (y + 1 < height) enqueue(x, y + 1)
  }
  context.putImageData(image, 0, 0)
}

async function noteFromOsuImage(entry: JSZipObject, kind: 'note' | 'body' | 'tail', bodyStyle = 0): Promise<RasterAsset> {
  const source = await entry.async('blob')
  let image: DecodedImage | null = null
  let pixels: DecodedPixels | null = null
  try {
    image = await decodeImage(source)
  } catch {
    pixels = await decodeImagePixels(source)
  }
  const imageWidth = image?.width ?? pixels!.width
  const imageHeight = image?.height ?? pixels!.height
  if (imageWidth * imageHeight > MAX_IMAGE_PIXELS) {
    image?.close()
    throw new Error(`${entry.name} exceeds the 50-megapixel image safety limit.`)
  }
  const grid = kind === 'note' ? spriteGrid(entry.name) : { columns: 1, rows: 1 }
  const sourceWidth = Math.max(1, Math.floor(imageWidth / grid.columns))
  const sourceHeight = Math.max(1, Math.floor(imageHeight / grid.rows))
  const cropTallTexture = kind === 'body' || (kind === 'tail' && sourceHeight > sourceWidth * 4)
  // Etterna repeats hold bodies.  A short strip avoids a visible join where
  // Etterna switches from the cap mesh to the body mesh, and also avoids
  // resampling absurdly tall osu!mania LN textures on every hold.
  const cascadingBody = kind === 'body' && bodyStyle !== 0 && sourceHeight > sourceWidth * 4
  // Browsers reject otherwise valid PNGs whose dimensions exceed their
  // canvas limit. Etterna accepts these cascade textures, so preserve the
  // source bytes when no browser-sized transformation is required.
  if (cascadingBody && pixels && sourceWidth <= 512) {
    return { blob: source.slice(0, source.size, 'image/png'), width: sourceWidth, height: sourceHeight }
  }
  const cropHeight = cascadingBody
    ? sourceHeight
    : kind === 'body' && sourceHeight > sourceWidth * 4
      ? Math.min(2, sourceHeight)
      : cropTallTexture
        ? Math.min(sourceHeight, sourceWidth)
        : sourceHeight
  const cropY = cropTallTexture && !cascadingBody
      ? Math.max(0, Math.floor((sourceHeight - cropHeight) / 2))
      : 0
  const effectiveCropHeight = cropHeight
  const targetWidth = Math.max(1, Math.min(512, sourceWidth))
  const targetHeight = kind === 'body'
    ? Math.max(1, effectiveCropHeight <= 2 ? effectiveCropHeight : Math.round(effectiveCropHeight * targetWidth / sourceWidth))
    : Math.max(1, Math.min(512, Math.round(effectiveCropHeight * targetWidth / sourceWidth)))
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas image conversion is unavailable in this environment.')
  if (image) {
    context.drawImage(image.source, 0, cropY, sourceWidth, effectiveCropHeight, 0, 0, targetWidth, targetHeight)
  } else {
    drawPixelRegion(context, pixels!, 0, cropY, sourceWidth, effectiveCropHeight, 0, 0, targetWidth, targetHeight)
  }
  if (kind === 'body') clearConnectedEdgeBackground(context, targetWidth, targetHeight)
  image?.close()
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error(`Could not resize ${entry.name} for Etterna.`)), 'image/png')
  })
  return { blob, width: targetWidth, height: targetHeight }
}

async function tailFromOsuImages(tailEntry: JSZipObject, bodyEntry: JSZipObject, bodyStyle = 0): Promise<RasterAsset> {
  const tailSource = await tailEntry.async('blob')
  const tailImage = await decodeImage(tailSource)
  const tailCanvas = document.createElement('canvas')
  tailCanvas.width = tailImage.width
  tailCanvas.height = tailImage.height
  const tailContext = tailCanvas.getContext('2d', { willReadFrequently: true })
  if (!tailContext) throw new Error('Canvas image conversion is unavailable in this environment.')
  tailContext.drawImage(tailImage.source, 0, 0)
  const tailPixels = tailContext.getImageData(0, 0, tailImage.width, tailImage.height).data
  let tailHasVisiblePixels = false
  for (let index = 3; index < tailPixels.length; index += 4) {
    if (tailPixels[index] > 4) {
      tailHasVisiblePixels = true
      break
    }
  }
  const tailIsOnlyASeam = !tailHasVisiblePixels
    || tailImage.height <= Math.max(2, Math.floor(tailImage.width / 16))
  tailImage.close()
  if (!tailIsOnlyASeam) return noteFromOsuImage(tailEntry, 'tail', bodyStyle)
  // Cascade-style osu!mania bodies already contain their rounded endpoint.
  // Keep it in the continuous body mesh and retain the explicit (often
  // transparent) NoteImageT as Etterna's cap instead of splitting the art.
  if (bodyStyle !== 0) return noteFromOsuImage(tailEntry, 'tail', bodyStyle)

  const bodySource = await bodyEntry.async('blob')
  let bodyImage: DecodedImage | null = null
  let bodyPixels: DecodedPixels | null = null
  try {
    bodyImage = await decodeImage(bodySource)
  } catch {
    bodyPixels = await decodeImagePixels(bodySource)
  }
  const bodyWidth = bodyImage?.width ?? bodyPixels!.width
  const bodyHeight = bodyImage?.height ?? bodyPixels!.height
  const capSize = Math.min(bodyWidth, bodyHeight)
  if (bodyHeight < capSize * 2) {
    bodyImage?.close()
    return noteFromOsuImage(tailEntry, 'tail', bodyStyle)
  }

  // Some osu!mania skins put the visible LN endpoint at the top of a very
  // tall body texture and leave NoteImageT as a one-pixel seam. Preserve that
  // endpoint instead of flattening the hold when creating Etterna's cap.
  const canvas = document.createElement('canvas')
  const targetSize = Math.max(1, Math.min(512, bodyWidth))
  canvas.width = targetSize
  canvas.height = targetSize
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas image conversion is unavailable in this environment.')
  if (bodyImage) {
    context.drawImage(bodyImage.source, 0, 0, bodyWidth, capSize, 0, 0, targetSize, targetSize)
  } else {
    drawPixelRegion(context, bodyPixels!, 0, 0, bodyWidth, capSize, 0, 0, targetSize, targetSize)
  }
  const joinRows = Math.min(4, capSize)
  const bodySliceY = bodyStyle === 0
    ? Math.max(0, Math.floor((bodyHeight - capSize) / 2))
    : Math.min(bodyHeight - joinRows, capSize)
  if (bodyImage) {
    context.drawImage(
      bodyImage.source,
      0, bodySliceY, bodyWidth, joinRows,
      0, targetSize - joinRows, targetSize, joinRows,
    )
  } else {
    drawPixelRegion(context, bodyPixels!, 0, bodySliceY, bodyWidth, joinRows, 0, targetSize - joinRows, targetSize, joinRows)
  }
  clearConnectedEdgeBackground(context, targetSize, targetSize)
  bodyImage?.close()
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error(`Could not extract the long-note cap from ${bodyEntry.name}.`)), 'image/png')
  })
  return { blob, width: targetSize, height: targetSize }
}

function etternaNoteSkinLua(): string {
  return `local ret = {}\n\nret.ButtonRedir = {\n\tLeft = "Left",\n\tDown = "Down",\n\tUp = "Up",\n\tRight = "Right",\n\tUpLeft = "Left",\n\tUpRight = "Right",\n\tDownLeft = "Left",\n\tDownRight = "Right"\n}\n\nret.ElementRedir = {\n\t["Tap Fake"] = "Tap Note",\n\t["Roll Head Active"] = "Hold Head Active",\n\t["Roll Head Inactive"] = "Hold Head Inactive",\n\t["Roll Body Active"] = "Hold Body Active",\n\t["Roll Body Inactive"] = "Hold Body Inactive",\n\t["Hold TopCap Active"] = "Hold Topcap Active",\n\t["Hold TopCap Inactive"] = "Hold Topcap Inactive",\n\t["Roll TopCap Active"] = "Hold Topcap Active",\n\t["Roll TopCap Inactive"] = "Hold Topcap Inactive",\n\t["Roll Topcap Active"] = "Hold Topcap Active",\n\t["Roll Topcap Inactive"] = "Hold Topcap Inactive",\n\t["Hold BottomCap Active"] = "Hold Bottomcap Active",\n\t["Hold BottomCap Inactive"] = "Hold Bottomcap Inactive",\n\t["Roll BottomCap Active"] = "Hold Bottomcap Active",\n\t["Roll BottomCap Inactive"] = "Hold Bottomcap Inactive",\n\t["Roll Bottomcap Active"] = "Hold Bottomcap Active",\n\t["Roll Bottomcap Inactive"] = "Hold Bottomcap Inactive"\n}\n\nret.LocalElements = {\n\t["Tap Note"] = true,\n\t["Hold Head Active"] = true,\n\t["Hold Head Inactive"] = true,\n\t["Hold Body Active"] = true,\n\t["Hold Body Inactive"] = true,\n\t["Hold Topcap Active"] = true,\n\t["Hold Topcap Inactive"] = true,\n\t["Hold Bottomcap Active"] = true,\n\t["Hold Bottomcap Inactive"] = true,\n\t["Receptor"] = true\n}\n\nret.PartsToRotate = {}\nret.Blank = {\n\t["Tap Explosion Bright"] = true,\n\t["Tap Explosion Dim"] = true,\n\t["Hold Explosion"] = true,\n\t["Roll Explosion"] = true,\n\t["Hold Tail Active"] = true,\n\t["Hold Tail Inactive"] = true,\n\t["Roll Tail Active"] = true,\n\t["Roll Tail Inactive"] = true\n}\n\nfunction ret.Load()\n\tlocal sourceButton = Var "Button"\n\tlocal sourceElement = Var "Element"\n\n\tif ret.Blank[sourceElement] then\n\t\tif Var "SpriteOnly" then return LoadActor(NOTESKIN:GetPath("", "_blank")) end\n\t\treturn Def.Actor {}\n\tend\n\n\tlocal button = ret.ButtonRedir[sourceButton] or sourceButton\n\tlocal element = ret.ElementRedir[sourceElement] or sourceElement\n\tif not ret.LocalElements[element] then button = "Down" end\n\treturn LoadActor(NOTESKIN:GetPath(button, element))\nend\n\nreturn ret\n`
}

function etternaMetrics(): string {
  return `[Global]\nFallbackNoteSkin=default\n\n[NoteDisplay]\nTapNoteAnimationIsVivid=0\nDrawHoldHeadForTapsOnSameRow=1\nTapNoteAnimationLength=1\nTapAdditionAnimationLength=1\nTapMineAnimationLength=1\nTapLiftAnimationLength=1\nTapFakeAnimationLength=1\nHoldHeadAnimationLength=1\nHoldTopCapAnimationLength=1\nHoldBottomCapAnimationLength=1\nHoldBodyAnimationLength=1\nHoldTailAnimationLength=1\nTapNoteNoteColorTextureCoordSpacingX=0\nTapNoteNoteColorTextureCoordSpacingY=0\nTapFakeNoteColorTextureCoordSpacingX=0\nTapFakeNoteColorTextureCoordSpacingY=0\nHoldHeadNoteColorTextureCoordSpacingX=0\nHoldHeadNoteColorTextureCoordSpacingY=0\nHoldTopCapNoteColorTextureCoordSpacingX=0\nHoldTopCapNoteColorTextureCoordSpacingY=0\nHoldBodyNoteColorTextureCoordSpacingX=0\nHoldBodyNoteColorTextureCoordSpacingY=0\nHoldBottomCapNoteColorTextureCoordSpacingX=0\nHoldBottomCapNoteColorTextureCoordSpacingY=0\nHoldTailNoteColorTextureCoordSpacingX=0\nHoldTailNoteColorTextureCoordSpacingY=0\nUseStretchHolds=1\nUseShrinkHolds=1\nHoldActiveIsAddLayer=0\nStartDrawingHoldBodyOffsetFromHead=-1\nStopDrawingHoldBodyOffsetFromTail=-1\nHoldLetGoGrayPercent=.25\nHoldHeadIsAboveWavyParts=1\nHoldTailIsAboveWavyParts=1\nTopHoldAnchorWhenReverse=1\nReverseDrawOrder=1101\nFlipHeadAndTailWhenReverse=1\nFlipHoldBodyWhenReverse=1\n\n[ReceptorArrow]\nInitCommand=diffusealpha,1\nNoneCommand=finishtweening;diffusealpha,1\n\n[ReceptorOverlay]\nInitCommand=diffusealpha,0\nPressCommand=finishtweening;diffusealpha,0\nLiftCommand=finishtweening;diffusealpha,0\n`
}

function simpleActor(column: string, element: 'tap note'): string {
  return `local actor = Def.Sprite {\n\tTexture = NOTESKIN:GetPath("_${column.toLowerCase()}", "${element}"),\n\tFrame0000 = 0,\n\tDelay0000 = 1\n}\nreturn actor\n`
}

function receptorActor(column: string): string {
  const stem = `_${column.toLowerCase()} receptor`
  return `return Def.ActorFrame {
\tDef.Sprite {
\t\tTexture = NOTESKIN:GetPath("${stem}", "idle"),
\t\tInitCommand = function(self) self:visible(true) end,
\t\tPressCommand = function(self) self:visible(false) end,
\t\tLiftCommand = function(self) self:visible(true) end
\t},
\tDef.Sprite {
\t\tTexture = NOTESKIN:GetPath("${stem}", "pressed"),
\t\tInitCommand = function(self) self:visible(false) end,
\t\tPressCommand = function(self) self:visible(true) end,
\t\tLiftCommand = function(self) self:visible(false) end
\t}
}
`
}

function reportText(inspection: SkinInspection): string {
  const rows = inspection.mappings.map((item) =>
    `${item.status.toUpperCase().padEnd(8)} ${item.target} <- ${item.source || 'generated fallback'}`,
  )
  return [
    `Henkan skin conversion report`,
    `Source: ${inspection.name} (${inspection.format})`,
    '',
    ...rows,
    '',
    'Compatibility notes:',
    ...inspection.warnings.map((warning) => `- ${warning}`),
    '',
    'Generated by Henkan. Original artwork remains the property of its creator.',
  ].join('\n')
}

async function convertOsuToEtterna(input: File | string): Promise<SkinConversionResult> {
  const archive = await loadArchive(input)
  const { inspection, assets, bodyStyle } = await inspectOsu(archive)
  const JSZip = (await import('jszip')).default
  const output = new JSZip()
  const name = safeEtternaName(inspection.name)
  const noteskin = output.folder(name)
  if (!noteskin) throw new Error('Could not create the Etterna noteskin folder.')
  noteskin.file('NoteSkin.lua', etternaNoteSkinLua())
  noteskin.file('metrics.ini', etternaMetrics()
    .replace('UseStretchHolds=1', 'UseStretchHolds=0')
    .replace('FlipHoldBodyWhenReverse=1', 'FlipHoldBodyWhenReverse=0'))

  const firstTap = assets.map((lane) => lane[0].entry).find(Boolean) || null
  const noteCache = new Map<string, Promise<RasterAsset>>()
  const receptorCache = new Map<string, Promise<RasterAsset>>()
  for (let index = 0; index < DANCE_COLUMNS.length; index++) {
    const column = DANCE_COLUMNS[index]
    const lane = assets[index]
    const tap = lane[0].entry || firstTap
    if (!tap) continue
    const head = lane[1].entry || tap
    const body = lane[2].entry || tap
    const tail = lane[3].entry || head
    const receptor = lane[4].entry || tap
    const receptorPressed = lane[5].entry || receptor
    const addAsset = async (label: string, entry: JSZipObject, filename = `${column} ${label}.png`) => {
      let image: RasterAsset
      if (label === 'Receptor') {
        const cacheKey = entry.name.toLowerCase()
        if (!receptorCache.has(cacheKey)) receptorCache.set(cacheKey, receptorFromOsuKey(entry))
        image = await receptorCache.get(cacheKey)!
      } else {
        const kind = label.includes('Body')
          ? 'body'
          : /Topcap/i.test(label)
            ? 'endpoint'
            : /Bottomcap/i.test(label)
              ? 'tail'
              : 'note'
        const cacheKey = `${entry.name.toLowerCase()}|${kind}${kind === 'endpoint' ? `|${body.name.toLowerCase()}` : ''}`
        if (!noteCache.has(cacheKey)) {
          noteCache.set(cacheKey, kind === 'endpoint'
            ? tailFromOsuImages(entry, body, bodyStyle)
            : noteFromOsuImage(entry, kind, bodyStyle))
        }
        image = await noteCache.get(cacheKey)!
      }
      const textureName = label === 'Receptor'
        ? filename.replace(/\.png$/i, ' (doubleres).png')
        : filename.replace(/\.png$/i, ` (res 64x${Math.max(1, Math.round(image.height * 64 / image.width))}).png`)
      noteskin.file(textureName, image.blob)
    }
    await addAsset('Tap Note', tap, `_${column.toLowerCase()} tap note.png`)
    await addAsset('Hold Head Active', head)
    await addAsset('Hold Head Inactive', head)
    await addAsset('Hold Body Active', body)
    await addAsset('Hold Body Inactive', body)
    await addAsset('Hold Topcap Active', tail)
    await addAsset('Hold Topcap Inactive', tail)
    await addAsset('Hold Bottomcap Active', tail)
    await addAsset('Hold Bottomcap Inactive', tail)
    await addAsset('Receptor', receptor, `_${column.toLowerCase()} receptor idle.png`)
    await addAsset('Receptor', receptorPressed, `_${column.toLowerCase()} receptor pressed.png`)
    noteskin.file(`${column} Tap Note.lua`, simpleActor(column, 'tap note'))
    noteskin.file(`${column} Receptor.lua`, receptorActor(column))
  }

  noteskin.file('HENKAN-REPORT.txt', reportText(inspection))
  noteskin.file('HENKAN-INSTALL.txt', [
    'Etterna noteskin installation',
    '',
    '1. Close Etterna.',
    `2. Remove any older Etterna/NoteSkins/dance/${name} folder. Do not merge versions.`,
    '3. Extract this ZIP into Etterna/NoteSkins/dance.',
    `4. Confirm this file exists: Etterna/NoteSkins/dance/${name}/NoteSkin.lua`,
    '5. Start Etterna and select the new noteskin.',
    '',
    'Do not create another folder around the folder already in this ZIP.',
  ].join('\n'))
  return {
    blob: await output.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }),
    filename: `${safeName(inspection.name)}.zip`,
    inspection,
  }
}

async function convertEtternaToOsu(
  input: File | string,
  options: SkinConversionOptions = {},
): Promise<SkinConversionResult> {
  const archive = await loadArchive(input)
  const hitPosition = Math.max(
    MIN_OSU_HIT_POSITION,
    Math.min(MAX_OSU_HIT_POSITION, Math.round(options.hitPosition ?? DEFAULT_OSU_HIT_POSITION)),
  )
  const columnWidth = Math.max(
    MIN_OSU_COLUMN_WIDTH,
    Math.min(MAX_OSU_COLUMN_WIDTH, Math.round(options.columnWidth ?? DEFAULT_OSU_COLUMN_WIDTH)),
  )
  const { inspection, assets, rotations } = await inspectEtterna(archive)
  const JSZip = (await import('jszip')).default
  const templateUrl = new URL('templates/etterna-osu-base.osk', document.baseURI)
  const templateResponse = await fetch(templateUrl)
  if (!templateResponse.ok) throw new Error('The bundled osu! base skin could not be loaded.')
  const output = await JSZip.loadAsync(await templateResponse.arrayBuffer())
  const firstTapAsset = assets.map((lane) => lane[0]).find((asset) => asset.entry) || null
  if (!firstTapAsset) throw new Error('No usable tap note was found.')
  const firstTap = await rasteriseResolved(firstTapAsset)
  const rendered: {
    tap: RasterAsset
    head: RasterAsset
    body: RasterAsset
    tail: RasterAsset
    key: RasterAsset
    pressedKey: RasterAsset
  }[] = []

  for (let index = 0; index < DANCE_COLUMNS.length; index++) {
    const lane = assets[index]
    const rawTap = lane[0].entry ? await rasteriseResolved(lane[0]) : firstTap
    const rotatedTap = await rotateRaster(rawTap, rotations[index].tap)
    const rawHead = lane[1].entry ? await rasteriseResolved(lane[1]) : rawTap
    const rotatedHead = await rotateRaster(rawHead, rotations[index].head)
    const rawBody = lane[2].entry ? await rasteriseResolved(lane[2], false) : await bodyFromTap(rotatedTap)
    // osu! stable applies its own long-note tail orientation. Keep Etterna's
    // authored bottom-cap pixels here; pre-flipping them is flipped again by
    // the game and exposes the cap's flat edge at the release end.
    const rawTail = lane[3].entry ? await rasteriseResolved(lane[3]) : rotatedHead
    const rawReceptor = lane[4].entry ? await rasteriseResolved(lane[4]) : rawTap
    const receptor = await rotateRaster(rawReceptor, rotations[index].receptor)
    // Retain the authored transparent padding. keyFromReceptor uses this same
    // visible-to-canvas ratio, so taps, hold ends, and receptors display at
    // one diameter instead of expanding taps to the entire column.
    const tap = rotatedTap
    const fittedHead = rotatedHead
    // Preserve Etterna's transparent hold padding. The osu! key uses a wider
    // canvas than its visible receptor artwork, and expanding the hold art to
    // the complete note canvas makes the receptor ring appear inside the cap.
    const fittedBody = rawBody.width === rotatedTap.width
      ? rawBody
      : await resizeRaster(rawBody, rotatedTap.width, Math.max(1, Math.round(rawBody.height * rotatedTap.width / rawBody.width)))
    const fittedTail = rawTail.width === fittedBody.width
      ? rawTail
      : await resizeRaster(rawTail, fittedBody.width, Math.max(1, Math.round(rawTail.height * fittedBody.width / rawTail.width)))
    const tapBasedHead = await sameRaster(fittedHead, tap)
    const symmetricTapHead = tapBasedHead && await isTwoAxisSymmetric(tap)
    const head = symmetricTapHead
      ? await joinTapHeadToBody(fittedHead, fittedBody)
      : fittedHead
    const body = await cascadeHoldBody(fittedBody, symmetricTapHead ? fittedTail : null)
    const tail = await joinTailToBody(fittedTail, fittedBody)
    const key = await keyFromReceptor(receptor, rotatedTap, hitPosition, columnWidth)
    const rawPressedReceptor = lane[5].entry ? await rasteriseResolved(lane[5]) : rawReceptor
    const pressedReceptor = await rotateRaster(rawPressedReceptor, rotations[index].receptor)
    const pressedKey = await keyFromReceptor(pressedReceptor, rotatedTap, hitPosition, columnWidth)
    rendered.push({ tap, head, body, tail, key, pressedKey })
  }

  const sharedBody = await Promise.all(rendered.slice(1).map((lane) => sameRaster(rendered[0].body, lane.body)))
    .then((matches) => matches.every(Boolean))
  const sharedTail = await Promise.all(rendered.slice(1).map((lane) => sameRaster(rendered[0].tail, lane.tail)))
    .then((matches) => matches.every(Boolean))
  if (sharedBody) {
    output.file('mania/notes/ln/ln1.png', (await sdRaster(rendered[0].body)).blob)
    output.file('mania/notes/ln/ln1@2x.png', rendered[0].body.blob)
  }
  if (sharedTail) {
    output.file('mania/notes/ln/ln2.png', (await sdRaster(rendered[0].tail)).blob)
    output.file('mania/notes/ln/ln2@2x.png', rendered[0].tail.blob)
  }

  const iniLines: string[] = [
    // cascadeHoldBody lays the authored body out after a transparent tail-cap
    // allowance at the top. Cascade from that same end so the allowance stays
    // at the visible release end instead of moving with the hold length.
    'NoteBodyStyle: 1',
    // Converted receptors are full note-shaped artwork. Keep them beneath
    // notes so their outline cannot be composited over a hold endpoint.
    'KeysUnderNotes: 1',
  ]
  for (let index = 0; index < rendered.length; index++) {
    const lane = rendered[index]
    const number = index + 1
    const receptorName = OSU_RECEPTOR_NAMES[index]
    const notePath = `mania/notes/${number}/${number}`
    const headMatchesTap = await sameRaster(lane.tap, lane.head)
    const headPath = headMatchesTap ? notePath : `${notePath}H`
    const bodyPath = sharedBody ? 'mania/notes/ln/ln1' : `mania/notes/ln/ln1-${number}`
    const tailPath = sharedTail ? 'mania/notes/ln/ln2' : `mania/notes/ln/ln2-${number}`
    output.file(`${notePath}.png`, (await sdRaster(lane.tap)).blob)
    output.file(`${notePath}@2x.png`, lane.tap.blob)
    if (!headMatchesTap) {
      output.file(`${headPath}.png`, (await sdRaster(lane.head)).blob)
      output.file(`${headPath}@2x.png`, lane.head.blob)
    }
    if (!sharedBody) {
      output.file(`${bodyPath}.png`, (await sdRaster(lane.body)).blob)
      output.file(`${bodyPath}@2x.png`, lane.body.blob)
    }
    if (!sharedTail) {
      output.file(`${tailPath}.png`, (await sdRaster(lane.tail)).blob)
      output.file(`${tailPath}@2x.png`, lane.tail.blob)
    }
    output.file(`mania/receptors/${receptorName}.png`, (await sdRaster(lane.key)).blob)
    output.file(`mania/receptors/${receptorName}@2x.png`, lane.key.blob)
    output.file(`mania/receptors/${receptorName}_other.png`, (await sdRaster(lane.pressedKey)).blob)
    output.file(`mania/receptors/${receptorName}_other@2x.png`, lane.pressedKey.blob)
    iniLines.push(
      `KeyImage${index}: mania/receptors/${receptorName}`,
      `KeyImage${index}D: mania/receptors/${receptorName}_other`,
      `NoteImage${index}: ${notePath}`,
      `NoteImage${index}H: ${headPath}`,
      `NoteImage${index}L: ${bodyPath}`,
      `NoteImage${index}T: ${tailPath}`,
      `NoteFlipWhenUpsideDown${index}T: 0`,
    )
  }

  const skinName = safeName(inspection.name)
  const templateIni = output.file('skin.ini')
  if (!templateIni) throw new Error('The bundled osu! base skin is missing skin.ini.')
  const skinIni = mergeTemplateSkinIni(await templateIni.async('string'), skinName, iniLines, hitPosition, columnWidth)
  output.file('skin.ini', skinIni)
  output.file('_blank.png', await transparentPng())

  return {
    blob: await output.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }),
    filename: `${skinName}.osk`,
    inspection,
  }
}

async function previewAsset(
  asset: ResolvedAsset,
  fallback: ResolvedAsset,
  rotation = 0,
  cropSheet = true,
): Promise<RasterAsset> {
  const selected = asset.entry ? asset : fallback
  if (!selected.entry) throw new Error('The skin does not contain enough artwork to build a preview.')
  try {
    const raster = await rasteriseResolved(selected, cropSheet)
    return rotation ? rotateRaster(raster, rotation) : raster
  } catch {
    if (fallback.entry && fallback.entry !== selected.entry) {
      try {
        const raster = await rasteriseResolved(fallback, cropSheet)
        return rotation ? rotateRaster(raster, rotation) : raster
      } catch { /* use a valid transparent preview pixel below */ }
    }
    return transparentRaster(1, 1)
  }
}

async function firstUsableOsuPreview(entries: Array<JSZipObject | null>): Promise<RasterAsset> {
  const seen = new Set<string>()
  for (const entry of entries) {
    if (!entry || seen.has(entry.name.toLowerCase())) continue
    seen.add(entry.name.toLowerCase())
    try {
      return await noteFromOsuImage(entry, 'note')
    } catch { /* try the next mapped gameplay image */ }
  }
  return transparentRaster(64, 64)
}

export async function buildSkinPreview(
  input: File | string,
  direction: SkinDirection,
): Promise<SkinPreview> {
  const archive = await loadArchive(input)
  if (direction === 'osu-to-etterna') {
    const { assets, bodyStyle, mania } = await inspectOsu(archive)
    const fallback = await firstUsableOsuPreview(assets.flatMap((lane) => lane).map((asset) => asset.entry))
    const cache = new Map<string, Promise<RasterAsset>>()
    const note = (entry: JSZipObject | null, kind: 'note' | 'body' | 'tail', style = bodyStyle) => {
      if (!entry) return Promise.resolve(fallback)
      const key = `${entry.name.toLowerCase()}|${kind}|${style}`
      if (!cache.has(key)) cache.set(key, noteFromOsuImage(entry, kind, style).catch(() => fallback))
      return cache.get(key)!
    }
    const receptor = (entry: JSZipObject | null) => {
      if (!entry) return Promise.resolve(fallback)
      const key = `${entry.name.toLowerCase()}|receptor`
      if (!cache.has(key)) cache.set(key, receptorFromOsuKey(entry).catch(() => fallback))
      return cache.get(key)!
    }
    const tail = (tailEntry: JSZipObject | null, bodyEntry: JSZipObject | null) => {
      if (!tailEntry) return Promise.resolve(fallback)
      const key = `${tailEntry.name.toLowerCase()}|tail-preview|${bodyEntry?.name.toLowerCase() || ''}|${bodyStyle}`
      if (!cache.has(key)) {
        cache.set(key, bodyEntry
          ? tailFromOsuImages(tailEntry, bodyEntry, bodyStyle).catch(() => note(tailEntry, 'tail'))
          : note(tailEntry, 'tail'))
      }
      return cache.get(key)!
    }
    return {
      hitPosition: Number(mania.values.get('hitposition')) || DEFAULT_OSU_HIT_POSITION,
      columnWidth: Number(mania.values.get('columnwidth')?.split(',')[0]) || DEFAULT_OSU_COLUMN_WIDTH,
      lanes: await Promise.all(assets.map(async (lane) => ({
        note: await note(lane[0].entry, 'note'),
        holdHead: await note(lane[1].entry || lane[0].entry, 'note'),
        // A short repeating strip previews the same Etterna body without
        // asking Chromium to display a 40,000px source image.
        holdBody: await note(lane[2].entry || lane[0].entry, 'body', 0),
        holdTail: await tail(lane[3].entry || lane[1].entry, lane[2].entry),
        receptor: await receptor(lane[4].entry || lane[0].entry),
      }))),
    }
  }

  const { assets, rotations } = await inspectEtterna(archive)
  const fallback = assets.flatMap((lane) => lane).find((asset) => asset.entry)
  if (!fallback) throw new Error('The skin does not contain enough artwork to build a preview.')
  return {
    lanes: await Promise.all(assets.map(async (lane, index) => ({
      note: await previewAsset(lane[0], fallback, rotations[index].tap),
      holdHead: await previewAsset(lane[1], lane[0].entry ? lane[0] : fallback, rotations[index].head),
      holdBody: await previewAsset(lane[2], lane[0].entry ? lane[0] : fallback, 0, false),
      holdTail: await previewAsset(lane[3], lane[1].entry ? lane[1] : fallback),
      receptor: await previewAsset(lane[4], lane[0].entry ? lane[0] : fallback, rotations[index].receptor, false),
    }))),
  }
}

export async function inspectSkinArchive(
  input: File | string,
  direction: SkinDirection,
): Promise<SkinInspection> {
  const archive = await loadArchive(input)
  return direction === 'osu-to-etterna'
    ? (await inspectOsu(archive)).inspection
    : (await inspectEtterna(archive)).inspection
}

export async function detectSkinArchive(input: File | string): Promise<{
  direction: SkinDirection
  inspection: SkinInspection
}> {
  const archive = await loadArchive(input)
  const noteSkin = findFile(archive.files, ['NoteSkin.lua'])
  if (noteSkin) {
    return { direction: 'etterna-to-osu', inspection: (await inspectEtterna(archive)).inspection }
  }

  const skinIni = findFile(archive.files, ['skin.ini'])
  if (skinIni) {
    const sections = parseIni(await readText(skinIni))
    if (sections.some((section) => section.name.toLowerCase() === 'mania')) {
      return { direction: 'osu-to-etterna', inspection: (await inspectOsu(archive)).inspection }
    }
  }

  if (findFile(archive.files, ['metrics.ini'])) {
    return { direction: 'etterna-to-osu', inspection: (await inspectEtterna(archive)).inspection }
  }
  throw new Error('Henkan could not identify this as an osu!mania skin or an Etterna dance noteskin.')
}

export async function convertSkinArchive(
  input: File | string,
  direction: SkinDirection,
  options: SkinConversionOptions = {},
): Promise<SkinConversionResult> {
  return direction === 'osu-to-etterna'
    ? convertOsuToEtterna(input)
    : convertEtternaToOsu(input, options)
}
