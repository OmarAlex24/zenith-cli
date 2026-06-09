#!/usr/bin/env bash
set -euo pipefail

template="${1:?template path required}"
output="${2:?output path required}"
version="${3:?version required}"
darwin_arm64_sha="${4:?darwin arm64 sha required}"

formula_version="${version#v}"

sed \
  -e "s/^  version \".*\"/  version \"${formula_version}\"/" \
  -e "s/DARWIN_ARM64_SHA256/${darwin_arm64_sha}/" \
  "$template" > "$output"
