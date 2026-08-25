# GitHub and Repository Context Foundation

## Goal

Create the smallest secure foundation required by Harbor's future Issue Radar and agent features.
The first vertical slice connects a GitHub identity and lets Ask Harbor query the selected public
repository through DeepWiki.

## Required behavior

- Keep GitHub API access behind a small client interface and use Octocrab for the implementation.
- Start GitHub authorization in the system browser with the authorization-code flow, PKCE, and a
  per-attempt state value.
- Accept only the verified `harbor://oauth/github/callback` deep link and expire pending login
  attempts after ten minutes.
- Exchange the authorization code in Rust, validate the returned identity, and save access and
  refresh credentials in the operating system credential store through Keyring. Never return
  credentials through IPC or write them to Harbor configuration files.
- Expose begin-login, connection-status, and disconnect commands to the Tauri frontend. Complete
  login from the Tauri deep-link handler and publish only connected-account metadata.
- Keep repository understanding behind a replaceable context-provider interface.
- Implement the first provider with the official DeepWiki MCP endpoint and official Rust MCP SDK.
- Send DeepWiki only the selected public repository name and the user's question.
- Verify public repository visibility with GitHub before sending a query to DeepWiki.
- Surface loading, success, and error states in the existing Ask Harbor sheet.
- Preserve browser preview support without attempting native IPC outside Tauri.

## Explicitly out of scope

- Manual personal-access-token entry and embedded GitHub password forms.
- Private-repository DeepWiki access.
- Persistent GitHub response caching and Issue Radar monitoring.
- Automatic issue comments, assignment, or claim actions.
- A general-purpose agent runtime or model-provider selection.

## Verification

- Unit-test PKCE authorization URLs, callback state and expiry checks, credential refresh,
  credential deletion, restored connection status, repository name validation, and MCP result
  extraction.
- Keep the live DeepWiki integration test ignored by default and run it explicitly when network
  access is available.
- Run the frontend check and Tauri Rust checks before delivery.
