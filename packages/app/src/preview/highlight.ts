import type { HLJSApi, LanguageFn } from "highlight.js";

// Only these load: the full highlight.js is several times larger. `ini` also covers TOML and
// `xml` covers HTML; each module registers its own aliases (js, ts, sh, yml, md, ...).
const LANGUAGES: Record<string, () => Promise<{ default: LanguageFn }>> = {
  javascript: () => import("highlight.js/lib/languages/javascript"),
  typescript: () => import("highlight.js/lib/languages/typescript"),
  json: () => import("highlight.js/lib/languages/json"),
  bash: () => import("highlight.js/lib/languages/bash"),
  powershell: () => import("highlight.js/lib/languages/powershell"),
  rust: () => import("highlight.js/lib/languages/rust"),
  go: () => import("highlight.js/lib/languages/go"),
  python: () => import("highlight.js/lib/languages/python"),
  yaml: () => import("highlight.js/lib/languages/yaml"),
  ini: () => import("highlight.js/lib/languages/ini"),
  xml: () => import("highlight.js/lib/languages/xml"),
  css: () => import("highlight.js/lib/languages/css"),
  diff: () => import("highlight.js/lib/languages/diff"),
  sql: () => import("highlight.js/lib/languages/sql"),
  markdown: () => import("highlight.js/lib/languages/markdown"),
};

let loaded: Promise<HLJSApi> | undefined;

function load(): Promise<HLJSApi> {
  loaded ??= (async () => {
    const { default: hljs } = await import("highlight.js/lib/core");
    await Promise.all(
      Object.entries(LANGUAGES).map(async ([name, loadLanguage]) => {
        hljs.registerLanguage(name, (await loadLanguage()).default);
      }),
    );
    return hljs;
  })();
  return loaded;
}

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** HTML for `code` coloured as `lang`; unknown or missing languages come back as escaped plain text. */
export async function highlightCode(code: string, lang: string | undefined): Promise<string> {
  const hljs = await load();
  const name = lang?.toLowerCase();
  if (name && hljs.getLanguage(name)) return hljs.highlight(code, { language: name, ignoreIllegals: true }).value;
  return escapeHtml(code);
}

/** Colours every `<pre><code class="language-x">` under `root` whose language is known. */
export async function highlightFragment(root: ParentNode): Promise<void> {
  const blocks = [...root.querySelectorAll<HTMLElement>("pre > code")].flatMap((code) => {
    const lang = /(?:^|\s)language-([\w+-]+)/.exec(code.className)?.[1];
    return lang ? [{ code, lang }] : [];
  });
  if (!blocks.length) return; // no code, so highlight.js is never loaded
  const hljs = await load();
  for (const { code, lang } of blocks) {
    if (!hljs.getLanguage(lang.toLowerCase())) continue;
    code.innerHTML = await highlightCode(code.textContent ?? "", lang);
    code.classList.add("hljs");
  }
}
