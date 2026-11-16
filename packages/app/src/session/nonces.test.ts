import { describe, it, expect } from "vitest";
import { newNonce, setPaneNonce, getPaneNonce, forgetPaneNonce } from "./nonces.js";

describe("pane nonces", () => {
  it("newNonce is 32 hex characters and differs each time", () => {
    const a = newNonce();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newNonce()).not.toBe(a);
  });
  it("stores and forgets a nonce per session", () => {
    setPaneNonce("s1", "abc");
    expect(getPaneNonce("s1")).toBe("abc");
    expect(getPaneNonce("s2")).toBeUndefined();
    forgetPaneNonce("s1");
    expect(getPaneNonce("s1")).toBeUndefined();
  });
});
