# Harbor

Harbor is a focused GitHub desktop workspace built with Tauri, React, and TypeScript.

The product will combine native GitHub workflows, selected web fallbacks, discovery surfaces,
and an optional agent sidebar without treating GitHub Web as the application architecture.

## Development

Requirements: Node.js, pnpm, Rust, and the Tauri platform prerequisites.

```bash
pnpm install
pnpm tauri:dev
```

Useful checks:

```bash
pnpm check
cargo check --manifest-path src-tauri/Cargo.toml
```

## Foundation

The initial application shell is based on
[kitlib/tauri-app-template](https://github.com/kitlib/tauri-app-template) and retains its MIT
license notice. Harbor owns its product architecture and will adopt external implementations
only through small, explicit interfaces.
