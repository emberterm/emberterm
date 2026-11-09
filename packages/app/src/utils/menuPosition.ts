const MARGIN = 4;

// Clamp a context menu's top-left corner so its measured size stays inside the viewport.
export function clampMenu(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportW: number,
  viewportH: number,
): { left: number; top: number } {
  return {
    left: Math.max(MARGIN, Math.min(x, viewportW - width - MARGIN)),
    top: Math.max(MARGIN, Math.min(y, viewportH - height - MARGIN)),
  };
}
