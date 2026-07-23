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
cargo test --manifest-path src-tauri/Cargo.toml
```

If you change Rust formatting, also run `cargo fmt --check` from `src-tauri`.

## A calm contribution flow

1. Open an issue first for a larger change, so the direction is clear.
2. Branch from `main` with a short, descriptive name.
3. Keep one concern per pull request.
4. Add or update tests when behaviour changes.
5. Include a screenshot for visible UI work and list the commands you ran.

## Commit messages

Henkan uses Conventional Commits because Release Please reads the **start** of
the commit subject to decide versions and changelog entries. Keep that part
plain; put one small mood emoji at the beginning of the human description if it
suits the change.

```text
feat: 🌷 add pack banner preview
fix(parser): 🫖 preserve negative beat offsets
docs: 📚 clarify Linux installation
chore(wasm): rebuild bindings
```

Useful types are `feat`, `fix`, `docs`, `refactor`, `test`, `build`, `ci`, and
`chore`. Use `feat!:` or a `BREAKING CHANGE:` footer only for a deliberate
breaking change. Avoid emoji-only, vague subjects such as `✨ update stuff`.

For pull requests, use **Squash and merge** and make the squash title the final
conventional commit. It leaves `main` readable and gives Release Please one
clear entry to process.

## Where things live

- `src/` - React interface, state, and desktop/web services
- `src-tauri/` - native application and CLI
- `wasm-core/` - browser-compatible conversion core
- `api/` - hosted endpoints
- `packaging/` - package-manager recipes
- `docs/` - user and maintainer documentation

Please do not hand-edit generated files in `src/wasm/`; use `npm run build:wasm`.
