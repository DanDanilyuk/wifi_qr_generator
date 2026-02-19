#!/usr/bin/env bash
set -euo pipefail

# Universal Wi‑Fi QR Generator (portable)
# Opens: https://dandanilyuk.github.io/wifi_qr_generator/index.html?security=...&ssid=...&password=...&hidden=...
APP_URL="https://dandanilyuk.github.io/wifi_qr_generator/index.html"

die() { echo "Error: $*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

usage() {
  cat <<'EOF'
Usage:
  wifi_gen.sh [--ssid SSID] [--password PASS] [--security WPA2|WPA3|WEP|WPA|nopass] [--hidden true|false] [--print]

If SSID/PASS are not provided, the script will try to detect the current Wi‑Fi on:
  - macOS (including Tahoe; may prompt for sudo)
  - Linux (NetworkManager/nmcli if available)
  - Windows (Git Bash/MSYS/Cygwin via powershell.exe + netsh if available)

Options:
  --ssid SSID
  --password PASS
  --security TYPE
  --hidden true|false
  --print       Print URL instead of opening browser
EOF
}

# URL-encode for query string
url_encode() {
  local LC_ALL=C
  local string="${1-}"
  local strlen=${#string}
  local encoded=""
  local pos c o

  for (( pos=0 ; pos<strlen ; pos++ )); do
     c=${string:$pos:1}
     case "$c" in
        [-_.~a-zA-Z0-9] ) o="${c}" ;;
        * ) printf -v o '%%%02X' "'$c" ;;
     esac
     encoded+="${o}"
  done
  printf '%s' "${encoded}"
}

generate_qr_url() {
  local security="$1" ssid="$2" password="$3" hidden="$4"
  local u_ssid u_pass
  u_ssid="$(url_encode "$ssid")"
  u_pass="$(url_encode "$password")"
  printf "%s?security=%s&ssid=%s&password=%s&hidden=%s\n" \
    "$APP_URL" "$security" "$u_ssid" "$u_pass" "$hidden"
}

detect_os() {
  local u
  u="$(uname -s 2>/dev/null || echo unknown)"
  case "$u" in
    Darwin) echo "Mac" ;;
    Linux) echo "Linux" ;;
    CYGWIN*|MINGW*|MSYS*) echo "Windows" ;;
    *) echo "unknown" ;;
  esac
}

open_url() {
  local url="$1"
  local os="$2"
  case "$os" in
    Mac) open "$url" ;;
    Linux)
      if have xdg-open; then xdg-open "$url" >/dev/null 2>&1 || true
      elif have gio; then gio open "$url" >/dev/null 2>&1 || true
      else echo "$url"
      fi
      ;;
    Windows)
      if have powershell.exe; then
        powershell.exe -NoProfile -Command "Start-Process '$url'" >/dev/null 2>&1 || echo "$url"
      elif have cmd.exe; then
        cmd.exe /c start "" "$url" >/dev/null 2>&1 || echo "$url"
      else
        echo "$url"
      fi
      ;;
    *) echo "$url" ;;
  esac
}

# ---------------- macOS helpers ----------------

mac_wifi_interface() {
  local iface
  iface="$(networksetup -listallhardwareports 2>/dev/null | awk '
    /Hardware Port: (Wi-Fi|AirPort)/ {found=1}
    found && /Device:/ {print $2; exit}
  ' || true)"
  [[ -n "${iface:-}" ]] || iface="en0"
  echo "$iface"
}

mac_ssid_from_networksetup() {
  local iface="$1" out
  out="$(networksetup -getairportnetwork "$iface" 2>/dev/null || true)"
  # "Current Wi-Fi Network: SSID"
  if [[ "$out" == Current\ Wi-Fi\ Network:\ * ]]; then
    printf "%s\n" "${out#Current Wi-Fi Network: }"
  else
    printf "%s\n" ""
  fi
}

mac_ssid_from_ipconfig() {
  local iface="$1"
  ipconfig getsummary "$iface" 2>/dev/null \
    | awk -F' SSID : ' '/ SSID : /{print $2; exit}' \
    | sed 's/[[:space:]]*$//'
}

mac_auth_from_ipconfig() {
  local iface="$1"
  ipconfig getsummary "$iface" 2>/dev/null \
    | awk -F': ' '/ auth type /{print $2; exit}' \
    | sed 's/[[:space:]]*$//'
}

mac_ssid_from_system_profiler() {
  # Can be slow; keep as fallback. (Common Jamf EA approach.)
  /usr/libexec/PlistBuddy -c \
    'Print :0:_items:0:spairport_airport_interfaces:0:spairport_current_network_information:_name' \
    /dev/stdin <<<"$(system_profiler SPAirPortDataType -xml 2>/dev/null)" 2>/dev/null || true
}

sudo_run() {
  # Prompt if needed
  sudo "$@"
}

mac_try_unredact_with_sudo() {
  # Tahoe workaround: temporarily enable verbose to unredact SSID in ipconfig output.
  # We'll also revert afterward.
  sudo_run ipconfig setverbose 1 >/dev/null 2>&1 || return 1
  return 0
}

normalize_security() {
  local raw="${1-}"
  local low
  low="$(printf "%s" "$raw" | tr '[:upper:]' '[:lower:]')"
  case "$low" in
    *wpa3*|*sae*) echo "WPA3" ;;
    *wpa2*|*personal*|*enterprise*|*802.1x*) echo "WPA2" ;;
    *wep*) echo "WEP" ;;
    *none*|*open*) echo "nopass" ;;
    "") echo "WPA" ;;
    *) echo "WPA" ;;
  esac
}

# ---------------- Linux helpers ----------------

linux_detect_nmcli() { have nmcli; }

linux_active_wifi_connection() {
  nmcli -t -f NAME,TYPE connection show --active 2>/dev/null | awk -F: '$2=="wifi"{print $1; exit}'
}

linux_ssid_from_nmcli() {
  local con="$1"
  nmcli -g 802-11-wireless.ssid connection show "$con" 2>/dev/null || true
}

linux_pass_from_nmcli() {
  local con="$1"
  nmcli -s -g 802-11-wireless-security.psk connection show "$con" 2>/dev/null || true
}

linux_keymgmt_from_nmcli() {
  local con="$1"
  nmcli -g 802-11-wireless-security.key-mgmt connection show "$con" 2>/dev/null || true
}

# ---------------- Windows helpers (Git Bash/MSYS/Cygwin) ----------------

windows_detect_via_powershell() { have powershell.exe; }

# ---------------- Main ----------------

SSID=""
PASSWORD=""
SECURITY=""
HIDDEN=""
PRINT_ONLY="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ssid) SSID="${2-}"; shift 2 ;;
    --password|--pass) PASSWORD="${2-}"; shift 2 ;;
    --security) SECURITY="${2-}"; shift 2 ;;
    --hidden) HIDDEN="${2-}"; shift 2 ;;
    --print) PRINT_ONLY="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown argument: $1 (use --help)" ;;
  esac
done

OS="$(detect_os)"

# Auto-detect values if not provided
if [[ -z "${SSID}" || -z "${SECURITY}" || -z "${HIDDEN}" || ( -z "${PASSWORD}" && "${SECURITY:-}" != "nopass" ) ]]; then
  case "$OS" in
    Mac)
      iface="$(mac_wifi_interface)"

      # SSID: try non-sudo first
      if [[ -z "${SSID}" ]]; then
        SSID="$(mac_ssid_from_networksetup "$iface" || true)"
        [[ "$SSID" == "<redacted>" ]] && SSID=""
        [[ -z "$SSID" ]] && SSID="$(mac_ssid_from_ipconfig "$iface" || true)"
        [[ "$SSID" == "<redacted>" ]] && SSID=""
        [[ -z "$SSID" ]] && SSID="$(mac_ssid_from_system_profiler || true)"
        [[ "$SSID" == "<redacted>" ]] && SSID=""
      fi

      # If still missing, try Tahoe sudo unredact path
      if [[ -z "${SSID}" ]]; then
        echo "macOS may require admin privileges to reveal SSID on this version."
        if mac_try_unredact_with_sudo; then
          SSID="$(mac_ssid_from_ipconfig "$iface" || true)"
          # revert redaction setting if possible
          sudo_run ipconfig setverbose 0 >/dev/null 2>&1 || true
        fi
      fi

      [[ -n "${SSID}" ]] || die "No active Wi‑Fi SSID detected."

      # Security
      if [[ -z "${SECURITY}" ]]; then
        raw="$(mac_auth_from_ipconfig "$iface" || true)"
        SECURITY="$(normalize_security "$raw")"
      fi

      # Hidden (best-effort; default false)
      if [[ -z "${HIDDEN}" ]]; then
        HIDDEN="false"
        if have wdutil; then
          if sudo -n true 2>/dev/null; then
            hid="$(sudo wdutil info 2>/dev/null | awk -F': ' '/^ *Hidden network/{print $2; exit}' | xargs || true)"
            [[ "${hid}" == "Yes" ]] && HIDDEN="true"
          fi
        fi
      fi

      # Password (Keychain)
      if [[ -z "${PASSWORD}" && "${SECURITY}" != "nopass" ]]; then
        PASSWORD="$(security find-generic-password -wa "$SSID" 2>/dev/null || true)"
        if [[ -z "${PASSWORD}" ]]; then
          printf "Enter Wi‑Fi password for '%s': " "$SSID" >&2
          read -r -s PASSWORD < /dev/tty
          echo "" >&2
        fi
      fi
      ;;

    Linux)
      if linux_detect_nmcli; then
        con="$(linux_active_wifi_connection || true)"
        [[ -n "${con}" ]] || die "No active Wi‑Fi connection detected (nmcli)."

        [[ -n "${SSID}" ]] || SSID="$(linux_ssid_from_nmcli "$con")"
        [[ -n "${PASSWORD}" || "${SECURITY:-}" == "nopass" ]] || PASSWORD="$(linux_pass_from_nmcli "$con")"

        if [[ -z "${SECURITY}" ]]; then
          km="$(linux_keymgmt_from_nmcli "$con")"
          SECURITY="$(normalize_security "$km")"
          [[ -z "${PASSWORD}" && "${SECURITY}" != "nopass" ]] && SECURITY="WPA2"
        fi

        [[ -n "${HIDDEN}" ]] || HIDDEN="false"
      else
        die "Linux: nmcli not found; pass --ssid/--password/--security manually."
      fi
      ;;

    Windows)
      if windows_detect_via_powershell; then
        # Pull SSID + password via netsh. Profile name is often SSID; if not, user can pass --ssid/--password manually.
        mapfile -t lines < <(powershell.exe -NoProfile -Command - <<'PS'
$ssidLine = netsh wlan show interfaces | Select-String '^\s*SSID\s*:'
if (-not $ssidLine) { exit 2 }
$ssid = ($ssidLine.Line -split ':',2)[1].Trim()
$secLine = netsh wlan show interfaces | Select-String '^\s*Authentication\s*:'
$auth = if ($secLine) { ($secLine.Line -split ':',2)[1].Trim() } else { "" }
# Try profile = SSID
$keyLine = netsh wlan show profile name="$ssid" key=clear 2>$null | Select-String 'Key Content'
$pass = if ($keyLine) { ($keyLine.Line -split ':',2)[1].Trim() } else { "" }
"$ssid"
"$auth"
"$pass"
PS
)
        [[ ${#lines[@]} -ge 1 ]] || die "Windows: could not detect SSID."
        [[ -n "${SSID}" ]] || SSID="${lines[0]}"
        [[ -n "${SECURITY}" ]] || SECURITY="$(normalize_security "${lines[1]-}")"
        [[ -n "${PASSWORD}" || "${SECURITY}" == "nopass" ]] || PASSWORD="${lines[2]-}"
        [[ -n "${HIDDEN}" ]] || HIDDEN="false"

        if [[ -z "${SSID}" ]]; then die "Windows: no active SSID detected."; fi
        if [[ -z "${PASSWORD}" && "${SECURITY}" != "nopass" ]]; then
          printf "Enter Wi‑Fi password for '%s': " "$SSID" >&2
          read -r -s PASSWORD < /dev/tty
          echo "" >&2
        fi
      else
        die "Windows: powershell.exe not found; pass --ssid/--password/--security manually."
      fi
      ;;

    *)
      die "Unsupported OS: $OS (pass --ssid/--password/--security manually)."
      ;;
  esac
fi

# Defaults/safety
[[ -n "${SECURITY}" ]] || SECURITY="WPA"
[[ -n "${HIDDEN}" ]] || HIDDEN="false"
if [[ -z "${PASSWORD}" && "${SECURITY}" != "nopass" ]]; then
  die "No password available; pass --password or use --security nopass."
fi
if [[ -z "${PASSWORD}" ]]; then
  SECURITY="nopass"
fi

qr_url="$(generate_qr_url "$SECURITY" "$SSID" "$PASSWORD" "$HIDDEN")"

if [[ "$PRINT_ONLY" == "true" ]]; then
  echo "$qr_url"
else
  open_url "$qr_url" "$OS"
fi
