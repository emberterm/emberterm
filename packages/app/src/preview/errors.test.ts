import { describe, it, expect } from "vitest";
import { previewErrorMessage } from "./errors.js";

describe("previewErrorMessage", () => {
  it("names the size limit", () => {
    expect(previewErrorMessage({ code: "too_large", limit: 1_048_576 })).toContain("1 MB");
  });

  it("explains each code in plain words", () => {
    expect(previewErrorMessage({ code: "not_found" })).toMatch(/not found/i);
    expect(previewErrorMessage({ code: "not_markdown" })).toMatch(/markdown/i);
    expect(previewErrorMessage({ code: "not_an_image" })).toMatch(/image/i);
    expect(previewErrorMessage({ code: "not_a_file" })).toMatch(/file/i);
  });

  it("passes on the reason or message the backend gave", () => {
    expect(previewErrorMessage({ code: "unresolvable", reason: "network paths are not previewed" })).toBe(
      "network paths are not previewed",
    );
    expect(previewErrorMessage({ code: "io", message: "access denied" })).toBe("access denied");
  });

  it("falls back for anything else", () => {
    expect(previewErrorMessage(undefined)).toMatch(/preview/i);
    expect(previewErrorMessage("boom")).toMatch(/preview/i);
    expect(previewErrorMessage({ code: "weird" })).toMatch(/preview/i);
  });
});
