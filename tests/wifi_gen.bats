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
  [ "$output" = 'https://dandanilyuk.github.io/wifi_qr_generator/index.html?security=WPA&ssid=Cafe%20%26%20Co&password=Pa%24%24w%26rd&hidden=true' ]
}

@test "generate_qr_url: command-substitution-looking password is encoded" {
  run generate_qr_url "WPA" "TestNet" '$()`echo PWNED`' "false"
  [ "$status" -eq 0 ]
  [[ "$output" == *"password=%24%28%29%60echo%20PWNED%60"* ]]
  # Make sure no raw shell metachars leak into the URL.
  [[ "$output" != *'$('* ]]
  [[ "$output" != *'`'* ]]
}
