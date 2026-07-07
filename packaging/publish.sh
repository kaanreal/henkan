#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Henkan – multi-package-manager publish script
# Usage:  VERSION=v1.2.3  ./publish.sh
#         VERSION=v1.2.3  ./publish.sh --aur    (publish only AUR)
#         VERSION=v1.2.3  ./publish.sh --brew   (publish only Homebrew)
#         VERSION=v1.2.3  ./publish.sh --winget (publish only Winget)
#         VERSION=v1.2.3  ./publish.sh --choco  (publish only Chocolatey)
#
# Prerequisites:
#   - gh (GitHub CLI)  –  needed for Winget / Homebrew PRs
#   - curl, sha256sum  –  checksum computation
#   - git              –  basic
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -z "${VERSION:-}" ]; then
  echo "ERROR: VERSION environment variable required (e.g. VERSION=v1.2.3)"
  exit 1
fi

# Strip leading 'v'
VER="${VERSION#v}"
echo "=== Publishing Henkan v$VER ==="

# Determine what to publish
PUBLISH_ALL=true
PUBLISH_AUR=false
PUBLISH_BREW=false
PUBLISH_WINGET=false
PUBLISH_CHOCO=false

if [ $# -gt 0 ]; then
  PUBLISH_ALL=false
  for arg in "$@"; do
    case "$arg" in
      --aur)   PUBLISH_AUR=true ;;
      --brew)  PUBLISH_BREW=true ;;
      --winget) PUBLISH_WINGET=true ;;
      --choco) PUBLISH_CHOCO=true ;;
      *) echo "Unknown flag: $arg"; exit 1 ;;
    esac
  done
fi

GH_REPO="kaanreal/henkan"
RELEASE_URL="https://github.com/$GH_REPO/releases/download/v$VER"

# ---------------------------------------------------------------------------
# Helper: compute SHA256 of a remote file
# ---------------------------------------------------------------------------
fetch_sha256() {
  local url="$1"
  curl -sL "$url" | sha256sum | cut -d' ' -f1
}

# ---------------------------------------------------------------------------
# 1. AUR
# ---------------------------------------------------------------------------
publish_aur() {
  echo "--- Publishing to AUR ---"

  AUR_DIR="/tmp/henkan-aur"
  rm -rf "$AUR_DIR"
  git clone "ssh://aur@aur.archlinux.org/henkan.git" "$AUR_DIR" 2>/dev/null || {
    echo "WARNING: Could not clone AUR repo (ssh key may not be set up)."
    echo "         To publish manually:"
    echo "           git clone ssh://aur@aur.archlinux.org/henkan.git"
    echo "           cp packaging/aur/PKGBUILD packaging/aur/.SRCINFO ./"
    echo "           updpkgsums"
    echo "           makepkg --printsrcinfo > .SRCINFO"
    echo "           git add . && git commit -m 'v$VER' && git push"
    return
  }

  local tarball_url="$RELEASE_URL/v$VER.tar.gz"
  local tarball_sha
  tarball_sha=$(fetch_sha256 "$tarball_url")

  sed -i "s/pkgver=.*/pkgver=$VER/" "$AUR_DIR/PKGBUILD"
  sed -i "s/pkgrel=.*/pkgrel=1/" "$AUR_DIR/PKGBUILD"
  sed -i "s/sha256sums=('.*')/sha256sums=('$tarball_sha')/" "$AUR_DIR/PKGBUILD"

  cd "$AUR_DIR"
  updpkgsums 2>/dev/null || true
  makepkg --printsrcinfo > .SRCINFO
  git add -A
  git commit -m "chore: update to v$VER"
  git push
  echo "AUR package updated to v$VER"
}

# ---------------------------------------------------------------------------
# 2. Homebrew (custom tap: kaanreal/homebrew-tap)
# ---------------------------------------------------------------------------
publish_brew() {
  echo "--- Publishing to Homebrew tap ---"

  local dmg_url="https://github.com/$GH_REPO/releases/download/v$VER/Henkan_${VER}_aarch64.dmg"
  local dmg_sha
  dmg_sha=$(fetch_sha256 "$dmg_url") || {
    echo "WARNING: Could not fetch .dmg checksum. Skipping Homebrew."
    return
  }

  TAP_DIR="/tmp/henkan-homebrew-tap"
  rm -rf "$TAP_DIR"
  git clone "https://github.com/kaanreal/homebrew-tap.git" "$TAP_DIR" 2>/dev/null || {
    echo "WARNING: Could not clone homebrew-tap repo."
    echo "         Create https://github.com/kaanreal/homebrew-tap with:"
    echo "           mkdir -p Formula Casks"
    echo "         Then re-run."
    return
  }

  mkdir -p "$TAP_DIR/Formula" "$TAP_DIR/Casks"

  # CLI formula
  cat > "$TAP_DIR/Formula/henkan-cli.rb" <<FORMULA
class HenkanCli < Formula
  desc "CLI for osu!mania ↔ Etterna/StepMania beatmap converter"
  homepage "https://github.com/kaanreal/henkan"
  url "https://github.com/kaanreal/henkan/archive/refs/tags/v$VER.tar.gz"
  sha256 "$(fetch_sha256 "https://github.com/$GH_REPO/archive/refs/tags/v$VER.tar.gz")"
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

  # Desktop cask
  cat > "$TAP_DIR/Casks/henkan.rb" <<CASK
cask "henkan" do
  version "$VER"
  sha256 "$dmg_sha"

  url "$dmg_url"
  name "Henkan"
  desc "osu!mania ↔ Etterna/StepMania beatmap converter"
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

  cd "$TAP_DIR"
  git add -A
  git commit -m "chore: update to v$VER" 2>/dev/null || echo "Nothing changed"
  git push 2>/dev/null || echo "WARNING: Could not push to homebrew-tap. Push manually."
  echo "Homebrew tap updated to v$VER"
}

# ---------------------------------------------------------------------------
# 3. Winget
# ---------------------------------------------------------------------------
publish_winget() {
  echo "--- Publishing to Winget ---"

  local msi_url="$RELEASE_URL/Henkan_${VER}_x64_en-US.msi"
  local msi_sha
  msi_sha=$(fetch_sha256 "$msi_url") || {
    echo "WARNING: Could not fetch .msi checksum. Skipping Winget."
    return
  }

  WINGET_DIR="/tmp/henkan-winget"
  rm -rf "$WINGET_DIR"
  git clone "https://github.com/kaanreal/winget-pkgs.git" "$WINGET_DIR" 2>/dev/null || {
    echo "WARNING: Could not clone winget-pkgs fork."
    echo "         Create a fork of microsoft/winget-pkgs and re-run."
    return
  }

  local manifest_dir="$WINGET_DIR/manifests/k/ka/kaanreal/henkan/$VER"
  mkdir -p "$manifest_dir"

  cat > "$manifest_dir/henkan.installer.yaml" <<YAML
# yaml-language-server: \\\$schema=https://raw.githubusercontent.com/microsoft/winget-cli/master/schemas/JSON/manifests/v1.6.0/manifest.installer.1.6.0.json
PackageIdentifier: kaanreal.henkan
PackageVersion: $VER
InstallerLocale: en-US
InstallerType: wix
InstallerSwitches:
  Silent: /quiet /norestart
  SilentWithProgress: /passive /norestart
ProductCode: "{CHANGE_ME}"
Installers:
  - Architecture: x64
    InstallerUrl: $msi_url
    InstallerSha256: $msi_sha
ManifestType: installer
ManifestVersion: 1.6.0
YAML

  cat > "$manifest_dir/henkan.locale.en-US.yaml" <<YAML
# yaml-language-server: \\\$schema=https://raw.githubusercontent.com/microsoft/winget-cli/master/schemas/JSON/manifests/v1.6.0/manifest.locale.1.6.0.json
PackageIdentifier: kaanreal.henkan
PackageVersion: $VER
PackageLocale: en-US
Publisher: kaanreal
PublisherUrl: https://github.com/kaanreal
PublisherSupportUrl: https://github.com/kaanreal/henkan/issues
Author: kaanreal
PackageName: Henkan
PackageUrl: https://github.com/kaanreal/henkan
License: MIT
LicenseUrl: https://github.com/kaanreal/henkan/blob/main/LICENSE
ShortDescription: osu!mania ↔ Etterna / StepMania beatmap converter
Description: A cross-platform desktop and CLI tool for converting beatmaps between osu!mania (.osu/.osz) and Etterna / StepMania (.sm) formats. Preserves millisecond-accurate timing, handles BPM changes, hold/long notes, and metadata mapping.
Moniker: henkan
Tags:
  - osu
  - osu-mania
  - etterna
  - stepmania
  - beatmap
  - converter
  - vsrg
  - rhythm-game
ManifestType: defaultLocale
ManifestVersion: 1.6.0
YAML

  cat > "$manifest_dir/henkan.yaml" <<YAML
# yaml-language-server: \\\$schema=https://raw.githubusercontent.com/microsoft/winget-cli/master/schemas/JSON/manifests/v1.6.0/manifest.version.1.6.0.json
PackageIdentifier: kaanreal.henkan
PackageVersion: $VER
DefaultLocale: en-US
ManifestType: version
ManifestVersion: 1.6.0
YAML

  cd "$WINGET_DIR"
  git add -A
  git commit -m "New version: kaanreal.henkan $VER"
  git push
  echo "Winget manifests pushed. Create a PR at https://github.com/microsoft/winget-pkgs"
}

# ---------------------------------------------------------------------------
# 4. Chocolatey
# ---------------------------------------------------------------------------
publish_choco() {
  echo "--- Publishing to Chocolatey ---"

  local msi_url="$RELEASE_URL/Henkan_${VER}_x64_en-US.msi"
  local msi_sha
  msi_sha=$(fetch_sha256 "$msi_url") || {
    echo "WARNING: Could not fetch .msi checksum. Skipping Chocolatey."
    return
  }

  CHOCO_DIR="/tmp/henkan-choco"
  rm -rf "$CHOCO_DIR"
  mkdir -p "$CHOCO_DIR/tools"

  cat > "$CHOCO_DIR/henkan.nuspec" <<NUSPEC
<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://schemas.microsoft.com/packaging/2015/06/nuspec.xsd">
  <metadata>
    <id>henkan</id>
    <version>$VER</version>
    <title>Henkan</title>
    <authors>kaanreal</authors>
    <owners>kaanreal</owners>
    <projectUrl>https://github.com/kaanreal/henkan</projectUrl>
    <iconUrl>https://raw.githubusercontent.com/kaanreal/henkan/main/public/logo32.png</iconUrl>
    <licenseUrl>https://github.com/kaanreal/henkan/blob/main/LICENSE</licenseUrl>
    <projectSourceUrl>https://github.com/kaanreal/henkan</projectSourceUrl>
    <bugTrackerUrl>https://github.com/kaanreal/henkan/issues</bugTrackerUrl>
    <packageSourceUrl>https://github.com/kaanreal/henkan</packageSourceUrl>
    <tags>osu osu-mania etterna stepmania beatmap converter vsrg rhythm-game</tags>
    <summary>osu!mania ↔ Etterna / StepMania beatmap converter</summary>
    <description>Henkan (\u5909\u63db) is a cross-platform desktop and CLI tool for converting beatmaps between osu!mania (.osu/.osz) and Etterna / StepMania (.sm) formats.</description>
    <releaseNotes>https://github.com/kaanreal/henkan/releases/tag/v$VER</releaseNotes>
    <dependencies>
      <dependency id="chocolatey-core.extension" version="1.4.0" />
    </dependencies>
  </metadata>
  <files>
    <file src="tools\\\\**" target="tools" />
  </files>
</package>
NUSPEC

  cat > "$CHOCO_DIR/tools/chocolateyinstall.ps1" <<CHOCO
\\\$ErrorActionPreference = 'Stop'
\\\$toolsDir   = "\$(Split-Path -parent \\\$MyInvocation.MyCommand.Definition)"
\\\$url        = '$msi_url'
\\\$checksum   = '$msi_sha'
\\\$checksumType = 'sha256'
\\\$packageArgs = @{
  packageName    = \\\$env:ChocolateyPackageName
  fileType       = 'msi'
  url            = \\\$url
  checksum       = \\\$checksum
  checksumType   = \\\$checksumType
  softwareName   = 'Henkan*'
  silentArgs     = '/quiet /norestart'
  validExitCodes = @(0, 3010, 1641)
}
Install-ChocolateyPackage @packageArgs
CHOCO

  cat > "$CHOCO_DIR/tools/chocolateyuninstall.ps1" <<CHOCO
\\\$ErrorActionPreference = 'Stop'
\\\$packageName = \\\$env:ChocolateyPackageName
\\\$softwareName = 'Henkan*'
[array]\\\$key = Get-UninstallRegistryKey -SoftwareName \\\$softwareName
if (\\\$key.Count -eq 1) {
  \\\$key | ForEach-Object {
    \\\$silentArgs = "\\\$(\\\$_.PSChildName) /quiet /norestart"
    if (\\\$_.UninstallString) {
      \\\$silentArgs = "\\\$(\\\$_.UninstallString) /quiet /norestart"
    }
    Uninstall-ChocolateyPackage -PackageName \\\$packageName `
                                -FileType 'msi' `
                                -SilentArgs \\\$silentArgs `
                                -ValidExitCodes @(0, 3010, 1605, 1614, 1641)
  }
} elseif (\\\$key.Count -eq 0) {
  Write-Warning "\\\$packageName has been already uninstalled by other means."
} elseif (\\\$key.Count -gt 1) {
  Write-Warning "\\\$key.Count matches found."
}
CHOCO

  cd "$CHOCO_DIR"
  choco pack
  echo "Chocolatey package built at $CHOCO_DIR/henkan.$VER.nupkg"
  echo "Push it with:"
  echo "  choco push henkan.$VER.nupkg --source https://push.chocolatey.org/"
  echo "Or set CHOCOLATEY_API_KEY and it will auto-publish."
  if [ -n "${CHOCOLATEY_API_KEY:-}" ]; then
    choco push "henkan.$VER.nupkg" --source https://push.chocolatey.org/ --api-key "$CHOCOLATEY_API_KEY"
    echo "Chocolatey package published to v$VER"
  fi
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if $PUBLISH_ALL || $PUBLISH_AUR; then publish_aur; fi
if $PUBLISH_ALL || $PUBLISH_BREW; then publish_brew; fi
if $PUBLISH_ALL || $PUBLISH_WINGET; then publish_winget; fi
if $PUBLISH_ALL || $PUBLISH_CHOCO; then publish_choco; fi

echo "=== Done ==="
