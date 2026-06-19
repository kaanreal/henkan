# Changelog

## [1.0.0](https://github.com/kaanreal/henkan/compare/v1.0.0...v1.0.0) (2026-06-18)


### Features

* add Henkan logo (two-column rhythm icon) ([de55734](https://github.com/kaanreal/henkan/commit/de55734a258bf50be9c3fcaa4ae5f73d723a1271))


### Bug Fixes

* use portable sed -i.bak for cross-platform version patching ([3e736e2](https://github.com/kaanreal/henkan/commit/3e736e2cf20fcbd8800bcf8b1bc61163fb75950f))


### Miscellaneous Chores

* release 1.0.0 ([5717a42](https://github.com/kaanreal/henkan/commit/5717a421e32be5be309faac5f24ef4e32b29ea70))

## [1.0.0](https://github.com/kaanreal/henkan/compare/v1.0.0...v1.0.0) (2026-06-13)


### Miscellaneous Chores

* release 1.0.0 ([5717a42](https://github.com/kaanreal/henkan/commit/5717a421e32be5be309faac5f24ef4e32b29ea70))

## 1.0.0 (2026-06-14)

### Features

- Initial release: convert between osu!mania (.osu/.osz) and Etterna (.sm) formats
- Single-file conversion with metadata preview
- Pack conversion (batch-convert entire SM folders to osu!mania)
- Audio preview with scrollable column visualization
- Analog-style audio player with preview-time scrubbing
- OSZ export (auto-zip after conversion)
- Dummy difficulty files for pack identification in osu! song select
- Configurable HP drain, overall difficulty, and timing offset
- Drag-and-drop file loading
- Aptabase analytics (opt-in telemetry)
- Tauri v2 auto-updater support (Linux AppImage / Windows MSI / macOS DMG)

### Bug Fixes

- Audio file lookup with multiple extensions
- Preview point handling from SM #SAMPLESTART
- URL parsing for external beatmap links
- Conversion failure edge cases
- CSP blocking assets, .sm format issues, bg/audio not loading

### Technical

- Tauri v2, React 19, TypeScript, Tailwind CSS v4, Zustand
- Rust beatmap parsers for SM and osu!mania formats
- CSP-hardened security policy
