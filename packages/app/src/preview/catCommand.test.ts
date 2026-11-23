import { describe, it, expect } from "vitest";
import { parseCatCommand } from "./catCommand.js";

describe("parseCatCommand", () => {
  it.each([
    ["cat README.md", "README.md"],
    ["bat -p docs/a.md", "docs/a.md"],
    ["bat --style=plain a.md", "a.md"],
    ['type "my notes.md"', "my notes.md"],
    ["cat 'a$b.md'", "a$b.md"],
    ["Get-Content .\\a.md", ".\\a.md"],
    ["get-content a.md", "a.md"],
    ["gc -Raw a.markdown", "a.markdown"],
    ["less README.MD", "README.MD"],
    ["more notes.md", "notes.md"],
    ["glow a.md", "a.md"],
    ["mdcat a.md", "a.md"],
    ["  cat   a.md  ", "a.md"],
  ])("opens %j", (cmd, file) => {
    expect(parseCatCommand(cmd)).toBe(file);
  });

  it.each([
    "cat a.md | grep x",
    "cat a.md b.md",
    "cat *.md",
    "cat a?.md",
    "cat a.md > b.txt",
    "cat < a.md",
    "cat a.md && ls",
    "cat a.md; rm x",
    "cat a.md &",
    "cat $HOME/a.md",
    'cat "$HOME/a.md"',
    "cat `pwd`/a.md",
    "cat $(pwd)/a.md",
    "cat a.txt",
    "cat",
    "cat -n",
    "cat 'a.md",
    "echo a.md",
    "ls README.md",
    "sudo cat a.md",
    "CAT a.md",
    "cat a.mdx",
    "bat -l md a.md",
    "",
  ])("ignores %j", (cmd) => {
    expect(parseCatCommand(cmd)).toBeNull();
  });
});
