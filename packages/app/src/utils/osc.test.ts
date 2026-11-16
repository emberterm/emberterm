import { describe, it, expect } from "vitest";
import { OSC52_MAX_CHARS, parseOsc7, parseOsc52, parseOsc133, parseOsc133Command } from "./osc.js";

describe("parseOsc133Command", () => {
  const N = "abc123";
  it("decodes the percent-encoded command", () => {
    expect(parseOsc133Command(`E;${N};ls%20-la`, N)).toBe("ls -la");
    expect(parseOsc133Command(`E;${N};echo%20%27a%3Bb%25c%27`, N)).toBe("echo 'a;b%c'");
    expect(parseOsc133Command(`E;${N};%E4%BD%A0`, N)).toBe("你");
  });
  it("keeps a command that contains ; after the nonce", () => {
    expect(parseOsc133Command(`E;${N};a;b`, N)).toBe("a;b");
  });
  it("keeps raw text that is not valid encoding", () => {
    expect(parseOsc133Command(`E;${N};%ZZ`, N)).toBe("%ZZ");
  });
  it("ignores marks a program printed: no nonce, wrong nonce, or no expected nonce", () => {
    expect(parseOsc133Command("E;ls", N)).toBeNull();
    expect(parseOsc133Command("E;zzz;ls", N)).toBeNull();
    expect(parseOsc133Command(`E;${N}x;ls`, N)).toBeNull();
    expect(parseOsc133Command(`E;${N};ls`, "")).toBeNull();
  });
  it("ignores the busy marks, and the busy parser ignores E", () => {
    for (const m of ["C", "A", "D;0", "B", ""]) expect(parseOsc133Command(m, N)).toBeNull();
    expect(parseOsc133(`E;${N};x`)).toBeNull();
  });
});

describe("parseOsc7", () => {
  it("reads a Git Bash MSYS path", () => {
    expect(parseOsc7("file://localhost/d/code/api")).toBe("/d/code/api");
  });
  it("reads a path with an empty host", () => {
    expect(parseOsc7("file:///home/arifin")).toBe("/home/arifin");
  });
  it("drops the slash before a Windows drive letter (pwsh)", () => {
    expect(parseOsc7("file://localhost/D:/code/api")).toBe("D:/code/api");
  });
  it("keeps spaces and # as-is", () => {
    expect(parseOsc7("file://localhost/D:/my #1 dir")).toBe("D:/my #1 dir");
    expect(parseOsc7("file://localhost/d/a b")).toBe("/d/a b");
  });
  it("percent-decodes encoded paths", () => {
    expect(parseOsc7("file://host/home/a%20b")).toBe("/home/a b");
  });
  it("keeps a literal % that is not valid encoding", () => {
    expect(parseOsc7("file://localhost/d/100%")).toBe("/d/100%");
  });
  it("rejects non-file payloads", () => {
    expect(parseOsc7("http://x/y")).toBeNull();
    expect(parseOsc7("file://hostonly")).toBeNull();
    expect(parseOsc7("")).toBeNull();
  });
});

describe("parseOsc52", () => {
  it("decodes a clipboard write", () => {
    expect(parseOsc52("c;" + btoa("hello"))).toBe("hello");
  });
  it("decodes UTF-8 text", () => {
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode("héllo ✓")));
    expect(parseOsc52("c;" + b64)).toBe("héllo ✓");
  });
  it("ignores clipboard read requests", () => {
    expect(parseOsc52("c;?")).toBeNull();
  });
  it("refuses payloads over the size cap", () => {
    expect(parseOsc52("c;" + btoa("a".repeat(OSC52_MAX_CHARS)))).toBe("a".repeat(OSC52_MAX_CHARS));
    expect(parseOsc52("c;" + btoa("a".repeat(OSC52_MAX_CHARS + 1)))).toBeNull();
  });
  it("ignores malformed payloads", () => {
    expect(parseOsc52("c")).toBeNull();
    expect(parseOsc52("c;%%%")).toBeNull();
  });
});

describe("parseOsc133", () => {
  it("C means a command started, A and D mean the shell is back at a prompt", () => {
    expect(parseOsc133("C")).toBe(true);
    expect(parseOsc133("A")).toBe(false);
    expect(parseOsc133("D;0")).toBe(false);
  });
  it("ignores other marks and junk", () => {
    expect(parseOsc133("B")).toBeNull();
    expect(parseOsc133("")).toBeNull();
    expect(parseOsc133("X;1")).toBeNull();
  });
});
