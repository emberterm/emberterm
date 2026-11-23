import { writable, get } from "svelte/store";
import { configGet, configUpdate } from "../ipc/client.js";

export interface TerminalConfig {
  /** "block" | "bar" | "underline" */
  cursorStyle: string;
  cursorBlink: boolean;
  /** Draw bold ANSI text using bright color variants */
  boldInBright: boolean;
  scrollbackLines: number;
  confirmCloseRunning: boolean;
  bellSound: boolean;
  /** Let a program set the clipboard with OSC 52 */
  osc52Clipboard: boolean;
  /** Open a Markdown file in the preview when a cat-like command has shown it */
  previewOnCat: boolean;
}

/** Defaults mirror config.rs defaults. */
const DEFAULTS: TerminalConfig = {
  cursorStyle: "block",
  cursorBlink: true,
  boldInBright: true,
  scrollbackLines: 10000,
  confirmCloseRunning: true,
  bellSound: true,
  osc52Clipboard: false,
  previewOnCat: false,
};

export const terminalConfig = writable<TerminalConfig>({ ...DEFAULTS });

/** Pull terminal settings from the persisted config and sync into the store. */
export async function loadTerminalConfig(): Promise<void> {
  try {
    const cfg = await configGet() as {
      appearance?: {
        cursor_style?: string;
        cursor_blink?: boolean;
        bold_in_bright?: boolean;
      };
      behavior?: {
        scrollback_lines?: number;
        confirm_close_running?: boolean;
        bell_sound?: boolean;
        osc52_clipboard?: boolean;
        preview_on_cat?: boolean;
      };
    };
    const a = cfg?.appearance;
    const b = cfg?.behavior;
    terminalConfig.set({
      cursorStyle: a?.cursor_style ?? DEFAULTS.cursorStyle,
      cursorBlink: a?.cursor_blink ?? DEFAULTS.cursorBlink,
      boldInBright: a?.bold_in_bright ?? DEFAULTS.boldInBright,
      scrollbackLines: b?.scrollback_lines ?? DEFAULTS.scrollbackLines,
      confirmCloseRunning: b?.confirm_close_running ?? DEFAULTS.confirmCloseRunning,
      bellSound: b?.bell_sound ?? DEFAULTS.bellSound,
      osc52Clipboard: b?.osc52_clipboard ?? DEFAULTS.osc52Clipboard,
      previewOnCat: b?.preview_on_cat ?? DEFAULTS.previewOnCat,
    });
  } catch {
    // Keep defaults if config isn't available yet
  }
}

/**
 * Update one or more terminal settings, apply immediately (live preview),
 * and persist to config.toml in the background.
 */
export async function updateTerminalConfig(patch: Partial<TerminalConfig>): Promise<void> {
  const updated = { ...get(terminalConfig), ...patch };
  terminalConfig.set(updated);

  await configUpdate({
    appearance: {
      cursor_style: updated.cursorStyle,
      cursor_blink: updated.cursorBlink,
      bold_in_bright: updated.boldInBright,
    },
    behavior: {
      scrollback_lines: updated.scrollbackLines,
      confirm_close_running: updated.confirmCloseRunning,
      bell_sound: updated.bellSound,
      osc52_clipboard: updated.osc52Clipboard,
      preview_on_cat: updated.previewOnCat,
    },
  });
}
