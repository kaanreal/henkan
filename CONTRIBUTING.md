# Contributing to Henkan

Thanks for spending time with Henkan. Small, focused changes are easiest to
review and safest to release.

## Before you start

- Node.js 20 or newer
- Rust stable
- Platform prerequisites for [Tauri](https://v2.tauri.app/start/prerequisites/)

```bash
git clone https://github.com/kaanreal/henkan.git
cd henkan
npm ci
cp src-tauri/.env.example src-tauri/.env
```

`src-tauri/.env` is local-only. Do not commit keys or analytics credentials.

## Everyday commands

```bash
npm run dev            # run the app in development
npm run build          # type-check and build the web bundle
npm run lint           # lint TypeScript and React
npm run test:updater   # test release-manifest generation
npm run test:release   # test release-manifest and changelog generation
cargo test --manifest-path src-tauri/Cargo.toml
```

If you change Rust formatting, also run `cargo fmt --check` from `src-tauri`.

## Releasing

Releases are deliberately separate from everyday commits. From the `main`
branch, run the **Prepare Release** workflow and enter the exact stable version
you want, such as `1.8.0`. The workflow updates the synchronized application
version files, commits `prepare v1.8.0`, and creates a draft GitHub Release.

Edit the draft body yourself, then publish it. Publishing starts the signed
Windows, macOS, and Linux builds, uploads the bundles and updater manifest, and
publishes the package-manager updates. The same release body is copied into the
updater manifest and the top of `CHANGELOG.md`.

The release workflow never infers a version or release notes from commit
subjects.

## A calm contribution flow

1. Open an issue first for a larger change, so the direction is clear.
2. Branch from `main` with a short, descriptive name.
3. Keep one concern per pull request.
4. Add or update tests when behaviour changes.
5. Include a screenshot for visible UI work and list the commands you ran.

## Commit messages

Write concise, human-readable commit subjects. There is no required prefix or
commit format, and an emoji at the beginning is welcome when it helps set the
mood.

```text
🌸 add pack banner preview
🐛 fix preview timing
🧹 simplify converter state
```

Choose a subject that makes sense in the project history. Releases are prepared
manually from GitHub Actions, so commit messages do not control versions,
changelogs, or release notes.

For pull requests, use **Squash and merge** when a single tidy commit makes the
history easier to follow, but do not rewrite a commit just to fit a release
convention.

## Where things live

- `src/` - React interface, state, and desktop/web services
- `src-tauri/` - native application and CLI
- `wasm-core/` - browser-compatible conversion core
- `api/` - hosted endpoints
- `packaging/` - package-manager recipes
- `src/pages/DocsPage.tsx` - in-app converter documentation

Please do not hand-edit generated files in `src/wasm/`; use `npm run build:wasm`.

### Release rebuilds and package publication

Rebuild an existing tag with **Release & Build**. Historical rebuilds only
restore that release's downloads; they do not roll the package snapshots back.
Only the newest stable release synchronizes package metadata on `main`.

After verifying a release, run **Publish to Package Managers** separately and
select the intended version and manager. Each manager has its own job, so a
registry or token failure does not block other managers or the app release.
The winget publisher synchronizes its fork before pushing a manifest branch;
its token must have permission to update the fork and open upstream PRs.

Windows Etterna detection uses native Windows APIs for process and open-audio
lookup, with `nowplaying.txt` as a metadata fallback. It does not launch
PowerShell, Command Prompt, or tasklist.
