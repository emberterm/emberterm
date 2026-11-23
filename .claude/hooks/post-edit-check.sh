#!/usr/bin/env bash
# PostToolUse hook for Edit|Write: type-check the file that was just changed.
#
# Claude Code passes the tool call as JSON on stdin (tool_input.file_path). The hook is silent when
# the check passes. When it fails it prints the errors to stderr and exits 2, which shows them to
# Claude; the edit has already happened and is never undone.

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

FILE=$(node -e '
  let input = "";
  process.stdin.on("data", (chunk) => (input += chunk));
  process.stdin.on("end", () => {
    try { process.stdout.write(JSON.parse(input).tool_input?.file_path ?? ""); } catch {}
  });
' 2>/dev/null)

[[ -z "$FILE" ]] && exit 0

# Normalise to forward slashes for matching
FILE="${FILE//\\//}"

# Build output, scratch files and tooling config are not worth a type-check.
case "$FILE" in
  */node_modules/* | */target/* | */dist/* | */tmp/* | */.claude/* | */.superpowers/*) exit 0 ;;
esac

# Runs a check; on failure shows the relevant lines (or the tail) to Claude.
run_check() {
  local label="$1"
  shift
  local out
  if out=$("$@" 2>&1); then
    return 0
  fi
  {
    echo "$label failed after editing $FILE:"
    local lines
    lines=$(printf '%s\n' "$out" | grep -E '^(error|warning)|-->|Error|ERROR|error TS' | head -30)
    if [[ -n "$lines" ]]; then printf '%s\n' "$lines"; else printf '%s\n' "$out" | tail -20; fi
  } >&2
  exit 2
}

case "$FILE" in
  *.rs) run_check "cargo check" cargo check --manifest-path packages/desktop/Cargo.toml ;;
  *.svelte | *.ts) run_check "svelte-check" pnpm turbo check ;;
esac

exit 0
