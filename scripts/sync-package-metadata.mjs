import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.split('=', 2)
  return [key.replace(/^--/, ''), value]
}))
const required = ['version', 'sourceSha', 'dmgSha', 'installerSha', 'appimageSha', 'releaseDate']
for (const key of required) if (!args[key]) throw new Error(`missing --${key}=...`)

const version = args.version.replace(/^v/, '')
const tag = `v${version}`
const sri = `sha256-${Buffer.from(args.appimageSha, 'hex').toString('base64')}`
const edit = (path, transform) => {
  const file = resolve(root, path)
  writeFileSync(file, transform(readFileSync(file, 'utf8')))
}

edit('packaging/aur/PKGBUILD', (s) => s
  .replace(/^pkgver=.*/m, `pkgver=${version}`)
  .replace(/'[0-9a-f]{64}'/, `'${args.appimageSha}'`))
edit('packaging/aur/.SRCINFO', (s) => s
  .replace(/^\tpkgver = .*/m, `\tpkgver = ${version}`)
  .replace(/^\tsource = Henkan-.*AppImage$/m, `\tsource = Henkan-${version}.AppImage::https://github.com/kaanreal/henkan/releases/download/${tag}/Henkan-v${version}-linux.AppImage`)
  .replace(/^\tsha256sums = [0-9a-f]{64}/m, `\tsha256sums = ${args.appimageSha}`))

edit('packaging/homebrew/Casks/henkan.rb', (s) => s
  .replace(/version "[^"]+"/, `version "${version}"`)
  .replace(/sha256 "[0-9a-f]+"/, `sha256 "${args.dmgSha}"`))
edit('packaging/homebrew/Formula/henkan-cli.rb', (s) => s
  .replace(/tags\/v[^/]+\.tar\.gz/, `tags/v${version}.tar.gz`)
  .replace(/sha256 "[0-9a-f]+"/, `sha256 "${args.sourceSha}"`))
edit('packaging/nix/package.nix', (s) => s
  .replace(/version = "[^"]+"/, `version = "${version}"`)
  .replace(/hash = "sha256-[^"]+"/, `hash = "${sri}"`))

for (const path of ['packaging/winget/henkan.yaml', 'packaging/winget/henkan.installer.yaml', 'packaging/winget/henkan.locale.en-US.yaml']) {
  edit(path, (s) => s.replace(/^PackageVersion: .*/gm, `PackageVersion: ${version}`))
}
edit('packaging/winget/henkan.installer.yaml', (s) => s
  .replace(/^ReleaseDate: .*/m, `ReleaseDate: ${args.releaseDate}`)
  .replace(/^(\s+DisplayVersion:) .*/m, `$1 ${version}`)
  .replace(/\/v[^/]+\/Henkan-v[^-]+-windows-setup\.exe/, `/${tag}/Henkan-v${version}-windows-setup.exe`)
  .replace(/^    InstallerSha256: .*/m, `    InstallerSha256: ${args.installerSha.toUpperCase()}`))
edit('packaging/winget/henkan.locale.en-US.yaml', (s) => s
  .replace(/\/releases\/tag\/v[^\s]+/, `/releases/tag/${tag}`))

edit('packaging/chocolatey/henkan.nuspec', (s) => s
  .replace(/<version>[^<]+<\/version>/, `<version>${version}</version>`)
  .replace(/\/releases\/tag\/v[^<]+/, `/releases/tag/${tag}`))
edit('packaging/chocolatey/tools/chocolateyinstall.ps1', (s) => s
  .replace(/\/v[^/]+\/Henkan-v[^-]+-windows-setup\.exe/, `/${tag}/Henkan-v${version}-windows-setup.exe`)
  .replace(/checksum64\s+= '[0-9a-f]+'/, `checksum64     = '${args.installerSha}'`))

edit('README.md', (s) => s.replace(
  /(\| (?:Homebrew \(app\)|Homebrew \(CLI\)|AUR|Nix|winget|Chocolatey) \| )`[^`]+`/g,
  `$1\`${version}\``,
))

console.log(`synchronized package snapshots to ${version}`)
