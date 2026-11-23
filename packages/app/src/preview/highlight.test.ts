// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { highlightCode, highlightFragment } from "./highlight.js";

describe("highlightCode", () => {
  it("highlights a known language", async () => {
    expect(await highlightCode("const a = 1;", "ts")).toContain("hljs-keyword");
  });

  it("knows the common aliases and TOML", async () => {
    expect(await highlightCode("echo hi", "sh")).toContain("hljs-built_in");
    expect(await highlightCode("[a]\nb = 1", "toml")).toContain("hljs-");
    expect(await highlightCode("fn main() {}", "RUST")).toContain("hljs-keyword");
  });

  it("escapes the text of an unknown language", async () => {
    expect(await highlightCode("<b>x</b>", "nope")).toBe("&lt;b&gt;x&lt;/b&gt;");
  });

  it("escapes the text when no language is given", async () => {
    expect(await highlightCode("a & b", "")).toBe("a &amp; b");
    expect(await highlightCode("a & b", undefined)).toBe("a &amp; b");
  });

  it("never lets code turn into markup", async () => {
    const out = await highlightCode('<img src=x onerror="alert(1)">', "html");
    expect(out).not.toContain("<img");
  });
});

describe("highlightFragment", () => {
  it("highlights code blocks that name a language", async () => {
    const root = document.createElement("div");
    root.innerHTML = '<pre><code class="language-json">{"a":1}</code></pre>';
    await highlightFragment(root);
    const code = root.querySelector("code")!;
    expect(code.querySelector(".hljs-attr")?.textContent).toBe('"a"');
    expect(code.classList.contains("hljs")).toBe(true);
    expect(code.textContent).toBe('{"a":1}');
  });

  it("leaves blocks without a known language as they are", async () => {
    const root = document.createElement("div");
    root.innerHTML = "<pre><code>plain &lt;text&gt;</code></pre><pre><code class=\"language-nope\">x &lt; y</code></pre><p>hi</p>";
    const before = root.innerHTML;
    await highlightFragment(root);
    expect(root.innerHTML).toBe(before);
  });
});
