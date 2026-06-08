class Zenith < Formula
  desc "Local-first project memory and agent coordination CLI"
  homepage "https://github.com/OWNER/REPO"
  version "0.1.0"

  depends_on "bun"

  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/OWNER/REPO/releases/download/v#{version}/zenith-darwin-arm64.tar.gz"
      sha256 "DARWIN_ARM64_SHA256"
    else
      url "https://github.com/OWNER/REPO/releases/download/v#{version}/zenith-darwin-x64.tar.gz"
      sha256 "DARWIN_X64_SHA256"
    end
  end

  on_linux do
    if Hardware::CPU.arm?
      url "https://github.com/OWNER/REPO/releases/download/v#{version}/zenith-linux-arm64.tar.gz"
      sha256 "LINUX_ARM64_SHA256"
    else
      url "https://github.com/OWNER/REPO/releases/download/v#{version}/zenith-linux-x64.tar.gz"
      sha256 "LINUX_X64_SHA256"
    end
  end

  def install
    libexec.install "zenith.js"
    libexec.install Dir["*.wasm", "*.scm"]
    libexec.install "node_modules"
    (bin/"zenith").write <<~SH
      #!/bin/sh
      exec "#{Formula["bun"].opt_bin}/bun" "#{libexec}/zenith.js" "$@"
    SH
  end

  test do
    assert_match "Usage", shell_output("#{bin}/zenith --help")
  end
end
