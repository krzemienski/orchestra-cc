#!/bin/bash
# Starts Claude Code with Orchestra in a detached tmux session, in a fresh fixture repo and a
# fresh CLAUDE_CONFIG_DIR, so the owner's ~/.claude is never read or changed and every run starts
# from the same files. Prints the fixture and config paths.
# Usage: .planning/live/launch.sh <session> <plugin-dir> <cols> <rows> [theme] [extra claude args...]
set -eu
S="$1"; PLUGIN="$(cd "$2" && pwd)"; COLS="$3"; ROWS="$4"; THEME="${5:-dark}"
shift 4; [ $# -gt 0 ] && shift
# ORCH_BASE=<dir printed by an earlier launch, without /fixture> reuses that fixture and config
# (for `--continue`), instead of making fresh ones.
if [ -n "${ORCH_BASE:-}" ]; then
  BASE="$ORCH_BASE"; REPO="$BASE/fixture"; CFG="$BASE/config"
else
BASE=$(mktemp -d "${TMPDIR:-/tmp}/orch-live-XXXX")
REPO="$BASE/fixture"; CFG="$BASE/config"
mkdir -p "$REPO/config" "$REPO/src/db" "$REPO/docs" "$CFG"
printf '{"maxUsers": 10}\n' > "$REPO/config/limits.json"
printf 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);\n' > "$REPO/src/db/schema.sql"
printf 'The service allows at most 10 users.\n' > "$REPO/docs/limits.md"
git -C "$REPO" init -q && git -C "$REPO" add . && git -C "$REPO" -c user.name=fixture -c user.email=f@x commit -qm fixture
REAL=$(cd "$REPO" && pwd -P)
# First-run screens (theme picker, folder trust) answered in the config, not by keystrokes.
cat > "$CFG/.claude.json" <<EOF
{"hasCompletedOnboarding": true, "theme": "$THEME", "bypassPermissionsModeAccepted": true,
 "projects": {"$REAL": {"hasTrustDialogAccepted": true, "hasCompletedProjectOnboarding": true}}}
EOF
printf '{"theme":"%s","permissions":{"defaultMode":"acceptEdits","allow":["Bash","Read","Edit","Write","Glob","Grep"]}}\n' "$THEME" > "$CFG/settings.json"
fi
# A detached session takes the tmux server's environment, not this shell's: the login variables
# are passed in explicitly.
AUTH=(); while IFS= read -r v; do AUTH+=(-e "$v"); done < <(env | grep -E '^(ANTHROPIC_[A-Z_]+|CLAUDE_CODE_OAUTH_TOKEN|CLAUDE_CODE_NO_FLICKER)=')
tmux new-session -d -s "$S" -x "$COLS" -y "$ROWS" -c "$REPO" "${AUTH[@]}" \
  env -u CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN \
  -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_PID \
  -u CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS -u CLAUDE_EFFORT -u CLAUDE_CODE_EXECPATH -u TMUX -u TMUX_PANE \
  CLAUDE_CONFIG_DIR="$CFG" TERM="${ORCH_TERM-xterm-256color}" COLORTERM="${ORCH_COLORTERM-truecolor}" \
  claude --plugin-dir "$PLUGIN" --agent orchestra:conductor "$@"
tmux set-option -t "$S" window-size manual >/dev/null
tmux set-option -t "$S" remain-on-exit on >/dev/null
echo "repo=$REPO"
echo "config=$CFG"
