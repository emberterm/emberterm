export interface Poller {
  /** Starts watching; `initialMtime` is the modified time of what is already shown. */
  start(initialMtime: number): void;
  stop(): void;
  /** While disabled no timer runs; enabling checks at once. */
  setEnabled(on: boolean): void;
}

/**
 * Watches one file by its modified time. One `setTimeout` chain, so a slow file system (a WSL
 * share) never has two checks in flight. A missing file is reported once per outage, and the file
 * coming back counts as a change, since an editor that saves by rename makes it vanish briefly.
 */
export function createPoller(opts: {
  stat: () => Promise<number>;
  onChange: (mtimeMs: number) => void;
  onMissing: () => void;
  intervalMs?: number;
}): Poller {
  const interval = opts.intervalMs ?? 1000;
  let started = false;
  let enabled = true;
  let running = false;
  let missing = false;
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Bumped by start and stop, so the answer of a check from before them is ignored.
  let epoch = 0;

  function schedule() {
    clearTimeout(timer);
    timer = started && enabled && !running ? setTimeout(tick, interval) : undefined;
  }

  async function tick() {
    timer = undefined;
    if (running) return;
    running = true;
    const mine = epoch;
    try {
      const mtime = await opts.stat();
      if (mine !== epoch) return;
      if (missing || mtime !== last) {
        missing = false;
        last = mtime;
        opts.onChange(mtime);
      }
    } catch {
      if (mine !== epoch) return;
      if (!missing) {
        missing = true;
        opts.onMissing();
      }
    } finally {
      running = false;
      schedule();
    }
  }

  return {
    start(initialMtime) {
      started = true;
      epoch++;
      last = initialMtime;
      missing = false;
      schedule();
    },
    stop() {
      started = false;
      epoch++;
      clearTimeout(timer);
      timer = undefined;
    },
    setEnabled(on) {
      if (enabled === on) return;
      enabled = on;
      if (!on) {
        clearTimeout(timer);
        timer = undefined;
      } else if (started && !running) {
        void tick();
      }
    },
  };
}
