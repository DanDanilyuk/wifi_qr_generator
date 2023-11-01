#!/bin/bash

# Get the current SSID
SSID=$(networksetup -getairportnetwork en0 | awk -F': ' '{print $2}')

# Retrieve the password
PASSWORD=$(security find-generic-password -D "AirPort network password" -wa "$SSID")

# Retrieve the security type and if the network is hidden
AIRPORT_INFO=$(/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport -I)
SECURITY=$(echo "$AIRPORT_INFO" | awk -F': ' '/^ *Security/ {print $2}')
HIDDEN=$(echo "$AIRPORT_INFO" | awk -F': ' '/^ *Hidden network/ {print $2}')

# Adjust the security type for the QR code
case "$SECURITY" in
  "WPA2 Personal") SECURITY="WPA";;
  "WEP") SECURITY="WEP";;
  "None") SECURITY="nopass";;
  *) SECURITY="WPA";;
esac

# Adjust the hidden network value for the QR code
case "$HIDDEN" in
  "Yes") HIDDEN="true";;
  "No") HIDDEN="false";;
  *) HIDDEN="false";;
esac

# Open Website
URL="https://dandanilyuk.github.io/wifi_qr_generator/index.html?security=$SECURITY&ssid=$SSID&password=$PASSWORD&hidden=$HIDDEN"
open $URL
