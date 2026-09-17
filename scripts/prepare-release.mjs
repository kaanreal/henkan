import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

function readJson(root, file) {
  const path = resolve(root, file)
  return { path, value: JSON.parse(readFileSync(path, 'utf8')) }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function replaceOnce(contents, pattern, replacement, file) {
  if (!pattern.test(contents)) throw new Error(`Could not find the version field in ${file}`)
  return contents.replace(pattern, replacement)
}

export function validateVersion(version) {
  if (!VERSION_PATTERN.test(version)) {
    throw new Error(`Invalid version "${version}". Use a stable version such as 1.8.0.`)
  }
}

export function prepareRelease(root, version) {
  validateVersion(version)

  const packageJson = readJson(root, 'package.json')
  packageJson.value.version = version
  writeJson(packageJson.path, packageJson.value)

  const packageLock = readJson(root, 'package-lock.json')
  packageLock.value.version = version
  if (!packageLock.value.packages?.['']) {
    throw new Error('package-lock.json is missing its root package entry')
  }
  packageLock.value.packages[''].version = version
  writeJson(packageLock.path, packageLock.value)

  const wasmPackage = readJson(root, 'src/wasm/package.json')
  wasmPackage.value.version = version
  writeJson(wasmPackage.path, wasmPackage.value)

  const tauriPath = resolve(root, 'src-tauri/tauri.conf.json')
  const tauri = JSON.parse(readFileSync(tauriPath, 'utf8'))
  tauri.version = version
  writeJson(tauriPath, tauri)

  const cargoPath = resolve(root, 'src-tauri/Cargo.toml')
  const cargo = readFileSync(cargoPath, 'utf8')
  const updatedCargo = replaceOnce(
    cargo,
    /^(version = ")[^"]+("\s*)$/m,
    `$1${version}$2`,
    'src-tauri/Cargo.toml',
  )
  writeFileSync(cargoPath, updatedCargo)

  const cargoLockPath = resolve(root, 'src-tauri/Cargo.lock')
  const cargoLock = readFileSync(cargoLockPath, 'utf8')
  const updatedCargoLock = replaceOnce(
    cargoLock,
    /^(\[\[package\]\]\r?\nname = "henkan"\r?\nversion = ")[^"]+("\s*)$/m,
    `$1${version}$2`,
    'src-tauri/Cargo.lock',
  )
  writeFileSync(cargoLockPath, updatedCargoLock)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = process.argv[2]
  if (!version) throw new Error('Usage: node scripts/prepare-release.mjs VERSION')
  prepareRelease(resolve(import.meta.dirname, '..'), version)
  console.log(`prepared Henkan ${version}`)
}
