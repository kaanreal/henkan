# Henkan 変換

> A careful osu!mania ↔ Etterna / StepMania converter.

Henkan keeps the musical details intact: millisecond timing, BPM changes, long
notes, metadata, and background references. Drop in an `.osu`, `.osz`, or `.sm`
file and carry it to its next rhythm-game home.

![Henkan converter](public/screenshots/main-menu.png)

## What it does

- Converts osu!mania (`.osu` / `.osz`) and Etterna/StepMania (`.sm`) maps both ways
- Preserves timing points, holds, chart metadata, preview points, and backgrounds
- Handles individual maps and pack folders
- Runs as a native Tauri desktop app, CLI, and browser-capable converter

> Scroll velocity is not converted from osu!mania to `.sm`: standard StepMania
> timing has no matching concept.

## Get Henkan

| Platform | Install |
| --- | --- |
| macOS | `brew install --cask kaanreal/tap/henkan` |
| macOS CLI | `brew install kaanreal/tap/henkan-cli` |
| Windows | `winget install kaanreal.henkan` or `choco install henkan` |
| Arch Linux | `yay -S henkan` |
| Linux | Download an AppImage or `.deb` from [Releases](https://github.com/kaanreal/henkan/releases) |

## A quick tour

| Pack conversion | Map preview |
| --- | --- |
| ![Pack conversion](public/screenshots/pack-conversion.png) | ![Map preview](public/screenshots/preview.png) |

## Handbook

- [Getting started](docs/getting-started.md)
- [Conversion notes](docs/conversion-notes.md)
- [Project map](docs/project-map.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## Built with care

Tauri + React + Rust + WebAssembly.

If Henkan helped your maps find a new home, a star on GitHub is always lovely.
