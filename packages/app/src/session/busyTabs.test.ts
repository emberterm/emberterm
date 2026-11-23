import { describe, it, expect } from "vitest";
import { countBusyTabs } from "./busyTabs.js";

const busyIds = (...ids: string[]) => async (id: string) => ids.includes(id);

describe("countBusyTabs", () => {
  it("counts the tabs with a busy pane, primary or split", async () => {
    const tabs = [
      { sessionId: "a" },
      { sessionId: "b", splitSessionId: "b2" },
      { sessionId: "c" },
    ];
    expect(await countBusyTabs(tabs, busyIds("a", "b2"))).toBe(2);
  });

  it("counts a tab once even when both panes are busy", async () => {
    expect(await countBusyTabs([{ sessionId: "a", splitSessionId: "a2" }], busyIds("a", "a2"))).toBe(1);
  });

  it("treats a failing check as idle, like closing a tab does", async () => {
    const isBusy = async (id: string) => {
      if (id === "bad") throw new Error("no such session");
      return id === "a";
    };
    expect(await countBusyTabs([{ sessionId: "bad" }, { sessionId: "a" }], isBusy)).toBe(1);
  });

  it("is 0 with no tabs or no busy panes", async () => {
    expect(await countBusyTabs([], busyIds())).toBe(0);
    expect(await countBusyTabs([{ sessionId: "a" }], busyIds())).toBe(0);
  });
});
