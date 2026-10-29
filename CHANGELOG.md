# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org).

## [Unreleased]

### Fixed

- **Terminal links open in the system browser:** Ctrl-clicking a URL in the output now goes through the opener plugin instead of the webview's own `window.open`. Only parseable `http(s)` links are handled, and a failed open raises a toast instead of failing silently. (#39)

## [1.0.0] - 2026-10-28

First stable release.

### Highlights

- **Your session comes back:** closing and reopening restores every tab, split, title and folder, and a broken config, profile or session file is set aside with a toast instead of blocking startup.
- **A shell per tab:** Git Bash, WSL, PowerShell and cmd, side by side or stacked in splits, with busy and unread marks on background tabs and a prompt before closing a running one.
- **Fast under load:** WebGL rendering, batched and acknowledged PTY output, and a status bar with the folder, git branch and changes.
- **Security review before 1.0:** the status bar's git calls, programs setting the clipboard, profile ids, the app's Content Security Policy, the updater's TLS dependency and the release pipeline were hardened. (#17, #18, #19, #20, #21, #22)
- **Update in one click:** Settings → About → Check for updates, verified against the project's signing key.

### Changed

- **Programs can no longer set the clipboard by default:** OSC 52 writes are ignored until you turn on Settings → Terminal → Let programs set the clipboard, because text from a malicious file or host could otherwise replace what you copied. tmux and vim clipboard sync over ssh needs the setting. Payloads over 100,000 bytes are always refused. (#18, #28)

### Security

- **Status bar git calls:** `git` no longer runs in a network path or a missing folder and runs with `core.fsmonitor` off and without repository locks. The folder comes from terminal output, which a program can forge. (#17, #24)
- **Profile ids:** limited to letters, digits, `-` and `_`, so an id such as `../x` can no longer write or delete files outside the profiles folder. (#19, #23)
- **Content Security Policy:** the app window now has one. (#20, #25)
- **Updater TLS:** updated `rustls-webpki` and `webpki-root-certs` (RUSTSEC-2026-0382, RUSTSEC-2026-0383). (#21, #26)
- **Release pipeline:** workflow actions are pinned to commit SHAs and Dependabot keeps them current. (#22, #27)

## [0.4.0] - 2026-10-22

### Added

- Reorder tabs by dragging, from the context menu, or with the keyboard.

### Fixed

- The status bar git branch and changes refresh when a command finishes.
- The console window no longer flashes when the status bar runs `git` on Windows.

## [0.3.0] - 2026-10-17

### Added

- A folder picker for a profile's working directory in Settings.

## [0.2.0] - 2026-10-17

### Added

- A universal macOS build in the release workflow.

### Changed

- PTY output is coalesced into batched channel sends and acknowledged by the webview, and terminals render with the xterm.js WebGL addon, so heavy output stays responsive.

## [0.1.1] - 2026-10-16

### Changed

- One version for the whole repo, checked in CI and on release.

### Fixed

- Closing a tab when its shell exits, and closing the window with the last tab.
- Settings that were not wired up, and the confirm-close prompt for running programs.
- The status bar clock now follows the system clock.

## [0.1.0] - 2026-10-16

### Added

- Tabs with their own shell (Git Bash, WSL, PowerShell, cmd), split panes, and session restore for tabs, splits, titles and folders.
- Copy, paste, a right-click menu, and find in scrollback.
- Busy and unread indicators on background tabs.
- Seven built-in themes, VS Code theme import, a font picker, a command palette and a status bar.
- Window size, position and maximized state are remembered.
- One-click updates from Settings → About.
- Config, profiles and `session.json` hot-reload; a broken file is moved aside with a toast.
