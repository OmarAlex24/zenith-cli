#!/usr/bin/env sh
set -eu

version="${ZENITH_VERSION:-latest}"
install_dir="${ZENITH_INSTALL_DIR:-$HOME/.local/bin}"
base_url="${ZENITH_INSTALL_BASE_URL:-}"

if [ -z "$base_url" ]; then
  echo "Set ZENITH_INSTALL_BASE_URL to the release artifact base URL." >&2
  echo "Example: ZENITH_INSTALL_BASE_URL=https://example.com/zenith/releases ZENITH_VERSION=v0.1.0 sh scripts/install.sh" >&2
  exit 1
fi

os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"

case "$os" in
  darwin|linux) ;;
  *)
    echo "Unsupported OS: $os" >&2
    exit 1
    ;;
esac

case "$arch" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64) arch="x64" ;;
  *)
    echo "Unsupported architecture: $arch" >&2
    exit 1
    ;;
esac

artifact="zenith-${os}-${arch}.tar.gz"
url="${base_url%/}/${version}/${artifact}"
tmp_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

mkdir -p "$install_dir"
curl -fsSL "$url" -o "$tmp_dir/$artifact"
tar -xzf "$tmp_dir/$artifact" -C "$tmp_dir"
install -m 0755 "$tmp_dir/zenith" "$install_dir/zenith"

echo "Installed zenith to $install_dir/zenith"
