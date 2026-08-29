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
[kitlib/tauri-app-template](https://github.com/kitlib/tauri-app-template). Harbor owns its product
architecture and adopts external implementations only through small, explicit interfaces.

## License and attribution

Harbor's original code is licensed under
[AGPL-3.0-only](https://www.gnu.org/licenses/agpl-3.0.html). Copies and modified versions must retain
the author attribution and canonical source link in [NOTICE](NOTICE). The template's MIT notice and
other retained third-party notices live in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
