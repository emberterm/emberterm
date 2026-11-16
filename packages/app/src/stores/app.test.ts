import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { get } from "svelte/store";
import {
  tabs,
  toasts,
  pushToast,
  dismissToast,
  noteOutput,
  addTab,
  removeTab,
  activateTab,
  setTabTitle,
  setPaneCwd,
  pushPaneCommand,
  restoreTabHistory,
  restoreCustomTitle,
  renameTab,
  setTabSplit,
  clearTabSplit,
  moveTab,
  activeTab,
  activeCwd,
} from "./app.js";

beforeEach(() => {
  tabs.set([]);
});

// ── Tab management ────────────────────────────────────────────────────────────

describe("tabs", () => {
  it("addTab creates an active tab", () => {
    const id = addTab("s1", "Shell");
    const ts = get(tabs);
    expect(ts).toHaveLength(1);
    expect(ts[0].id).toBe(id);
    expect(ts[0].isActive).toBe(true);
    expect(ts[0].title).toBe("Shell");
    expect(ts[0].sessionId).toBe("s1");
  });

  it("second addTab deactivates the first", () => {
    addTab("s1", "Tab 1");
    addTab("s2", "Tab 2");
    const ts = get(tabs);
    expect(ts[0].isActive).toBe(false);
    expect(ts[1].isActive).toBe(true);
  });

  it("activateTab switches active state", () => {
    const id1 = addTab("s1", "Tab 1");
    addTab("s2", "Tab 2");
    activateTab(id1);
    const ts = get(tabs);
    expect(ts.find((t) => t.id === id1)?.isActive).toBe(true);
    expect(ts.find((t) => t.sessionId === "s2")?.isActive).toBe(false);
  });

  it("removeTab removes and activates neighbour", () => {
    const id1 = addTab("s1", "Tab 1");
    addTab("s2", "Tab 2");
    removeTab(id1);
    const ts = get(tabs);
    expect(ts).toHaveLength(1);
    expect(ts[0].isActive).toBe(true);
  });

  it("setTabTitle updates by sessionId", () => {
    addTab("s1", "Shell");
    setTabTitle("s1", "My Process");
    expect(get(tabs)[0].title).toBe("My Process");
  });

  it("setPaneCwd updates cwd", () => {
    addTab("s1", "Shell");
    setPaneCwd("s1", "/home/user");
    expect(get(tabs)[0].cwd).toBe("/home/user");
  });

  it("renameTab updates title by tabId", () => {
    const id = addTab("s1", "Shell");
    renameTab(id, "My Tab");
    expect(get(tabs)[0].title).toBe("My Tab");
  });

  it("renameTab ignores blank names", () => {
    const id = addTab("s1", "Shell");
    renameTab(id, "   ");
    expect(get(tabs)[0].title).toBe("Shell");
  });
});

// ── Derived stores ────────────────────────────────────────────────────────────

describe("derived stores", () => {
  it("activeTab reflects the active tab", () => {
    const id1 = addTab("s1", "First");
    addTab("s2", "Second");
    activateTab(id1);
    expect(get(activeTab)?.id).toBe(id1);
  });

  it("activeCwd follows the active tab's cwd", () => {
    addTab("s1", "Shell");
    setPaneCwd("s1", "/projects/foo");
    expect(get(activeCwd)).toBe("/projects/foo");
  });
});

// ── Split pane ────────────────────────────────────────────────────────────────

describe("split pane", () => {
  it("setTabSplit records split session and direction", () => {
    const tabId = addTab("s1", "Shell");
    setTabSplit(tabId, "s2", "horizontal");
    const t = get(tabs).find((t) => t.id === tabId)!;
    expect(t.splitSessionId).toBe("s2");
    expect(t.splitDirection).toBe("horizontal");
  });

  it("clearTabSplit removes split state", () => {
    const tabId = addTab("s1", "Shell");
    setTabSplit(tabId, "s2", "vertical");
    clearTabSplit(tabId);
    const t = get(tabs).find((t) => t.id === tabId)!;
    expect(t.splitSessionId).toBeUndefined();
    expect(t.splitDirection).toBeUndefined();
  });

  it("other tabs are unaffected by setTabSplit", () => {
    const t1 = addTab("s1", "Tab 1");
    const t2 = addTab("s2", "Tab 2");
    setTabSplit(t1, "s3", "horizontal");
    const tab2 = get(tabs).find((t) => t.id === t2)!;
    expect(tab2.splitSessionId).toBeUndefined();
  });
});

// ── Drag to reorder ───────────────────────────────────────────────────────────

describe("moveTab", () => {
  it("moves a tab to the end of the list", () => {
    const t1 = addTab("s1", "A");
    const t2 = addTab("s2", "B");
    const t3 = addTab("s3", "C");
    moveTab(t1, 2);
    expect(get(tabs).map((t) => t.id)).toEqual([t2, t3, t1]);
  });

  it("moves a tab to the start of the list", () => {
    const t1 = addTab("s1", "A");
    const t2 = addTab("s2", "B");
    const t3 = addTab("s3", "C");
    moveTab(t3, 0);
    expect(get(tabs).map((t) => t.id)).toEqual([t3, t1, t2]);
  });

  it("clamps an out-of-range index to the ends", () => {
    const t1 = addTab("s1", "A");
    const t2 = addTab("s2", "B");
    moveTab(t1, 99);
    expect(get(tabs).map((t) => t.id)).toEqual([t2, t1]);
    moveTab(t1, -5);
    expect(get(tabs).map((t) => t.id)).toEqual([t1, t2]);
  });

  it("keeps the active tab active", () => {
    const t1 = addTab("s1", "A");
    addTab("s2", "B");
    moveTab(t1, 1);
    expect(get(tabs).filter((t) => t.isActive).map((t) => t.id)).toHaveLength(1);
  });

  it("noop when the tab is already there", () => {
    const t1 = addTab("s1", "A");
    const t2 = addTab("s2", "B");
    moveTab(t1, 0);
    expect(get(tabs).map((t) => t.id)).toEqual([t1, t2]);
  });

  it("noop when tabId not found", () => {
    const t1 = addTab("s1", "A");
    moveTab("nonexistent", 0);
    expect(get(tabs).map((t) => t.id)).toEqual([t1]);
  });
});

describe("toasts", () => {
  it("pushToast adds and auto-dismisses", () => {
    vi.useFakeTimers();
    pushToast("hello", 1000);
    expect(get(toasts).map((t) => t.message)).toEqual(["hello"]);
    vi.advanceTimersByTime(1000);
    expect(get(toasts)).toEqual([]);
    vi.useRealTimers();
  });
  it("dismissToast removes by id", () => {
    const id = pushToast("bye");
    dismissToast(id);
    expect(get(toasts).find((t) => t.id === id)).toBeUndefined();
  });
});

describe("pane cwd and custom titles", () => {
  it("setPaneCwd updates the primary or the split pane", () => {
    const id = addTab("s1", "bash", "bash", "git-bash");
    setTabSplit(id, "s2", "vertical", "wsl");
    setPaneCwd("s1", "/d/a");
    setPaneCwd("s2", "/home/b");
    const t = get(tabs).find((x) => x.id === id)!;
    expect(t.cwd).toBe("/d/a");
    expect(t.splitCwd).toBe("/home/b");
    expect(t.profileId).toBe("git-bash");
    expect(t.splitProfileId).toBe("wsl");
  });

  it("shell titles do not override a renamed tab", () => {
    const id = addTab("s3", "bash");
    renameTab(id, "api");
    setTabTitle("s3", "vim");
    const t = get(tabs).find((x) => x.id === id)!;
    expect(t.title).toBe("api");
    expect(t.customTitle).toBe(true);
  });

  it("restoreCustomTitle sets the title and marks it custom", () => {
    const id = addTab("s6", "bash");
    restoreCustomTitle(id, "work");
    const t = get(tabs).find((x) => x.id === id)!;
    expect(t.title).toBe("work");
    expect(t.customTitle).toBe(true);
  });

  it("clearTabSplit forgets split profile and cwd", () => {
    const id = addTab("s4", "bash");
    setTabSplit(id, "s5", "horizontal", "pwsh");
    setPaneCwd("s5", "D:/x");
    clearTabSplit(id);
    const t = get(tabs).find((x) => x.id === id)!;
    expect(t.splitProfileId).toBeUndefined();
    expect(t.splitCwd).toBeUndefined();
  });
});

describe("no-op updates keep tab identity", () => {
  it("setTabTitle with an unchanged title keeps the tab object", () => {
    addTab("s9", "bash");
    const before = get(tabs)[0];
    setTabTitle("s9", "bash");
    expect(get(tabs)[0]).toBe(before);
  });
  it("setPaneCwd with an unchanged cwd keeps the tab object", () => {
    addTab("s10", "bash");
    setPaneCwd("s10", "/d/x");
    const before = get(tabs)[0];
    setPaneCwd("s10", "/d/x");
    expect(get(tabs)[0]).toBe(before);
  });
});

describe("background output indicators", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const two = () => {
    const a = addTab("sa", "a");
    const b = addTab("sb", "b"); // b is active
    return { a, b };
  };
  const tabOf = (id: string) => get(tabs).find((x) => x.id === id)!;

  it("marks an inactive tab busy and unread, and clears busy after 1.5 s of silence", () => {
    const { a } = two();
    noteOutput("sa", true);
    expect(tabOf(a).isBusy).toBe(true);
    expect(tabOf(a).hasUnread).toBe(true);
    vi.advanceTimersByTime(1499);
    expect(tabOf(a).isBusy).toBe(true);
    vi.advanceTimersByTime(1);
    expect(tabOf(a).isBusy).toBe(false);
    expect(tabOf(a).hasUnread).toBe(true); // unread stays until the tab is viewed
  });

  it("new output restarts the silence timer", () => {
    const { a } = two();
    noteOutput("sa", true);
    vi.advanceTimersByTime(1000);
    noteOutput("sa", true);
    vi.advanceTimersByTime(1000);
    expect(tabOf(a).isBusy).toBe(true);
    vi.advanceTimersByTime(500);
    expect(tabOf(a).isBusy).toBe(false);
  });

  it("startup output shows busy but does not count as unread", () => {
    const { a } = two();
    noteOutput("sa", false);
    expect(tabOf(a).isBusy).toBe(true);
    expect(tabOf(a).hasUnread).toBe(false);
  });

  it("never marks the active tab", () => {
    const { b } = two();
    noteOutput("sb", true);
    expect(tabOf(b).isBusy).toBe(false);
    expect(tabOf(b).hasUnread).toBe(false);
  });

  it("maps output from a split pane to its tab", () => {
    const { a } = two();
    setTabSplit(a, "sa-split", "vertical");
    noteOutput("sa-split", true);
    expect(tabOf(a).hasUnread).toBe(true);
  });

  it("repeated output leaves the tab object untouched", () => {
    const { a } = two();
    noteOutput("sa", true);
    const before = tabOf(a);
    noteOutput("sa", true);
    expect(tabOf(a)).toBe(before);
  });

  it("viewing a tab clears its unread flag", () => {
    const { a } = two();
    noteOutput("sa", true);
    activateTab(a);
    expect(tabOf(a).hasUnread).toBe(false);
  });
});

describe("pane command history", () => {
  const get0 = () => get(tabs)[0];

  it("pushPaneCommand records for the pane and for the split", () => {
    const id = addTab("s1", "bash");
    setTabSplit(id, "s2", "vertical");
    pushPaneCommand("s1", "ls");
    pushPaneCommand("s2", "pwd");
    expect(get0().history).toEqual(["ls"]);
    expect(get0().splitHistory).toEqual(["pwd"]);
  });

  it("ignores filtered commands without notifying the store", () => {
    addTab("s1", "bash");
    const before = get0();
    pushPaneCommand("s1", " hidden");
    pushPaneCommand("s1", "export TOKEN=x");
    expect(get0()).toBe(before);
  });

  it("drops a consecutive duplicate without notifying the store", () => {
    addTab("s1", "bash");
    pushPaneCommand("s1", "ls");
    const before = get0();
    pushPaneCommand("s1", "ls");
    expect(get0()).toBe(before);
  });

  it("keeps the newest 10", () => {
    addTab("s1", "bash");
    for (let i = 0; i < 12; i++) pushPaneCommand("s1", `c${i}`);
    expect(get0().history).toHaveLength(10);
    expect(get0().history![0]).toBe("c2");
  });

  it("restoreTabHistory sets both panes and trims to 10", () => {
    const id = addTab("s1", "bash");
    const long = Array.from({ length: 15 }, (_, i) => `c${i}`);
    restoreTabHistory(id, long, ["x"]);
    expect(get0().history).toEqual(long.slice(-10));
    expect(get0().splitHistory).toEqual(["x"]);
  });

  it("clearTabSplit forgets splitHistory", () => {
    const id = addTab("s1", "bash");
    setTabSplit(id, "s2", "horizontal");
    pushPaneCommand("s2", "ls");
    clearTabSplit(id);
    expect(get0().splitHistory).toBeUndefined();
  });
});
