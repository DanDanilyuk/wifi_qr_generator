# Bash completion for wifi_gen.sh
#
# Install:
#   source completions/wifi_gen.bash
# or copy/link into a directory bash-completion picks up:
#   sudo install -m 0644 completions/wifi_gen.bash \
#       /usr/share/bash-completion/completions/wifi_gen.sh
#
# We deliberately use the splatting form `COMPREPLY=( $(compgen ...) )` rather
# than `mapfile` so this file works on macOS's stock bash 3.2 (no mapfile).
# shellcheck disable=SC2207

_wifi_gen_completions() {
  local cur prev opts security_values hidden_values
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"

  opts="--ssid --password --pass --security --hidden --print --qr --copy --list-networks --version --help -h"
  security_values="WPA WPA2 WPA3 WEP nopass"
  hidden_values="true false"

  case "$prev" in
    --security)
      COMPREPLY=( $(compgen -W "$security_values" -- "$cur") )
      return 0
      ;;
    --hidden)
      COMPREPLY=( $(compgen -W "$hidden_values" -- "$cur") )
      return 0
      ;;
    --ssid|--password|--pass)
      # No useful default completion for free-form values.
      COMPREPLY=()
      return 0
      ;;
  esac

  if [[ "$cur" == -* ]]; then
    COMPREPLY=( $(compgen -W "$opts" -- "$cur") )
    return 0
  fi

  COMPREPLY=()
}

complete -F _wifi_gen_completions wifi_gen.sh
complete -F _wifi_gen_completions ./wifi_gen.sh
