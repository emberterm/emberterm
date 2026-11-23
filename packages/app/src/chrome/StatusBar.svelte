<script lang="ts">
  import { formatClock, msUntilNextMinute } from "../utils/clock.js";
  interface Props {
    shell?: string;
    cwd?: string;
    gitBranch?: string;
    gitDirty?: boolean;
    gitInsertions?: number;
    gitDeletions?: number;
    termCols?: number;
    termRows?: number;
    /** The open Markdown preview, e.g. "README.md · 4 KB"; empty when there is none. */
    previewLabel?: string;
    onOpenPalette?: () => void;
  }

  let { shell = "", cwd = "", gitBranch = "", gitDirty = false, gitInsertions = 0, gitDeletions = 0, termCols = 0, termRows = 0, previewLabel = "", onOpenPalette }: Props = $props();

  function shortenCwd(path: string): string {
    if (!path) return "~";
    // Windows: C:\Users\name  or  C:/Users/name
    const winHome = path.match(/^[A-Za-z][:/\\][Uu]sers[/\\][^/\\]+/);
    if (winHome) return "~" + path.slice(winHome[0].length).replace(/\\/g, "/");
    // macOS / Linux: /Users/name  or  /home/name
    const unixHome = path.match(/^\/(?:Users|home)\/[^/]+/);
    if (unixHome) return "~" + path.slice(unixHome[0].length);
    // MINGW: /c/Users/name
    const mingwHome = path.match(/^\/[a-z]\/[Uu]sers\/[^/]+/);
    if (mingwHome) return "~" + path.slice(mingwHome[0].length);
    return path;
  }

  let clock = $state("");

  $effect(() => {
    let timer: ReturnType<typeof setTimeout>;

    // Re-arm for the next minute boundary rather than a fixed 60 s from startup, which left
    // the display up to a minute behind the system clock.
    function tick() {
      clock = formatClock(new Date());
      clearTimeout(timer);
      timer = setTimeout(tick, msUntilNextMinute(new Date()) + 50);
    }

    // Timers are throttled while the window is hidden and stop during sleep; catch up on return.
    const resync = () => { if (!document.hidden) tick(); };

    tick();
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("focus", resync);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("focus", resync);
    };
  });

  const hasShell = $derived(!!shell);
  const hasCwd = $derived(!!cwd);
  const hasGit = $derived(!!gitBranch);
  const hasSize = $derived(termCols > 0 && termRows > 0);
</script>

<footer class="status-bar">
  <!-- Left items: shell · cwd · git -->
  {#if hasShell}
    <span class="status-item status-shell">
      <!-- shell/terminal icon -->
      <svg class="status-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <polyline points="4 17 10 11 4 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <line x1="12" y1="19" x2="20" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      {shell}
    </span>
  {/if}

  {#if hasCwd}
    <span class="status-item status-cwd" class:first-item={!hasShell}>
      <!-- folder/cwd icon -->
      <svg class="status-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 7l9-4 9 4M3 7v10l9 4 9-4V7M3 7l9 4 9-4M12 11v10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      {shortenCwd(cwd)}
    </span>
  {/if}

  {#if hasGit}
    <span class="status-item status-git" class:first-item={!hasShell && !hasCwd}>
      <!-- git branch icon -->
      <svg class="status-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="6" cy="6" r="3" stroke="currentColor" stroke-width="2"/>
        <circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="2"/>
        <circle cx="18" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
        <path d="M6 9v6M18 9c-3 0-6-1-6-3M18 15c-3 0-6 1-6 3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <span class="git-branch">{gitBranch}{gitDirty ? " *" : ""}</span>
      {#if gitInsertions > 0 || gitDeletions > 0}
        <span class="git-diff">
          {#if gitInsertions > 0}<span class="git-ins">+{gitInsertions}</span>{/if}
          {#if gitDeletions > 0}<span class="git-del">−{gitDeletions}</span>{/if}
        </span>
      {/if}
    </span>
  {/if}

  <span class="status-spacer"></span>

  <!-- Right items: preview · size · encoding · hint · clock -->
  {#if previewLabel}
    <span class="status-item status-preview">Preview: {previewLabel}</span>
  {/if}
  {#if hasSize}
    <span class="status-item status-size">{termCols}×{termRows}</span>
  {/if}

  <span class="status-item status-enc">
    <span class="c-dim">UTF-8 · LF</span>
  </span>

  <button class="status-item status-hint clickable" onclick={onOpenPalette} aria-label="Open command palette (Ctrl+Shift+P)">
    <svg class="status-icon" width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
      <line x1="21" y1="21" x2="16.65" y2="16.65" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
    <span>Ctrl+Shift+P</span>
  </button>

  {#if clock}
    <span class="status-item status-clock" aria-label="Current time">{clock}</span>
  {/if}
</footer>

<style>
  .status-bar {
    position: relative;
    z-index: 100;
    display: flex;
    align-items: center;
    height: 26px;
    padding: 0 12px;
    background: var(--bg-elev, #010409);
    border-top: 1px solid var(--border, #21262d);
    font-size: 11.5px;
    color: var(--fg-muted, #7d8590);
    flex-shrink: 0;
    overflow: hidden;
    font-family: var(--sans, system-ui, sans-serif);
  }

  /* Each item: flex row, vertically centered, with left border as separator */
  .status-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    height: 100%;
    white-space: nowrap;
    border-left: 1px solid var(--border-subtle, #1a1f27);
  }

  /* First item on each side has no left border */
  .status-item:first-child,
  .status-item.first-item {
    border-left: none;
  }

  /* Spacer pushes right items to the right; items after it reset border */
  .status-spacer { flex: 1; min-width: 8px; }

  /* Items after spacer (right side) — first right item should have no extra border */
  .status-spacer + .status-item {
    border-left: none;
  }

  /* Clickable items — reset button element defaults */
  button.status-item {
    background: transparent;
    border: none;
    font: inherit;
    color: inherit;
  }

  .clickable {
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }

  .clickable:hover {
    background: rgba(255, 255, 255, 0.04);
    color: var(--fg, #e6edf3);
  }

  .status-icon {
    opacity: 0.7;
    flex-shrink: 0;
  }

  /* Dim helper */
  .c-dim {
    color: var(--fg-dim, #484f58);
  }

  /* Clock */
  .status-clock {
    font-variant-numeric: tabular-nums;
  }

  /* Git branch / diff */
  .git-branch { font-variant-numeric: tabular-nums; }
  .git-diff { display: flex; align-items: center; gap: 5px; font-size: 10.5px; }
  .git-ins { color: var(--green, #3fb950); }
  .git-del { color: var(--red,   #f85149); }
</style>
