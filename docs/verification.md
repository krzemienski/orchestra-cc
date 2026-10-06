# Orchestra — verification record

Date: 2026-10-05. Claude Code 2.1.289 on macOS, in tmux (230×64, later 50×41 when other clients attached).

Every result below comes from a real run. The plugin was loaded with `--plugin-dir ./plugin`. Each run used an isolated `CLAUDE_CONFIG_DIR` (a temporary directory with no other plugins, hooks or MCP servers), so the author's own configuration was neither used nor changed. Claude Code was driven by sending keystrokes into tmux; screens were read with `tmux capture-pane` (plain and with colour codes); and a recorder saved the screen every second, so toasts that last 4–8 s were caught. Ledgers were read back with the plugin's own `fold()` and compared with `shasum -a 256` and `git show`.

The raw captures (about 1,400 screen frames and their indexes) were kept only on the verification machine and have since been deleted; they were never part of this repository. The key output of each check is quoted here, so this document is the record.

## Runs

| Run | What it exercised | Result |
| --- | --- | --- |
| Run 1, interactive | Five-wave plan: four parts in parallel, a test failure, a fix, a doc refresh, a review; "Show both versions" then "Send it back"; every pane tab; `/orchestra coda`; reload with `--continue`; theme switches | Passed, with defects found and fixed (below) |
| Run 2, interactive | Bash-made edit, "Let it write", conflict toast after the decision, grouped Agent rows | Passed after fixes; exposed a Bash-attribution defect, fixed |
| Run 3, interactive | The planned config conflict (stale edit after `sleep 30`), comparison above the dialog, test failure and recovery, two stale reads redone | Passed |
| Run 4, interactive | "Changed since the writer's version" comparison above the dialog | Passed |
| J10, headless `claude -p` | Same conflict with nobody to answer | Passed: sent back automatically |
| J11, `disableAllHooks: true` | Mods off | Passed: agents work, nothing recorded |

## Screens (PRD §2)

| Screen | Verified output (quoted from the captures) | Status |
| --- | --- | --- |
| S1 Band | `𝄐 Orchestra   Violin ♪ 3   Flute ♪ 3   Trumpet ♪ 1 Bash   Trumpet 2 ♪ 1`; settled: `Violin ✓ 3   Flute ✓ 4   Trumpet ✓ 5 …`; wraps onto four rows at 50 columns | Verified |
| S2 Status line | `⚠ orchestra: Orchestra · 4 playing · 0 done · 0 artifacts changed`; later `… · 0 playing · 6 done · 4 artifacts changed · 1 stale` | Verified |
| S3 Pane frame | `No performance yet. Start one with: claude --agent orchestra:conductor`; opened by itself on the first part; tabs `1: Ensemble   2: Score   3: Artifacts   4: Coda` | Verified (framed above the prompt; the sidebar placement of a fullscreen terminal was not tested) |
| S4 Ensemble | `4 playing in parallel · 0 done`; per musician `Flute Scribe · ✓ done ▸ details` and `4 measures · 2 reads · 1 writes`; details: part brief and `src/limiter.js v0 (now v1)` | Verified (keys 1, Tab, Enter) |
| S5 Score | Ten staffs over 172 events with `◆ ○ ● ← · ✓ ✕ ‼ ⚠ ? 𝄐` and the legend | Verified (key 2) |
| S6 Artifacts | `config/limits.json v2 ▾ details`, `v0 as first seen sha256:7554c7b9c10f`, `v1 by Trumpet 2 from v0 +2 −1 sha256:8c84199c6d45`, `v2 by Trumpet from v1 +1 −1 sha256:a5ea50206da1`, then reads by version and event | Verified (key 3, Tab, Enter) |
| S7 Coda tab | Task, coda file path, contributions, artifacts, handoffs, conflicts, failures, stale reads, identical to the coda file | Verified (key 4) |
| S8 Transcript rows | Agent label `✓ Trumpet 3 · Implementer · 3 measures` and `‖ Timpani 2 · Tester · 2 measures` above single Agent rows; spinner `✳ Finagling… · 4 musicians playing`; coda line `orchestra: Orchestra coda: Orchestra · 0 playing · 9 done · 3 artifacts changed. Written to .orchestra/performances/…-coda.md` | Verified; see limitation 1 |
| S9 Conflict dialog | `Orchestra: Trumpet 2 wrote config/limits.json v1 and Trumpet saw v0. Let Trumpet's Edit go ahead?` with `1. Let it write  2. Send it back to re-read  3. Show both versions`. After choice 3, above the dialog: `Held write by Trumpet (Edit) on config/limits.json` / `Added by Trumpet 2 since Trumpet saw v0 (now v1): + "perMinute": 20, + "burst": 5` / `Trumpet wants to replace: "perMinute": 20 ↓ "perMinute": 60` | Verified, both outcomes |
| S10 Toasts | `Orchestra · handoff: Trumpet 3 was handed config/limits.json v1 from Trumpet 2`; `Orchestra · stale read: Flute worked from v0 of src/limiter.js; Trumpet 4 wrote v1`; `Orchestra · Timpani: Bash failed`; `Orchestra · conflict on config/limits.json: Trumpet vs Trumpet 2, sent back to re-read`; `… write allowed`; `Orchestra · coda ready: /orchestra and open the Coda tab` | Verified, all five kinds |
| S11 Commands | `/orchestra ledger` → `No performance in this session yet …` and later `.orchestra/performances/<id>.0001.jsonl · 172 events · … · colours: dark`; `/orchestra coda` prints the status, each contributor, conflict, failure, stale read and handoff count | Verified |
| Keyboard (G6) | Keys 1–4 switch tabs; Tab moves focus (the focused button is drawn in inverse video); Enter opens and closes details; Esc closes the pane | Verified |
| Colours (G7, §6.4) | Dark theme: instrument colours appear as their 256-colour equivalents (conductor 183, flute 115, trumpet 222, timpani 216, violin 111). After `/theme` → Light, they change to the light tokens' equivalents (violin 68, flute 66); after an ANSI theme, `/orchestra ledger` reports `colours: ansi` and the band uses the terminal palette | Verified as switching; exact hex values were not observable because tmux passed 256 colours only |

## Data operations

| Requirement | Evidence | Status |
| --- | --- | --- |
| Every read and write recorded per musician with SHA-256 (G2) | For each file in run 1, the ledger's first version equals `git show HEAD:<file> \| shasum -a 256` (e.g. `config/limits.json 7554c7b9c10f`) and its latest version equals `shasum -a 256 <file>` now (`a5ea50206da1`, `c2849cdd775e`, `fdfd892cb7c4`, `60611abc3974`) | Verified |
| Conflicts derived from versions, held and decided (G3) | Run 3: `write.attempt` with Trumpet's last-seen v0 against current v1 → dialog → `conflict.resolved reread` → the edit denied with the reason → a new part reapplied it; final file holds both `"perMinute": 60` and `"burst": 5` | Verified |
| Headless conflict | J10 ledger: `27 write.attempt`, `28 conflict.resolved reread`, `29 tool.result sentBack`; exit 0; final config holds both changes | Verified |
| Stale reads and redo | Run 3 coda: `Flute produced docs/limits.md from v0 of src/limiter.js; Trumpet 4 then wrote v1. Redone from the current version by Flute 2.` Run 2: `… Not redone.` with `1 stale` in the status line | Verified |
| Handoffs | Read signal (`Trumpet 2 → Trumpet: config/limits.json v1`) and brief signal (`Timpani → Trumpet 4: .orchestra/logs/test-run.txt v0 (named in the brief)`) | Verified |
| Failures and recovery | Run 3 coda: `Timpani: Bash npm test failed; Timpani 2 later ran it successfully.` | Verified |
| Bash-made edits | Run 2: `sed -i` on `src/limiter.js` recorded as `v1 by Trumpet 3 (+1 −1)` | Verified |
| Coda matches the ledger (G4) | Coda tab, `/orchestra coda` and the coda file show the same counts in run 1 | Verified |
| Reload and resume (J9) | Before restart: `Orchestra · 0 playing · 9 done · 3 artifacts changed`; after `claude --continue`: the same line and the same band, replayed from `<id>.0001.jsonl` | Verified |
| Segmented ledger | Files written as `<session-id>.0001.jsonl`; replay reads segments in order | Verified for one segment; a run longer than 500 events was not made |
| Ledger replay | All five run ledgers (172, 115, 143, 59 and 48 events) fold without error under the final code, with zero `Guest` entries | Verified |
| Mods disabled (J11) | `disableAllHooks: true`: exit 0, the violin's notes file written, no `.orchestra/performances` directory | Verified |
| Plugin checks | `claude plugin validate ./plugin` → `✔ Validation passed`; `tsc -p plugin --noEmit` → exit 0 | Verified |

## Defects found by verification and fixed

1. Every musician was named `Guest (part.assigned)`: the spawn event's subagent type was overwritten by the event's own `type` field.
2. The coda's Task line was a background-task notification: only a person's own prompt now sets it.
3. The conductor's exploratory commands and another plugin's helper agent were listed as failures.
4. Event timestamps were `{}`: `$.clock.now()` returns a promise.
5. "Show both versions" opened the pane where the dialog hid it; the comparison is now drawn above the dialog. The first version was refused by Claude Code ("more than 12 rows around the dialog") and was cut to fit.
6. The comparison showed the first lines of the file instead of what changed; it now shows the lines added since the writer's version.
7. The conflict toast was hidden under the dialog; it now fires after the decision and says the outcome.
8. Conflict text read `saw vnone`; it now says `never read it`.
9. A Bash-only change was not attributed, and the first fix credited a concurrent writer's change to whoever ran a long Bash command, which hid a real conflict. A Bash change is now credited only when its hash is new to the ledger.
10. A stale read could never clear, because a finished subagent cannot re-read; it now clears when its product is rewritten from the current version.
11. After a reload the band stayed blank until the next event; the mod now redraws after replaying.
12. `/theme` does not raise the `config.set` event; a 2-second timer now re-reads the theme.
13. The tester hid exit codes with `; echo $?`, so a failing test looked like a success; the tester's and conductor's instructions now forbid appending anything to a command, and run 3 recorded the failure.

## Limitations confirmed by verification

1. When the conductor starts several parts in one message, Claude Code draws one summary row ("3 background agents launched") that is not a mod render site, so instrument labels appear only on single Agent rows.
2. A failing command is recorded as failed only if the tester does not hide its exit code. That rule is in the agents' instructions, which a model can still ignore.
3. Files created by Bash (rather than changed) are not recorded; musicians are instructed to create files with Write and Edit.
4. Exact truecolor hex values were not observed; tmux reduced them to 256 colours.
5. The pane's sidebar placement in a fullscreen terminal and agent teams were not tested.
6. If one of Orchestra's own hooks fails, Claude Code skips it and the tool runs (fail open), by design (PRD goal G5). `claude plugin validate` reports this as `gating hook without .catch: tool.call`.
