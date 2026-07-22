import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import JSZip from 'jszip'

const source = resolve(process.argv[2] || 'C:\\STUFF\\osu!\\Skins\\idk color green')
const destination = resolve(process.argv[3] || join('public', 'templates', 'etterna-osu-base.osk'))
const archive = new JSZip()

async function addDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) {
      await addDirectory(absolute)
      continue
    }
    if (!entry.isFile()) continue
    const archivePath = relative(source, absolute).replace(/\\/g, '/')
    if (/^mania\/(?:arrows|notes|receptors)\//i.test(archivePath)) continue
    archive.file(archivePath, await readFile(absolute))
  }
}

await addDirectory(source)
if (!archive.file('skin.ini')) throw new Error(`${source} does not contain skin.ini`)
await mkdir(dirname(destination), { recursive: true })
await writeFile(destination, await archive.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 9 },
}))
console.log(`Bundled ${Object.keys(archive.files).length} template files at ${destination}`)
