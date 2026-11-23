import { describe, it, expect } from "vitest";
import { openPath, goBack, goForward, canBack, canForward, previewPath, withSize } from "./previewState.js";

describe("previewState", () => {
  it("starts a history with the first file", () => {
    const p = openPath(undefined, "D:\\a.md");
    expect(p.history).toEqual(["D:\\a.md"]);
    expect(p.index).toBe(0);
    expect(previewPath(p)).toBe("D:\\a.md");
  });

  it("goes back and forward through opened files", () => {
    const p = openPath(openPath(undefined, "a"), "b");
    expect(previewPath(p)).toBe("b");
    expect(canBack(p)).toBe(true);
    expect(canForward(p)).toBe(false);
    const back = goBack(p);
    expect(previewPath(back)).toBe("a");
    expect(canForward(back)).toBe(true);
    expect(previewPath(goForward(back))).toBe("b");
  });

  it("opening after going back drops the forward entries", () => {
    let p = openPath(openPath(undefined, "a"), "b");
    p = openPath(goBack(p), "c");
    expect(p.history).toEqual(["a", "c"]);
    expect(canForward(p)).toBe(false);
  });

  it("opening the current file again adds nothing", () => {
    const p = openPath(undefined, "a");
    expect(openPath(p, "a")).toBe(p);
  });

  it("does not move past either end", () => {
    const p = openPath(undefined, "a");
    expect(goBack(p)).toBe(p);
    expect(goForward(p)).toBe(p);
  });

  it("forgets the size when the file changes and keeps it otherwise", () => {
    const sized = withSize(openPath(undefined, "a"), 4096);
    expect(sized.size).toBe(4096);
    expect(openPath(sized, "b").size).toBeUndefined();
    expect(goBack(openPath(sized, "b")).size).toBeUndefined();
  });
});
