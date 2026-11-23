import { describe, it, expect } from "vitest";
import { basename, formatSize, previewLabel } from "./format.js";

describe("formatSize", () => {
  it("uses bytes, KB and MB", () => {
    expect(formatSize(500)).toBe("500 B");
    expect(formatSize(4096)).toBe("4 KB");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(1_048_576)).toBe("1 MB");
    expect(formatSize(1_258_291)).toBe("1.2 MB");
  });
});

describe("basename", () => {
  it("handles both separators and UNC paths", () => {
    expect(basename("D:\\code\\api\\README.md")).toBe("README.md");
    expect(basename("D:/code/api/README.md")).toBe("README.md");
    expect(basename("\\\\wsl.localhost\\Ubuntu\\home\\u\\a.md")).toBe("a.md");
    expect(basename("a.md")).toBe("a.md");
  });
});

describe("previewLabel", () => {
  it("names the file and, once known, its size", () => {
    expect(previewLabel(undefined)).toBe("");
    expect(previewLabel({ history: ["D:/code/README.md"], index: 0 })).toBe("README.md");
    expect(previewLabel({ history: ["D:/code/README.md"], index: 0, size: 4096 })).toBe("README.md · 4 KB");
  });
});
