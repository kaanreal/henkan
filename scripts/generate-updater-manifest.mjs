import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PLATFORM_RULES = {
  'linux-x86_64': [/\.AppImage\.sig$/, /\.AppImage\.tar\.gz\.sig$/],
  // NSIS is the current Windows updater payload; keeping the MSI pattern makes
  // the manifest generator usable when validating an older release archive.
  'windows-x86_64': [/\.exe\.sig$/, /\.msi\.sig$/],
  'darwin-aarch64': [/\.app\.tar\.gz\.sig$/],
  'darwin-x86_64': [/\.app\.tar\.gz\.sig$/],
}

async function walk(directory) {
  const files = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...await walk(entryPath))
    else files.push(entryPath)
  }
  return files
}

function minisignKeyId(text, label) {
  let minisign = text.trim()
  if (!minisign.includes('\n')) {
    const decodedEnvelope = Buffer.from(minisign, 'base64').toString('utf8')
    if (decodedEnvelope.includes('\n')) minisign = decodedEnvelope.trim()
  }
  const lines = minisign.split(/\r?\n/)
  if (lines.length < 2) throw new Error(`${label} is not a valid minisign file`)
  const decoded = Buffer.from(lines[1], 'base64')
  if (decoded.length < 10) throw new Error(`${label} has an invalid minisign payload`)
  return decoded.subarray(2, 10).toString('hex')
}

export async function createUpdaterManifest({ bundlesDir, version, tag, repository, configPath }) {
  const config = JSON.parse(await readFile(configPath, 'utf8'))
  const encodedPublicKey = config?.plugins?.updater?.pubkey
  if (!encodedPublicKey) throw new Error(`No updater public key found in ${configPath}`)
  const publicKey = Buffer.from(encodedPublicKey, 'base64').toString('utf8')
  const expectedKeyId = minisignKeyId(publicKey, 'configured updater public key')
  const allFiles = await walk(bundlesDir)
  const platforms = {}

  for (const [platform, rules] of Object.entries(PLATFORM_RULES)) {
    const platformRoot = `${path.sep}henkan-${platform}${path.sep}`
    const signatures = allFiles.filter(file => file.includes(platformRoot) && file.endsWith('.sig'))
    let signaturePath
    for (const rule of rules) {
      signaturePath = signatures.find(file => rule.test(path.basename(file)))
      if (signaturePath) break
    }
    if (!signaturePath) {
      throw new Error(`Missing signed updater artifact for ${platform}. Found: ${signatures.map(path.basename).join(', ') || 'none'}`)
    }

    const archivePath = signaturePath.slice(0, -4)
    if (!(await stat(archivePath).catch(() => null))?.isFile()) {
      throw new Error(`Signature has no matching updater artifact: ${signaturePath}`)
    }
    const signature = (await readFile(signaturePath, 'utf8')).trim()
    const actualKeyId = minisignKeyId(signature, path.basename(signaturePath))
    if (actualKeyId !== expectedKeyId) {
      throw new Error(`Signing key mismatch for ${platform}: artifact uses ${actualKeyId}, app trusts ${expectedKeyId}`)
    }

    const filename = path.basename(archivePath)
    platforms[platform] = {
      signature,
      url: `https://github.com/${repository}/releases/download/${tag}/${encodeURIComponent(filename)}`,
    }
  }

  return {
    version,
    pub_date: new Date().toISOString(),
    platforms,
    notes: `https://github.com/${repository}/releases/tag/${tag}`,
  }
}

function parseArgs(argv) {
  const values = {}
  for (let i = 0; i < argv.length; i += 2) values[argv[i]?.replace(/^--/, '')] = argv[i + 1]
  for (const name of ['bundles', 'version', 'tag', 'repo', 'output']) {
    if (!values[name]) throw new Error(`Missing --${name}`)
  }
  return values
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2))
  const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)))
  const manifest = await createUpdaterManifest({
    bundlesDir: path.resolve(args.bundles),
    version: args.version,
    tag: args.tag,
    repository: args.repo,
    configPath: path.join(root, 'src-tauri', 'tauri.conf.json'),
  })
  await writeFile(args.output, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Created ${args.output} for ${Object.keys(manifest.platforms).join(', ')}`)
}
