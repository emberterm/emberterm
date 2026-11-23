// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, unmount } from "svelte";

vi.mock("../terminal/links.js", () => ({ openExternalLink: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(async () => {}) }));

import { openUrl } from "@tauri-apps/plugin-opener";
import type { UpdateState } from "../utils/updater.js";
import UpdateView from "./UpdateView.svelte";

const entry = (version: string) => ({
  version, date: "2026-11-30T09:00:00Z", url: null, markdown: `### Highlights\n\n- notes for ${version}`,
});

const available = (over: Record<string, unknown> = {}): UpdateState =>
  ({
    kind: "available", version: "2.0.0", currentVersion: "1.2.0", date: "2026-11-30T09:00:00Z",
    notes: { status: "ready", entries: [entry("2.0.0"), entry("1.3.0")] },
    busyTabs: 2, compareUrl: "https://example.test/compare/v1.2.0...v2.0.0", ...over,
  }) as UpdateState;

let host: HTMLElement;
let component: ReturnType<typeof mount> | undefined;
const onCheck = vi.fn();
const onInstall = vi.fn();
const onDismiss = vi.fn();

function show(state: UpdateState) {
  component = mount(UpdateView, { target: host, props: { state, onCheck, onInstall, onDismiss } });
}
const text = () => host.textContent?.replace(/\s+/g, " ") ?? "";
const button = (label: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  for (const f of [onCheck, onInstall, onDismiss, vi.mocked(openUrl)]) f.mockClear();
});

afterEach(() => {
  if (component) unmount(component);
  component = undefined;
  host.remove();
});

describe("UpdateView: before an update", () => {
  it("offers a check, and says what the last one found", () => {
    show({ kind: "idle" });
    button("Check for updates")!.click();
    expect(onCheck).toHaveBeenCalledTimes(1);
  });

  it("says it is checking, with the button disabled", () => {
    show({ kind: "checking" });
    expect(text()).toContain("Checking for updates…");
    expect(button("Check for updates")!.disabled).toBe(true);
  });

  it("says the app is up to date", () => {
    show({ kind: "current" });
    expect(text()).toContain("You're on the latest version.");
    expect(host.querySelector('[role="status"]')).not.toBeNull();
  });
});

describe("UpdateView: an update is available", () => {
  it("shows the version, what you have, the releases since and the date", () => {
    show(available());
    expect(text()).toContain("EmberTerm 2.0.0 is available");
    expect(text()).toContain("You have 1.2.0");
    expect(text()).toContain("2 releases since");
    expect(text()).toMatch(/Released Nov 30/);
    expect(text()).toContain("What's new since 1.2.0");
  });

  it("leaves out the release count when notes are still loading or only one release is known", () => {
    show(available({ notes: { status: "loading", entries: [entry("2.0.0")] } }));
    expect(text()).not.toContain("releases since");
    expect(text()).toContain("Loading notes for earlier releases…");
  });

  it("opens the newest release and keeps the older ones closed until clicked", async () => {
    show(available());
    const heads = [...host.querySelectorAll("button[aria-expanded]")] as HTMLButtonElement[];
    expect(heads.map((h) => h.getAttribute("aria-expanded"))).toEqual(["true", "false"]);
    await vi.waitFor(() => expect(text()).toContain("notes for 2.0.0"));
    expect(text()).not.toContain("notes for 1.3.0");
    heads[1].click();
    await vi.waitFor(() => expect(text()).toContain("notes for 1.3.0"));
    expect(heads[1].getAttribute("aria-expanded")).toBe("true");
    heads[1].click();
    await vi.waitFor(() => expect(heads[1].getAttribute("aria-expanded")).toBe("false"));
  });

  it("warns about the restart and counts the tabs with a program running", () => {
    show(available({ busyTabs: 2 }));
    expect(host.querySelector('[role="note"]')?.textContent).toContain(
      "Installing restarts EmberTerm and stops the programs running in 2 tabs. Your tabs, splits and folders come back.",
    );
  });

  it("says 1 tab, and drops the count when nothing is running", () => {
    show(available({ busyTabs: 1 }));
    expect(host.querySelector('[role="note"]')?.textContent).toContain("running in 1 tab.");
    unmount(component!);
    host.replaceChildren();
    show(available({ busyTabs: 0 }));
    const note = host.querySelector('[role="note"]')?.textContent ?? "";
    expect(note).toContain("Installing restarts EmberTerm. Your tabs, splits and folders come back.");
    expect(note).not.toContain("stops the programs");
  });

  it("installs only when Install is clicked, and dismisses with Not now", () => {
    show(available());
    expect(onInstall).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    button("Install 2.0.0 and restart")!.click();
    expect(onInstall).toHaveBeenCalledTimes(1);
    button("Not now")!.click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("links to the full changelog, or to the releases page without one", () => {
    show(available());
    const link = [...host.querySelectorAll("a")].find((a) => a.textContent?.includes("Full changelog on GitHub"))!;
    expect(link.getAttribute("href")).toBe("https://example.test/compare/v1.2.0...v2.0.0");
    link.click();
    expect(openUrl).toHaveBeenCalledWith("https://example.test/compare/v1.2.0...v2.0.0");
    unmount(component!);
    host.replaceChildren();
    show(available({ compareUrl: null }));
    const fallback = [...host.querySelectorAll("a")].find((a) => a.textContent?.includes("Full changelog on GitHub"))!;
    expect(fallback.getAttribute("href")).toBe("https://github.com/emberterm/emberterm/releases");
  });

  it("explains when the notes in between could not be loaded, and still offers the install", () => {
    show(available({ notes: { status: "unavailable", entries: [entry("2.0.0")] } }));
    expect(text()).toContain("Could not load notes for the releases in between");
    expect(text()).toContain("Showing the newest release only.");
    expect([...host.querySelectorAll("a")].some((a) => a.textContent?.includes("View all releases"))).toBe(true);
    expect(button("Install 2.0.0 and restart")).toBeDefined();
  });

  it("says so when a release has no notes", () => {
    show(available({ notes: { status: "ready", entries: [{ ...entry("2.0.0"), markdown: "" }] } }));
    expect(text()).toContain("No notes for this release.");
  });
});

describe("UpdateView: installing", () => {
  it("shows download progress with its percentage and disabled buttons", () => {
    show({ kind: "downloading", version: "2.0.0", pct: 25 });
    expect(text()).toContain("Installing EmberTerm 2.0.0");
    expect(text()).toContain("Downloading the update. Keep EmberTerm open.");
    expect(text()).toContain("Downloading 2.0.0 — 25%");
    expect(text()).toContain("EmberTerm restarts when it finishes");
    const bar = host.querySelector('[role="progressbar"]')!;
    expect(bar.getAttribute("aria-valuenow")).toBe("25");
    expect([...host.querySelectorAll("button")].every((b) => b.disabled)).toBe(true);
    expect(host.querySelector('[role="status"]')?.getAttribute("aria-live")).toBe("polite");
  });

  it("shows no percentage when the size is unknown", () => {
    show({ kind: "downloading", version: "2.0.0", pct: null });
    expect(text()).toContain("Downloading 2.0.0…");
    expect(host.querySelector('[role="progressbar"]')!.hasAttribute("aria-valuenow")).toBe(false);
  });

  it("says it is installing and about to restart", () => {
    show({ kind: "installing", version: "2.0.0" });
    expect(text()).toContain("Installing 2.0.0; EmberTerm will restart.");
    expect([...host.querySelectorAll("button")].every((b) => b.disabled)).toBe(true);
  });
});

describe("UpdateView: errors", () => {
  it("announces a failed install, says nothing changed, and retries the install", () => {
    show({ kind: "error", step: "install", message: "connection lost", currentVersion: "1.2.0" });
    const alert = host.querySelector('[role="alert"]')!;
    expect(alert.textContent).toContain("Update failed.");
    expect(alert.textContent).toContain("connection lost");
    expect(alert.textContent).toContain("Nothing was changed, and you are still on 1.2.0.");
    button("Try again")!.click();
    expect(onInstall).toHaveBeenCalledTimes(1);
    expect(onCheck).not.toHaveBeenCalled();
    button("Dismiss")!.click();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("retries the check after a failed check", () => {
    show({ kind: "error", step: "check", message: "offline" });
    expect(host.querySelector('[role="alert"]')!.textContent).toContain("offline");
    button("Try again")!.click();
    expect(onCheck).toHaveBeenCalledTimes(1);
    expect(onInstall).not.toHaveBeenCalled();
  });

  it("offers a manual download", () => {
    show({ kind: "error", step: "install", message: "x", currentVersion: "1.2.0" });
    const link = [...host.querySelectorAll("a")].find((a) => a.textContent?.includes("Download it from GitHub"))!;
    link.click();
    expect(openUrl).toHaveBeenCalledWith("https://github.com/emberterm/emberterm/releases");
  });
});
