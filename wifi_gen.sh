#!/bin/bash
# Universal Wi-Fi QR Generator v2.0
# Supports macOS 10.8+, Windows 10+, and Linux (NetworkManager)

# Detect OS type
OS="unknown"
if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="Linux"
elif [[ "$OSTYPE" == "darwin"* ]]; then
    OS="Mac"
elif [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "msys" ]]; then
    OS="Windows"
fi

# URL-encode function using Perl. Note the careful escaping of the single quote.
url_encode() {
    echo -n "$1" | perl -MURI::Escape -pe '$_ = uri_escape($_)'
}

# Generates the QR code URL (used in Mac and Linux branches)
generate_qr_url() {
    local SECURITY=$1
    local SSID=$2
    local PASSWORD=$3
    local HIDDEN=$4

    URL_SSID=$(url_encode "$SSID")
    URL_PASSWORD=$(url_encode "$PASSWORD")
    echo "https://dandanilyuk.github.io/wifi_qr_generator/index.html?security=$SECURITY&ssid=$URL_SSID&password=$URL_PASSWORD&hidden=$HIDDEN"
}

if [ "$OS" == "Mac" ]; then
    # Detect macOS version
    OS_VERSION=$(sw_vers -productVersion)
    # Compare versions: if OS_VERSION >= 14.4 use the newer method (Sonoma+)
    if [ "$(printf '%s\n' "14.4" "$OS_VERSION" | sort -V | head -n1)" = "14.4" ]; then
        # Sonoma 14.4+ method
        WIFI_INTERFACE=$(networksetup -listallhardwareports | awk '/Wi-Fi|AirPort/{getline; print $NF}')
        SSID=$(ipconfig getsummary "$WIFI_INTERFACE" | awk -F' SSID : ' '/ SSID : / {print $2}')
        SECURITY=$(ipconfig getsummary "$WIFI_INTERFACE" | awk -F': ' '/ auth type / {print $2}')
    else
        # Pre-Sonoma method (macOS <14.4)
        SSID=$(/System/Library/PrivateFrameworks/Apple80211.framework/Resources/airport -I | awk -F': ' '/ SSID/{print $2}')
        SECURITY=$(/System/Library/PrivateFrameworks/Apple80211.framework/Resources/airport -I | awk -F': ' '/ security/{print $2}')
    fi

    # Fallback using wdutil if needed
    [ -z "$SSID" ] && SSID=$(wdutil info | awk -F': ' '/^ *SSID/ {print $2}')
    [ -z "$SECURITY" ] && SECURITY=$(wdutil info | awk -F': ' '/^ *Security/ {print $2}')

    # Normalize the security type
    case "$(echo "$SECURITY" | tr '[:upper:]' '[:lower:]')" in
        *wpa3*) SECURITY="WPA3" ;;
        *wpa2*|*personal*|*enterprise*) SECURITY="WPA2" ;;
        *wep*) SECURITY="WEP" ;;
        *none*|*open*) SECURITY="nopass" ;;
        *) SECURITY="WPA" ;;
    esac

    # Hidden network detection via wdutil (adjust as needed)
    HIDDEN=$(wdutil info | awk -F': ' '/^ *Hidden network/ {print $2}')
    if [ "$HIDDEN" = "Yes" ]; then
        HIDDEN="true"
    else
        HIDDEN="false"
    fi

    # Retrieve the stored password from Keychain if needed.
    PASSWORD=$(security find-generic-password -D "AirPort network password" -wa "$SSID" 2>/dev/null)
    if [ -z "$PASSWORD" ] && [ "$SECURITY" != "nopass" ]; then
        osascript -e 'display alert "Password Error" message "Could not retrieve password from Keychain"'
        exit 1
    fi

    # Build and open the QR code URL
    qr_url=$(generate_qr_url "$SECURITY" "$SSID" "$PASSWORD" "$HIDDEN")
    open "$qr_url"

elif [ "$OS" == "Windows" ]; then
    # Windows branch entirely within PowerShell.
    powershell.exe -Command "& {
        Add-Type -AssemblyName System.Web

        # Get active SSID from wlan interfaces
        \$ssidLine = netsh wlan show interfaces | Select-String '^\s*SSID\s*:'
        if (-not \$ssidLine) {
            [System.Windows.Forms.MessageBox]::Show('No active Wi-Fi connection detected', 'Wi-Fi Error')
            exit 1
        }
        \$ssid = (\$ssidLine -split ':')[1].Trim()

        # Get profile and security info
        \$profileLine = netsh wlan show profiles | Select-String \$ssid
        if (-not \$profileLine) {
            [System.Windows.Forms.MessageBox]::Show('No Wi-Fi profile found for SSID: ' + \$ssid, 'Wi-Fi Error')
            exit 1
        }
        \$profile = (\$profileLine -split ':')[1].Trim()
        \$securityLine = netsh wlan show profile name=\"\$profile\" | Select-String 'Authentication'
        \$security = (\$securityLine -split ':')[1].Trim()
        switch -Regex (\$security) {
            'WPA3' { \$security = 'WPA3' }
            'WPA2' { \$security = 'WPA2' }
            'Open' { \$security = 'nopass' }
            default { \$security = 'WPA' }
        }

        # Attempt to retrieve key content (password)
        \$keyLine = netsh wlan show profile name=\"\$profile\" key=clear | Select-String 'Key Content'
        if (\$keyLine) {
            \$password = (\$keyLine -split ':')[1].Trim()
        } else {
            \$password = ''
        }

        # Build URL – using .NET’s URL encoding function.
        \$encodedSSID = [System.Web.HttpUtility]::UrlEncode(\$ssid)
        \$encodedPassword = [System.Web.HttpUtility]::UrlEncode(\$password)
        \$qr_url = \"https://dandanilyuk.github.io/wifi_qr_generator/index.html?security=\$security&ssid=\$encodedSSID&password=\$encodedPassword&hidden=false\"
        Start-Process \$qr_url
    }"

elif [ "$OS" == "Linux" ]; then
    # Linux branch using NetworkManager (nmcli) when available
    if command -v nmcli &> /dev/null; then
        SSID=$(nmcli -t -f active,ssid dev wifi | awk -F: '/^yes/ {print $2}')
        SECURITY=$(nmcli -t -f active,security dev wifi | awk -F: '/^yes/ {print $2}')
        PASSWORD=$(nmcli -s -g 802-11-wireless-security.psk connection show "$SSID")
    else
        SSID=$(iw dev | awk '/ssid/ {print $2}')
        SECURITY="WPA2"  # Default assumption for Linux if nmcli is unavailable.
    fi

    if [ -z "$SSID" ]; then
        zenity --error --text="No active Wi-Fi connection detected"
        exit 1
    fi

    qr_url=$(generate_qr_url "$SECURITY" "$SSID" "$PASSWORD" "false")
    xdg-open "$qr_url"

else
    echo "Unsupported operating system: $OS"
    exit 1
fi
