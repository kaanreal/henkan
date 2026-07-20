import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createUpdaterManifest } from './generate-updater-manifest.mjs'

const keyId = Buffer.from('0123456789abcdef', 'hex')

function minisignFile(payloadSize) {
  return `untrusted comment: test\n${Buffer.concat([Buffer.from('Ed'), keyId, Buffer.alloc(payloadSize)]).toString('base64')}\n`
}

function updaterSignature(key = keyId) {
  const minisign = `untrusted comment: test\n${Buffer.concat([Buffer.from('Ed'), key, Buffer.alloc(64)]).toString('base64')}\n`
  return Buffer.from(minisign).toString('base64')
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'henkan-updater-'))
  const configPath = path.join(root, 'tauri.conf.json')
  const publicKey = minisignFile(32)
  await writeFile(configPath, JSON.stringify({ plugins: { updater: { pubkey: Buffer.from(publicKey).toString('base64') } } }))
  const artifacts = {
    'linux-x86_64': 'Henkan_1.4.0_amd64.AppImage',
    'windows-x86_64': 'Henkan_1.4.0_x64-setup.exe',
    'darwin-aarch64': 'Henkan.app.tar.gz',
    'darwin-x86_64': 'Henkan.app.tar.gz',
  }
  for (const [platform, filename] of Object.entries(artifacts)) {
    const directory = path.join(root, 'bundles', `henkan-${platform}`, 'bundle')
    await mkdir(directory, { recursive: true })
    await writeFile(path.join(directory, filename), platform)
    await writeFile(path.join(directory, `${filename}.sig`), updaterSignature())
  }
  return { root, configPath }
}

test('creates one complete entry per supported release platform', async () => {
  const { root, configPath } = await fixture()
  try {
    const manifest = await createUpdaterManifest({
      bundlesDir: path.join(root, 'bundles'),
      version: '1.4.0',
      tag: 'v1.4.0',
      repository: 'kaanreal/henkan',
      configPath,
    })
    assert.deepEqual(Object.keys(manifest.platforms), ['linux-x86_64', 'windows-x86_64', 'darwin-aarch64', 'darwin-x86_64'])
    assert.match(manifest.platforms['darwin-aarch64'].url, /Henkan\.app\.tar\.gz$/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('rejects an updater signed by a key the installed app does not trust', async () => {
  const { root, configPath } = await fixture()
  try {
    const signaturePath = path.join(root, 'bundles', 'henkan-windows-x86_64', 'bundle', 'Henkan_1.4.0_x64-setup.exe.sig')
    const otherKey = Buffer.from('fedcba9876543210', 'hex')
    await writeFile(signaturePath, updaterSignature(otherKey))
    await assert.rejects(
      createUpdaterManifest({ bundlesDir: path.join(root, 'bundles'), version: '1.4.0', tag: 'v1.4.0', repository: 'kaanreal/henkan', configPath }),
      /Signing key mismatch/,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
