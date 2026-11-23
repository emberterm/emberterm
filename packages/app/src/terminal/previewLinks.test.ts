import { describe, it, expect } from "vitest";
import { findMarkdownTokens } from "./previewLinks.js";

const texts = (line: string) => findMarkdownTokens(line).map((t) => t.text);

describe("findMarkdownTokens", () => {
  it("finds a Markdown file in ls output, with its column range", () => {
    expect(findMarkdownTokens("README.md  docs/ src/")).toEqual([{ text: "README.md", start: 0, end: 9 }]);
  });

  it("does not take the full stop that ends a sentence", () => {
    expect(findMarkdownTokens("see ./docs/a.md.")).toEqual([{ text: "./docs/a.md", start: 4, end: 15 }]);
  });

  it("matches both extensions in any case, and Windows and POSIX paths", () => {
    expect(texts("C:\\x\\a.MD")).toEqual(["C:\\x\\a.MD"]);
    expect(texts("/d/code/notes.markdown")).toEqual(["/d/code/notes.markdown"]);
    expect(texts("~/n.md ../up.md")).toEqual(["~/n.md", "../up.md"]);
  });

  it("finds each file of several", () => {
    expect(texts("a.md b.md")).toEqual(["a.md", "b.md"]);
  });

  it("stops at the colon of grep-style output", () => {
    expect(texts("README.md:12: todo")).toEqual(["README.md"]);
  });

  it("ignores other extensions and names that only start with .md", () => {
    expect(texts("a.mdx notes.txt readme.md.bak")).toEqual([]);
  });

  it("leaves URLs to the web links addon", () => {
    expect(texts("https://example.com/readme.md")).toEqual([]);
  });

  it("finds nothing in an empty line", () => {
    expect(texts("")).toEqual([]);
  });
});
