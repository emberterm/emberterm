import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPoller } from "./poller.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function make(stat: () => Promise<number>) {
  const onChange = vi.fn();
  const onMissing = vi.fn();
  const poller = createPoller({ stat, onChange, onMissing });
  return { poller, onChange, onMissing };
}

describe("createPoller", () => {
  it("stays quiet while the modified time is unchanged", async () => {
    const stat = vi.fn(async () => 100);
    const { poller, onChange } = make(stat);
    poller.start(100);
    await vi.advanceTimersByTimeAsync(3500);
    expect(stat).toHaveBeenCalledTimes(3);
    expect(onChange).not.toHaveBeenCalled();
    poller.stop();
  });

  it("reports a new modified time once", async () => {
    let mtime = 100;
    const { poller, onChange } = make(async () => mtime);
    poller.start(100);
    mtime = 200;
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(200);
    await vi.advanceTimersByTimeAsync(3000);
    expect(onChange).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it("reports a missing file once per outage, then the file coming back", async () => {
    let fail = true;
    const { poller, onChange, onMissing } = make(async () => {
      if (fail) throw { code: "not_found" };
      return 100;
    });
    poller.start(100);
    await vi.advanceTimersByTimeAsync(3000);
    expect(onMissing).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
    fail = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(onChange).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it("reports a second outage after the first one ended", async () => {
    let fail = true;
    const { poller, onMissing } = make(async () => {
      if (fail) throw new Error("gone");
      return 100;
    });
    poller.start(100);
    await vi.advanceTimersByTimeAsync(1000);
    fail = false;
    await vi.advanceTimersByTimeAsync(1000);
    fail = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(onMissing).toHaveBeenCalledTimes(2);
    poller.stop();
  });

  it("keeps no timer while disabled and checks at once when enabled again", async () => {
    const stat = vi.fn(async () => 100);
    const { poller } = make(stat);
    poller.start(100);
    poller.setEnabled(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(stat).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    poller.setEnabled(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(stat).toHaveBeenCalledTimes(1);
    poller.stop();
  });

  it("leaves nothing scheduled after stop", async () => {
    const { poller } = make(async () => 100);
    poller.start(100);
    await vi.advanceTimersByTimeAsync(1500);
    poller.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("ignores the answer of a check that was in flight when it stopped", async () => {
    let release: (n: number) => void = () => {};
    const stat = () => new Promise<number>((r) => { release = r; });
    const { poller, onChange } = make(stat);
    poller.start(100);
    await vi.advanceTimersByTimeAsync(1000);
    poller.stop();
    release(999);
    await vi.advanceTimersByTimeAsync(10);
    expect(onChange).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never runs two checks at once, however slow the file system is", async () => {
    let running = 0;
    let peak = 0;
    const stat = () =>
      new Promise<number>((resolve) => {
        running++;
        peak = Math.max(peak, running);
        setTimeout(() => { running--; resolve(100); }, 3000);
      });
    const { poller } = make(stat);
    poller.start(100);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(peak).toBe(1);
    poller.stop();
  });
});
