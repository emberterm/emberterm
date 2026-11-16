import type { Tab } from "./app.js";

// Mirrors packages/desktop/src/session_store.rs (snake_case on purpose: it is the file format).
export interface SavedPane { profile_id?: string; cwd?: string; history?: string[] }
export interface SavedSplit { direction: "horizontal" | "vertical"; pane: SavedPane }
export interface SavedTab { title?: string; custom_title: boolean; pane: SavedPane; split?: SavedSplit }
export interface SavedSession { version: 1; active_tab: number; tabs: SavedTab[] }

function pane(profileId?: string, cwd?: string, history?: string[]): SavedPane {
  const p: SavedPane = {};
  if (profileId) p.profile_id = profileId;
  if (cwd) p.cwd = cwd;
  if (history?.length) p.history = history;
  return p;
}

export function toSnapshot(tabs: Tab[]): SavedSession {
  const saved = tabs.map((t): SavedTab => {
    const s: SavedTab = { custom_title: t.customTitle, pane: pane(t.profileId, t.cwd, t.history) };
    if (t.customTitle) s.title = t.title;
    if (t.splitSessionId) {
      s.split = { direction: t.splitDirection ?? "horizontal", pane: pane(t.splitProfileId, t.splitCwd, t.splitHistory) };
    }
    return s;
  });
  return { version: 1, active_tab: Math.max(0, tabs.findIndex((t) => t.isActive)), tabs: saved };
}

export function clampActiveTab(s: SavedSession): number {
  return Math.min(Math.max(0, s.active_tab), Math.max(0, s.tabs.length - 1));
}
