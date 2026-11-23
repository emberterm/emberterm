/** Narrowest the preview may be, and the room the terminal keeps. */
export const PREVIEW_MIN_PX = 240;

/** The panel's width in px, kept inside [240, container - 240]; the terminal's limit wins in a tiny tab. */
export function clampPreviewWidth(widthPx: number, containerPx: number): number {
  const max = Math.max(0, containerPx - PREVIEW_MIN_PX);
  return Math.min(Math.max(widthPx, PREVIEW_MIN_PX), max);
}

/** The panel's share of the tab (0–1) when the divider is dragged to `clientX`; the panel is on the right. */
export function ratioFromPointer(clientX: number, containerLeft: number, containerWidth: number): number {
  if (containerWidth <= 0) return 0;
  return clampPreviewWidth(containerLeft + containerWidth - clientX, containerWidth) / containerWidth;
}
