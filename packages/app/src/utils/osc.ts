/**
 * Extracts the filesystem path from an OSC 7 payload (`file://<host>/<path>`).
 * Our prompt hooks emit raw paths, so decoding is best-effort: a literal `%`
 * that is not valid percent-encoding is kept as-is.
 */
export function parseOsc7(data: string): string | null {
  if (!data.startsWith("file://")) return null;
  const rest = data.slice("file://".length);
  const slash = rest.indexOf("/");
  if (slash < 0) return null;
  let path = rest.slice(slash);
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep the raw path
  }
  // pwsh reports `/D:/x`; Windows needs `D:/x`.
  if (/^\/[A-Za-z]:(\/|$)/.test(path)) path = path.slice(1);
  return path;
}

/** Largest OSC 52 payload accepted, in bytes after decoding: a program should not fill the clipboard. */
export const OSC52_MAX_CHARS = 100_000;

/** Decodes an OSC 52 clipboard *write* (`<target>;<base64>`). Reads (`?`) and oversize payloads are refused. */
export function parseOsc52(data: string): string | null {
  const sep = data.indexOf(";");
  if (sep < 0) return null;
  const b64 = data.slice(sep + 1);
  if (!b64 || b64 === "?") return null;
  if (b64.length > Math.ceil(OSC52_MAX_CHARS / 3) * 4) return null;
  try {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    if (bytes.length > OSC52_MAX_CHARS) return null;
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * OSC 133 prompt marks from our bash hook: `C` = a command started (busy), `A` / `D` = the shell
 * is back at a prompt (idle). Anything else (e.g. `B`) says nothing about busyness.
 */
export function parseOsc133(data: string): boolean | null {
  const mark = data.split(";")[0];
  if (mark === "C") return true;
  if (mark === "A" || mark === "D") return false;
  return null;
}

/**
 * OSC 133;E from our prompt hooks: the command that just ran, percent-encoded so `;`, ESC and
 * newlines cannot end the sequence. Returns null for every other mark.
 */
export function parseOsc133Command(data: string): string | null {
  if (!data.startsWith("E;")) return null;
  const raw = data.slice(2);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
