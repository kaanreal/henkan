# Henkan 変換

**osu!mania ↔ Etterna / StepMania beatmap converter.**

Drag, drop, convert. Clean, fast, cross-platform.

## Features

- **osu!mania (.osu / .osz) → Etterna (.sm)** — timing, holds, BPM changes, metadata
- **Etterna (.sm) → osu!mania (.osu)** — round-trip conversion
- **Metadata mapping** — title, artist, creator, difficulty, preview point
- **BPM changes** — multiple tempo changes supported (notes snapped to 192nds)
- **Hold/Long notes** — start/end translation
- **Background references** — preserved across formats
- **Modern UI** — smooth animations, dark theme, drag-and-drop

> Note: SV (scroll velocity) is not converted in the osu → .sm direction —
> the .sm format has no equivalent of osu's green lines.

## Prerequisites

- **Rust** 1.78+ (`rustup install stable`)
- **Node.js** 20+ (includes `npm`)
- **Platform dependencies**:
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Windows**: [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
  - **Linux**: WebKit2GTK, libsoup, etc. (see Tauri docs)

## Development

```bash
# Clone and install
git clone https://github.com/kaanreal/henkan.git
cd henkan
npm install

# Run in dev mode (hot-reload)
npm run tauri dev

# Build for production
npm run tauri build
```

## Project Structure

```
henkan/
├── src/                    # Frontend (React + TypeScript + Vite)
│   ├── components/         # UI components
│   ├── stores/             # Zustand state
│   └── types/              # TypeScript types
├── src-tauri/              # Backend (Rust)
│   ├── src/
│   │   ├── parsers/        # .osu / .sm parsers
│   │   ├── converters/     # Format converters
│   │   └── models/         # Shared data models
│   ├── Cargo.toml
│   └── tauri.conf.json
├── .github/workflows/      # CI/CD
└── package.json
```

## Release

This project uses [release-please](https://github.com/googleapis/release-please) for automated releases:

1. Push commits with [conventional commits](https://www.conventionalcommits.org/) to `main`
2. release-please automatically creates/updates a **Release PR** with changelog + version bump
3. Merge the Release PR → tag + GitHub Release are created automatically
4. CI builds Windows (`.msi`), macOS (`.dmg`), and Linux (`.AppImage`) and uploads them
5. Auto-updater JSON is generated so users get notified of new versions

---

Built with [Tauri](https://tauri.app) + [React](https://react.dev) + [Rust](https://rust-lang.org).
