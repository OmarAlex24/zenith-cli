class ZenithCli < Formula
  desc "Local-first project memory and agent coordination CLI"
  homepage "https://github.com/OmarAlex24/zenith-cli"
  version "0.1.0"

  depends_on :macos

  url "https://github.com/OmarAlex24/zenith-cli/releases/download/v#{version}/zenith-darwin-arm64.tar.gz"
  sha256 "c14670a7c1a2ed93fa421465d1f8aa8b4fb88ef577f7ddc5d8edb5e45d96d571"

  def install
    libexec.install "zenith.js"
    libexec.install Dir["*.wasm", "*.scm"]
    libexec.install "node_modules"
    (bin/"zenith").write <<~SH
      #!/bin/sh
      if ! command -v bun >/dev/null 2>&1; then
        echo "Zenith requires Bun on PATH. Install with: brew install oven-sh/bun/bun" >&2
        exit 127
      fi
      exec bun "#{libexec}/zenith.js" "$@"
    SH
  end

  test do
    assert_match "Usage", shell_output("#{bin}/zenith --help")
  end
end
