# EmberTerm — Claude Context

## Overview

EmberTerm is a lightweight terminal for daily use, Windows first with a universal macOS build (ad-hoc signed, not notarized): Tauri 2 (Rust) + Svelte 5 + xterm.js, built on `portable-pty`. Many tabs with different shells (Git Bash, WSL, pwsh, cmd on Windows; the login shell on macOS), split panes, and the previous session restored on reopen: tabs, splits, folders and each pane's last commands. It replaces Tabby, which failed to launch after updates and forgot sessions.

**Stack:**
- Rust `1.85`: `tauri 2`, `portable-pty 0.9`, `serde`, `anyhow`/`thiserror`, `notify`, `tracing`, `sysinfo`, `fontdb`; Tauri plugins: opener, clipboard-manager (read), window-state, updater (no `zip` feature, see Cargo.toml), process, dialog
- Frontend: Svelte 5 (runes), TypeScript, Vite 6, xterm.js 5 (fit, web-links, search, webgl addons); Markdown preview: marked, dompurify, highlight.js (all loaded on first use)
- IPC: Tauri commands (frontend → Rust), a Tauri Channel for PTY output (raw bytes), and Tauri events (Rust → frontend)

---

## Architecture

### Packages

The project is a **pnpm + Cargo workspace**:

| Package | Path | Purpose |
|---|---|---|
| `emberterm` (Rust) | `packages/desktop/` | Tauri 2 Rust backend (PTY, shell hooks, config/profile/session files, IPC) |
| `@emberterm/app` | `packages/app/` | Svelte 5 webview frontend |
| `@emberterm/ui` | `packages/ui/` | Shared Svelte component library (Btn, Badge, Kbd, SplitContainer) |

`scripts/version.mjs` keeps one version across Cargo.toml and the package.json files.

### File Map

```
packages/desktop/src/
  main.rs                ← Tauri entry, plugins, AppState registration
  state.rs               ← AppState (sessions, config, profiles, startup warnings), lock_or_recover
  ipc.rs                 ← most #[tauri::command] handlers (font_list is in fonts.rs, the preview commands in preview.rs)
  fonts.rs               ← font_list: installed font families (fontdb), for the font picker
  fsutil.rs              ← write_atomic, quarantine, load_user_file, StartupWarning
  git.rs                 ← the git command for the status bar (no fsmonitor, no locks, no console flash) and safe_cwd (never a network path)
  profile.rs             ← Profile TOML + loading (broken files are quarantined)
  config.rs              ← Config TOML + loading; save_to refuses to overwrite a broken file
  session_store.rs       ← session.json (tabs, splits, folders, per-pane command history) load/save
  watcher.rs             ← notify watcher: config.toml / profiles hot-reload, app:warning
  preview.rs             ← Markdown preview commands: file_preview (1 MB), file_preview_image (5 MB), file_preview_stat, preview_resolve; PreviewError
  preview_path.rs        ← shell path → Windows path (Git Bash /d/x, WSL /mnt and \\wsl.localhost, pwsh); on macOS and Linux paths stay POSIX (`Host`); refuses network paths
  terminal/
    pty.rs               ← spawn_session(): reader thread, DEC 2026 coalescing, Channel send, exit wait thread
    output.rs            ← batches PTY output (8 ms or 64 KB) so a flood is not bound by per-send IPC cost
    flow.rs              ← ack-based flow control: the reader waits while too many sent bytes are unacked (session_ack)
    session.rs           ← Session struct (PTY master, writer, pid)
    shell_hooks.rs       ← per-shell hook injection: OSC 7 folder, OSC 133 busy marks and OSC 133;E command marks (Bash/WSL/pwsh), folder and history restore
    busy.rs              ← process-tree "is a program running" check (cmd, pwsh)
    which.rs             ← PATH lookup, cached default shell
    events.rs            ← SessionExitPayload

packages/app/src/
  main.ts                ← Svelte mount
  App.svelte             ← root: startup, tab lifecycle, restore, autosave, shortcuts, close confirmation
  ipc/client.ts, events.ts   ← typed invoke() / listen() wrappers
  stores/
    app.ts               ← tabs, activeCwd, toasts, split/rename updaters
    sessionSnapshot.ts   ← tabs → SavedSession (session.json shape)
    terminalConfigStore.ts, gitStatus.ts
    paneBusy.ts          ← per-pane "command running" from OSC 133, not reactive
  session/
    autosave.ts          ← debounced save with flush/suspend
    profiles.ts          ← pickProfile: requested id → default → first
    spawnPane.ts         ← starts a PTY session, wires output + background-tab indicators
    confirmClose.ts      ← whether closing a tab needs a confirmation
    closeWindow.ts       ← quit after the last tab closes
    duplicateTab.ts      ← where a duplicated tab goes (right after its source)
    nonces.ts            ← per-session secret that authenticates OSC 133;E command marks
    previewActions.ts    ← open the preview: from a path in the output, the file dialog, the palette/shortcut, or a cat command (opt-in)
  terminal/
    Grid.svelte          ← xterm.js Terminal per session; OSC 7/133/52, title, bell, find, context menu
    TabPane.svelte       ← one tab: one Grid or a split of two
    FindBar.svelte, TermMenu.svelte   ← scrollback search, right-click menu
    termKeys.ts          ← copy / paste / find key chords
    outputSink.ts        ← per-session byte sink (buffers until Grid attaches)
    webglRenderer.ts     ← WebGL only while the tab is shown (the webview allows ~16 contexts); DOM renderer otherwise
    links.ts             ← http(s) links go through the opener plugin, nothing else
    previewLinks.ts      ← xterm link provider: Ctrl+click on a .md name in the output
  utils/
    osc.ts               ← parseOsc7, parseOsc52, parseOsc133
    shortcuts.ts         ← window-level shortcuts: single source for the key handler and Keymap page
    tabLabel.ts, fontFamily.ts, clock.ts, bell.ts, warnings.ts
    history.ts           ← which commands are kept for restore (10 per pane, no leading space, no secret-looking text)
    menuPosition.ts, portal.ts   ← context menus stay on screen and paint above the status bar
    updater.ts           ← check → download → install → relaunch state machine
  chrome/
    TitleBar.svelte, TabStrip.svelte, ProfileMenu.svelte, StatusBar.svelte, Toasts.svelte, ConfirmDialog.svelte
    TabMenu.svelte       ← tab right-click menu: duplicate, move, close (rename is a double-click on the title)
    tabDrop.ts           ← drag-to-reorder: which half of a tab the pointer is over decides before/after
  palette/CommandPalette.svelte ← Ctrl+Shift+P: tabs, profiles, splits, themes, Preview Markdown file
  settings/              ← SettingsPanel, Appearance/Terminal/Keymap/About, ThemeEditor, ProfileEditor, NumberStepper
  welcome/WelcomeScreen.svelte  ← first-launch onboarding
  preview/               ← Markdown preview panel (lazy chunk): PreviewColumn/Panel/Body/Divider.svelte; markdown.ts (marked + DOMPurify → sanitized fragment),
                           links.ts, images.ts, slug.ts, highlight.ts (highlight.js subset), poller.ts (live reload), catCommand.ts, previewState.ts, layout.ts, format.ts, errors.ts
  theme/                 ← tokens.ts, vscode-import.ts, store.ts, font/padding/theme config, themes/ (7 built-in)

packages/ui/src/lib/     ← Btn, Badge, Kbd, SplitContainer (barrel: index.ts)
```

### Data Flow

```
Shell (Git Bash / WSL / pwsh)
    │ bytes (incl. OSC 7 folder and OSC 133 busy marks from the injected hooks)
    ▼
portable-pty ──► reader thread ──► DEC 2026 coalescing ──► Channel (raw bytes) ──► outputSink ──► xterm.js
                 wait thread ──► terminal:exit (first of reader/wait wins)                  ├─ OSC 7   → pane cwd
                                                                                            ├─ OSC 133 → paneBusy
                                                                                            ├─ title   → tab title
                                                                                            └─ OSC 52  → clipboard
tabs store ──(500 ms debounce)──► session_save ──► session.json
startup    ──► session_load ──► session_create(profile, cwd, channel) per pane
```

Output is batched in `terminal/output.rs` and acknowledged: xterm reports each parsed batch with `sessionAck`, and `terminal/flow.rs` stops the reader while too many bytes are unacked, so a flood cannot grow memory. The prompt hook also sends `OSC 133;E;<nonce>;<command>` for each command: `Grid.svelte` hands it to `onCommand`, `pushPaneCommand` keeps the last 10 per pane, `session.json` saves them, and a restored shell is seeded with them (Up recalls them). The same mark is what the opt-in Markdown-preview-on-`cat` setting reads.

Closing a tab asks first when `paneBusy` says a command is running; shells without markers (cmd, pwsh) fall back to `session_busy`, the process-tree check. Closing the last tab, or a shell exiting in it, closes the window.

---

## Coding Standards

### Rust

**Error handling**
- Return `Result<T, E>` — never panic in non-test code
- Library/module errors: define with `thiserror`; command/binary errors: use `anyhow::Result`
- Use `?` to propagate; `.expect("msg")` only for invariants that are genuinely impossible
- Log-and-discard errors only at the top-most boundary (e.g. PTY reader thread)

**Logging**
- `tracing::{info!, warn!, error!, debug!}` — never `println!` or `eprintln!` in production
- `#[instrument]` on Tauri command handlers and long-running tasks
- Log levels: `info` for session lifecycle; `debug` for per-chunk PTY data; `error` for unrecoverable failures

**Concurrency**
- PTY reader threads are `std::thread` (blocking `read()` — not tokio tasks)
- `std::sync::Mutex` for AppState accessed from sync contexts
- `tokio::sync::Mutex` only when `.await` is needed inside the lock
- IPC payloads must be `Send + Sync + Clone + serde::Serialize`

**IPC types**
- All Tauri event payload structs: `#[derive(serde::Serialize, Clone)]`
- All Tauri command return types: `#[derive(serde::Serialize)]`
- Struct field names in `snake_case` — Tauri/serde serializes to camelCase automatically
- Use the `SessionId = String` type alias — never raw `String` where a session ID is meant

**Module structure**
- Imports: std → external crates → crate-internal; blank line between groups
- No wildcard imports except `use super::*` in `#[cfg(test)]` modules
- One public `mod` per file; `pub(crate)` over `pub` where the symbol doesn't cross the crate boundary

**Tests**
- Unit tests live in a **separate `*_test.rs` file** alongside the source file:
  - Place tests in `src/session_store_test.rs`, `src/terminal/shell_hooks_test.rs`, etc.
  - Reference it from the source file with `#[cfg(test)] #[path = "shell_hooks_test.rs"] mod tests;`
  - The test file starts with `use super::*;` to access the parent module's items
  - This keeps each source file under the 300-line limit and makes tests easy to locate
- Integration tests in `packages/desktop/tests/`
- No `#[ignore]` without a comment explaining why and a tracking issue

### TypeScript / Svelte

**Svelte 5 runes — always use these, never Svelte 4 APIs inside components**
- State: `let x = $state(initial)` — not `writable()`
- Derived: `let y = $derived(expr)` — not `$: y = expr`
- Props: `let { foo, bar = defaultVal }: Props = $props()` — typed interface, always
- Effects: `$effect(() => { ... })` for side effects with reactive dependencies
- Never mutate props; pass callbacks or emit events instead

**IPC discipline**
- Only use typed wrappers from `ipc/client.ts` — never raw `invoke<any>(...)`
- Only use typed subscriptions from `ipc/events.ts` — never raw `listen(...)`
- Store `UnlistenFn` from every `listen()` call and call it in `onDestroy` or `$effect` cleanup
- Catch IPC errors and expose them as component state — never silently swallow

**Component conventions**
- Props typed with a `interface Props { ... }` block above `<script>`
- Inline handlers limited to single-expression lambdas; extract anything longer to a named function
- All colors and spacing via `var(--token)` CSS variables — no hardcoded hex values
- `<style>` block is scoped per component; global styles only in `app.css` or `:root` token declarations

**Design tokens — use names from `theme/tokens.ts` which match `references/design.html`**
- Elevation: `--bg` (base) → `--bg-elev` (raised) → `--bg-elev-2` (modal/overlay)
- Block backgrounds: `--bg-block`
- Diff colors: `--diff-add-bg`, `--diff-add-line`, `--diff-del-bg`, `--diff-del-line`
- Semantic: `--green`, `--red`, `--yellow`, `--blue` (status indicators)
- Accent variants: `--accent-soft` (hover), `--accent-glow` (focus ring)
- Do not reference ANSI palette hex values in component CSS

**Stores**
- Stores live in `stores/` (tab state in `stores/app.ts`) — no per-component stores
- Mutations only via exported updater functions; never `.update()` from outside the module
- Derived stores computed at the top of `stores/app.ts` with a one-line comment

### General

- Comments explain WHY, not WHAT — well-named code explains itself
- No TODO/FIXME in committed code — open a GitHub issue instead
- No dead code without `// used in Phase N` annotation
- **Max 300 lines per file.** If a file exceeds 300 lines, split it: extract a cohesive sub-module (Rust) or a focused child component / utility module (Svelte/TS). Tests in `mod tests` / `*.test.ts` are excluded from the line count.
- Keep functions under ~40 lines; split on responsibility, not arbitrary size
- No feature flags or backwards-compatibility shims — change the code directly

---

## IPC Quick Reference

### Tauri Commands (frontend → Rust)

| Function | Returns | Notes |
|---|---|---|
| `sessionCreate({ profileId?, cwd?, history?, nonce?, onOutput })` | `Promise<string>` | output arrives as raw bytes on a Channel; `history` seeds the new shell, `nonce` authenticates its command marks |
| `sessionWrite(id, bytes)` | `Promise<void>` | |
| `sessionResize(id, cols, rows)` | `Promise<void>` | |
| `sessionClose(id)` | `Promise<void>` | |
| `sessionAck(id, bytes)` | `Promise<void>` | xterm parsed this many more bytes; the reader waits on it under a flood |
| `sessionBusy(id)` | `Promise<boolean>` | child process running under the shell (fallback when no OSC 133) |
| `sessionLoad()` | `Promise<{ session, warning }>` | reads `session.json` |
| `sessionSave(session)` | `Promise<void>` | atomic write |
| `startupWarnings()` | `Promise<StartupWarning[]>` | drained on read |
| `profileList()` / `profileUpsert(p)` / `profileDelete(id)` | | |
| `configGet()` / `configUpdate(patch)` / `configIsFirstRun()` | | `configUpdate` refuses to overwrite a broken file |
| `gitStatus(cwd)` | `Promise<GitStatus>` | branch, dirty, insertions, deletions |
| `detectBuiltinProfiles()` | `Promise<BuiltinProfileSpec[]>` | |
| `fontList()` | `Promise<{ name, monospaced }[]>` | installed font families, cached per run |
| `filePreview(path)` / `filePreviewImage(path)` / `filePreviewStat(path)` | `FilePreview` / `Uint8Array` / `number` (mtime ms) | Markdown preview; rejects with `PreviewError { code }` |
| `previewResolve({ profileId?, cwd, raw })` | `Promise<string>` | a path from a pane → Windows path, by that pane's shell and folder |

Plugins are called through their own JS packages (not `ipc/client.ts`): clipboard read for paste, updater and process for About → Check for updates, opener for external links, dialog for the file pickers (a profile's folder, Preview Markdown file). Each needs a permission in `capabilities/default.json`.

### Tauri Events (Rust → frontend)

| Event | Payload | Trigger |
|---|---|---|
| `terminal:exit` | `session_id, code` | shell process ended (also on reader panic) |
| `profiles:updated` | `Profile[]` | profiles dir changed |
| `config:updated` | `Config` | config.toml changed and parses |
| `app:warning` | `StartupWarning` | a watched file failed to parse |

Folder, busy state, title, bell and clipboard come from xterm.js handlers (`utils/osc.ts`), not from Rust.

---

## Key Conventions

- Rust structs are the source of truth for IPC types — TypeScript types mirror them by hand
- Themes use VS Code-compatible JSON — do not invent a new format
- Config, profiles and `session.json` live in `<config_dir>/ember/` (`%APPDATA%\ember` on Windows); window size and position in `%APPDATA%\dev.emberterm.app`
- `SessionId` is a `String` — never expose PTY handles or OS pids to the frontend
- The `--bg-elev` CSS variable naming convention is canonical — not `--bg-elevated`
- A user-editable file that fails to parse is moved aside (`*.broken-<ts>`) at startup and reported as a toast; while the app runs it is left alone and saves are refused
- Svelte reactivity trap: props that resolve through the `$tabs` store re-run any effect that reads them; read them with `untrack` or through a `$derived`
- xterm swallows Tab and Ctrl+V; terminal-scoped keys are handled in `Grid.svelte`'s custom key handler, window-level ones in `utils/shortcuts.ts`
- The Markdown preview is a column next to a stable `.terminals` wrapper in `TabPane.svelte`: the terminals must never remount (they would lose their scrollback) when it opens or closes. Its state (`Tab.preview`) is not saved in `session.json`
- Markdown from a file is untrusted: it only becomes DOM through `renderMarkdown` (DOMPurify, returns a fragment, no `{@html}`), remote images are replaced by a note, and the CSP is unchanged. Terminal output can forge paths and folders, so `preview.rs` and `preview_path.rs` never read a network path (SMB auth leaks the NTLM hash) except `\\wsl.localhost\`
- Tab panes hide with `visibility: hidden`, never `display: none`: xterm's ResizeObserver would measure 0-width cells and corrupt full-screen programs. WebGL is attached only to the tab that is shown
- Command history rides on the hook's `OSC 133;E` mark (percent-encoded, with the session nonce, so a mark a program printed itself is ignored). `utils/history.ts` drops commands that start with a space, span lines, or look like secrets
- `session.json` and `config.toml` grow additively with `#[serde(default)]`, so `version` stays 1 and old files still load
- Programs cannot set the clipboard (OSC 52) unless `behavior.osc52_clipboard` is on; Markdown preview on `cat` is `behavior.preview_on_cat`, also off by default
- `[profile.release]` in `packages/desktop/Cargo.toml` is ignored by Cargo (profiles belong in the workspace root `Cargo.toml`), so release builds currently use the defaults
- Git Bash orphans child processes (MSYS), so the process tree cannot show a running command there; that is why bash/WSL announce it with OSC 133

---

## Versioning and Releases

One version everywhere: `packages/desktop/Cargo.toml` is the source (`tauri.conf.json` has no `version`), and the package.json files must match. `pnpm version:set X.Y.Z` writes them all and refreshes `Cargo.lock`; `pnpm version:check` verifies (CI runs it). To release: bump in a PR (and move `[Unreleased]` in `CHANGELOG.md` under `## [X.Y.Z] - date`), merge, push tag `vX.Y.Z`. `scripts/release-notes.mjs` builds the release body from that section (`### Highlights`, Changes = Added/Changed/Removed, Fixes = Fixed/Security) plus the pull requests and contributors since the previous stable tag, and fails a stable tag without Highlights (tests: `node --test scripts/release-notes.test.mjs`); a tag with a suffix (`-rc.1`) is published as a pre-release. `.github/workflows/release.yml` checks the tag against the files, builds the signed Windows installer and a universal macOS app (ad-hoc signed, not notarized; one job at a time so `latest.json` keeps both platforms) and publishes `latest.json` for the in-app updater. Assets: `-setup.exe` and `.msi` (Windows), universal `.dmg` and `.app.tar.gz` (macOS). The signing key is the repo secret `TAURI_SIGNING_PRIVATE_KEY` (local copy `~/.tauri/emberterm.key`; the public key is in `tauri.conf.json`). See CONTRIBUTING.md.

---

## Contributing

The full rules are in CONTRIBUTING.md; the ones agents trip over:

- Commits and PR titles use Conventional Commits (`type(scope): imperative subject`). Branch off `main`, never commit to it directly.
- Open the PR with `.github/PULL_REQUEST_TEMPLATE.md` filled in: what and why, and the checks you ran.
- Add a line under `[Unreleased]` in `CHANGELOG.md` when behavior changes. The release commit moves it under the new version.
- No secrets, personal paths or machine names in commits, docs or issues. Security reports go through GitHub private reporting (SECURITY.md), never a public issue.
- `AGENTS.md` points here; keep this file the single source of project context.

---

## Dev Commands

CI (`ci.yml`) runs only on pushes to `main`. Before opening a PR, or marking a draft ready for review, run `/ci` (the checks in CONTRIBUTING.md, "Before you open a PR") and list them in the PR.

Quick bash reference:

```bash
# Install all JS deps (pnpm workspace — run from repo root)
pnpm install

# Type-check (fast, no build)
cargo check --manifest-path packages/desktop/Cargo.toml
pnpm turbo check

# Tests
cargo test --manifest-path packages/desktop/Cargo.toml
pnpm turbo test
pnpm --filter @emberterm/app test       # app tests only

# Lint
cargo clippy --manifest-path packages/desktop/Cargo.toml --all-targets -- -D warnings
cargo fmt --manifest-path packages/desktop/Cargo.toml -- --check
pnpm turbo check

# Full build (JS packages first, then Rust)
pnpm turbo build
cargo build --manifest-path packages/desktop/Cargo.toml

# Dev mode
pnpm dev      # cargo tauri dev: the desktop app with hot reload
pnpm dev:ui   # Vite dev server only (no Tauri backend)

# Versions
pnpm version:check
pnpm version:set 0.2.0
```

Custom slash commands (defined in `.claude/commands/`):
- `/check` — type-check Rust + TS/Svelte without building
- `/test [filter]` — run Rust + Vitest test suites
- `/build` — full frontend + Rust build
- `/lint` — clippy + fmt check + svelte-check
- `/ci` — everything CI runs (fmt, clippy, tests, build, version check); required before a PR or marking a draft ready

A `PostToolUse` hook (`.claude/hooks/post-edit-check.sh`) type-checks the file you just edited: `cargo check` for `.rs`, `pnpm turbo check` for `.ts` and `.svelte`; it reports only when the check fails.

### Driving the running app

To test a UI change in the real window, start the dev app with the WebView2 debug port and attach over the Chrome DevTools Protocol (a small Node script with the built-in `WebSocket` is enough):

```bash
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222 pnpm dev   # then http://127.0.0.1:9222/json
```

The installed app shares `%APPDATA%\ember` (config, profiles, `session.json`): close it and back that folder up first, and restore it afterwards. `cargo tauri dev` can also rewrite the line endings of `packages/desktop/Cargo.toml`; `git checkout` it. Keep screenshots free of your user and machine name (use a custom `PS1` and a folder under `~`).
