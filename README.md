<div align="center">

# Harbor

**Your GitHub work, finally in one calm desktop workspace.**

Built for people who live on GitHub but do not want to live in a maze of browser tabs.

[简体中文](README.zh-CN.md) · [What works today](#what-works-today) · [Run locally](#run-locally) · [Contributing](#contributing)

[![Tauri 2](https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white)](https://v2.tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-000000?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111827)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/github/license/Excelius-Wang/harbor)](https://github.com/Excelius-Wang/harbor/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/Excelius-Wang/harbor?style=social)](https://github.com/Excelius-Wang/harbor)

</div>

![Harbor desktop workspace showing repository discovery and activity](screenshots/harbor-workspace-implemented.png)

> [!IMPORTANT]
> Harbor is under active development and does not have a packaged public release yet. You can build
> it from source today, explore the code, and help shape the product.

## Why Harbor?

GitHub gives developers almost every tool they need, but the daily workflow is scattered across
notifications, repository tabs, review pages, Actions runs, and search results. Harbor brings the
personal GitHub workflow into a focused desktop app while keeping GitHub itself as the source of
truth.

The goal is simple: spend less time finding the right page and more time understanding what needs
your attention.

## What works today

- **A personal inbox** for notifications, Issues, pull requests, Projects, and Gists across your
  account.
- **A complete repository workspace** for code, Releases, Issues, pull requests, Discussions,
  Actions, security alerts, and repository settings.
- **Serious review tools** including syntax-highlighted source, blame and history, rich diffs,
  pending reviews, review threads, checks, merge controls, and native file downloads.
- **Actions without tab hopping** with workflow dispatch, filters, Jobs and Steps, logs, artifacts,
  reruns, cancellation, and workflow administration.
- **Repository discovery** for finding projects and opening their recent activity in context.
- **Desktop details that matter** such as a command palette, global shortcut, system tray,
  auto-update plumbing, dark and light themes, and English/Simplified Chinese UI.
- **An optional repository-aware agent rail** backed by DeepWiki for questions about public
  repositories. Private repositories are deliberately excluded from this first provider.

## Product principles

- **Native where it matters.** Core workflows use GitHub APIs and focused desktop interactions.
  Harbor falls back to GitHub Web only when the platform does not expose a safe equivalent.
- **One workspace, less context switching.** Lists preserve their state while you move into an
  Issue, review, run, or file and back again.
- **GitHub remains canonical.** Harbor does not invent a second copy of your repository state.
- **Small, replaceable boundaries.** The GitHub client, credential store, local cache, and agent
  provider stay behind narrow interfaces.

## Run locally

### Prerequisites

- [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/)
- A stable [Rust toolchain](https://www.rust-lang.org/tools/install)
- The [Tauri 2 system prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform
- A classic [GitHub OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
  for signed-in GitHub workflows

Clone the repository and install the dependencies:

```bash
git clone https://github.com/Excelius-Wang/harbor.git
cd harbor
pnpm install
```

Create a classic GitHub OAuth App with this callback URL:

```text
http://127.0.0.1:49152/oauth/github/callback
```

Then add its credentials to `.env.local` in the repository root:

```dotenv
HARBOR_GITHUB_CLIENT_ID=your_oauth_client_id
HARBOR_GITHUB_CLIENT_SECRET=your_oauth_client_secret
```

Keep this file local. It is ignored by Git and must never be committed. Start the desktop app with:

```bash
pnpm tauri:dev
```

## Development

Run the complete frontend check before submitting a change:

```bash
pnpm check
```

Check the Rust backend separately when working under `src-tauri`:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

The desktop shell uses Tauri 2 and Rust. The interface is built with React 19, TypeScript, Vite,
Tailwind CSS, and shadcn/ui; TanStack Query owns server-state synchronization, and i18next provides
English and Simplified Chinese.

## Contributing

Harbor is still taking shape, which makes focused feedback especially useful. If you find a bug or
have a workflow that would make the app meaningfully better,
[open an Issue](https://github.com/Excelius-Wang/harbor/issues). For larger changes, start with an
Issue so the product behavior and GitHub API boundary are clear before implementation begins.

If Harbor is the kind of GitHub workspace you want to see exist, consider
[starring the repository](https://github.com/Excelius-Wang/harbor). It helps more developers find
the project.

## Foundation, license, and attribution

The initial application shell is based on
[kitlib/tauri-app-template](https://github.com/kitlib/tauri-app-template). Harbor owns its product
architecture and adopts external implementations only through small, explicit interfaces.

Harbor's original code is licensed under
[AGPL-3.0-only](https://github.com/Excelius-Wang/harbor/blob/main/LICENSE). Copies and modified
versions must retain the author attribution and canonical source link in
[NOTICE](https://github.com/Excelius-Wang/harbor/blob/main/NOTICE). The template's MIT notice and
other retained third-party notices live in
[THIRD_PARTY_NOTICES.md](https://github.com/Excelius-Wang/harbor/blob/main/THIRD_PARTY_NOTICES.md).
