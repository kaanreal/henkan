#!/usr/bin/env bash
# Publish one Henkan release to a package-manager repository.
# Usage: ci-publish.sh TARGET TAG SOURCE_SHA DMG_SHA INSTALLER_SHA APPIMAGE_SHA
set -euo pipefail

TARGET="$1"
TAG="$2"
SOURCE_SHA="$3"
DMG_SHA="$4"
INSTALLER_SHA="$5"
APPIMAGE_SHA="$6"
VERSION="${TAG#v}"
REPO="kaanreal/henkan"
RELEASE_URL="https://github.com/$REPO/releases/download/$TAG"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

git_identity() {
  git config user.email "kaanreal@users.noreply.github.com"
  git config user.name "kaanreal"
}

sed_i() {
  case "$(uname -s)" in
    Darwin) sed -i '' "$@" ;;
    *) sed -i "$@" ;;
  esac
}

case "$TARGET" in
  aur)
    install -d -m 700 ~/.ssh
    printf '%s\n' "$AUR_SSH_PRIVATE_KEY" > ~/.ssh/id_ed25519
    chmod 600 ~/.ssh/id_ed25519
    ssh-keyscan aur.archlinux.org >> ~/.ssh/known_hosts
    rm -rf /tmp/henkan-aur
    git clone ssh://aur@aur.archlinux.org/henkan-bin.git /tmp/henkan-aur
    cp "$SCRIPT_DIR/aur/PKGBUILD" "$SCRIPT_DIR/aur/.SRCINFO" "$SCRIPT_DIR/aur/LICENSE" /tmp/henkan-aur/
    sed_i "s/^pkgver=.*/pkgver=$VERSION/" /tmp/henkan-aur/PKGBUILD
    sed_i "s/^pkgrel=.*/pkgrel=1/" /tmp/henkan-aur/PKGBUILD
    sed_i "0,/'[0-9a-f]\{64\}'/s//'$APPIMAGE_SHA'/" /tmp/henkan-aur/PKGBUILD
    sed_i "s/^\tpkgver = .*/\tpkgver = $VERSION/" /tmp/henkan-aur/.SRCINFO
    sed_i "0,/^\tsource = .*/s||\tsource = Henkan-$VERSION.AppImage::$RELEASE_URL/Henkan-v$VERSION-linux.AppImage|" /tmp/henkan-aur/.SRCINFO
    sed_i "0,/^\tsha256sums = .*/s//\tsha256sums = $APPIMAGE_SHA/" /tmp/henkan-aur/.SRCINFO
    cd /tmp/henkan-aur
    git_identity
    git add PKGBUILD .SRCINFO LICENSE
    git diff --cached --quiet || git commit -m "chore: update to $TAG"
    git push
    ;;

  homebrew)
    rm -rf /tmp/henkan-homebrew
    git clone "https://x-access-token:${HOMEBREW_TAP_TOKEN}@github.com/kaanreal/homebrew-tap.git" /tmp/henkan-homebrew
    mkdir -p /tmp/henkan-homebrew/Formula /tmp/henkan-homebrew/Casks
    cp "$SCRIPT_DIR/homebrew/Formula/henkan-cli.rb" /tmp/henkan-homebrew/Formula/
    cp "$SCRIPT_DIR/homebrew/Casks/henkan.rb" /tmp/henkan-homebrew/Casks/
    sed_i "s/version \"[^\"]*\"/version \"$VERSION\"/" /tmp/henkan-homebrew/Casks/henkan.rb
    sed_i "s/sha256 \"[^\"]*\"/sha256 \"$DMG_SHA\"/" /tmp/henkan-homebrew/Casks/henkan.rb
    sed_i "s|tags/v[^\"]*\.tar\.gz|tags/v$VERSION.tar.gz|" /tmp/henkan-homebrew/Formula/henkan-cli.rb
    sed_i "s/sha256 \"[^\"]*\"/sha256 \"$SOURCE_SHA\"/" /tmp/henkan-homebrew/Formula/henkan-cli.rb
    cd /tmp/henkan-homebrew
    git_identity
    git add Formula/henkan-cli.rb Casks/henkan.rb
    git diff --cached --quiet || git commit -m "chore: update to $TAG"
    git push
    ;;

  winget)
    rm -rf /tmp/henkan-winget
    git clone --filter=blob:none --no-checkout "https://x-access-token:${WINGET_GITHUB_TOKEN}@github.com/kaanreal/winget-pkgs.git" /tmp/henkan-winget
    cd /tmp/henkan-winget
    git remote add upstream https://github.com/microsoft/winget-pkgs.git
    git fetch --depth=1 upstream master
    git sparse-checkout init --cone
    git sparse-checkout set "manifests/k/kaanreal/Henkan"
    git checkout -B "henkan-$VERSION" upstream/master
    dir="manifests/k/kaanreal/Henkan/$VERSION"
    mkdir -p "$dir"
    cp "$SCRIPT_DIR/winget/henkan.yaml" "$dir/kaanreal.Henkan.yaml"
    cp "$SCRIPT_DIR/winget/henkan.installer.yaml" "$dir/kaanreal.Henkan.installer.yaml"
    cp "$SCRIPT_DIR/winget/henkan.locale.en-US.yaml" "$dir/kaanreal.Henkan.locale.en-US.yaml"
    sed_i "s/^PackageVersion: .*/PackageVersion: $VERSION/" "$dir"/*.yaml
    sed_i "s|/v[0-9][^/]*/Henkan-v[0-9][^-]*-windows|/$TAG/Henkan-v$VERSION-windows|" "$dir/kaanreal.Henkan.installer.yaml"
    sed_i "s/^    InstallerSha256: .*/    InstallerSha256: ${INSTALLER_SHA^^}/" "$dir/kaanreal.Henkan.installer.yaml"
    sed_i "s|/tag/v[0-9][^[:space:]]*|/tag/$TAG|" "$dir/kaanreal.Henkan.locale.en-US.yaml"
    git_identity
    git add "$dir"
    git commit -m "New version: kaanreal.Henkan $VERSION"
    git push --force origin "henkan-$VERSION"
    GH_TOKEN="$WINGET_GITHUB_TOKEN" gh pr create \
      --repo microsoft/winget-pkgs \
      --head "kaanreal:henkan-$VERSION" \
      --base master \
      --title "New version: kaanreal.Henkan version $VERSION" \
      --body "Automated upstream submission for Henkan $TAG."
    ;;

  chocolatey)
    rm -rf /tmp/henkan-chocolatey /tmp/henkan.nupkg
    mkdir -p /tmp/henkan-chocolatey/tools /tmp/henkan-chocolatey/_rels
    cp "$SCRIPT_DIR/templates/henkan.nuspec" /tmp/henkan-chocolatey/henkan.nuspec
    cp "$SCRIPT_DIR/templates/chocolateyinstall.ps1" "$SCRIPT_DIR/templates/chocolateyuninstall.ps1" /tmp/henkan-chocolatey/tools/
    sed_i "s/{{VERSION}}/$VERSION/g" /tmp/henkan-chocolatey/henkan.nuspec
    sed_i "s|{{INSTALLER_URL}}|$RELEASE_URL/Henkan-v$VERSION-windows-setup.exe|g" /tmp/henkan-chocolatey/tools/chocolateyinstall.ps1
    sed_i "s/{{INSTALLER_SHA}}/$INSTALLER_SHA/g" /tmp/henkan-chocolatey/tools/chocolateyinstall.ps1
    printf '%s\n' '<?xml version="1.0" encoding="utf-8"?>' '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="nuspec" ContentType="application/vnd.openxmlformats-package.core-manifest+xml"/><Default Extension="ps1" ContentType="application/octet-stream"/></Types>' > /tmp/henkan-chocolatey/\[Content_Types\].xml
    printf '%s\n' '<?xml version="1.0" encoding="utf-8"?>' '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="R1" Type="http://schemas.microsoft.com/packaging/2010/07/manifest" Target="/henkan.nuspec"/></Relationships>' > /tmp/henkan-chocolatey/_rels/.rels
    (cd /tmp/henkan-chocolatey && zip -qr /tmp/henkan.nupkg .)
    dotnet nuget push /tmp/henkan.nupkg --api-key "$CHOCOLATEY_API_KEY" --source https://push.chocolatey.org/
    ;;

  nixpkgs)
    rm -rf /tmp/henkan-nixpkgs
    git clone --filter=blob:none --no-checkout "https://x-access-token:${NIXPKGS_GITHUB_TOKEN}@github.com/kaanreal/nixpkgs.git" /tmp/henkan-nixpkgs
    cd /tmp/henkan-nixpkgs
    git remote add upstream https://github.com/NixOS/nixpkgs.git
    git fetch --depth=1 upstream master
    git sparse-checkout init --cone
    git sparse-checkout set pkgs/by-name/he/henkan maintainers
    git checkout -B "henkan-$VERSION" upstream/master
    mkdir -p pkgs/by-name/he/henkan
    cp "$SCRIPT_DIR/nix/package.nix" pkgs/by-name/he/henkan/package.nix
    sri="sha256-$(printf '%s' "$APPIMAGE_SHA" | xxd -r -p | base64 -w0)"
    sed_i "s/version = \"[^\"]*\"/version = \"$VERSION\"/" pkgs/by-name/he/henkan/package.nix
    sed_i "s|hash = \"sha256-[^\"]*\"|hash = \"$sri\"|" pkgs/by-name/he/henkan/package.nix
    sed_i '/mainProgram = "henkan";/a\    maintainers = with lib.maintainers; [ kaanreal ];' pkgs/by-name/he/henkan/package.nix
    git_identity
    git add pkgs/by-name/he/henkan/package.nix
    git commit -m "henkan: init at $VERSION" -m "Assisted-by: OpenAI Codex (GPT-5)"
    git push --force origin "henkan-$VERSION"
    GH_TOKEN="$NIXPKGS_GITHUB_TOKEN" gh pr create \
      --repo NixOS/nixpkgs \
      --head "kaanreal:henkan-$VERSION" \
      --base master \
      --title "henkan: init at $VERSION" \
      --body "Adds the Henkan rhythm-game map and skin converter. The package wraps the upstream AppImage and declares binary native-code provenance.\n\nAssisted by OpenAI Codex (GPT-5)."
    ;;

  *)
    echo "unknown target: $TARGET" >&2
    exit 2
    ;;
esac
