// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderMarkdown } from "./markdown.js";

async function render(src: string): Promise<{ html: string; root: HTMLElement }> {
  const frag = await renderMarkdown(src);
  const root = document.createElement("div");
  root.appendChild(frag);
  return { html: root.innerHTML, root };
}

describe("renderMarkdown sanitizing", () => {
  const hostile: [string, string][] = [
    ["an onerror handler", "<img src=x onerror=alert(1)>"],
    ["a javascript: link", "[x](javascript:alert(1))"],
    ["a mixed-case javascript: link", "[x](JaVaScRiPt:alert(1))"],
    ["an svg script", "<svg><script>alert(1)</script></svg>"],
    ["a data:text/html link", '<a href="data:text/html,<script>1</script>">x</a>'],
    ["a style block", "<style>*{display:none}</style>"],
    ["an inline style", '<p style="position:fixed">x</p>'],
    ["an iframe", '<iframe src="https://example.com"></iframe>'],
    ["a form", '<form action="https://evil.example"><button>go</button></form>'],
    ["an entity-encoded javascript: link", '<a href="&#106;avascript:alert(1)">x</a>'],
    ["a mailto link", "[x](mailto:a@b.c)"],
  ];

  it.each(hostile)("removes %s", async (_name, src) => {
    const { html } = await render(src);
    for (const bad of ["onerror", "javascript:", "<script", "<style", "<iframe", "<form", "data:text/html", "style=", "mailto:"]) {
      expect(html.toLowerCase()).not.toContain(bad);
    }
  });

  it("keeps only disabled checkboxes among inputs", async () => {
    const { root } = await render("- [x] done\n- [ ] todo\n\n<input type=text value=secret>");
    const inputs = [...root.querySelectorAll("input")];
    expect(inputs).toHaveLength(2);
    for (const i of inputs) {
      expect(i.getAttribute("type")).toBe("checkbox");
      expect(i.hasAttribute("disabled")).toBe(true);
    }
  });
});

describe("renderMarkdown output", () => {
  it("renders GitHub-flavoured Markdown", async () => {
    const { root } = await render(
      "| a | b |\n|---|---|\n| 1 | 2 |\n\n~~gone~~\n\nhttps://example.com\n\n<details><summary>s</summary>body</details>",
    );
    expect(root.querySelector("table td")?.textContent).toBe("1");
    expect(root.querySelector("del")?.textContent).toBe("gone");
    expect(root.querySelector('a[href="https://example.com"]')).not.toBeNull();
    expect(root.querySelector("details summary")?.textContent).toBe("s");
  });

  it("keeps relative and anchor links and inline images", async () => {
    const { root } = await render("[a](docs/a.md) [b](#top) ![i](data:image/png;base64,AAAA)");
    expect(root.querySelector('a[href="docs/a.md"]')).not.toBeNull();
    expect(root.querySelector('a[href="#top"]')).not.toBeNull();
    expect(root.querySelector("img")?.getAttribute("src")).toBe("data:image/png;base64,AAAA");
  });
});
