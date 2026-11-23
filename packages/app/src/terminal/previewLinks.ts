import type { IDisposable, Terminal } from "@xterm/xterm";

export interface MarkdownToken {
  text: string;
  /** Zero-based column of the first character. */
  start: number;
  /** Zero-based column after the last character. */
  end: number;
}

/**
 * Words in a terminal line that name a Markdown file. A full stop that ends a sentence is not part
 * of the name (`see a.md.`), and neither is `.mdx` or `a.md.bak`. Names with spaces are not found.
 */
export function findMarkdownTokens(line: string): MarkdownToken[] {
  const word = /[^\s"'`<>|*?()[\]{},;]+\.(?:md|markdown)(?![\w-]|\.\w)/gi;
  const found: MarkdownToken[] = [];
  for (const m of line.matchAll(word)) {
    // URLs belong to the web links addon.
    if (m[0].includes("://")) continue;
    found.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return found;
}

/** Makes Markdown file names in the output Ctrl+clickable (Cmd+click on macOS). */
export function registerPreviewLinks(term: Terminal, onOpen: (raw: string) => void): IDisposable {
  return term.registerLinkProvider({
    provideLinks(y, callback) {
      const line = term.buffer.active.getLine(y - 1);
      const links = line
        ? findMarkdownTokens(line.translateToString(true)).map((t) => ({
            range: { start: { x: t.start + 1, y }, end: { x: t.end, y } },
            text: t.text,
            activate: (event: MouseEvent) => {
              if (event.ctrlKey || event.metaKey) onOpen(t.text);
            },
          }))
        : [];
      callback(links.length ? links : undefined);
    },
  });
}
