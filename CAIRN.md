# CAIRN

## Goal

Make GitHub sign-in usable without startup Keychain prompts: an unconfigured build must explain its
state without touching credentials, and configured builds must defer Keychain access until GitHub
data or an explicit credential action actually needs it.

## Current state

The startup and dialog status probes are removed. React caches only account name and avatar in
localStorage, while Rust returns disconnected before reaching the credential-store interface when
OAuth is unconfigured. The login dialog checks a non-secret availability command and shows a clear
disabled state instead of the raw backend error. The current machine still has neither
`HARBOR_GITHUB_CLIENT_ID` nor `HARBOR_GITHUB_CLIENT_SECRET`, so real browser sign-in requires a
one-time external GitHub App registration and a rebuilt Harbor binary.

## Next action

Blocked — Harbor has no registered GitHub App credentials; when the user authorizes external app
creation, register the app, configure the callback, set the two build variables, and run the real
installed-app login flow.

## Verification

```bash
pnpm check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
pnpm tauri:dev
```

Result: `pnpm check`, Rust formatting, 25 local Rust tests, `cargo check`, and `git diff --check`
pass; one external DeepWiki test remains ignored by design. The regression test reproduces two
credential-store reads before the fix and zero after it when OAuth is unconfigured. Playwright
confirms startup plus opening the login dialog makes zero `github_connection_status` calls and one
non-secret availability call. Real GitHub authorization remains unverified until the external app
credentials exist.

## Decisions

- Use the maintained `oauth2` crate for authorization-code and PKCE mechanics.
- Use Tauri's official deep-link plugin and keep the single-instance plugin first.
- Keep authentication pages in the system browser; never embed GitHub credentials in Harbor.
- Store access and refresh credentials only in Keyring; React receives connection metadata only.
- The PAT input and command are removed; old PAT-shaped Keyring values are ignored and replaced by
  the next OAuth login.
