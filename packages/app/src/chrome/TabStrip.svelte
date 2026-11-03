<script lang="ts">
  import { tabs, activateTab, renameTab, moveTab, type Tab } from "../stores/app.js";
  import { tabLabels } from "../utils/tabLabel.js";
  import { dropSide, dropIndex, type DropSide } from "./tabDrop.js";
  import ProfileMenu from "./ProfileMenu.svelte";
  import TabMenu from "./TabMenu.svelte";
  import type { Profile } from "../ipc/client.js";

  interface Props {
    onNewTab: (profileId?: string) => void;
    onCloseTab: (tabId: string, sessionId: string) => void;
    onDuplicateTab: (tabId: string) => void;
    profiles?: Profile[];
    defaultProfileId?: string;
  }

  let { onNewTab, onCloseTab, onDuplicateTab, profiles = [], defaultProfileId = "" }: Props = $props();

  // Display text per tab (last folder, or the program's / user's title).
  const labels = $derived(tabLabels($tabs));
  const labelOf = (tab: Tab) => labels.get(tab.id) ?? tab.title;

  // Inline rename state
  let renamingTabId = $state<string | null>(null);
  let renameValue = $state("");

  // Shell icon type
  type IconKey = "pwsh" | "bash" | "default";

  function shellIcon(tab: Tab): IconKey {
    const s = (tab.shell ?? "").toLowerCase();
    if (s.includes("pwsh") || s.includes("powershell")) return "pwsh";
    if (s.includes("bash") || s.includes("zsh") || s.includes("sh")) return "bash";
    return "default";
  }

  // Inline SVG strings for tab shell icons (12×12 viewBox="0 0 24 24")
  const ICONS: Record<IconKey, string> = {
    pwsh: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><polyline points="4 17 10 11 4 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="19" x2="20" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    bash: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="2"/><path d="M7 9l3 3-3 3M13 15h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    default: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><polyline points="4 17 10 11 4 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="19" x2="20" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  };

  function startRename(tab: Tab, e: MouseEvent) {
    e.stopPropagation();
    renamingTabId = tab.id;
    renameValue = labelOf(tab);
  }

  function commitRename() {
    if (renamingTabId) {
      renameTab(renamingTabId, renameValue);
      renamingTabId = null;
    }
  }

  function cancelRename() {
    renamingTabId = null;
  }

  function handleRenameKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); commitRename(); }
    if (e.key === "Escape") { e.preventDefault(); cancelRename(); }
  }

  function handleRenameMount(node: HTMLInputElement) {
    node.select();
  }

  function handleTabKeydown(e: KeyboardEvent, tab: Tab) {
    if (e.key === "Enter" || e.key === " ") activateTab(tab.id);
  }

  function handleCloseKeydown(e: KeyboardEvent, tab: Tab) {
    if (e.key === "Enter") {
      e.stopPropagation();
      onCloseTab(tab.id, tab.sessionId);
    }
  }

  // ── Drag-to-reorder ────────────────────────────────────────────────────────
  let dragTabId = $state<string | null>(null);
  let dropTarget = $state<{ id: string; side: DropSide } | null>(null);

  function onDragStart(e: DragEvent, tabId: string) {
    dragTabId = tabId;
    e.dataTransfer!.effectAllowed = "move";
    // Firefox-family engines refuse to start a drag without data; WebView2 does not care.
    e.dataTransfer!.setData("text/plain", tabId);
  }
  function onDragOver(e: DragEvent, tabId: string) {
    if (!dragTabId) return;
    e.preventDefault();
    const side = dropSide(e.clientX, (e.currentTarget as HTMLElement).getBoundingClientRect());
    if (dropTarget?.id !== tabId || dropTarget.side !== side) dropTarget = { id: tabId, side };
  }
  function onDragEnd() { dragTabId = null; dropTarget = null; }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    const list = $tabs;
    const from = list.findIndex((t) => t.id === dragTabId);
    const over = list.findIndex((t) => t.id === dropTarget?.id);
    if (dragTabId && dropTarget && from >= 0 && over >= 0) moveTab(dragTabId, dropIndex(from, over, dropTarget.side));
    onDragEnd();
  }

  // ── Move via right-click menu ──────────────────────────────────────────────
  let menu = $state<{ tabId: string; x: number; y: number } | null>(null);
  const menuIdx = $derived(menu ? $tabs.findIndex((t) => t.id === menu!.tabId) : -1);

  function openMenu(e: MouseEvent, tabId: string) {
    e.preventDefault();
    menu = { tabId, x: e.clientX, y: e.clientY };
  }
  function moveMenuTab(to: (i: number) => number) {
    if (menu && menuIdx >= 0) moveTab(menu.tabId, to(menuIdx));
  }

  // Background tabs only: green pulse while output is flowing, blue once it has gone quiet
  // but has not been looked at yet.
  function showBusyDot(tab: Tab) { return tab.isBusy && !tab.isActive; }
  function showUnreadDot(tab: Tab) { return tab.hasUnread && !tab.isActive; }
</script>

<div class="tab-strip">
  {#each $tabs as tab (tab.id)}
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div
      class="tab"
      class:active={tab.isActive}
      class:dragging={dragTabId === tab.id}
      class:drop-before={dragTabId !== tab.id && dropTarget?.id === tab.id && dropTarget.side === "before"}
      class:drop-after={dragTabId !== tab.id && dropTarget?.id === tab.id && dropTarget.side === "after"}
      role="tab"
      tabindex="0"
      aria-selected={tab.isActive}
      draggable="true"
      onclick={() => activateTab(tab.id)}
      onkeydown={(e) => handleTabKeydown(e, tab)}
      onmousedown={(e) => e.button === 1 && onCloseTab(tab.id, tab.sessionId)}
      ondblclick={(e) => startRename(tab, e)}
      ondragstart={(e) => onDragStart(e, tab.id)}
      ondragover={(e) => onDragOver(e, tab.id)}
      ondrop={onDrop}
      ondragend={onDragEnd}
      oncontextmenu={(e) => openMenu(e, tab.id)}
    >
      <!-- Top accent bar for active tab (rendered via ::after in CSS) -->

      <!-- Shell icon -->
      <span
        class="tab-icon"
        class:icon-active={tab.isActive}
        aria-hidden="true"
      >
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html ICONS[shellIcon(tab)]}
      </span>

      <!-- Title or rename input -->
      {#if renamingTabId === tab.id}
        <!-- svelte-ignore a11y_autofocus -->
        <input
          class="tab-rename-input"
          type="text"
          bind:value={renameValue}
          onblur={commitRename}
          onkeydown={handleRenameKeydown}
          onclick={(e) => e.stopPropagation()}
          use:handleRenameMount
          autofocus
        />
      {:else}
        <span class="tab-title" title={tab.cwd ? `${tab.title} — ${tab.cwd}` : tab.title}>{labelOf(tab)}</span>
      {/if}

      <!-- Status dot -->
      {#if showBusyDot(tab)}
        <span class="tab-dot busy-dot" aria-hidden="true"></span>
      {:else if showUnreadDot(tab)}
        <span class="tab-dot unread-dot" aria-hidden="true"></span>
      {/if}

      <!-- Close button -->
      <span
        class="tab-close"
        role="button"
        tabindex="0"
        aria-label="Close tab"
        onclick={(e) => { e.stopPropagation(); onCloseTab(tab.id, tab.sessionId); }}
        onkeydown={(e) => handleCloseKeydown(e, tab)}
      >
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
        </svg>
      </span>
    </div>
  {/each}

  <button class="tab-add" aria-label="New tab" onclick={() => onNewTab()}>
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
      <line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    </svg>
  </button>
  <ProfileMenu {profiles} {defaultProfileId} onPick={(id) => onNewTab(id)} />
</div>

{#if menu}
  <TabMenu
    x={menu.x}
    y={menu.y}
    atStart={menuIdx <= 0}
    atEnd={menuIdx >= $tabs.length - 1}
    onDuplicate={() => menu && onDuplicateTab(menu.tabId)}
    onMoveLeft={() => moveMenuTab((i) => i - 1)}
    onMoveRight={() => moveMenuTab((i) => i + 1)}
    onMoveStart={() => moveMenuTab(() => 0)}
    onMoveEnd={() => moveMenuTab(() => $tabs.length - 1)}
    onClose={() => (menu = null)}
  />
{/if}

<style>
  .tab-strip {
    display: flex;
    align-items: flex-end;
    flex: 1;
    min-width: 0;
    padding-top: 6px;
    overflow: hidden;
    -webkit-app-region: no-drag;
    height: 100%;
  }

  .tab {
    position: relative;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 8px 0 10px;
    height: 30px;
    background: transparent;
    border: none;
    border-radius: 8px 8px 0 0;
    color: var(--tab-inactive-fg, #7d8590);
    cursor: pointer;
    white-space: nowrap;
    font-size: 12px;
    transition: color 0.1s, background 0.1s;
    min-width: 104px;
    max-width: 220px;
    flex-shrink: 1;
    box-sizing: border-box;
  }

  /* Theme-aware tint: a fixed white overlay vanishes on light themes. */
  .tab:hover {
    background: color-mix(in srgb, var(--fg, #e6edf3) 7%, transparent);
    color: var(--tab-active-fg, #e6edf3);
  }

  /* The active tab is the terminal's own background, flush with the pane below (the title
     bar's bottom line stops behind it). Inset shadows follow the rounded corners: a 2px
     accent along the top and a hairline on each side. */
  .tab.active {
    background: var(--tab-active-bg, #0d1117);
    color: var(--tab-active-fg, #e6edf3);
    box-shadow:
      inset 0 2px 0 var(--accent, #FF6B35),
      inset 1px 0 0 var(--border, #21262d),
      inset -1px 0 0 var(--border, #21262d);
  }

  .tab.dragging {
    opacity: 0.45;
  }

  /* Drop marker on the edge the dragged tab will land beside. */
  .tab.drop-before {
    box-shadow: inset 2px 0 0 var(--accent, #FF6B35);
  }

  .tab.drop-after {
    box-shadow: inset -2px 0 0 var(--accent, #FF6B35);
  }

  /* ── Shell icon ───────────────────────────── */
  .tab-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: var(--fg-dim, #484f58);
    transition: color 0.1s;
  }

  .tab-icon.icon-active {
    color: var(--fg-muted, #7d8590);
  }

  .tab:hover .tab-icon {
    color: var(--fg-muted, #7d8590);
  }

  /* ── Title ────────────────────────────────── */
  .tab-title {
    overflow: hidden;
    text-overflow: ellipsis;
    pointer-events: none;
    flex: 1;
    min-width: 0;
  }

  /* ── Rename input ─────────────────────────── */
  .tab-rename-input {
    background: var(--bg, #0d1117);
    border: 1px solid var(--accent, #FF6B35);
    border-radius: 3px;
    color: var(--fg, #e6edf3);
    font-size: 12px;
    font-family: inherit;
    height: 20px;
    padding: 0 4px;
    flex: 1;
    min-width: 40px;
    max-width: 160px;
    outline: none;
  }

  /* ── Status dots ──────────────────────────── */
  .tab-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .unread-dot {
    background: var(--blue, #58a6ff);
  }

  .busy-dot {
    background: var(--green, #7ee787);
    animation: busy-pulse 1.4s ease-in-out infinite;
  }

  @keyframes busy-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.8); }
  }

  /* ── Close button ─────────────────────────── */
  .tab-close {
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    cursor: pointer;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.1s, background 0.1s;
    user-select: none;
    color: inherit;
  }

  .tab:hover .tab-close,
  .tab.active .tab-close {
    opacity: 1;
  }

  .tab-close:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  /* ── New-tab button ──────────────────────── */
  .tab-add {
    align-self: flex-end;
    width: 28px;
    height: 28px;
    margin: 0 0 1px 2px;
    display: grid;
    place-items: center;
    border-radius: 6px;
    background: transparent;
    border: none;
    color: var(--fg-muted, #7d8590);
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.1s, color 0.1s;
    pointer-events: auto;
    -webkit-app-region: no-drag;
  }

  .tab-add:hover {
    background: rgba(255, 255, 255, 0.05);
    color: var(--fg, #e6edf3);
  }
</style>
