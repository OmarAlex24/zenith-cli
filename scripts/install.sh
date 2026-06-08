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

if ! command -v bun >/dev/null 2>&1; then
  echo "Zenith packaged CLI requires Bun. Install Bun first: https://bun.sh" >&2
  exit 127
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
install -m 0644 "$tmp_dir/zenith.js" "$install_dir/zenith.js"
for asset in "$tmp_dir"/*.wasm "$tmp_dir"/*.scm; do
  [ -e "$asset" ] || continue
  install -m 0644 "$asset" "$install_dir/$(basename "$asset")"
done
rm -rf "$install_dir/node_modules/@opentui"
mkdir -p "$install_dir/node_modules"
cp -R "$tmp_dir/node_modules/@opentui" "$install_dir/node_modules/"

echo "Installed zenith to $install_dir/zenith"
