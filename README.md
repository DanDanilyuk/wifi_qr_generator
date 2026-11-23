# Wi-Fi QR Generator

Generate a scannable QR code that joins a Wi-Fi network instantly. Use the static web app for a hand-typed flow, or run the shell helper to autodetect the network you're already connected to and open the app with everything prefilled.

## Quick start

**Web app:** open <https://dandanilyuk.github.io/wifi_qr_generator/>, fill in SSID + password, hit Generate.

**Shell helper (auto-detect current Wi-Fi):**

macOS:
```bash
/bin/bash -c "$(curl -fsSL https://dandanilyuk.github.io/wifi_qr_generator/wifi_gen.sh)"
```

Linux:
```bash
bash <(curl -fsSL https://dandanilyuk.github.io/wifi_qr_generator/wifi_gen.sh)
```

Windows (PowerShell):
```powershell
powershell -Command "& {Invoke-WebRequest -Uri 'https://dandanilyuk.github.io/wifi_qr_generator/wifi_gen.sh' -OutFile \"$env:TEMP\wifi_gen.sh\"; bash \"$env:TEMP\wifi_gen.sh\"}"
```

The script detects your current SSID, security mode, and password, then opens the web app with the form prefilled. Pass `--print` to print the prefilled URL instead of opening a browser.

## Features

**Web app**
- Form-based QR generation for WPA / WPA2 / WPA3, WEP, and open networks
- Dark / light theme toggle that respects system preference
- Copy, PNG download, and printable PDF "card" export (jsPDF)
- "Copy Setup Link" produces a shareable URL with the form prefilled
- Auto-fills from URL parameters (used by the shell helper)
- Network names and passwords in any language, emoji included
- "Import QR from image" reads an existing Wi-Fi code from a photo or screenshot
- Terminal command picker for macOS, Windows, and Linux, preselected for the system you're on
- System fonts and native controls, so it looks at home on every OS
- Works offline after the first visit; no CDN, no analytics, no backend. The QR, PDF, and decoder libraries ship with the site (see [`vendor/`](./vendor/README.md))

**Shell helper (`wifi_gen.sh`)**
- Cross-platform autodetect: macOS (including Tahoe redaction handling), Linux (NetworkManager / nmcli), Windows (Git Bash / MSYS / Cygwin / WSL via `powershell.exe` + `netsh`)
- Reads the password from the macOS Keychain when available; falls back to a hidden TTY prompt
- Manual overrides: `--ssid`, `--password`, `--security`, `--hidden`
- `--print` mode for piping the URL elsewhere
- Warns when an enterprise / 802.1X profile is detected (Wi-Fi QR codes don't support that flow; see security notes)

## Security notes

- **Setup links contain the password in the URL.** "Copy Setup Link" embeds the password in the URL fragment (the part after `#`) so the recipient's browser can prefill the form. Browsers never send the fragment to the server, so it does not reach GitHub Pages, but it is still in the link itself. Treat the link like the password itself - send it over an end-to-end-encrypted channel, not via a public log or chat history.
- **Wi-Fi QR codes don't support Enterprise (802.1X / EAP) networks.** Those require per-device profile installation. The shell script will warn and fall back to WPA2; the resulting QR code probably won't actually connect on its own.
- **Avoid leaking the password through `ps`.** The shell script accepts `--password VALUE` but other users on the same machine can see process arguments. Prefer one of:
  - `WIFI_PASSWORD=secret wifi_gen.sh` (env var; not visible in `ps`)
  - `printf '%s' "$WIFI_PASSWORD" | wifi_gen.sh --password -` (read from stdin if your wrapper supports it)
  - Or just let the script pull from Keychain / nmcli / netsh.
- The web app runs entirely client-side. Nothing about the network ever leaves the browser unless you explicitly share the setup link or upload the generated PDF.

## How credentials are detected

- **macOS:** SSID via `networksetup -getairportnetwork`, then `ipconfig getsummary`, then `system_profiler` as a fallback. Recent macOS releases (Ventura+ and especially Tahoe) redact the SSID from non-privileged callers; the script will offer to escalate via `sudo ipconfig setverbose 1` and restore the previous setting on exit. Password comes from the Keychain via `security find-generic-password -wa "$SSID"`, which prompts the user to allow access on first use.
- **Linux:** Active connection name and PSK via `nmcli`. Requires NetworkManager (the default on Ubuntu, Fedora, Debian-with-NM, etc.). Headless / wpa_supplicant-only systems are not supported automatically; pass `--ssid` / `--password` manually.
- **Windows:** Run from Git Bash, MSYS, Cygwin, or WSL. The script invokes `powershell.exe -NoProfile -Command` to call `netsh wlan show interfaces` (SSID + auth) and `netsh wlan show profile name="<SSID>" key=clear` (password). Note that revealing the key with `netsh` requires the user to be an admin on the box; otherwise the password field will be empty and the script will prompt at the TTY.

## Local development

The web app is fully static, with no build step. Serve the directory with anything you have:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

It has to be served over http(s): the scripts are ES modules, which browsers refuse to load from a `file://` path.

| File | What it is |
| --- | --- |
| `index.html` + `main.js` | The editor page |
| `scan.html` + `scan.js` | The read-only page behind "Copy scan-only link" |
| `wifi.js` | Shared logic (Wi-Fi string, links, OS detection, QR drawing). Both pages and the tests import this one file |
| `theme.js` | Applies the saved or system theme before first paint |
| `styles.css` | All styling, for both pages |
| `service-worker.js` | Offline cache. Serves from cache and refreshes in the background, so a deploy shows up on the next visit without bumping a version |
| `vendor/` | Third-party libraries, unmodified |

Run the JS unit tests (no dependencies; uses the Node built-in test runner):

```bash
node --test tests/*.test.mjs
# or
npm test
```

The shell helper has its own suite in `tests/wifi_gen.bats` (needs [bats](https://github.com/bats-core/bats-core)).

Optional formatter / linter (after `npm install`):

```bash
npm run lint
npm run format:check
```

## Browser support

Current Chromium (Chrome, Edge, Brave, Arc), Firefox, and Safari on macOS, Windows, Linux, iOS, and Android.

Features that only some systems have degrade instead of breaking:

- **Sharing:** the Share button appears only where the Web Share API exists.
- **Clipboard:** falls back to a hidden textarea + `document.execCommand('copy')` when `navigator.clipboard` is missing or denied.
- **QR import:** uses the built-in `BarcodeDetector` where the OS provides one and the bundled jsQR everywhere else.
- **Storage:** if `localStorage` is blocked (private modes, strict cookie settings) the app still works; it just doesn't remember recent networks or the theme.
- **Display settings:** honors dark mode, reduced motion, and Windows high-contrast (forced colors) mode.

## Acknowledgments

- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) - builds the QR code.
- [jsQR](https://github.com/cozmo/jsQR) - reads QR codes from imported images.
- [jsPDF](https://github.com/parallax/jsPDF) - the printable Wi-Fi card export.

## License

[MIT](./LICENSE) - Dan Danilyuk.
