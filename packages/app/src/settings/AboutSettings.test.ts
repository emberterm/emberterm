// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, unmount } from "svelte";

vi.mock("@tauri-apps/api/app", () => ({ getVersion: vi.fn(async () => "1.2.0") }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(async () => {}) }));
vi.mock("../terminal/links.js", () => ({ openExternalLink: vi.fn() }));
vi.mock("../stores/update.js", async () => {
  const { writable } = await import("svelte/store");
  return {
    updateState: writable({ kind: "idle" }),
    checkForUpdate: vi.fn(async () => {}),
    installUpdate: vi.fn(async () => {}),
    dismissUpdate: vi.fn(async () => {}),
    refreshBusyTabs: vi.fn(async () => {}),
  };
});

import { checkForUpdate, dismissUpdate, installUpdate, refreshBusyTabs, updateState } from "../stores/update.js";
import type { UpdateState } from "../utils/updater.js";
import AboutSettings from "./AboutSettings.svelte";

let host: HTMLElement;
let component: ReturnType<typeof mount> | undefined;
const setState = (s: UpdateState) => (updateState as unknown as { set: (v: UpdateState) => void }).set(s);
const text = () => host.textContent?.replace(/\s+/g, " ") ?? "";
const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);

const available: UpdateState = {
  kind: "available", version: "2.0.0", currentVersion: "1.2.0", date: "2026-11-30T09:00:00Z",
  notes: { status: "ready", entries: [{ version: "2.0.0", date: "2026-11-30T09:00:00Z", url: null, markdown: "### Highlights\n\n- new" }] },
  busyTabs: 1, compareUrl: null,
};

async function open() {
  component = mount(AboutSettings, { target: host });
  await vi.waitFor(() => expect(text()).toContain("v1.2.0"));
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  setState({ kind: "idle" });
  // jsdom has no scrollIntoView (the card scrolls itself into view)
  Element.prototype.scrollIntoView = vi.fn();
  for (const f of [checkForUpdate, installUpdate, dismissUpdate, refreshBusyTabs]) vi.mocked(f).mockClear();
});

afterEach(() => {
  if (component) unmount(component);
  component = undefined;
  host.remove();
});

describe("AboutSettings", () => {
  it("describes the app as it is today, for Windows and macOS", async () => {
    await open();
    expect(text()).toContain("A light terminal for Windows and macOS · v1.2.0");
    expect(text()).toContain("opens fast, gives every tab its own shell");
    expect(text()).toContain("your last commands");
    expect(text()).not.toContain("lightweight terminal for Windows");
    expect(text()).not.toContain("A fast, simple terminal");
  });

  it("refreshes the count of tabs with a running program when it opens", async () => {
    await open();
    expect(refreshBusyTabs).toHaveBeenCalledTimes(1);
  });

  it("starts a check on click and does nothing more by itself", async () => {
    await open();
    button("Check for updates")!.click();
    expect(checkForUpdate).toHaveBeenCalledTimes(1);
    expect(installUpdate).not.toHaveBeenCalled();
  });

  it("shows the update card from the store, and installs only on Install", async () => {
    setState(available);
    await open();
    expect(text()).toContain("EmberTerm 2.0.0 is available");
    expect(installUpdate).not.toHaveBeenCalled();
    button("Install 2.0.0 and restart")!.click();
    expect(installUpdate).toHaveBeenCalledTimes(1);
    button("Not now")!.click();
    expect(dismissUpdate).toHaveBeenCalledTimes(1);
  });

  it("shows the progress, not the Check button, when Settings is reopened during a download", async () => {
    setState({ kind: "downloading", version: "2.0.0", pct: 40 });
    await open();
    expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("40");
    expect(button("Check for updates")).toBeUndefined();
  });

  it("follows the store while it is open", async () => {
    await open();
    setState({ kind: "current" });
    await vi.waitFor(() => expect(text()).toContain("You're on the latest version."));
    setState(available);
    await vi.waitFor(() => expect(text()).toContain("EmberTerm 2.0.0 is available"));
  });
});
