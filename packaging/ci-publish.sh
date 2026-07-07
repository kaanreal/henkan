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
    system "cargo", "install", *std_cargo_args(path: "src-tauri")
    bin.install "henkan-cli"
  end
  test do
    assert_match "henkan-cli", shell_output("#{bin}/henkan-cli --help")
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
  git add -A
  git commit -m "chore: update to $VER" || true
  git push
  ;;

winget)
  git clone "https://x-access-token:${WINGET_GITHUB_TOKEN}@github.com/kaanreal/winget-pkgs.git" /tmp/winget
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
  git add -A
  git commit -m "New version: kaanreal.henkan $V" || true
  git push
  ;;

choco)
  mkdir -p /tmp/choco/tools
  cp "$TEMPLATES/henkan.nuspec" /tmp/choco/henkan.nuspec
  cp "$TEMPLATES/chocolateyinstall.ps1" /tmp/choco/tools/
  cp "$TEMPLATES/chocolateyuninstall.ps1" /tmp/choco/tools/

  sed -i '' "s/{{VERSION}}/$V/g" /tmp/choco/henkan.nuspec
  sed -i '' "s|{{MSI_URL}}|$MSI_URL|g" /tmp/choco/tools/chocolateyinstall.ps1
  sed -i '' "s/{{MSI_SHA}}/$MSI_SHA/g" /tmp/choco/tools/chocolateyinstall.ps1

  cd /tmp/choco
  choco pack
  choco push henkan.$V.nupkg --source https://push.chocolatey.org/ --api-key "$CHOCOLATEY_API_KEY"
  ;;

*)
  echo "Unknown target: $TARGET" >&2
  exit 1
  ;;
esac
