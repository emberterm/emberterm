// Programs that show a file as text. Only these may open the preview by themselves.
const COMMANDS = new Set(["cat", "bat", "less", "more", "type", "glow", "mdcat"]);
// PowerShell command names are not case-sensitive.
const POWERSHELL = new Set(["get-content", "gc"]);
// Anything the shell would expand, redirect, chain or substitute: the file it names is not what
// was typed, so the command is left alone.
const SHELL_SYNTAX = "|><&;`$*?()";
const MARKDOWN = /\.(md|markdown)$/i;

/** Splits a command line into words; null when it uses shell syntax or has an open quote. */
function words(cmd: string): string[] | null {
  const out: string[] = [];
  let word = "";
  let inWord = false;
  let quote: string | null = null;
  for (const ch of cmd) {
    if (quote) {
      if (ch === quote) quote = null;
      // Inside double quotes the shell still expands $ and backticks.
      else if (quote === '"' && (ch === "$" || ch === "`")) return null;
      else word += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      inWord = true;
    } else if (/\s/.test(ch)) {
      if (inWord) out.push(word);
      word = "";
      inWord = false;
    } else if (SHELL_SYNTAX.includes(ch)) {
      return null;
    } else {
      word += ch;
      inWord = true;
    }
  }
  if (quote) return null;
  if (inWord) out.push(word);
  return out;
}

/**
 * The file a command like `cat README.md` shows, when it is exactly one Markdown file and nothing
 * else (flags are skipped). Anything with a pipe, redirect, glob, variable, a second file, or a
 * different program returns null.
 */
export function parseCatCommand(cmd: string): string | null {
  const parts = words(cmd);
  if (!parts?.length) return null;
  const [name, ...args] = parts;
  if (!COMMANDS.has(name) && !POWERSHELL.has(name.toLowerCase())) return null;
  const files = args.filter((a) => !a.startsWith("-"));
  return files.length === 1 && MARKDOWN.test(files[0]) ? files[0] : null;
}
