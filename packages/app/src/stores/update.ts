import { get } from "svelte/store";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { releasesFetch, sessionBusy } from "../ipc/client.js";
import { countBusyTabs } from "../session/busyTabs.js";
import { createUpdater } from "../utils/updater.js";
import { tabs } from "./app.js";
import { isPaneBusy } from "./paneBusy.js";

// One updater for the whole app: its state must outlive the Settings panel, so closing Settings
// during a download does not lose the progress.
export const updater = createUpdater({
  check: () => check(),
  relaunch,
  fetchReleases: releasesFetch,
  countBusyTabs: () => countBusyTabs(get(tabs), (id) => isPaneBusy(id, sessionBusy)),
});

export const updateState = updater.state;
export const checkForUpdate = updater.check;
export const installUpdate = updater.install;
export const dismissUpdate = updater.dismiss;
export const refreshBusyTabs = updater.refreshBusyTabs;
