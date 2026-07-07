# Henkan – Package Manager Distribution

This directory contains everything needed to distribute Henkan on
the four major package managers.

## Quick Reference

| Manager | Install Command | Setup Required |
|---------|----------------|----------------|
| **Arch (AUR)** | `yay -S henkan` | [AUR SSH key](#aur) |
| **macOS (Homebrew)** | `brew install kaanreal/tap/henkan-cli`<br>`brew install --cask kaanreal/tap/henkan` | [Tap repo + token](#homebrew) |
| **Windows (Winget)** | `winget install kaanreal.henkan` | [Fork + token](#winget) |
| **Windows (Choco)** | `choco install henkan` | [API key](#chocolatey) |

---

## Setup Instructions

### AUR

1. Create an account on https://aur.archlinux.org
2. Request SSH access and add your SSH public key
3. Clone the AUR package repo and push the initial `PKGBUILD`:
   ```bash
   git clone ssh://aur@aur.archlinux.org/henkan.git
   cp packaging/aur/PKGBUILD packaging/aur/.SRCINFO henkan/
   cd henkan
   updpkgsums
   makepkg --printsrcinfo > .SRCINFO
   git add -A && git commit -m "initial commit" && git push
   ```
4. Add `AUR_SSH_PRIVATE_KEY` to GitHub secrets.

### Homebrew

1. Create a tap repo on GitHub: `https://github.com/kaanreal/homebrew-tap`
2. Initialize it:
   ```bash
   git clone https://github.com/kaanreal/homebrew-tap.git
   mkdir -p homebrew-tap/Formula homebrew-tap/Casks
   cp packaging/homebrew/Formula/henkan-cli.rb homebrew-tap/Formula/
   cp packaging/homebrew/Casks/henkan.rb homebrew-tap/Casks/
   cd homebrew-tap
   git add -A && git commit -m "initial tap" && git push
   ```
3. Users install with: `brew tap kaanreal/tap`
4. Add `HOMEBREW_TAP_TOKEN` (a GitHub PAT with repo scope) to secrets.
5. Optionally submit to homebrew-core: `brew extract --version 1.1.0 henkan homebrew/core`

### Winget

1. Fork `https://github.com/microsoft/winget-pkgs`
2. Clone your fork to `https://github.com/kaanreal/winget-pkgs`
3. Add `WINGET_GITHUB_TOKEN` (a GitHub PAT with repo scope) to secrets.
4. The CI workflow will push to your fork and create a PR.
5. The first submission may take a few days for review.

### Chocolatey

1. Create an account on https://chocolatey.org
2. Request an API key
3. Add `CHOCOLATEY_API_KEY` to GitHub secrets.
4. Verify email and complete moderation checklist.
5. The first package needs manual approval.

## Manual Publishing

You can also publish manually with the script:

```bash
# Publish everything (needs all tokens configured)
VERSION=v1.1.0 ./packaging/publish.sh

# Publish only specific managers
VERSION=v1.1.0 ./packaging/publish.sh --aur
VERSION=v1.1.0 ./packaging/publish.sh --brew
VERSION=v1.1.0 ./packaging/publish.sh --winget
VERSION=v1.1.0 ./packaging/publish.sh --choco
```

## Where Packaging Files Live

```
packaging/
├── README.md                       ← this file
├── publish.sh                      ← universal publish script
├── aur/
│   ├── PKGBUILD                    ← Arch build recipe
│   └── .SRCINFO                    ← AUR metadata
├── homebrew/
│   ├── Formula/henkan-cli.rb       ← CLI formula (builds from source)
│   └── Casks/henkan.rb             ← Desktop cask (prebuilt .dmg)
├── winget/
│   ├── henkan.yaml                 ← version manifest
│   ├── henkan.installer.yaml       ← installer manifest
│   └── henkan.locale.en-US.yaml    ← metadata manifest
└── chocolatey/
    ├── henkan.nuspec               ← Chocolatey package spec
    └── tools/
        ├── chocolateyinstall.ps1   ← install script
        └── chocolateyuninstall.ps1 ← uninstall script
```
