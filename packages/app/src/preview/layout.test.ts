import { describe, it, expect } from "vitest";
import { clampPreviewWidth, ratioFromPointer } from "./layout.js";

describe("clampPreviewWidth", () => {
  it("keeps the panel at least 240 px wide", () => {
    expect(clampPreviewWidth(100, 1000)).toBe(240);
  });

  it("leaves at least 240 px for the terminal", () => {
    expect(clampPreviewWidth(900, 1000)).toBe(760);
  });

  it("passes a width in range through", () => {
    expect(clampPreviewWidth(400, 1000)).toBe(400);
  });

  it("lets the terminal limit win in a very narrow tab, and never goes negative", () => {
    expect(clampPreviewWidth(500, 300)).toBe(60);
    expect(clampPreviewWidth(500, 100)).toBe(0);
  });
});

describe("ratioFromPointer", () => {
  it("turns a pointer position into the panel's share of the tab", () => {
    expect(ratioFromPointer(700, 0, 1000)).toBeCloseTo(0.3);
    expect(ratioFromPointer(800, 100, 1000)).toBeCloseTo(0.3);
  });

  it("clamps a drag past either edge", () => {
    expect(ratioFromPointer(5, 0, 1000)).toBeCloseTo(0.76);
    expect(ratioFromPointer(990, 0, 1000)).toBeCloseTo(0.24);
  });

  it("is zero for an empty container", () => {
    expect(ratioFromPointer(10, 0, 0)).toBe(0);
  });
});
