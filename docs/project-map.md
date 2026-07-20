# Project map

Henkan has two conversion runtimes that share the same purpose:

| Area | Purpose |
| --- | --- |
| `src/` | React interface, browser fallback, Tauri bridge, and export flow |
| `src-tauri/` | Native Rust app and command-line interface |
| `wasm-core/` | Rust core compiled for browser use |
| `src/wasm/` | Generated WebAssembly artifacts consumed by the web app |
| `api/` | Vercel endpoints for map mirroring and avatars |
| `packaging/` | Homebrew, Winget, Chocolatey, and AUR recipes |

When changing conversion behaviour, update the native and WASM implementations
together, rebuild the WASM artifacts, and test the path you changed.
