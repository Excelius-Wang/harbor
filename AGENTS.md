# AGENTS.md - Harbor

## Project identity

Harbor is a focused GitHub desktop workspace. It combines native GitHub workflows, selected
web fallbacks, discovery, and an optional agent sidebar.

## Stack

- Tauri 2 and Rust
- React and TypeScript
- Vite, Tailwind CSS, and shadcn/ui
- English and Simplified Chinese through i18next

## Commands

```bash
pnpm install
pnpm tauri:dev
pnpm check
cargo check --manifest-path src-tauri/Cargo.toml
```

## Working principles

- Keep product Modules behind small Interfaces: GitHub client, credential store, local cache,
  and agent runtime.
- Prefer the smallest correct implementation and verify it with focused tests.
- Do not copy GPL code into this repository.
- Keep source comments and identifiers in English.
- Do not commit generated build output or credentials.

