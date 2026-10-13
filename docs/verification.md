# Orchestra — verification record

Date: 2026-10-05. Claude Code 2.1.289 on macOS, in tmux (230×64, later 50×41 when other clients attached). The install from the published repository was run on 2026-10-06 with Claude Code 2.1.291 (see "Install from the published repository").

Every result below comes from a real run. The plugin was loaded with `--plugin-dir ./plugin`. Each run used an isolated `CLAUDE_CONFIG_DIR` (a temporary directory with no other plugins, hooks or MCP servers), so the author's own configuration was neither used nor changed. Claude Code was driven by sending keystrokes into tmux; screens were read with `tmux capture-pane` (plain and with colour codes); and a recorder saved the screen every second, so toasts that last 4–8 s were caught. Ledgers were read back with the plugin's own `fold()` and compared with `shasum -a 256` and `git show`.

The raw captures (about 1,400 screen frames and their indexes) were kept only on the verification machine and have since been deleted; they were never part of this repository. The key output of each check is quoted here, so this document is the record.

## Version 0.2.0

Run on 2026-10-13 with Claude Code 2.1.296 on macOS, in tmux, each live run in a fresh `CLAUDE_CONFIG_DIR` and a fresh git fixture (`config/limits.json` `{"maxUsers": 10}`, `src/db/schema.sql` with one table, `docs/limits.md` with one line), started with `claude --plugin-dir ./plugin --agent orchestra:conductor` (`.planning/live/launch.sh`), with `CLAUDE_CODE_NO_FLICKER=1` (the fullscreen view the owner uses, so the pane docks) unless a row says otherwise. Frames were saved with `tmux capture-pane -p` and `-e` (`.planning/live/frames.sh`) and rendered with `.planning/live/ansi2png.py`. Every pass criterion was written into `step-00-pass-criteria.md` before its capture, and every rerun is recorded there with its reason.

Evidence folders (local to the build machine; `e2e-evidence/` is not committed, so the quotes below are the record):
- **W0**, 0.1.7 baseline: `e2e-evidence/run-20261013T181747-v020-w0/`
- **F**, 0.2.0 live gates: `e2e-evidence/run-20261013T184754-v020-live/`

Gates marked *regression* passed on 0.1.7 as well, so they show only that nothing broke.

| Gate | Command / action | Pass criterion | Observed (verbatim) | Evidence | Verdict |
| --- | --- | --- | --- | --- | --- |
| Unit (*regression*) | `claude plugin test ./plugin` | All pass; each new test fails on an assertion against a deliberate fault | `10 pass` `0 fail`. Faults: shared instance number → `3 fail`; result paired by agent only → `Expected: [["Grep", 3000], ["Read", 200]]` `Received: [["Grep", 300], ["Read", 2900]]`; zero counts kept → `1 fail`; current call cleared on any result → `Expected: "Bash sleep 25 · 7s"` `Received: null` | F/step-72-static-gates/step-01-unit.txt; `run-20261013T183705-v020-slice-c/step-01..03`; F/step-18-parallel-calls-fault.txt | PASS |
| Types (*regression*) | `npx -y -p typescript tsc -p plugin --noEmit` | 0 errors | `exit=0`, no output | F/step-72-static-gates/step-02-types.txt | PASS |
| Validate (*regression*) | `claude plugin validate ./plugin` | Clean | `✔ Validation passed`; calls list `$.clock.every, $.clock.now …`, no `$.process`; `env reads: COLORTERM, TERM` | F/step-72-static-gates/step-03-validate.txt | PASS |
| Contracts | `node .planning/contracts/render-proof.mjs`, `palette-proof.mjs` | Pass; output identical at two clock times | `render proof: OK` (band, Ensemble and Score drawn again a minute later with no new event: identical); `palette proof: OK`, `ground unknown (nothing painted)` | F/step-72-static-gates/step-04, step-05 | PASS |
| Removed surface (P0-21, code) | grep `voice\|narrat\|elevenlabs\|clock\.every\|clock\.after\|setInterval\|\$\.process\|browser` over `plugin/hooks plugin/agents plugin.json plugin/tests README.md docs/guide.md` | Only the theme recheck, plus Non-Goals text | `plugin/hooks/register.js:1213: themeTimer = $.clock.every(THEME_RECHECK_MS, …`; the other hits are README.md:15, :55 and guide.md:5, :268, all statements that the feature does not exist or was removed. `plugin/narrate/` is gone | F/step-72-static-gates/step-06 | PASS |
| P0-14 W0 capture, and fix | Three parallel Agent calls on 0.1.7 (W0); then ten parts from one person message on a21e619 | Each parallel part's Agent row carries its musician's label | W0: no per-part row (`⏺ 3 background agents launched (↓ to manage)` / `├ orchestra:trumpet (limits slow)` …). Probes showed Claude Code discards a mod's tree for grouped calls but draws it for a single Agent call. Fix: the conductor sends one Agent call per message when parts run in the background (4785ac7, a21e619). Final run: 10 distinct rows `Trumpet · Implementer` … `Flute 2 · Scribe`, each over `└ ♪ Bash sleep 45 · 7s`-style lines, 0 grouped blocks; G10 over band, Ensemble and Agent rows: `rows checked 251 … mismatches 0` | W0/step-24; e2e-evidence/run-20261013T194740-v020-fix2/step-23-ten-g10.txt; e2e-evidence/run-20261013T202525-v020-verify/step-22-frames-1s | PASS |
| Idle (P0-19) | W0 three-part prompt; `sleep 90` silent while the conflict dialog is pending; frames every 2 s for 60 s; Orchestra's rows found by text (`.planning/live/orchestra-rows.py same`) | 0.1.7 fails; 0.2.0 identical | 0.1.7: `frames whose Orchestra rows differ from the first: 29 of 29` (pane `╱ Conductor` → `│ Conductor`, `──────────────•──` moving, `Edit config/limits.json · 0s` → `· 56s`). 0.2.0 attempt 1: 25 of 29 differ, one change `└ Bash sleep 90 · 20s` → `· 31s` at +8.6 s when Claude Code's agent-summary fork recorded `"No tools needed for summary"`; fixed in ea55833. 0.2.0 attempt 2: `frames whose Orchestra rows differ from the first: 0 of 29`, with the same fork event (seq 35–36) inside the window | W0/step-31; F/step-48 (attempt 1), F/step-51 (attempt 2) | PASS |
| P0-12 numbering | Ten-part run; every surface read; `instanceName` unit test | Ten distinct names, same on every surface, no `Guest`, no truncation; unit test fails when two musicians share a number | `names (ledger fold): Trumpet, Trumpet 2, Timpani, Violin, Violin 2, Cello, Trumpet 3, Timpani 2, Flute, Flute 2`; `distinct names: 10`; `"Guest" occurrences across 176 captures: 0`; e.g. Trumpet 3 on `toast: Orchestra · Trumpet 3 joins the ensemble`, `band row: ♪ Trumpet 3         add table`, `Ensemble row: ♪ Trumpet 3  Implementer · playing`, `spinner suffix: 3 playing: Trumpet Bash sleep 45 · 44s · Trumpet 3 Bash sleep 50 · 36s +1`; `name cut with … : 0` | F/step-27-po1c-p012-names.txt | PASS |
| Live run (PO-1) | Ten parts in one message (F/step-10-conductor-prompt-v2.txt), 160×48 | All ten named; line 2 matches the ledger; rollup line 1; conflict dialog and outcome recorded; failed row shows its error; outcome counts = coda file | Band at +10 s: `𝄐 Orchestra  10 playing` over `♪ Trumpet    Bash   sleep 45 · 8s` … `♪ Timpani 2  Bash   sleep 55 · 3s` and `… 2 more · /orchestra`. Dialog: `Orchestra: Trumpet 2 (limits fast) wrote config/limits.json v1 and Trumpet (limits slow) saw v0.`; chose *Send it back*; coda `You sent the write back to re-read.` Failure: `└ failed · Bash ls config/missing.json: Exit code 1: ls: config/miss…`. Outcome: `𝄐 Coda · 10 musicians · 5 files · 1 conflict · 1 failed · 1m 31s · /orchestra coda`; coda file: 10 contributors, 5 artifacts changed, 1 conflict, `Status: Orchestra · 9 done · 1 failed · 5 artifacts changed · 6 stale`. Attempts 1–2 (steps 01–17) are recorded; attempt 2 found the parallel-call defect fixed in 35fe9ab | F/step-20-po1c-frames-1s/f0016.txt, step-21, step-22, step-23 | PASS |
| P0-21 userConfig | `node -e` over `plugin.json` | No key matching `voice\|narrat\|eleven` (0.1.7 fails) | 0.1.7: `userConfig keys: ["narrateCoda","voiceCoda","voiceId","voiceLanguage","voiceModel"]`. 0.2.0: `userConfig keys: []` | W0/step-07; F/step-72-static-gates/step-07 | PASS |
| P0-21 voice argument | `/orchestra voice` typed in a live session | `Unknown argument: voice. Use coda, ledger or close.`; pane shut (0.1.7 fails) | 0.1.7: `orchestra: No performance in this session yet, so there is no coda to speak.` 0.2.0: `❯ /orchestra voice` / `⎿  orchestra: Unknown argument: voice. Use coda, ledger or close.`; no tab bar on screen | W0/step-10; F/step-59-po6-voice-argument.txt | PASS |
| P0-21 docs | grep README.md and guide.md for the statement | Both state no voice, narration, network or browser feature | README.md:15 `It makes no sound and no speech, has no voice or narration feature, makes no network call, needs no API key, starts no process, and has no browser or web surface.`; guide.md:5 `It has no sound, speech, voice or narration feature, makes no network call, needs no key, starts no process, and has no browser or web surface.` | F/step-73-static-gates-final/step-08 | PASS |
| P1-5 stale text | grep `voice\|narrat\|elevenlabs\|motion\|baton\|frame timer\|browser\|asset-handout` over README, guide, orchestra-prd, orchestra-spec, verification; `test ! -e docs/asset-handout.md` | Every hit removal, Non-Goals or history; verification.md hits only in history sections; file absent; nothing links to it | Hits: README.md:15, :55, :74, :91; guide.md:5, :200, :232, :268 (non-goal or removal); orchestra-prd.md:3 (superseded note), :498 (`Motion. History: …`); verification.md :25–33 (this table's own gate rows) and :198–263, all inside sections headed `(history: removed in 0.2.0)` or `(history: motion and voice removed in 0.2.0)`. `docs/asset-handout.md: absent`; no Markdown link to it | F/step-73-static-gates-final/step-09 | PASS |
| P1-5 checklist | README and guide read against the F captures | Each of P0-12 to P0-21 has a paragraph in both, citing a capture | README "What you see" has a bullet per requirement, P0-12 to P0-20, each citing its step; P0-21 under "Use" (step-59) and line 15. The guide has a section per requirement (names, current line, Agent rows, band, Ensemble, key hints, outcome line, nothing moves, colours) citing steps 20, 22, 25, 27, 32, 34, 43, 51, 56–57, 59, 71 and W0 step-24 | README.md, docs/guide.md | PASS |
| G9 sizes | Ten-part run at 160×48 and 100×20, plus a live resize 160×48 → 100×20 → 160×48 | Fold row at 100×20; rollup stays line 1; columns never wrap | 160×48: `𝄐 Orchestra  10 playing` … `… 2 more · /orchestra`. 100×20: every frame with a musician playing shows the band rollup or the status line `orchestra: Orchestra · 2 playing · … 2 more · /orchestra` (78 of 78, e2e-evidence/run-20261013T194740-v020-fix2/step-41). Resize: inline pane `↓ 43 more below · 1-4 tabs · tab select · enter details · ↑↓ scroll · esc close`; back at 160×48 band `𝄐 Orchestra  2 playing · 7 done · 1 failed · ⚠ 3 stale`. Dialog row at 100×20: `𝄐 Orchestra  1 playing · 1 waiting on you · 1 done · ‼ 1 conflict` | e2e-evidence/run-20261013T194740-v020-fix2/step-37, step-41; e2e-evidence/run-20261013T202525-v020-verify/step-24, step-26, step-32 | PASS |
| G10 timing | Frames every 3 s vs the ledger's `tool.call` events (`.planning/live/g10-check.py`) | Each playing row's tool and target match the ledger's open call within one redraw | Attempt 3: `rows checked 213 (band 120, Ensemble 93); matching the ledger (within one redraw) 213; mismatches 0`. Same frames with two names swapped: `mismatches 43` | F/step-25-po1c-g10-check.txt, step-26 | PASS |
| Keys (P0-16, P0-17) | `/orchestra`, then `1` `2` `3` `4` `↓` `↑`, Tab ×8, Enter, ↓ to scroll, Esc | Each tab's last row lists its keys; Enter opens details with every section | Last rows: `1-4 tabs · tab select · enter details · ↑↓ scroll · esc close` (1, 3), `1-4 tabs · ↑↓ scroll · esc close` (2, 4). Enter on Flute: `Part: Do exactly these steps…`, `Versions seen:` `config/limits.json v0 (now v1)`, `Reads and writes:` `wrote docs/limits.md v1 from v0`, `Last calls:` `Edit docs/limits.md · 0s ✓`, `Answer: I did all six steps in order…`, `full transcript: ← in Claude Code's agent view`. Esc: no tab bar on screen. A first pass found the hints missing on the Coda tab; fixed in 9346a1e | F/step-32-po3-*, step-33, step-34, step-35 | PASS |
| Themes (P0-20) | One run per mode; escapes read from Orchestra's rows; palette-proof | dark, light, 256 ≥ 4.5:1; ANSI: no 256 or truecolor escape; unknown: no grey fill under Orchestra's pane | dark `38;2;242;185;80`, light `38;2;138;90;0`, 256 `38;5;215`; palette-proof every token ≥ 4.5:1. ANSI theme on truecolor: codes `91 92 93 96 37`, no `38;`; ANSI terminal: `31 32 36 37 93 95`, no `38;`. Unknown theme: no mod can clear Claude Code's docked fill (`backgroundColor` default/transparent/reset and a Raster's terminal-default cell all drew `48;2;38;38;38`; anthropics/claude-code#100102), so the docked pane is painted the theme key `inverseText`: `auto` → `backgrounds: ['48;2;0;0;0']` over 8 pane rows; light-based custom theme → `48;2;255;255;255`, lowest Orchestra foreground 4.50:1; inline pane → `backgrounds none`; `dark-ansi` → no `38;` code. Remaining on the white ground: Claude Code's own Button hotkey accent `38;2;87;105;247` (4.40:1) on the tab digits, present in light mode before this change | e2e-evidence/run-20261013T194740-v020-fix2/step-45; e2e-evidence/run-20261013T205850-v020-pane-fill/step-03, step-13, step-23 | PASS |
| Regression P0-1..11 | `-p` with the W0 prompt; `--continue`; Show both then Let it write; Send it back; stale and handoff toasts | Same results as 0.1.7 | `-p`: `exit=0 seconds=122`; ledger `28 conflict.resolved reread True`, `29 tool.result Edit config/limits.json sent back by Orchestra: stale base`; 43 events, no gaps; ledger hash `2f52c18654c3…` = file on disk. `--continue`: band `𝄐 Orchestra  9 done · 1 failed · ⚠ 6 stale` and status line identical before and after. Show both: `Held write by Trumpet (limits slow) (Edit) on config/limits.json` / `v1 by Trumpet 2 (limits fast), added since Trumpet (limits slow) saw v0:`; Let it write: `52 conflict.resolved overwrite`, `53 artifact.write`, toast `…vs Trumpet 2 (limits fast), write…`. Toasts: `Orchestra · handoff: Timpani read .orchestra/notes/map.md v0 from Violin`, `Orchestra · stale read: Violin worked …` | F/step-68, step-69; step-29, step-31; step-64, step-67; step-62; step-20 f0026 | PASS |
| Install from GitHub (G8), and PO-7 on the installed copy | After the push of b22c111: `claude plugin marketplace add krzemienski/orchestra-cc`, `claude plugin install orchestra@orchestra-cc` in a clean config; then `-p` and interactive runs with no `--plugin-dir` | Both exit 0; regression rows match | `✔ Successfully added marketplace: orchestra-cc` `exit=0`; `✔ Successfully installed plugin: orchestra@orchestra-cc (scope: user)` `exit=0`; `Version: 0.2.0` `Status: ✔ enabled`. `-p`: `exit=0`, `28 conflict.resolved reread True`, `29 … sent back by Orchestra: stale base`, ledger hash = disk. Interactive: `@orchestra:conductor`; `/orchestra voice` → `orchestra: Unknown argument: voice. Use coda, ledger or close.`; Show both → `Held write by Trumpet (limits slow) (Edit) on config/limits.json`; Let it write → `36 conflict.resolved overwrite`; outcome `𝄐 Coda · 3 musicians · 1 file · 1 conflict · 0 failed · 1m 48s`; Agent rows `Timpani · Tester` / `└ ♪ Bash sleep 20 · 3s`, `Violin · Scout` / `└ ♪ Bash sleep 15 · 0s`, 0 grouped blocks | e2e-evidence/run-20261013T210523-v020-installed/step-01, step-03, step-04, step-05..step-10, step-12 | PASS |

Defects found by these gates and by /verify, fixed in 0.2.0 before the final captures: grouped Agent calls left parts unlabelled (4785ac7, a21e619); colour names drawn 24-bit under ANSI themes (8b00804); no band rows at 100×20 hid the counts (b3aede5, 29bc5ff); a tight inline pane cut its key hints (a21e619); an unknown theme's docked pane showed Claude Code's grey fill (b4ea0d8); a musician with two calls open showed its part brief after the first ended (35fe9ab); the key hints were hidden on a tab that scrolls (9346a1e); a one-row band showed only the engine's `↓ 2 more` (69d404a); an engine loop's event re-timed every row (ea55833).

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

**Raised in review, fixed in 0.1.3.** Three behaviours the reviewers raised, all older than 0.1.2, are fixed in the next section. A fourth is still open: a file written through a tool while another loop's Bash call is running can be recorded as written by someone outside the ensemble.

## Version 0.1.3: older attribution and path behaviours

Run on 2026-10-08 with Claude Code 2.1.294, an isolated config and the working-tree plugin, side by side with 0.1.2 where a comparison helps. Four code reviews of the drafts found more problems; all are fixed. Two additions from the second round (refusing writes to unreadable files, and fixed time windows for background commands) caused new problems and were replaced. The results below are from the final code.

| Behaviour in 0.1.2 | Fix in 0.1.3 | Confirmed by |
| --- | --- | --- |
| A foreground part keeps the conductor's Agent call open for its whole run, and every open call counted as overlap, so a musician's own Bash change was marked uncertain | Only calls that can change a file count as overlap: shell calls, MCP tools, and write tools once Orchestra lets them through. The Agent call, reads, searches, dialogs, task waits and Monitor do not. Overlap counts from when the command starts, not while its snapshots wait | Live, same task on both versions: one foreground part read 20 files, then ran `npm run stamp`, which appended a line to two of them. 0.1.2 marked both changes `uncertain: true`; 0.1.3 marked them certain. Control: a second musician running Bash and an Edit in parallel still made the stamp's changes `uncertain: true` |
| A command left running in the background was invisible: its changes were credited, as certain, to whichever musician next ran a shell command | A background command is tracked from its call to Claude Code's notification that it finished. Its changes are found then and credited to the musician who started it; until then every other musician's shell changes are uncertain | Live: a musician started `sleep 15 && npm run stamp` in the background and finished while another ran `sleep 30`. The debug log shows the task tracked, then ended 15 s later. The stamp's changes were credited to the musician who started it, `uncertain: true` because the other command was running. A third musician who ran `npm run stamp2` after the notification was recorded as certain. On 0.1.2 the stamp was credited, as certain, to the musician running `sleep 30` |
| A write another musician was still recording during a shell command could be credited to the shell musician | Such a change is left to the write, which records itself | Code inspection and review; the window is too short to hit on purpose. Live: a parallel Edit during a shell command was credited to its writer |
| Every tracked file was read at once around a Bash call | Reads around shell commands are capped at 16 at a time across all hooks; the conflict guard's own reads are not held behind them | Live: 20 tracked files, and the change to the 20th was attributed. A failed read was not forced |
| Rewriting `.orchestra/score.md` flagged every musician who had read it as working from a stale input | The project's score is never an input or a product of stale work | Folded events: a score revised after or before a musician used it, and a musician who edited the score before its input changed, are flagged on 0.1.2 and not on 0.1.3. A flute that documented code a trumpet then changed, and work from another package's score file, are still flagged |
| A path into the project through a symbolic link, macOS's `/private`, or another letter case was a different file | File paths are resolved to where they really land, then recorded relative to the project | Live: a project opened through a symbolic link. One musician read `config/limits.json` by its real path, then by the link path in capitals (`CONFIG/LIMITS.JSON`), then edited it by the link path: all six events name `config/limits.json`. A performance started from `/tmp/…` recorded no absolute paths |
| A write to a file Orchestra could not read was recorded as the whole file added | Recorded as `unchecked: true` with no line counts; a file that becomes unreadable after *Let it write* is sent back | Code inspection and review |

**Regression checks.** Four ledgers from the 2026-10-05 runs fold to identical codas under 0.1.2 and 0.1.3. The headless performance (J10) exited 0 and sent back both the stale-base Edit of `config/limits.json` and the never-read write of the test log; the config holds both `"perMinute": 60` and `"burst": 5`, and `npm test` passes. In every run, each file's latest ledger hash equals the file on disk. `claude plugin validate ./plugin` passes and `tsc -p plugin --noEmit` exits 0.

**Not covered.** PowerShell (Windows only) is untested. A failed file read was not forced. A background command still running when the session ends is never checked; its changes appear as written outside the ensemble when a musician next reads the file. Shell attribution only covers files the ledger already knew when the command started. Claude Code's own permission prompt counts as running, because the mod cannot see it.

### Third code review of 0.1.3

A reviewer read the 0.1.3 diff and raised ten findings, none reproduced. Each was checked on 2026-10-09 with Claude Code 2.1.296 before 0.1.3 was committed. Folded events use the plugin's own `fold()`; live runs used an isolated config and `--plugin-dir ./plugin`.

| Finding | Fix | Confirmed by |
| --- | --- | --- |
| A write whose new bytes another musician read first left that writer flagged stale by its own write, blamed on "someone outside the ensemble" | The stale marks raised by that first sight are dropped when the write is credited; the write's own check flags the other readers against the real writer | Folded events: before, `Trumpet produced G from v0 of F; someone outside the ensemble then wrote v1`; after, none. Control: a cello that built H from v0 is still flagged, against Trumpet |
| A project file linked to somewhere outside the project resolved to an absolute path and went untracked (0.1.2 tracked it) | A resolved path is used only when it lands inside the project; otherwise the project path is kept | Live: `config/limits.json` linked to `../../shared/limits.json`. Both reads and both Edits are recorded under `config/limits.json`. Claude Code 2.1.296 itself refuses Edit and Write through a link ("it is a symbolic link. Write to the link's target path instead"), so an unguarded overwrite through the link cannot happen |
| Any failed call by the same musician on the same file (a Read, say) marked a write the user had let go ahead as failed | A conflict records the write tool, and only that tool's failure refuses it | Folded events: before, `You let the write go ahead, but it then failed (offset past end of file)`; after, `You let the write go ahead.` Control: the allowed Edit failing is still reported |
| At exit with an unreadable ledger, the coda was written to an empty path, raising a second warning | The coda is written at exit only when it has a file | Code inspection |
| Two shell commands finishing together each ignored the other, so one was credited with a change either could have made | A command that is ending counts as a candidate unless its own after-snapshot shows the file unchanged | Code inspection |
| The theme recheck timer was added again on every `session.start` | The previous timer is stopped first | Not observed: `/clear` started a new session without `session.start` firing again. Guarded anyway |
| A handler that threw partway left the shown state different from the saved ledger | The state is rebuilt from the saved events | Code inspection |
| The guard's timeout fallback treated a relative ledger path as a project file and refused its write | It uses the same test as the guard | Code inspection |
| The count of open conflict dialogs was kept twice | It is the set of files being asked about | Live: the dialog drew Orchestra's line above it, "Show both versions" drew the comparison (frame 186), and the pane returned to its tab afterwards |
| The Coda tab built the coda twice per draw | It builds it once | Code inspection |

**Regression checks.** All 319 ledgers under `e2e-evidence/` fold to identical codas with and without these fixes. `claude plugin validate ./plugin` passes and `tsc -p plugin --noEmit` exits 0. Evidence: `e2e-evidence/review-fixes-20261009-184208/`.

## Version 0.1.4: the narrated coda (history: removed in 0.2.0)

An optional setting, `narrateCoda` (off by default), has Claude retell the coda as prose through the Claude Agent SDK (`plugin/narrate/`), in a file beside it and at the end of the Coda tab. Checked on 2026-10-09 with Claude Code 2.1.296, an isolated config and `--plugin-dir ./plugin`.

| Check | Result |
| --- | --- |
| Narration on, two-part performance in tmux | The coda was written, then `<session>-coda-narrated.md` about 4 s later (`node exited 0 in 4337ms`), and the toast `narrated coda ready in the Coda tab`. Every count, path, hash and author in the narration matches the coda. The Coda tab shows it under "Narrated by Claude" |
| Unchanged coda at the next end of turn | Not narrated again: one helper run |
| Helper folder missing | Toast: `could not narrate the coda (its dependency is not installed: run npm install --prefix …/plugin/narrate)`; the coda was written as usual. With the folder back, the next turn narrated (5.7 s) |
| Setting off (headless `claude -p`) | Coda only: no narrated file, no helper process |

Not checked: changing the setting through the `/config` screen (the runs set it in `settings.json`), and a narration that times out or meets an API error. Evidence: `e2e-evidence/narrate-coda-20261009-181759/`.

## Version 0.1.5: reach, threat model and a ledger test

A mod-builder review on 2026-10-10 with Claude Code 2.1.296 found no blocking problem in the code. 0.1.5 changes no hook: the README gains a "What it can reach" section and a five-line threat model, two outdated limitation lines are corrected, and the plugin gains its first test on the official kit (`plugin/tests/ledger.test.ts`).

| Check | Result |
| --- | --- |
| `claude plugin test plugin` | 3 pass, 0 fail: a fixed event list folds to the expected conflict, stale read and status line; the same events fold to the same coda twice; `/orchestra ledger` answers before any part is assigned |
| Test seen failing | With the conflict check in `ledger.js` forced to skip, the first test failed (2 pass, 1 fail, exit 1); restored, 3 pass |
| mod-builder `prove.mjs`, isolated harness | validate, load, test, `/orchestra` and isolation ran and passed; the calls and env name listed in the README match the validator's footprint |
| `tsc -p plugin --noEmit` | Exit 0, with `tests/` included |

Found in the review and not changed: any subagent, not only an `orchestra:` one, starts a performance. A headless run with one built-in `Explore` subagent and no conductor recorded it as `Guest (Explore)`, asked to open the pane, and wrote `.orchestra/` into the project. Not checked: drawing, which was not driven in this review. Evidence: `e2e-evidence/review-guest-20261010-151212/`, `e2e-evidence/review-fixes-1-3-4-20261010-181540/`.

## Version 0.1.6: motion, a flat-black palette and the spoken coda (history: motion and voice removed in 0.2.0)

Run on 2026-10-10 with Claude Code 2.1.296, an isolated config, `--plugin-dir ./plugin`, driven in tmux with the screen saved as colour codes.

| Check | Result |
| --- | --- |
| Motion in a live performance (violin, trumpet, flute), screen saved every 100 ms | The band's baton cycles `╲ │ ╱ │` and a playing musician's note `♩ ♪ ♫ ♬`, one step per 250 ms frame; the stage pulse moves four cells a second; the handoff arrow travelled `Violin ━━━━▶ Flute .orchestra/notes/map.md v0`; the conductor's baton settles to `𝄐` when nobody plays |
| Verbose activity | Spinner `2 playing: Trumpet · Flute`; a seat showed the conductor's command with `· 0s`; toasts `Violin joins the ensemble as Scout`, `Flute rests: 4 measures, 3 reads, 1 write` |
| Flat background | Of the lines carrying a background code (`48;`), none is Orchestra's: all are Claude Code's own logo, dividers, prompt and Agent rows |
| 256-colour mode (`TERM=xterm-256color`, no `COLORTERM`) | Found: the renderer rounds each channel to sixths, so violin `#87afff` drew as index 147. After the fix the band draws conductor 147, violin 111, trumpet 215, playing note 78, warning 221, each the palette's measured entry (at least 7:1 on black) |
| Voice helper against the real ElevenLabs API | No key: `ELEVENLABS_API_KEY is not set …`, exit 1. A deliberately invalid key: `ElevenLabs answered 401 for /v2/voices (unauthorized: Invalid API key)` and the same for `/v1/voices/<id>`, exit 1. Input that is not JSON, and a request with no voice id, are refused with their reasons |
| `claude plugin eval` (case `plugin/evals/ensemble-records`, one run on a copy of `plugin/` without another tool's `.omc` folder, whose hard links the eval refuses) | Score 1, 5 of 5 graders: violin spawned, flute spawned, `NOTES.md` written, and the mod's own ledger and coda written; 47 s, $0.46. An earlier run scored 0.75 because an LLM grader given only file paths could not read the coda; it was replaced by two file checks |
| Prototype in Chrome | Baton, notes, pulse and handoff arrow change between 250 ms samples; Score staves show rests, bar lines and a pulsing playhead; all five chairs end "resting"; with reduced motion reported, the glyphs hold still; terminal background `rgb(0, 0, 0)`, pane and band transparent; no console errors |

Not checked: an actual MP3, which needs an ElevenLabs key and voice (see asset-handout.md, deleted in 0.2.0); truecolor values on screen, since tmux reduces them to 256 colours; the prototype's CSS animations under the operating system's own reduced-motion setting (the check replaced `matchMedia` in the page). Evidence: `e2e-evidence/motion-live-20261010-184509/`, `e2e-evidence/motion-256-20261010-184920/`, `e2e-evidence/palette-256-20261010-185153/`, `e2e-evidence/voice-20261010-184420/`, `e2e-evidence/prototype-motion-20261010-1905/`, `e2e-evidence/plugin-eval-20261010-2305/`.

## Version 0.1.7: a performance you can watch, and a voice that keeps its language (history: motion and voice removed in 0.2.0)

Run on 2026-10-12 with Claude Code 2.1.296.

| Check | Command | Result |
| --- | --- | --- |
| Plugin validation | `claude plugin validate ./plugin` | `✔ Validation passed`; env reads `COLORTERM, TERM`; env writes nothing; network: none (the calls list has no fetch) |
| Test suite | `claude plugin test plugin` | `3 pass, 0 fail` |
| Type check | `npx -y -p typescript tsc -p plugin --noEmit` | exit 0, no output |
| Motion API | `node .planning/contracts/motion.contract.mjs` | `motion contract: OK`: `transition`, `cue`, `sustain`, `lastCall`, `beat` and the finished-call ticker line, from a folded ledger |
the flute's held note `♪━` after 1 s, `♪━━━━` after 4 s. The band carries no `backgroundColor`; the pane carries one, at its root, equal to the palette ground. Idle band starts `𝄐 Orchestra` |
| Palette | `node .planning/contracts/palette-proof.mjs` | `palette proof: OK`. Lowest contrast: dark 7.57 (danger, vs `#000000`), light 5.32 (flute, ok, vs `#ffffff`), 256-colour 5.77 (danger, on the exact bytes sent); every token ≥ 4.5:1. Mode selection: truecolor → dark, 256-colour terminal → `256`, plain `xterm` → ANSI names, `dark-ansi` theme → ANSI, light without truecolor → ANSI. Pane ground: dark and 256 `#000000`, light `#ffffff`, ANSI left to Claude Code |
| Live session, dark theme, truecolor in tmux (installed CLI's own login, `--plugin-dir ./plugin`) | Three musicians assigned, handoff and stale read recorded, coda written; screen captured every 200 ms | Ensemble shows `last: Read package.json · 0s`, the ticker `Violin · Read package.json · 0s`, chairs `resting` / `stopped`; Score shows `bar 6, beat 2` stepping to `beat 3`, `4`, `1` across 250 ms captures while the playhead alternates `┃` / `│`, staves with `┊` bar lines, `◆`, `○`, `●`, `·` and the conductor's `𝄐` coda mark |
| Pane background, live | Every cell's background read from `tmux capture-pane -e` | Before: the docked pane body was Claude Code's grey (`48;5;235`) on every row, beside a transcript with no background code. Tried `'default'` (ignored by Ink: still grey) and `'#000000'` / `'black'` (Ink sent `48;5;16`, black). After: the pane body is `48;5;16` on every text row; only the frame's divider column and close-mark row stay Claude Code's grey |
| Seat row in a 70-column pane | Live capture | Before: `Conducto` / `r` and `playin` / `g` wrapped onto a second row. After: name, mark, state and `▸ details` keep their width and the role is cut with `…` (`Conductor Plans the score, assigns parts, presents… · resting ▸ details`) |
| Voice helper, no key | `node plugin/narrate/voice.mjs` with bad input | Each reason reported as itself: `standard input is not JSON`, `no voice id…`, `no .mp3 output path was given`, `no text was given`, `unknown option --bogus`, `usage: … --voices <language>` (all exit 1) |
| Voice helper, real API, invalid key | `env ELEVENLABS_API_KEY=invalid-key-for-check node plugin/narrate/voice.mjs --models` and `--voices hi` | `ElevenLabs answered 401 for /v1/models (unauthorized: Invalid API key)` and the same for `/v2/voices` (exit 1) |
| Voice helper, full speak request, invalid key | JSON on stdin with a real voice id | `ElevenLabs answered 401 for /v1/voices/JBFqnCBsd6RMkjVDRZzb (unauthorized: Invalid API key)` (exit 1) |
| Voice helper, network unreachable | `HTTPS_PROXY=http://127.0.0.1:9 NODE_USE_ENV_PROXY=1` | `could not reach ElevenLabs (ECONNREFUSED)` (exit 1) |
| `/orchestra voice` in a live session (resumed with `--continue`, no key, no voice id) | Typed at the prompt, then the Coda tab read | Prompt: `orchestra: Speaking the coda with voice (none set) in "en"; the MP3 goes beside the coda.` Coda tab, last block: `Spoken by ElevenLabs` / `Could not speak it: no voice id: set the voiceId option for the plugin…`. The resumed session replayed its ledger: band `𝄐 Orchestra  Violin ✕ 13  Timpani ✕ 6` |
| Prototype scripted performance | `node .planning/contracts/prototype-replay.mjs` | `prototype replay: OK`: 89 events; 5 cues, 5 joins, 5 rests, 1 stop, 5 handoffs; held notes on 33 frames; 1 finished-call toast (`trumpet Edit config/limits.json 8s`); first join #5, first rest #20, first handoff #21 |
| Every surface, live (harbor-api project, `PLAN-performance.md`, which forces a conflict) | Screen captured with colour codes at each surface, rendered to `docs/screenshots/` | **Conflict dialog**: `Orchestra: Trumpet 2 (Trumpet B) wrote config/limits.json v1 and Trumpet (Trumpet A) saw v0. Let the Edit … go ahead?`; *Show both versions* drew `v1 by Trumpet 2 …, added since … v0: + "perMinute": 20, + "burst": 5` and `Trumpet (Trumpet A) wants to change: + "perMinute": 60`; *Send it back to re-read* chosen. **Artifacts**: `config/limits.json v1 ▾ details` with `v0 as first seen sha256:7554c7b9c10f`, `v1 by Trumpet 2 from v0 +2 −1`, `Trumpet read v0 at event 14`, `✓ Trumpet wrote from v0 over Trumpet 2's v1 · reread`. **Toasts**: `Trumpet 3 joins the ensemble as Implementer`, `handoff: Trumpet 3 was handed config/limits.json v1 from Trumpet 2`. **Agent row**: `♫ Trumpet 3 · Implementer · 0 measures`. **Spinner**: `· 1 playing: Trumpet 3`. **Status line**: `Orchestra · 1 playing · 3 done · 3 artifacts changed`. **Coda**: task, status, nine contributors, artifacts with SHA-256 |

Not checked: an MP3 from a real voice (needs your ElevenLabs key and voice id); the prototype drawn in a browser (the browser was set aside at your request; its code passes `node --check` and its scripted performance replays as above); a light theme and a 256-colour terminal live (both are covered by `palette-proof.mjs`, not seen on screen this time). Screenshots: `docs/screenshots/` (nine, one per surface). Evidence: `e2e-evidence/run-20261012-voice-theme-motion/` (`shots/` holds the colour captures each screenshot was rendered from; `live-shots/proj/` and `surfaces/proj/` hold the two performances' ledgers and codas under `.orchestra/performances/`).

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
