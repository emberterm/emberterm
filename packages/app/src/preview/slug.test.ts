// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { slugify, assignHeadingIds } from "./slug.js";

describe("slugify", () => {
  it("lowercases, drops punctuation and joins words with hyphens", () => {
    expect(slugify("Hello, World!", new Map())).toBe("hello-world");
    expect(slugify("  Set up   (Windows) ", new Map())).toBe("set-up-windows");
    expect(slugify("Über uns", new Map())).toBe("über-uns");
  });

  it("numbers repeats like GitHub does", () => {
    const seen = new Map<string, number>();
    expect(slugify("Hello", seen)).toBe("hello");
    expect(slugify("Hello", seen)).toBe("hello-1");
    expect(slugify("Hello", seen)).toBe("hello-2");
  });
});

describe("assignHeadingIds", () => {
  it("sets an id on every heading", () => {
    const root = document.createElement("div");
    root.innerHTML = "<h1>Intro</h1><h2>Setup</h2><h2>Setup</h2><p>x</p>";
    assignHeadingIds(root);
    expect([...root.querySelectorAll("h1,h2")].map((h) => h.id)).toEqual(["intro", "setup", "setup-1"]);
  });
});
