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

<!-- cairn:begin -->

## Cairn

When root `CAIRN.md` exists, follow the `cairn` skill when available; otherwise follow this
block. Read the root before task work. When it declares workspace mode, read only the item
named under `Current item`; do not load other items or `.cairn/archive/` unless the request
explicitly requires them.

Verify the selected checkpoint against its working area and authoritative records before
acting. In Git-backed work, inspect the relevant working tree. A checkpoint stored beside a
different repository or external system does not prove that external state is current.

Before ending a turn with authorized edits, update the selected checkpoint only when
recovery-critical information changed. Keep `Goal`, `Current state`, exactly one `Next action`,
and `Verification` current. Keep one independently resumable outcome per checkpoint; separate
unrelated work instead of carrying it forward as history.

Follow user and workspace authorization for commits and external writes. After verification
passes, set `Next action` to `None — complete`. Keep a completed inline checkpoint until new
work begins; in workspace mode, move the completed item to `.cairn/archive/` and update the
root pointer.

<!-- cairn:end -->
