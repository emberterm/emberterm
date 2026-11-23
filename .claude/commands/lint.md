# /lint — Run all linters and format checks

Run every static analysis and format check. Before opening a PR, run `/ci` instead: it adds the
tests, the build and the version check.

Steps:
1. `cargo clippy --manifest-path packages/desktop/Cargo.toml --all-targets -- -D warnings 2>&1`
   — Rust lints; treat all warnings as errors
2. `cargo fmt --manifest-path packages/desktop/Cargo.toml -- --check 2>&1`
   — Rust format check (does not modify files)
3. `pnpm turbo check 2>&1`
   — TypeScript + Svelte type check across all packages

For each step, report:
- Pass (no output) or Fail (first 30 lines of output)

4. Check for files exceeding 300 lines (test files are excluded):
   `find packages/desktop/src packages/app/src packages/ui/src \( -name "*.rs" -o -name "*.svelte" -o -name "*.ts" \) ! -name "*_test.rs" ! -name "*.test.ts" | xargs wc -l | sort -rn | awk '$1 > 300 && $2 != "total"'`
   — list any over-long files and suggest how to split them. A few files were already over the limit
   (today `ipc.rs`, `SettingsPanel`, `CommandPalette`, `WelcomeScreen`, `TabStrip`, `App` and `Grid`): report them, but do
   not split them inside an unrelated change.

If any step fails, identify the root cause and offer to fix it.
Auto-format Rust only if the user confirms: `cargo fmt --manifest-path packages/desktop/Cargo.toml`
