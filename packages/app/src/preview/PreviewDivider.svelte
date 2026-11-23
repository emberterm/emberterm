<script lang="ts">
  interface Props {
    /** Called with the pointer's x position while the divider is dragged. */
    onDrag: (clientX: number) => void;
  }

  let { onDrag }: Props = $props();
  let dragging = $state(false);

  function onMouseDown(e: MouseEvent) {
    e.preventDefault();
    dragging = true;
    const move = (m: MouseEvent) => onDrag(m.clientX);
    const up = () => {
      dragging = false;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }
</script>

<!-- Mouse-only drag handle, like the terminal split divider. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="divider" class:dragging role="separator" aria-orientation="vertical" aria-label="Resize preview" tabindex="-1" onmousedown={onMouseDown}></div>

<style>
  .divider {
    flex: 0 0 5px;
    cursor: col-resize;
    background: var(--border);
  }
  .divider:hover, .divider.dragging { background: var(--accent-soft); }
</style>
