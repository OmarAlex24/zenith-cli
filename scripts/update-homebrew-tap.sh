#!/usr/bin/env bash
set -euo pipefail

repo_root="$(CDPATH= cd -P "$(dirname "$0")/.." && pwd)"
tap_repo="${HOMEBREW_TAP_REPO:-OmarAlex24/homebrew-zenith}"
release_tag="${RELEASE_TAG:?RELEASE_TAG is required}"
metadata_file="${1:?metadata file required}"

# shellcheck disable=SC1090
source "$metadata_file"

: "${DARWIN_ARM64_SHA256:?}"

tmp_dir="$(mktemp -d)"
tap_dir="$tmp_dir/tap"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT

rendered_formula="$tmp_dir/zenith.rb"
"$repo_root/scripts/render-homebrew-formula.sh" \
  "$repo_root/packaging/homebrew/zenith.rb" \
  "$rendered_formula" \
  "$release_tag" \
  "$DARWIN_ARM64_SHA256"

if [ -n "${HOMEBREW_TAP_GITHUB_TOKEN:-}" ]; then
  export GH_TOKEN="$HOMEBREW_TAP_GITHUB_TOKEN"
  remote_url="https://x-access-token:${HOMEBREW_TAP_GITHUB_TOKEN}@github.com/${tap_repo}.git"
elif gh auth status >/dev/null 2>&1; then
  remote_url="https://github.com/${tap_repo}.git"
else
  echo "Set HOMEBREW_TAP_GITHUB_TOKEN or run gh auth login before updating the tap." >&2
  exit 1
fi

if ! gh repo view "$tap_repo" >/dev/null 2>&1; then
  gh repo create "$tap_repo" --public --description "Homebrew tap for Zenith CLI"
fi

if git clone "$remote_url" "$tap_dir" 2>/dev/null; then
  :
else
  mkdir -p "$tap_dir"
  git -C "$tap_dir" init -b main
  git -C "$tap_dir" remote add origin "$remote_url"
fi

mkdir -p "$tap_dir/Formula"
install -m 0644 "$rendered_formula" "$tap_dir/Formula/zenith.rb"

if git -C "$tap_dir" status --porcelain | grep -q .; then
  git -C "$tap_dir" config user.name "${GIT_AUTHOR_NAME:-github-actions[bot]}"
  git -C "$tap_dir" config user.email "${GIT_AUTHOR_EMAIL:-41898282+github-actions[bot]@users.noreply.github.com}"
  git -C "$tap_dir" add Formula/zenith.rb
  git -C "$tap_dir" commit -m "Update zenith formula to ${release_tag}"
  git -C "$tap_dir" push -u origin main
  echo "Updated ${tap_repo} for ${release_tag}"
else
  echo "No formula changes needed for ${release_tag}"
fi
