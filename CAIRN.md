# CAIRN

## Goal

Keep Harbor's browser-based GitHub PKCE login while replacing the custom `harbor://` deep link with
a short-lived loopback callback on `127.0.0.1`, so development and installed builds share the same
automatic sign-in flow.

## Current state

GitHub authorization now binds a short-lived listener on `127.0.0.1:49152` before returning the
PKCE-protected authorization URL. The listener accepts only the configured callback path and the
active attempt's state, completes identity validation and Keyring persistence in Rust, responds to
the browser, and publishes account metadata to React. The old custom-protocol dependency and
configuration are removed. Reopening GitHub from the waiting dialog reuses the same authorization
attempt instead of binding the port a second time. Lazy credential loading remains unchanged.

## Next action

Blocked — configure a GitHub App with Harbor's fixed callback and build credentials, then run one
real GitHub browser authorization to verify GitHub's external redirect and token exchange.

## Verification

```bash
pnpm check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
pnpm tauri:dev
```

Result: `pnpm check`, Rust formatting, 26 local Rust tests, `cargo check`, and `git diff --check`
pass; one external DeepWiki test remains ignored by design. The loopback test verifies unrelated
paths and callbacks with the wrong state are ignored, while a valid callback receives Harbor's
completion page. A Playwright interaction check verifies the first click starts one login and opens
GitHub, while the waiting-state retry only reopens the same authorization URL. Real GitHub
authorization remains unverified because this machine has neither `HARBOR_GITHUB_CLIENT_ID` nor
`HARBOR_GITHUB_CLIENT_SECRET`.

## Decisions

- Use the maintained `oauth2` crate for authorization-code and PKCE mechanics.
- Use a fixed loopback callback so the registered GitHub App URL and local listener always match.
- Keep authentication pages in the system browser; never embed GitHub credentials in Harbor.
- Store access and refresh credentials only in Keyring; React receives connection metadata only.
- The PAT input and command are removed; old PAT-shaped Keyring values are ignored and replaced by
  the next OAuth login.
