<script lang="ts">
  import NotesMarkdown from "./NotesMarkdown.svelte";
  import { formatReleaseDate, type NoteEntry } from "../utils/releaseNotes.js";

  interface Props {
    entries: NoteEntry[];
  }

  let { entries }: Props = $props();

  // What the user opened or closed by hand. Until then the newest release is open and the rest are not.
  let toggled = $state<Record<string, boolean>>({});
  const isOpen = (e: NoteEntry, i: number): boolean => toggled[e.version] ?? i === 0;
  const toggle = (e: NoteEntry, i: number) => { toggled[e.version] = !isOpen(e, i); };
</script>

<div class="releases">
  {#each entries as e, i (e.version)}
    {@const open = isOpen(e, i)}
    {@const date = formatReleaseDate(e.date)}
    <div class="release">
      <button class="head" aria-expanded={open} aria-controls="notes-{e.version}" onclick={() => toggle(e, i)}>
        <svg class="chev" class:open width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <polyline points="9 6 15 12 9 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="ver">{e.version}</span>
        {#if date}<span class="date">· {date}</span>{/if}
        {#if i === 0}<span class="tag">Newest</span>{/if}
      </button>
      {#if open}
        <div class="body" id="notes-{e.version}">
          {#if e.markdown}
            <NotesMarkdown markdown={e.markdown} />
          {:else}
            <p class="none">No notes for this release.</p>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .releases { max-height: 260px; overflow: auto; border-bottom: 1px solid var(--border); }
  .release { border-top: 1px solid var(--border); }

  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 9px 2px;
    background: none;
    border: 0;
    color: var(--fg);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }
  .head:focus-visible { outline: 2px solid var(--accent-glow); outline-offset: 1px; border-radius: 4px; }
  .chev { color: var(--fg-muted); flex: none; transition: transform 0.15s ease; }
  .chev.open { transform: rotate(90deg); }
  .ver { font-weight: 600; }
  .date { color: var(--fg-muted); }
  .tag { margin-left: auto; font-size: 11px; padding: 1px 8px; border-radius: 10px; background: var(--accent-soft); color: var(--fg); }

  .body { padding: 0 2px 10px 24px; }
  .none { margin: 0; font-size: 13px; color: var(--fg-muted); }

  @media (prefers-reduced-motion: reduce) {
    .chev { transition: none; }
  }
</style>
