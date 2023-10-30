#!/bin/bash

# Get the current SSID
SSID=$(networksetup -getairportnetwork en0 | awk -F': ' '{print $2}')

# Retrieve the password
PASSWORD=$(security find-generic-password -D "AirPort network password" -wa "$SSID")

# Retrieve the security type
SECURITY=$(/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I | awk -F': ' '/^ *Security/ {print $2}')

# Adjust the security type for the QR code
case "$SECURITY" in
  "WPA2 Personal") SECURITY="WPA";;
  "WEP") SECURITY="WEP";;
  "None") SECURITY="nopass";;
  *) SECURITY="WPA";;
esac

# Open Webiste
URL="https://dandanilyuk.github.io/wifi_qr_generator/index.html?security=$SECURITY&ssid=$SSID&password=$PASSWORD"
open $URL
