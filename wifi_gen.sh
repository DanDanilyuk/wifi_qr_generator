#!/bin/bash

OS="unknown"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="Linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="Mac"
elif [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "msys" ]]; then
    OS="Windows"
fi

if [ "$OS" == "Mac" ]; then
    SSID=$(networksetup -getairportnetwork en0 | awk -F': ' '{print $2}')
    URL_SSID=$(echo "$SSID" | sed 's/ /%20/g')

    # Retrieve the security type and if the network is hidden
    AIRPORT_INFO=$(wdutil info)
    SECURITY=$(echo "$AIRPORT_INFO" | awk -F': ' '/^ *Security/ {print $2}')
    HIDDEN=$(echo "$AIRPORT_INFO" | awk -F': ' '/^ *Hidden network/ {print $2}')

    # Adjust the security type for the QR code
    case "$SECURITY" in
      "WPA2 Personal") SECURITY="WPA2";;
      "WPA2 Enterprise") SECURITY="WPA2";;
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

    # Retrieve the password and encode it for the URL
    PASSWORD=$(security find-generic-password -D "AirPort network password" -wa "$SSID" 2>/dev/null || echo "")
    URL_PASSWORD=$(echo "$PASSWORD" | sed 's/ /%20/g')

    # Open Website
    URL="https://dandanilyuk.github.io/wifi_qr_generator/index.html?security=$SECURITY&ssid=$URL_SSID&password=$URL_PASSWORD&hidden=$HIDDEN"
    open $URL
elif [ "$OS" == "Windows" ]; then
    # Windows specific commands go here
    powershell.exe -Command "& {
        # Get the current SSID
        \$SSID = (netsh wlan show interfaces | Select-String 'SSID').Line.Split(': ')[1]

        # Retrieve the password
        \$PROFILE = (netsh wlan show profiles | Select-String \"\$SSID\").Line.Split(' ')[3]
        \$PASSWORD = (netsh wlan show profile name=\"\$PROFILE\" key=clear | Select-String 'Key Content').Line.Split(': ')[1]

        # Retrieve the security type
        \$SECURITY = (netsh wlan show profile name=\"\$PROFILE\" | Select-String 'Authentication').Line.Split(': ')[1]
        if (\$SECURITY -eq 'WPA2-Personal') {
            \$SECURITY = 'WPA'
        } elseif (\$SECURITY -eq 'Open') {
            \$SECURITY = 'nopass'
        } else {
            \$SECURITY = 'WPA'
        }

        # The Hidden network feature is not directly available in Windows
        \$HIDDEN = 'false'

        # Open Website
        \$URL = \"https://dandanilyuk.github.io/wifi_qr_generator/index.html?security=\$SECURITY&ssid=\$SSID&password=\$PASSWORD&hidden=\$HIDDEN\"
        Start-Process \$URL
    }"
else
    echo "Unsupported operating system: $OS"
fi
