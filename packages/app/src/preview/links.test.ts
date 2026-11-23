import { describe, it, expect } from "vitest";
import { resolveRelative, classifyLink } from "./links.js";

const DOC = "D:\\code\\api\\README.md";

describe("resolveRelative", () => {
  it("joins to the document's folder", () => {
    expect(resolveRelative(DOC, "docs/setup.md")).toBe("D:\\code\\api\\docs\\setup.md");
    expect(resolveRelative(DOC, "./a.md")).toBe("D:\\code\\api\\a.md");
  });

  it("walks up, but never above the drive root", () => {
    expect(resolveRelative(DOC, "../x.md")).toBe("D:\\code\\x.md");
    expect(resolveRelative(DOC, "../../../../x.md")).toBe("D:\\x.md");
  });

  it("decodes percent escapes and drops the query and fragment", () => {
    expect(resolveRelative(DOC, "a%20b.md#h")).toBe("D:\\code\\api\\a b.md");
    expect(resolveRelative(DOC, "a.md?x=1")).toBe("D:\\code\\api\\a.md");
    expect(resolveRelative(DOC, "100%.md")).toBe("D:\\code\\api\\100%.md");
  });

  it("keeps a WSL share as the root", () => {
    const wsl = "\\\\wsl.localhost\\Ubuntu\\home\\u\\a.md";
    expect(resolveRelative(wsl, "../b.md")).toBe("\\\\wsl.localhost\\Ubuntu\\home\\b.md");
    expect(resolveRelative(wsl, "../../../../../../b.md")).toBe("\\\\wsl.localhost\\Ubuntu\\b.md");
  });

  it("treats a leading slash as the root of the drive", () => {
    expect(resolveRelative(DOC, "/x/y.md")).toBe("D:\\x\\y.md");
  });
});

describe("classifyLink", () => {
  it("sends #anchors to the page", () => {
    expect(classifyLink("#intro", DOC)).toEqual({ kind: "anchor", id: "intro" });
    expect(classifyLink("#a%20b", DOC)).toEqual({ kind: "anchor", id: "a b" });
  });

  it("sends http and https to the browser", () => {
    expect(classifyLink("https://x.dev/a", DOC)).toEqual({ kind: "external", url: "https://x.dev/a" });
    expect(classifyLink("HTTP://x.dev", DOC)).toMatchObject({ kind: "external" });
  });

  it("opens relative Markdown files in the panel", () => {
    expect(classifyLink("docs/a.MD", DOC)).toEqual({ kind: "markdown", path: "D:\\code\\api\\docs\\a.MD" });
    expect(classifyLink("a.markdown#top", DOC)).toEqual({ kind: "markdown", path: "D:\\code\\api\\a.markdown" });
  });

  it.each(["a.pdf", "../.ssh/id_rsa", "mailto:a@b.c", "file:///c:/x", "ftp://x/a.md", "//host/a.md", "javascript:alert(1)", ""])(
    "blocks %j",
    (href) => {
      expect(classifyLink(href, DOC).kind).toBe("blocked");
    },
  );
});
