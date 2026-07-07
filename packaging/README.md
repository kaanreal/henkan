# Henkan – Package Manager Distribution

This directory contains everything needed to distribute Henkan on
the four major package managers.

## Quick Reference

| Manager | Install Command | Setup Required |
|---------|----------------|----------------|
| **macOS – Homebrew (app)** | `brew tap kaanreal/tap`<br>`brew install --cask kaanreal/tap/henkan` | [Tap repo + token](#homebrew) |
| **macOS – Homebrew (CLI)** | `brew tap kaanreal/tap`<br>`brew install kaanreal/tap/henkan-cli` | [Tap repo + token](#homebrew) |
| **Windows – Winget** | `winget install kaanreal.henkan` | [Fork + token](#winget) |
| **Windows – Chocolatey** | `choco install henkan` | [API key](#chocolatey) |
| **Arch – AUR** | `yay -S henkan` | [AUR SSH key](#aur) |

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
2. Initialise it with `Formula/` and `Casks/` directories and push an empty commit.
3. Add `HOMEBREW_TAP_TOKEN` (a GitHub PAT with `repo` scope) to GitHub secrets.
4. The CI workflow writes and pushes the formula/cask on every release automatically.
5. Users install with:
   ```bash
   brew tap kaanreal/tap
   brew install --cask kaanreal/tap/henkan   # GUI app
   brew install kaanreal/tap/henkan-cli      # CLI (builds from source)
   ```

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
