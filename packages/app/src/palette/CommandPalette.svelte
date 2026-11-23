<script lang="ts">
  import { allThemes, setTheme } from "../theme/store.js";
  import type { Profile } from "../ipc/client.js";

  interface Props {
    open: boolean;
    onClose: () => void;
    onNewTab?: (profileId?: string) => void;
    onSplit?: (direction: "horizontal" | "vertical", profileId?: string) => void;
    onOpenSettings?: () => void;
    onPreviewFile?: () => void;
    profiles?: Profile[];
    defaultProfileId?: string;
  }

  let {
    open, onClose, onNewTab, onSplit, onOpenSettings, onPreviewFile,
    profiles = [], defaultProfileId = "",
  }: Props = $props();

  interface PaletteItem {
    id: string;
    label: string;
    section: string;
    kind: "command" | "profile" | "theme";
    shortcut?: string;
    badge?: string;
    action: () => void;
  }

  let query = $state("");
  let selectedIdx = $state(0);
  let inputEl = $state<HTMLInputElement | undefined>(undefined);

  // Track the last 3 executed item IDs for the Recent section.
  let recentIds = $state<string[]>([]);

  function activate(item: PaletteItem) {
    recentIds = [item.id, ...recentIds.filter((id) => id !== item.id)].slice(0, 3);
    item.action();
  }

  function buildBaseItems(): PaletteItem[] {
    const defaultProfile = profiles.find((p) => p.id === defaultProfileId) ?? profiles[0];
    const defaultProfileName = defaultProfile?.name ?? "Shell";

    const items: PaletteItem[] = [
      {
        id: "tab.new",
        label: `New tab: ${defaultProfileName}`,
        section: "Commands",
        kind: "command",
        shortcut: "Ctrl+Shift+T",
        action: () => { onNewTab?.(); onClose(); },
      },
      {
        id: "preview.file",
        label: "Preview Markdown file…",
        section: "Commands",
        kind: "command",
        shortcut: "Ctrl+Shift+M",
        action: () => { onPreviewFile?.(); onClose(); },
      },
      {
        id: "settings.open",
        label: "Open Settings",
        section: "Commands",
        kind: "command",
        shortcut: "Ctrl+,",
        action: () => { onOpenSettings?.(); onClose(); },
      },
    ];

    for (const profile of profiles) {
      items.push({
        id: `profile.${profile.id}`,
        label: profile.name,
        section: "Profiles",
        kind: "profile",
        badge: profile.id === defaultProfileId ? "default" : undefined,
        action: () => { onNewTab?.(profile.id); onClose(); },
      });
    }

    // Splitting needs a choice of shell too; the keyboard shortcuts always use the default one.
    for (const [direction, verb] of [["horizontal", "side by side"], ["vertical", "stacked"]] as const) {
      for (const profile of profiles) {
        items.push({
          id: `split.${direction}.${profile.id}`,
          label: `Split ${verb}: ${profile.name}`,
          section: "Split pane",
          kind: "command",
          action: () => { onSplit?.(direction, profile.id); onClose(); },
        });
      }
    }

    for (const theme of $allThemes) {
      items.push({
        id: `theme.${theme.id}`,
        label: theme.name,
        section: "Themes",
        kind: "theme",
        badge: theme.kind === "dark" ? "dark" : "light",
        action: () => { setTheme(theme.id); onClose(); },
      });
    }

    return items;
  }

  const baseItems = $derived(buildBaseItems());

  function fuzzyMatch(text: string, q: string): boolean {
    if (!q) return true;
    const tl = text.toLowerCase();
    const ql = q.toLowerCase();
    let ti = 0;
    for (let qi = 0; qi < ql.length; qi++) {
      const idx = tl.indexOf(ql[qi], ti);
      if (idx < 0) return false;
      ti = idx + 1;
    }
    return true;
  }

  const filtered = $derived.by(() => {
    if (!query) return baseItems;
    return baseItems.filter((i) => fuzzyMatch(i.label, query));
  });

  // Build sections: Recent (only when no query), then the rest grouped.
  const sections = $derived.by(() => {
    const result: { label: string; items: PaletteItem[] }[] = [];

    if (!query && recentIds.length > 0) {
      const recentItems = recentIds
        .map((id) => baseItems.find((i) => i.id === id))
        .filter((i): i is PaletteItem => !!i);
      if (recentItems.length) result.push({ label: "Recent", items: recentItems });
    }

    const map = new Map<string, PaletteItem[]>();
    for (const item of filtered) {
      const list = map.get(item.section) ?? [];
      list.push(item);
      map.set(item.section, list);
    }
    for (const [label, items] of map) {
      result.push({ label, items });
    }

    return result;
  });

  // Flat list for keyboard navigation.
  const flatItems = $derived(sections.flatMap((s) => s.items));

  $effect(() => {
    if (open) {
      query = "";
      selectedIdx = 0;
      requestAnimationFrame(() => inputEl?.focus());
    }
  });

  // Keep selectedIdx in bounds when filtered list shrinks.
  $effect(() => {
    if (selectedIdx >= flatItems.length) selectedIdx = Math.max(0, flatItems.length - 1);
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); selectedIdx = Math.min(selectedIdx + 1, flatItems.length - 1); }
    if (e.key === "ArrowUp")   { e.preventDefault(); selectedIdx = Math.max(selectedIdx - 1, 0); }
    if (e.key === "Enter" && flatItems[selectedIdx]) { activate(flatItems[selectedIdx]); return; }
    if (e.key === "Tab") {
      e.preventDefault();
      selectedIdx = e.shiftKey
        ? Math.max(selectedIdx - 1, 0)
        : Math.min(selectedIdx + 1, flatItems.length - 1);
    }
  }

  function itemFlatIndex(sectionIdx: number, itemIdx: number): number {
    let n = 0;
    for (let s = 0; s < sectionIdx; s++) n += sections[s].items.length;
    return n + itemIdx;
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="palette-overlay" onclick={onClose}>
    <div
      class="palette"
      role="dialog"
      tabindex="-1"
      aria-label="Command palette"
      aria-modal="true"
      onclick={(e) => e.stopPropagation()}
      onkeydown={handleKeydown}
    >
      <!-- Search row -->
      <div class="search-row">
        <svg class="search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          bind:this={inputEl}
          bind:value={query}
          class="palette-input"
          placeholder="Type a command, profile, or theme..."
          autocomplete="off"
          spellcheck={false}
        />
        <kbd class="esc-badge" onclick={onClose}>Esc</kbd>
      </div>

      <!-- Results -->
      <div class="palette-list" role="listbox">
        {#each sections as section, si}
          <div class="section-header">{section.label}</div>
          {#each section.items as item, ii (item.id)}
            {@const flatIdx = itemFlatIndex(si, ii)}
            {@const isSelected = flatIdx === selectedIdx}
            <button
              class="palette-item"
              class:selected={isSelected}
              role="option"
              aria-selected={isSelected}
              onclick={() => activate(item)}
              onmouseenter={() => (selectedIdx = flatIdx)}
            >
              <!-- Left icon -->
              <span
                class="item-icon"
                class:item-icon--accent={item.id === "tab.new"}
                aria-hidden="true"
              >
                {#if item.id === "tab.new"}
                  <!-- Plus / new tab -->
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                {:else if item.kind === "profile"}
                  <!-- Terminal prompt -->
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="4 17 10 11 4 5"/>
                    <line x1="12" y1="19" x2="20" y2="19"/>
                  </svg>
                {:else if item.kind === "theme"}
                  <!-- Sun / color swatch -->
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="4"/>
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
                  </svg>
                {:else if item.id === "settings.open"}
                  <!-- Gear -->
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                {:else}
                  <!-- Generic command chevron -->
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                {/if}
              </span>

              <!-- Label -->
              <span class="item-label">{item.label}</span>

              <!-- Right side: badge or shortcut -->
              <span class="item-right">
                {#if item.badge}
                  <span class="item-badge">{item.badge}</span>
                {/if}
                {#if item.shortcut}
                  <span class="item-shortcut">{item.shortcut}</span>
                {/if}
              </span>
            </button>
          {/each}
        {/each}
        {#if flatItems.length === 0}
          <div class="palette-empty">No results for "{query}"</div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .palette-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 72px;
    z-index: 1000;
    animation: fade-in 100ms ease;
  }
  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

  .palette {
    width: 580px;
    max-width: calc(100vw - 32px);
    background: var(--bg-elev-2, #161b22);
    border: 1px solid var(--border, #30363d);
    border-radius: 10px;
    box-shadow: 0 32px 80px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255,255,255,0.04);
    overflow: hidden;
    outline: none;
    animation: slide-down 200ms cubic-bezier(.2,.8,.2,1);
  }
  @keyframes slide-down {
    from { opacity: 0; transform: translateY(-8px) scale(0.985); }
    to   { opacity: 1; transform: none; }
  }

  /* ── Search row ─────────────────────────────────────── */
  .search-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 14px;
    border-bottom: 1px solid var(--border, #21262d);
  }

  .search-icon {
    flex-shrink: 0;
    color: var(--fg-muted, #7d8590);
  }

  .palette-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    color: var(--fg, #e6edf3);
    font-size: 13.5px;
    outline: none;
    line-height: 1.4;
  }
  .palette-input::placeholder { color: var(--fg-muted, #7d8590); }

  .esc-badge {
    flex-shrink: 0;
    padding: 2px 7px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    font-family: inherit;
    font-size: 11px;
    color: var(--fg-muted, #7d8590);
    cursor: pointer;
    line-height: 1.6;
    user-select: none;
  }
  .esc-badge:hover { background: rgba(255,255,255,0.1); color: var(--fg, #e6edf3); }

  /* ── List ───────────────────────────────────────────── */
  .palette-list {
    max-height: 380px;
    overflow-y: auto;
    padding: 4px 0 8px;
    scrollbar-width: thin;
    scrollbar-color: var(--border, #30363d) transparent;
  }

  .section-header {
    padding: 10px 14px 3px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.09em;
    color: var(--fg-muted, #7d8590);
    opacity: 0.5;
  }

  /* ── Items ──────────────────────────────────────────── */
  .palette-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 7px 14px;
    background: transparent;
    border: none;
    color: var(--fg, #e6edf3);
    cursor: pointer;
    text-align: left;
    font-size: 13px;
    line-height: 1.4;
    border-radius: 0;
  }
  .palette-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }
  .palette-item.selected {
    background: rgba(var(--accent-rgb, 255, 107, 53), 0.12);
  }

  /* ── Item icon ──────────────────────────────────────── */
  .item-icon {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 5px;
    background: rgba(255,255,255,0.06);
    color: var(--fg-muted, #7d8590);
  }
  .item-icon--accent {
    background: rgba(var(--accent-rgb, 255, 107, 53), 0.2);
    color: var(--accent, #FF6B35);
  }

  /* ── Label ──────────────────────────────────────────── */
  .item-label { flex: 1; }

  /* ── Right side ─────────────────────────────────────── */
  .item-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .item-badge {
    font-size: 11px;
    color: var(--fg-dim, #484f58);
  }

  .item-shortcut {
    font-size: 11px;
    color: var(--fg-dim, #484f58);
    font-variant-numeric: tabular-nums;
  }

  .palette-empty {
    padding: 20px 16px;
    text-align: center;
    color: var(--fg-muted, #7d8590);
    font-size: 13px;
  }
</style>
