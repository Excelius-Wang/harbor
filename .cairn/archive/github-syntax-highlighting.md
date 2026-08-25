# GitHub syntax highlighting

## Goal

Render supported repository text files with responsive, GitHub-quality syntax colors inside
Harbor while preserving the existing line-number viewer and plain-text fallback.

## Current state

Harbor detects common repository languages and highlights supported source files with GitHub light
or dark Shiki themes. Language grammars load on demand inside a reusable Web Worker, keeping
tokenization off the UI thread; stalled work times out after 1.5 seconds and falls back to plain
text. Unknown files and source above 500 KB or 5,000 lines also stay on the plain-text path. Tokens
are rendered as escaped React nodes, and the existing internal file navigation and explicit GitHub
opener remain unchanged.

## Next action

None — complete.

## Verification

```bash
pnpm check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
```

All checks pass: 13 frontend tests pass; 33 Rust tests pass and one external DeepWiki test remains
ignored. Browser verification covers dark and light Rust highlighting, internal file navigation,
one file read, and an opener call only after explicitly selecting **Open on GitHub**.

## Decisions

- Use Shiki's maintained TextMate grammar implementation instead of writing tokenizers.
- Use fine-grained Shiki packages and per-language imports rather than shipping every grammar.
- Keep tokenization in a Web Worker with a total timeout so pathological source cannot block UI.
- Keep highlighting read-only and separate from future editing, Diff, and Git write workflows.
- Render Shiki tokens as React text nodes rather than injecting generated HTML.
