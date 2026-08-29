import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
const version = JSON.parse(read('package.json')).version
const failures = []
const check = (condition, message) => { if (!condition) failures.push(message) }

check(JSON.parse(read('src-tauri/tauri.conf.json')).version === version, 'tauri.conf.json version is out of sync')
check(new RegExp(`^version = "${version.replaceAll('.', '\\.') }"$`, 'm').test(read('src-tauri/Cargo.toml')), 'Cargo.toml version is out of sync')

const versioned = [
  'packaging/aur/PKGBUILD',
  'packaging/aur/.SRCINFO',
  'packaging/chocolatey/henkan.nuspec',
  'packaging/chocolatey/tools/chocolateyinstall.ps1',
  'packaging/homebrew/Casks/henkan.rb',
  'packaging/homebrew/Formula/henkan-cli.rb',
  'packaging/nix/package.nix',
  'packaging/winget/henkan.yaml',
  'packaging/winget/henkan.installer.yaml',
  'packaging/winget/henkan.locale.en-US.yaml',
]
for (const path of versioned) {
  const contents = read(path)
  check(contents.includes(version), `${path}: does not contain current version ${version}`)
  check(!contents.includes('CHANGE_ME'), `${path}: contains a placeholder checksum`)
  check(!contents.includes('â'), `${path}: contains mojibake`)
}

const winget = read('packaging/winget/henkan.installer.yaml')
check(winget.includes('ManifestVersion: 1.10.0'), 'winget: use the supported 1.10 schema')
check(winget.includes(`Henkan-v${version}-windows-setup.exe`), 'winget: installer filename does not match the release workflow')

const readme = read('README.md')
for (const manager of ['AUR', 'Nix', 'Homebrew', 'winget', 'Chocolatey']) {
  check(readme.toLowerCase().includes(manager.toLowerCase()), `README: missing ${manager}`)
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'))
  process.exit(1)
}
console.log(`package audit passed for ${version}`)
