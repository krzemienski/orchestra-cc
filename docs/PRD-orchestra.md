# Orchestra

**Owner**: krzemienski
**Status**: In Review
**Last Updated**: 2026-10-13 (P0-20 and D3 reworded for the unknown-theme pane ground). Previously 2026-10-12. Rewritten from the original spec and the TUI research of the same day. It replaces the 0.1.1 product PRD and the first draft of 2026-10-12.

**Sources of truth, in order.**
1. **The owner's statements.** On 2026-10-12 the owner said:
   - the orchestra is only a picture of how agents relate: a conductor orchestrates subagents, about ten of them working at once;
   - nothing in Orchestra makes sound or speaks;
   - Orchestra lives only in the Claude Code terminal;
   - it should look and work like Amp, omp and OpenCode.
2. **The founding request:** `plans/261005-1726-orchestra/original-request.md:7`.
3. **The approved build spec**, as committed in `6d289ac`: `docs/orchestra-prd.md`. Cited below as *spec*, with line numbers from that commit.
4. **The TUI research**, 2026-10-12: `docs/tui-research.md`. Evidence is in `e2e-evidence/tui-research-20261012/`.
5. **The engineering spec** (`docs/orchestra-spec.md`) and **the verification record** (`docs/verification.md`).

Where this document and a later edit of those files disagree, this document wins until it is revised.

---

## Problem Statement

**Who**
- Developers who use Claude Code 2.1.287 or later in a terminal or in the Desktop app's Code tab.
- They run several subagents on one project at once.
- They already have Claude Code sign-in. Orchestra adds no accounts, keys or network services (spec:63).

**What**: when Claude Code runs many subagents in parallel, the person in charge loses track of the work.
- Claude Code's own list below the prompt shows each running subagent's type, task, elapsed time and tokens (`e2e-evidence/…/others/claude/07-run-04.txt`). It does not show:
  - which **file** each one is reading or changing, at which **version**;
  - whose work it **built on**;
  - whether two of them **clashed**.
- One agent can silently overwrite another's newer work. Claude Code's read-before-edit check covers each agent's own conversation only.
- The final summary is written from the agents' own prose. Nothing checks it against what happened to the files.

**Why it matters**
- The founding request asks for an experience that makes it "easy to understand which agents or 'instruments' are active, what they are doing, how work is progressing, how data is read or changed, and how their contributions come together" (`original-request.md:7`).
- Agent *status* is well covered elsewhere. No surveyed tool connects "who read which version" to "who changed it" (`docs/orchestra-research-report.md:170`).
- None of the TUIs studied on 2026-10-12 does it either. omp says so on screen: "Shared workspace · per-agent LoC not attributable" (`…/omp/frames/manual/B07-hub10.txt`).

That gap is why Orchestra exists.

### What the orchestra means

The orchestra is a metaphor for how agents are arranged. It describes no sound, music or speech (`docs/orchestra-research-report.md:304-314`; `docs/orchestra-spec.md` §2).

| Term | What it is in Claude Code |
| --- | --- |
| Conductor | The session's main agent (`orchestra:conductor`). It plans, assigns parts and presents the coda. It does not do the musicians' work. |
| Musician / instrument | A subagent with a fixed role: violin (scout), trumpet (implementer), flute (scribe), timpani (tester), cello (reviewer). |
| Musician instance | One running subagent. The same instrument can play several parts at once; the second one is `Trumpet 2`. |
| Part | One assignment: one Agent tool call. |
| Measure | One completed tool call by a musician. Progress is counted in measures. |
| Ensemble | Everyone in the session's roster. |
| Score | The plan (`.orchestra/score.md`) plus the timeline of what happened, read from the ledger. |
| Handoff | One musician used a file version another musician wrote. |
| Coda | The combined result, computed from the ledger rather than from what the agents say. |
| Ledger | The append-only record of every observed read, write and decision. |

---

## Goals

**User Goals**
- See, while it happens, who is working, what each one is doing right now, and how far each has got.
- See which file versions each one read and wrote, and whose work it built on.
- Never lose work to a silent overwrite. Decide each clash.
- Trust the end summary, because it comes from the record.

**Business Goals**
- A public plugin that installs in two commands (spec:51).
- No harm to the host: Orchestra never blocks or breaks Claude Code (spec:48).
- It feels native next to the agent TUIs people already use (Amp, omp, OpenCode) and next to Claude Code's own rows.

**Success Metrics**

G1–G8 are the spec's goals (spec:44-51); G9 and G10 are new.

| # | Metric | Target | How it is measured |
| --- | --- | --- | --- |
| G1 | Every musician appears by instrument name | Within one redraw; 0 `Guest` names for `orchestra:*` | tmux capture after an Agent call |
| G2 | Every musician read and write is recorded with its SHA-256 | Read/Write/Edit calls with `ok` = `artifact.read` + `artifact.write` events; each final hash equals `shasum -a 256` | Ledger replay against the files |
| G3 | A write based on an old version never lands silently | 1 of 1 conflicting writes raises the dialog (interactive) or is denied (`-p`); the ledger has `conflict.resolved` | Scripted two-musician run |
| G4 | The coda matches the ledger | Coda tab, `/orchestra coda`, the coda file and the outcome line show the same counts | One session, four captures |
| G5 | Orchestra never blocks Claude Code | No hook over the 10 s budget; a failed record or draw still lets the tool run | Hook timings over a 500+ event run (**not yet measured**) |
| G6 | Everything works from the keyboard | Every tab, row and dialog option reachable without a mouse | Live key-driving in tmux |
| G7 | No state is shown by colour alone | Every coloured state also has a glyph and a word | Review of every surface |
| G8 | Installs from GitHub | `claude plugin marketplace add krzemienski/orchestra-cc` and `claude plugin install orchestra@orchestra-cc` exit 0 in a clean config | Clean `CLAUDE_CONFIG_DIR` |
| G9 | Ten at once stays readable | Ten musicians playing at once: every one named, with its current tool, in the Agent rows, the band and the Ensemble tab; zero `Guest`; no name truncated | Live ten-part run in tmux at 160×48 and at 100×20 |
| G10 | You can tell what each musician is doing right now | During a run, every playing musician's row shows the tool and file of its current call within one redraw of the call starting | tmux captures every 3 s, compared with the ledger's `tool.call` events |

---

## Non-Goals

- **Any sound, speech or voice.** No text-to-speech, no audio files, no voice settings, no `$.audio` (owner, 2026-10-12).
- **Any network call, external service, API key or child process** (spec:63).
- **A browser or web surface.**
  - Orchestra draws only where a mod can draw: the Claude Code terminal and the Desktop Code tab.
  - `prototype/` is the approved Stage 2 design artifact (`original-request.md:19-28`). It is not a product surface and is not used to verify the product.
- **Motion of our own.** Claude Code's spinner already shows that work is happening. This is a design decision (spec:495, D2), not something every peer does; OpenCode, for one, runs two moving indicators.
- **A copy of Claude Code's own subagent list.** Its type, elapsed time and tokens stay where they are (spec:58).
- **Opening a subagent's full transcript.** A mod cannot (`…/canvas/report.md` §5). Claude Code's `←` agent view and `ctrl+o` do it.
- **A separate many-agent manager.** Amp moved this to a web app; omp has a full-screen hub. Orchestra stays inside Claude Code's terminal surfaces.
- **Automatic merging of two musicians' versions** (spec:55, 417).
- **Agent teams** (spec:56).
- **Crediting Bash changes to a musician** (spec:57).
- **Drawing in VS Code, `claude -p` or cloud sessions.** Orchestra still records and guards there (spec:59).

---

## User Stories

**As a** lead running about ten parallel agents
**I want to** see each musician's name, what tool and file it is on right now, and how long it has been at it
**So that** I know who is doing what without opening each transcript.

**As a** lead
**I want** a single line telling me how many are playing, waiting on me, done, failed, or in conflict
**So that** I can tell at a glance whether anything needs me.

**As a** lead
**I want** a write based on an outdated version held, so I can decide it
**So that** no one's work disappears silently.

**As a** reviewer after the fact
**I want** every file version with its author, base version and readers, and a coda built from that record
**So that** I can tell who changed what, from which version, and what went wrong.

**As a** headless runner (`claude -p`)
**I want** conflicts sent back automatically, with nobody to ask
**So that** a scripted pipeline never clobbers itself.

**As a** keyboard or screen-reader user
**I want** every view reachable by keys, every state spelled out in words, and nothing moving that I didn't ask for
**So that** I get the same information as everyone else.

---

## User Experience

### Design basis

The interaction design comes from the TUI research (`docs/tui-research.md`). How strongly each tool was observed:
- **omp**: run live with 3, 4 and 10 subagents, plus its source.
- **OpenCode**: run live. Its four parallel Task rows were drawn, but the children failed, and drill-in was not observed. Running, done and child-view behaviour come from its source.
- **Amp**: docs and screenshots only. No subagent row was seen.
- **Claude Code**: run live, as the ground Orchestra stands on.

The patterns Orchestra takes:

| Pattern | Seen in | Orchestra |
| --- | --- | --- |
| One row per worker: identity + its job | omp live; OpenCode live | Agent row, band row, Ensemble row |
| A second line with what the worker is doing now | omp live (`└ bash: Running word count · 16.2s`); OpenCode source (`↳ <Tool> <title>`) | `└ Edit config/limits.json from v0 · 12s` |
| A rollup line above the rows | omp live (`waiting on 3 jobs`); Pi source (`⏳ parallel 3/8 done, 2 running`) | Band line 1 |
| A cap with `… N more` | omp live (batch block and pinned HUD) | Band |
| A roster plus details of the selected worker | omp Agent Hub, live | Ensemble tab |
| An outcome footer per batch | omp gallery (`⟨1 succeeded · 6 req · 48.2s⟩`) | Outcome line when the conductor's turn ends |
| A failed row recoloured, not a separate block | OpenCode live (red `│` and title) | `✕ failed` + `danger` + first error line |
| Key hints in the footer | lazygit live; OpenCode live | Pane's last row |

What Orchestra adds that none of them show: the **file version** each musician saw and wrote, **conflicts**, **stale reads**, **handoffs**, and a **coda from the record**.

### Glyphs and words

These are fixed: the spec's set (spec S1), always in a fixed column and always followed by the word. Colour is secondary (G7).

| Glyph | Word | Colour token |
| --- | --- | --- |
| `·` | resting (assigned, not started) | muted |
| `♪` | playing | ok |
| `‖` | waiting on you | warn |
| `✓` | done | default |
| `✕` | failed | danger |
| `‼` | conflict | danger, bold |
| `⚠` | stale | warn |

### Surfaces while ten musicians play

```
⏺ Trumpet 2 · Implementer                                  ← Agent row line 1 (redrawn): who + role
  └ ♪ Edit config/limits.json from v0 · 12s                 ← line 2: state, current tool, target, version, elapsed
⏺ Violin · Scout
  └ ✓ done · 4 measures · 3 reads · 1 write · 41s           ← when finished
✽ Bootstrapping… · 9 musicians playing (1m 51s · ↓ 9k)     ← Claude Code's spinner + Orchestra's suffix (spec S8)
𝄐 Orchestra  9 playing · 1 waiting on you · ‼ 1 conflict   ← band line 1: rollup
♪ Violin 2    Read   src/db/schema.sql · 0:40               ← band: one row per musician not yet done
‖ Trumpet 2   held   config/limits.json: Trumpet wrote v1 since you read v0
♪ Flute       Write  docs/limits.md · 0:31
  … 6 more · /orchestra                                     ← only when rows exceed the band's space
❯
  ⚠ orchestra: 9 playing · 1 done · 4 artifacts changed · 1 conflict    ← status line (spec S2)
  ⏵⏵ … · ← 11 agents                                        ← Claude Code's own line and agent list, untouched
```

### Flow 1: a performance

Follows spec:19-25.

1. Install: `claude plugin marketplace add krzemienski/orchestra-cc`, then `claude plugin install orchestra@orchestra-cc`.
2. Start: `claude --agent orchestra:conductor`.
3. Describe a task. The conductor writes `.orchestra/score.md` and starts independent parts in one message.
4. While musicians work:
   - **Agent rows.** Each musician's Agent row is labelled with its name and role. Its second line shows its state, the tool and file of its current call (with the version it is working from), and elapsed time. When the musician finishes, the line becomes `✓ done · N measures · N reads · N writes · <time>` or `✕ failed · <first error line>`.
   - **Band.** Line 1 is the rollup: counts of playing, waiting on you, done and failed, then `‼ N conflict` and `⚠ N stale` while any are open. Below it come rows for the musicians that are not done, in assignment order: glyph, name, current tool, target, elapsed. Rows past the band's space fold into `… N more · /orchestra`. Done musicians leave the band. Done and failed musicians stay listed in the pane.
   - **Status line.** It carries the same counts as the rollup (spec S2).
   - **Pane.** It opens by itself on the first part when the terminal is wide enough, or with `/orchestra`. It shows four tabs: Ensemble, Score, Artifacts, Coda (Flow 3).
   - **Toasts.** They announce handoffs, stale reads, failures and conflicts (spec S10).
5. When the conductor's turn ends:
   - the coda file is written;
   - one outcome line is logged: `𝄐 Coda · 10 musicians · 7 files · 1 conflict (resolved) · 0 failed · 3m10s · /orchestra coda`;
   - a "coda ready" toast follows.

### Flow 2: a conflict

Follows spec:396-433.

1. Trumpet tries to edit `config/limits.json` from v0, but Trumpet 2 already wrote v1.
2. The edit is held. Trumpet's band row and Agent row both show `‖ held config/limits.json`.
3. Claude Code's question dialog asks: "Trumpet 2 wrote config/limits.json v1 and Trumpet saw v0. Let Trumpet's Edit go ahead?"
4. The user picks one of:
   - *Let it write*;
   - *Send it back to re-read*;
   - *Show both versions*, which shows both changes above the dialog and then asks again.
5. The outcome is recorded in the ledger, toasted, counted in the rollup until resolved, and listed in the coda.

### Flow 3: the pane

| Tab | What it shows | Keys |
| --- | --- | --- |
| 1 Ensemble | Line 1: `N playing · N waiting · N done · N failed`. Then one two-line row per musician, conductor first: `<glyph> <Name>  <Role> · <state word>` over `└ <current tool + target>` (or the part brief when idle), then `N measures · N reads · N writes` and `⚠ stale read` while open. Enter on a row opens its **details**: part brief, versions it has seen (`config/limits.json v0 (now v1)`), its reads and writes with versions, its last tool calls with times, and its answer. The details row ends with `full transcript: ← in Claude Code's agent view`. | `↑↓`/Tab select, Enter details, `1-4` tabs |
| 2 Score | One static staff per musician over the newest ledger events (`◆ ○ ● ← · ✓ ✕ ‼ ⚠ ?`), with the legend (spec S5). No playhead or beat. | `2` |
| 3 Artifacts | Every file with its versions: author, base version, `+a −r`, hash, readers, and conflicts (spec S6). | Enter details |
| 4 Coda | The coda from the ledger: task, contributions, artifacts, handoffs, conflicts, failures, stale reads (spec S7). Same content as the file and `/orchestra coda`. | `4` |

The pane's last row lists the keys for the focused tab, e.g. `1-4 tabs · ↑↓ select · enter details · esc close`. `/orchestra coda` and `/orchestra ledger` print text versions of the coda and the ledger (spec S11).

### Interaction rules

- Rows are truncated with `…` on the free-text column only. Glyph, name and elapsed time never move.
- A failure recolours the same row and adds its first error line. There is no separate error block.
- Nothing in Orchestra animates. Rows redraw when an event arrives; elapsed times update on those redraws.
- Orchestra never repeats what Claude Code's own subagent list shows (type, tokens). It points to it for full transcripts.

---

## Requirements

Status: **Shipped** = verified in a real run and recorded in `docs/verification.md`. **Open** = not yet done or not yet proven. **Change** = shipped in another form; this PRD changes it.

### Must Have (P0)

**Baseline, shipped in 0.1.1** (spec §2, `docs/verification.md:27-41`)

| # | Requirement | Acceptance | Status |
| --- | --- | --- | --- |
| P0-1 | Install from the public marketplace | G8 | Shipped (Claude Code 2.1.291) |
| P0-2 | `claude --agent orchestra:conductor` starts a conductor-led session; `/orchestra` opens the pane | Header shows `@orchestra:conductor`; empty pane reads "No performance yet." | Shipped |
| P0-3 | Conductor plus five musicians with fixed roles and tool limits (spec:13; spec:623). Only trumpet and flute have Edit; cello can neither edit nor write. | `plugin/agents/*.md` frontmatter matches spec §6.1 | Shipped |
| P0-4 | Ledger: every musician read and write with its SHA-256 and version, in 500-event segments | G2 | Shipped |
| P0-5 | Conflict guard: a write from an outdated base is held and asked with *Let it write* / *Send it back to re-read* / *Show both versions* (spec:396-433) | G3, both outcomes | Shipped |
| P0-6 | A write to a never-read file is sent back without a question; headless (`-p`) or a dismissed dialog counts as *Send it back* | Ledger `conflict.resolved reread` | Shipped |
| P0-7 | Stale reads and handoffs are derived from versions, never declared by agents | Stale and handoff toasts; coda lists both | Shipped |
| P0-8 | Coda computed from the ledger, written to `<session>-coda.md` when the conductor's turn ends, identical to the Coda tab and `/orchestra coda` | G4 | Shipped |
| P0-9 | State rebuilt after `claude --continue`; fail open with mods off or a hook failing | Band and status match before/after; agents still work with `disableAllHooks` | Shipped |
| P0-10 | Artifacts tab, Score tab (static), Coda tab, status line, five toast kinds, `/orchestra coda|ledger|close` (spec S2, S5-S7, S10, S11) | Per-screen rows in `docs/verification.md:30-39` | Shipped |
| P0-11 | Keyboard and non-colour access (spec:490-494) | G6, G7 | Shipped |

**Changes and additions from the research**

| # | Requirement | Acceptance | Status |
| --- | --- | --- | --- |
| P0-12 | **Ten at once.** The same instrument may run several parts, numbered `Trumpet 2`, `Trumpet 3`… Every surface names each one. | G9 | Open. Seen so far: four playing at once (`docs/verification.md:32`) and nine different musicians over one run, not all at once (`:81`). Ten at once has not been run. Claude Code allows 20 at once by default (`plans/…/acquired/sub-agents.md:1045`). |
| P0-13 | **Two-line Agent rows.** Line 1: `<Name> · <Role>`. Line 2: `└ <glyph> <tool> <target> [from vN] · <elapsed>` while playing; `✓ done · N measures · N reads · N writes · <time>` or `✕ failed · <first error line>` when finished. | G10; tmux capture of a ten-part run shows both lines for every musician, updating per tool call | Change (0.1.1 draws one label line above the row, spec S8) |
| P0-14 | **Agent rows for parallel starts.** Each parallel Agent call's row carries its musician's label. | tmux capture after one message starts four parts | Open. Claude Code 2.1.296 draws one `⏺ Agent(…)` row per parallel call (`…/others/claude/04-run-01.txt`), where 0.1.1 saw one summary row (`docs/verification.md:249`). Whether the mod can redraw these rows must be tested live. |
| P0-15 | **Band rollup and rows.** Line 1: `𝄐 Orchestra  N playing · N waiting on you · N done · N failed`, then `‼ N conflict` and `⚠ N stale` while open (zero counts omitted). Then one row per musician not yet done (glyph, name, current tool, target, elapsed), in assignment order, folding past `maxRows` into `… N more · /orchestra`. No digit hotkeys (spec S1). | G9 at 160×48 shows all ten rows; at 100×20 the fold row shows; done musicians are absent | Change (0.1.1 draws one wrapped line of chunks, spec S1) |
| P0-16 | **Ensemble tab as roster + details.** Two-line rows (P0-13 shape, plus the measures/reads/writes line); Enter opens details with part, versions seen, reads/writes with versions, last tool calls with times, answer, and the pointer to Claude Code's agent view. | Live key-driving in tmux | Change (0.1.1 has rows and details, spec S4, without the current-tool line or the call list) |
| P0-17 | **Pane key hints.** The pane's last row lists the keys of the focused tab. | Capture of each tab | Open |
| P0-18 | **Outcome line.** When the conductor's turn ends, one transcript line: `𝄐 Coda · N musicians · N files · N conflicts · N failed · <time> · /orchestra coda` | Its counts equal the coda file's (G4) | Change (0.1.1 logs a status sentence, spec S8) |
| P0-19 | **No motion.** Nothing in Orchestra animates. No frame timer; rows redraw on events. | Code has no timer driving redraws; a 60 s capture with no events shows identical frames apart from Claude Code's spinner | Open: violated today (`plugin/hooks/motion.js`, 250 ms timer) |
| P0-20 | **Theme-following colours.** Every token reaches at least 4.5:1 contrast on the terminal's own background, in dark, light, 256-colour and ANSI modes. The docked pane fill follows the detected dark/light theme. When the theme is unknown (`auto`, a custom theme, a failed read), Orchestra paints a docked pane with the theme's own `inverseText` colour, which the theme resolves to black or white, because Claude Code's grey fill cannot be cleared by a mod (anthropics/claude-code#100102); an inline pane, which has no fill, is not painted. | Contrast proof per mode; capture in each mode | Partly shipped: the dark/light switch is verified (`docs/verification.md:41`); truecolor and 256-colour were not observed (`:252`). Revised from spec:496 at the owner's request. |
| P0-21 | **No sound, speech, network, key, child process or browser** anywhere in the plugin or its docs | `plugin/.claude-plugin/plugin.json` has no voice or narration options; `/orchestra` has no `voice` argument; `plugin/narrate/` is gone; README and guide say none of these exist | Open: violated today. `userConfig` has `narrateCoda`, `voiceCoda`, `voiceId`, `voiceLanguage`, `voiceModel`; `/orchestra voice` exists (`register.js:1525`). |

### Should Have (P1)

| # | Requirement | Acceptance | Status |
| --- | --- | --- | --- |
| P1-1 | Hook time measured | Timings over a 500+ event run and on a resume of it; slowest well under 10 s | Open |
| P1-2 | A failing command recorded as failed even if the agent hides the exit code | Failure read from the Bash result; a failing command ending `; echo $?` is still `failed` | Open (`docs/verification.md:250`) |
| P1-3 | Files created by Bash appear in Artifacts, marked unattributed | A Bash-created file shows with no musician credited | Open (`docs/verification.md:251`) |
| P1-4 | Pane docked beside the transcript on a wide fullscreen terminal | Capture at ≥144 columns | Open (`docs/verification.md:253`) |
| P1-5 | Docs say only what is built | README, `docs/guide.md`, `docs/orchestra-prd.md`, `docs/orchestra-spec.md`, `docs/verification.md` match this PRD; no voice, narration, motion, browser or asset-acquisition text remains | Open |

### Nice to Have (P2)

These are started only if users ask for them.
- P2-1: Opt-in AI merge as a fourth conflict choice, off by default. The merged result is shown before it is written.
- P2-2: Agent-team teammates on the same roster. First, a live test of whether a mod sees teammates' tool calls.
- P2-3: Agents' decisions recorded in a set format, and listed in the coda.
- P2-4: Exact hashes for binary files.

---

## Technical Considerations

- **Mechanism.**
  - One Claude Code plugin: agents in `plugin/agents/`; a mod in `plugin/hooks/` (`register.js`, `ledger.js`, `views.js`, `palette.js`).
  - Mods require Claude Code 2.1.287 or later.
- **Where a mod can draw** (`e2e-evidence/…/canvas/report.md`, from `claude-code.d.ts`):
  - The band (`AbovePrompt`) holds at most half the terminal's rows and scrolls past `maxRows`. It is shared with other mods.
  - The pane docks beside the transcript from 110 columns once asked (144 if opened unasked), otherwise above the prompt. Tabs take keys only once the person focuses the pane.
  - `ToolUse` rows can be redrawn. Toast, status and log lines are plain strings and cannot be coloured.
  - Redraws are throttled to 10/s (30/s for the visible pane, the band and the hint line).
  - A mod cannot own the screen, open a child transcript, or rebind Tab, the arrows or Esc.
- **Elapsed time without a timer.** Elapsed times are computed at each redraw from the ledger's timestamps, so they advance only when events arrive. There is no frame clock (P0-19), because a hook does not re-run on a timer by itself (`…/canvas/report.md` §3e). How often ten musicians produce events is not yet measured; it is checked in the G9 run.
- **Single writer.** Only the mod writes the ledger. A per-file lock covers the time from the pre-write check until the write is recorded (`docs/verification.md:263`).
- **Derive, don't ask.** Conflicts, stale reads, handoffs, measures, current tool and the coda are folds over the ledger (`docs/orchestra-spec.md` §4.3).
- **Platform limits** (spec:684-692):
  - 10 s per hook;
  - 4 MiB per `$.fs` read and write;
  - `$.fs.write` is not atomic, hence the 500-event segments.
- **Reach.** Files only under the session's project. No processes, no network, no telemetry.
- **Ten at once.** Only eight agent colours exist (`docs/orchestra-research-report.md:327`), so the name and number (`Trumpet 2`) is the identifier and colour is secondary.

---

## Dependencies

- Claude Code 2.1.287 or later, with mods enabled. They are off under `allowManagedModsOnly`, `disableAllHooks` or `--safe-mode`.
- The user's existing Claude Code sign-in. Nothing else.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| The mod cannot redraw parallel Agent rows (P0-14) | M | The band and the Ensemble tab carry the same per-musician lines. The Agent rows then keep Claude Code's text, and the gap is recorded as a limitation. |
| The band's space is shared with other mods and small terminals | M | The rollup is always line 1, and the fold row points to `/orchestra`. The status line repeats the counts. |
| Elapsed times look frozen when no events arrive | L | They are labelled as times since the last call started. Claude Code's own list still shows its live elapsed time. |
| The mods API changes between Claude Code releases | H | Re-run the verification plan on each new minor version, and type-check against the shipped declarations. |
| Scope drift: features no spec asked for get built and documented as if required | H | This happened in 0.1.4–0.1.7. From now on, every feature needs a line in this PRD before it is built. |
| Research gaps: Amp's subagent rows were not seen; OpenCode's running and child views were not seen | L | The design rests on what omp showed live and OpenCode's source. Nothing in it depends on the unobserved parts. |

---

## Drift Register

Built after the approved spec; dispositions decided below.

| What was built | Version / commit | Spec position | Disposition |
| --- | --- | --- | --- |
| Spoken coda: ElevenLabs, MP3, `/orchestra voice`, `voiceCoda`/`voiceId`/`voiceLanguage`/`voiceModel`, `plugin/narrate/voice.mjs` | 0.1.6 `df05747`, 0.1.7 `b367064` | Contradicts spec:63 and the owner | **Remove** (P0-21) |
| `docs/asset-handout.md` (acquiring voices and keys) | 0.1.6 | Needs no external assets | **Delete** |
| Prototype updated with motion, and browser checks | 0.1.6, 0.1.7 | The prototype is the frozen Stage 2 artifact | **Freeze** `prototype/`; remove browser checks from docs |
| Narrated coda (`narrateCoda`, `plugin/narrate/narrate.mjs`, Agent SDK, `npm install`, child process) | 0.1.4 `85e68cf` | Not in spec; in tension with G4 | **Remove** (D1, P0-21) |
| Motion: 250 ms frame timer, baton, cycling notes, blink, pulse, handoff arrow, playhead and beat (`motion.js`; `views.js:71-74, 154-195, 284-291`) | 0.1.6, 0.1.7 | Reverses spec:495 | **Remove** (D2, P0-19) |
| Flat-black palette and pane fill (`palette.js`) | 0.1.6, 0.1.7 | Revises spec:496 at the owner's request | **Keep**, theme-following (D3, P0-20) |

---

## Decisions

- [x] **D1, 2026-10-12. Narrated coda: remove.**
  - Orchestra's coda comes from the record (G4). A model's retelling puts back the unchecked layer Orchestra removes, and it needs a dependency and a child process.
  - This supersedes the 2026-10-09 approval.
- [x] **D2, 2026-10-12. No motion of our own.**
  - The spec says "Orchestra draws no animation of its own" (spec:495).
  - Of the TUIs studied, Claude Code shows liveness with one spinner, while OpenCode runs two moving indicators.
  - Amp (`amp.terminal.animation`, `NO_ANIMATION=1`) and OpenCode (`animations_enabled`) let users turn animation off. lazygit lets users turn off one decorative effect (`animateExplosion`).
  - Orchestra relies on Claude Code's spinner. Its rows redraw only when events arrive.
- [x] **D3, 2026-10-12. The pane fill follows the terminal theme.** It is painted with a known background when the theme is known; when it is unknown, a docked pane is painted the theme's own `inverseText` (black or white as the theme resolves it) and an inline pane is not painted. Contrast is checked against that same background. Revised 2026-10-13 by the owner after the 0.2.0 build showed the engine's grey fill cannot be cleared.
- [x] **D4, 2026-10-12. The next release is 0.2.0.** Removing the voice and narration options and `/orchestra voice` breaks existing configurations.
- [x] **D5, 2026-10-12. Interaction design.** It follows the patterns in §User Experience, taken from omp (live), OpenCode (live rows, source for the rest) and Claude Code (live), within what a mod can draw (`docs/tui-research.md` §Decisions).

## Open Questions

- [ ] **P0-14.** Can the mod redraw each parallel Agent row in Claude Code 2.1.296? The answer comes from the first live run, not from the owner.

---

## Timeline

Relative only; nothing is scheduled.
- **0.1.1** (shipped 2026-10-06): baseline P0-1 to P0-11.
- **0.1.4–0.1.7** (shipped 2026-10-09 to 2026-10-12): the drift above.
- **0.2.0, after this PRD is approved**:
  - remove the drift (P0-19, P0-21);
  - interaction design (P0-13 to P0-18);
  - theme colours (P0-20);
  - ten at once proven live (P0-12);
  - docs truthful (P1-5).
- **After that**: P1-1 to P1-4.
- **Later**: P2 items, on user demand.

**Release rule** (`docs/orchestra-spec.md:211`): "Nothing is published before §10 passes or each failing row is documented as a stated limitation." Verification happens in the Claude Code TUI with tmux captures, never in a browser.

---

## Appendix

- Founding request: `plans/261005-1726-orchestra/original-request.md`
- Stage 1 research: `docs/orchestra-research-report.md` (vocabulary §e, unknowns §f)
- Stage 2 design artifact: `prototype/`, `docs/orchestra-prototype-design.md`
- TUI research: `docs/tui-research.md`. Evidence in `e2e-evidence/tui-research-20261012/`:
  - `omp/report.md`
  - `opencode/live.md`, `opencode/source.md`
  - `amp/report.md`
  - `others/claude/report.md`, `others/report.md`
  - `craft/report.md`
  - `canvas/report.md`
- Approved build spec: `git show 6d289ac:docs/orchestra-prd.md`
- Engineering spec: `docs/orchestra-spec.md`
- Verification record: `docs/verification.md`
