import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { syncReleaseNotes } from './sync-release-notes.mjs'

test('adds a published release body without changing historical entries', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'henkan-changelog-'))
  const changelogPath = path.join(root, 'CHANGELOG.md')
  const historical = '# Changelog\n\n## [1.7.0](old-link) (2026-09-06)\n\nold notes\n'
  await writeFile(changelogPath, historical)

  try {
    assert.equal(syncReleaseNotes({
      changelogPath,
      repository: 'kaanreal/henkan',
      version: '1.8.0',
      tag: 'v1.8.0',
      previousTag: 'v1.7.0',
      date: '2026-09-17',
      notes: '## What\'s new\n\n- a manually written note',
    }), true)
    const updated = await readFile(changelogPath, 'utf8')
    assert.match(updated, /^# Changelog\n\n## \[1\.8\.0\].*\n\n## What's new/m)
    assert.match(updated, /## \[1\.7\.0\]\(old-link\) \(2026-09-06\)/)
    assert.equal(syncReleaseNotes({
      changelogPath,
      repository: 'kaanreal/henkan',
      version: '1.8.0',
      tag: 'v1.8.0',
      previousTag: 'v1.7.0',
      date: '2026-09-17',
      notes: 'different body',
    }), false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
