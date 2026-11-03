import { describe, it, expect } from "vitest";
import { duplicateIndex } from "./duplicateTab.js";

const ts = ["a", "b", "c"].map((id) => ({ id }));

describe("duplicateIndex", () => {
  it("lands right after the source", () => {
    expect(duplicateIndex(ts, "a")).toBe(1);
    expect(duplicateIndex(ts, "b")).toBe(2);
  });
  it("is the last position for the last tab", () => {
    expect(duplicateIndex(ts, "c")).toBe(3);
  });
  it("is -1 when the source is gone", () => {
    expect(duplicateIndex(ts, "x")).toBe(-1);
  });
});
