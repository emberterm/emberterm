import { get, writable, type Readable } from "svelte/store";
import type { ReleaseNote } from "../ipc/client.js";
import { buildEntries, compareUrl, releasesBetween, type NoteEntry } from "./releaseNotes.js";

export type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

/** The part of the updater plugin's `Update` this module uses. */
export interface PluginUpdate {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
  download(onEvent: (e: DownloadEvent) => void): Promise<void>;
  install(): Promise<void>;
  close(): Promise<void>;
}

export interface NotesState {
  status: "loading" | "ready" | "unavailable";
  entries: NoteEntry[];
}

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current" }
  | {
      kind: "available";
      version: string;
      currentVersion: string;
      date?: string;
      notes: NotesState;
      /** Tabs with a program running, as of when the card appeared or was last refreshed. */
      busyTabs: number;
      compareUrl: string | null;
    }
  | { kind: "downloading"; version: string; pct: number | null }
  | { kind: "installing"; version: string }
  | { kind: "error"; message: string; step: "check" | "install"; currentVersion?: string };

export interface UpdateDeps {
  check(): Promise<PluginUpdate | null>;
  relaunch(): Promise<void>;
  fetchReleases(): Promise<ReleaseNote[]>;
  countBusyTabs(): Promise<number>;
}

export interface Updater {
  state: Readable<UpdateState>;
  /** Looks for a newer release and stops at the card; it never installs. */
  check(): Promise<void>;
  /** Downloads, installs and restarts. Only from the card, or to retry a failed install. */
  install(): Promise<void>;
  /** Closes the card (or an error). Not possible while a download is running. */
  dismiss(): Promise<void>;
  refreshBusyTabs(): Promise<void>;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/**
 * The update flow as a state machine, with its effects injected. The plugin's `Update` handle is a
 * Rust resource, so it lives here and not in the reactive state. `token` changes whenever a check
 * starts or the card is dismissed, so an answer that arrives late (the releases list) can tell it
 * no longer belongs to the card on screen.
 */
export function createUpdater(deps: UpdateDeps): Updater {
  const store = writable<UpdateState>({ kind: "idle" });
  let handle: PluginUpdate | null = null;
  let token = 0;
  let installing = false;

  async function closeHandle() {
    const old = handle;
    handle = null;
    await old?.close().catch(() => {});
  }

  /** Changes the card, but only if it is still the one from `mine`. */
  function patchCard(mine: number, patch: (s: Extract<UpdateState, { kind: "available" }>) => UpdateState) {
    const s = get(store);
    if (mine === token && s.kind === "available") store.set(patch(s));
  }

  function loadNotes(update: PluginUpdate, mine: number) {
    deps
      .fetchReleases()
      .then((releases) => {
        const range = releasesBetween(releases, update.currentVersion, update.version);
        patchCard(mine, (s) => ({ ...s, notes: { status: "ready", entries: buildEntries(range, update) } }));
      })
      .catch(() => patchCard(mine, (s) => ({ ...s, notes: { ...s.notes, status: "unavailable" } })));
  }

  async function check() {
    if (installing) return;
    const mine = ++token;
    store.set({ kind: "checking" });
    await closeHandle();
    try {
      const update = await deps.check();
      if (mine !== token) {
        await update?.close().catch(() => {});
        return;
      }
      if (!update) {
        store.set({ kind: "current" });
        return;
      }
      handle = update;
      const busyTabs = await deps.countBusyTabs().catch(() => 0);
      if (mine !== token) return;
      store.set({
        kind: "available",
        version: update.version,
        currentVersion: update.currentVersion,
        date: update.date,
        notes: { status: "loading", entries: buildEntries([], update) },
        busyTabs,
        compareUrl: compareUrl(update.body),
      });
      loadNotes(update, mine);
    } catch (e) {
      if (mine === token) store.set({ kind: "error", message: message(e), step: "check" });
    }
  }

  async function install() {
    const s = get(store);
    const retry = s.kind === "error" && s.step === "install";
    const update = handle;
    if (!update || installing || (s.kind !== "available" && !retry)) return;
    installing = true;
    const { version, currentVersion } = update;
    try {
      let total: number | undefined;
      let received = 0;
      const pct = () => (total ? Math.min(100, Math.round((received / total) * 100)) : null);
      store.set({ kind: "downloading", version, pct: null });
      await update.download((e) => {
        if (e.event === "Started") {
          total = e.data.contentLength;
          received = 0;
        } else if (e.event === "Progress") {
          received += e.data.chunkLength;
        } else {
          return;
        }
        store.set({ kind: "downloading", version, pct: pct() });
      });
      store.set({ kind: "installing", version });
      await update.install();
      await deps.relaunch();
    } catch (e) {
      store.set({ kind: "error", message: message(e), step: "install", currentVersion });
    } finally {
      installing = false;
    }
  }

  async function dismiss() {
    if (installing) return;
    token++;
    await closeHandle();
    store.set({ kind: "idle" });
  }

  async function refreshBusyTabs() {
    const mine = token;
    if (get(store).kind !== "available") return;
    const busyTabs = await deps.countBusyTabs().catch(() => 0);
    patchCard(mine, (s) => ({ ...s, busyTabs }));
  }

  return { state: { subscribe: store.subscribe }, check, install, dismiss, refreshBusyTabs };
}
