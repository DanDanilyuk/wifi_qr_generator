#!/bin/bash
# Universal Wi-Fi QR Generator v2.1
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

# URL-encode function using Perl
# Changed to printf to avoid "-n" appearing in the output on some shells
url_encode() {
    printf "%s" "$1" | perl -MURI::Escape -pe '$_ = uri_escape($_)'
}

# Generates the QR code URL
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
    # --- macOS Logic ---

    # 1. Identify Wi-Fi Interface (usually en0)
    WIFI_INTERFACE=$(networksetup -listallhardwareports | awk '/Wi-Fi|AirPort/{getline; print $NF}')
    if [ -z "$WIFI_INTERFACE" ]; then
        WIFI_INTERFACE="en0"
    fi

    # 2. Get SSID (Using Verbose Hack for macOS Sequoia/Sonoma)
    # We toggle verbose mode on/off to bypass redaction. Requires sudo.
    if sudo -n true 2>/dev/null; then
        : # Sudo already active
    else
        echo "Administrator privileges required to read SSID on this version of macOS..."
    fi
    
    # Enable verbose mode temporarily to reveal the SSID
    sudo ipconfig setverbose 1
    
    # Capture SSID
    SSID=$(ipconfig getsummary "$WIFI_INTERFACE" | awk -F': ' '/ SSID/ {print $2}' | xargs)
    # Capture Security Type
    SECURITY_RAW=$(ipconfig getsummary "$WIFI_INTERFACE" | awk -F': ' '/ auth type / {print $2}' | xargs)
    
    # Disable verbose mode
    sudo ipconfig setverbose 0

    # Fallback to wdutil if ipconfig returned empty
    if [ -z "$SSID" ]; then
         SSID=$(wdutil info | awk -F': ' '/^ *SSID/ {print $2}' | xargs)
    fi
    
    # 3. Normalize Security Type
    case "$(echo "$SECURITY_RAW" | tr '[:upper:]' '[:lower:]')" in
        *wpa3*) SECURITY="WPA3" ;;
        *wpa2*|*personal*|*enterprise*|*802.1x*) SECURITY="WPA2" ;;
        *wep*) SECURITY="WEP" ;;
        *none*|*open*) SECURITY="nopass" ;;
        *) SECURITY="WPA" ;;
    esac

    # 4. Hidden Network Detection
    HIDDEN_STATUS=$(wdutil info | awk -F': ' '/^ *Hidden network/ {print $2}')
    if [[ "$HIDDEN_STATUS" == "Yes" ]]; then
        HIDDEN="true"
    else
        HIDDEN="false"
    fi

    # 5. Retrieve Password
    # Try to find password in Keychain
    PASSWORD=$(security find-generic-password -wa "$SSID" 2>/dev/null)

    # Fallback: Prompt user if password missing (and not an open network)
    if [ -z "$PASSWORD" ] && [ "$SECURITY" != "nopass" ]; then
        echo "Could not retrieve password from System Keychain (likely stored in iCloud/Local Items)."
        printf "Please enter Wi-Fi password for '%s': " "$SSID"
        read -s PASSWORD < /dev/tty
        echo "" # Newline
    fi

    if [ -z "$PASSWORD" ] && [ "$SECURITY" != "nopass" ]; then
         echo "Error: No password provided."
         exit 1
    fi

    # Build and open
    qr_url=$(generate_qr_url "$SECURITY" "$SSID" "$PASSWORD" "$HIDDEN")
    open "$qr_url"

elif [ "$OS" == "Windows" ]; then
    # --- Windows Logic ---
    powershell.exe -Command "& {
        Add-Type -AssemblyName System.Web

        # Get active SSID
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

        # Attempt to retrieve key content
        \$keyLine = netsh wlan show profile name=\"\$profile\" key=clear | Select-String 'Key Content'
        if (\$keyLine) {
            \$password = (\$keyLine -split ':')[1].Trim()
        } else {
            \$password = ''
        }

        # Build URL
        \$encodedSSID = [System.Web.HttpUtility]::UrlEncode(\$ssid)
        \$encodedPassword = [System.Web.HttpUtility]::UrlEncode(\$password)
        \$qr_url = \"https://dandanilyuk.github.io/wifi_qr_generator/index.html?security=\$security&ssid=\$encodedSSID&password=\$encodedPassword&hidden=false\"
        Start-Process \$qr_url
    }"

elif [ "$OS" == "Linux" ]; then
    # --- Linux Logic ---
    if command -v nmcli &> /dev/null; then
        SSID=$(nmcli -t -f active,ssid dev wifi | awk -F: '/^yes/ {print $2}')
        SECURITY_RAW=$(nmcli -t -f active,security dev wifi | awk -F: '/^yes/ {print $2}')
        PASSWORD=$(nmcli -s -g 802-11-wireless-security.psk connection show "$SSID")
        
        if [[ "$SECURITY_RAW" == *"WPA3"* ]]; then SECURITY="WPA3";
        elif [[ "$SECURITY_RAW" == *"WPA2"* ]]; then SECURITY="WPA2";
        elif [[ "$SECURITY_RAW" == *"WEP"* ]]; then SECURITY="WEP";
        else SECURITY="WPA"; fi
    else
        SSID=$(iw dev | awk '/ssid/ {print $2}')
        SECURITY="WPA2"
    fi

    if [ -z "$SSID" ]; then
        zenity --error --text="No active Wi-Fi connection detected"
        exit 1
    fi
    
    if [ -z "$PASSWORD" ]; then
         printf "Enter password for %s: " "$SSID"
         read -s PASSWORD
    fi

    qr_url=$(generate_qr_url "$SECURITY" "$SSID" "$PASSWORD" "false")
    xdg-open "$qr_url"

else
    echo "Unsupported operating system: $OS"
    exit 1
fi
