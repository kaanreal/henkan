import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { prepareRelease } from './prepare-release.mjs'

test('updates every application version source used by a release', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'henkan-prepare-release-'))
  await mkdir(path.join(root, 'src', 'wasm'), { recursive: true })
  await mkdir(path.join(root, 'src-tauri'), { recursive: true })
  await writeFile(path.join(root, 'package.json'), '{\n  "name": "henkan",\n  "version": "1.7.0"\n}\n')
  await writeFile(path.join(root, 'package-lock.json'), '{\n  "name": "henkan",\n  "version": "1.7.0",\n  "packages": {"": {"name": "henkan", "version": "1.7.0"}}\n}\n')
  await writeFile(path.join(root, 'src', 'wasm', 'package.json'), '{\n  "version": "1.7.0"\n}\n')
  await writeFile(path.join(root, 'src-tauri', 'tauri.conf.json'), '{\n  "version": "1.7.0"\n}\n')
  await writeFile(path.join(root, 'src-tauri', 'Cargo.toml'), '[package]\nname = "henkan"\nversion = "1.7.0"\n')
  await writeFile(path.join(root, 'src-tauri', 'Cargo.lock'), '[[package]]\nname = "henkan"\nversion = "1.7.0"\n')

  try {
    prepareRelease(root, '1.8.0')
    assert.equal(JSON.parse(await readFile(path.join(root, 'package.json'))).version, '1.8.0')
    const lock = JSON.parse(await readFile(path.join(root, 'package-lock.json')))
    assert.equal(lock.version, '1.8.0')
    assert.equal(lock.packages[''].version, '1.8.0')
    assert.equal(JSON.parse(await readFile(path.join(root, 'src', 'wasm', 'package.json'))).version, '1.8.0')
    assert.match(await readFile(path.join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'), /"version": "1\.8\.0"/)
    assert.match(await readFile(path.join(root, 'src-tauri', 'Cargo.toml'), 'utf8'), /^version = "1\.8\.0"$/m)
    assert.match(await readFile(path.join(root, 'src-tauri', 'Cargo.lock'), 'utf8'), /name = "henkan"\nversion = "1\.8\.0"/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
