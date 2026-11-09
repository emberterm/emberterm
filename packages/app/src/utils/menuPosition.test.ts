import { describe, expect, it } from "vitest";

import { clampMenu } from "./menuPosition";

describe("clampMenu", () => {
  it("keeps the cursor position when the menu fits", () => {
    expect(clampMenu(100, 80, 150, 120, 800, 600)).toEqual({ left: 100, top: 80 });
  });

  it("shifts up and left so the real size fits at the bottom-right corner", () => {
    expect(clampMenu(790, 595, 150, 160, 800, 600)).toEqual({ left: 646, top: 436 });
  });

  it("never goes past the top-left margin when the menu is larger than the viewport", () => {
    expect(clampMenu(50, 50, 900, 700, 800, 600)).toEqual({ left: 4, top: 4 });
  });

  it("pulls negative coordinates back to the margin", () => {
    expect(clampMenu(-10, -10, 150, 120, 800, 600)).toEqual({ left: 4, top: 4 });
  });
});
