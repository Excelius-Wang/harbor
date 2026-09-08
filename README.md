<div align="center">

<img src="src/assets/brand/repolane-mark.svg" width="72" height="64" alt="Repolane Lane logo" />

# Repolane

**A focused desktop workspace for your GitHub work.**

Read code, review pull requests, follow activity, and manage repository work in one place.

[简体中文](README.zh-CN.md) · [Features](#features) · [Run locally](#run-locally) · [Development](#development) · [Contributing](#contributing)

[![Tauri 2](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://v2.tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-000000?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111827)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/github/license/Excelius-Wang/harbor)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/Excelius-Wang/harbor?style=social)](https://github.com/Excelius-Wang/harbor)

</div>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="screenshots/repolane-workspace-dark.png" />
  <source media="(prefers-color-scheme: light)" srcset="screenshots/repolane-workspace-light.png" />
  <img alt="Repolane discovery workspace with expanded navigation and the Lane logo" src="screenshots/repolane-workspace-light.png" />
</picture>

_Production interface in the browser preview, using local demonstration data. [View both themes and verification notes](docs/verification/repolane-lane/README.md)._

> [!NOTE]
> Repolane is the new product name for Harbor. The repository remains
> `Excelius-Wang/harbor`; existing `HARBOR_*` configuration names are unchanged.
> The app is under active development with no packaged public release yet.
> The current packaging workflow targets macOS; other platforms are not yet verified.

## Why Repolane?

A notification leads to an Issue, a pull request, a workflow run, and another browser tab.
Repolane keeps those related tasks in a desktop workspace, with GitHub as the source of truth.

The interface uses compact navigation, light and dark surfaces, and separate scrolling panes.
Collapse the sidebar when you need more room; its state is remembered. The optional agent sidebar
is available when you want help understanding a public repository.

## Features

| Workspace             | Available workflows                                                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Personal work         | Notifications, Issues, pull requests, Projects, and Gists across your account.                                                                                                                               |
| Code and reviews      | Repository files, syntax highlighting, blame, history, diffs, pending reviews, review threads, checks, and merge controls.                                                                                   |
| Repository management | Releases, Discussions, Actions runs, security alerts, and repository settings, with GitHub Web links where needed.                                                                                           |
| Actions               | Workflow dispatch and filters; jobs, steps, logs, artifacts, reruns, cancellation, and workflow administration.                                                                                              |
| Packages              | Package and version lists, details, deletion, and restoration where GitHub permissions and package state allow.                                                                                              |
| Discovery             | Repository search, developer discovery, and activity from accounts you follow. The repository discovery list ranks newly created public repositories by stars; it is not GitHub's official Trending ranking. |
| Repository questions  | Optional DeepWiki-backed questions about public repositories. Private repository names and questions are not sent to this provider.                                                                          |
| Desktop controls      | Command palette, global shortcut, system tray, collapsible navigation, English/Simplified Chinese, and light/dark themes.                                                                                    |

Available actions depend on your GitHub permissions and the repository's state. Some workflows
open GitHub Web. Feature implementation does not imply that every native interaction has finished
acceptance testing; remaining work is tracked in the [UI migration checklist](docs/UI_MIGRATION_CHECKLIST.md).

## Run locally

### Prerequisites

- [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/)
- A stable [Rust toolchain](https://www.rust-lang.org/tools/install)
- The [Tauri 2 system prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform
- A classic [GitHub OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app) for signed-in workflows

```bash
git clone https://github.com/Excelius-Wang/harbor.git
cd harbor
pnpm install
```

Set the OAuth App's callback URL to:

```text
http://127.0.0.1:49152/oauth/github/callback
```

Create `.env.local` in the repository root:

```dotenv
HARBOR_GITHUB_CLIENT_ID=your_oauth_client_id
HARBOR_GITHUB_CLIENT_SECRET=your_oauth_client_secret
```

Keep the existing `HARBOR_*` variable names. `.env.local` is ignored by Git; never commit its
credentials. Then start the desktop app:

```bash
pnpm tauri:dev
```

### Preview the interface without signing in

After installing dependencies, start the development preview:

```bash
pnpm dev:ui --port 1423
```

Open [localhost:1423](http://localhost:1423/) for the workspace or
[localhost:1423/ui-components](http://localhost:1423/ui-components) for the component gallery.
This mode uses local fixtures and does not send business operations to GitHub. It does not require
OAuth credentials and does not verify native window behavior. See [preview scenarios](docs/UI_COMPONENTS.md).

## Development

```bash
pnpm check
cargo check --manifest-path src-tauri/Cargo.toml
```

`pnpm check` runs formatting, lint, tests, TypeScript, and the production frontend build.
Run the Rust check when changing the backend.

The app uses Tauri 2 and Rust with React 19, TypeScript, Vite, Tailwind CSS, and shadcn/ui.
TanStack Query manages server state; i18next supplies both interface languages.

- [Workspace instructions](AGENTS.md): branch workflow and implementation conventions.
- [UI design guide](docs/UI_DESIGN_GUIDE.md): compact layouts, shared controls, and surfaces.
- [Component preview](docs/UI_COMPONENTS.md): production components and controlled test states.

## Contributing

[Open an Issue](https://github.com/Excelius-Wang/harbor/issues) for a bug or a workflow you would
like improved. For a larger change, discuss the behavior and GitHub API requirements first.
Use a dedicated branch, keep changes focused, and include relevant verification.

If you find Repolane useful, [star the repository](https://github.com/Excelius-Wang/harbor)
to help others discover it.

## Foundation and license

The initial application shell is based on
[kitlib/tauri-app-template](https://github.com/kitlib/tauri-app-template).
The GitHub client, credential store, local cache, and agent runtime are kept behind small interfaces.

The project's original code is licensed under [AGPL-3.0-only](LICENSE).
Keep the author attribution and canonical source link in [NOTICE](NOTICE) when copying or modifying
it. The template's MIT notice and other retained notices are in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
