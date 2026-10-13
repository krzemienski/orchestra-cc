---
name: verify
description: Verify an Orchestra change by driving the real Claude Code TUI in tmux with the working-tree plugin, then reading Orchestra's rows off the captured screen.
---

# Verify Orchestra in the real TUI

Orchestra is a Claude Code mod; its only surfaces are what the terminal shows. Verify there.

## Launch

`.planning/live/launch.sh <session> ./plugin <cols> <rows> [theme] [extra claude args]`
starts `claude --plugin-dir ./plugin --agent orchestra:conductor` in a detached tmux session over
a fresh fixture repo and a fresh `CLAUDE_CONFIG_DIR`. Env knobs: `ORCH_COLORTERM`, `ORCH_TERM`,
`ORCH_BASE` (reuse a fixture for `--continue`); `CLAUDE_CODE_NO_FLICKER` and
`CLAUDE_CODE_FORK_SUBAGENT` pass through from your shell.

Gotchas:
- First run in a fresh config shows "Make auto mode your default permission mode?" and eats the
  first paste: if `capture-pane` shows it, send `Down Enter` and paste again.
- Paste prompts with `tmux load-buffer` + `paste-buffer -p`, then `send-keys Enter`.
- Run multi-mode loops in bash, not zsh (zsh does not word-split `$var`).
- Kill a session before reusing its name (`duplicate session` silently reuses the old one).
- Mods have no `process`; a probe mod reads nothing from the environment.

## Capture and read

- `.planning/live/frames.sh <session> <dir> <interval> <count>` saves `fNNNN.txt` and `.ansi`.
- `.planning/live/orchestra-rows.py same <dir>`: are Orchestra's rows identical across frames.
- `.planning/live/g10-check.py <ledger.jsonl> <names.json> <dir>`: does each playing row (band,
  Ensemble, Agent rows) match the ledger's open call.
- `.planning/live/ansi2png.py <capture.ansi> <out.png> [--crop c0:c1:r0:r1]` for screenshots.
- Ledger: `<fixture>/.orchestra/performances/*.jsonl`.

## Flows worth driving

- Ten parts from one prompt (`e2e-evidence/run-*-v020-fix2/step-16-ten-prompt-v3.txt`): ten
  labelled Agent rows, no "agents launched" block, conflict dialog, failed row, outcome line.
- Resize mid-run with `tmux resize-window -t <s> -x 100 -y 20` and back: pane goes inline and back
  to docked; band, status line and key hints must survive both.
- Hold the conflict dialog 12 s before capturing: toasts overlap its status row until they expire.
