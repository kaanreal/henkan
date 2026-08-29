#!/usr/bin/env bash
# Manual counterpart to the package-publishing workflow.
# Example: VERSION=v1.6.1 packaging/publish.sh homebrew winget
set -euo pipefail

: "${VERSION:?set VERSION to a release tag such as v1.6.1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
V="${VERSION#v}"
RELEASE="https://github.com/kaanreal/henkan/releases/download/$VERSION"

checksum() { curl -fsSL "$1" | sha256sum | cut -d' ' -f1; }

SOURCE_SHA="$(checksum "https://github.com/kaanreal/henkan/archive/refs/tags/$VERSION.tar.gz")"
DMG_SHA="$(checksum "$RELEASE/Henkan-v$V-macos.dmg")"
INSTALLER_SHA="$(checksum "$RELEASE/Henkan-v$V-windows-setup.exe")"
APPIMAGE_SHA="$(checksum "$RELEASE/Henkan-v$V-linux.AppImage")"

targets=("$@")
if [ ${#targets[@]} -eq 0 ]; then
  targets=(aur homebrew winget chocolatey nixpkgs)
fi
for target in "${targets[@]}"; do
  "$ROOT/packaging/ci-publish.sh" "$target" "$VERSION" "$SOURCE_SHA" "$DMG_SHA" "$INSTALLER_SHA" "$APPIMAGE_SHA"
done
