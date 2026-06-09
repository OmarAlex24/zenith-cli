#!/usr/bin/env bash
set -euo pipefail

repo_root="$(CDPATH= cd -P "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

usage() {
  cat <<USAGE
Usage: scripts/release-local.sh <tag> [options]

Mac-only release path for Apple Silicon (darwin-arm64).

Examples:
  scripts/release-local.sh v0.1.0
  scripts/release-local.sh v0.1.0 --skip-tests
  scripts/release-local.sh v0.1.0 --publish --update-tap

Options:
  --skip-tests     Skip typecheck/tests/build verification
  --publish        Create or update the GitHub Release with dist/zenith-darwin-arm64.tar.gz
  --update-tap     Push Formula/zenith.rb to the Homebrew tap repo
  --tap-dir <dir>  Use an existing local tap checkout instead of cloning in update-homebrew-tap.sh

Environment:
  ZENITH_VERSION             Release tag; defaults to the <tag> argument
  HOMEBREW_TAP_REPO          Default: OmarAlex24/homebrew-zenith
  HOMEBREW_TAP_GITHUB_TOKEN  Optional if gh auth login is already configured
USAGE
}

release_tag=""
skip_tests=0
publish=0
update_tap=0
tap_dir=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --skip-tests)
      skip_tests=1
      ;;
    --publish)
      publish=1
      ;;
    --update-tap)
      update_tap=1
      ;;
    --tap-dir)
      shift
      tap_dir="${1:?--tap-dir requires a path}"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    v*)
      release_tag="$1"
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [ -z "$release_tag" ]; then
  usage >&2
  exit 1
fi

export ZENITH_VERSION="$release_tag"
export RELEASE_TAG="$release_tag"

required_artifact="zenith-darwin-arm64.tar.gz"

if [ "$skip_tests" -eq 0 ]; then
  echo "Running local verification..."
  bun run typecheck
  bun test
  bun run build
fi

echo "Packaging macOS Apple Silicon artifact..."
bun run package:release

mkdir -p dist
echo
echo "Artifact in dist/:"
if [ -f "dist/$required_artifact" ]; then
  shasum -a 256 "dist/$required_artifact" | tee dist/checksums.txt
else
  echo "missing: dist/$required_artifact" >&2
  exit 1
fi

darwin_arm64="$(shasum -a 256 "dist/$required_artifact" | awk '{print $1}')"

cat > dist/formula.env <<HEREDOC
DARWIN_ARM64_SHA256=${darwin_arm64}
HEREDOC

scripts/render-homebrew-formula.sh \
  packaging/homebrew/zenith.rb \
  dist/zenith.rb \
  "$release_tag" \
  "$darwin_arm64"

echo
echo "Rendered local formula at dist/zenith.rb"

if [ "$publish" -eq 1 ]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "gh CLI is required for --publish" >&2
    exit 1
  fi

  notes_file="$(mktemp)"
  cleanup_notes() {
    rm -f "$notes_file"
  }
  trap cleanup_notes EXIT

  {
    echo "## Artifacts"
    echo
    echo "- ${required_artifact}"
    echo
    echo "macOS Apple Silicon only for now."
    echo
    echo "## Checksums"
    echo
    cat dist/checksums.txt
  } > "$notes_file"

  if gh release view "$release_tag" >/dev/null 2>&1; then
    echo "Uploading assets to existing release ${release_tag}..."
    gh release upload "$release_tag" "dist/$required_artifact" --clobber
  else
    echo "Creating GitHub release ${release_tag}..."
    gh release create "$release_tag" "dist/$required_artifact" --notes-file "$notes_file"
  fi
fi

if [ "$update_tap" -eq 1 ]; then
  if [ -n "$tap_dir" ]; then
    mkdir -p "$tap_dir/Formula"
    install -m 0644 dist/zenith.rb "$tap_dir/Formula/zenith.rb"
    if git -C "$tap_dir" status --porcelain | grep -q .; then
      git -C "$tap_dir" add Formula/zenith.rb
      git -C "$tap_dir" commit -m "Update zenith formula to ${release_tag}"
      git -C "$tap_dir" push origin main
      echo "Updated local tap checkout at ${tap_dir}"
    else
      echo "No tap changes needed at ${tap_dir}"
    fi
  else
    scripts/update-homebrew-tap.sh dist/formula.env
  fi
fi
