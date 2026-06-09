# Zenith Release Packaging

Zenith release packaging targets curl and Homebrew distribution of the packaged CLI and OpenTUI launcher. npm publication is intentionally out of scope.

## Local Release Without GitHub Actions

If you want to avoid GitHub Actions minutes, use the local release script instead.

Current scope: **macOS Apple Silicon only** (`zenith-darwin-arm64.tar.gz`).

On your Mac:

```bash
bun install --frozen-lockfile
scripts/release-local.sh v0.1.0
```

That command runs local verification, packages the Apple Silicon archive, and renders `dist/zenith.rb`.

Publish the release and update the Homebrew tap:

```bash
scripts/release-local.sh v0.1.0 --skip-tests --publish --update-tap
```

Requirements:

- Apple Silicon Mac
- `gh` authenticated with `gh auth login` for `--publish`
- `HOMEBREW_TAP_GITHUB_TOKEN` or `gh auth login` for `--update-tap`
- `dist/zenith-darwin-arm64.tar.gz`

To update the tap from an existing local checkout instead of cloning remotely:

```bash
git clone https://github.com/OmarAlex24/homebrew-zenith.git ../homebrew-zenith
scripts/release-local.sh v0.1.0 --skip-tests --update-tap --tap-dir ../homebrew-zenith
```

Users install with:

```bash
brew tap OmarAlex24/zenith
brew install omaralex24/zenith/zenith-cli
```

Intel Mac and Linux builds can be added later without changing the local release flow much.

## GitHub Actions Release

The `.github/workflows/release.yml` workflow builds all four platform archives, publishes a GitHub Release, and updates the Homebrew tap when configured.

Triggers:

- Push a version tag such as `v0.1.0`
- Manual run from Actions with a `tag` input such as `v0.1.0`

Typical release flow:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow:

1. Runs typecheck, tests, and build
2. Packages one artifact per runner:
   - `zenith-darwin-arm64.tar.gz` on `macos-latest`
   - `zenith-darwin-x64.tar.gz` on `macos-15-intel`
   - `zenith-linux-x64.tar.gz` on `ubuntu-latest`
   - `zenith-linux-arm64.tar.gz` on `ubuntu-24.04-arm`
3. Publishes the GitHub Release with all archives plus `checksums.txt`
4. Updates `OmarAlex24/homebrew-zenith` automatically when `HOMEBREW_TAP_GITHUB_TOKEN` is configured

## Homebrew Tap Automation

Before the first automated release, add a repository secret to `zenith-cli`:

| Secret | Value |
| --- | --- |
| `HOMEBREW_TAP_GITHUB_TOKEN` | Fine-grained or classic PAT with `repo` access to `OmarAlex24/homebrew-zenith` |

The token must be able to:

- create the tap repo if it does not exist yet
- push commits to `main` in `OmarAlex24/homebrew-zenith`

The release workflow renders `packaging/homebrew/zenith.rb` with the release version and SHA256 values, then commits it to `Formula/zenith.rb` in the tap repo.

Users install with:

```bash
brew tap OmarAlex24/zenith
brew install omaralex24/zenith/zenith-cli
```

If the secret is not configured, the release still publishes artifacts and the Homebrew job is skipped.

## Preconditions

- The repository is public or release artifacts are otherwise reachable.
- Bun is available on target machines; the packaged CLI launcher executes the bundled JS with Bun.
- `HOMEBREW_TAP_GITHUB_TOKEN` is configured for automated tap updates.

## Build And Verify

```bash
bun run typecheck
bun test
bun run build
bun run compile
./dist/zenith --help
./dist/zenith project detect --json
```

`dist/zenith` launches the bundled `dist/zenith.js`. It opens the OpenTUI with `./dist/zenith` or `./dist/zenith tui`, and it still supports CLI smoke tests such as `./dist/zenith project detect --json`.

## Create Artifacts Locally

```bash
ZENITH_VERSION=v0.1.0 bun run package:release
```

The packaging script creates:

- `dist/zenith-<os>-<arch>.tar.gz`
- `dist/zenith-<os>-<arch>.tar.gz.sha256`

Each archive contains:

- `zenith`
- `zenith.js`
- emitted OpenTUI `.wasm` and `.scm` assets
- matching native `node_modules/@opentui/core-<platform>-<arch>` package
- `README.md`
- `LICENSE`

Cross-platform releases should build each supported target and publish the same archive naming convention:

- `zenith-darwin-arm64.tar.gz`
- `zenith-darwin-x64.tar.gz`
- `zenith-linux-arm64.tar.gz`
- `zenith-linux-x64.tar.gz`

## Curl Installer

The installer requires Bun on the target machine and expects artifacts under:

```text
${ZENITH_INSTALL_BASE_URL}/${ZENITH_VERSION}/zenith-<os>-<arch>.tar.gz
```

Example using GitHub Releases:

```bash
ZENITH_INSTALL_BASE_URL=https://github.com/OmarAlex24/zenith-cli/releases/download \
ZENITH_VERSION=v0.1.0 \
sh scripts/install.sh
```

## Homebrew Formula Template

`packaging/homebrew/zenith.rb` is the source template for the current macOS Apple Silicon build. The local release script replaces `DARWIN_ARM64_SHA256` before pushing to the tap repo.

The formula depends on Homebrew's `bun` formula and currently targets Apple Silicon Macs only.
