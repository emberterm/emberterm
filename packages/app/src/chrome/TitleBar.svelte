<script lang="ts">
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import TabStrip from "./TabStrip.svelte";
  import type { Profile } from "../ipc/client.js";

  interface Props {
    onNewTab: (profileId?: string) => void;
    onCloseTab: (tabId: string, sessionId: string) => void;
    onDuplicateTab: (tabId: string) => void;
    onOpenSettings: () => void;
    profiles?: Profile[];
    defaultProfileId?: string;
  }

  let { onNewTab, onCloseTab, onDuplicateTab, onOpenSettings, profiles = [], defaultProfileId = "" }: Props = $props();

  const win = getCurrentWindow();

  async function minimize() { await win.minimize(); }
  async function toggleMaximize() { await win.toggleMaximize(); }
  async function close() { await win.close(); }

  // Anything the user can click, type in or drag-reorder must not start a window drag: on
  // Windows startDragging() enters the native move loop on mousedown and swallows the
  // mouseup, so a tab press would never become a click.
  const INTERACTIVE = "button, input, [role='tab'], [role='button']";

  /**
   * Initiate window drag on left-button press over non-interactive areas.
   * Using startDragging() instead of data-tauri-drag-region because
   * data-tauri-drag-region on an absolute overlay (z-index 0) is blocked by
   * the flex items sitting above it at z-index 1.
   */
  function handleMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    if ((e.target as Element).closest(INTERACTIVE)) return;
    win.startDragging().catch(() => {});
  }

  /** Maximize/restore on double-click outside buttons. */
  function handleDblClick(e: MouseEvent) {
    if ((e.target as Element).closest(INTERACTIVE)) return;
    toggleMaximize();
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<header
  class="title-bar"
  onmousedown={handleMouseDown}
  ondblclick={handleDblClick}
>
  <!-- Branding -->
  <div class="title-brand">
    <svg class="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5 C 13 6, 16 7, 16.5 11 C 17 14.5, 14.8 17, 12 17 C 9.2 17, 7 14.5, 7.5 11 C 8 7.5, 12 7, 12 2.5 Z" fill="currentColor" opacity="0.95"/>
      <path d="M12 8.5 C 12.5 10.5, 14 11.2, 14 13.2 C 14 14.8, 13 16, 12 16 C 11 16, 10 14.8, 10 13.2 C 10 11.2, 11.5 11, 12 8.5 Z" fill="#fff" opacity="0.55"/>
    </svg>
    <span class="brand-name">Ember</span>
  </div>

  <!-- Tabs (new-tab button lives inside TabStrip) -->
  <div class="tab-area">
    <TabStrip {onNewTab} {onCloseTab} {onDuplicateTab} {profiles} {defaultProfileId} />
  </div>

  <!-- Spacer -->
  <div class="titlebar-spacer"></div>

  <!-- Settings button -->
  <button class="titlebar-btn" aria-label="Settings" onclick={onOpenSettings}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  </button>

  <!-- Window controls -->
  <div class="win-controls">
    <button class="win-btn" aria-label="Minimize" onclick={minimize}>
      <svg width="10" height="1" viewBox="0 0 10 1" aria-hidden="true">
        <line x1="0" y1="0.5" x2="10" y2="0.5" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </button>
    <button class="win-btn" aria-label="Maximize" onclick={toggleMaximize}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <rect x="0.75" y="0.75" width="8.5" height="8.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </button>
    <button class="win-btn win-close" aria-label="Close" onclick={close}>
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
        <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" stroke-width="1.5"/>
        <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" stroke-width="1.5"/>
      </svg>
    </button>
  </div>
</header>

<style>
  .title-bar {
    z-index: 100;
    display: flex;
    align-items: stretch;
    height: 36px;
    background: var(--bg-elev, #010409);
    /* Drawn behind the tabs, so the active tab can cover it and join the pane below. */
    box-shadow: inset 0 -1px 0 var(--border, #21262d);
    flex-shrink: 0;
    user-select: none;
  }

  /* ── Branding ─────────────────────────────── */
  .title-brand {
    display: flex;
    align-items: center;
    gap: 6px;
    /* The tab strip starts 6px down, so tab text centres in the lower 30px; match it. */
    padding: 6px 14px 0 12px;
    flex-shrink: 0;
  }

  .brand-mark {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    color: var(--accent, #FF6B35);
    filter: drop-shadow(0 0 6px var(--accent-glow, rgba(255,107,53,0.35)));
  }

  .brand-name {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--fg-muted, #7d8590);
  }

  /* ── Tab area ─────────────────────────────── */
  .tab-area {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    display: flex;
    align-items: stretch;
  }

  /* ── Spacer ───────────────────────────────── */
  .titlebar-spacer {
    flex: 0 1 auto;
    min-width: 8px;
  }

  /* ── Settings button ─────────────────────── */
  .titlebar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 100%;
    background: transparent;
    border: none;
    color: var(--fg-muted, #7d8590);
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.1s, color 0.1s;
  }

  .titlebar-btn:hover {
    background: rgba(255, 255, 255, 0.07);
    color: var(--fg, #e6edf3);
  }

  /* ── Window controls ──────────────────────── */
  .win-controls {
    display: flex;
    align-items: stretch;
    flex-shrink: 0;
  }

  .win-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    height: 100%;
    background: transparent;
    border: none;
    color: var(--fg-muted, #7d8590);
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }

  .win-btn:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--fg, #e6edf3);
  }

  .win-close:hover {
    background: #c42b1c;
    color: white;
  }
</style>
