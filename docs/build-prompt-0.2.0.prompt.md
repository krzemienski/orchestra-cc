# Orchestra 0.2.0 build prompt

Give this whole file to an autonomous coding agent (Claude Code or omp) started in `/Users/nick/dev/orchestra`. It is self-contained. Activate the `implement` skill first.

```xml
<task>
Build Orchestra 0.2.0 as specified by docs/PRD-orchestra.md (PRD v2) using the slices in docs/plan-0.2.0.md (revision 3). Work in dependency order: W0, then B → A (one owner, sequential) alongside C (parallel, ledger.js only), then D → F → E → G. Make every P0-12 to P0-21 and P1-5 requirement pass its §6 gate. Prove each requirement by driving the real Claude Code TUI in tmux as an end user and capturing the result. Then publish 0.2.0 and install it from GitHub into a clean config.
</task>

<context>
- Product: a Claude Code plugin with a conductor agent, five musician subagents (violin scout, trumpet implementer, flute scribe, timpani tester, cello reviewer) and a mod in plugin/hooks/ (register.js, ledger.js, views.js, palette.js, motion.js). The mod records reads and writes in an append-only ledger, guards conflicting writes and draws the band, pane, Agent rows, status line and toasts. The current code is 0.1.7.
- Source of truth, in order: docs/PRD-orchestra.md > docs/plan-0.2.0.md > docs/orchestra-spec.md > docs/verification.md. docs/orchestra-prd.md and docs/orchestra-prd-map.html are superseded; cite them only by commit 6d289ac.
- The owner's rules (PRD:8-12, Non-Goals): the orchestra is a metaphor only; no sound, speech, voice, network, API key, child process or browser; the plugin lives only in the Claude Code terminal; it looks and works like Amp, omp and OpenCode; nothing animates (D2).
- Ten of the plan's line cites into register.js, views.js and motion.js were spot-checked against 0.1.7 and matched (.planning/docs-audit/audit-a.md, written against plan revision 2). Treat every cite as a hint: re-read the code before each edit.
- The release rule sits at docs/orchestra-spec.md:213 (PRD:398 quotes it as :211; the line moved when a banner was added).
- Live harness: .planning/live/record.sh (tmux capture every 200 ms, plain and ANSI), .planning/live/ansi2png.py (renders ANSI frames to PNG), .planning/live/replay.mjs. Contracts: .planning/contracts/render-proof.mjs and palette-proof.mjs. motion.contract.mjs is deleted in slice B, and prototype-replay.mjs is retired. replay.mjs imports `band` from views.js, and render-proof.mjs:49-80 asserts on motion between frames. Slice B owns updating both, so they draw the new static surfaces.
- Starting state: the tree is dirty with docs only (docs/PRD-orchestra.md, docs/plan-0.2.0.md, docs/tui-research.md, superseded banners, deleted docs/asset-handout.md, .planning/docs-audit/, this prompt and its rating) plus .omp/config.yml. Commit everything except .omp/config.yml as `docs: PRD v2, plan rev 3, build prompt` before W0, so that W0 runs on a clean 0.1.7 code tree. Leave .omp/config.yml uncommitted.
- Authentication in a clean CLAUDE_CONFIG_DIR: export the owner's long-lived token (`CLAUDE_CODE_OAUTH_TOKEN`, made with `claude setup-token`) into the tmux session. Never copy ~/.claude into the temp dir. If no token is available, ask the owner once and wait.
- Fixture: create it with `git init` in a temp dir: config/limits.json `{"maxUsers": 10}`, src/db/schema.sql (one table), docs/limits.md (one line). Save the exact conductor prompt you send as step-00-conductor-prompt.txt in the run dir, and reuse it word for word for every rerun.
- Mods need Claude Code 2.1.287 or later. Check `claude --version` first. The plan was measured on 2.1.296.
- Evidence helper: ~/.omp/agent/skills/end-user-testing/scripts/fresh_evidence.py.
- Flake budget: a live gate may be rerun at most twice for model nondeterminism, such as a musician not starting. Record every attempt. Never rerun a gate to avoid a real defect.
</context>

<skills_to_activate>
- implement: the outer execution loop.
- tui-testing: drive Claude Code in tmux and assert on frames.
- end-user-testing: run-scoped evidence (init-run, next-step, seal, validate).
- visual-inspection: read each PNG capture before citing it.
- validation-plan: only if a gate in plan §6 cannot run as written.
</skills_to_activate>

<mcp_tools>
- bash with tmux, claude, node, npx, git, gh. These are the only end-user path. The product has no browser surface, so never use Chrome DevTools or a browser to verify it.
- Subagents: every spawned subagent runs on Claude Sonnet 5.5 (under omp: the `task` role, omniroute/cc/claude-sonnet-5-5; under Claude Code: `model: sonnet`). The orchestrator keeps verification and commits.
</mcp_tools>

<sequential_thinking>
1. Ingest. Read PRD v2 in full, plan revision 3 in full, and `git status`. List every P0-12 to P0-21 and P1-5 item with its slice and the §6 gate row that proves it. P0-15 and P0-18 are proved by the "Live run" and "G9 sizes" rows. An item counts as covered when some row's pass criterion names it. If one has none, add a row to the plan before writing code.
2. W0 baseline. On 0.1.7, run every §6 gate and save the results to a run dir made by the end-user-testing helper (`fresh_evidence.py init-run v020-w0`). Mark each gate that already passes as regression-only. The idle (P0-19), P0-21 userConfig and P0-21 voice-argument gates must FAIL here; if any passes, the gate is wrong, so fix the gate first. The W0 capture also answers P0-14: can the mod redraw each parallel Agent row? Record the answer; it decides whether PO-1 checks line 2 on the Agent rows or on the band and Ensemble fallback.
3. Slice B (no motion), then A (no voice or narration). They have one owner, run one after the other, and get one commit each.
4. Slice C (ledger helpers: currentCall, lastCalls, rollup, instanceName) can run in parallel with B and A because it touches ledger.js only. Add a unit test for each helper that fails against a deliberate fault. B's helper moves into ledger.js (elapsed, activity, lastCall, eventText, recent, liveHandoff) land only after C is committed (plan:205); until then B keeps them in a temporary local module that it deletes in the same slice.
5. Slice D (agentRow, bandRows, Ensemble roster with details, keyHints, outcomeLine, palette `unknown` mode, P0-14 fallback) starts after A, B and C are committed.
6. Slice F: live gates in tmux (below). Fix and rerun until every gate passes.
7. Slice E: docs. Make them truthful, citing F's captures (P1-5).
8. Slice G: create CHANGELOG.md, set plugin.json:3 to 0.2.0, and commit. Then STOP and send the owner the verdict table, asking to push. After the owner approves, push and install in a clean CLAUDE_CONFIG_DIR from GitHub, and run PO-7 against the installed copy. If an installed-copy row fails, fix it and ship 0.2.1 the same way; never leave a red row unrecorded.
At each step, if a later finding invalidates an earlier step, say "revising step N because …" and redo it.
</sequential_thinking>

<todos>
Keep one todo per slice and one per §6 gate row. Exactly one is in progress at a time. Close a gate todo only when its evidence path is cited.
</todos>

<authorization>
Allowed without asking: edits under plugin/, docs/, .planning/, README.md and CHANGELOG.md; deleting files named in plan slices A, B and E (plugin/narrate/, plugin/hooks/motion.js, .planning/contracts/motion.contract.mjs); local commits after each green slice; tmux sessions; clean CLAUDE_CONFIG_DIR directories under the system temp dir.
Ask the owner first: every `git push` (0.2.0 and any 0.2.x fix), any change to PRD v2 requirements, adding any feature not in PRD v2 (PRD Risks: "every feature needs a line in this PRD before it is built"), and closing a gate as a "stated limitation" instead of passing it. Also ask for the auth token if it is missing. Batch the questions: while one waits, continue all local work that does not depend on the answer.
Never: touch ~/.claude, the user's real Claude config or another repo; add a network call, child process, timer or audio path; edit prototype/ (frozen).
</authorization>

<constraints>
- Fail open. A failing hook or draw must never block Claude Code (G5). Hooks stay under 10 s.
- No timer drives redraws (P0-19). The only timer allowed is the theme recheck. Elapsed time is computed from `view.now`, which is the last recorded event's timestamp.
- Every state shows a glyph and a word; colour is secondary (G7). The glyph, name and elapsed columns never move or truncate; only free text is cut, with `…`.
- Orchestra never repeats Claude Code's own subagent list (type, tokens).
- Test runners (`claude plugin test`, bun/tsx tests, contract scripts) are the REGRESSION rail only. They never prove a requirement.
- No mocks, stubs or fake fixtures standing in for Claude Code. If the engine cannot do something (for example P0-14), record that as observed, apply the PRD mitigation (PRD:340) and state it in docs/verification.md.
- Docs say only what is built and captured (P1-5). There is no voice, narration, motion or browser text except history or removal notes.
</constraints>

<output_contract>
1. Code: the plugin at 0.2.0 with plugin/narrate/ and plugin/hooks/motion.js gone.
2. One commit per slice, with the message naming the slice, e.g. `feat(0.2.0): slice D, two-line rows, band rollup, roster, key hints, outcome line`.
3. Evidence: one dir per run, created and sealed by the end-user-testing helper `fresh_evidence.py` (init-run, next-step, seal, validate), which names it e2e-evidence/run-<YYYYMMDDTHHMMSS>-v020-<slug>/. The plan's gates glob them as `e2e-evidence/run-*-v020-*/`. Each holds step-NN-<action>-<result>.{txt,ansi,png}, evidence-inventory.txt and a requirement-to-frame map (requirement-map.md) from P0-12…P0-21 and P1-5 to frame files. e2e-evidence/ is gitignored and stays local.
4. docs/verification.md: a 0.2.0 section with one row per §6 gate: command, pass criterion, observed result (quote the frame text verbatim, since the evidence is not published), evidence path, and PASS, FAIL or LIMITATION.
5. A final report in chat: a table of requirement → gate → verdict → evidence path, and nothing else.
</output_contract>

<validation>
The AI drives the real Claude Code TUI as the end user. Each item below is a proof obligation; pass criteria are fixed before capture.

<proof_obligation id="PO-1" blocking="true">
Prerequisites: clean CLAUDE_CONFIG_DIR, `claude --plugin-dir ./plugin --agent orchestra:conductor` in tmux at 160x48, and a fixture git repo containing config/limits.json, src/db/schema.sql and docs/.
Execute: send a scripted conductor prompt that starts 10 parts at once, including two trumpets editing config/limits.json (forced conflict) and one musician running a failing command (forced failure). Record with record.sh for the whole run.
Pass: ten distinct names (`Trumpet`, `Trumpet 2`…), each with the same name on every surface; zero `Guest`; no name truncated (P0-12, G9). Each Agent row has line 2 `└ <glyph> <tool> <target> [from vN] · <elapsed>` that matches the ledger's latest tool.call within one redraw, sampled every 3 s (P0-13, G10). The band shows line 1 as a rollup with zero counts omitted, then one row per musician not done (P0-15). The conflict dialog appears and both outcomes are recorded. The failed musician's row shows `✕ failed · <first error line>`. The outcome line `𝄐 Coda · N musicians · N files · N conflicts · N failed · <time> · /orchestra coda` has counts equal to the coda file (P0-18, G4).
If W0 showed that the engine cannot redraw parallel Agent rows (P0-14), the same line 2 must appear in the band and Ensemble rows instead, and the Agent-row gap is recorded as a LIMITATION with its W0 frame.
</proof_obligation>

<proof_obligation id="PO-2" blocking="true">
Execute: rerun PO-1 at 100x20.
Pass: the band folds into `… N more · /orchestra`; the rollup stays on line 1; the glyph, name and time columns do not wrap.
</proof_obligation>

<proof_obligation id="PO-3" blocking="true">
Execute: focus the pane and send the keys `1`-`4`, `↑`, `↓`, Tab, Enter and Esc. Capture after each.
Pass: each tab's last row shows its key hints (P0-17). Enter on an Ensemble row opens details with the part brief, the versions seen, reads and writes with versions, the last tool calls with times, the answer, and `full transcript: ← in Claude Code's agent view` (P0-16).
</proof_obligation>

<proof_obligation id="PO-4" blocking="true">
Execute: the idle gate. One musician runs Bash `sleep 75` while a conflict dialog is pending. Capture every 2 s for 60 s.
Pass: Orchestra's rows (Agent rows, band, pane, spinner suffix) are byte-identical across all frames (P0-19). The same gate must have FAILED on 0.1.7 in W0.
</proof_obligation>

<proof_obligation id="PO-5" blocking="true">
Execute: run the session in dark, light, 256-colour and ansi modes, plus unknown (force the theme read to fail). Run palette-proof.mjs.
Pass: in dark, light and 256 modes, every token is at least 4.5:1 against that mode's background, as palette-proof.mjs prints it. In ansi mode, every state still shows its glyph and word (G7). In the ansi and unknown modes, judge only the rows Orchestra draws: locate them in the .ansi frame by their text (band rollup line `𝄐 Orchestra`, band rows, the pane rows between the tab bar and the key-hint row), and on those rows find no 256 or truecolor escape (ansi) and no background escape `48;` (unknown, P0-20). Force unknown by making the theme read fail as the plan's Themes row describes; record the exact method in the run dir. State that truecolor is unobserved, because tmux reduces colour to 256.
</proof_obligation>

<proof_obligation id="PO-6" blocking="true">
Execute: type `/orchestra voice` in the live session; list plugin.json userConfig keys; run the P1-5 grep from plan §6.
Pass: the reply is `Unknown argument: voice. Use coda, ledger or close.` and the pane does not open; no voice, narration or eleven keys remain; every grep hit is history or removal text; docs/asset-handout.md is absent (P0-21, P1-5).
</proof_obligation>

<proof_obligation id="PO-7" blocking="true">
Execute: the P0-1 to P0-11 regression gates from docs/verification.md: `-p` auto send-back, `--continue` rebuild, Let it write / Send it back / Show both, stale and handoff toasts. After G, rerun them against the copy installed by `claude plugin marketplace add krzemienski/orchestra-cc` and `claude plugin install orchestra@orchestra-cc` in a clean config.
Pass: results match 0.1.7's, and both install commands exit 0 (G8).
</proof_obligation>

For every obligation: read the frames or PNGs yourself and quote what they show. If a check fails, fix the plugin and rerun; never relax the criterion. If the engine makes a criterion impossible, mark it LIMITATION with the captured proof and ask the owner before publishing. Release rule (orchestra-spec.md:213): nothing is published until every row passes or is a documented limitation.
</validation>

<example>
Good verdict row:
| P0-13 | G10 timing | PASS | e2e-evidence/run-20261014T101000-v020-live/step-14-agent-rows-160x48.txt: "└ ♪ Edit config/limits.json from v0 · 12s" matches ledger seq 211 tool.call Edit config/limits.json |
Bad verdict row (rejected): | P0-13 | tests | PASS | `bun test` green |
</example>
```
