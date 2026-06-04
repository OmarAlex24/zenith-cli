# Zenith Release Packaging

Zenith release packaging targets curl and Homebrew distribution of the headless standalone CLI. npm publication is intentionally out of scope.

## Preconditions

- A release host exists and is known.
- `OWNER/REPO` placeholders in `packaging/homebrew/zenith.rb` have been replaced.
- Release artifact SHA values are available.

## Build And Verify

```bash
bun run typecheck
bun test
bun run build
bun run compile
./dist/zenith --help
./dist/zenith project detect --json
```

`dist/zenith` is headless. Use `bun run zenith` from source for the OpenTUI.

## Create Artifacts

```bash
ZENITH_VERSION=v0.1.0 bun run package:release
```

The packaging script creates:

- `dist/zenith-<os>-<arch>.tar.gz`
- `dist/zenith-<os>-<arch>.tar.gz.sha256`

Cross-platform releases should build each supported target and publish the same archive naming convention:

- `zenith-darwin-arm64.tar.gz`
- `zenith-darwin-x64.tar.gz`
- `zenith-linux-arm64.tar.gz`
- `zenith-linux-x64.tar.gz`

## Curl Installer

The installer expects artifacts under:

```text
${ZENITH_INSTALL_BASE_URL}/${ZENITH_VERSION}/zenith-<os>-<arch>.tar.gz
```

Example:

```bash
ZENITH_INSTALL_BASE_URL=https://example.com/zenith/releases \
ZENITH_VERSION=v0.1.0 \
sh scripts/install.sh
```

## Homebrew Template

Use `packaging/homebrew/zenith.rb` as the formula starting point. Replace:

- `OWNER/REPO`
- `DARWIN_ARM64_SHA256`
- `DARWIN_X64_SHA256`
- `LINUX_ARM64_SHA256`
- `LINUX_X64_SHA256`

Then test the formula with Homebrew against the published release artifacts.
