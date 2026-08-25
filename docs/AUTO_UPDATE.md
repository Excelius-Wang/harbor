# Auto Update Configuration

This guide explains the release and auto-update flow used by this project.

## Overview

This project uses GitHub Releases as the updater backend. During the release workflow, GitHub Actions replaces the updater placeholders in `src-tauri/tauri.conf.json` so the application points to:

```text
https://github.com/<owner>/<repo>/releases/latest/download/latest.json
```

## Prerequisites

1. Generate a signing key pair for secure updates
2. Add the signing secrets to GitHub Actions
3. Release from the `main` branch
4. Publish releases with tags in the `vX.Y.Z` format

## Step 1: Generate Signing Keys

Run the following command to generate a key pair:

```bash
pnpm tauri signer generate -w ~/.tauri/myapp.key
```

This will output:
- **Private key**: Saved to `~/.tauri/myapp.key`
- **Public key**: A string starting with `dW50cnVzdGVkIGNvbW1lbnQ6...`

Keep the private key secret.

## Step 2: Configure GitHub Secrets

Add the following secrets to your GitHub repository under Settings → Secrets and variables → Actions:

1. `TAURI_SIGNING_PRIVATE_KEY` - Content of `~/.tauri/myapp.key`
2. `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` - Password you set, if any
3. `TAURI_SIGNING_PUBLIC_KEY` - Public key generated in Step 1

## Step 3: Keep Version Files in Sync

The release script expects these files to share the same version:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

Use the release script as the single release entrypoint instead of editing only one file manually.

## Step 4: Create a Release

Run:

```bash
pnpm release:version
```

The script performs release preflight checks before it makes changes:
- Ensures the working tree is clean
- Requires the current branch to be `main`
- Verifies the three version files are consistent
- Checks that the target tag does not already exist locally or on `origin`

Then it:
- Updates all version files together
- Creates a release commit
- Creates a `vX.Y.Z` tag
- Optionally pushes the branch and tag

The GitHub Actions workflow is triggered by `v*` tags.

## Step 5: Verify the Published Assets

After GitHub Actions finishes, verify that the latest published release contains updater assets such as:
- `latest.json`
- Windows updater bundle artifacts
- Signature files

If `latest.json` is missing from the latest published release, updater clients cannot discover updates.

## How It Works

1. The app checks the updater endpoint on startup or during a manual check
2. If a newer version is available, the app shows the update dialog
3. If no update is available, the manual flow reports that the app is up to date
4. If the check fails, the UI reports an error instead of treating it as up to date
5. During download, progress is calculated from cumulative downloaded bytes
6. After installation, the app relaunches automatically

## Troubleshooting

**Update check fails:**
- Check that `latest.json` exists in the latest release assets
- Confirm the signing keys are configured correctly

**No update detected:**
- Confirm the installed app version is lower than the latest release version
- Confirm the release tag uses the `vX.Y.Z` format

**Signature verification fails:**
- Make sure `TAURI_SIGNING_PRIVATE_KEY` matches `TAURI_SIGNING_PUBLIC_KEY`
- Rebuild and republish the release after correcting secrets

## Related Files

- `.github/workflows/release.yml`
- `scripts/release-version.mjs`
- `src-tauri/tauri.conf.json`
