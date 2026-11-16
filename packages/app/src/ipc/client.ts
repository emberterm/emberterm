import { invoke, Channel } from "@tauri-apps/api/core";
import { toBytes } from "../terminal/outputSink.js";
import type { SavedSession } from "../stores/sessionSnapshot.js";
import type { InstalledFont } from "../utils/fontFamily.js";

export type SessionId = string;

// ── Session commands ──────────────────────────────────────────────────────────

export async function sessionCreate(opts: {
  profileId?: string;
  /** Last folder this pane reported (OSC 7); the shell restores it if it still exists. */
  cwd?: string;
  /** Last commands of this pane, oldest first; the shell loads them into its history. */
  history?: string[];
  onOutput: (bytes: Uint8Array) => void;
}): Promise<SessionId> {
  const channel = new Channel<ArrayBuffer>();
  channel.onmessage = (msg) => opts.onOutput(toBytes(msg));
  return invoke("session_create", { profileId: opts.profileId ?? null, cwd: opts.cwd ?? null, history: opts.history ?? null, onOutput: channel });
}

export async function sessionWrite(id: SessionId, data: Uint8Array): Promise<void> {
  return invoke("session_write", { id, data: Array.from(data) });
}

export async function sessionResize(id: SessionId, cols: number, rows: number): Promise<void> {
  return invoke("session_resize", { id, cols, rows });
}

/** True while a program is still running inside the session's shell. */
export async function sessionBusy(id: SessionId): Promise<boolean> {
  return invoke("session_busy", { id });
}

/** xterm has parsed `bytes` more of this session's output; Rust waits for this under a flood. */
export async function sessionAck(id: SessionId, bytes: number): Promise<void> {
  return invoke("session_ack", { id, bytes });
}

export async function sessionClose(id: SessionId): Promise<void> {
  return invoke("session_close", { id });
}

/** Font families installed on this computer. */
export async function fontList(): Promise<InstalledFont[]> {
  return invoke("font_list");
}

// ── Config commands ───────────────────────────────────────────────────────────

export async function configGet(): Promise<unknown> {
  return invoke("config_get");
}

export async function configUpdate(patch: Record<string, unknown>): Promise<unknown> {
  return invoke("config_update", { patch });
}

// ── Profile commands ──────────────────────────────────────────────────────────

export interface Profile {
  id: string;
  name: string;
  shell: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

export async function profileList(): Promise<Profile[]> {
  return invoke("profile_list");
}

export async function profileUpsert(profile: Profile): Promise<void> {
  return invoke("profile_upsert", { profile });
}

export async function profileDelete(id: string): Promise<void> {
  return invoke("profile_delete", { id });
}

export interface BuiltinProfileSpec {
  id: string;
  name: string;
  shell: string;
  args: string[];
  description: string;
}

/** Probe the system for known shells and return those that are installed. */
export async function detectBuiltinProfiles(): Promise<BuiltinProfileSpec[]> {
  return invoke("detect_builtin_profiles");
}

// ── Utility commands ──────────────────────────────────────────────────────────

export interface GitStatus {
  branch: string | null;
  dirty: boolean;
  insertions: number;
  deletions: number;
}

/** Returns git status (branch, dirty flag, line diff counts) for the given directory. */
export async function gitStatus(cwd: string): Promise<GitStatus> {
  return invoke<GitStatus>("git_status", { cwd });
}

export interface StartupWarning {
  file: string;
  message: string;
  backup?: string | null;
}

export async function sessionLoad(): Promise<{ session: SavedSession | null; warning: StartupWarning | null }> {
  return invoke("session_load");
}

export async function sessionSave(session: SavedSession): Promise<void> {
  return invoke("session_save", { session });
}

/** Warnings from loading config/profiles at startup (drained on read). */
export async function startupWarnings(): Promise<StartupWarning[]> {
  return invoke("startup_warnings");
}

/** Returns true when no config.toml exists yet (first run). */
export async function configIsFirstRun(): Promise<boolean> {
  return invoke<boolean>("config_is_first_run");
}
