import { describe, it, expect, vi } from "vitest";
import { get } from "svelte/store";

const h = vi.hoisted(() => ({
  check: vi.fn(async (_opts?: unknown) => null as unknown),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({ check: h.check }));
vi.mock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn(async () => {}) }));
vi.mock("../ipc/client.js", () => ({
  releasesFetch: vi.fn(async () => []),
  sessionBusy: vi.fn(async () => false),
}));

import { toasts } from "./app.js";
import { checkForUpdate, installUpdate, updateState } from "./update.js";

describe("the app's updater", () => {
  it("gives the check a timeout, so a stalled request cannot leave the Check button disabled", async () => {
    await checkForUpdate();
    expect(h.check).toHaveBeenCalledWith({ timeout: 30_000 });
  });

  it("shows a failed install as a toast too, for when Settings is closed", async () => {
    h.check.mockResolvedValueOnce({
      version: "2.0.0", currentVersion: "1.2.0", date: undefined, body: "",
      download: async () => { throw new Error("signature mismatch"); },
      install: async () => {}, close: async () => {},
    });
    toasts.set([]);
    await checkForUpdate();
    expect(get(updateState).kind).toBe("available");
    await installUpdate();
    expect(get(toasts).map((t) => t.message)).toEqual(["Update failed: signature mismatch"]);
  });
});
