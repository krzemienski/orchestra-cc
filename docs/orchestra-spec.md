# Orchestra — Stage 3 specification

Status: draft for the user's review, 2026-10-05. Reasoning trail: 24 steps through the sequential-thinking MCP server, kept in the author's local working notes (not published).
Inputs: the original three-stage prompt; `docs/orchestra-research-report.md` (Stage 1); `prototype/` and `docs/orchestra-prototype-design.md` (Stage 2, approved "approved, publish public as orchestra-cc"); the Claude Code 2.1.289 mods docs and the type declarations that Claude Code generates for a mod (local copies, not published).

**Current status: `docs/verification.md` is the authoritative record of what was verified on 2026-10-05; the status column and defect table here are kept as the pre-implementation snapshot, with defects 1–9 resolved as listed in `docs/verification.md`.**

Every statement below is either a design decision (what Orchestra must do) or a status marker: **VERIFIED** (with the evidence path), **UNVERIFIED** (written but not yet exercised in a real run), or **NOT DONE**.

---

## 1. Purpose and scope

Orchestra lets one person see, while it happens, what a team of Claude Code subagents is doing to a project:

1. **Who is playing** — which musician agents exist, which are active, waiting, done or failed.
2. **What each is doing** — the tool it is running now and how much work it has done.
3. **What data moved** — every file each musician read and wrote, as versioned content, and who used whose work.
4. **Where it went wrong** — two musicians changing the same file from different starting points, work produced from an outdated file, failed steps.
5. **How it came together** — a coda at the end, computed from the record, not from the agents' own summaries.

In scope: a Claude Code plugin with a conductor agent, five musician agents, and a mod that records, guards and draws. Out of scope: replacing Claude Code's own agent panel or `/tasks`; agent teams (split-pane teammates); merging file contents automatically (see §8, D-a and §12, decision 1).

## 2. Glossary

| Term | Meaning in Orchestra |
| --- | --- |
| Conductor | The session's main agent (`orchestra:conductor`). Plans and assigns; does not do musicians' work. |
| Musician | A subagent the conductor assigned a part to (`orchestra:violin`, `trumpet`, `flute`, `timpani`, `cello`). |
| Part | One assignment: one Agent tool call that started one musician. |
| Measure | One completed tool call by a musician. Progress is counted in measures played. |
| Score | The plan file `.orchestra/score.md` the conductor writes, and the Score tab's timeline. |
| Version | One distinct SHA-256 of a file's content, numbered from v0 (the content first seen). |
| Handoff | A musician used another musician's output (see §4.3). |
| Stale read | A musician produced work after reading a version that was later replaced. |
| Conflict | A musician tried to write a file whose current version is not the one it last saw. |
| Coda | The combined result, computed from the ledger at the end of each conductor turn. |
| Ledger | The append-only record of observations for one session. |

## 3. Architecture, and why each part exists

| Component | File(s) | Why it exists | Why not something else |
| --- | --- | --- | --- |
| Plugin manifest | `plugin/.claude-plugin/plugin.json` | Plugins are Claude Code's install and distribution unit. | — |
| Marketplace manifest | `.claude-plugin/marketplace.json` | Lets anyone run `claude plugin marketplace add krzemienski/orchestra-cc`. | — |
| Conductor agent | `plugin/agents/conductor.md` | Gives the session a main agent whose instructions are to plan a score, run independent parts in parallel, pass work through files, and present the coda. | A skill would only advise the default agent; `--agent` makes the conductor the main loop. |
| Five musician agents | `plugin/agents/{violin,trumpet,flute,timpani,cello}.md` | Distinct roles with restricted tools (scout and reviewer cannot edit) and a shared rule set (re-read before editing, write to named paths, report files read and written). | Generic `general-purpose` subagents have no role or tool limits and would all look alike. |
| Mod (hooks module) | `plugin/hooks/hooks.json`, `register.js` | The only mechanism that sees each subagent's tool calls with its `agentId`, can hold a write and ask the user, and can draw a pane, band, status line and toasts (research report §a; `acquired/mods-reference.md`). | Settings hooks record but cannot draw or ask; subagents return only a final message; agent teams are experimental and do not lock files. |
| Ledger and derivations | `plugin/hooks/ledger.js` | Pure functions: apply an event, fold a log, derive conflicts, stale reads, handoffs and the coda. Kept separate so a recorded ledger can be replayed outside Claude Code to check the screen against the data. | — |
| Views | `plugin/hooks/views.js` | Turns folded state into the element trees for the pane and band. | — |

The mod is the single writer of a session's ledger, so two processes never write the same file.

## 4. Data model

### 4.1 Where data lives

| Path (in the user's project) | Content | Written by |
| --- | --- | --- |
| `.orchestra/score.md` | The conductor's plan | Conductor (via its own Write) |
| `.orchestra/notes/*.md` | Work passed between musicians | Musicians |
| `.orchestra/logs/*` | Test and command output | Timpani |
| `.orchestra/performances/<session-id>.jsonl` | The ledger | The mod |
| `.orchestra/performances/<session-id>-coda.md` | The coda | The mod |
| `.orchestra/.gitignore` | `*`, so none of it is committed by accident | The mod |

### 4.2 Recorded events (observations only)

Every event has `seq` (1, 2, 3 … per session), `ts` (epoch milliseconds) and `type`.

| `type` | Extra fields | Recorded when |
| --- | --- | --- |
| `session.start` | `session`, `cwd` | The mod loads in a session with no ledger yet |
| `prompt` | `text` (≤500 chars) | A person submits a prompt (origin `composer`, `bridge` or `sdk`; not slash commands, task notifications or peer messages) |
| `turn.start` / `turn.end` | — | The conductor's turn begins / ends |
| `part.assigned` | `agent`, `subagentType`, `description`, `prompt` (≤600), `parent` | An Agent call started a subagent (`agent.spawn` resolved with an `agentId`) |
| `tool.call` | `agent`, `tool`, `target` | Any loop is about to run a tool |
| `tool.result` | `agent`, `tool`, `target`, `ok`, `error?`, `sentBack?` | The tool finished, failed, or Orchestra sent it back |
| `artifact.read` | `agent`, `path`, `hash` | A Read succeeded; `hash` is SHA-256 of the file at that moment |
| `write.attempt` | `agent`, `path`, `hash` (null if the file does not exist) | Just before Write, Edit, MultiEdit or NotebookEdit runs |
| `artifact.write` | `agent`, `path`, `hash`, `added`, `removed` | The write landed; line counts are a multiset diff of before and after |
| `conflict.resolved` | `id`, `choice` (`overwrite` or `reread`) | The user (or the `-p` default) decided a held write |
| `part.done` / `part.failed` | `agent`, `answer` / `reason`, `answer` | The subagent's turn ended (`turn.complete` with that `agentId`) |
| `coda` | `path`, `settled` | The coda file was written |

### 4.3 Derived state (never declared by agents)

- **Version numbering.** For each path, versions are the distinct hashes in the order first seen. A hash first seen on a read before anyone in the ensemble wrote it is v0, author `repo`. A later unseen hash not written by a musician is author `outside` (for example a Bash `sed -i`).
- **Conflict.** On `write.attempt` by musician M for path P with current version C: a conflict exists if M has seen a version of P and it is not C, or M has never seen P and C was written by another musician. The write is held (§5, step 6).
- **Stale read.** On `artifact.write` creating version V of P by musician W: every other musician that last saw an older version of P **and** has written anything since that read is marked stale on P. The mark clears when that musician reads P at version ≥ V.
- **Handoff (read signal).** Musician B reads a version authored by musician A ≠ B → handoff A → B for that path and version, once.
- **Handoff (brief signal) — NOT DONE.** When the conductor assigns a part whose prompt names a path whose latest version another musician wrote, record a handoff from that author to the new musician. Adds visibility for work passed in the brief rather than by a read.
- **Measures.** Count of `tool.result` events for that musician.
- **Musician state.** `playing` from assignment; `waiting` while a write is held; `done` / `failed` at `turn.complete`. The conductor is `playing` during its turn, `resting` otherwise.
- **Roster.** The conductor plus loops the conductor assigned a part to. Other loops (another plugin's helper agents, engine forks) stay in the ledger but are not musicians and are excluded from the band, pane, failures and coda.
- **Failures.** A musician's `part.failed`, and a failed `tool.result` of a roster musician that was not later followed by a successful write to the same path or the same tool and target. Calls Orchestra itself sent back are not failures.

### 4.4 Persistence and recovery

- **Current behaviour.** Every event rewrites the whole `.jsonl` with `$.fs.write`. This is O(n) per event and not atomic, so a crash mid-write can truncate the ledger.
- **Required change — NOT DONE.** Write the ledger in segments of 500 events (`<session>.0001.jsonl`, …). Only the newest segment is rewritten. On load, concatenate segments in order and skip an unparseable final line, noting it in the debug log. This stays well under the 4 MiB per-file write limit (about 300 bytes per event).
- **On reload or resume.** The mod replays the ledger with `fold()` and continues numbering from the last `seq`.

## 5. Event flow, step by step

1. **Session starts.** The mod registers `/orchestra`, resolves `cwd` and the session id, and loads the ledger if one exists, replaying it.
2. **The person submits the task.** The `prompt` event sets the coda's Task line.
3. **The conductor writes the score** (its own Write: recorded as `tool.call`, `write.attempt`, `artifact.write` with agent `conductor`).
4. **The conductor starts parts.** Each Agent call → `agent.spawn` resolves → `part.assigned`. The first one opens the pane (when the terminal is wide enough; otherwise it waits until `/orchestra`).
5. **Musicians work in parallel.** Every tool call → `tool.call`. A Read → `artifact.read` with the hash. Each event updates the band, status line and pane.
6. **A write is attempted.** The mod hashes the file, records `write.attempt`, and derives a conflict if one exists. If the writer never read the file, the write is denied without a question: Claude Code refuses any Write or Edit of a file that loop has not read, and a mod cannot record the read for it, so asking would offer a choice that always fails. Otherwise the mod **holds the write** and asks in Claude Code's question dialog. If the person chooses *Let it write*, the write proceeds. If they choose *Send it back to re-read*, or nobody can answer (`-p` run, dialog dismissed), the write is denied with a message telling the musician to re-read and reapply.
7. **The write lands.** The mod hashes the result → `artifact.write`, a new version, and stale-read derivation for other musicians.
8. **A musician finishes.** → `part.done` or `part.failed`.
9. **The conductor's turn ends.** → `turn.end`, then the coda file is written and a `coda` event recorded. If every musician is done or failed, a coda line is logged in the transcript and a "coda ready" toast shown.

## 6. Surfaces: what each shows

All drawing happens only where a mod may draw (mods interface docs). Status markers refer to live terminal evidence.

| Surface | Content and exact format | Updates when | Keys | Status |
| --- | --- | --- | --- | --- |
| Band above the prompt | `𝄐 Orchestra  Trumpet ♪ 3 Edit  Trumpet 2 ✓ 4  ‼ 1 conflict  ⚠ 1 stale` — each musician: name in its colour, glyph (`♪` playing, `‖` waiting, `✓` done, `✕` failed), measures, current tool | Every recorded event (redraws throttled by Claude Code to 30/s) | — | Drawn live, but with wrong names (§9, defect 1). Correct names later VERIFIED: `docs/verification.md`, S1. |
| Status line | `Orchestra · 2 playing · 1 waiting · 1 done · 2 artifacts changed · 1 conflict · 1 stale` (zero counts after `done` omitted) | Every event | — | Drawn live (same capture). |
| Pane, Ensemble tab | Header `N playing in parallel · M done`; one block per roster member: name, role, glyph and state; current tool or part description; `n measures · r reads · w writes` and `⚠ stale read` if open. Selecting a name expands: type, part prompt, every file seen with its version and `(now vK)` if outdated, the musician's answer | Every event | `/orchestra` opens; `1` Ensemble; Enter on a name selects; Esc closes | Empty state VERIFIED before implementation; with a performance later VERIFIED: `docs/verification.md`, S3 and S4. |
| Pane, Score tab | One staff per roster member, last (pane width − 12) events: `○` read, `←` read another's work, `●` write, `·` tool, `◆` assigned, `✓` done, `✕` failed, `‼` conflict, `⚠` stale, `?` decided | Every event | `2` | UNVERIFIED |
| Pane, Artifacts tab | Every file touched, newest activity first: path, `vN` or `conflict`/`stale`, authors in order, read count. Selecting a file expands: each version (author, base, ±lines, first 12 hex of SHA-256, `skipped vK` if written from an older base), last 8 reads, conflicts and their outcome | Every event | `3`; Enter on a path | UNVERIFIED |
| Pane, Coda tab | Task, coda file path, contributions, artifacts changed, handoffs, conflicts, failures, stale reads | Every event; file written at turn end | `4` | UNVERIFIED |
| Conflict dialog | `Orchestra: <Other> wrote <path> vC and <Writer> saw vB. Let <Writer>'s <Tool> go ahead?` with options *Let it write* / *Send it back to re-read* / *Show both versions*. When the writer never read the file, no dialog: the write is sent back with the reason. | A held write the writer has read | ↑↓ Enter | Dialog VERIFIED: `docs/verification.md`, S9. The never-read case is specified; its verification is recorded with the fix. |
| Toasts | `Orchestra · handoff: …` (4 s), `· stale read: …` (6 s), `· <name>: <tool> failed` (6 s), `· conflict on <path>: …` (8 s), `· coda ready: …` (6 s) | The event that created them | — | UNVERIFIED (not captured) |
| Spinner | Claude Code's spinner plus `· N musicians playing` | While any musician plays | — | VERIFIED (`…/04-after-send-back.txt`: `Mustering… · 2 musicians playing`) |
| Agent tool row | A line above Claude Code's row: `♪ Trumpet · Implementer · 3 measures` in the instrument colour | Agent row redraw | — | UNVERIFIED |
| `/orchestra coda` | Status line, one line per contributor, each conflict, failure and stale read, handoff count, printed in the transcript | On command | — | UNVERIFIED |
| `/orchestra ledger` | `<ledger path> · <n> events · <status line>` | On command | — | UNVERIFIED |
| Coda file | Markdown: Task, Ledger path, Status, Who contributed what, Artifacts changed (with final SHA-256), Handoffs, Conflicts, Failures, Stale reads | End of each conductor turn | — | Written in both early real runs, with defects 1–3; later VERIFIED: `docs/verification.md`, "Coda matches the ledger". |

## 7. User journeys

Each journey lists what the person does and what they must see. §10 maps them to verification.

- **J1 Install.** `claude plugin marketplace add krzemienski/orchestra-cc`, then `claude plugin install orchestra@orchestra-cc` → both print success; `/plugin` lists `orchestra` and one active mod.
- **J2 Start.** `claude --agent orchestra:conductor` → the header shows `@orchestra:conductor`; `/orchestra` opens the pane with "No performance yet."
- **J3 Parallel parts.** Ask for two independent changes → two Agent rows labelled with instruments; the band shows both `♪`; the status line says `2 playing`; the spinner says `2 musicians playing`.
- **J4 Conflict.** Two musicians edit the same file from v0 → the dialog appears naming both and the versions; the writer shows `‖ waiting`. Choosing *Send it back* → the edit is denied, the musician re-reads and reapplies, and the ledger has `conflict.resolved` `reread` followed by a new version whose base is the current one. Choosing *Let it write* → the write lands and the coda says so.
- **J5 Failure and recovery.** A test fails → Timpani's log under `.orchestra/logs/`, a failure toast; the conductor assigns a fix and a rerun → the coda lists the failure as recovered.
- **J6 Stale read.** A musician reads a file, writes something else, then another musician changes the file → a `⚠ stale` toast and a mark in Ensemble; it clears when the first musician re-reads.
- **J7 Coda.** At the end → a transcript line `Orchestra coda: … Written to …`, the Coda tab, `/orchestra coda`, and the file, all with the same counts.
- **J8 Inspect a file.** Artifacts tab → select `config/limits.json` → every version with author, base, line counts and hash, and who read which version.
- **J9 Reload or resume.** Restart with `claude --continue` → the band and pane show the same state, replayed from the ledger.
- **J10 Headless.** `claude -p … --agent orchestra:conductor` → the ledger and coda file are written; a conflict is sent back automatically; nothing is drawn.
- **J11 Mods off.** With `--safe-mode` or `disableAllHooks` → the agents still work; no ledger or drawing; nothing errors.

## 8. Deviations from the approved prototype

These were applied in code before being explained to you. That broke the prompt's rule, so they are listed here for your review.

| ID | Prototype | Plugin | Technical reason |
| --- | --- | --- | --- |
| D-a | Conflict dialog: keep A / keep B / conductor merges | *Let it write* / *Send it back to re-read* | A mod holds one write at a time. It cannot produce a merged file without a model call inside the held write, and a bad merge would silently corrupt the file. A merge choice is offered as decision 1 in §12. |
| D-b | Separate Inspector sidebar | Details expand inside the pane | A terminal session has one mod pane beside the transcript; there is no second sidebar. |
| D-c | Instrument prefix on every tool row | Label on Agent rows only | It is unverified whether a subagent's own tool calls appear as rows in the main transcript. If they do, all rows will be labelled. |
| D-d | Progress `n of total measures` | `n measures` played | Claude Code exposes no step plan for a subagent, so there is no total. |
| D-e | Handoffs as scripted events | Handoffs derived from reads (and, once done, briefs) | Agents do not declare handoffs; only reads and prompts are observable. |
| D-f | The conductor is simply the session | Started with `claude --agent orchestra:conductor` | Setting the plugin's `agent` key would take over every session after install. |
| D-g | One scripted scenario | Real tasks | — (this is the point of Stage 3) |

## 9. Known defects

| # | Defect | Seen in | Fix | Status |
| --- | --- | --- | --- | --- |
| 1 | Every musician named `Guest (part.assigned)` | Both real codas | The `part.assigned` event stored the subagent type under `type`, colliding with the event type. Now `subagentType`, plus `identify()` for loops first seen through a tool call. | Fixed on disk, UNVERIFIED live |
| 2 | Coda Task line was a background-task notification | Headless coda | Only `composer`/`bridge`/`sdk` prompts set the task | Fixed on disk, UNVERIFIED live |
| 3 | Failures listed the conductor's commands and another plugin's helper agent | Both codas | Roster restricted to assigned loops; failures restricted to the roster; failed writes recovered by a later write | Fixed on disk, UNVERIFIED live |
| 4 | Event `ts` recorded as `{}` | Both ledgers | `await $.clock.now()` (it returns a Promise) | Fixed on disk, UNVERIFIED live |
| 5 | Ledger rewritten whole and non-atomically | Code review | Segmented ledger (§4.4) | NOT DONE |
| 6 | A Bash command that hides its exit code counts as success | Headless run (`npm test > log; echo …`) | Use `exitCode` from the Bash result where Claude Code provides it (`interrupted`, `returnCodeInterpretation` fields in the tool types) | NOT DONE |
| 7 | Type check (`tsc --checkJs` with the generated types) reports about 250 errors, 27 of them real mismatches (view object shape, empty-array inference, `unknown` errors) | `npx tsc -p plugin` | Add JSDoc types for state, events and view | NOT DONE |
| 8 | Brief-signal handoff missing | Design review | §4.3 | NOT DONE |
| 9 | Mod load check not saved as evidence | Process | Re-run and save | NOT DONE |

## 10. Verification plan

**Environment.**
- A scratch project whose test reads the limit from config, so no test edit is needed and the user's `no-test-files` hook never fires.
- Claude Code 2.1.289.
- Runs use an isolated `CLAUDE_CONFIG_DIR` containing only Orchestra installed from GitHub (decision 2 in §12). Fallback: the normal config, with the user's other plugins' interference documented.
- One fresh tmux session per journey, polled with short `capture-pane` calls.
- Each capture is saved locally under `e2e-evidence/stage3-<journey>-<timestamp>/` (gitignored; the key outputs are quoted in `docs/verification.md`).
- After each run, the session's ledger is replayed with `fold()` and the derived state compared with what the screen showed.

| Requirement (prompt line) | Journey | Command | Pass condition |
| --- | --- | --- | --- |
| Mechanism loads | J2 | `claude plugin validate ./plugin`; `claude -p "/orchestra ledger" --plugin-dir ./plugin` | `✔ Validation passed`; output starts `No performance in this session yet` |
| Core orchestration | J3 | tmux: `claude --agent orchestra:conductor`, two-part task | Capture shows two Agent rows labelled `Trumpet` and `Trumpet 2`, band with both, status `2 playing` |
| Data flow and artifact handling | J3–J8 | Replay the ledger with `fold()` | Every write has a hash and author; version chain of the shared file matches its git history; read events name the versions read |
| Coordination between agents | J4 | Conflict task, choose *Send it back* | Dialog capture with real musician names; ledger `conflict.resolved reread`; the musician's next write has base = current version; final file contains both changes |
| Coordination, alternative | J4 | Same, choose *Let it write* | Ledger `overwrite`; coda states the write was allowed |
| Visibility of changes | J6, J8 | Capture Artifacts tab with a file selected; stale scenario | Version list with authors, bases and hashes; `⚠` in band and Ensemble, cleared after re-read |
| Failures | J5 | Task with a failing check that the conductor must fix | Failure toast or pane mark; coda lists the failure as recovered |
| Combined result | J7 | Capture the Coda tab, `/orchestra coda`, `cat` the coda file | Same contributors and counts in all three; no `Guest` entries; Task is the person's prompt |
| Every pane tab | J3–J7 | Keys 1–4 in the pane | Each tab's capture matches §6 |
| Reload | J9 | `claude --continue` in the same project | Band and status line equal to before |
| Headless | J10 | `claude -p … --agent orchestra:conductor < /dev/null` | Ledger and coda file exist; a conflict is recorded as `reread` |
| Install from the public repo | J1 | `claude plugin marketplace add krzemienski/orchestra-cc` and `claude plugin install orchestra@orchestra-cc` in the isolated config | Both succeed; J2 passes from the installed copy |

## 11. Publish plan

1. Fix defects 1–9, then run every row of §10. Nothing is published before §10 passes or each failing row is documented as a stated limitation.
2. Repository `krzemienski/orchestra-cc`, public (destination confirmed by the user). It does not exist yet (`gh repo view` returned "Could not resolve").
3. Contents: `plugin/`, `.claude-plugin/marketplace.json`, `prototype/`, `docs/` (research report, prototype design, this spec, a curated `verification.md` with commands and outputs), `README.md`, `LICENSE` (MIT).
4. Excluded: `plans/`, `spikes/`, `e2e-evidence/`, `.orchestra/`, generated `types/`. They hold local paths, session ids and transcripts.
5. Before pushing: scan staged files for secrets and for absolute home-directory paths.
6. After pushing: run J1 and J2 against the published copy, then record the result in `docs/verification.md`.

## 12. Open decisions

None of these blocks fixing the defects or running the verification.

1. **Merge choice in the conflict dialog.** Recommendation: keep two choices, and add *Show both versions* (opens the Artifacts detail before deciding). An automatic model merge would be opt-in only.
2. **Isolated verification config.** Recommendation: yes, a temporary `CLAUDE_CONFIG_DIR` with only Orchestra, so your global hooks (stop guards, `no-test-files`, other plugins' helper agents) don't distort the evidence. Your own configuration is not changed.
3. **The paused tmux session `orch`.** It is waiting on its conductor's question about your `no-test-files` hook. Its coda is already written, so it isn't needed for evidence. Yours to answer or close.
