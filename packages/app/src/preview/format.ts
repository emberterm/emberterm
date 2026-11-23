/** Last part of a Windows or POSIX path. */
export function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

// 1 decimal below 10, none above, and no trailing ".0".
function trim(v: number): string {
  return v >= 10 || Number.isInteger(v) ? String(Math.round(v)) : v.toFixed(1);
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${trim(bytes / 1024)} KB`;
  return `${trim(bytes / (1024 * 1024))} MB`;
}
