<script lang="ts">
  import PreviewDivider from "./PreviewDivider.svelte";
  import PreviewPanel from "./PreviewPanel.svelte";
  import { ratioFromPointer } from "./layout.js";
  import type { PreviewState } from "./previewState.js";

  interface Props {
    tabId: string;
    preview: PreviewState;
    active: boolean;
    /** Share of the tab the panel takes; lives in TabPane so it survives closing and reopening. */
    ratio: number;
    /** The tab's row, which the ratio is measured against. */
    container: HTMLElement | undefined;
  }

  let { tabId, preview, active, ratio = $bindable(), container }: Props = $props();

  function dragTo(clientX: number) {
    if (!container) return;
    const r = container.getBoundingClientRect();
    ratio = ratioFromPointer(clientX, r.left, r.width);
  }
</script>

<PreviewDivider onDrag={dragTo} />
<aside class="preview" style:width="{ratio * 100}%" aria-label="Markdown preview">
  <PreviewPanel {tabId} {preview} {active} />
</aside>

<style>
  .preview {
    flex: none;
    min-width: 240px;
    max-width: calc(100% - 240px);
    height: 100%;
  }
</style>
