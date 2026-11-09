# Contributing to EmberTerm

EmberTerm is a small personal terminal; fixes and focused features are welcome. For anything big,
open an issue first so we agree on the shape before you write it.

## Setup

Prerequisites: [Rust](https://rustup.rs/) 1.85+, [Node.js](https://nodejs.org/) 22+,
[pnpm](https://pnpm.io/) 9+. On Windows you also need WebView2 (preinstalled on Windows 11).

```sh
pnpm install
pnpm dev        # the desktop app with hot reload
pnpm dev:ui     # Vite only, no Tauri backend
```

## Before you open a PR

CI runs only on pushes to `main`, so a PR is checked locally: run these before you open a PR, or
before you mark a draft ready for review. All of them must pass; say in the PR that you ran them.

```sh
cargo fmt --manifest-path packages/desktop/Cargo.toml -- --check
cargo clippy --manifest-path packages/desktop/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path packages/desktop/Cargo.toml
pnpm turbo check test build
pnpm version:check
```

CI also builds and tests on macOS after the merge; a local run covers only your own platform.

## Code style

- **Tests first for logic and bug fixes.** Write the failing test, then the code. Skip tests for pure
  layout and glue. Rust tests go in a `*_test.rs` file next to the source
  (`#[cfg(test)] #[path = "x_test.rs"] mod tests;`); frontend tests are `*.test.ts` (Vitest).
- **Max 300 lines per file** (tests excluded). Split a file by responsibility instead of growing it.
- **Rust:** return `Result`, no panics outside tests, `tracing` instead of `println!`, `thiserror` in
  modules and `anyhow` at the edges.
- **Svelte 5 runes only** (`$state`, `$derived`, `$props`, `$effect`); props typed with an `interface Props`.
- **IPC:** go through the typed wrappers in `ipc/client.ts` and `ipc/events.ts`; never call `invoke` or
  `listen` directly. Rust structs are the source of truth for IPC types.
- **Colors and spacing** come from CSS variables (`var(--bg-elev)`, ...), never hard-coded hex.
- **Comments say why**, not what. No TODO/FIXME in committed code; open an issue instead.
- Keep changes surgical: touch only what the change needs, match the surrounding style.

See [`CLAUDE.md`](CLAUDE.md) for the architecture and file map.

## Commits and pull requests

- [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): imperative subject`,
  where type is `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`, `build` or `ci`.
  Explain *why* in the body when it is not obvious.
- Branch off `main`; do not commit to `main` directly.
- A PR title in the same style, a short what and why, and how you verified it (commands run, or what
  you tried in the app). The PR template has the checklist.
- Do not commit secrets, personal paths or machine names. Update `CHANGELOG.md` under `[Unreleased]`
  when behavior changes.
- Report security problems privately, see [SECURITY.md](SECURITY.md).

## Versioning and releases

One version for the whole repo. `packages/desktop/Cargo.toml` is the source (`tauri.conf.json` has no
version, so Tauri reads it from there); the three `package.json` files must match, and CI fails if
they drift.

```sh
pnpm version:set 0.2.0     # writes Cargo.toml, package.json files and Cargo.lock
pnpm version:check         # verifies they agree
```

To release: bump the version in a PR and move the `[Unreleased]` entries of `CHANGELOG.md` under a
`## [X.Y.Z] - date` heading, with a `### Highlights` list on top, merge it, then push the tag. The GitHub
release body is built from that section (Highlights; Changes from Added, Changed and Removed; Fixes from
Fixed and Security) plus the pull requests and contributors since the previous release. The Release
workflow fails for a stable tag without Highlights. Preview it before tagging with
`GITHUB_TOKEN=$(gh auth token) GITHUB_REPOSITORY=emberterm/emberterm node scripts/release-notes.mjs vX.Y.Z main`. A tag with a suffix (`v1.1.0-rc.1`) is published as
a pre-release, which the updater ignores.

```sh
git checkout main && git pull
git tag v0.2.0 && git push origin v0.2.0
```

The Release workflow refuses a tag that disagrees with the files, builds the Windows installer and a
universal macOS app (ad-hoc signed, not notarized, so Gatekeeper asks on first launch), signs the
updates with the `TAURI_SIGNING_PRIVATE_KEY` repo secret and publishes `latest.json`. That file is
what **Settings → About → Check for updates** reads. Keep the private key (`~/.tauri/emberterm.key`) safe:
without it installed copies cannot verify any later update.

After the platform jobs finish, a last job posts to the Vercel deploy hook in the repo secret `SITE_DEPLOY_HOOK_URL`, so the landing page
(emberterm-web) rebuilds with the new version. Pre-releases skip it, and without the secret it only warns.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
