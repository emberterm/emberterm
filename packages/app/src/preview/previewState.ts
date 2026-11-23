/** Which file a tab's preview panel shows, and the files opened before and after it. */
export interface PreviewState {
  history: string[];
  index: number;
  /** Size in bytes of the file now shown; filled in once it is read. */
  size?: number;
}

export function previewPath(p: PreviewState): string {
  return p.history[p.index];
}

/** Opens `path`, dropping any forward entries. Opening the file already shown changes nothing. */
export function openPath(p: PreviewState | undefined, path: string): PreviewState {
  if (!p) return { history: [path], index: 0 };
  if (previewPath(p) === path) return p;
  const history = [...p.history.slice(0, p.index + 1), path];
  return { history, index: history.length - 1 };
}

export const canBack = (p: PreviewState): boolean => p.index > 0;
export const canForward = (p: PreviewState): boolean => p.index < p.history.length - 1;

export function goBack(p: PreviewState): PreviewState {
  return canBack(p) ? { ...p, index: p.index - 1, size: undefined } : p;
}

export function goForward(p: PreviewState): PreviewState {
  return canForward(p) ? { ...p, index: p.index + 1, size: undefined } : p;
}

export function withSize(p: PreviewState, size: number): PreviewState {
  return { ...p, size };
}
