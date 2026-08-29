# Henkan 変換

> A careful osu!mania ↔ Etterna / StepMania converter. Name idea by Kesrie.

Henkan keeps map details intact—millisecond timing, BPM changes, long notes,
metadata, and snapping. Drop in an `.osu`, `.osz`, or `.sm` and convert.

[![Release](https://img.shields.io/github/v/release/kaanreal/henkan?display_name=tag&style=flat-square)](https://github.com/kaanreal/henkan/releases/latest)
[![AUR](https://img.shields.io/aur/version/henkan-bin?label=AUR&style=flat-square)](https://aur.archlinux.org/packages/henkan-bin)
[![winget](https://img.shields.io/winget/v/kaanreal.Henkan?label=winget&style=flat-square)](https://github.com/microsoft/winget-pkgs/tree/master/manifests/k/kaanreal/Henkan)
[![Chocolatey](https://img.shields.io/chocolatey/v/henkan?label=Chocolatey&style=flat-square)](https://community.chocolatey.org/packages/henkan)

![Henkan converter](public/screenshots/main-menu.png)

## Install

Every package is generated from the same GitHub release with pinned SHA-256 checksums. The table makes
the packaged version and channel explicit so stale repositories are easy to
spot.

| Package manager | Version | Install | Package |
| --- | ---: | --- | --- |
| Homebrew (app) | `1.6.1` | `brew install --cask kaanreal/tap/henkan` | [tap](https://github.com/kaanreal/homebrew-tap/blob/main/Casks/henkan.rb) |
| Homebrew (CLI) | `1.6.1` | `brew install kaanreal/tap/henkan-cli` | [tap](https://github.com/kaanreal/homebrew-tap/blob/main/Formula/henkan-cli.rb) |
| AUR | `1.6.1` | `yay -S henkan-bin` | [AUR](https://aur.archlinux.org/packages/henkan-bin) |
| Nix | `1.6.1` | `nix run github:kaanreal/henkan` | [flake](packaging/nix/package.nix) |
| winget | `1.6.1` | `winget install kaanreal.Henkan` | [community manifest](https://github.com/microsoft/winget-pkgs/tree/master/manifests/k/kaanreal/Henkan) |
| Chocolatey | `1.6.1` | `choco install henkan` | [community package](https://community.chocolatey.org/packages/henkan) |

Prefer a standalone installer? Download the AppImage, DMG, or Windows setup
executable from [GitHub Releases](https://github.com/kaanreal/henkan/releases/latest).

## What it does

- Converts osu!mania (`.osu` / `.osz`) and Etterna/StepMania (`.sm`) maps both ways
- Converts 4K osu!mania gameplay skins (`.osk`, `.zip`, or folders) and Etterna dance noteskins both ways
- Preserves timing points, holds, chart metadata, preview points, and snapping
- Handles individual maps and pack folders
- Runs as a native Tauri desktop app, CLI, and browser-capable converter

## A quick tour

| Pack conversion | Map preview |
| --- | --- |
| ![Pack conversion](public/screenshots/pack-conversion.png) | ![Map preview](public/screenshots/preview.png) |

## Built with care

Tauri + React + Rust + WebAssembly. Licensed under the [MIT License](LICENSE).

If Henkan helped your maps find a new home, a star on GitHub is always lovely.
