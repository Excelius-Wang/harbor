# GitHub and Repository Context Foundation

## Goal

Create the smallest secure foundation required by Harbor's future Issue Radar and agent features.
The first vertical slice connects a GitHub identity and lets Ask Harbor query the selected public
repository through DeepWiki.

## Required behavior

- Keep GitHub API access behind a small client interface and use Octocrab for the implementation.
- Validate a fine-grained GitHub personal access token before saving it.
- Reject classic personal access tokens and accept only GitHub's `github_pat_` token format.
- Save the token in the operating system credential store through Keyring. Never return the token
  through IPC or write it to Harbor configuration files.
- Expose connection status, connect, and disconnect commands to the Tauri frontend.
- Keep repository understanding behind a replaceable context-provider interface.
- Implement the first provider with the official DeepWiki MCP endpoint and official Rust MCP SDK.
- Send DeepWiki only the selected public repository name and the user's question.
- Verify public repository visibility with GitHub before sending a query to DeepWiki.
- Surface loading, success, and error states in the existing Ask Harbor sheet.
- Preserve browser preview support without attempting native IPC outside Tauri.

## Explicitly out of scope

- GitHub OAuth device flow until Harbor has a distributable OAuth Client ID.
- Private-repository DeepWiki access.
- Persistent GitHub response caching and Issue Radar monitoring.
- Automatic issue comments, assignment, or claim actions.
- A general-purpose agent runtime or model-provider selection.

## Verification

- Unit-test token validation ordering, credential deletion, restored connection status, repository
  name validation, and MCP result extraction.
- Keep the live DeepWiki integration test ignored by default and run it explicitly when network
  access is available.
- Run the frontend check and Tauri Rust checks before delivery.
