<script lang="ts">
  import { untrack } from "svelte";
  import { filePreview } from "../ipc/client.js";
  import { closePreview, openPreview, previewBack, previewForward, setPreviewSize } from "../stores/app.js";
  import { canBack, canForward, previewPath, type PreviewState } from "./previewState.js";
  import { basename } from "./format.js";
  import { previewErrorMessage } from "./errors.js";
  import PreviewBody from "./PreviewBody.svelte";

  interface Props {
    tabId: string;
    preview: PreviewState;
    active: boolean;
  }

  let { tabId, preview, active }: Props = $props();

  // Props resolve through the $tabs store; a $derived string only changes with the file itself.
  const path = $derived(previewPath(preview));
  const back = $derived(canBack(preview));
  const forward = $derived(canForward(preview));
  const name = $derived(basename(path));
  const folder = $derived(path.slice(0, Math.max(0, path.length - name.length - 1)));

  let doc = $state<{ text: string; path: string } | null>(null);
  let error = $state<string | null>(null);

  // A new file: clear the old one first so an error never sits on top of the previous document.
  $effect(() => {
    const p = path;
    let cancelled = false;
    doc = null;
    error = null;
    filePreview(p)
      .then((r) => {
        if (cancelled) return;
        doc = { text: r.text, path: r.path };
        setPreviewSize(untrack(() => tabId), r.size);
      })
      .catch((e: unknown) => {
        if (!cancelled) error = previewErrorMessage(e);
      });
    return () => { cancelled = true; };
  });
</script>

<section class="panel" class:inactive={!active}>
  <header class="head">
    <svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 3h8l5 5v13H6z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
      <path d="M14 3v5h5M9 13h6M9 17h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
    <span class="name" title={path}>{name}</span>
    <span class="folder" title={folder}>{folder}</span>
    <button class="btn" onclick={() => previewBack(tabId)} disabled={!back} aria-label="Back">‹</button>
    <button class="btn" onclick={() => previewForward(tabId)} disabled={!forward} aria-label="Forward">›</button>
    <button class="btn" onclick={() => closePreview(tabId)} aria-label="Close preview">×</button>
  </header>
  <div class="content">
    {#if doc}
      <PreviewBody text={doc.text} path={doc.path} onNavigate={(p) => openPreview(tabId, p)} />
    {:else if error}
      <p class="msg error" role="alert">{error}</p>
    {:else}
      <p class="msg">Loading…</p>
    {/if}
  </div>
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-elev);
    color: var(--fg);
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 8px 0 12px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    flex: none;
  }
  .icon { color: var(--accent); flex: none; }
  .name { font-weight: 500; white-space: nowrap; }
  .folder { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--fg-muted); }
  .btn {
    background: none;
    border: 0;
    color: var(--fg-muted);
    font-size: 16px;
    line-height: 1;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    cursor: pointer;
  }
  .btn:hover:not(:disabled) { background: var(--accent-soft); color: var(--fg); }
  .btn:disabled { opacity: 0.35; cursor: default; }
  .content { flex: 1; min-height: 0; }
  .msg { margin: 0; padding: 16px; font-size: 13px; color: var(--fg-muted); }
  .msg.error { color: var(--red); }
</style>
