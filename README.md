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
- Works offline once loaded; no analytics, no backend

**Shell helper (`wifi_gen.sh`)**
- Cross-platform autodetect: macOS (including Tahoe redaction handling), Linux (NetworkManager / nmcli), Windows (Git Bash / MSYS / Cygwin / WSL via `powershell.exe` + `netsh`)
- Reads the password from the macOS Keychain when available; falls back to a hidden TTY prompt
- Manual overrides: `--ssid`, `--password`, `--security`, `--hidden`
- `--print` mode for piping the URL elsewhere
- Warns when an enterprise / 802.1X profile is detected (Wi-Fi QR codes don't support that flow; see security notes)

## Security notes

- **Setup links contain the password in the URL.** "Copy Setup Link" embeds the password as a query parameter so the recipient's browser can prefill the form. Treat the link like the password itself - send it over an end-to-end-encrypted channel, not via a public log or chat history.
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

The web app is fully static. Serve the directory with anything you have:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

Run the JS unit tests (no dependencies; uses the Node built-in test runner):

```bash
node --test tests/*.test.mjs
# or
npm test
```

Optional formatter / linter (after `npm install`):

```bash
npm run lint
npm run format:check
```

## Browser support

Modern Chromium (Chrome, Edge, Brave, Arc), Firefox, and Safari (desktop + iOS). The Web Share API and `navigator.clipboard.writeText` are used when available and gracefully degrade to a hidden-textarea + `document.execCommand('copy')` fallback for older browsers.

## Acknowledgments

- [qrcodejs](https://github.com/davidshimjs/qrcodejs) - QR rendering on the canvas.
- [jsPDF](https://github.com/parallax/jsPDF) - the printable Wi-Fi card export.

## License

[MIT](./LICENSE) - Dan Danilyuk.
