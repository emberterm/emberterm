<script lang="ts">
  import { untrack } from "svelte";
  import { openUrl } from "@tauri-apps/plugin-opener";
  import { Btn } from "@emberterm/ui";
  import ReleaseNotes from "./ReleaseNotes.svelte";
  import { formatReleaseDate } from "../utils/releaseNotes.js";
  import type { UpdateState } from "../utils/updater.js";

  const RELEASES = "https://github.com/emberterm/emberterm/releases";

  interface Props {
    state: UpdateState;
    onCheck: () => void;
    onInstall: () => void;
    onDismiss: () => void;
  }

  let { state: update, onCheck, onInstall, onDismiss }: Props = $props();

  // The webview would navigate away from the app; hand links to the system browser instead.
  function open(e: MouseEvent, url: string) {
    e.preventDefault();
    openUrl(url).catch(console.error);
  }

  const meta = $derived.by(() => {
    if (update.kind !== "available") return "";
    const parts = [`You have ${update.currentVersion}`];
    if (update.notes.status === "ready" && update.notes.entries.length > 1) parts.push(`${update.notes.entries.length} releases since`);
    const date = formatReleaseDate(update.date);
    if (date) parts.push(`Released ${date}`);
    return parts.join(" · ");
  });

  let cardEl = $state<HTMLDivElement | undefined>();
  const kind = $derived(update.kind);
  // The About page has its header above the card, so without this Install can sit below the fold.
  $effect(() => {
    if (kind === "available" && cardEl) untrack(() => cardEl?.scrollIntoView({ block: "nearest" }));
  });

  // An error message may end without a full stop, and a sentence follows it.
  const stop = (m: string): string => (/[.!?…]\s*$/.test(m) ? "" : ".");
  const plural = (n: number) => `${n} tab${n === 1 ? "" : "s"}`;
  const idleStatus = $derived(
    update.kind === "checking" ? "Checking for updates…" : update.kind === "current" ? "You're on the latest version." : "",
  );
</script>

{#snippet extlink(url: string, label: string)}
  <a href={url} onclick={(e) => open(e, url)}>
    {label}
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </a>
{/snippet}

{#if update.kind === "available"}
  <div class="card" bind:this={cardEl}>
    <div class="title">EmberTerm {update.version} is available</div>
    <div class="meta">{meta}</div>
    <div class="label">What's new since {update.currentVersion}</div>
    <ReleaseNotes entries={update.notes.entries} />
    {#if update.notes.status === "loading"}
      <p class="loading" role="status">Loading notes for earlier releases…</p>
    {:else if update.notes.status === "unavailable"}
      <div class="notice info">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" /><path d="M12 11v5M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        <span>Could not load notes for the releases in between (offline, or GitHub is limiting requests). Showing the newest release only. {@render extlink(RELEASES, "View all releases")}</span>
      </div>
    {/if}
    <div class="footer">
    <div class="notice warn" role="note">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 3 2 20h20L12 3ZM12 10v5M12 17.5h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span>
        {#if update.busyTabs > 0}
          Installing restarts EmberTerm and stops the programs running in {plural(update.busyTabs)}. Your tabs, splits and folders come back.
        {:else}
          Installing restarts EmberTerm. Your tabs, splits and folders come back.
        {/if}
      </span>
    </div>
    <div class="actions">
      <Btn variant="primary" onclick={onInstall}>Install {update.version} and restart</Btn>
      <Btn onclick={onDismiss}>Not now</Btn>
      <span class="spacer">{@render extlink(update.compareUrl ?? RELEASES, "Full changelog on GitHub")}</span>
    </div>
    </div>
  </div>
{:else if update.kind === "downloading" || update.kind === "installing"}
  <div class="card">
    <div class="title">Installing EmberTerm {update.version}</div>
    <div class="meta">Downloading the update. Keep EmberTerm open.</div>
    {#if update.kind === "downloading"}
      <div class="bar" role="progressbar" aria-label="Download progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow={update.pct ?? undefined}>
        <div class="fill" style:width="{update.pct ?? 100}%"></div>
      </div>
      <div class="progress-row" role="status" aria-live="polite">
        <span>{update.pct === null ? `Downloading ${update.version}…` : `Downloading ${update.version} — ${update.pct}%`}</span>
        <span>EmberTerm restarts when it finishes</span>
      </div>
    {:else}
      <div class="bar" role="progressbar" aria-label="Download progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100">
        <div class="fill" style:width="100%"></div>
      </div>
      <div class="progress-row" role="status" aria-live="polite"><span>Installing {update.version}; EmberTerm will restart.</span></div>
    {/if}
    <div class="actions">
      <Btn variant="primary" disabled>Installing…</Btn>
      <Btn disabled>Not now</Btn>
    </div>
  </div>
{:else if update.kind === "error"}
  <div class="card">
    <div class="notice err" role="alert">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" /><path d="m9 9 6 6M15 9l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
      <span>
        <b>Update failed.</b> {update.message}{stop(update.message)}
        {#if update.step === "install"}Nothing was changed, and you are still on {update.currentVersion}.{/if}
      </span>
    </div>
    <div class="actions">
      <Btn variant="primary" onclick={update.step === "install" ? onInstall : onCheck}>Try again</Btn>
      <Btn onclick={onDismiss}>Dismiss</Btn>
      <span class="spacer">{@render extlink(RELEASES, "Download it from GitHub")}</span>
    </div>
  </div>
{:else}
  <div class="check-row">
    <Btn variant="primary" disabled={update.kind === "checking"} onclick={onCheck}>Check for updates</Btn>
    <span class="status" role="status" aria-live="polite">{idleStatus}</span>
  </div>
{/if}

<style>
  .card { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; background: var(--bg-elev); border: 1px solid var(--border); border-radius: 8px; }
  .title { font-size: 15px; font-weight: 600; color: var(--fg); }
  .meta { margin-top: -6px; font-size: 12px; color: var(--fg-muted); }
  .label { font-size: 12px; font-weight: 600; color: var(--fg-muted); }
  .loading { margin: 0; font-size: 12px; color: var(--fg-muted); }

  .notice { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-block); font-size: 13px; line-height: 1.5; color: var(--fg); }
  .notice svg { flex: none; margin-top: 1px; }
  .warn svg { color: var(--yellow); }
  .info svg { color: var(--blue); }
  .err { border-color: var(--red); }
  .err svg { color: var(--red); }

  /* Stays at the bottom of the visible area while the notes scroll, so Install is never off screen.
     The -20px is the bottom padding of the Settings content area (SettingsPanel.svelte): sticky
     respects it, and without the offset list rows show through below the footer. */
  .footer { position: sticky; bottom: -20px; display: flex; flex-direction: column; gap: 10px; margin: 0 -16px -14px; padding: 10px 16px 14px; background: var(--bg-elev); border-top: 1px solid var(--border); border-radius: 0 0 8px 8px; }

  .actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .spacer { margin-left: auto; }
  .check-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .status { font-size: 12px; color: var(--fg-muted); }

  .bar { height: 8px; border-radius: 4px; background: var(--bg-block); overflow: hidden; }
  .fill { height: 100%; background: var(--accent); }
  .progress-row { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; color: var(--fg-muted); }

  a { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-size: 13px; text-decoration: none; }
  a:hover { text-decoration: underline; }
  a:focus-visible { outline: 2px solid var(--accent-glow); outline-offset: 2px; border-radius: 2px; }
</style>
