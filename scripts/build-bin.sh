#!/usr/bin/env bash
set -euo pipefail

dist_dir="${ZENITH_DIST_DIR:-dist}"
os="$(uname -s | tr '[:upper:]' '[:lower:]')"
arch="$(uname -m)"

case "$arch" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64) arch="x64" ;;
esac

native_package="@opentui/core-${os}-${arch}"
native_package_dir="node_modules/$native_package"

if [ ! -d "$native_package_dir" ]; then
  echo "Missing native OpenTUI package: $native_package_dir. Run bun install first." >&2
  exit 1
fi

mkdir -p "$dist_dir"
rm -rf "$dist_dir/node_modules"
rm -f "$dist_dir/zenith.js" "$dist_dir"/tree-sitter-*.wasm "$dist_dir"/highlights-*.scm "$dist_dir"/injections-*.scm
bun build ./src/index.ts --target=bun --outdir "$dist_dir" --entry-naming zenith.js
mkdir -p "$dist_dir/node_modules/@opentui"
cp -R "$native_package_dir" "$dist_dir/node_modules/@opentui/"

cat > "$dist_dir/zenith" <<'EOF'
#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -P "$(dirname "$0")" && pwd)"

if ! command -v bun >/dev/null 2>&1; then
  echo "Zenith packaged CLI requires Bun. Install Bun first: https://bun.sh" >&2
  exit 127
fi

exec bun "$script_dir/zenith.js" "$@"
EOF

chmod 0755 "$dist_dir/zenith"
