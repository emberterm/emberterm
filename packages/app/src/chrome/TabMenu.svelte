<script lang="ts">
  import { onMount } from "svelte";

  interface Props {
    x: number;
    y: number;
    atStart: boolean;
    atEnd: boolean;
    onDuplicate: () => void;
    onMoveLeft: () => void;
    onMoveRight: () => void;
    onMoveStart: () => void;
    onMoveEnd: () => void;
    onClose: () => void;
  }

  let { x, y, atStart, atEnd, onDuplicate, onMoveLeft, onMoveRight, onMoveStart, onMoveEnd, onClose }: Props = $props();

  let menu: HTMLDivElement | undefined = $state();

  // Keep the menu on screen when opened near the right/bottom edge.
  const left = $derived(Math.max(4, Math.min(x, window.innerWidth - 164)));
  const top = $derived(Math.max(4, Math.min(y, window.innerHeight - 180)));

  onMount(() => menu?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());

  // Run first: closing clears the parent's menu state, which the move handlers read.
  function pick(action: () => void) {
    action();
    onClose();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(menu?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    if (items.length === 0) return;
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
  }
</script>

<svelte:window onmousedown={(e) => { if (!menu?.contains(e.target as Node)) onClose(); }} onblur={onClose} />

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div bind:this={menu} class="menu" role="menu" tabindex="-1" style="left:{left}px;top:{top}px" onkeydown={onKeydown}>
  <button role="menuitem" onclick={() => pick(onDuplicate)}>Duplicate</button>
  <hr />
  <button role="menuitem" disabled={atStart} onclick={() => pick(onMoveLeft)}>Move left</button>
  <button role="menuitem" disabled={atEnd} onclick={() => pick(onMoveRight)}>Move right</button>
  <hr />
  <button role="menuitem" disabled={atStart} onclick={() => pick(onMoveStart)}>Move to start</button>
  <button role="menuitem" disabled={atEnd} onclick={() => pick(onMoveEnd)}>Move to end</button>
</div>

<style>
  .menu {
    position: fixed;
    z-index: 800;
    min-width: 150px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    background: var(--bg-elev-2);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4);
    outline: none;
  }

  button {
    text-align: left;
    padding: 6px 10px;
    background: transparent;
    border: 0;
    border-radius: 5px;
    color: var(--fg);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
  }

  button:hover:not(:disabled), button:focus-visible { background: var(--accent-soft); outline: none; }
  button:disabled { color: var(--fg-muted); opacity: 0.5; cursor: default; }
  hr { margin: 4px 2px; border: 0; border-top: 1px solid var(--border); }
</style>
