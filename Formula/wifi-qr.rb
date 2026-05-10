class WifiQr < Formula
  desc "Generate a Wi-Fi connection QR code from your current network"
  homepage "https://dandanilyuk.github.io/wifi_qr_generator/"
  url "https://github.com/danDanilyuk/wifi_qr_generator/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "REPLACE_WITH_REAL_SHA_AFTER_RELEASE"
  license "MIT"
  version "0.1.0"

  # qrencode is required for the --qr (terminal QR) flag. The script falls
  # back gracefully when it is missing, so the dependency is recommended
  # rather than required.
  depends_on "qrencode" => :recommended

  def install
    # Install the shell helper as `wifi-qr` so it does not collide with any
    # other `wifi_gen.sh` on PATH and gets a Homebrew-friendly name.
    bin.install "wifi_gen.sh" => "wifi-qr"

    # Man page lives at man/wifi_gen.1 in the source tree; rename to match
    # the installed binary name.
    man1.install "man/wifi_gen.1" => "wifi-qr.1"

    # Shell completions. These paths assume the upstream repo ships
    # completions under completions/. Adjust if the layout changes.
    bash_completion.install "completions/wifi_gen.bash" => "wifi-qr"
    zsh_completion.install "completions/_wifi_gen" => "_wifi-qr"
  end

  test do
    # --version is a non-interactive flag added in 0.1.0. Its output is
    # expected to mention the script name so we can sanity-check the install.
    assert_match "wifi", shell_output("#{bin}/wifi-qr --version")

    # --help should also succeed without touching the network.
    assert_match "Usage", shell_output("#{bin}/wifi-qr --help")
  end
end
