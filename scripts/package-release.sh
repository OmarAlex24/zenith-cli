#!/usr/bin/env bash
set -euo pipefail

version="${ZENITH_VERSION:-$(bun -e 'console.log((await import("./package.json")).default.version)')}"
os="${ZENITH_OS:-$(uname -s | tr '[:upper:]' '[:lower:]')}"
arch="${ZENITH_ARCH:-$(uname -m)}"

case "$arch" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64) arch="x64" ;;
esac

artifact="zenith-${os}-${arch}.tar.gz"
tmp_dir="$(mktemp -d)"

cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

bun run compile
mkdir -p dist
cp dist/zenith "$tmp_dir/zenith"
cp README.md "$tmp_dir/README.md"
cp LICENSE "$tmp_dir/LICENSE"

tar -czf "dist/$artifact" -C "$tmp_dir" zenith README.md LICENSE
shasum -a 256 "dist/$artifact" > "dist/$artifact.sha256"

echo "Created dist/$artifact"
echo "Created dist/$artifact.sha256"
echo "Version: $version"
