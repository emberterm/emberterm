/**
 * Where a duplicate goes: right after its source. Looked up after the spawn, because
 * the source may have moved (or been closed, -1) while the new shell started.
 */
export function duplicateIndex(tabs: { id: string }[], sourceId: string): number {
  const i = tabs.findIndex((t) => t.id === sourceId);
  return i < 0 ? -1 : i + 1;
}
