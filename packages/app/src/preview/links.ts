export type LinkAction =
  | { kind: "anchor"; id: string }
  | { kind: "markdown"; path: string }
  | { kind: "external"; url: string }
  | { kind: "blocked"; reason: string };

const MARKDOWN_EXT = /\.(md|markdown)$/i;

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // a literal "%" that is not an escape
  }
}

const withoutQueryAndFragment = (rel: string): string => rel.split(/[?#]/)[0];

/**
 * Resolves a link or image path against the document that contains it. `basePath` is a Windows
 * path (drive or `\\wsl.localhost\...`); the result uses `\` and never climbs above the drive or
 * share root.
 */
export function resolveRelative(basePath: string, rel: string): string {
  const unc = basePath.startsWith("\\\\") || basePath.startsWith("//");
  const parts = basePath.replace(/\//g, "\\").replace(/^\\\\/, "").split("\\").filter(Boolean);
  const keep = Math.min(unc ? 2 : 1, parts.length - 1);
  const target = decode(withoutQueryAndFragment(rel)).replace(/\\/g, "/");
  const out = target.startsWith("/") ? parts.slice(0, keep) : parts.slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length > keep) out.pop();
    } else {
      out.push(seg);
    }
  }
  return (unc ? "\\\\" : "") + out.join("\\");
}

/** What a click on a link in the document should do. Only Markdown files open in the panel. */
export function classifyLink(href: string, currentPath: string): LinkAction {
  const h = href.trim();
  if (h.startsWith("#")) return { kind: "anchor", id: decode(h.slice(1)) };
  if (/^https?:\/\//i.test(h)) return { kind: "external", url: h };
  if (!h || h.startsWith("//") || /^[a-z][a-z0-9+.-]*:/i.test(h)) {
    return { kind: "blocked", reason: "That kind of link is not opened from the preview" };
  }
  if (MARKDOWN_EXT.test(withoutQueryAndFragment(h))) {
    return { kind: "markdown", path: resolveRelative(currentPath, h) };
  }
  return { kind: "blocked", reason: "Only Markdown files open in the preview" };
}
