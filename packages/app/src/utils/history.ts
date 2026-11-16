/** Commands kept per pane and replayed into the shell on restore. */
export const HISTORY_MAX = 10;

/** A pasted blob is not a command worth recalling and would bloat session.json. */
const MAX_COMMAND_CHARS = 1000;

/** session.json is plaintext, so obvious secrets are kept out. Best effort, not a guarantee. */
const SECRET = /(password|passwd|secret|token|api[_-]?key|authorization|bearer)\s*[=:]/i;

/** Whether a command may be saved: not empty, hidden (leading space), multi-line, huge or secret-looking. */
export function shouldRecord(cmd: string): boolean {
  if (!cmd.trim() || cmd.startsWith(" ")) return false;
  if (cmd.includes("\n") || cmd.includes("\r") || cmd.length > MAX_COMMAND_CHARS) return false;
  return !SECRET.test(cmd);
}

/** `list` plus `cmd` as the newest entry: a repeat of the last command is dropped, only the newest `max` stay. */
export function appendCommand(list: readonly string[], cmd: string, max = HISTORY_MAX): string[] {
  const base = list.length && list[list.length - 1] === cmd ? [...list] : [...list, cmd];
  return base.slice(-max);
}
