# Orchestra — verification record

Date: 2026-10-05. Claude Code 2.1.289 on macOS, in tmux (230×64, later 50×41 when other clients attached). The install from the published repository was run on 2026-10-06 with Claude Code 2.1.291 (see "Install from the published repository").

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
| Fix check, interactive | A write of a file the musician never read | Passed: sent back without a question, then written on retry (below) |
| J1 and J2, published 0.1.1 | Install from GitHub into an empty config, then load the installed mod | Passed (below) |
| J10, published 0.1.1 | Headless performance with the installed plugin: a stale-base conflict and a never-read write | Passed (below) |
| J4 interactive, published 0.1.1 | The same performance in tmux with the installed plugin: the conflict dialog, "Show both versions", then "Let it write" | Passed (below) |
| 0.1.2 fixes | Headless J10 and an interactive forced conflict with the working-tree plugin, plus folds of crafted and earlier ledgers | Passed (below) |

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

## Install from the published repository

Run on 2026-10-06 after version 0.1.1 was pushed, with Claude Code 2.1.291, in a new empty `CLAUDE_CONFIG_DIR` and a new empty git project. Unlike the runs above, the plugin was installed from GitHub, not loaded with `--plugin-dir`.

| Step | Output | Status |
| --- | --- | --- |
| J1: `claude plugin marketplace add krzemienski/orchestra-cc` | `✔ Successfully added marketplace: orchestra-cc`, exit 0 | Verified |
| J1: `claude plugin install orchestra@orchestra-cc` | `✔ Successfully installed plugin: orchestra@orchestra-cc (scope: user)`, exit 0 | Verified |
| Installed copy | Cached under `plugins/cache/orchestra-cc/orchestra/0.1.1/`; its `plugin.json` says `"version": "0.1.1"`; its `register.js` contains the never-read send-back and the per-file lock | Verified |
| `claude plugin list` | `orchestra@orchestra-cc`, `Version: 0.1.1`, `Status: ✔ enabled` | Verified |
| J2: `claude -p "/orchestra ledger" --agent orchestra:conductor` | `orchestra: No performance in this session yet: no musician has been assigned a part. colours: dark`, exit 0 | Verified: the installed mod loads and answers |

### J10 headless, with the installed 0.1.1

Run on 2026-10-06 in the same config, on a fresh copy of the scenario project, with `claude -p "Run the performance in PLAN.md exactly as written." --agent orchestra:conductor` and no `--plugin-dir`. It ran from 12:44:46 to 12:47:23 UTC, exited 0, and wrote nothing to stderr. The ledger (148 events, numbered 1–148 with no gaps) was folded with the installed copy's own `ledger.js`.

| Check | Ledger and files | Status |
| --- | --- | --- |
| Stale-base conflict, nobody to ask | Event 52: Trumpet's Edit of `config/limits.json` from v0 while Trumpet 2 had written v1; 53 `conflict.resolved` `reread`; 54 `tool.result` `sentBack` | Verified |
| A write of a file the writer never read | Event 114: Timpani 2's Write of `.orchestra/logs/test-run.txt`, base none, current v0 by Timpani; 115 `conflict.resolved` `reread`; 116 `sentBack`. Then 121 Timpani 2 reads it, 124–126 its Write lands as v1 | Verified |
| Names | Nine musicians, zero `Guest` | Verified |
| Hashes | The latest version of every file in the ledger equals the SHA-256 of the file on disk (`config/limits.json`, `src/limiter.js`, `docs/limits.md`, `.orchestra/logs/test-run.txt`) | Verified |
| Result | `config/limits.json` holds both `"perMinute": 60` and `"burst": 5`; `npm test` → `# pass 1`, `# fail 0`; the coda file lists both conflicts as sent back to re-read | Verified |

### J4 interactive, with the installed 0.1.1

Run on 2026-10-06 from 15:18 to 15:22 UTC in the same config, on a fresh copy of the scenario project. Claude Code was started in tmux with `claude --agent orchestra:conductor` and no `--plugin-dir`, and the screen was saved every second (230 frames).

| Check | Screen, ledger and files | Status |
| --- | --- | --- |
| Header | `@orchestra:conductor` | Verified |
| Dialog | 56 s after the task: `Orchestra: Trumpet 2 wrote config/limits.json v1 and Trumpet saw v0. Let Trumpet's Edit go ahead?` with `1. Let it write  2. Send it back to re-read  3. Show both versions`. Claude Code 2.1.291 adds its own `Type something.` and `Chat about this` options; Orchestra treats any answer other than *Let it write* as *Send it back* | Verified; the two added options were not chosen |
| Show both versions | Drawn above a second question: `Held write by Trumpet (Edit) on config/limits.json`, `Added by Trumpet 2 since Trumpet saw v0 (now v1): + "burst": 5`, `Trumpet wants to replace: "perMinute": 20 ↓ "perMinute": 60`; the Artifacts tab opened on the file | Verified |
| Let it write | Ledger 56 `write.attempt`, 57 `conflict.shown`, 58 `conflict.resolved` `overwrite`, 59 `artifact.write` v2, no second question because the file had not changed; toast `conflict on config/limits.json: Trumpet vs Trumpet 2, write allowed`; Artifacts `v2 by Trumpet from v0 +1 −1 … skipped v1` | Verified |
| Never-read write | Ledger 119–121: Timpani 2's Write of `.orchestra/logs/test-run.txt` sent back with no dialog | Verified |
| Result | `config/limits.json` holds both `"perMinute": 60` and `"burst": 5`, because an Edit replaces text in the current file; `npm test` → `# pass 1`; every file's latest ledger hash equals the file on disk; 149 events with no gaps; zero `Guest` | Verified |
| Coda (G4) | Coda tab, `/orchestra coda` and the coda file show the same eight contributors and line counts, both conflicts, the recovered failure and three stale reads; status `0 playing · 8 done · 5 artifacts changed · 1 stale` | Verified |

The approval was given by an Enter sent straight after the `3` key, which answered the second question with its default; the comparison was on screen when it did (frame 90). The run covers the *Let it write* and *Show both versions* choices; *Send it back* was covered by J10 above.

Not re-run on the installed copy or on 2.1.291: J5–J9 as separate journeys (failure, stale read and coda were exercised inside this run, but reload with `claude --continue` and the Score and Ensemble tabs were not). They ran on 2.1.289 against the same code loaded from the working tree.

## Version 0.1.2: fixes from the second code review

A second independent review of 0.1.1 found ten problems. Two further reviews of the fixes found ten smaller ones, mostly in the new code. All are fixed in 0.1.2. The runs below used Claude Code 2.1.294, an isolated config, and the working-tree plugin loaded with `--plugin-dir`, because 0.1.2 was not yet published. The live results are from the final code.

| Finding in 0.1.1 | Fix in 0.1.2 | Confirmed by |
| --- | --- | --- |
| A fresh session in a process that had already saved a ledger kept the old "saved up to" number, so its events were not written | A new session replaces its paths, state, counters and view in one step, and a save captures its files and events when it is queued, so a save left over from the previous session writes only that session's files | Code inspection and review. The trigger could not be reproduced: on 2.1.294, `/clear` keeps the same session id. Live: after quitting and `claude --continue`, the band and status line matched the ones before (`Trumpet ✓ 6`, `0 playing · 1 done · 2 artifacts changed`), and a part run after the resume was saved to the same ledger (events 45–62, no gaps) |
| An error in Orchestra's own bookkeeping could fail a musician's tool call or stop it running | Bookkeeping before and after the tool fails open and the tool's real result is returned. A failed toast or redraw never undoes a recorded event. If the guard fails while holding a write the user had not allowed, the write is sent back instead of landing | Code inspection and review |
| On *Let it write*, `overwrite` and the "write allowed" toast were recorded before the re-check, so a re-asked write was listed as allowed even if it never landed | The file is checked first. If it changed, the write is attempted again: a new conflict records `reask` and asks again; content matching what the writer saw records `overwrite` with no second question. While the second question is open the writer shows as waiting | Live, three forced conflicts. During one re-ask, the ledger folded to `Trumpet waiting` and `1 waiting · 1 conflict`. X: the file was edited by hand while the dialog was open; the first approval recorded 33 `reask` with no toast and the next question named v2; the second recorded 34 `overwrite`, then the write and the toast. Y: the file was put back to the bytes the writer had read; one approval recorded 74 `overwrite`, no second question appeared, and the toast said "write allowed" |
| After a re-ask, the write's line counts were measured against the text before the dialog | The guard returns the snapshot the write actually replaced | Live, conflict X: the write records `+1 −1`, the one changed line |
| Every file the conductor read and that later changed made its score look stale | The conductor is left out of stale-read checks; it reads to plan | Folded events: flagged on 0.1.1, not on 0.1.2. A flute that read `src.js` before a trumpet changed it is still flagged on both |
| A Bash revert to content a musician had already read raised a false conflict, and a stale mark was never cleared after such a revert | Conflicts, stale reads and the clearing of stale reads compare file content, not version numbers | Folded events: the revert-then-edit raises 1 conflict on 0.1.1 and none on 0.1.2; the revert-then-redo stays "Not redone" on 0.1.1 and reads "Redone from the current version" on 0.1.2 |
| Two Bash calls from one musician at once overwrote each other's overlap mark | Each call keeps its own mark | Code inspection and review |
| The conductor's role still said it resolves conflicts | Role and agent description reworded: the user decides conflicts | Coda and agent file |
| Code comments described behaviour the 0.1.1 patch had removed | Rewritten | Code inspection |
| Every Bash call hashed tracked files one at a time | Files are read and hashed together | Code inspection |

**Regression checks.** Four ledgers from the 2026-10-05 runs (164, 144, 149 and 138 events) fold to the same conflicts, stale reads and coda under 0.1.2 as under 0.1.1, apart from the conductor's role text. The headless performance (J10) on the final code ran 06:46–06:49 UTC, exited 0 with nothing on stderr, and sent back the stale-base Edit of `config/limits.json` (events 54–55). The config holds both `"perMinute": 60` and `"burst": 5`, and `npm test` passes. In every run, each file's latest ledger hash equals the file on disk and no musician is named `Guest`. `claude plugin validate ./plugin` passes and `tsc -p plugin --noEmit` exits 0.

**Limitation found while forcing the conflict.** A change made outside the ensemble while a musician's lone Bash call is running (here, a hand edit during `sleep 45`) is credited to that musician as a certain Bash change. Overlap marking only sees other loops' tool calls, not edits from outside Claude Code. This is unchanged from 0.1.1.

**Raised in review, not changed.** A Bash call reads every tracked file at once, with no limit. The conductor's own Agent call may keep it "in flight" for a whole wave, which would mark most musicians' Bash changes uncertain. A rewrite of the score can flag musicians who read it. A file written through a tool while another loop's Bash call is running can be recorded as written by someone outside the ensemble. All predate 0.1.2 and need their own runs.

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
14. "Let it write" failed when the musician had never read the file. An independent run (ledger events 115–128) showed the dialog, then `Timpani 2: Write failed` with Claude Code's own error `File has not been read yet. Read it first before writing to it.` Claude Code keeps a private per-loop table of files each loop has read, and refuses a Write or Edit of anything not in it; a mod cannot add to that table. So when the writer has never read the file, Orchestra no longer asks: it records `conflict.resolved` `reread` and denies the write with the reason, and the musician reads the file and reapplies. Checked live on 2026-10-05: the second test log (`.orchestra/logs/test-run.txt`) was sent back at event 122 with no dialog, the musician read it and wrote it again, and that write landed at event 133. The dialog is unchanged for a writer who has read the file: the same run's first conflict was answered "Let it write" and recorded `overwrite`.

## Limitations confirmed by verification

1. When the conductor starts several parts in one message, Claude Code draws one summary row ("3 background agents launched") that is not a mod render site, so instrument labels appear only on single Agent rows.
2. A failing command is recorded as failed only if the tester does not hide its exit code. That rule is in the agents' instructions, which a model can still ignore.
3. Files created by Bash (rather than changed) are not recorded; musicians are instructed to create files with Write and Edit.
4. Exact truecolor hex values were not observed; tmux reduced them to 256 colours.
5. The pane's sidebar placement in a fullscreen terminal and agent teams were not tested.
6. If one of Orchestra's own hooks fails, Claude Code skips it and the tool runs (fail open), by design (PRD goal G5). `claude plugin validate` reports this as `gating hook without .catch` for `config.set`, `prompt.submit`, `agent.spawn` and `tool.call`.

## Independent code review

A separate reviewer read `plugin/hooks/*.js` and folded event arrays through `ledger.js`. It found no blocking issues. Five high findings and three medium ones were fixed. Three of them were then confirmed in a live session on 2026-10-05 (isolated config, `--plugin-dir ./plugin`).

| Finding | Fix | Confirmed by |
| --- | --- | --- |
| A later event could be saved before an earlier one was applied, so the earlier one's segment was never written | The sequence number is assigned only after the clock returns, and each save writes every segment it touched | Code inspection. Verifier B's live 559-event ledger (`…0001.jsonl` events 1–500, `…0002.jsonl` events 501–559) already had no gaps |
| Two musicians editing one file at the same moment both passed the guard, and one's bytes were credited to the other | A per-file lock is held from the pre-write check until the result is recorded, and released even if the tool throws | Live: two trumpets edited `config/limits.json` together. The first write landed as v1; the second was held, because it had seen v0 |
| "Let it write" could overwrite work written while the dialog was open | The file is hashed again after the answer, and a change raises a fresh question | Live: the file was edited by hand while the dialog was open, then approved. Orchestra asked again: "someone outside the ensemble wrote config/limits.json v2 and Trumpet 2 saw v0." The ledger shows `overwrite` then `reread` |
| The replay after a restart | (covered by the segment fix) | Live: quit and `claude --continue` restored `Orchestra · 0 playing · 2 done · 2 artifacts changed` and the same band |
| A product written from an input that changed in the meantime was never flagged stale, and a redo cleared the mark against an older version | The writer's seen inputs are checked when the product is written, and a redo clears the mark only against the input's latest version | Folded events: `F wrote docs.md from src.js v0 (now v1)` |
| A Bash change was credited with certainty to whoever ran the command, even when another musician wrote during it, and a revert to an older hash was ignored | A running Bash call is marked overlapped when any other call runs during it, and an older hash is recorded as a new version | The order A-start, B-start, B-end, A-end yields `uncertain: true` |
| Every Bash call hashed every known file, in every session | Hashing happens only during a performance, only for files inside the project, and never for `.orchestra/performances/` | Code inspection |
| The cello was told to write a file but has no Write tool | Its review goes in its final answer, which the coda records | Instruction change |
| The conductor was told to decide conflicts the user decides, and to match a coda file that does not exist yet | It no longer decides conflicts, and it knows the coda file is one turn behind | Instruction change |

Not fixed, all low: binary files are hashed from a lossy decoding, so the coda's hash differs from `shasum`; an Edit whose old text is three or more lines hides its replacement in the comparison; a failure is recovered by the first 80 characters of the command; replaying a ledger of many tens of thousands of events could overrun the 10 s hook budget; and some spec sections still say NOT DONE for things that are built.
