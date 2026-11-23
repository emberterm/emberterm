<script lang="ts">
  import { untrack } from "svelte";
  import { filePreviewImage } from "../ipc/client.js";
  import { openExternalLink } from "../terminal/links.js";
  import { pushToast } from "../stores/app.js";
  import { renderMarkdown } from "./markdown.js";
  import { assignHeadingIds } from "./slug.js";
  import { enhanceImages, ImageBudget } from "./images.js";
  import { classifyLink } from "./links.js";

  interface Props {
    text: string;
    path: string;
    onNavigate: (path: string) => void;
  }

  let { text, path, onNavigate }: Props = $props();

  let root: HTMLDivElement;
  let renderedPath: string | null = null;
  // A render that finishes after a newer one started (or after unmount) must not touch the DOM.
  let seq = 0;

  $effect(() => {
    const t = text;
    const p = path;
    const mine = ++seq;
    untrack(() => show(t, p, mine));
    return () => { seq++; };
  });

  async function show(t: string, p: string, mine: number) {
    try {
      const fragment = await renderMarkdown(t);
      assignHeadingIds(fragment);
      // Images are read before the fragment is inserted: a relative src in the page would make
      // the webview request it from its own origin.
      await enhanceImages(fragment, p, filePreviewImage, new ImageBudget());
      if (mine !== seq) return;
      const keep = renderedPath === p ? root.scrollTop : 0;
      root.replaceChildren(fragment);
      root.scrollTop = keep;
      renderedPath = p;
    } catch (e) {
      console.error(e);
      if (mine === seq) pushToast("Could not render this file");
    }
  }

  function onClick(e: MouseEvent) {
    const a = (e.target as Element).closest("a");
    if (!a || !root.contains(a)) return;
    e.preventDefault();
    const action = classifyLink(a.getAttribute("href") ?? "", path);
    switch (action.kind) {
      case "anchor":
        [...root.querySelectorAll("[id]")].find((el) => el.id === action.id)?.scrollIntoView({ block: "start" });
        break;
      case "markdown": onNavigate(action.path); break;
      case "external": openExternalLink(e, action.url); break;
      case "blocked": pushToast(action.reason); break;
    }
  }
</script>

<!-- Focusable so the keyboard can scroll it; links inside are natively keyboard operable. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
<div class="md" bind:this={root} onclick={onClick} role="document" tabindex="0"></div>

<style>
  .md {
    height: 100%;
    overflow: auto;
    padding: 12px 16px 24px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--fg);
    user-select: text;
    overflow-wrap: anywhere;
  }
  .md :global(h1), .md :global(h2) { border-bottom: 1px solid var(--border); padding-bottom: 4px; }
  .md :global(h1) { font-size: 1.6em; margin: 0.4em 0 0.6em; }
  .md :global(h2) { font-size: 1.3em; margin: 1.2em 0 0.6em; }
  .md :global(h3) { font-size: 1.1em; margin: 1em 0 0.5em; }
  .md :global(h4), .md :global(h5), .md :global(h6) { font-size: 1em; margin: 1em 0 0.5em; }
  .md :global(p), .md :global(ul), .md :global(ol), .md :global(blockquote), .md :global(pre), .md :global(table) { margin: 0 0 0.9em; }
  .md :global(ul), .md :global(ol) { padding-left: 1.6em; }
  .md :global(a) { color: var(--accent); text-decoration: underline; cursor: pointer; }
  .md :global(code) { font-family: var(--font-mono, monospace); font-size: 0.92em; background: var(--bg-block); border-radius: 4px; padding: 1px 4px; }
  .md :global(pre) { background: var(--bg-block); border: 1px solid var(--border); border-radius: 6px; padding: 8px 12px; overflow-x: auto; }
  .md :global(pre code) { background: none; padding: 0; }
  .md :global(blockquote) { border-left: 3px solid var(--border); padding-left: 12px; color: var(--fg-muted); }
  .md :global(table) { border-collapse: collapse; display: block; overflow-x: auto; }
  .md :global(th), .md :global(td) { border: 1px solid var(--border); padding: 4px 10px; }
  .md :global(th) { background: var(--bg-block); font-weight: 600; }
  .md :global(hr) { border: 0; border-top: 1px solid var(--border); margin: 1.2em 0; }
  .md :global(img) { max-width: 100%; height: auto; }
  .md :global(input[type="checkbox"]) { margin-right: 6px; }
  .md :global(li:has(> input[type="checkbox"])) { list-style: none; margin-left: -1.2em; }
  .md :global(.blocked-image) { display: inline-block; border: 1px dashed var(--border); border-radius: 4px; padding: 2px 8px; color: var(--fg-muted); font-size: 12px; }
</style>
