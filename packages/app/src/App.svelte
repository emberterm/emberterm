<script lang="ts">
  import TabPane from "./terminal/TabPane.svelte";
  import TitleBar from "./chrome/TitleBar.svelte";
  import StatusBar from "./chrome/StatusBar.svelte";
  import Toasts from "./chrome/Toasts.svelte";
  import CommandPalette from "./palette/CommandPalette.svelte";
  import SettingsPanel from "./settings/SettingsPanel.svelte";
  import WelcomeScreen from "./welcome/WelcomeScreen.svelte";
  import { formatWarning } from "./utils/warnings.js";
  import { shortcutFor } from "./utils/shortcuts.js";
  import { closeWindowWhenEmpty } from "./session/closeWindow.js";
  import { isPaneBusy, onPaneIdle } from "./stores/paneBusy.js";
  import { sessionClose, sessionBusy, configIsFirstRun, configGet, profileList, startupWarnings, sessionLoad, sessionSave, type Profile } from "./ipc/client.js";
  import { loadFontConfig } from "./theme/fontStore.js";
  import { loadTerminalConfig } from "./stores/terminalConfigStore.js";
  import { loadPadding } from "./theme/paddingStore.js";
  import { loadThemeConfig } from "./theme/store.js";
  import { removeOutputSink } from "./terminal/outputSink.js";
  import ConfirmDialog from "./chrome/ConfirmDialog.svelte";
  import { gitInfo, refreshGit } from "./stores/gitStatus.js";
  import { terminalConfig } from "./stores/terminalConfigStore.js";
  import { shouldConfirmClose } from "./session/confirmClose.js";
  import { spawnPane } from "./session/spawnPane.js";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { createAutosave } from "./session/autosave.js";
  import { pickProfile } from "./session/profiles.js";
  import { duplicateIndex } from "./session/duplicateTab.js";
  import { toSnapshot, clampActiveTab, type SavedSession, type SavedTab } from "./stores/sessionSnapshot.js";
  import { onProfilesUpdated, onConfigUpdated, onAppWarning } from "./ipc/events.js";
  import {
    tabs, activeCwd, activeShell,
    addTab, removeTab, activateTab, moveTab, setPaneCwd, setTabTitle,
    setTabSplit, clearTabSplit, pushToast, restoreCustomTitle,
  } from "./stores/app.js";

  let loading = $state(true);
  let error = $state<string | null>(null);
  let paletteOpen = $state(false);
  let settingsOpen = $state(false);
  let showWelcome = $state(false);
  let termCols = $state(0);
  let termRows = $state(0);
  let profileCache = $state<Profile[]>([]);
  let defaultProfileId = $state("");

  function shellBasename(p: string) { return (p.split(/[\\/]/).pop() ?? p).replace(/\.exe$/i, ""); }

  function handlePaneTitle(sessionId: string, title: string) {
    setTabTitle(sessionId, /^[A-Za-z]:[\\/]|^\//.test(title) ? shellBasename(title) : title);
  }


  // Also refresh when a command ends: git checkout/commit change branch and dirty state, not the folder.
  $effect(() => { const cwd = $activeCwd; refreshGit(cwd); return onPaneIdle(() => refreshGit(cwd)); });

  async function loadDefaultProfileId() {
    try {
      const c = (await configGet()) as { behavior?: { default_profile?: string } };
      defaultProfileId = c?.behavior?.default_profile ?? "";
    } catch { /* keep the previous value */ }
  }

  let autosaveReady = $state(false), lastSaveErrorAt = 0;
  const autosave = createAutosave({
    delayMs: 500,
    save: sessionSave,
    onError: (e) => {
      console.error("session save failed", e);
      if (Date.now() - lastSaveErrorAt > 60_000) {
        lastSaveErrorAt = Date.now();
        pushToast(`Could not save session: ${e}`);
      }
    },
  });

  // Snapshot on every tab change once restore has finished (a partial restore must not be saved).
  $effect(() => {
    const snapshot = toSnapshot($tabs);
    if (autosaveReady) autosave.schedule(snapshot);
  });

  // The title bar's close button calls win.close(), which lands here too.
  $effect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onCloseRequested(async () => {
        await autosave.flush();
        autosave.suspend();
      })
      .then((fn) => { unlisten = fn; })
      .catch(console.error);
    return () => unlisten?.();
  });

  $effect(() => {
    let active = true;
    const cleanup: Array<() => void> = [];
    (async () => {
      try {
        showWelcome = await configIsFirstRun();
        await Promise.all([loadFontConfig(), loadTerminalConfig(), loadPadding(), loadThemeConfig(), loadDefaultProfileId()]);
        const { session, warning } = await sessionLoad();
        if (warning) pushToast(formatWarning(warning));
        const restored = session ? await restoreSession(session) : false;
        if (!restored) await openNewTab();
        autosaveReady = true;
      } catch (e) { error = String(e); }
      finally { loading = false; }
      if (!active) return;
      const fns = await Promise.all([
        onAppWarning((w) => pushToast(formatWarning(w))),
        onProfilesUpdated(() => { profileList().then((p) => { profileCache = p; }).catch(() => { profileCache = []; }); }),
        onConfigUpdated(() => { loadDefaultProfileId(); }),
      ]);
      if (!active) { fns.forEach((f) => f()); return; }
      cleanup.push(...fns);
      startupWarnings().then((ws) => ws.forEach((w) => pushToast(formatWarning(w)))).catch(console.error);
    })();
    return () => { active = false; cleanup.forEach((f) => f()); };
  });

  function handleWindowKeydown(e: KeyboardEvent) {
    const action = shortcutFor(e);
    if (!action) return;
    e.preventDefault();
    switch (action) {
      case "palette": paletteOpen = !paletteOpen; break;
      case "newTab": openNewTab(); break;
      case "closeTab": closeActiveTab(); break;
      case "settings": settingsOpen = true; break;
      case "nextTab": cycleTab(1); break;
      case "prevTab": cycleTab(-1); break;
      case "moveTabLeft": shiftActiveTab(-1); break;
      case "moveTabRight": shiftActiveTab(1); break;
      case "splitHorizontal": splitActiveTab("horizontal"); break;
      case "splitVertical": splitActiveTab("vertical"); break;
    }
  }

  function cycleTab(dir: 1 | -1) {
    const ts = $tabs;
    if (ts.length < 2) return;
    activateTab(ts[(ts.findIndex((t) => t.isActive) + dir + ts.length) % ts.length].id);
  }
  function shiftActiveTab(dir: 1 | -1) {
    const i = $tabs.findIndex((t) => t.isActive);
    if (i >= 0) moveTab($tabs[i].id, i + dir);
  }
  async function closeActiveTab() {
    const tab = $tabs.find((t) => t.isActive);
    if (tab) await askCloseTab(tab.id, tab.sessionId);
  }

  /** Requested id, else the configured default, else the first profile (see pickProfile). */
  function resolveProfile(profileId?: string): Profile | undefined {
    return pickProfile(profileCache, profileId, defaultProfileId);
  }

  async function openNewTab(profileId?: string, cwd?: string): Promise<string | null> {
    try {
      if (!profileCache.length) { try { profileCache = await profileList(); } catch { /* ignore */ } }
      const profile = resolveProfile(profileId);
      const label = profile?.name ?? shellBasename(profile?.shell ?? "Shell");
      const shell  = profile ? shellBasename(profile.shell) : "";
      // Spawn the resolved profile, not the requested id: a dangling default_profile
      // must not make Rust pick a different shell than the tab is labelled with.
      const sessionId = await spawnPane(profile?.id, cwd);
      return addTab(sessionId, label || "Shell", shell, profile?.id);
    } catch (e) {
      // A toast, not the full-screen error splash: other (restored) tabs must stay usable.
      pushToast(`Failed to open tab: ${e}`);
      return null;
    }
  }

  async function splitTab(tabId: string, direction: "horizontal" | "vertical", profileId?: string, cwd?: string) {
    try {
      const profile = resolveProfile(profileId);
      const sessionId = await spawnPane(profile?.id, cwd);
      setTabSplit(tabId, sessionId, direction, profile?.id);
    } catch (e) { pushToast(`Failed to split pane: ${e}`); }
  }

  /** Fresh shells for one saved tab: its panes' profile and folder, split and custom title. */
  async function openSavedTab(t: SavedTab): Promise<string | null> {
    const id = await openNewTab(t.pane.profile_id, t.pane.cwd);
    if (!id) return null;
    if (t.custom_title && t.title) restoreCustomTitle(id, t.title);
    if (t.split) {
      const dir = t.split.direction === "vertical" ? "vertical" : "horizontal";
      await splitTab(id, dir, t.split.pane.profile_id, t.split.pane.cwd);
    }
    return id;
  }

  async function duplicateTab(tabId: string) {
    const src = $tabs.find((t) => t.id === tabId);
    if (!src) return;
    const id = await openSavedTab(toSnapshot([src]).tabs[0]);
    if (!id) return;
    const at = duplicateIndex($tabs, tabId);
    if (at >= 0) moveTab(id, at);
  }

  async function restoreSession(saved: SavedSession): Promise<boolean> {
    const ids: string[] = [];
    for (const t of saved.tabs) {
      const id = await openSavedTab(t);
      if (id) ids.push(id);
    }
    if (!ids.length) return false;
    activateTab(ids[Math.min(clampActiveTab(saved), ids.length - 1)]);
    return true;
  }

  let pendingClose = $state<{ tabId: string; sessionId: string } | null>(null);

  /** A close the user asked for: confirm first if a program is still running in the tab. */
  async function askCloseTab(tabId: string, sessionId: string) {
    const tab = $tabs.find((t) => t.id === tabId);
    const ids = [sessionId, ...(tab?.splitSessionId ? [tab.splitSessionId] : [])];
    if (await shouldConfirmClose(ids, $terminalConfig.confirmCloseRunning, (id) => isPaneBusy(id, sessionBusy))) {
      pendingClose = { tabId, sessionId };
    } else {
      await closeTab(tabId, sessionId);
    }
  }

  async function closeTab(tabId: string, sessionId: string) {
    const tab = $tabs.find((t) => t.id === tabId);
    if (tab?.splitSessionId) {
      await sessionClose(tab.splitSessionId).catch(() => {});
      removeOutputSink(tab.splitSessionId);
    }
    await sessionClose(sessionId).catch(() => {});
    removeOutputSink(sessionId);
    removeTab(tabId);
    if ($tabs.length === 0) await closeWindowWhenEmpty().catch(console.error);
  }

  async function splitActiveTab(direction: "horizontal" | "vertical", profileId?: string) {
    const tab = $tabs.find((t) => t.isActive);
    if (!tab || tab.splitSessionId) return;
    await splitTab(tab.id, direction, profileId);
  }

  async function closeSplitPane(tabId: string) {
    const tab = $tabs.find((t) => t.id === tabId);
    if (!tab?.splitSessionId) return;
    await sessionClose(tab.splitSessionId).catch(() => {});
    removeOutputSink(tab.splitSessionId);
    clearTabSplit(tabId);
  }

</script>

<svelte:window onkeydown={handleWindowKeydown} />

<!--
  .app is the window chrome (title bar + terminals + status bar).
  CSS opacity is applied here so the entire shell fades together.
  Modals are rendered OUTSIDE this div so they are NOT affected by opacity
  and always appear fully opaque, regardless of the user's transparency setting.
-->
<div class="app">
  <TitleBar onNewTab={openNewTab} onCloseTab={askCloseTab} onDuplicateTab={duplicateTab} onOpenSettings={() => (settingsOpen = true)} profiles={profileCache} {defaultProfileId} />
  <main class="terminal-area">
    {#if loading}
      <div class="splash">Starting shell…</div>
    {:else if error}
      <div class="splash error">{error}</div>
    {:else}
      {#each $tabs as tab (tab.id)}
        <TabPane
          {tab}
          isActive={tab.isActive}
          onExit={() => closeTab(tab.id, tab.sessionId)}
          onSplitExit={() => closeSplitPane(tab.id)}
          onResize={tab.isActive ? (c, r) => { termCols = c; termRows = r; } : undefined}
          onCloseSplit={() => closeSplitPane(tab.id)}
          onPaneCwd={setPaneCwd}
          onPaneTitle={handlePaneTitle}
        />
      {/each}
    {/if}
  </main>
  <StatusBar shell={$activeShell} cwd={$activeCwd} gitBranch={$gitInfo.branch} gitDirty={$gitInfo.dirty} gitInsertions={$gitInfo.insertions} gitDeletions={$gitInfo.deletions} {termCols} {termRows} onOpenPalette={() => (paletteOpen = true)} />
</div>

<!-- Modals outside .app — unaffected by window opacity -->
<CommandPalette open={paletteOpen} profiles={profileCache} {defaultProfileId} onClose={() => (paletteOpen = false)} onNewTab={openNewTab} onSplit={splitActiveTab} onOpenSettings={() => (settingsOpen = true)} />
<SettingsPanel open={settingsOpen} onClose={() => (settingsOpen = false)} onTestProfile={(id) => openNewTab(id)} />
{#if showWelcome}
  <WelcomeScreen onComplete={async (profileId) => { showWelcome = false; if ($tabs.length === 0) await openNewTab(profileId); }} />
{/if}
{#if pendingClose}
  <ConfirmDialog
    title="Close this tab?"
    message="A program is still running in it and will be stopped."
    confirmLabel="Close tab"
    onCancel={() => (pendingClose = null)}
    onConfirm={() => { const p = pendingClose; pendingClose = null; if (p) closeTab(p.tabId, p.sessionId); }}
  />
{/if}
<Toasts />

<style>
  .app {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    background: var(--bg, #0d1117);
    color: var(--fg, #e6edf3);
    font-family: system-ui, sans-serif;
    overflow: hidden;
  }
  /* isolation:isolate creates a stacking context so tab-pane children
     cannot visually or event-wise escape above the title bar / status bar. */
  .terminal-area { flex: 1; min-height: 0; position: relative; isolation: isolate; }
  .splash { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--fg-muted, #7d8590); font-size: 14px; }
  .splash.error { color: var(--red, #f85149); }
</style>
