// Svelte action: move the node to document.body. `.terminal-area` in App.svelte is an isolated
// stacking context, so a menu rendered inside it can never paint above the status bar.
// Svelte removes the node itself on destroy, wherever it lives.
export function portal(node: HTMLElement): void {
  document.body.appendChild(node);
}
