#!/usr/bin/env bats
# Tests for parsing helpers in wifi_gen.sh.
#
# Run with:
#   bats tests/wifi_gen.bats
#
# These tests source wifi_gen.sh (which short-circuits its main block when
# sourced), so we can call the internal helpers directly.

setup() {
  SCRIPT_DIR="$(cd "$(dirname "${BATS_TEST_FILENAME}")/.." && pwd)"
  # shellcheck source=../wifi_gen.sh
  source "${SCRIPT_DIR}/wifi_gen.sh"
}

# ---------------- normalize_security ----------------

@test "normalize_security: wpa3 -> WPA3" {
  run normalize_security "wpa3"
  [ "$status" -eq 0 ]
  [ "$output" = "WPA3" ]
}

@test "normalize_security: WPA3 -> WPA3 (case-insensitive)" {
  run normalize_security "WPA3"
  [ "$status" -eq 0 ]
  [ "$output" = "WPA3" ]
}

@test "normalize_security: sae -> WPA3" {
  run normalize_security "sae"
  [ "$status" -eq 0 ]
  [ "$output" = "WPA3" ]
}

@test "normalize_security: wpa2 -> WPA2" {
  run normalize_security "wpa2"
  [ "$status" -eq 0 ]
  [ "$output" = "WPA2" ]
}

@test "normalize_security: wpa -> WPA2 (collapses to WPA2 in this script)" {
  run normalize_security "wpa"
  [ "$status" -eq 0 ]
  [ "$output" = "WPA2" ]
}

@test "normalize_security: personal -> WPA2" {
  run normalize_security "Personal"
  [ "$status" -eq 0 ]
  [ "$output" = "WPA2" ]
}

@test "normalize_security: wep -> WEP" {
  run normalize_security "WEP"
  [ "$status" -eq 0 ]
  [ "$output" = "WEP" ]
}

@test "normalize_security: open -> nopass" {
  run normalize_security "Open"
  [ "$status" -eq 0 ]
  [ "$output" = "nopass" ]
}

@test "normalize_security: none -> nopass" {
  run normalize_security "none"
  [ "$status" -eq 0 ]
  [ "$output" = "nopass" ]
}

@test "normalize_security: empty -> WPA" {
  run normalize_security ""
  [ "$status" -eq 0 ]
  [ "$output" = "WPA" ]
}

@test "normalize_security: gibberish -> WPA" {
  run normalize_security "totally-bogus"
  [ "$status" -eq 0 ]
  [ "$output" = "WPA" ]
}

@test "normalize_security: enterprise emits warning to stderr and returns WPA2" {
  # The function writes stdout=WPA2 and stderr=Warning. `run` merges by default.
  output_combined=$(normalize_security "WPA2-Enterprise" 2>&1)
  [[ "$output_combined" == *"Warning: Enterprise"* ]]
  # Stdout alone should still be just "WPA2".
  output_stdout=$(normalize_security "WPA2-Enterprise" 2>/dev/null)
  [ "$output_stdout" = "WPA2" ]
}

@test "normalize_security: 802.1x emits warning and returns WPA2" {
  output_stdout=$(normalize_security "802.1x" 2>/dev/null)
  [ "$output_stdout" = "WPA2" ]
}

@test "normalize_security: eap emits warning and returns WPA2" {
  output_stdout=$(normalize_security "eap-tls" 2>/dev/null)
  [ "$output_stdout" = "WPA2" ]
}

# ---------------- url_encode ----------------

@test "url_encode: alphanumerics pass through unchanged" {
  run url_encode "Hello123"
  [ "$status" -eq 0 ]
  [ "$output" = "Hello123" ]
}

@test "url_encode: unreserved chars (- _ . ~) pass through" {
  run url_encode "a-b_c.d~e"
  [ "$status" -eq 0 ]
  [ "$output" = "a-b_c.d~e" ]
}

@test "url_encode: ampersand -> %26" {
  run url_encode "a&b"
  [ "$status" -eq 0 ]
  [ "$output" = "a%26b" ]
}

@test "url_encode: equals -> %3D" {
  run url_encode "k=v"
  [ "$status" -eq 0 ]
  [ "$output" = "k%3Dv" ]
}

@test "url_encode: question mark -> %3F" {
  run url_encode "x?y"
  [ "$status" -eq 0 ]
  [ "$output" = "x%3Fy" ]
}

@test "url_encode: hash -> %23" {
  run url_encode "x#y"
  [ "$status" -eq 0 ]
  [ "$output" = "x%23y" ]
}

@test "url_encode: space -> %20" {
  run url_encode "a b"
  [ "$status" -eq 0 ]
  [ "$output" = "a%20b" ]
}

@test "url_encode: command-substitution chars are encoded (no injection)" {
  run url_encode '$()`echo PWNED`'
  [ "$status" -eq 0 ]
  [ "$output" = "%24%28%29%60echo%20PWNED%60" ]
}

@test "url_encode: multibyte UTF-8 (en dash U+2013 = 0xE2 0x80 0x93)" {
  # The encoder masks each byte with 0xFF before printing, so high-bit bytes
  # encode cleanly rather than sign-extending into %FFFFFF.... See url_encode
  # in wifi_gen.sh.
  local input output
  input="$(printf 'caf\xe2\x80\x93')"
  output="$(url_encode "$input")"
  [ "$output" = "caf%E2%80%93" ]
}

@test "url_encode: empty input -> empty output" {
  run url_encode ""
  [ "$status" -eq 0 ]
  [ "$output" = "" ]
}

# ---------------- wifi_escape ----------------

@test "wifi_escape: backslash escaped" {
  run wifi_escape 'a\b'
  [ "$status" -eq 0 ]
  [ "$output" = 'a\\b' ]
}

@test "wifi_escape: semicolon escaped" {
  run wifi_escape 'a;b'
  [ "$status" -eq 0 ]
  [ "$output" = 'a\;b' ]
}

@test "wifi_escape: comma escaped" {
  run wifi_escape 'a,b'
  [ "$status" -eq 0 ]
  [ "$output" = 'a\,b' ]
}

@test "wifi_escape: colon escaped" {
  run wifi_escape 'a:b'
  [ "$status" -eq 0 ]
  [ "$output" = 'a\:b' ]
}

@test "wifi_escape: double-quote escaped" {
  run wifi_escape 'a"b'
  [ "$status" -eq 0 ]
  [ "$output" = 'a\"b' ]
}

# ---------------- wifi_qr_security ----------------

@test "wifi_qr_security: WPA -> WPA" {
  run wifi_qr_security "WPA"
  [ "$status" -eq 0 ]
  [ "$output" = "WPA" ]
}

@test "wifi_qr_security: WPA2 collapses to WPA" {
  run wifi_qr_security "WPA2"
  [ "$status" -eq 0 ]
  [ "$output" = "WPA" ]
}

@test "wifi_qr_security: WPA3 collapses to WPA" {
  run wifi_qr_security "WPA3"
  [ "$status" -eq 0 ]
  [ "$output" = "WPA" ]
}

@test "wifi_qr_security: WEP stays WEP" {
  run wifi_qr_security "WEP"
  [ "$status" -eq 0 ]
  [ "$output" = "WEP" ]
}

@test "wifi_qr_security: nopass stays nopass" {
  run wifi_qr_security "nopass"
  [ "$status" -eq 0 ]
  [ "$output" = "nopass" ]
}

@test "wifi_qr_security: empty -> nopass" {
  run wifi_qr_security ""
  [ "$status" -eq 0 ]
  [ "$output" = "nopass" ]
}

# ---------------- generate_wifi_string ----------------

@test "generate_wifi_string: basic WPA2 has T:WPA (collapsed)" {
  run generate_wifi_string "WPA2" "MyNet" "secret" "false"
  [ "$status" -eq 0 ]
  [ "$output" = 'WIFI:T:WPA;S:MyNet;P:secret;H:false;;' ]
}

@test "generate_wifi_string: nopass omits P:" {
  run generate_wifi_string "nopass" "OpenNet" "" "false"
  [ "$status" -eq 0 ]
  [ "$output" = 'WIFI:T:nopass;S:OpenNet;H:false;;' ]
}

@test "generate_wifi_string: backslash-escapes special chars in ssid/password" {
  run generate_wifi_string "WPA" 'Cafe;Inc' 'p:w\\test' "true"
  [ "$status" -eq 0 ]
  [ "$output" = 'WIFI:T:WPA;S:Cafe\;Inc;P:p\:w\\\\test;H:true;;' ]
}

@test "generate_wifi_string: hidden 'yes' normalizes to true" {
  run generate_wifi_string "WPA" "Net" "p" "yes"
  [ "$status" -eq 0 ]
  [[ "$output" == *";H:true;;" ]]
}

@test "generate_wifi_string: hidden 'random' normalizes to false" {
  run generate_wifi_string "WPA" "Net" "p" "random-junk"
  [ "$status" -eq 0 ]
  [[ "$output" == *";H:false;;" ]]
}

# ---------------- is_wsl ----------------

@test "is_wsl: returns true when /proc/version contains 'microsoft'" {
  tmpdir="$(mktemp -d)"
  printf 'Linux version 5.15.0-microsoft-standard-WSL2\n' >"$tmpdir/version"
  # Override the function to point at our fake file.
  is_wsl() {
    [[ -r "$tmpdir/version" ]] && grep -qiE "(microsoft|wsl)" "$tmpdir/version"
  }
  run is_wsl
  [ "$status" -eq 0 ]
  rm -rf "$tmpdir"
}

@test "is_wsl: returns true when /proc/version contains 'WSL'" {
  tmpdir="$(mktemp -d)"
  printf 'Linux version 5.10.16.3-WSL\n' >"$tmpdir/version"
  is_wsl() {
    [[ -r "$tmpdir/version" ]] && grep -qiE "(microsoft|wsl)" "$tmpdir/version"
  }
  run is_wsl
  [ "$status" -eq 0 ]
  rm -rf "$tmpdir"
}

@test "is_wsl: returns false on regular Linux kernel string" {
  tmpdir="$(mktemp -d)"
  printf 'Linux version 6.1.0-arch1-1\n' >"$tmpdir/version"
  is_wsl() {
    [[ -r "$tmpdir/version" ]] && grep -qiE "(microsoft|wsl)" "$tmpdir/version"
  }
  run is_wsl
  [ "$status" -ne 0 ]
  rm -rf "$tmpdir"
}

@test "is_wsl: returns false when /proc/version is missing" {
  is_wsl() {
    [[ -r "/nonexistent/proc/version" ]] && grep -qiE "(microsoft|wsl)" "/nonexistent/proc/version"
  }
  run is_wsl
  [ "$status" -ne 0 ]
}

# ---------------- generate_qr_url (integration) ----------------

@test "generate_qr_url: encodes ssid, password, security, and hidden" {
  run generate_qr_url "WPA" "Cafe & Co" 'Pa$$w&rd' "true"
  [ "$status" -eq 0 ]
  [ "$output" = 'https://dandanilyuk.github.io/wifi_qr_generator/index.html#security=WPA&ssid=Cafe%20%26%20Co&password=Pa%24%24w%26rd&hidden=true' ]
}

@test "generate_qr_url: command-substitution-looking password is encoded" {
  run generate_qr_url "WPA" "TestNet" '$()`echo PWNED`' "false"
  [ "$status" -eq 0 ]
  [[ "$output" == *"password=%24%28%29%60echo%20PWNED%60"* ]]
  # Make sure no raw shell metachars leak into the URL.
  [[ "$output" != *'$('* ]]
  [[ "$output" != *'`'* ]]
}

# ---------------- macOS: which network, and its password ----------------
#
# These run the whole script against stand-in system commands, so they pass on
# any OS and never touch the real Keychain or ask for admin rights.
#
# The fake Mac reports the current network the way macOS 26+ does: as the
# placeholder "<redacted>".
#   $FAKE/saved             the saved-network list
#   $FAKE/keychain/NAME     that network's password
#   $FAKE/current_by_router the saved network whose remembered router matches
#                           the one in use (what the profile lookup returns)
#   $FAKE/ssid_with_admin   a name the admin step (sudo ipconfig setverbose 1)
#                           reveals, as macOS 26 does
#   $FAKE/tty               answers to anything the script asks the user

fake_cmd() {
  printf '#!/bin/bash\n%s\n' "$2" >"$FAKE/bin/$1"
  chmod +x "$FAKE/bin/$1"
}

fake_mac() {
  FAKE="$(mktemp -d)"
  export FAKE
  mkdir -p "$FAKE/bin" "$FAKE/keychain"
  : >"$FAKE/saved"
  : >"$FAKE/security_calls"

  fake_cmd uname 'echo Darwin'
  fake_cmd ifconfig 'echo "status: active"'
  fake_cmd system_profiler 'echo called >>"$FAKE/system_profiler_calls"'
  fake_cmd wdutil 'exit 0'
  fake_cmd sudo 'echo "sudo $*" >>"$FAKE/sudo_calls"; [ "$1" = -n ] && shift; exec "$@"'
  fake_cmd scutil '
cat >/dev/null
printf "  InterfaceName : en0\n  NetworkSignature : IPv4.Router=10.0.0.1;IPv4.RouterHardwareAddress=aa:bb:cc:dd:ee:ff\n"'
  fake_cmd osascript '
cat >/dev/null
echo "$*" >"$FAKE/osascript_args"
cat "$FAKE/current_by_router" 2>/dev/null || echo'
  fake_cmd networksetup '
case "$1" in
  -listallhardwareports) printf "Hardware Port: Wi-Fi\nDevice: en0\n" ;;
  -getairportnetwork) echo "You are not associated with an AirPort network." ;;
  -listpreferredwirelessnetworks) echo "Preferred networks on en0:"; cat "$FAKE/saved" ;;
esac'
  fake_cmd ipconfig '
if [ "$1" = setverbose ]; then echo "$2" >"$FAKE/verbose"; exit 0; fi
name="<redacted>"
if [ "$(cat "$FAKE/verbose" 2>/dev/null)" = 1 ] && [ -f "$FAKE/ssid_with_admin" ]; then
  name="$(cat "$FAKE/ssid_with_admin")"
fi
printf "  BSSID : <redacted>\n  SSID : %s\n  Security : WPA2_PSK\n" "$name"'
  fake_cmd security '
echo "$*" >>"$FAKE/security_calls"
name="${@: -1}"
if [ ! -f "$FAKE/keychain/$name" ]; then
  echo "The specified item could not be found in the keychain." >&2
  exit 44
fi
cat "$FAKE/keychain/$name"'
}

save_networks() {
  local name
  for name in "$@"; do printf '\t%s\n' "$name" >>"$FAKE/saved"; done
}

run_fake_mac() {
  [ -f "$FAKE/tty" ] || TTY_PATH="$FAKE/no-terminal"
  run env PATH="$FAKE/bin:$PATH" WIFI_GEN_TTY="${TTY_PATH:-$FAKE/tty}" \
    bash "${SCRIPT_DIR}/wifi_gen.sh" --print "$@" </dev/null
}

teardown() {
  if [ -n "${FAKE:-}" ]; then rm -rf "$FAKE"; fi
}

@test "mac_visible: the placeholder macOS prints is not a value" {
  run mac_visible "<redacted>"
  [ "$output" = "" ]
  run mac_visible "Home Net"
  [ "$output" = "Home Net" ]
}

@test "mac: a hidden name is never used as the network name" {
  fake_mac
  save_networks "Home Net"
  printf 's3cret' >"$FAKE/keychain/Home Net"
  run_fake_mac
  [ "$status" -eq 0 ]
  [[ "$output" != *"%3Credacted%3E"* ]]
  [[ "$output" != *"Enter Wi-Fi password"* ]]
  [[ "$output" == *"ssid=Home%20Net&password=s3cret"* ]]
  grep -q -- '-wa Home Net$' "$FAKE/security_calls"
  # One saved network is unambiguous, so admin rights are never requested.
  [[ "$output" != *"admin"* ]]
}

@test "mac: the saved network on the router in use is found with no questions and no admin rights" {
  fake_mac
  save_networks "Home Net" "Office" "Cafe"
  echo "Office" >"$FAKE/current_by_router"
  printf 'officepw' >"$FAKE/keychain/Office"
  run_fake_mac
  [ "$status" -eq 0 ]
  [[ "$output" == *"ssid=Office&password=officepw"* ]]
  [[ "$output" != *"Network number"* ]]
  [[ "$output" != *"Enter Wi-Fi password"* ]]
  [ ! -e "$FAKE/sudo_calls" ] || ! grep -q 'setverbose' "$FAKE/sudo_calls"
  # The lookup is told which router and which interface to match.
  grep -q 'IPv4.Router=10.0.0.1;IPv4.RouterHardwareAddress=aa:bb:cc:dd:ee:ff en0' "$FAKE/osascript_args"
}

@test "mac: the usual path never runs system_profiler, which can take 15+ seconds a call" {
  fake_mac
  save_networks "Home Net" "Office"
  echo "Office" >"$FAKE/current_by_router"
  printf 'officepw' >"$FAKE/keychain/Office"
  run_fake_mac
  [ "$status" -eq 0 ]
  # The security type comes from ipconfig's "Security : WPA2_PSK" line.
  [[ "$output" == *"security=WPA2&ssid=Office&password=officepw"* ]]
  [ ! -e "$FAKE/system_profiler_calls" ]
}

@test "mac: a name revealed by the admin step is used and its password read from the Keychain" {
  fake_mac
  save_networks "Home Net" "Office"
  echo "Office" >"$FAKE/ssid_with_admin"
  printf 'officepw' >"$FAKE/keychain/Office"
  run_fake_mac
  [ "$status" -eq 0 ]
  [[ "$output" == *"ssid=Office&password=officepw"* ]]
  [[ "$output" != *"Network number"* ]]
}

@test "mac: with several saved networks, the one you pick has its password read from the Keychain" {
  fake_mac
  save_networks "Home Net" "Office" "Cafe"
  printf 'officepw' >"$FAKE/keychain/Office"
  printf '2\n' >"$FAKE/tty"
  run_fake_mac
  [ "$status" -eq 0 ]
  [[ "$output" == *"1) Home Net"* ]]
  [[ "$output" == *"3) Cafe"* ]]
  [[ "$output" == *"ssid=Office&password=officepw"* ]]
  [[ "$output" != *"Enter Wi-Fi password"* ]]
}

@test "mac: a choice that is not on the list is asked again" {
  fake_mac
  save_networks "Home Net" "Office" "Cafe"
  printf 'cafepw' >"$FAKE/keychain/Cafe"
  printf 'x\n0\n9\n3\n' >"$FAKE/tty"
  run_fake_mac
  [ "$status" -eq 0 ]
  [[ "$output" == *"ssid=Cafe&password=cafepw"* ]]
}

@test "mac: several saved networks and no terminal gives advice instead of a password prompt" {
  fake_mac
  save_networks "Home Net" "Office"
  run_fake_mac
  [ "$status" -ne 0 ]
  [[ "$output" == *"--ssid"* ]]
  [[ "$output" != *"Enter Wi-Fi password"* ]]
  [[ "$output" != *"index.html"* ]]
}

@test "mac: --ssid skips detection and still reads the Keychain" {
  fake_mac
  save_networks "Home Net" "Office"
  printf 'officepw' >"$FAKE/keychain/Office"
  run_fake_mac --ssid "Office"
  [ "$status" -eq 0 ]
  [[ "$output" == *"ssid=Office&password=officepw"* ]]
  [[ "$output" != *"hiding"* ]]
}

@test "mac: only when the Keychain has no entry is the password asked for" {
  fake_mac
  save_networks "Home Net"
  printf 'typed-pw\n' >"$FAKE/tty"
  run_fake_mac
  [ "$status" -eq 0 ]
  [[ "$output" == *"Enter Wi-Fi password for 'Home Net'"* ]]
  [[ "$output" == *"ssid=Home%20Net&password=typed-pw"* ]]
}
