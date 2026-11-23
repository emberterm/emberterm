import { describe, it, expect } from "vitest";
import { shortcutFor, SHORTCUTS, type KeyInfo } from "./shortcuts.js";

const ev = (over: Partial<KeyInfo>): KeyInfo => ({
  key: "", code: "", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...over,
});

describe("shortcutFor", () => {
  it("maps the documented chords", () => {
    expect(shortcutFor(ev({ ctrlKey: true, shiftKey: true, key: "T", code: "KeyT" }))).toBe("newTab");
    expect(shortcutFor(ev({ ctrlKey: true, shiftKey: true, key: "W", code: "KeyW" }))).toBe("closeTab");
    expect(shortcutFor(ev({ ctrlKey: true, shiftKey: true, key: "P", code: "KeyP" }))).toBe("palette");
    expect(shortcutFor(ev({ ctrlKey: true, key: ",", code: "Comma" }))).toBe("settings");
  });

  it("Ctrl+Shift+M toggles the Markdown preview", () => {
    expect(shortcutFor(ev({ ctrlKey: true, shiftKey: true, key: "M", code: "KeyM" }))).toBe("previewFile");
    expect(SHORTCUTS.find((s) => s.action === "previewFile")?.keys).toBe("Ctrl+Shift+M");
  });

  it("uses Cmd the same way as Ctrl", () => {
    expect(shortcutFor(ev({ metaKey: true, shiftKey: true, key: "T", code: "KeyT" }))).toBe("newTab");
  });

  it("Ctrl+Tab goes forward and Ctrl+Shift+Tab goes back", () => {
    expect(shortcutFor(ev({ ctrlKey: true, key: "Tab", code: "Tab" }))).toBe("nextTab");
    expect(shortcutFor(ev({ ctrlKey: true, shiftKey: true, key: "Tab", code: "Tab" }))).toBe("prevTab");
  });

  it("Ctrl+Shift+PageUp/PageDown move the tab", () => {
    expect(shortcutFor(ev({ ctrlKey: true, shiftKey: true, key: "PageUp", code: "PageUp" }))).toBe("moveTabLeft");
    expect(shortcutFor(ev({ ctrlKey: true, shiftKey: true, key: "PageDown", code: "PageDown" }))).toBe("moveTabRight");
    expect(shortcutFor(ev({ ctrlKey: true, key: "PageUp", code: "PageUp" }))).toBeNull(); // needs Shift
  });

  it("splits work on a US layout, where Shift changes the key value", () => {
    expect(shortcutFor(ev({ ctrlKey: true, shiftKey: true, key: "|", code: "Backslash" }))).toBe("splitHorizontal");
    expect(shortcutFor(ev({ ctrlKey: true, shiftKey: true, key: "_", code: "Minus" }))).toBe("splitVertical");
  });

  it("ignores near misses", () => {
    expect(shortcutFor(ev({ ctrlKey: true, key: "t", code: "KeyT" }))).toBeNull(); // needs Shift
    expect(shortcutFor(ev({ key: "Tab", code: "Tab" }))).toBeNull(); // needs Ctrl
    expect(shortcutFor(ev({ ctrlKey: true, altKey: true, shiftKey: true, key: "T", code: "KeyT" }))).toBeNull();
    expect(shortcutFor(ev({ shiftKey: true, key: "T", code: "KeyT" }))).toBeNull();
  });
});

describe("SHORTCUTS table", () => {
  it("has a unique action and a non-empty label and keys for every entry", () => {
    const actions = SHORTCUTS.map((s) => s.action);
    expect(new Set(actions).size).toBe(actions.length);
    for (const s of SHORTCUTS) {
      expect(s.label).not.toBe("");
      expect(s.keys).not.toBe("");
    }
  });

  it("does not mention features that no longer exist", () => {
    const text = SHORTCUTS.map((s) => s.label.toLowerCase()).join(" ");
    expect(text).not.toMatch(/diff|approv|deny|agent/);
  });
});
