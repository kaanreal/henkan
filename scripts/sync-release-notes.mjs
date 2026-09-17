import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

function args(argv) {
  return Object.fromEntries(argv.map((argument) => {
    const [key, ...rest] = argument.replace(/^--/, '').split('=')
    return [key, rest.join('=')]
  }))
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function syncReleaseNotes({ changelogPath, repository, version, tag, previousTag, date, notes }) {
  const changelog = readFileSync(changelogPath, 'utf8')
  const versionHeading = new RegExp(`^## \\[${escapeRegExp(version)}\\]`, 'm')
  if (versionHeading.test(changelog)) return false

  const comparison = previousTag
    ? `https://github.com/${repository}/compare/${previousTag}...${tag}`
    : `https://github.com/${repository}/releases/tag/${tag}`
  const body = notes.trim()
  const section = `## [${version}](${comparison}) (${date})\n\n${body}\n\n`

  if (!/^# Changelog\r?\n/.test(changelog)) {
    throw new Error('CHANGELOG.md must start with # Changelog')
  }
  writeFileSync(changelogPath, changelog.replace(/^# Changelog\r?\n/, `# Changelog\n\n${section}`))
  return true
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const values = args(process.argv.slice(2))
  for (const name of ['repository', 'version', 'tag', 'date', 'notes-file']) {
    if (!values[name]) throw new Error(`Missing --${name}=...`)
  }

  const changed = syncReleaseNotes({
    changelogPath: resolve(import.meta.dirname, '..', 'CHANGELOG.md'),
    repository: values.repository,
    version: values.version,
    tag: values.tag,
    previousTag: values['previous-tag'] || '',
    date: values.date,
    notes: readFileSync(values['notes-file'], 'utf8'),
  })
  console.log(changed ? `added ${values.tag} to CHANGELOG.md` : `${values.tag} is already in CHANGELOG.md`)
}
