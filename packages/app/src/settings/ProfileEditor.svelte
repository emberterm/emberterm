<script lang="ts">
  import { profileUpsert, profileDelete, type Profile } from "../ipc/client.js";
  import { Btn } from "@emberterm/ui";
  import { open } from "@tauri-apps/plugin-dialog";
  import { untrack } from "svelte";

  interface Props {
    profile?: Profile;
    onSave?: (profile: Profile) => void;
    onCancel?: () => void;
    onTest?: (profile: Profile) => void;
    onDelete?: (id: string) => void;
  }

  let { profile, onSave, onCancel, onTest, onDelete }: Props = $props();

  // Deliberate one-time copy: the form is a draft the user edits. SettingsPanel mounts a fresh
  // editor for each Edit/New click, so the prop never changes while one is open.
  const initial = untrack(() => profile);

  let id = $state(initial?.id ?? crypto.randomUUID().slice(0, 8));
  let name = $state(initial?.name ?? "New Profile");
  let shell = $state(initial?.shell ?? "");
  let argsStr = $state((initial?.args ?? []).join(" "));
  let cwd = $state(initial?.cwd ?? "~");
  let envRows = $state<{ key: string; val: string }[]>(
    Object.entries(initial?.env ?? {}).map(([key, val]) => ({ key, val })),
  );

  let saving = $state(false);
  let testing = $state(false);
  let deleting = $state(false);
  let confirmDelete = $state(false);
  let error = $state("");

  function buildProfile(): Profile {
    const env: Record<string, string> = {};
    for (const row of envRows) {
      const k = row.key.trim();
      if (k) env[k] = row.val;
    }
    return {
      id,
      name: name.trim(),
      shell: shell.trim(),
      args: argsStr.trim() ? argsStr.trim().split(/\s+/) : [],
      cwd: cwd.trim() || "~",
      env,
    };
  }

  function validate(): boolean {
    if (!name.trim() || !shell.trim()) { error = "Name and shell are required."; return false; }
    error = "";
    return true;
  }

  async function save() {
    if (!validate()) return;
    saving = true;
    try { const p = buildProfile(); await profileUpsert(p); onSave?.(p); }
    catch (e) { error = String(e); } finally { saving = false; }
  }

  async function test() {
    if (!validate()) return;
    testing = true;
    try { const p = buildProfile(); await profileUpsert(p); onTest?.(p); }
    catch (e) { error = String(e); } finally { testing = false; }
  }

  async function doDelete() {
    deleting = true;
    try { await profileDelete(id); onDelete?.(id); }
    catch (e) { error = String(e); deleting = false; confirmDelete = false; }
  }

  async function browseCwd() {
    // `~` paths mean nothing to the OS dialog; let it open at its own default instead.
    const current = cwd.trim();
    try {
      const picked = await open({ directory: true, defaultPath: current && !current.startsWith("~") ? current : undefined });
      if (picked) cwd = picked;
    } catch (e) { error = String(e); }
  }

  function addEnvRow() { envRows = [...envRows, { key: "", val: "" }]; }
  function removeEnvRow(i: number) { envRows = envRows.filter((_, idx) => idx !== i); }
</script>

<div class="profile-editor">
  <h3>{profile ? "Edit Profile" : "New Profile"}</h3>

  <!-- Basic fields -->
  <div class="field-row">
    <label class="field" style="flex:1">
      <span class="label">Name</span>
      <input bind:value={name} placeholder="My Shell" />
    </label>
  </div>

  <label class="field">
    <span class="label">Shell</span>
    <input bind:value={shell} placeholder="pwsh.exe, bash, zsh…" />
  </label>

  <div class="field-row">
    <label class="field" style="flex:1">
      <span class="label">Arguments</span>
      <input bind:value={argsStr} placeholder="-NoLogo" />
    </label>
    <div class="field" style="flex:1">
      <label class="label" for="profile-cwd">Working directory</label>
      <div class="input-with-btn">
        <input id="profile-cwd" bind:value={cwd} placeholder="~" />
        <button class="browse-btn" onclick={browseCwd} type="button" aria-label="Browse for folder" title="Browse for folder">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
        </button>
      </div>
    </div>
  </div>

  <!-- Environment variables -->
  <div class="field">
    <div class="env-header">
      <span class="label">Environment variables</span>
      <button class="add-env-btn" onclick={addEnvRow} type="button">+ Add</button>
    </div>
    {#if envRows.length > 0}
      <div class="env-rows">
        {#each envRows as row, i}
          <div class="env-row">
            <input class="env-key" bind:value={row.key} placeholder="KEY" spellcheck={false} />
            <span class="env-eq">=</span>
            <input class="env-val" bind:value={row.val} placeholder="value" spellcheck={false} />
            <button class="env-remove" onclick={() => removeEnvRow(i)} type="button" aria-label="Remove">×</button>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  <div class="actions">
    {#if confirmDelete}
      <span class="confirm-msg">Delete "{name}"?</span>
      <Btn variant="danger" onclick={doDelete} disabled={deleting}>{deleting ? "Deleting…" : "Yes, delete"}</Btn>
      <Btn variant="ghost" onclick={() => (confirmDelete = false)} disabled={deleting}>Cancel</Btn>
    {:else}
      <div class="actions-left">
        {#if profile}
          <Btn variant="danger" onclick={() => (confirmDelete = true)}>Delete</Btn>
        {/if}
      </div>
      <div class="actions-right">
        <Btn variant="ghost" onclick={onCancel} disabled={saving || testing}>Cancel</Btn>
        {#if onTest}
          <Btn variant="ghost" onclick={test} disabled={saving || testing}>{testing ? "Opening…" : "Test"}</Btn>
        {/if}
        <Btn variant="primary" onclick={save} disabled={saving || testing}>{saving ? "Saving…" : "Save"}</Btn>
      </div>
    {/if}
  </div>
</div>

<style>
  .profile-editor { display: flex; flex-direction: column; gap: 12px; }
  h3 { margin: 0 0 4px; font-size: 14px; color: var(--fg, #e6edf3); }

  .field { display: flex; flex-direction: column; gap: 4px; }
  .field-row { display: flex; gap: 10px; }

  .label {
    font-size: 11px;
    color: var(--fg-muted, #7d8590);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  input {
    background: var(--bg, #0d1117);
    border: 1px solid var(--border, #21262d);
    border-radius: 4px;
    color: var(--fg, #e6edf3);
    font-size: 13px;
    padding: 6px 10px;
    outline: none;
    font-family: inherit;
    width: 100%;
    box-sizing: border-box;
  }

  input:focus { border-color: var(--accent, #FF6B35); }

  .input-with-btn { display: flex; gap: 4px; }
  .browse-btn {
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    width: 30px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--fg-muted);
    cursor: pointer;
  }
  .browse-btn:hover { color: var(--fg); border-color: var(--accent); }
  .browse-btn:focus-visible { outline: 2px solid var(--accent-glow); outline-offset: 1px; }

  /* Env vars */
  .env-header { display: flex; align-items: center; justify-content: space-between; }
  .add-env-btn {
    background: transparent;
    border: none;
    color: var(--accent, #FF6B35);
    cursor: pointer;
    font-size: 11px;
    padding: 0;
  }
  .add-env-btn:hover { opacity: 0.8; }

  .env-rows { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
  .env-row { display: flex; align-items: center; gap: 4px; }
  .env-key { flex: 0 0 120px; font-family: monospace !important; font-size: 12px !important; }
  .env-val { flex: 1; font-family: monospace !important; font-size: 12px !important; }
  .env-eq { color: var(--fg-muted, #7d8590); font-size: 13px; flex-shrink: 0; }
  .env-remove {
    background: transparent; border: none; color: var(--fg-muted, #7d8590);
    cursor: pointer; font-size: 16px; padding: 0 2px; line-height: 1; flex-shrink: 0;
  }
  .env-remove:hover { color: var(--red, #f85149); }

  /* Overrides */

  .error { color: var(--red, #f85149); font-size: 12px; margin: 0; }

  /* Actions */
  .actions { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
  .actions-left { flex: 1; }
  .actions-right { display: flex; gap: 8px; }
  .confirm-msg { flex: 1; font-size: 13px; color: var(--fg, #e6edf3); }
</style>
