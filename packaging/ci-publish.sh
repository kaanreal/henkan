#!/usr/bin/env bash
# Called by CI workflow. Usage:
#   ci-publish.sh <target> <version> <source_sha256> <dmg_sha256> <msi_sha256>
set -euo pipefail

TARGET="$1"
VER="$2"          # e.g. v1.1.0
SRC_SHA="$3"
DMG_SHA="$4"
MSI_SHA="$5"

V="${VER#v}"
REPO="kaanreal/henkan"
TAG_URL="https://github.com/$REPO/archive/refs/tags/$VER.tar.gz"
REL_URL="https://github.com/$REPO/releases/download/$VER"
MSI_URL="$REL_URL/Henkan_${V}_x64_en-US.msi"
DMG_URL="$REL_URL/Henkan_${V}_aarch64.dmg"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATES="$SCRIPT_DIR/templates"

# Portable sed in-place: works on both Linux (GNU sed) and macOS (BSD sed)
sed_i() {
  case "$(uname -s)" in
    Darwin) sed -i '' "$@" ;;
    *)      sed -i "$@" ;;
  esac
}

# Configure git identity for CI commits
git_config() {
  git config user.email "henkan-ci@users.noreply.github.com"
  git config user.name "Henkan CI"
}

case "$TARGET" in
homebrew)
  git clone "https://x-access-token:${HOMEBREW_TAP_TOKEN}@github.com/kaanreal/homebrew-tap.git" /tmp/brew-tap
  mkdir -p /tmp/brew-tap/Formula /tmp/brew-tap/Casks

  cat > /tmp/brew-tap/Formula/henkan-cli.rb <<FORMULA
class HenkanCli < Formula
  desc "CLI for osu!mania to Etterna/StepMania beatmap converter"
  homepage "https://github.com/kaanreal/henkan"
  url "$TAG_URL"
  sha256 "$SRC_SHA"
  license "MIT"
  depends_on "rust" => :build
  def install
    system "cargo", "install", *std_cargo_args(path: "src-tauri"), "--bin", "henkan-cli"
  end
  test do
    assert_match "Usage", shell_output("#{bin}/henkan-cli --help")
  end
end
FORMULA

  cat > /tmp/brew-tap/Casks/henkan.rb <<CASK
cask "henkan" do
  version "$V"
  sha256 "$DMG_SHA"
  url "$DMG_URL"
  name "Henkan"
  desc "osu!mania to Etterna/StepMania beatmap converter"
  homepage "https://github.com/kaanreal/henkan"
  livecheck do
    url :url
    strategy :github_latest
  end
  depends_on macos: ">= :monterey"
  app "Henkan.app"
  zap trash: [
    "~/Library/Application Support/com.henkan.desktop",
    "~/Library/Saved Application State/com.henkan.desktop.savedState",
    "~/.config/henkan",
  ]
end
CASK

  cd /tmp/brew-tap
  git_config
  git add -A
  git commit -m "chore: update to $VER" || true
  git push
  ;;

winget)
  git clone --depth=1 --filter=blob:none --sparse \
    "https://x-access-token:${WINGET_GITHUB_TOKEN}@github.com/kaanreal/winget-pkgs.git" /tmp/winget
  git -C /tmp/winget sparse-checkout set "manifests/k/ka/kaanreal/henkan"
  DIR="/tmp/winget/manifests/k/ka/kaanreal/henkan/$V"
  mkdir -p "$DIR"

  cat > "$DIR/henkan.installer.yaml" <<YAML
PackageIdentifier: kaanreal.henkan
PackageVersion: $V
InstallerLocale: en-US
InstallerType: wix
InstallerSwitches:
  Silent: /quiet /norestart
  SilentWithProgress: /passive /norestart
ProductCode: "{CHANGE_ME}"
Installers:
  - Architecture: x64
    InstallerUrl: $MSI_URL
    InstallerSha256: $MSI_SHA
ManifestType: installer
ManifestVersion: 1.6.0
YAML

  cat > "$DIR/henkan.locale.en-US.yaml" <<YAML
PackageIdentifier: kaanreal.henkan
PackageVersion: $V
PackageLocale: en-US
Publisher: kaanreal
PublisherUrl: https://github.com/kaanreal
PublisherSupportUrl: https://github.com/kaanreal/henkan/issues
Author: kaanreal
PackageName: Henkan
PackageUrl: https://github.com/kaanreal/henkan
License: MIT
LicenseUrl: https://github.com/kaanreal/henkan/blob/main/LICENSE
ShortDescription: osu!mania to Etterna / StepMania beatmap converter
Description: A cross-platform desktop and CLI tool for converting beatmaps.
Moniker: henkan
Tags: osu, osu-mania, etterna, stepmania, beatmap, converter
ManifestType: defaultLocale
ManifestVersion: 1.6.0
YAML

  cat > "$DIR/henkan.yaml" <<YAML
PackageIdentifier: kaanreal.henkan
PackageVersion: $V
DefaultLocale: en-US
ManifestType: version
ManifestVersion: 1.6.0
YAML

  cd /tmp/winget
  git_config
  git add -A
  git commit -m "New version: kaanreal.henkan $V" || true
  git push
  ;;

choco)
  mkdir -p /tmp/choco/tools
  cp "$TEMPLATES/henkan.nuspec" /tmp/choco/henkan.nuspec
  cp "$TEMPLATES/chocolateyinstall.ps1" /tmp/choco/tools/
  cp "$TEMPLATES/chocolateyuninstall.ps1" /tmp/choco/tools/

  sed_i "s/{{VERSION}}/$V/g" /tmp/choco/henkan.nuspec
  sed_i "s|{{MSI_URL}}|$MSI_URL|g" /tmp/choco/tools/chocolateyinstall.ps1
  sed_i "s/{{MSI_SHA}}/$MSI_SHA/g" /tmp/choco/tools/chocolateyinstall.ps1

  # Build .nupkg manually (it's a ZIP with .nupkg extension)
  # NuGet packages require OPC format: [Content_Types].xml + _rels/.rels
  cat > /tmp/choco/[Content_Types].xml <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="nuspec" ContentType="application/vnd.openxmlformats-package.core-manifest+xml" />
  <Default Extension="ps1" ContentType="application/octet-stream" />
</Types>
XML
  mkdir -p /tmp/choco/_rels
  cat > /tmp/choco/_rels/.rels <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="R1" Type="http://schemas.microsoft.com/packaging/2010/07/manifest" Target="/henkan.nuspec" />
</Relationships>
XML

  cd /tmp/choco
  zip -r "henkan.$V.nupkg" .

  # Push to chocolatey.org via NuGet v2 API (raw binary body)
  curl -sS --fail -X PUT \
    -H "X-NuGet-ApiKey: $CHOCOLATEY_API_KEY" \
    -H "Content-Type: application/octet-stream" \
    --data-binary "@henkan.$V.nupkg" \
    "https://push.chocolatey.org/api/v2/package"
  ;;

*)
  echo "Unknown target: $TARGET" >&2
  exit 1
  ;;
esac
