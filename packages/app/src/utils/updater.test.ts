import { describe, it, expect, vi } from "vitest";
import { get } from "svelte/store";
import type { ReleaseNote } from "../ipc/client.js";
import { createUpdater, type DownloadEvent, type PluginUpdate, type UpdateState } from "./updater.js";

const rel = (version: string): ReleaseNote => ({
  tag: `v${version}`, version, published_at: "2026-11-24T10:00:00Z",
  body: `### Highlights\n\n- notes for ${version}`, url: `https://example.test/v${version}`,
});

const BODY = "### Highlights\n\n- the new thing\n\n**Full changelog**: https://example.test/compare/v1.2.0...v1.4.0";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function fakeUpdate(over: { events?: DownloadEvent[]; downloadFail?: Error; installFail?: Error } = {}) {
  const update = {
    version: "1.4.0",
    currentVersion: "1.2.0",
    date: "2026-11-30T09:00:00Z",
    body: BODY,
    download: vi.fn(async (cb: (e: DownloadEvent) => void) => {
      for (const e of over.events ?? []) cb(e);
      if (over.downloadFail) throw over.downloadFail;
    }),
    install: vi.fn(async () => { if (over.installFail) throw over.installFail; }),
    close: vi.fn(async () => {}),
  };
  return update satisfies PluginUpdate;
}

function setup(opts: {
  updates?: (ReturnType<typeof fakeUpdate> | null)[];
  checkFail?: Error;
  releases?: () => Promise<ReleaseNote[]>;
  busy?: () => Promise<number>;
  relaunchFail?: Error;
} = {}) {
  const queue = [...(opts.updates ?? [fakeUpdate()])];
  const calls: string[] = [];
  const relaunch = vi.fn(async () => {
    calls.push("relaunch");
    if (opts.relaunchFail) throw opts.relaunchFail;
  });
  const fetchReleases = vi.fn(opts.releases ?? (async () => [rel("1.4.0"), rel("1.3.0"), rel("1.2.0")]));
  const updater = createUpdater({
    check: async () => {
      calls.push("check");
      if (opts.checkFail) throw opts.checkFail;
      return queue.shift() ?? null;
    },
    relaunch,
    fetchReleases,
    countBusyTabs: opts.busy ?? (async () => 2),
  });
  const states: UpdateState[] = [];
  updater.state.subscribe((s) => states.push(s));
  const kinds = () => states.map((s) => s.kind);
  const now = () => get(updater.state);
  const available = () => {
    const s = now();
    if (s.kind !== "available") throw new Error(`expected available, got ${s.kind}`);
    return s;
  };
  return { updater, calls, relaunch, fetchReleases, kinds, now, available };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createUpdater: checking", () => {
  it("reports up to date when there is no newer release", async () => {
    const t = setup({ updates: [null] });
    await t.updater.check();
    expect(t.kinds()).toEqual(["idle", "checking", "current"]);
    expect(t.relaunch).not.toHaveBeenCalled();
  });

  it("stops at an available card and never downloads, installs or restarts by itself", async () => {
    const update = fakeUpdate();
    const t = setup({ updates: [update] });
    await t.updater.check();
    await flush();
    const s = t.available();
    expect(s).toMatchObject({ version: "1.4.0", currentVersion: "1.2.0", date: "2026-11-30T09:00:00Z", busyTabs: 2 });
    expect(s.compareUrl).toBe("https://example.test/compare/v1.2.0...v1.4.0");
    expect(update.download).not.toHaveBeenCalled();
    expect(update.install).not.toHaveBeenCalled();
    expect(t.relaunch).not.toHaveBeenCalled();
  });

  it("shows the newest notes at once and fills in the releases in between when they arrive", async () => {
    const d = deferred<ReleaseNote[]>();
    const t = setup({ releases: () => d.promise });
    await t.updater.check();
    expect(t.available().notes.status).toBe("loading");
    expect(t.available().notes.entries.map((e) => e.version)).toEqual(["1.4.0"]);
    d.resolve([rel("1.4.0"), rel("1.3.0"), rel("1.2.0"), rel("1.1.0")]);
    await flush();
    const notes = t.available().notes;
    expect(notes.status).toBe("ready");
    expect(notes.entries.map((e) => e.version)).toEqual(["1.4.0", "1.3.0"]);
  });

  it("keeps the newest notes and stays installable when the releases cannot be loaded", async () => {
    const update = fakeUpdate();
    const t = setup({ updates: [update], releases: async () => { throw { code: "rate_limited" }; } });
    await t.updater.check();
    await flush();
    expect(t.available().notes.status).toBe("unavailable");
    expect(t.available().notes.entries.map((e) => e.version)).toEqual(["1.4.0"]);
    await t.updater.install();
    expect(update.download).toHaveBeenCalledTimes(1);
  });

  it("reports a failed check, and recovers on the next one", async () => {
    const t = setup({ checkFail: new Error("offline") });
    await t.updater.check();
    expect(t.now()).toEqual({ kind: "error", message: "offline", step: "check" });
    const ok = setup({ updates: [null] });
    await ok.updater.check();
    expect(ok.now().kind).toBe("current");
  });

  it("closes the previous update before checking again", async () => {
    const first = fakeUpdate();
    const second = fakeUpdate();
    const t = setup({ updates: [first, second] });
    await t.updater.check();
    await t.updater.check();
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(t.calls.filter((c) => c === "check")).toHaveLength(2);
  });

  it("ignores a check while an install is running", async () => {
    const gate = deferred<void>();
    const update = fakeUpdate();
    update.download.mockImplementation(async () => { await gate.promise; });
    const t = setup({ updates: [update] });
    await t.updater.check();
    const running = t.updater.install();
    await flush();
    await t.updater.check();
    expect(t.now().kind).toBe("downloading");
    expect(t.calls.filter((c) => c === "check")).toHaveLength(1);
    gate.resolve();
    await running;
  });
});

describe("createUpdater: installing", () => {
  it("downloads, installs and restarts only after install() is called", async () => {
    const update = fakeUpdate({
      events: [
        { event: "Started", data: { contentLength: 200 } },
        { event: "Progress", data: { chunkLength: 50 } },
        { event: "Progress", data: { chunkLength: 150 } },
        { event: "Finished" },
      ],
    });
    const t = setup({ updates: [update] });
    await t.updater.check();
    await t.updater.install();
    expect(t.kinds()).toContain("downloading");
    expect(t.kinds().slice(-2)).toEqual(["downloading", "installing"]);
    expect(t.calls).toEqual(["check", "relaunch"]);
    expect(update.download.mock.invocationCallOrder[0]).toBeLessThan(update.install.mock.invocationCallOrder[0]);
    expect(update.install.mock.invocationCallOrder[0]).toBeLessThan(t.relaunch.mock.invocationCallOrder[0]);
  });

  it("reports progress as a percentage, or none when the size is unknown", async () => {
    const withSize = fakeUpdate({
      events: [{ event: "Started", data: { contentLength: 200 } }, { event: "Progress", data: { chunkLength: 50 } }],
    });
    const a = setup({ updates: [withSize] });
    const seen: (number | null)[] = [];
    a.updater.state.subscribe((s) => { if (s.kind === "downloading") seen.push(s.pct); });
    await a.updater.check();
    await a.updater.install();
    expect(seen).toContain(25);

    const noSize = fakeUpdate({ events: [{ event: "Started", data: {} }, { event: "Progress", data: { chunkLength: 50 } }] });
    const b = setup({ updates: [noSize] });
    const seenB: (number | null)[] = [];
    b.updater.state.subscribe((s) => { if (s.kind === "downloading") seenB.push(s.pct); });
    await b.updater.check();
    await b.updater.install();
    expect(seenB.every((p) => p === null)).toBe(true);
  });

  it("does one download when install() is triggered twice", async () => {
    const update = fakeUpdate();
    const t = setup({ updates: [update] });
    await t.updater.check();
    await Promise.all([t.updater.install(), t.updater.install()]);
    expect(update.download).toHaveBeenCalledTimes(1);
    expect(update.install).toHaveBeenCalledTimes(1);
    expect(t.relaunch).toHaveBeenCalledTimes(1);
  });

  it.each(["idle", "current", "checking"])("does nothing when there is nothing to install (%s)", async (kind) => {
    const gate = deferred<null>();
    const t = kind === "idle" ? setup() : kind === "current" ? setup({ updates: [null] }) : setup();
    if (kind === "current") await t.updater.check();
    if (kind === "checking") {
      const slow = createUpdater({
        check: () => gate.promise, relaunch: async () => {}, fetchReleases: async () => [], countBusyTabs: async () => 0,
      });
      const p = slow.check();
      await slow.install();
      expect(get(slow.state).kind).toBe("checking");
      gate.resolve(null);
      await p;
      return;
    }
    await t.updater.install();
    expect(t.relaunch).not.toHaveBeenCalled();
    expect(t.now().kind).toBe(kind);
  });

  it("turns a failed download into an error that can be retried with the same update", async () => {
    const update = fakeUpdate({ downloadFail: new Error("connection lost") });
    const t = setup({ updates: [update] });
    await t.updater.check();
    await t.updater.install();
    expect(t.now()).toEqual({ kind: "error", message: "connection lost", step: "install", currentVersion: "1.2.0" });
    expect(t.relaunch).not.toHaveBeenCalled();
    update.download.mockImplementation(async () => {});
    await t.updater.install();
    expect(update.download).toHaveBeenCalledTimes(2);
    expect(t.relaunch).toHaveBeenCalledTimes(1);
  });

  it("turns a failed restart into an install error", async () => {
    const t = setup({ relaunchFail: new Error("cannot restart") });
    await t.updater.check();
    await t.updater.install();
    expect(t.now()).toMatchObject({ kind: "error", step: "install", message: "cannot restart" });
  });
});

describe("createUpdater: dismissing and late answers", () => {
  it("dismiss closes the update and goes back to idle", async () => {
    const update = fakeUpdate();
    const t = setup({ updates: [update] });
    await t.updater.check();
    await t.updater.dismiss();
    expect(update.close).toHaveBeenCalledTimes(1);
    expect(t.now().kind).toBe("idle");
  });

  it("does not let the releases answer overwrite the state after dismiss", async () => {
    const d = deferred<ReleaseNote[]>();
    const t = setup({ releases: () => d.promise });
    await t.updater.check();
    await t.updater.dismiss();
    d.resolve([rel("1.4.0"), rel("1.3.0")]);
    await flush();
    expect(t.now().kind).toBe("idle");
  });

  it("does not let the first check's releases overwrite a second check", async () => {
    const first = deferred<ReleaseNote[]>();
    const second = deferred<ReleaseNote[]>();
    const answers = [first, second];
    const t = setup({ updates: [fakeUpdate(), fakeUpdate()], releases: () => answers.shift()!.promise });
    await t.updater.check();
    await t.updater.check();
    first.resolve([rel("1.4.0"), rel("1.3.0")]);
    await flush();
    expect(t.available().notes.status).toBe("loading");
    second.resolve([rel("1.4.0")]);
    await flush();
    expect(t.available().notes.status).toBe("ready");
  });

  it("cannot be dismissed while it is downloading", async () => {
    const gate = deferred<void>();
    const update = fakeUpdate();
    update.download.mockImplementation(async () => { await gate.promise; });
    const t = setup({ updates: [update] });
    await t.updater.check();
    const running = t.updater.install();
    await flush();
    await t.updater.dismiss();
    expect(t.now().kind).toBe("downloading");
    expect(update.close).not.toHaveBeenCalled();
    gate.resolve();
    await running;
  });

  it("dismisses an error", async () => {
    const t = setup({ checkFail: new Error("offline") });
    await t.updater.check();
    await t.updater.dismiss();
    expect(t.now().kind).toBe("idle");
  });
});

describe("createUpdater: running programs", () => {
  it("refreshBusyTabs updates the count on the card", async () => {
    let n = 2;
    const t = setup({ busy: async () => n });
    await t.updater.check();
    expect(t.available().busyTabs).toBe(2);
    n = 0;
    await t.updater.refreshBusyTabs();
    expect(t.available().busyTabs).toBe(0);
  });

  it("counts a failing check as no running programs", async () => {
    const t = setup({ busy: async () => { throw new Error("no"); } });
    await t.updater.check();
    expect(t.available().busyTabs).toBe(0);
  });

  it("refreshBusyTabs does nothing outside the card", async () => {
    const busy = vi.fn(async () => 3);
    const t = setup({ updates: [null], busy });
    await t.updater.check();
    await t.updater.refreshBusyTabs();
    expect(t.now().kind).toBe("current");
  });
});
