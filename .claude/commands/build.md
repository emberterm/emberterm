# /build — Full build

Build EmberTerm end-to-end. Useful before committing or packaging.

Steps:
1. Run `pnpm turbo build 2>&1` — builds all JS packages in dependency order (ui → app)
2. If step 1 passes, run `cargo build --manifest-path packages/desktop/Cargo.toml 2>&1` — Rust debug build

For a release binary without an installer, run `cargo tauri build --no-bundle` from `packages/desktop`;
plain `cargo tauri build` also makes the installers. The workspace puts every output in the repo-root
`target/`, not in `packages/desktop/target/`: `target/debug/emberterm.exe`,
`target/release/emberterm.exe`, `target/release/bundle/`.

Report:
- Whether each step passed or failed
- If failed: the first 20 error lines
- If passed: binary location and size (`ls -l`)

Notes:
- A release build takes several minutes.
- The `[profile.release]` block in `packages/desktop/Cargo.toml` is ignored by Cargo (profiles belong in
  the workspace root `Cargo.toml`), so it does not apply LTO or strip today. Do not quote it as fact.
