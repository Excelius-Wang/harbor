# CAIRN

## Goal

Replace manual GitHub token entry with browser-based GitHub OAuth: Harbor opens the system browser,
accepts a verified deep-link callback, stores OAuth credentials in the operating-system credential
store, and shows the connected account without exposing credentials to React.

## Current state

The browser OAuth replacement is implemented. The dialog opens GitHub in the system browser,
Tauri accepts the `harbor://oauth/github/callback` deep link, Rust validates state and PKCE before
exchanging the code, and Keyring stores OAuth credentials. The connected state shows only GitHub
account metadata. Manual token entry and its command have been removed. A distributable GitHub App
client ID and secret remain external build configuration and must not be committed.

## Next action

None — complete.

## Verification

```bash
pnpm check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
pnpm tauri:dev
```

Result: `pnpm check`, Rust formatting, 24 local Rust tests, `cargo check`, and `git diff --check`
pass; one external DeepWiki test remains ignored by design. Playwright verified the disconnected,
waiting-for-browser, and connected-account dialog states. The OAuth tests cover PKCE and state,
callback expiry and one-time completion, token refresh, identity validation before persistence,
restored sessions, and disconnect cleanup.

## Decisions

- Use the maintained `oauth2` crate for authorization-code and PKCE mechanics.
- Use Tauri's official deep-link plugin and keep the single-instance plugin first.
- Keep authentication pages in the system browser; never embed GitHub credentials in Harbor.
- Store access and refresh credentials only in Keyring; React receives connection metadata only.
- The PAT input and command are removed; old PAT-shaped Keyring values are ignored and replaced by
  the next OAuth login.
