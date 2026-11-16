import { describe, it, expect } from "vitest";
import { HISTORY_MAX, appendCommand, shouldRecord } from "./history.js";

describe("shouldRecord", () => {
  it("accepts an ordinary command", () => {
    expect(shouldRecord("ls")).toBe(true);
    expect(shouldRecord("echo token")).toBe(true);
  });
  it("rejects empty, leading-space, multi-line and oversize commands", () => {
    for (const c of ["", "   ", " ls", "a\nb", "x".repeat(1001)]) expect(shouldRecord(c)).toBe(false);
  });
  it("accepts a command at the length limit", () => {
    expect(shouldRecord("x".repeat(1000))).toBe(true);
  });
  it("rejects commands that look like they carry a secret", () => {
    for (const c of [
      "export TOKEN=abc",
      "curl -H 'Authorization: Bearer x'",
      "PASSWORD=1 ./run",
      "set api_key=1",
      "echo secret: 1",
    ]) expect(shouldRecord(c)).toBe(false);
  });
});

describe("appendCommand", () => {
  it("appends the newest last", () => {
    expect(appendCommand(["a"], "b")).toEqual(["a", "b"]);
  });
  it("drops a consecutive duplicate but keeps a later repeat", () => {
    expect(appendCommand(["a", "b"], "b")).toEqual(["a", "b"]);
    expect(appendCommand(["a", "b"], "a")).toEqual(["a", "b", "a"]);
  });
  it("keeps only the newest max entries", () => {
    const full = Array.from({ length: HISTORY_MAX }, (_, i) => `c${i}`);
    const next = appendCommand(full, "new");
    expect(next).toHaveLength(HISTORY_MAX);
    expect(next[0]).toBe("c1");
    expect(next.at(-1)).toBe("new");
  });
  it("trims an over-long input list", () => {
    const long = Array.from({ length: 15 }, (_, i) => `c${i}`);
    expect(appendCommand(long, "new")).toHaveLength(HISTORY_MAX);
  });
});
