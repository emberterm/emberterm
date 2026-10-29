import { openUrl } from "@tauri-apps/plugin-opener";

import { pushToast } from "../stores/app.js";

// WebLinksAddon's default handler does window.open in the webview, where a Tauri app has no
// omnibox to fall back on. Route links through the opener plugin like Settings → About does,
// and keep it to http(s): a terminal program must not be able to trigger file:// or other
// webview-navigating schemes from printed output.
export function openExternalLink(_event: MouseEvent | undefined, uri: string): void {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  openUrl(uri).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    pushToast(`Could not open ${uri}: ${message}`);
  });
}
