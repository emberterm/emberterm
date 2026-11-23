<script lang="ts">
  import Grid from "./Grid.svelte";
  import { SplitContainer } from "@emberterm/ui";
  import { previewFromTerminal } from "../session/previewActions.js";
  import type { Tab } from "../stores/app.js";

  interface Props {
    tab: Tab;
    isActive: boolean;
    onExit: () => void;
    onSplitExit: () => void;
    onResize?: (cols: number, rows: number) => void;
    onCloseSplit: () => void;
    onPaneCwd: (sessionId: string, cwd: string) => void;
    onPaneCommand: (sessionId: string, cmd: string) => void;
    onPaneTitle: (sessionId: string, title: string) => void;
  }

  let { tab, isActive, onExit, onSplitExit, onResize, onCloseSplit, onPaneCwd, onPaneCommand, onPaneTitle }: Props = $props();

  let splitRatio = $state(0.5);
  let paneEl: HTMLDivElement | undefined = $state();
  /** Share of the tab the preview panel takes (kept in memory only). */
  let previewRatio = $state(0.4);
</script>

<div class="tab-pane" class:hidden={!isActive} bind:this={paneEl}>
  <!-- One stable wrapper: the terminals must not remount (and lose their scrollback) when the preview opens or closes. -->
  <div class="terminals">
    {#if tab.splitSessionId}
      <SplitContainer direction={tab.splitDirection ?? "horizontal"} bind:ratio={splitRatio} onClose={onCloseSplit}>
        {#snippet primary()}
          <Grid sessionId={tab.sessionId} active={isActive} {onExit} {onResize}
                onCwd={(c) => onPaneCwd(tab.sessionId, c)} onCommand={(c) => onPaneCommand(tab.sessionId, c)} onTitle={(t) => onPaneTitle(tab.sessionId, t)}
                onPreview={(raw) => previewFromTerminal(tab.sessionId, raw)} />
        {/snippet}
        {#snippet secondary()}
          <Grid sessionId={tab.splitSessionId!} active={isActive} onExit={onSplitExit}
                onCwd={(c) => onPaneCwd(tab.splitSessionId!, c)} onCommand={(c) => onPaneCommand(tab.splitSessionId!, c)} onTitle={(t) => onPaneTitle(tab.splitSessionId!, t)}
                onPreview={(raw) => previewFromTerminal(tab.splitSessionId!, raw)} />
        {/snippet}
      </SplitContainer>
    {:else}
      <Grid sessionId={tab.sessionId} active={isActive} {onExit} {onResize}
            onCwd={(c) => onPaneCwd(tab.sessionId, c)} onCommand={(c) => onPaneCommand(tab.sessionId, c)} onTitle={(t) => onPaneTitle(tab.sessionId, t)}
            onPreview={(raw) => previewFromTerminal(tab.sessionId, raw)} />
    {/if}
  </div>
  {#if tab.preview}
    <!-- Loaded on first use, so the preview code is not part of the startup bundle. -->
    {#await import("../preview/PreviewColumn.svelte") then m}
      <m.default tabId={tab.id} preview={tab.preview} active={isActive} bind:ratio={previewRatio} container={paneEl} />
    {/await}
  {/if}
</div>

<style>
  .tab-pane {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: row;
  }

  .terminals {
    flex: 1;
    min-width: 0;
    min-height: 0;
    position: relative;
    display: flex;
    flex-direction: column;
  }

  /* visibility:hidden keeps the element in layout (correct dimensions, no WebGL
     context loss) while hiding it from the user. display:none was causing
     xterm.js's internal ResizeObserver to measure 0-width cells and corrupt
     the TUI layout of running applications (e.g. Claude Code). */
  .tab-pane.hidden { visibility: hidden; pointer-events: none; }
</style>
