<script lang="ts">
  import Grid from "./Grid.svelte";
  import { SplitContainer } from "@emberterm/ui";
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
</script>

<div class="tab-pane" class:hidden={!isActive}>
  {#if tab.splitSessionId}
    <SplitContainer direction={tab.splitDirection ?? "horizontal"} bind:ratio={splitRatio} onClose={onCloseSplit}>
      {#snippet primary()}
        <Grid sessionId={tab.sessionId} active={isActive} {onExit} {onResize}
              onCwd={(c) => onPaneCwd(tab.sessionId, c)} onCommand={(c) => onPaneCommand(tab.sessionId, c)} onTitle={(t) => onPaneTitle(tab.sessionId, t)} />
      {/snippet}
      {#snippet secondary()}
        <Grid sessionId={tab.splitSessionId!} active={isActive} onExit={onSplitExit}
              onCwd={(c) => onPaneCwd(tab.splitSessionId!, c)} onCommand={(c) => onPaneCommand(tab.splitSessionId!, c)} onTitle={(t) => onPaneTitle(tab.splitSessionId!, t)} />
      {/snippet}
    </SplitContainer>
  {:else}
    <Grid sessionId={tab.sessionId} active={isActive} {onExit} {onResize}
          onCwd={(c) => onPaneCwd(tab.sessionId, c)} onCommand={(c) => onPaneCommand(tab.sessionId, c)} onTitle={(t) => onPaneTitle(tab.sessionId, t)} />
  {/if}
</div>

<style>
  .tab-pane {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
  }

  /* visibility:hidden keeps the element in layout (correct dimensions, no WebGL
     context loss) while hiding it from the user. display:none was causing
     xterm.js's internal ResizeObserver to measure 0-width cells and corrupt
     the TUI layout of running applications (e.g. Claude Code). */
  .tab-pane.hidden { visibility: hidden; pointer-events: none; }
</style>
