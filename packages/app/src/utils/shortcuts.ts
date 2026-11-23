/** Window-level shortcuts: the single source for the key handler and the Keymap page. */
export type ShortcutAction =
  | "newTab"
  | "closeTab"
  | "nextTab"
  | "prevTab"
  | "moveTabLeft"
  | "moveTabRight"
  | "palette"
  | "settings"
  | "splitHorizontal"
  | "splitVertical"
  | "previewFile";

export interface KeyInfo {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

interface Shortcut {
  action: ShortcutAction;
  label: string;
  /** Shown as written; macOS uses Cmd in place of Ctrl. */
  keys: string;
  matches: (e: KeyInfo, mod: boolean) => boolean;
}

// Letters match on `key`; punctuation matches on the physical key (`code`) because Shift
// changes `key` there ("\" becomes "|", "-" becomes "_" on a US layout).
export const SHORTCUTS: Shortcut[] = [
  { action: "newTab", label: "New tab", keys: "Ctrl+Shift+T", matches: (e, m) => m && e.shiftKey && e.key.toLowerCase() === "t" },
  { action: "closeTab", label: "Close tab", keys: "Ctrl+Shift+W", matches: (e, m) => m && e.shiftKey && e.key.toLowerCase() === "w" },
  { action: "nextTab", label: "Next tab", keys: "Ctrl+Tab", matches: (e, m) => m && !e.shiftKey && e.key === "Tab" },
  { action: "prevTab", label: "Previous tab", keys: "Ctrl+Shift+Tab", matches: (e, m) => m && e.shiftKey && e.key === "Tab" },
  { action: "moveTabLeft", label: "Move tab left", keys: "Ctrl+Shift+PageUp", matches: (e, m) => m && e.shiftKey && e.key === "PageUp" },
  { action: "moveTabRight", label: "Move tab right", keys: "Ctrl+Shift+PageDown", matches: (e, m) => m && e.shiftKey && e.key === "PageDown" },
  { action: "splitHorizontal", label: "Split pane (side by side)", keys: "Ctrl+Shift+\\", matches: (e, m) => m && e.shiftKey && e.code === "Backslash" },
  { action: "splitVertical", label: "Split pane (stacked)", keys: "Ctrl+Shift+-", matches: (e, m) => m && e.shiftKey && e.code === "Minus" },
  { action: "previewFile", label: "Preview Markdown file", keys: "Ctrl+Shift+M", matches: (e, m) => m && e.shiftKey && e.key.toLowerCase() === "m" },
  { action: "palette", label: "Command palette", keys: "Ctrl+Shift+P", matches: (e, m) => m && e.shiftKey && e.key.toLowerCase() === "p" },
  { action: "settings", label: "Settings", keys: "Ctrl+,", matches: (e, m) => m && !e.shiftKey && e.key === "," },
];

/** Shortcuts handled inside the terminal itself (see terminal/termKeys.ts). */
export const TERMINAL_SHORTCUTS = [
  { label: "Copy", keys: "Ctrl+Shift+C, or Ctrl+C while text is selected" },
  { label: "Paste", keys: "Ctrl+V or Ctrl+Shift+V (also in the right-click menu)" },
  { label: "Find in scrollback", keys: "Ctrl+Shift+F" },
];

export function shortcutFor(e: KeyInfo): ShortcutAction | null {
  if (e.altKey) return null;
  const mod = e.ctrlKey || e.metaKey;
  return SHORTCUTS.find((s) => s.matches(e, mod))?.action ?? null;
}
