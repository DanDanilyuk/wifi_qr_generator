#!/usr/bin/env bash
set -euo pipefail

# Universal Wi-Fi QR Generator (portable)
# Opens: https://dandanilyuk.github.io/wifi_qr_generator/index.html?security=...&ssid=...&password=...&hidden=...
APP_URL="https://dandanilyuk.github.io/wifi_qr_generator/index.html"
VERSION="0.1.0"

die() { echo "Error: $*" >&2; exit 1; }

die_with_help() {
  # die_with_help "message" "remediation hint"
  echo "Error: $1" >&2
  if [[ -n "${2-}" ]]; then
    echo "$2" >&2
  fi
  exit 1
}

have() { command -v "$1" >/dev/null 2>&1; }

RESTORE_VERBOSE=0
cleanup() {
  if [[ "${RESTORE_VERBOSE}" == "1" ]]; then
    sudo -n ipconfig setverbose 0 >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

usage() {
  cat <<EOF
Usage:
  wifi_gen.sh [--ssid SSID] [--password PASS|-] [--security WPA2|WPA3|WEP|WPA|nopass]
              [--hidden true|false] [--print] [--qr] [--copy]
              [--list-networks] [--version] [--help]

If SSID/PASS are not provided, the script tries to detect the current Wi-Fi on:
  - macOS (including Tahoe; may prompt for sudo)
  - Linux (NetworkManager/nmcli, iwgetid, iw, wpa_supplicant fallbacks)
  - Windows (Git Bash/MSYS/Cygwin/WSL via powershell.exe + netsh)

Options:
  --ssid SSID
  --password PASS    Wi-Fi password. Use '-' to read from stdin/tty (recommended).
                     Note: passing the password as an argument is visible to other
                     users of this machine via 'ps -ef' and may be saved in shell
                     history. Prefer the WIFI_PASSWORD env var or --password -.
  --pass PASS        Alias for --password.
  --security TYPE    WPA, WPA2, WPA3, WEP, or nopass (case-insensitive).
  --hidden true|false
  --print            Print the URL instead of opening a browser.
  --qr               Render a terminal QR code (requires qrencode). Encodes the
                     WIFI: payload directly so phones can scan it without a URL.
  --copy             Copy the URL (or WIFI: string with --qr) to the system
                     clipboard (pbcopy / wl-copy / xclip / xsel / clip.exe).
  --list-networks    List saved Wi-Fi profile names on this machine and exit.
  --version          Print version and exit.
  -h, --help         Show this help and exit.

Environment:
  WIFI_PASSWORD      Used as the default password when --password is not given.
                     Safer than passing on the command line.

Examples:
  WIFI_PASSWORD='hunter2' wifi_gen.sh --ssid HomeNet --print
  wifi_gen.sh --password - --ssid HomeNet --print   # reads password from tty
  wifi_gen.sh --qr --copy                           # auto-detect, show QR, copy
EOF
}

# URL-encode for query string. With LC_ALL=C the substring slice is by byte,
# so multibyte UTF-8 sequences are encoded byte-by-byte. We mask each byte
# with 0xFF because bash's "'$c" trick sign-extends bytes >= 0x80, which
# would otherwise produce values like %FFFFFFFFFFFFFFE2.
url_encode() {
  local LC_ALL=C
  local string="${1-}"
  local strlen=${#string}
  local encoded=""
  local pos c o byte

  for (( pos=0 ; pos<strlen ; pos++ )); do
    c="${string:$pos:1}"
    case "$c" in
      [-_.~a-zA-Z0-9]) o="${c}" ;;
      *)
        printf -v byte '%d' "'$c"
        printf -v o '%%%02X' "$(( byte & 0xFF ))"
        ;;
    esac
    encoded+="${o}"
  done
  printf '%s' "${encoded}"
}

# Escape a value for embedding in a WIFI: QR payload.
# Spec backslash-escapes: \ ; , : "
wifi_escape() {
  local s="${1-}"
  s="${s//\\/\\\\}"
  s="${s//;/\\;}"
  s="${s//,/\\,}"
  s="${s//:/\\:}"
  s="${s//\"/\\\"}"
  printf '%s' "$s"
}

# Map normalized security label (WPA/WPA2/WPA3/WEP/nopass) to the value used
# inside a WIFI: QR payload's T: field. The standard only defines WPA / WEP /
# nopass; WPA2 and WPA3 collapse to WPA for client compatibility.
wifi_qr_security() {
  case "${1-}" in
    WPA|WPA2|WPA3) echo "WPA" ;;
    WEP) echo "WEP" ;;
    nopass|"") echo "nopass" ;;
    *) echo "WPA" ;;
  esac
}

generate_qr_url() {
  local security="$1" ssid="$2" password="$3" hidden="$4"
  local u_sec u_ssid u_pass u_hidden
  u_sec="$(url_encode "$security")"
  u_ssid="$(url_encode "$ssid")"
  u_pass="$(url_encode "$password")"
  u_hidden="$(url_encode "$hidden")"
  printf "%s?security=%s&ssid=%s&password=%s&hidden=%s\n" \
    "$APP_URL" "$u_sec" "$u_ssid" "$u_pass" "$u_hidden"
}

# Build the WIFI: payload that lives inside the QR code itself.
generate_wifi_string() {
  local security="$1" ssid="$2" password="$3" hidden="$4"
  local t e_ssid e_pass h
  t="$(wifi_qr_security "$security")"
  e_ssid="$(wifi_escape "$ssid")"
  e_pass="$(wifi_escape "$password")"
  case "$hidden" in
    true|TRUE|True|yes|YES|Yes|1) h="true" ;;
    *) h="false" ;;
  esac
  if [[ "$t" == "nopass" ]]; then
    printf 'WIFI:T:%s;S:%s;H:%s;;' "$t" "$e_ssid" "$h"
  else
    printf 'WIFI:T:%s;S:%s;P:%s;H:%s;;' "$t" "$e_ssid" "$e_pass" "$h"
  fi
}

is_wsl() {
  [[ -r /proc/version ]] && grep -qiE "(microsoft|wsl)" /proc/version 2>/dev/null
}

detect_os() {
  local u
  u="$(uname -s 2>/dev/null || echo unknown)"
  case "$u" in
    Darwin) echo "Mac" ;;
    Linux)
      if is_wsl; then echo "Windows"
      else echo "Linux"
      fi
      ;;
    CYGWIN*|MINGW*|MSYS*) echo "Windows" ;;
    *) echo "unknown" ;;
  esac
}

print_manual_url_hint() {
  echo "Could not open browser. Open this URL manually:" >&2
  echo "$1" >&2
}

open_url() {
  local url="$1"
  local os="$2"
  case "$os" in
    Mac) open "$url" ;;
    Linux)
      if have xdg-open; then xdg-open "$url" >/dev/null 2>&1 || true
      elif have gio; then gio open "$url" >/dev/null 2>&1 || true
      else print_manual_url_hint "$url"
      fi
      ;;
    Windows)
      if have powershell.exe; then
        powershell.exe -NoProfile -Command "Start-Process '$url'" >/dev/null 2>&1 || print_manual_url_hint "$url"
      elif have cmd.exe; then
        cmd.exe /c start "" "$url" >/dev/null 2>&1 || print_manual_url_hint "$url"
      else
        print_manual_url_hint "$url"
      fi
      ;;
    *) print_manual_url_hint "$url" ;;
  esac
}

# Prompt the user for a password. Writes the prompt to stderr so callers can
# capture stdout cleanly. Tries (in order): controlling terminal /dev/tty,
# stdin if it's a tty, plain stdin (last resort, no prompt).
# Returns 0 on success, 1 if no input was readable.
prompt_password() {
  local prompt="${1:-Enter Wi-Fi password: }"
  local pw=""
  if { exec 9</dev/tty; } 2>/dev/null; then
    printf '%s' "$prompt" >&2
    IFS= read -r -s pw <&9
    exec 9<&-
    echo "" >&2
  elif [[ -t 0 ]]; then
    printf '%s' "$prompt" >&2
    IFS= read -r -s pw
    echo "" >&2
  else
    if ! IFS= read -r pw; then
      return 1
    fi
  fi
  printf '%s' "$pw"
}

# Used by --password -. Same as prompt_password but with a generic prompt.
read_password_from_dash() {
  prompt_password "Enter Wi-Fi password: "
}

# ---------------- Clipboard / QR / list-networks ----------------

clipboard_copy() {
  # Copy stdin to the system clipboard. Returns 0 on success, 1 on no tool.
  local os="$1"
  case "$os" in
    Mac)
      if have pbcopy; then pbcopy; return 0; fi
      ;;
    Linux)
      if [[ -n "${WAYLAND_DISPLAY-}" ]] && have wl-copy; then
        wl-copy
        return 0
      fi
      if have xclip; then xclip -selection clipboard; return 0; fi
      if have xsel; then xsel --clipboard --input; return 0; fi
      if have wl-copy; then wl-copy; return 0; fi
      ;;
    Windows)
      if have clip.exe; then clip.exe; return 0; fi
      if have clip; then clip; return 0; fi
      ;;
  esac
  cat >/dev/null 2>&1 || true
  return 1
}

qr_render_terminal() {
  # qr_render_terminal <wifi_string>
  local payload="$1"
  if ! have qrencode; then
    echo "qrencode not installed (install: brew install qrencode | apt install qrencode | yum install qrencode). Falling back to URL." >&2
    return 1
  fi
  printf '%s' "$payload" | qrencode -t UTF8 -l M
  return 0
}

list_networks() {
  local os="$1"
  case "$os" in
    Mac)
      local iface
      iface="$(mac_wifi_interface)"
      if ! have networksetup; then
        die_with_help "networksetup not found." "This script supports macOS via /usr/sbin/networksetup. Are you on macOS?"
      fi
      networksetup -listpreferredwirelessnetworks "$iface" 2>/dev/null \
        | sed -e '1d' -e 's/^[[:space:]]*//'
      ;;
    Linux)
      if have nmcli; then
        nmcli -t -f NAME,TYPE connection show 2>/dev/null \
          | awk -F: '$2=="wifi" || $2=="802-11-wireless"{print $1}'
      else
        die_with_help "nmcli not found; cannot list saved networks on this system." \
          "Install NetworkManager (apt install network-manager / dnf install NetworkManager) or run with sudo to read /etc/wpa_supplicant/*.conf manually."
      fi
      ;;
    Windows)
      if have netsh.exe; then
        netsh.exe wlan show profiles 2>/dev/null \
          | awk -F': ' '/All User Profile|Profile/{name=$2; gsub(/^[[:space:]]+|[[:space:]]+$/, "", name); if (name != "") print name}'
      elif have powershell.exe; then
        powershell.exe -NoProfile -Command "(netsh wlan show profiles) | Select-String 'All User Profile' | ForEach-Object { (\$_ -split ':')[1].Trim() }" 2>/dev/null \
          | tr -d '\r'
      else
        die_with_help "Cannot list networks on Windows: no netsh.exe or powershell.exe in PATH." \
          "From a Git Bash / WSL session, ensure /mnt/c/Windows/System32 (or equivalent) is on PATH."
      fi
      ;;
    *)
      die_with_help "Unsupported OS for --list-networks: $os" "Supported: macOS, Linux (nmcli), Windows."
      ;;
  esac
}

# ---------------- macOS helpers ----------------

mac_wifi_interface() {
  # Return the device name of the first hardware port whose status is
  # "active". Falls back to the first Wi-Fi-like port, then en0.
  local first="" candidate iface_list
  iface_list="$(networksetup -listallhardwareports 2>/dev/null | awk '
    /Hardware Port: (Wi-Fi|AirPort)/ {found=1; next}
    found && /Device:/ {print $2; found=0}
  ' || true)"
  while IFS= read -r candidate; do
    [[ -z "$candidate" ]] && continue
    [[ -z "$first" ]] && first="$candidate"
    if mac_iface_is_active "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done <<< "$iface_list"
  if [[ -n "$first" ]]; then
    printf '%s\n' "$first"
  else
    printf '%s\n' "en0"
  fi
}

mac_iface_is_active() {
  local iface="$1"
  ifconfig "$iface" 2>/dev/null | grep -q "status: active"
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

mac_auth_from_system_profiler() {
  # Recent macOS versions sometimes drop "auth type" from ipconfig getsummary
  # but still expose spairport_security_mode in system_profiler.
  local mode
  mode="$(system_profiler SPAirPortDataType 2>/dev/null \
    | awk -F': ' '/Security[[:space:]]*Mode|Security[[:space:]]*:/ {print $2; exit}' \
    | sed 's/[[:space:]]*$//' || true)"
  if [[ -z "$mode" ]]; then
    mode="$(/usr/libexec/PlistBuddy -c \
      'Print :0:_items:0:spairport_airport_interfaces:0:spairport_current_network_information:spairport_security_mode' \
      /dev/stdin <<<"$(system_profiler SPAirPortDataType -xml 2>/dev/null)" 2>/dev/null || true)"
  fi
  printf '%s' "$mode"
}

mac_auth_from_wdutil() {
  # wdutil exposes a richer security string than ipconfig on Tahoe+.
  # Requires sudo for full output.
  if ! have wdutil; then
    return 0
  fi
  local sudo_cmd=""
  if sudo -n true 2>/dev/null; then
    sudo_cmd="sudo"
  fi
  $sudo_cmd wdutil info 2>/dev/null \
    | awk -F': ' '/^[[:space:]]*Security[[:space:]]*:/{print $2; exit}' \
    | sed 's/[[:space:]]*$//' || true
}

sudo_run() {
  # Prompt if needed
  sudo "$@"
}

mac_try_unredact_with_sudo() {
  sudo_run ipconfig setverbose 1 >/dev/null 2>&1 || return 1
  RESTORE_VERBOSE=1
  return 0
}

normalize_security() {
  local raw="${1-}"
  local low
  low="$(printf "%s" "$raw" | tr '[:upper:]' '[:lower:]')"
  case "$low" in
    *enterprise*|*802.1x*|*eap*)
      echo "Warning: Enterprise/802.1x Wi-Fi networks generally cannot be joined from a QR code. Generating it anyway; the target device will likely need to be configured manually." >&2
      echo "WPA2"
      ;;
    *wpa3*|*sae*) echo "WPA3" ;;
    *wpa2*|*wpa*|*personal*) echo "WPA2" ;;
    *wep*) echo "WEP" ;;
    *none*|*open*) echo "nopass" ;;
    "") echo "WPA" ;;
    *) echo "WPA" ;;
  esac
}

# ---------------- Linux helpers ----------------

linux_detect_nmcli() { have nmcli; }

linux_active_wifi_connection() {
  nmcli -t -f NAME,TYPE connection show --active 2>/dev/null \
    | awk -F: '$2=="wifi" || $2=="802-11-wireless"{print $1; exit}'
}

linux_ssid_from_nmcli() {
  local con="$1"
  nmcli -g 802-11-wireless.ssid connection show "$con" 2>/dev/null || true
}

linux_pass_from_nmcli() {
  local con="$1"
  nmcli -s -g 802-11-wireless-security.psk connection show "$con" 2>/dev/null || true
}

linux_pass_from_nmcli_sudo() {
  local con="$1"
  sudo -n nmcli -s -g 802-11-wireless-security.psk connection show "$con" 2>/dev/null || true
}

linux_keymgmt_from_nmcli() {
  local con="$1"
  nmcli -g 802-11-wireless-security.key-mgmt connection show "$con" 2>/dev/null || true
}

linux_hidden_from_nmcli() {
  local con="$1" out
  out="$(nmcli -g 802-11-wireless.hidden connection show "$con" 2>/dev/null || true)"
  case "$out" in
    yes|true|YES|TRUE|1) echo "true" ;;
    *) echo "false" ;;
  esac
}

linux_ssid_from_iwgetid() {
  if have iwgetid; then
    iwgetid -r 2>/dev/null || true
  fi
}

linux_ssid_from_iw() {
  if ! have iw; then return 0; fi
  local iface
  while IFS= read -r iface; do
    [[ -z "$iface" ]] && continue
    iw dev "$iface" link 2>/dev/null \
      | awk -F': ' '/SSID/{print $2; exit}' \
      | sed 's/[[:space:]]*$//' \
      || true
  done < <(iw dev 2>/dev/null | awk '$1=="Interface"{print $2}')
}

linux_password_from_wpa_supplicant() {
  local ssid="$1" file content psk ssid_re
  if [[ -z "$ssid" ]]; then return 0; fi

  local sudo_cmd=""
  if sudo -n true 2>/dev/null; then
    sudo_cmd="sudo -n"
  fi

  # NetworkManager keyfile dir (modern default).
  for file in /etc/NetworkManager/system-connections/*.nmconnection; do
    [[ -e "$file" ]] || continue
    content="$($sudo_cmd cat "$file" 2>/dev/null || true)"
    [[ -z "$content" ]] && continue
    ssid_re="$(printf '%s' "$ssid" | sed 's/[][\.*^$/]/\\&/g')"
    if printf '%s\n' "$content" | grep -qE "^[[:space:]]*ssid=${ssid_re}[[:space:]]*$"; then
      psk="$(printf '%s\n' "$content" | awk -F'=' '/^[[:space:]]*psk=/{sub(/^[[:space:]]*psk=/, ""); print; exit}')"
      if [[ -n "$psk" ]]; then
        printf '%s' "$psk"
        return 0
      fi
    fi
  done

  # wpa_supplicant config(s).
  for file in /etc/wpa_supplicant/wpa_supplicant.conf /etc/wpa_supplicant/*.conf; do
    [[ -e "$file" ]] || continue
    content="$($sudo_cmd cat "$file" 2>/dev/null || true)"
    [[ -z "$content" ]] && continue
    psk="$(printf '%s\n' "$content" | awk -v s="$ssid" '
      BEGIN { in_block=0; ssid_match=0; psk="" }
      /network[[:space:]]*=[[:space:]]*\{/ { in_block=1; ssid_match=0; psk=""; next }
      in_block && /^[[:space:]]*ssid[[:space:]]*=/ {
        line=$0
        sub(/^[[:space:]]*ssid[[:space:]]*=[[:space:]]*/, "", line)
        gsub(/^"|"$/, "", line)
        if (line == s) ssid_match=1
        next
      }
      in_block && /^[[:space:]]*psk[[:space:]]*=/ {
        line=$0
        sub(/^[[:space:]]*psk[[:space:]]*=[[:space:]]*/, "", line)
        gsub(/^"|"$/, "", line)
        psk=line
        next
      }
      in_block && /\}/ {
        if (ssid_match && psk != "") { print psk; exit }
        in_block=0; ssid_match=0; psk=""
      }
    ' || true)"
    if [[ -n "$psk" ]]; then
      printf '%s' "$psk"
      return 0
    fi
  done

  return 0
}

linux_iw_first_connected_iface() {
  if ! have iw; then return 0; fi
  local iface
  while IFS= read -r iface; do
    [[ -z "$iface" ]] && continue
    if iw dev "$iface" link 2>/dev/null | grep -q "^Connected to"; then
      printf '%s\n' "$iface"
      return 0
    fi
  done < <(iw dev 2>/dev/null | awk '$1=="Interface"{print $2}')
}

# ---------------- Windows helpers (Git Bash/MSYS/Cygwin) ----------------

windows_detect_via_powershell() { have powershell.exe; }

# ---------------- Main ----------------

# Skip main execution when this script is sourced (e.g. by bats tests). The
# `(return 0 ...)` trick exits a *function*-like context with success only when
# we're being sourced; in a normal invocation, `return` errors out. We swallow
# stderr so the test harness gets no spurious noise.
if (return 0 2>/dev/null); then
  return 0
fi

SSID=""
PASSWORD=""
PASSWORD_SET="false"
SECURITY=""
HIDDEN=""
PRINT_ONLY="false"
WANT_QR="false"
WANT_COPY="false"
LIST_NETWORKS="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ssid)
      [[ $# -ge 2 ]] || die "--ssid requires a value"
      SSID="${2-}"; shift 2 ;;
    --password|--pass)
      [[ $# -ge 2 ]] || die "--password requires a value (use '-' to read from stdin/tty)"
      PASSWORD="${2-}"; PASSWORD_SET="true"; shift 2 ;;
    --security)
      [[ $# -ge 2 ]] || die "--security requires a value"
      SECURITY="${2-}"; shift 2 ;;
    --hidden)
      [[ $# -ge 2 ]] || die "--hidden requires a value"
      HIDDEN="${2-}"; shift 2 ;;
    --print) PRINT_ONLY="true"; shift ;;
    --qr) WANT_QR="true"; shift ;;
    --copy) WANT_COPY="true"; shift ;;
    --list-networks) LIST_NETWORKS="true"; shift ;;
    --version) printf 'wifi_gen.sh %s\n' "$VERSION"; exit 0 ;;
    -h|--help) usage; exit 0 ;;
    *) die_with_help "Unknown argument: $1" "Run 'wifi_gen.sh --help' to see available options." ;;
  esac
done

# Resolve --password '-' or env-var default. Both must happen BEFORE detection
# so we don't prompt twice.
if [[ "${PASSWORD_SET}" == "true" && "${PASSWORD}" == "-" ]]; then
  PASSWORD="$(read_password_from_dash)"
elif [[ "${PASSWORD_SET}" == "false" && -n "${WIFI_PASSWORD-}" ]]; then
  PASSWORD="${WIFI_PASSWORD}"
  PASSWORD_SET="true"
fi

OS="$(detect_os)"

# --list-networks short-circuit: list and exit, no detection.
if [[ "${LIST_NETWORKS}" == "true" ]]; then
  list_networks "$OS"
  exit 0
fi

# Auto-detect values if not provided
if [[ -z "${SSID}" || -z "${SECURITY}" || -z "${HIDDEN}" || ( -z "${PASSWORD}" && "${SECURITY:-}" != "nopass" ) ]]; then
  case "$OS" in
    Mac)
      iface="$(mac_wifi_interface)"
      if ! mac_iface_is_active "$iface"; then
        die_with_help "Wi-Fi interface '$iface' is not active." \
          "Connect to a Wi-Fi network first, or pass --ssid/--password/--security manually. Check status: ifconfig $iface | grep status"
      fi

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
        echo "macOS is hiding the SSID. Requesting admin privileges to reveal it (you may be prompted for your password)." >&2
        if mac_try_unredact_with_sudo; then
          SSID="$(mac_ssid_from_ipconfig "$iface" || true)"
        fi
      fi

      if [[ -z "${SSID}" ]]; then
        die_with_help "Could not detect an active Wi-Fi SSID." \
          "Pass --ssid manually, or check that Wi-Fi is connected: networksetup -getairportnetwork $iface"
      fi

      # Security
      if [[ -z "${SECURITY}" ]]; then
        raw="$(mac_auth_from_ipconfig "$iface" || true)"
        if [[ -z "$raw" ]]; then
          raw="$(mac_auth_from_wdutil || true)"
        fi
        if [[ -z "$raw" ]]; then
          raw="$(mac_auth_from_system_profiler || true)"
        fi
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
          if ! PASSWORD="$(prompt_password "Enter Wi-Fi password for '$SSID': ")"; then
            die_with_help "Could not read Wi-Fi password from Keychain." \
              "Pass --password manually, set WIFI_PASSWORD, or run from an interactive terminal so we can prompt you."
          fi
        fi
      fi
      ;;

    Linux)
      method=""
      if linux_detect_nmcli; then
        con="$(linux_active_wifi_connection || true)"
        if [[ -n "${con}" ]]; then
          method="nmcli"
          [[ -n "${SSID}" ]] || SSID="$(linux_ssid_from_nmcli "$con")"
          if [[ -z "${PASSWORD}" && "${SECURITY:-}" != "nopass" ]]; then
            PASSWORD="$(linux_pass_from_nmcli "$con")"
            if [[ -z "${PASSWORD}" ]]; then
              # nmcli returns empty without root for psk. Retry under sudo -n.
              PASSWORD="$(linux_pass_from_nmcli_sudo "$con")"
              if [[ -z "${PASSWORD}" ]]; then
                echo "Note: nmcli could not read the saved password without root. Cached sudo not available." >&2
              fi
            fi
          fi
          if [[ -z "${SECURITY}" ]]; then
            km="$(linux_keymgmt_from_nmcli "$con")"
            SECURITY="$(normalize_security "$km")"
            [[ -z "${PASSWORD}" && "${SECURITY}" != "nopass" ]] && SECURITY="WPA2"
          fi
          [[ -n "${HIDDEN}" ]] || HIDDEN="$(linux_hidden_from_nmcli "$con")"
        fi
      fi

      # Fallbacks if nmcli yielded nothing useful.
      if [[ -z "${SSID}" ]]; then
        SSID="$(linux_ssid_from_iwgetid || true)"
        [[ -n "${SSID}" ]] && method="${method:+$method, }iwgetid"
      fi
      if [[ -z "${SSID}" ]]; then
        SSID="$(linux_ssid_from_iw || true)"
        [[ -n "${SSID}" ]] && method="${method:+$method, }iw"
      fi

      if [[ -z "${SSID}" ]]; then
        die_with_help "Could not detect an active Wi-Fi SSID on Linux." \
          "Pass --ssid manually, or install one of: nmcli (network-manager), iwgetid (wireless-tools), iw."
      fi

      if [[ -z "${PASSWORD}" && "${SECURITY:-}" != "nopass" ]]; then
        PASSWORD="$(linux_password_from_wpa_supplicant "$SSID" || true)"
        [[ -n "${PASSWORD}" ]] && method="${method:+$method, }wpa_supplicant/keyfile"
      fi

      # Final fallback: prompt the user.
      if [[ -z "${PASSWORD}" && "${SECURITY:-}" != "nopass" ]]; then
        echo "Hint: nmcli secrets normally need elevation. Try: sudo -v && wifi_gen.sh ..." >&2
        if ! PASSWORD="$(prompt_password "Enter Wi-Fi password for '$SSID': ")"; then
          die_with_help "Could not read Wi-Fi password automatically." \
            "Pass --password manually, set WIFI_PASSWORD, or run with sudo so nmcli/keyfiles are readable."
        fi
      fi

      [[ -n "${SECURITY}" ]] || SECURITY="WPA2"
      [[ -n "${HIDDEN}" ]] || HIDDEN="false"

      if [[ -n "$method" ]]; then
        echo "Linux: detected Wi-Fi via $method." >&2
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
        if [[ ${#lines[@]} -lt 1 ]]; then
          die_with_help "Windows: could not detect SSID via netsh." \
            "Confirm Wi-Fi is connected: netsh wlan show interfaces (in PowerShell). Otherwise pass --ssid/--password manually."
        fi
        [[ -n "${SSID}" ]] || SSID="${lines[0]}"
        [[ -n "${SECURITY}" ]] || SECURITY="$(normalize_security "${lines[1]-}")"
        [[ -n "${PASSWORD}" || "${SECURITY}" == "nopass" ]] || PASSWORD="${lines[2]-}"
        [[ -n "${HIDDEN}" ]] || HIDDEN="false"

        if [[ -z "${SSID}" ]]; then
          die_with_help "Windows: no active SSID detected." \
            "Connect to a Wi-Fi network first, or pass --ssid manually."
        fi
        if [[ -z "${PASSWORD}" && "${SECURITY}" != "nopass" ]]; then
          if ! PASSWORD="$(prompt_password "Enter Wi-Fi password for '$SSID': ")"; then
            die_with_help "Could not read Wi-Fi password from netsh." \
              "Pass --password manually, set WIFI_PASSWORD, or run from an interactive terminal."
          fi
        fi
      else
        die_with_help "Windows/WSL: powershell.exe interop not available." \
          "Pass --ssid/--password/--security manually. From WSL, ensure /mnt/c/Windows/System32/WindowsPowerShell/v1.0 is on PATH."
      fi
      ;;

    *)
      die_with_help "Unsupported OS: $OS" "Pass --ssid/--password/--security manually, or run on macOS, Linux, or Windows."
      ;;
  esac
fi

# Defaults/safety
[[ -n "${SECURITY}" ]] || SECURITY="WPA"
[[ -n "${HIDDEN}" ]] || HIDDEN="false"
if [[ -z "${PASSWORD}" && "${SECURITY}" != "nopass" ]]; then
  die_with_help "No password available." \
    "Pass --password (or --password - to read from stdin/tty), set WIFI_PASSWORD, or use --security nopass for an open network."
fi
if [[ -z "${PASSWORD}" ]]; then
  SECURITY="nopass"
fi

qr_url="$(generate_qr_url "$SECURITY" "$SSID" "$PASSWORD" "$HIDDEN")"
wifi_payload="$(generate_wifi_string "$SECURITY" "$SSID" "$PASSWORD" "$HIDDEN")"

# --qr renders the QR (containing the WIFI: payload) and exits before opening
# a browser - the QR is the deliverable.
if [[ "${WANT_QR}" == "true" ]]; then
  if qr_render_terminal "$wifi_payload"; then
    if [[ "${WANT_COPY}" == "true" ]]; then
      if printf '%s' "$wifi_payload" | clipboard_copy "$OS"; then
        echo "WIFI payload copied to clipboard." >&2
      else
        echo "Could not copy to clipboard: no supported tool found (pbcopy/wl-copy/xclip/xsel/clip.exe)." >&2
      fi
    fi
    exit 0
  fi
  # qrencode missing - fall through to URL behaviour.
fi

if [[ "${WANT_COPY}" == "true" ]]; then
  if printf '%s' "$qr_url" | clipboard_copy "$OS"; then
    echo "URL copied to clipboard." >&2
  else
    echo "Could not copy to clipboard: no supported tool found (pbcopy/wl-copy/xclip/xsel/clip.exe)." >&2
  fi
fi

if [[ "${PRINT_ONLY}" == "true" ]]; then
  echo "$qr_url"
else
  open_url "$qr_url" "$OS"
fi
