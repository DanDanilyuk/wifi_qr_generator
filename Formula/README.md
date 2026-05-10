# Homebrew formula (DRAFT)

This directory contains a draft Homebrew formula for installing
`wifi_gen.sh` as the `wifi-qr` command.

**Status: DRAFT.** The formula in `wifi-qr.rb` is not installable from this
directory as-is. To make it installable you need to:

1. Cut a real release tag (`v0.1.0` or whatever the current version is) on
   GitHub.
2. Replace the `sha256 "REPLACE_WITH_REAL_SHA_AFTER_RELEASE"` line with the
   actual SHA-256 of the release tarball:
   ```sh
   curl -sL https://github.com/danDanilyuk/wifi_qr_generator/archive/refs/tags/v0.1.0.tar.gz | shasum -a 256
   ```
3. Verify completion-file paths in `def install` match what the upstream
   repo actually ships under `completions/`. The current draft expects:
   - `completions/wifi_gen.bash` (Bash completion)
   - `completions/_wifi_gen` (Zsh completion)
   If either is absent, drop the corresponding line or the formula will
   fail to install.
4. Verify the man page path matches. The current draft expects
   `man/wifi_gen.1`.

## Publishing to a tap

Until this lands in homebrew-core, the easiest distribution path is a
personal tap:

```sh
# One-time setup of the tap repo (creates github.com/danDanilyuk/homebrew-tap)
brew tap-new danDanilyuk/tap

# Copy this formula into the new tap and push it
cp Formula/wifi-qr.rb "$(brew --repo danDanilyuk/tap)/Formula/wifi-qr.rb"
cd "$(brew --repo danDanilyuk/tap)"
git add Formula/wifi-qr.rb
git commit -m "wifi-qr 0.1.0"
git push -u origin main

# End users then install via:
brew install danDanilyuk/tap/wifi-qr
```

Replace `danDanilyuk` with your GitHub username if you fork.

## Submitting to homebrew-core (later)

Once the project has stable releases, an established user base, and meets
the homebrew-core acceptance criteria
(<https://docs.brew.sh/Acceptable-Formulae>), the formula can be submitted
upstream via a pull request to
<https://github.com/Homebrew/homebrew-core>. At that point the
`brew install danDanilyuk/tap/wifi-qr` command becomes simply
`brew install wifi-qr`.

## Dependencies

The formula declares one optional dependency:

- **`qrencode`** (`recommended`). Required only for the `--qr` flag, which
  renders the QR code as ASCII / UTF-8 directly in the terminal. The
  default install pulls it in; users who do not want it can opt out with
  `brew install --without-qrencode wifi-qr` (or skip the flag entirely).

No other runtime dependencies are required: `wifi_gen.sh` relies on
platform-stock tools (`networksetup`, `security`, `nmcli`, `netsh`, etc.)
that are already present on supported systems.

## Test stanza

The `test do` block exercises only flags that do not require an active
Wi-Fi connection or admin privileges: `--version` and `--help`. This is
deliberate. A formula's test runs in Homebrew's CI sandbox where there is
no Wi-Fi to detect, so anything network-aware would flake.

## Files installed

| Source                         | Installed location                                            |
|--------------------------------|---------------------------------------------------------------|
| `wifi_gen.sh`                  | `<prefix>/bin/wifi-qr`                                        |
| `man/wifi_gen.1`               | `<prefix>/share/man/man1/wifi-qr.1`                           |
| `completions/wifi_gen.bash`    | `<prefix>/etc/bash_completion.d/wifi-qr`                      |
| `completions/_wifi_gen`        | `<prefix>/share/zsh/site-functions/_wifi-qr`                  |

(`<prefix>` is `/opt/homebrew` on Apple Silicon and `/usr/local` on Intel
Macs and Linux.)
