<script lang="ts">
  import { untrack } from "svelte";
  import { get } from "svelte/store";
  import { Terminal } from "@xterm/xterm";
  import { FitAddon } from "@xterm/addon-fit";
  import { WebLinksAddon } from "@xterm/addon-web-links";
  import { SearchAddon } from "@xterm/addon-search";
  import { readText } from "@tauri-apps/plugin-clipboard-manager";
  import FindBar from "./FindBar.svelte";
  import TermMenu from "./TermMenu.svelte";
  import { sessionWrite, sessionResize } from "../ipc/client.js";
  import { onSessionExit } from "../ipc/events.js";
  import { activeTheme } from "../theme/store.js";
  import { fontConfig } from "../theme/fontStore.js";
  import { getOutputSink } from "./outputSink.js";
  import { openExternalLink } from "./links.js";
  import { attachWebgl } from "./webglRenderer.js";
  import { terminalConfig } from "../stores/terminalConfigStore.js";
  import { terminalPadding } from "../theme/paddingStore.js";
  import { parseOsc7, parseOsc52, parseOsc133 } from "../utils/osc.js";
  import { markPaneBusy, forgetPane } from "../stores/paneBusy.js";
  import { pushToast } from "../stores/app.js";
  import { isCopyChord, isPasteChord, isFindChord } from "./termKeys.js";
  import { shortcutFor } from "../utils/shortcuts.js";
  import { playBell } from "../utils/bell.js";

  // ── Props ────────────────────────────────────────────────────────────────

  interface Props {
    sessionId: string;
    active: boolean;
    onExit?: (code: number) => void;
    onResize?: (cols: number, rows: number) => void;
    onCwd?: (cwd: string) => void;
    onTitle?: (title: string) => void;
  }

  let { sessionId, active, onExit, onResize, onCwd, onTitle }: Props = $props();

  // ── Terminal instance ────────────────────────────────────────────────────

  let container: HTMLDivElement;
  // Props resolve through the $tabs each-item, so reading them directly in an effect re-runs it on
  // every tab update. $derived memoises primitives: effects below re-run only on a real change.
  const paneActive = $derived(active);
  const paneSession = $derived(sessionId);
  let term = $state<Terminal | undefined>(undefined);
  /** Exposed so the font-change effect can call fitAddon.fit() after resize. */
  let fa = $state<FitAddon | undefined>(undefined);
  let searchAddon = $state<SearchAddon | undefined>(undefined);
  // One notice per pane, so a program that keeps asking cannot flood the toasts.
  let osc52Warned = false;
  let findOpen = $state(false);
  let menu = $state<{ x: number; y: number } | null>(null);

  $effect(() => {
    // Read once, untracked: a tracked read here re-ran this effect (tearing the
    // terminal down) on every $tabs update, because props resolve through the store.
    const sid = untrack(() => sessionId);
    let mounted = true;
    let unlistenExit: (() => void) | undefined;
    let resizeObserver: ResizeObserver | undefined;

    (async () => {
      const cfg = get(fontConfig);
      const tc = get(terminalConfig);
      const baseTheme = get(activeTheme).xterm;
      const t = new Terminal({
        allowProposedApi: true,
        allowTransparency: true,
        fontFamily: cfg.fontFamily,
        fontSize: cfg.fontSize,
        lineHeight: cfg.lineHeight,
        cursorBlink: tc.cursorBlink,
        drawBoldTextInBrightColors: tc.boldInBright,
        cursorStyle: tc.cursorStyle as "block" | "bar" | "underline",
        scrollback: tc.scrollbackLines,
        theme: { ...baseTheme },
      });

      const fitAddon = new FitAddon();
      fa = fitAddon;
      t.loadAddon(fitAddon);
      t.loadAddon(new WebLinksAddon(openExternalLink));
      const search = new SearchAddon();
      t.loadAddon(search);
      searchAddon = search;

      t.open(container);
      t.parser.registerOscHandler(7, (data) => {
        const cwd = parseOsc7(data);
        if (cwd) onCwd?.(cwd);
        return true;
      });
      t.parser.registerOscHandler(52, (data) => {
        const text = parseOsc52(data);
        if (text === null) return true;
        if (!get(terminalConfig).osc52Clipboard) {
          if (!osc52Warned) pushToast("A program tried to set the clipboard. Allow it in Settings → Terminal.");
          osc52Warned = true;
          return true;
        }
        navigator.clipboard.writeText(text).catch(console.error);
        pushToast(`A program copied ${text.length} characters to the clipboard`);
        return true;
      });
      t.parser.registerOscHandler(133, (data) => {
        const busy = parseOsc133(data);
        if (busy !== null) markPaneBusy(sid, busy);
        return true;
      });
      t.onTitleChange((title) => onTitle?.(title));
      t.onBell(() => { if (get(terminalConfig).bellSound) playBell(); });
      t.attachCustomKeyEventHandler((e) => {
        // App shortcuts must reach the window handler; xterm would otherwise consume Tab
        // (so Ctrl+Tab never switched tabs) by sending it to the shell.
        if (shortcutFor(e)) return false;
        // Paste is left to the browser's own paste event, which xterm turns into (bracketed)
        // input; xterm would otherwise send Ctrl+V to the shell as a literal ^V.
        if (isPasteChord(e)) return false;
        if (isFindChord(e)) { e.preventDefault(); findOpen = true; return false; }
        if (!isCopyChord(e, t.hasSelection())) return true;
        if (t.hasSelection()) {
          navigator.clipboard.writeText(t.getSelection()).catch(console.error);
          t.clearSelection();
        }
        return false; // never forward a Ctrl+Shift+C to the shell as input
      });
      fitAddon.fit();

      t.onData((data) => {
        const bytes = new TextEncoder().encode(data);
        sessionWrite(sid, bytes).catch(console.error);
      });

      t.onBinary((data) => {
        const bytes = Uint8Array.from(data, (c) => c.charCodeAt(0));
        sessionWrite(sid, bytes).catch(console.error);
      });

      // Replay bytes buffered before this Grid mounted, then stream live.
      getOutputSink(sid)?.attach((bytes, done) => t.write(bytes, done));

      unlistenExit = await onSessionExit((payload) => {
        if (payload.session_id !== sid) return;
        t.writeln("\r\n\x1b[2m[process exited with code " + payload.code + "]\x1b[0m");
        onExit?.(payload.code);
      });

      resizeObserver = new ResizeObserver(() => {
        fitAddon!.fit();
        sessionResize(sid, t.cols, t.rows).catch(console.error);
        onResize?.(t.cols, t.rows);
      });
      resizeObserver.observe(container);

      await sessionResize(sid, t.cols, t.rows);
      onResize?.(t.cols, t.rows);

      if (!mounted) {
        getOutputSink(sid)?.detach();
        unlistenExit?.();
        resizeObserver.disconnect();
        t.dispose();
        return;
      }

      term = t;
    })();

    return () => {
      mounted = false;
      forgetPane(sid);
      fa = undefined;
      searchAddon = undefined;
      getOutputSink(sid)?.detach();
      unlistenExit?.();
      resizeObserver?.disconnect();
      term?.dispose();
      term = undefined;
    };
  });

  // Update xterm theme when the active theme changes.
  $effect(() => {
    const base = $activeTheme.xterm;
    if (term) {
      term.options.theme = { ...base };
    }
  });

  // Live font preview: when fontConfig changes, update the terminal and re-fit.
  $effect(() => {
    const { fontFamily, fontSize, lineHeight } = $fontConfig;
    if (!term || !fa) return;
    term.options.fontFamily = fontFamily;
    term.options.fontSize = fontSize;
    term.options.lineHeight = lineHeight;
    fa.fit();
    // Font changes affect cell dimensions, so update the PTY size.
    sessionResize(paneSession, term.cols, term.rows).catch(console.error);
    untrack(() => onResize)?.(term.cols, term.rows);
  });

  // Padding changes the usable grid size: re-fit and tell the PTY.
  $effect(() => {
    void $terminalPadding;
    if (!term || !fa) return;
    fa.fit();
    sessionResize(paneSession, term.cols, term.rows).catch(console.error);
    untrack(() => onResize)?.(term.cols, term.rows);
  });

  // Live terminal config: apply cursor style/blink changes without restart.
  $effect(() => {
    const { cursorStyle, cursorBlink, boldInBright } = $terminalConfig;
    if (!term) return;
    term.options.drawBoldTextInBrightColors = boldInBright;
    term.options.cursorStyle = cursorStyle as "block" | "bar" | "underline";
    term.options.cursorBlink = cursorBlink;
    // scrollback can only be set at construction time in xterm.js — new sessions pick it up.
  });

  // WebGL only while the tab is shown: Chromium keeps ~16 live WebGL contexts across all tabs and
  // splits and silently drops the oldest. Hidden tabs fall back to the DOM renderer.
  $effect(() => {
    if (!paneActive || !term || !fa) return;
    const detach = attachWebgl(term);
    // WebGL rounds cells to whole device pixels, so the grid size can change: re-fit, tell the PTY.
    fa.fit();
    sessionResize(paneSession, term.cols, term.rows).catch(console.error);
    untrack(() => onResize)?.(term.cols, term.rows);
    return detach;
  });

  // Focus the terminal when this tab becomes active.
  // Also call fit() in case the window was resized while this tab was hidden.
  $effect(() => {
    if (paneActive && term) {
      term.focus();
      fa?.fit();
    }
  });

  function openMenu(e: MouseEvent) {
    e.preventDefault();
    menu = { x: e.clientX, y: e.clientY };
  }

  function closeFind() {
    findOpen = false;
    term?.focus();
  }

  function closeMenu() {
    menu = null;
    term?.focus();
  }

  function copySelection() {
    if (term?.hasSelection()) navigator.clipboard.writeText(term.getSelection()).catch(console.error);
  }

  // term.paste() applies bracketed-paste mode, like the keyboard path does. The plugin reads the
  // clipboard natively: the webview's own clipboard.readText() asks for permission every time.
  function pasteClipboard() {
    readText().then((text) => term?.paste(text)).catch(console.error);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="grid-wrap" oncontextmenu={openMenu}>
  <div bind:this={container} class="grid-container"></div>
  {#if findOpen && searchAddon}
    <FindBar search={searchAddon} onClose={closeFind} />
  {/if}
</div>

{#if menu && term}
  <TermMenu x={menu.x} y={menu.y} canCopy={term.hasSelection()} onCopy={copySelection}
            onPaste={pasteClipboard} onSelectAll={() => term?.selectAll()}
            onFind={() => (findOpen = true)} onClose={closeMenu} />
{/if}

<style>
  .grid-wrap {
    position: relative;
    width: 100%;
    height: 100%;
    flex: 1;
    min-height: 0;
  }

  .grid-container {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  :global(.xterm) {
    height: 100%;
    padding: var(--term-pad, 8px);
  }

  :global(.xterm-viewport) {
    overflow-y: auto !important;
  }
</style>
