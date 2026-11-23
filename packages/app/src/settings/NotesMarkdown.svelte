<script lang="ts">
  import { untrack } from "svelte";
  import { renderMarkdown } from "../preview/markdown.js";
  import { openExternalLink } from "../terminal/links.js";

  interface Props {
    markdown: string;
  }

  let { markdown }: Props = $props();

  let root: HTMLDivElement;
  // A render that finishes after a newer one started (or after unmount) must not touch the DOM.
  let seq = 0;

  $effect(() => {
    const md = markdown;
    const mine = ++seq;
    untrack(() => show(md, mine));
    return () => { seq++; };
  });

  async function show(md: string, mine: number) {
    try {
      const fragment = await renderMarkdown(md);
      // Release notes have no use for images, and a remote one must never be requested.
      for (const img of fragment.querySelectorAll("img")) img.remove();
      if (mine === seq) root.replaceChildren(fragment);
    } catch (e) {
      console.error(e);
      if (mine === seq) root.textContent = "These notes could not be shown.";
    }
  }

  // Release text is not ours: only http(s) links do anything, and nothing navigates the window.
  function onClick(e: MouseEvent) {
    const a = (e.target as Element).closest("a");
    if (!a || !root.contains(a)) return;
    e.preventDefault();
    const href = a.getAttribute("href") ?? "";
    if (/^https?:\/\//i.test(href)) openExternalLink(e, href);
  }

  function onAuxClick(e: MouseEvent) {
    const a = (e.target as Element).closest("a");
    if (a && root.contains(a)) e.preventDefault();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="notes" bind:this={root} onclick={onClick} onauxclick={onAuxClick}></div>

<style>
  .notes { font-size: 13px; line-height: 1.55; color: var(--fg); overflow-wrap: anywhere; user-select: text; }
  .notes :global(h1), .notes :global(h2), .notes :global(h3), .notes :global(h4) {
    margin: 10px 0 4px;
    font-size: 12px;
    font-weight: 600;
    color: var(--fg-muted);
  }
  .notes :global(h3:first-child) { margin-top: 0; }
  .notes :global(ul), .notes :global(ol) { margin: 0; padding-left: 18px; }
  .notes :global(li) { margin: 0 0 4px; }
  .notes :global(p) { margin: 0 0 6px; }
  .notes :global(a) { color: var(--accent); text-decoration: underline; cursor: pointer; }
  .notes :global(code) { font-family: var(--font-mono, monospace); font-size: 0.92em; background: var(--bg-block); border-radius: 4px; padding: 0 4px; }
</style>
