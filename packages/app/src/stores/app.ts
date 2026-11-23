import { writable, derived, get } from "svelte/store";
import { HISTORY_MAX, appendCommand, shouldRecord } from "../utils/history.js";
import { openPath, goBack, goForward, withSize, type PreviewState } from "../preview/previewState.js";

export interface Tab {
  id: string;
  sessionId: string;
  title: string;
  shell?: string;
  profileId?: string;
  /** True once the user renamed the tab; shell titles no longer apply. */
  customTitle: boolean;
  cwd?: string;
  /** Last commands typed in the primary pane, newest last (saved with the session). */
  history?: string[];
  isActive: boolean;
  /** Output arrived while this tab was in the background and has not been viewed yet. */
  hasUnread: boolean;
  /** Output arrived in the last BUSY_MS (background tabs only). */
  isBusy: boolean;
  // Split-pane state — present only when the tab is split.
  splitSessionId?: string;
  splitDirection?: "horizontal" | "vertical";
  splitProfileId?: string;
  splitCwd?: string;
  splitHistory?: string[];
  /** The Markdown preview panel of this tab; not saved with the session. */
  preview?: PreviewState;
}

export const tabs = writable<Tab[]>([]);
export const activeTabId = writable<string | null>(null);

export const activeTab = derived(
  [tabs, activeTabId],
  ([$tabs, $activeTabId]) => $tabs.find((t) => t.id === $activeTabId) ?? null,
);

export const activeCwd = derived(
  activeTab,
  ($tab) => $tab?.cwd ?? "",
);

export const activeShell = derived(
  activeTab,
  ($tab) => $tab?.shell ?? "",
);

let tabCounter = 0;

export function addTab(sessionId: string, title: string, shell?: string, profileId?: string): string {
  const id = `tab-${++tabCounter}`;
  tabs.update((ts) => {
    const updated = ts.map((t) => ({ ...t, isActive: false }));
    return [
      ...updated,
      { id, sessionId, title, shell, profileId, customTitle: false, isActive: true, hasUnread: false, isBusy: false },
    ];
  });
  activeTabId.set(id);
  return id;
}

const BUSY_MS = 1500;
const busyTimers = new Map<string, ReturnType<typeof setTimeout>>();

function patchTab(tabId: string, patch: Partial<Pick<Tab, "isBusy" | "hasUnread">>) {
  updateTabsIfChanged((ts) => {
    let changed = false;
    const next = ts.map((t) => {
      if (t.id !== tabId) return t;
      const differs = (Object.keys(patch) as (keyof typeof patch)[]).some((k) => t[k] !== patch[k]);
      if (!differs) return t;
      changed = true;
      return { ...t, ...patch };
    });
    return changed ? next : null;
  });
}

/**
 * PTY output reached `sessionId`. For a background tab: show it as busy until the output
 * goes quiet, and (unless it is the shell's startup banner) flag it unread until viewed.
 * A stream of chunks touches the store only on the first one.
 */
export function noteOutput(sessionId: string, countsAsUnread: boolean) {
  const owner = get(tabs).find((t) => t.sessionId === sessionId || t.splitSessionId === sessionId);
  if (!owner || owner.isActive) return;
  patchTab(owner.id, countsAsUnread ? { isBusy: true, hasUnread: true } : { isBusy: true });
  clearTimeout(busyTimers.get(owner.id));
  busyTimers.set(
    owner.id,
    setTimeout(() => {
      busyTimers.delete(owner.id);
      patchTab(owner.id, { isBusy: false });
    }, BUSY_MS),
  );
}

export function removeTab(tabId: string) {
  tabs.update((ts) => {
    const idx = ts.findIndex((t) => t.id === tabId);
    const filtered = ts.filter((t) => t.id !== tabId);
    if (filtered.length === 0) return filtered;
    const nextIdx = Math.min(idx, filtered.length - 1);
    filtered[nextIdx] = { ...filtered[nextIdx], isActive: true };
    activeTabId.set(filtered[nextIdx].id);
    return filtered;
  });
}

export function activateTab(tabId: string) {
  tabs.update((ts) =>
    ts.map((t) => ({ ...t, isActive: t.id === tabId, hasUnread: t.id === tabId ? false : t.hasUnread })),
  );
  activeTabId.set(tabId);
}

/** Applies `fn` to the tab list and notifies subscribers only if it returned a new list. */
function updateTabsIfChanged(fn: (ts: Tab[]) => Tab[] | null) {
  const next = fn(get(tabs));
  if (next) tabs.set(next);
}

/** OSC 7 from either pane of a tab. */
export function setPaneCwd(sessionId: string, cwd: string) {
  updateTabsIfChanged((ts) => {
    let changed = false;
    const next = ts.map((t) => {
      if (t.sessionId === sessionId && t.cwd !== cwd) { changed = true; return { ...t, cwd }; }
      if (t.splitSessionId === sessionId && t.splitCwd !== cwd) { changed = true; return { ...t, splitCwd: cwd }; }
      return t;
    });
    return changed ? next : null;
  });
}

// Shells re-send the title on every prompt; an unchanged title must not touch the store.
export function setTabTitle(sessionId: string, title: string) {
  updateTabsIfChanged((ts) => {
    let changed = false;
    const next = ts.map((t) => {
      if (t.sessionId !== sessionId || t.customTitle || t.title === title) return t;
      changed = true;
      return { ...t, title };
    });
    return changed ? next : null;
  });
}

export function renameTab(tabId: string, newTitle: string) {
  const trimmed = newTitle.trim();
  if (!trimmed) return;
  tabs.update((ts) => ts.map((t) => (t.id === tabId ? { ...t, title: trimmed, customTitle: true } : t)));
}

export function restoreCustomTitle(tabId: string, title: string) {
  renameTab(tabId, title);
}

// ── Split pane helpers ────────────────────────────────────────────────────────

/** Record the secondary session on a split tab. */
export function setTabSplit(
  tabId: string,
  splitSessionId: string,
  direction: "horizontal" | "vertical",
  splitProfileId?: string,
) {
  tabs.update((ts) =>
    ts.map((t) =>
      t.id === tabId ? { ...t, splitSessionId, splitDirection: direction, splitProfileId } : t,
    ),
  );
}

/** Move a tab to a new position in the tab strip by reordering around a target tab. */
/** Move a tab so it ends up at `toIndex` in the resulting list (clamped to the ends). */
export function moveTab(tabId: string, toIndex: number) {
  tabs.update((ts) => {
    const fromIdx = ts.findIndex((t) => t.id === tabId);
    if (fromIdx < 0) return ts;
    const target = Math.max(0, Math.min(toIndex, ts.length - 1));
    if (target === fromIdx) return ts;
    const result = [...ts];
    const [moved] = result.splice(fromIdx, 1);
    result.splice(target, 0, moved);
    return result;
  });
}

/** A command reported by either pane of a tab (OSC 133;E); filtered, capped and de-duplicated. */
export function pushPaneCommand(sessionId: string, cmd: string) {
  if (!shouldRecord(cmd)) return;
  updateTabsIfChanged((ts) => {
    let changed = false;
    const next = ts.map((t) => {
      // A repeat of the pane's last command is the only case appendCommand leaves unchanged.
      if (t.sessionId === sessionId && t.history?.at(-1) !== cmd) {
        changed = true;
        return { ...t, history: appendCommand(t.history ?? [], cmd) };
      }
      if (t.splitSessionId === sessionId && t.splitHistory?.at(-1) !== cmd) {
        changed = true;
        return { ...t, splitHistory: appendCommand(t.splitHistory ?? [], cmd) };
      }
      return t;
    });
    return changed ? next : null;
  });
}

/** Puts a restored tab's saved commands back in the store so the next autosave keeps them. */
export function restoreTabHistory(tabId: string, history?: string[], splitHistory?: string[]) {
  tabs.update((ts) =>
    ts.map((t) =>
      t.id === tabId
        ? { ...t, history: history?.slice(-HISTORY_MAX), splitHistory: splitHistory?.slice(-HISTORY_MAX) }
        : t,
    ),
  );
}

/** Remove the split — the secondary session has already been closed by the caller. */
export function clearTabSplit(tabId: string) {
  tabs.update((ts) =>
    ts.map((t) =>
      t.id === tabId
        ? { ...t, splitSessionId: undefined, splitDirection: undefined, splitProfileId: undefined, splitCwd: undefined, splitHistory: undefined }
        : t,
    ),
  );
}

// ── Markdown preview ──────────────────────────────────────────────────────────

/** Applies `fn` to one tab's preview; nothing is published when it returns the same value. */
function patchPreview(tabId: string, fn: (p?: PreviewState) => PreviewState | undefined) {
  updateTabsIfChanged((ts) => {
    let changed = false;
    const next = ts.map((t) => {
      if (t.id !== tabId) return t;
      const preview = fn(t.preview);
      if (preview === t.preview) return t;
      changed = true;
      return { ...t, preview };
    });
    return changed ? next : null;
  });
}

export const openPreview = (tabId: string, path: string) => patchPreview(tabId, (p) => openPath(p, path));
export const closePreview = (tabId: string) => patchPreview(tabId, () => undefined);
export const previewBack = (tabId: string) => patchPreview(tabId, (p) => (p ? goBack(p) : p));
export const previewForward = (tabId: string) => patchPreview(tabId, (p) => (p ? goForward(p) : p));
export const setPreviewSize = (tabId: string, size: number) =>
  patchPreview(tabId, (p) => (p && p.size !== size ? withSize(p, size) : p));

/** The tab, profile and folder behind a pane's session id (primary or split); null if unknown. */
export function paneContext(sessionId: string): { tabId: string; profileId?: string; cwd?: string } | null {
  const t = get(tabs).find((x) => x.sessionId === sessionId || x.splitSessionId === sessionId);
  if (!t) return null;
  return t.sessionId === sessionId
    ? { tabId: t.id, profileId: t.profileId, cwd: t.cwd }
    : { tabId: t.id, profileId: t.splitProfileId, cwd: t.splitCwd };
}

// ── Toasts ────────────────────────────────────────────────────────────────────
export interface Toast {
  id: number;
  message: string;
}

export const toasts = writable<Toast[]>([]);
let toastCounter = 0;

export function pushToast(message: string, ttlMs = 8000): number {
  const id = ++toastCounter;
  toasts.update((ts) => [...ts, { id, message }]);
  setTimeout(() => dismissToast(id), ttlMs);
  return id;
}

export function dismissToast(id: number) {
  toasts.update((ts) => ts.filter((t) => t.id !== id));
}
