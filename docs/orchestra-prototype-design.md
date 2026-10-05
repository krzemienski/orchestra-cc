# Orchestra prototype: design notes (Stage 2)

Location: `prototype/` in this repository (created fresh; the workspace was empty). Nothing outside the repository was modified.

Run it:

```sh
cd prototype && python3 -m http.server 8742 --bind 127.0.0.1
# then open http://127.0.0.1:8742/index.html
```

The page is plain HTML, CSS and ES modules with no build step. It plays a scripted performance. Every musician, file and test result in it is illustrative design data, not output from a real Claude Code run.

## What the prototype shows

A conductor is given one task: "Add rate limiting to the /upload endpoint and document it". It writes a score and assigns parts to five musicians:

| Musician | Role | Part |
| --- | --- | --- |
| First Violin | Scout | Maps the request path and hands a notes file to two others |
| Viola | Config | Edits `config/limits.json` |
| Trumpet | Implementer | Writes the middleware, edits the route, then fixes a failing test |
| Flute | Scribe | Documents the limits and refreshes the doc after a stale read |
| Timpani | Tester | Runs the suite, fails once, hands the log back, re-runs green |

During the run you see:
- parallel work (up to three musicians playing at once);
- handoffs that carry an artifact;
- a stale-read warning;
- a write-write conflict that stops the ensemble and asks you to choose;
- a failed test run with its recovery;
- a second stale read;
- a coda that presents the combined result.

You can play, pause, step, step back, scrub the timeline, change speed, choose any of the three conflict resolutions, and replay with a different choice. A toggle labels every region with the Claude Code mod surface that would draw it.

## Design choices and their research basis

Research references point to sections of `docs/orchestra-research-report.md`.

1. **Orchestra lives inside the Claude Code terminal, on the surfaces a mod can actually draw.** These are a pane beside the transcript, a band above the prompt, toasts, a status line, redrawn tool rows and spinner, and the question dialog. The prototype draws nothing else. Basis: (a) mods are an official plugin type that draws at named render sites; (c) "What does not transfer": OpenCode's session tree and Pi's free-form overlays cannot be copied.
2. **The pane follows Claude Code's narrow-terminal rule.** Below 860 px the pane moves under the transcript, as Claude Code moves a pane above the prompt in a narrow terminal. Basis: mods interface docs.
3. **A roster with a count summary and one activity line per musician.** This is the Ensemble tab and the band above the prompt. Basis: (c), the Claude Code agent view's grouped list with counts, and Claude Squad's instance list. Rows carry a word and a glyph as well as a colour, so status is not colour-only.
4. **Tool rows are prefixed with the instrument.** An example is `⏺ Trumpet · Edit(config/limits.json)`, with one dim result line. Basis: (c), the "one dim line per tool" convention in OpenCode, plus the ToolUse redraw site.
5. **Handoffs are first-class events.** Each names the sender, the receiver, the artifact and its version, and the brief. They show as a log line, a toast, and arrows on the Score. Basis: (c) found visible handoffs are rare and called that out as a gap.
6. **One append-only ledger; every view is folded from it.** The Inspector shows the latest ledger entry, and scrubbing re-folds a prefix of the log. Basis: (d), Google ADK's event-applied state and LangGraph's replay. The community lane found that the hooks → event log → view pattern works.
7. **Provenance is tracked per artifact version.** Each version records its author, base version, line delta and content hash. Each read records who read it, which version, and when. Basis: (d) and (b), which found that no surveyed tool joins "who read what" to "who changed it".
8. **Conflicts and stale reads are derived, not declared.**
   - A write-write conflict is flagged when a musician writes from a base older than the current version, and someone else authored that current version.
   - A stale read is flagged when a musician used an older version to produce other work.

   Basis: (d). Claude Code's read-before-edit check is per conversation. Agent teams lock task claiming but not files. Cognition's "implicit decisions" point argues for recording what each agent actually saw.
9. **The conductor asks you through the question dialog.** This is the same place Claude Code asks questions. Basis: AskUserQuestion is a mod render site.
10. **The coda is computed from the ledger, not from musicians' prose.** It covers contributions per musician, the artifacts changed, and each incident with how it ended. Basis: (d) on subagents returning only a final message, and Anthropic's advice to pass references to stored artifacts instead.
11. **Orchestral vocabulary maps onto real states.**

    | Term | Meaning |
    | --- | --- |
    | part | Assigned task |
    | measure | Progress step |
    | tacet | Not started |
    | tuning | Assigned, starting |
    | playing | Working |
    | waiting | Blocked or asking |
    | coda | Combined result |
    | score | Plan plus timeline |

## Visual constraints honoured

- The page background is pure white in light mode and near-black in dark mode, never cream or off-white. The terminal stays dark in both, as a real terminal does.
- Headlines are not italic, and section labels are not numbered.
- Labels, headings, buttons, the pane tabs, the question options and the inspector use Inter (sans-serif). Monospace is used only for the terminal's transcript text and the raw ledger line, which emulate terminal output. In a real terminal, a mod's tabs and buttons will render in the terminal's own font; that is a property of the terminal, not a design choice.
- Buttons have 6 px corners, not pills.

## Limitations

- The coda headline is computed from the ledger: the newest test log, open stale reads and open conflicts.
- The data is scripted. The prototype proves the interaction design and the derivation rules (version-based conflict and stale-read detection, coda from the ledger), not a live integration. Nothing here talks to Claude Code.
- Content hashes are FNV-1a over a synthetic string. They stand in for the SHA-256 of file content that a real build would take.
- Line counts and test results are invented.
- The terminal is an HTML emulation. Real mod rendering has fixed character cells, real widths (a pane is narrower) and Claude Code's own colours. Glyph rendering (♪, ‖, 𝄐, ▮) depends on the terminal font.
- One scenario and one conflict type are shown. Lease violations, conflicting decisions, and uncertain Bash attribution under concurrency are described in the report but not demonstrated.
- The Score tab shows a sliding window of the last 30 events.

## Assumptions carried into Stage 3

These are unresolved; see (f) in the research report.

- Installed-plugin mods load for this account. The 2.1.289 binary contains a rollout-flag gate for installed plugins' hooks modules, so this must be tested first.
- Mod tool-call events attribute each call to a subagent through `agentId`, as the published types say.
- Musicians are subagents, not agent teams. Teams are experimental and do not lock files.
- The mod is the single ledger writer. Fallback settings hooks would need an append-safe path.
- The public destination for Stage 3 is not established. `gh` is logged in as `krzemienski`, but the repository name and visibility need your confirmation. Many "orchestra" names are taken.
