# Product Requirements Document: Orchestra

**Author**: krzemienski
**Date**: 2026-10-06
**Status**: Draft (product-level). Version 0.1.1 built, verified and published.
**Stakeholders**: krzemienski (repository owner, product owner, approver). No other stakeholders are named in the project documents.

**How this document relates to the others.** This is the product view: the problem, the users, the value, what success means, and what comes next. The screen-by-screen build spec is `docs/orchestra-prd.md`, the engineering spec is `docs/orchestra-spec.md`, and the record of what was proven in real runs is `docs/verification.md`. Where they disagree on status, `docs/verification.md` wins.

---

## 1. Executive Summary

Orchestra is a Claude Code plugin for developers who run several AI subagents on one project at the same time. It shows, live in the terminal, who is working, which files each agent read and changed, and where two agents clashed. It stops an agent from silently overwriting newer work and asks the user instead. It became possible only recently: Claude Code 2.1.287 added "mods", which let a plugin draw inside the terminal and hold a tool call while it asks the user.

## 2. Background & Context

### The problem

Claude Code can run many subagents in parallel. When it does, the person in charge loses track of the work:

1. **They can't see what moved.** A subagent hands back only a final message. Nothing shows which files it read, which it changed, or whether it used another agent's output.
2. **Work gets overwritten silently.** Claude Code checks that an agent has read a file before editing it, but only within that one agent's own conversation. If agent A reads a file, agent B changes it, and then A edits it, A's edit can wipe out B's change with no warning. Agent teams lock tasks, not files.
3. **The summary can't be trusted.** At the end, the main agent sums up from the subagents' own prose. Nothing checks that summary against what actually happened to the files.

### What exists today

Research covered official docs, community plugins and other coding tools (`docs/orchestra-research-report.md`, sections b and c).

- **Status is mostly solved.** Claude Code's agent panel, `claude agents` and `/workflows` already show which agents are busy, waiting or done. Community tools (Claude Squad, CCManager, oh-my-claudecode's HUD, the `ruflo-swarm` mod) add status, diffs and kanban boards.
- **Provenance is not.** No surveyed tool connects "who read which version" to "who changed it". None shows how the lead combined its workers' results. That gap is Orchestra's reason to exist.
- **Outside tools can't draw inside Claude Code.** Tmux wrappers, desktop apps and web dashboards (such as `disler/claude-code-hooks-multi-agent-observability`) live outside the terminal session the developer is using.

### Why now

Mods shipped in Claude Code 2.1.287. A mod is a plugin hooks module that sees every subagent's tool calls with the subagent's id. It can hold a write and ask a question, and it can draw a pane, a band above the prompt, a status line, toasts and labels on tool rows. Before mods, a plugin could record events but could not draw inside the session or ask mid-write.

### How we got here

| Stage | Output | State |
| --- | --- | --- |
| 1. Research | `docs/orchestra-research-report.md` | Done |
| 2. Prototype | `prototype/`, `docs/orchestra-prototype-design.md` (scripted, browser-based) | Approved by the owner |
| 3. Build and verify | `plugin/`, `docs/orchestra-spec.md`, `docs/verification.md` | Built; verified in real runs on 2026-10-05 |
| Publish | Public repo `krzemienski/orchestra-cc` | 0.1.0 pushed 2026-10-06; 0.1.1 (never-read fix and code-review fixes) pushed the same day; 0 stars at time of writing |

## 3. Objectives & Success Metrics

**Goals**

1. **Visibility.** Every subagent the conductor starts appears by its instrument name, with its state and current tool, within one redraw.
2. **Provenance.** Every file read and write by a subagent is recorded with the SHA-256 of the file at that moment.
3. **Safety.** A write based on an outdated version of a file never lands silently. It is held and the user decides, or it is sent back in headless runs.
4. **An honest result.** The end-of-turn summary (the "coda") is computed from the record, not from the agents' own words, and it matches across every place it is shown.
5. **No harm.** Orchestra never blocks or breaks Claude Code. If its hooks fail, the tool call still runs.
6. **Access.** Everything works from the keyboard, and no state is shown by colour alone.

**Non-Goals**

1. **Automatic merging of two agents' versions of a file.** A bad automatic merge would corrupt the file with no warning. The user chooses instead.
2. **Agent teams** (split-pane teammates in separate processes). Teams are experimental, don't lock files, and may not be visible to a mod.
3. **Replacing Claude Code's agent panel, `/tasks` or agent view.** Those already show status well.
4. **Drawing in VS Code, `claude -p` or cloud sessions.** Mods run there but can't draw. Orchestra still records and guards in those places.
5. **Isolating agents in separate worktrees.** Orchestra watches one shared working tree. Tools like Claude Squad already cover worktree isolation.

**Success Metrics**

Quality metrics come from real runs. Adoption metrics have no history yet. Their targets are proposals for the owner to confirm (see Open Questions).

| Metric | Current | Target | Measurement |
| --- | --- | --- | --- |
| Conflicting writes that land without a decision | 0 across runs 1–4, the headless run and the never-read fix check | 0 in every release's verification run | Scripted two-agent conflict run; the ledger must show `conflict.resolved` for each held write |
| Agents shown as `Guest` instead of an instrument | 0 across 5 replayed ledgers (172, 115, 143, 59, 48 events) | 0 | Replay each run's ledger with `fold()` |
| Recorded hash equals the real file hash | Matched for all text files checked in run 1 | 100% for text files | Compare ledger versions with `shasum -a 256` and `git show` |
| Coda counts agree across Coda tab, `/orchestra coda` and the coda file | Agreed in run 1 | Agree in every verification run | Capture all three for the same session |
| Slowest Orchestra hook, per event | **Not measured** | Under 1 s typical, never near the 10 s hook budget | Time hooks in a long run, including a resume with a large ledger |
| Install from the published repo succeeds in a clean config | **Not in the verification record** | Both commands exit 0, then J2 passes | `claude plugin marketplace add krzemienski/orchestra-cc` and `claude plugin install orchestra@orchestra-cc` in an empty `CLAUDE_CONFIG_DIR` |
| GitHub stars | 0 (2026-10-06) | Proposed: 50 within 90 days of the first announcement | GitHub repo page |
| Issues opened by people other than the owner | 0 | Proposed: 5 within 90 days, as a sign of real use | GitHub issues |

Orchestra adds no telemetry or network calls, so install counts and active use can't be measured directly. Stars and outside issues are the stand-in.

## 4. Target Users & Segments

Segments are defined by the job the person is trying to get done.

| Segment | Their job | Today's workaround | What Orchestra gives them |
| --- | --- | --- | --- |
| **The lead running parallel agents** (primary) | "Let several agents work on my repo at once, and still trust what comes out." | Run agents one at a time, or read every diff afterwards and hope nothing was overwritten | A live roster, a hold on stale writes, and a coda backed by the record |
| **The reviewer after the fact** | "Tell me who changed what, from which version, and what went wrong." | `git diff` plus reading each agent's final message | The coda file, and the Artifacts tab with every version, author, base and reader |
| **The headless or scripted runner** | "Run an agent pipeline with `claude -p` and keep it from clobbering itself." | Nothing. Overwrites go unnoticed | The ledger and coda files, and conflicts sent back automatically with no UI |

**Who can use it.** People already using Claude Code 2.1.287 or later in a terminal or the Desktop app's Code tab, who already have Claude Code sign-in. Orchestra adds no accounts, keys or services.

**Constraints on the market.**
- Mods must be on. An organisation's `allowManagedModsOnly`, a user's `disableAllHooks`, `--safe-mode` or a remote rollout flag can turn them off. The agents still work, but nothing is recorded or drawn.
- The pane opens by itself only in terminals at least 144 columns wide. Narrower terminals rely on the band and status line, plus `/orchestra`.
- Segment sizes are unknown. The research found large interest in multi-agent Claude Code tooling (for example `obra/superpowers`, `wshobson/agents` and `oh-my-claudecode`, each with tens of thousands of stars), but that is not a count of Orchestra's users.

## 5. User Stories & Requirements

"Status" cites `docs/verification.md`. "Shipped" means it's in the published repo.

**P0 — Must Have (first version)**

| # | User Story | Acceptance Criteria | Status |
| --- | --- | --- | --- |
| P0-1 | As a lead, I want to install Orchestra from GitHub, so I don't have to clone anything. | `claude plugin marketplace add krzemienski/orchestra-cc` and `claude plugin install orchestra@orchestra-cc` both succeed; `/plugin` lists `orchestra` with one active mod | Shipped; **install from the published copy not yet in the record** |
| P0-2 | As a lead, I want to start a session led by the conductor. | `claude --agent orchestra:conductor` shows `@orchestra:conductor`; `/orchestra` opens the pane showing "No performance yet." | Shipped, verified |
| P0-3 | As a lead, I want to see every agent's name, state and current tool while they work. | Band, status line and Ensemble tab update on every event; independent parts run in parallel; zero `Guest` names | Shipped, verified |
| P0-4 | As a reviewer, I want every read and write recorded with its version. | Each read and write has the agent, path and SHA-256; versions are numbered from v0; the Artifacts tab shows author, base, line counts and hash per version | Shipped, verified |
| P0-5 | As a lead, I want a stale write held so I can decide. | The dialog names both agents and versions; offers *Let it write*, *Send it back to re-read*, *Show both versions*; the outcome is recorded | Shipped, verified (both outcomes) |
| P0-6 | As a lead, I don't want to be asked a question whose only answer fails. | If the writer never read the file, no dialog appears; the write is sent back with the reason; the agent reads and reapplies | Shipped in 0.1.1, verified live 2026-10-05 (ledger events 122 and 133) |
| P0-7 | As a headless runner, I want conflicts handled with no one to ask. | Under `claude -p`, a conflict is recorded as `reread` and sent back; ledger and coda files are written | Shipped, verified |
| P0-8 | As a lead, I want a combined result built from the record. | Coda tab, `/orchestra coda` and `.orchestra/performances/<session>-coda.md` show the same task, contributors, conflicts, failures, stale reads and handoffs | Shipped, verified |
| P0-9 | As a lead, I want to be told when an agent worked from an outdated file. | A stale-read toast and mark appear; the mark clears when the work is redone from the current version | Shipped, verified |
| P0-10 | As a lead, I want the state back after a restart. | After `claude --continue`, the band and status line match their state before the restart | Shipped, verified |
| P0-11 | As anyone with mods turned off, I want the agents to still work. | With `disableAllHooks: true`, agents run and nothing errors; nothing is recorded | Shipped, verified |
| P0-12 | As a keyboard or screen-reader user, I want full access. | Keys 1–4, Tab, Enter and Esc reach every tab, row and option; every coloured state also has a glyph and a word | Shipped, verified |

**P1 — Should Have (next version)**

| # | User Story | Acceptance Criteria |
| --- | --- | --- |
| P1-1 | As a lead, I want proof the version I install is the one that was verified. | J1 and J2 run against the published 0.1.1 in a clean config and recorded in `docs/verification.md` |
| P1-2 | As a lead, I want proof Orchestra won't slow Claude Code. | Hook times measured in a run over 500 events and on a resume of that ledger, and recorded |
| P1-3 | As a lead, I want a failing test to show as failed even if the agent hides the exit code. | Failure is read from the Bash result's own exit status, not from agent instructions; a command ending in `; echo $?` that fails is still recorded as failed |
| P1-4 | As a reviewer, I want files that agents create with shell commands recorded too. | A file created by Bash during a part appears in the ledger with an author (or marked uncertain when calls overlap) |
| P1-5 | As a lead on a wide fullscreen terminal, I want the pane beside the transcript. | Sidebar placement captured and checked in a fullscreen terminal ≥144 columns |
| P1-6 | As a reviewer, I want the docs to say what is actually built. | `docs/orchestra-spec.md` no longer marks built items as NOT DONE; the status columns match `docs/verification.md` |

**P2 — Nice to Have / Future**

| # | User Story | Acceptance Criteria |
| --- | --- | --- |
| P2-1 | As a lead, I want an opt-in AI merge as a fourth conflict choice. | Off by default; the merged result is shown before it is written; the ledger records the merge and both bases |
| P2-2 | As a lead using agent teams, I want teammates on the same roster. | A live test first shows whether a mod sees teammates' tool calls; if so, they appear and are guarded |
| P2-3 | As a reviewer, I want agents' decisions recorded, not just their file changes. | Agents record decisions in a set format; new agents receive the decision log; the coda lists decisions |
| P2-4 | As a reviewer, I want exact hashes for binary files. | Binary file hashes equal `shasum -a 256` |
| P2-5 | As a lead, I want instrument labels when several parts start at once. | Blocked: Claude Code draws one summary row that mods can't redraw. Revisit if Claude Code adds a render site |

## 6. Solution Overview

### What the user experiences

1. Install the plugin. Start Claude Code with `claude --agent orchestra:conductor`.
2. Describe a task. The conductor writes a plan to `.orchestra/score.md` and starts parts. Independent parts start together, so they run in parallel.
3. While musicians work, the band, status line and pane show who is playing, the tool each is running, files read and written, handoffs, stale reads and failures.
4. If a musician tries to overwrite newer work, Orchestra holds the write and asks in Claude Code's own question dialog.
5. When the conductor's turn ends, Orchestra writes the coda from the record.

### The parts

| Part | What it does |
| --- | --- |
| Conductor agent | The session's main agent. It plans, assigns parts and presents the coda. It does not do the musicians' work |
| Five musician subagents | Violin (scout), Trumpet (implementer), Flute (scribe), Timpani (tester), Cello (reviewer). Each has limited tools. The scout and reviewer cannot edit |
| Mod | Records every event to the ledger, guards writes, and draws the pane (Ensemble, Score, Artifacts and Coda tabs), band, status line, toasts, spinner text and Agent row labels |
| Ledger | One append-only record per session in `.orchestra/performances/`, split into 500-event segments. Every view is computed from it, and it can be replayed outside Claude Code |

### Key design decisions

- **Derive, don't ask the agents.** Conflicts, stale reads, handoffs and the coda are computed from observed reads and writes. Agents never declare them.
- **One writer.** Only the mod writes the ledger, so two processes never write the same file. A per-file lock covers the time from the pre-write check until the write is recorded.
- **Ask in the native dialog.** Conflicts use Claude Code's own question dialog, not a custom screen.
- **Fail open.** If an Orchestra hook fails, Claude Code skips it and the tool runs. Safety features never become a reason the user's work stops.
- **Changes from the approved prototype.** The conflict choices are *Let it write* / *Send it back* / *Show both versions* rather than "conductor merges". There is no separate inspector sidebar, progress counts measures without a total, and the conductor is started with `--agent` rather than taking over every session. The reasons are in `docs/orchestra-spec.md` §8.

### Assumptions (believed, not proven)

| Assumption | Why it matters | How to test |
| --- | --- | --- |
| Installed-plugin mods load for most users | The 2.1.289 binary has a remote rollout flag for installed mods. It was on for the owner's account. Others may differ | Ask early users to report whether `/plugin` shows one active mod |
| Developers want provenance, not just status | It is the gap the research found, but no user has asked for it yet | Outside issues and feedback after the announcement |
| The mods API stays stable enough | The published types lag the docs, and recent releases are mostly mod fixes | Re-run verification on each new Claude Code minor version |
| Agents follow their instructions (re-read before editing, don't hide exit codes, create files with Write) | Several limitations rely on these instructions, and a model can ignore them | P1-3 and P1-4 remove the two most important of these |

## 7. Open Questions

| Question | Owner | Deadline |
| --- | --- | --- |
| The plugin is `0.1.1`, but `docs/orchestra-prd.md` calls its spec "Version 1.0". Should the spec version and the plugin version be aligned? | krzemienski | Before the next minor release |
| Brand risk: getorchestra.io sells "Orchestra Runtime" for AI agents, and at least six GitHub repos are named Orchestra. No trademark check was done. Keep the name? | krzemienski | Before any public announcement |
| Are the proposed adoption targets (50 stars and 5 outside issues within 90 days) right, and where will Orchestra be announced? | krzemienski | Before the announcement |
| Is agent-teams support (P2-2) wanted, given teams are still experimental? | krzemienski | When planning the version after next |

## 8. Timeline & Phasing

Relative timeframes only. Nothing here is scheduled yet.

| Phase | Contents | Rough size | Depends on |
| --- | --- | --- | --- |
| **0.1.0 (shipped)** | P0-1 to P0-12 except P0-6, published to `krzemienski/orchestra-cc` | Done | — |
| **0.1.1 (shipped)** | P0-6, plus nine fixes from an independent code review | Done | — |
| **Next version** | P1-1 to P1-6: J1/J2 from the published copy: hook timing, exit codes from the real result, Bash-created files, sidebar check, doc status cleanup | A few weeks | — |
| **Later** | P2 items, each started only if user feedback asks for it. P2-2 waits for a live test of mods and agent teams. P2-5 waits on Claude Code | Open | Adoption signal; Claude Code changes |

**Release rule (carried over from the engineering spec).** A version is published only after every row of the verification plan in `docs/orchestra-spec.md` §10 passes in a real run, or each failing row is written down as a known limitation.
