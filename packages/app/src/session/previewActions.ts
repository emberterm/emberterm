import { get } from "svelte/store";
import { open } from "@tauri-apps/plugin-dialog";
import { filePreview, previewResolve } from "../ipc/client.js";
import { activeTab, closePreview, openPreview, paneContext, pushPaneCommand, pushToast } from "../stores/app.js";
import { terminalConfig } from "../stores/terminalConfigStore.js";
import { parseCatCommand } from "../preview/catCommand.js";
import { previewErrorMessage } from "../preview/errors.js";

/** Shows `path` in a tab's panel, but only if it reads; a bad file is a toast, not an empty panel. */
async function openChecked(tabId: string, path: string): Promise<void> {
  try {
    await filePreview(path);
    openPreview(tabId, path);
  } catch (e) {
    pushToast(previewErrorMessage(e));
  }
}

/** Ctrl+click on a Markdown file name printed in a pane: resolve it for that pane's shell and folder. */
export async function previewFromTerminal(sessionId: string, raw: string): Promise<void> {
  const ctx = paneContext(sessionId);
  if (!ctx) return;
  try {
    const path = await previewResolve({ profileId: ctx.profileId, cwd: ctx.cwd ?? "", raw });
    await openChecked(ctx.tabId, path);
  } catch (e) {
    pushToast(previewErrorMessage(e));
  }
}

/** "Preview Markdown file…": pick a file and show it in the active tab. */
export async function previewFromDialog(): Promise<void> {
  const tab = get(activeTab);
  if (!tab) return;
  try {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
    });
    if (typeof picked === "string") await openChecked(tab.id, picked);
  } catch (e) {
    pushToast(`Could not open the file dialog: ${e}`);
  }
}

/** Closes the active tab's preview, or asks for a file when there is none. */
export async function togglePreview(): Promise<void> {
  const tab = get(activeTab);
  if (!tab) return;
  if (tab.preview) closePreview(tab.id);
  else await previewFromDialog();
}

/** A command a pane reported (OSC 133;E): keep it for history, and maybe show the file it printed. */
export function handlePaneCommand(sessionId: string, cmd: string): void {
  pushPaneCommand(sessionId, cmd);
  if (!get(terminalConfig).previewOnCat) return;
  const raw = parseCatCommand(cmd);
  if (raw) void previewFromTerminal(sessionId, raw);
}
