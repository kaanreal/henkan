# Changelog

## [1.3.0](https://github.com/kaanreal/henkan/compare/v1.2.0...v1.3.0) (2026-07-19)


### Features

* **export:** 🌸 add Advanced .sm Metadata section for osu→Etterna export ([f793384](https://github.com/kaanreal/henkan/commit/f7933840a424e5c9a1c7b727e79de143188bece4))
* **seo:** 🌸 add routing, landing pages, guides, and technical SEO ([8b291d6](https://github.com/kaanreal/henkan/commit/8b291d62b3b288711fc27785b1c81ae71c534e01))


### Bug Fixes

* **convert:** 🐛 ensure all notes are snapped in osu! stable AIMod ([b816839](https://github.com/kaanreal/henkan/commit/b8168396388cd5763d5c69dfe72a5da32ee3a888))
* **export:** 🐛 produce .osz instead of .zip when osz format is selected ([ab347ac](https://github.com/kaanreal/henkan/commit/ab347ac28386033840195b7f7844f659b3ee6c46))
* inject version into web build from package.json ([7c23d75](https://github.com/kaanreal/henkan/commit/7c23d7585f07db1bde8ee6634f3d4d3f9c3baf84))
* **web:** 🐛 treat single-map folders as single files instead of packs ([677b525](https://github.com/kaanreal/henkan/commit/677b525066c6a7563fa077d192c8c2c699d4613b))

## [1.2.0](https://github.com/kaanreal/henkan/compare/v1.1.0...v1.2.0) (2026-07-14)


### Features

* Add auto-update ([058f5ef](https://github.com/kaanreal/henkan/commit/058f5ef41abdc5038809141aca76ac42f779ef8c))
* Add support for folders ([43b70c1](https://github.com/kaanreal/henkan/commit/43b70c1a94171f8f33c9c6766c87764522f6ea8d))
* Migrate mirror to catboy.best with UI overhaul ([56f32f0](https://github.com/kaanreal/henkan/commit/56f32f039c04b24c7d23c64d8bb226ba50e44d37))


### Bug Fixes

* Auto-discover background image in pack conversion when .sm has no #BACKGROUND ([af75cfb](https://github.com/kaanreal/henkan/commit/af75cfb78b96dd6abb39452b955521e61caf09f7))
* **brew:** always push tap update; use --allow-empty to override stale content [skip ci] ([af05b90](https://github.com/kaanreal/henkan/commit/af05b9060b89529ee6cf39d88589ab467b297045))
* **brew:** correct formula install args and test; formula was truncated in tap [skip ci] ([69352a8](https://github.com/kaanreal/henkan/commit/69352a8edef1886d4b308b07ca041a4a25747d71))
* Clear file cache before opening pack directory ([e33d298](https://github.com/kaanreal/henkan/commit/e33d298bd4da20538b143f50a93eddc758a52a3f))
* correct Chocolatey nupkg OPC format, winget sparse-clone, portable sed [skip ci] ([c443bda](https://github.com/kaanreal/henkan/commit/c443bda29fc1405550d1a25685e2b059ce6b9914))
* Don't dedup pack files by name, use webkitRelativePath only ([e33d298](https://github.com/kaanreal/henkan/commit/e33d298bd4da20538b143f50a93eddc758a52a3f))
* Don't use background images as pack banner on web ([95bd91d](https://github.com/kaanreal/henkan/commit/95bd91d413a4406f8a2fdde18db0d926e6932a84))
* Fixed AV import issues ([01a94e3](https://github.com/kaanreal/henkan/commit/01a94e3c6f14413d1269831a1948d4dd5f142a67))
* Restore auto-discovery of background images when .sm has no #BACKGROUND ([41c7741](https://github.com/kaanreal/henkan/commit/41c77410e6139a285ee088de09ba912f117d7d88))
* **web:** Align banner handling and cache cleanup ([d6b7ae5](https://github.com/kaanreal/henkan/commit/d6b7ae53b70dc3c3b58cd741de05792313befd55))
* **web:** Correct source_file and resolveMediaFile for pack songs ([efa6c9d](https://github.com/kaanreal/henkan/commit/efa6c9dbfdfc1b8bb6873844b8c03b67a82f6a4e))
* **web:** Fixed detection issues on the web ([9264279](https://github.com/kaanreal/henkan/commit/9264279d42892d65c0fac767dd26333d36f4f24b))
* **web:** Fixed pack conversion issues [skip ci] ([e33d298](https://github.com/kaanreal/henkan/commit/e33d298bd4da20538b143f50a93eddc758a52a3f))
* **web:** Fixed some pack conversion issues on the web ver. [skip ci] ([8d497a2](https://github.com/kaanreal/henkan/commit/8d497a27d2b377d5e5ab6032b2943182f064429d))
* **web:** Handle non-UTF-8 .sm files; fix pack banner lookup by webkitRelativePath ([76c9d51](https://github.com/kaanreal/henkan/commit/76c9d51637e2f7cbae02ea8ebd5f2e4855e78907))

## [1.1.0](https://github.com/kaanreal/henkan/compare/v1.0.0...v1.1.0) (2026-07-03)


### Features

* Add conversion queue and multi-file support ([4fe82dc](https://github.com/kaanreal/henkan/commit/4fe82dca7afa1be9084ed0cbc2202586760715b1))
* Added an CLI mode ([f37b118](https://github.com/kaanreal/henkan/commit/f37b118858667309bee4d01d9ac77523c27b6097))
* Added web support ([01b5d25](https://github.com/kaanreal/henkan/commit/01b5d25c57912ed44c82e9542ffb3bd2ef73ec27))
* Fetch osu! avatars for cdtitle fallback ([71e90fa](https://github.com/kaanreal/henkan/commit/71e90fa28739a252c064d8fb8f223a3879d36bd4))
* WIP Add TUI and CLI conversion entrypoints ([c20aff5](https://github.com/kaanreal/henkan/commit/c20aff5ada279f4b1e52c8672c3c97b90fe55ef2))


### Bug Fixes

* Add chart description param to converter ([6475b4d](https://github.com/kaanreal/henkan/commit/6475b4d3701aa2313e37cbf612475361e0153651))
* **cli:** Fix Windows path handling ([9a11704](https://github.com/kaanreal/henkan/commit/9a11704be345af9ee68558c254d5b94e599c58b3))
* Fix CDTITLE issues and fix beat_to_ms BPM segment & stops handling ([311fb24](https://github.com/kaanreal/henkan/commit/311fb24e58f0f82e42d78a197855f9149c687b92))
* Fix drag and drop ([bd8e987](https://github.com/kaanreal/henkan/commit/bd8e9876b57a56972e0d94fa9fbfcfcc6e59e100))
* Fix Etterna diff to show Challenge: 1 for single diff converts ([3d4240c](https://github.com/kaanreal/henkan/commit/3d4240c411e565c2c513f79fedbe529ee2c5a627))
* Fix output issues and diff selection ([62fbe6a](https://github.com/kaanreal/henkan/commit/62fbe6a309c4aa9a5e123f1a527db969071e838b))
* Fixed bug where you couldnt type in the pack creator field ([3f0ccba](https://github.com/kaanreal/henkan/commit/3f0ccbad9d65b703ad745a00dea2e2deae634d96))
* Fixed multi conversion to etterna ([d028ec8](https://github.com/kaanreal/henkan/commit/d028ec8e84923a78a0e70179ab59f1d2143224f3))
* Fixed pack conversion for long filenames ([8691490](https://github.com/kaanreal/henkan/commit/8691490bb211a75cb15c0fb4b0ae772991a0c323))
* Fixed some random bug with jpeg files ([456cf94](https://github.com/kaanreal/henkan/commit/456cf948184962c009142774d210c7f44872c17f))
* Fixed timing issues in the preview ([03e2722](https://github.com/kaanreal/henkan/commit/03e27227f0d8e620be61361f844e5718ae3de09a))
* Fixed timing utils and add snapping ([517d3c8](https://github.com/kaanreal/henkan/commit/517d3c8020f292f3b8aff4b093badff88cc22039))
* Preserve creator, title, artist on select ([7f9e740](https://github.com/kaanreal/henkan/commit/7f9e74075198218eb45118178be1bc6a5c2bdcfe))
* Track WASM files for Vercel deployment ([297bc3b](https://github.com/kaanreal/henkan/commit/297bc3b804bdf410b13688442d71afd704fafcac))

## [1.1.0](https://github.com/kaanreal/henkan/compare/v1.0.0...v1.1.0) (2026-07-03)


### Features

* Add conversion queue and multi-file support ([4fe82dc](https://github.com/kaanreal/henkan/commit/4fe82dca7afa1be9084ed0cbc2202586760715b1))
* Added an CLI mode ([f37b118](https://github.com/kaanreal/henkan/commit/f37b118858667309bee4d01d9ac77523c27b6097))
* Added web support ([01b5d25](https://github.com/kaanreal/henkan/commit/01b5d25c57912ed44c82e9542ffb3bd2ef73ec27))
* Fetch osu! avatars for cdtitle fallback ([71e90fa](https://github.com/kaanreal/henkan/commit/71e90fa28739a252c064d8fb8f223a3879d36bd4))
* WIP Add TUI and CLI conversion entrypoints ([c20aff5](https://github.com/kaanreal/henkan/commit/c20aff5ada279f4b1e52c8672c3c97b90fe55ef2))


### Bug Fixes

* Add chart description param to converter ([6475b4d](https://github.com/kaanreal/henkan/commit/6475b4d3701aa2313e37cbf612475361e0153651))
* **cli:** Fix Windows path handling ([9a11704](https://github.com/kaanreal/henkan/commit/9a11704be345af9ee68558c254d5b94e599c58b3))
* Fix CDTITLE issues and fix beat_to_ms BPM segment & stops handling ([311fb24](https://github.com/kaanreal/henkan/commit/311fb24e58f0f82e42d78a197855f9149c687b92))
* Fix drag and drop ([bd8e987](https://github.com/kaanreal/henkan/commit/bd8e9876b57a56972e0d94fa9fbfcfcc6e59e100))
* Fix Etterna diff to show Challenge: 1 for single diff converts ([3d4240c](https://github.com/kaanreal/henkan/commit/3d4240c411e565c2c513f79fedbe529ee2c5a627))
* Fix output issues and diff selection ([62fbe6a](https://github.com/kaanreal/henkan/commit/62fbe6a309c4aa9a5e123f1a527db969071e838b))
* Fixed bug where you couldnt type in the pack creator field ([3f0ccba](https://github.com/kaanreal/henkan/commit/3f0ccbad9d65b703ad745a00dea2e2deae634d96))
* Fixed multi conversion to etterna ([d028ec8](https://github.com/kaanreal/henkan/commit/d028ec8e84923a78a0e70179ab59f1d2143224f3))
* Fixed pack conversion for long filenames ([8691490](https://github.com/kaanreal/henkan/commit/8691490bb211a75cb15c0fb4b0ae772991a0c323))
* Fixed some random bug with jpeg files ([456cf94](https://github.com/kaanreal/henkan/commit/456cf948184962c009142774d210c7f44872c17f))
* Fixed timing issues in the preview ([03e2722](https://github.com/kaanreal/henkan/commit/03e27227f0d8e620be61361f844e5718ae3de09a))
* Fixed timing utils and add snapping ([517d3c8](https://github.com/kaanreal/henkan/commit/517d3c8020f292f3b8aff4b093badff88cc22039))
* Preserve creator, title, artist on select ([7f9e740](https://github.com/kaanreal/henkan/commit/7f9e74075198218eb45118178be1bc6a5c2bdcfe))
