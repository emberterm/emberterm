<script lang="ts">
  import { terminalConfig, updateTerminalConfig } from "../stores/terminalConfigStore.js";

  type CursorStyle = "block" | "bar" | "underline";
  const CURSOR_SHAPES: { id: CursorStyle; label: string }[] = [
    { id: "block", label: "Block" },
    { id: "bar", label: "Bar" },
    { id: "underline", label: "Underline" },
  ];

  function setCursorStyle(s: CursorStyle) {
    updateTerminalConfig({ cursorStyle: s }).catch(() => {});
  }

  function toggleCursorBlink() {
    updateTerminalConfig({ cursorBlink: !$terminalConfig.cursorBlink }).catch(() => {});
  }

  function toggleBoldInBright() {
    updateTerminalConfig({ boldInBright: !$terminalConfig.boldInBright }).catch(() => {});
  }

  function toggleBellSound() {
    updateTerminalConfig({ bellSound: !$terminalConfig.bellSound }).catch(() => {});
  }

  function toggleOsc52() {
    updateTerminalConfig({ osc52Clipboard: !$terminalConfig.osc52Clipboard }).catch(() => {});
  }

  function togglePreviewOnCat() {
    updateTerminalConfig({ previewOnCat: !$terminalConfig.previewOnCat }).catch(() => {});
  }

  function toggleConfirmClose() {
    updateTerminalConfig({ confirmCloseRunning: !$terminalConfig.confirmCloseRunning }).catch(() => {});
  }

  function onScrollbackInput(e: Event) {
    const n = parseInt((e.currentTarget as HTMLInputElement).value, 10);
    if (n >= 100 && n <= 100000) updateTerminalConfig({ scrollbackLines: n }).catch(() => {});
  }
</script>

<div class="terminal-settings">

  <!-- Cursor -->
  <section class="section">
    <h3>Cursor</h3>

    <div class="field">
      <span class="label">Shape</span>
      <div class="seg-group" role="group" aria-label="Cursor shape">
        {#each CURSOR_SHAPES as shape}
          <button
            class="seg-btn"
            class:active={$terminalConfig.cursorStyle === shape.id}
            onclick={() => setCursorStyle(shape.id)}
          >{shape.label}</button>
        {/each}
      </div>
    </div>

    <div class="toggle-row" role="button" tabindex="0"
      onclick={toggleCursorBlink}
      onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCursorBlink(); } }}
    >
      <span class="toggle-title">Blink cursor</span>
      <span class="toggle-wrap">
        <input type="checkbox" class="toggle-input" checked={$terminalConfig.cursorBlink} readonly />
        <span class="toggle-track" aria-hidden="true"></span>
      </span>
    </div>
  </section>

  <!-- Rendering -->
  <section class="section">
    <h3>Rendering</h3>

    <label class="field">
      <span class="label">Scrollback lines</span>
      <input
        type="number"
        min="100" max="100000" step="1000"
        value={$terminalConfig.scrollbackLines}
        oninput={onScrollbackInput}
        style="max-width: 110px;"
      />
      <span class="field-hint">Applies to new sessions</span>
    </label>

    <div class="toggle-row" role="button" tabindex="0"
      onclick={toggleBoldInBright}
      onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleBoldInBright(); } }}
    >
      <span class="toggle-label">
        <span class="toggle-title">Draw bold text in bright colors</span>
        <span class="toggle-hint">Bold ANSI text uses the bright color variant</span>
      </span>
      <span class="toggle-wrap">
        <input type="checkbox" class="toggle-input" checked={$terminalConfig.boldInBright} readonly />
        <span class="toggle-track" aria-hidden="true"></span>
      </span>
    </div>
  </section>

  <!-- Behavior -->
  <section class="section">
    <h3>Behavior</h3>

    <div class="toggle-row" role="button" tabindex="0"
      onclick={toggleBellSound}
      onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleBellSound(); } }}
    >
      <span class="toggle-label">
        <span class="toggle-title">Bell sound</span>
        <span class="toggle-hint">Play a short beep when a program rings the terminal bell</span>
      </span>
      <span class="toggle-wrap">
        <input type="checkbox" class="toggle-input" checked={$terminalConfig.bellSound} readonly />
        <span class="toggle-track" aria-hidden="true"></span>
      </span>
    </div>

    <div class="toggle-row" role="button" tabindex="0"
      onclick={toggleConfirmClose}
      onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleConfirmClose(); } }}
    >
      <span class="toggle-label">
        <span class="toggle-title">Confirm close (running process)</span>
        <span class="toggle-hint">Ask before closing a tab with a running process</span>
      </span>
      <span class="toggle-wrap">
        <input type="checkbox" class="toggle-input" checked={$terminalConfig.confirmCloseRunning} readonly />
        <span class="toggle-track" aria-hidden="true"></span>
      </span>
    </div>
    <div class="toggle-row" role="button" tabindex="0"
      onclick={toggleOsc52}
      onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleOsc52(); } }}
    >
      <span class="toggle-label">
        <span class="toggle-title">Let programs set the clipboard</span>
        <span class="toggle-hint">Allow OSC 52, used by tmux and vim over ssh. Off by default: text from a malicious file or host could replace what you copied</span>
      </span>
      <span class="toggle-wrap">
        <input type="checkbox" class="toggle-input" checked={$terminalConfig.osc52Clipboard} readonly />
        <span class="toggle-track" aria-hidden="true"></span>
      </span>
    </div>
    <div class="toggle-row" role="button" tabindex="0"
      onclick={togglePreviewOnCat}
      onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); togglePreviewOnCat(); } }}
    >
      <span class="toggle-label">
        <span class="toggle-title">Open Markdown in the preview when shown with cat</span>
        <span class="toggle-hint">After a command like cat README.md finishes, show the file rendered next to the terminal. Works in Git Bash, WSL and PowerShell; a pipe, a glob or two files are ignored</span>
      </span>
      <span class="toggle-wrap">
        <input type="checkbox" class="toggle-input" checked={$terminalConfig.previewOnCat} readonly />
        <span class="toggle-track" aria-hidden="true"></span>
      </span>
    </div>
  </section>

</div>

<style>
  .terminal-settings { display: flex; flex-direction: column; gap: 20px; }

  .section { display: flex; flex-direction: column; gap: 10px; }

  h3 {
    margin: 0 0 2px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--fg-muted, #7d8590);
  }

  .field { display: flex; flex-direction: column; gap: 4px; }

  .label { font-size: 12px; color: var(--fg-muted, #7d8590); }

  .field-hint { font-size: 11px; color: var(--fg-muted, #7d8590); opacity: 0.7; }

  input[type="number"] {
    background: var(--bg, #0d1117);
    border: 1px solid var(--border, #21262d);
    border-radius: 4px;
    color: var(--fg, #e6edf3);
    font-size: 13px;
    padding: 5px 8px;
    outline: none;
    box-sizing: border-box;
    font-family: inherit;
  }

  input[type="number"]:focus { border-color: var(--accent, #FF6B35); }

  /* Segmented button */
  .seg-group {
    display: inline-flex;
    border: 1px solid var(--border, #21262d);
    border-radius: 5px;
    overflow: hidden;
  }

  .seg-btn {
    background: transparent;
    border: none;
    border-right: 1px solid var(--border, #21262d);
    color: var(--fg-muted, #7d8590);
    cursor: pointer;
    font-size: 12px;
    padding: 5px 14px;
    transition: background 0.1s, color 0.1s;
  }

  .seg-btn:last-child { border-right: none; }

  .seg-btn:hover { background: rgba(255,255,255,0.05); color: var(--fg, #e6edf3); }

  .seg-btn.active {
    background: color-mix(in srgb, var(--accent, #FF6B35) 15%, transparent);
    color: var(--accent, #FF6B35);
  }

  /* Toggle row */
  .toggle-row {
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    outline: none;
    padding: 2px 0;
  }

  .toggle-row:focus-visible { outline: 2px solid var(--accent-glow, rgba(255,107,53,0.5)); border-radius: 4px; }

  .toggle-label {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .toggle-title { font-size: 13px; color: var(--fg, #e6edf3); flex: 1; }
  .toggle-hint { font-size: 11px; color: var(--fg-muted, #7d8590); }

  .toggle-wrap { position: relative; flex-shrink: 0; }

  .toggle-input { position: absolute; opacity: 0; width: 0; height: 0; }

  .toggle-track {
    display: block;
    width: 36px;
    height: 20px;
    border-radius: 10px;
    background: var(--border, #21262d);
    cursor: pointer;
    transition: background 0.2s;
    position: relative;
  }

  .toggle-track::after {
    content: "";
    position: absolute;
    top: 3px;
    left: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: white;
    transition: transform 0.2s;
  }

  .toggle-input:checked + .toggle-track { background: var(--accent, #FF6B35); }
  .toggle-input:checked + .toggle-track::after { transform: translateX(16px); }
</style>
