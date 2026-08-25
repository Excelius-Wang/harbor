# GitHub browser login

## Goal

Keep Harbor's browser-based GitHub PKCE login while replacing the custom `harbor://` deep link with
a short-lived loopback callback on `127.0.0.1`, so development and installed builds share the same
automatic sign-in flow.

## Current state

GitHub authorization binds a short-lived listener on `127.0.0.1:49152` before returning the
PKCE-protected authorization URL. The listener accepts only the configured callback path and active
attempt state, completes identity validation and Keyring persistence in Rust, responds to the
browser, and publishes account metadata to React. The old custom-protocol dependency is removed.
The local `.env.local` exists, is ignored by Git, and contains non-placeholder Client ID and Client
Secret entries, but Harbor has not yet completed a real browser authorization with them.

## Next action

Load `.env.local` into the Tauri development process and run one real GitHub browser authorization.

## Verification

```bash
set -a
source .env.local
set +a
pnpm tauri:dev
```

Success: GitHub returns to Harbor, the connected account appears, and repository data loads without
an automatic startup Keychain prompt.

## Decisions

- Use the maintained `oauth2` crate for authorization-code and PKCE mechanics.
- Keep authentication pages in the system browser; never embed GitHub credentials in Harbor UI.
- Store access and refresh credentials only in Keyring; React receives account metadata only.
