# Contributing

## Prerequisites

- Node.js 20+
- Rust 1.80+
- Windows: Visual Studio Build Tools / Linux: `libwebkit2gtk-4.1-dev`

## Setup

```bash
git clone https://github.com/kaanreal/henkan.git
cd henkan
npm install
cp src-tauri/.env.example src-tauri/.env  # add your Aptabase key
```

## Development

```bash
npm run dev          # start Tauri dev server (hot-reload)
npm run tauri build  # production build
```

## Code Quality

```bash
npm run lint         # ESLint + TypeScript check
npm run lint:prettier
cd src-tauri && cargo clippy && cargo fmt --check
```

## Testing

```bash
cd src-tauri && cargo test
```

## Pull Requests

1. Use conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`
2. Keep PRs focused on a single concern
3. Update tests if adding or changing behavior
4. Verify the build passes locally before pushing

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add .osz pack export
fix: preserve #SAMPLESTART from SM files
chore(deps): bump tauri to 2.2
docs: add contributing guide
```
