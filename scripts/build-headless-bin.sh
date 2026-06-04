#!/usr/bin/env bash
set -euo pipefail

dist_dir="${ZENITH_DIST_DIR:-dist}"

mkdir -p "$dist_dir"
bun build ./src/cli/headless.ts --target=bun --outfile "$dist_dir/zenith-headless.js"

cat > "$dist_dir/zenith" <<'EOF'
#!/usr/bin/env sh
set -eu

script_dir="$(CDPATH= cd -P "$(dirname "$0")" && pwd)"

if ! command -v bun >/dev/null 2>&1; then
  echo "Zenith packaged CLI requires Bun. Install Bun first: https://bun.sh" >&2
  exit 127
fi

exec bun "$script_dir/zenith-headless.js" "$@"
EOF

chmod 0755 "$dist_dir/zenith"
