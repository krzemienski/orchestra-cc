# Changelog

## 0.2.0 (2026-10-13)

Orchestra returns to what it was approved to be: a picture of how agents relate, drawn only in the Claude Code terminal, redrawn only when an event arrives. Requirements: `docs/PRD-orchestra.md` (PRD v2), P0-12 to P0-21 and P1-5. Verification: `docs/verification.md`, "Version 0.2.0".

### Breaking

- Removed the narrated coda and the spoken coda: the options `narrateCoda`, `voiceCoda`, `voiceId`, `voiceLanguage` and `voiceModel`, the `/orchestra voice` command, and `plugin/narrate/` (the Agent SDK narrator and the ElevenLabs helper). Orchestra now starts no process and makes no network call. Settings that name the old options are ignored.
- `/orchestra` with an unknown argument answers `Unknown argument: <arg>. Use coda, ledger or close.` instead of opening the pane.

### Removed

- All of Orchestra's own motion: the 250 ms frame timer, the baton, cycling notes, blinking waits, the pulse, the cue and joining/resting steps, the travelling handoff arrow, the activity meter, and the Score's held notes, playhead and beat. Claude Code's spinner shows that work is happening.
- The Ensemble tab's event ticker.

### Added

- Numbered musicians (`Trumpet`, `Trumpet 2`, …), the same name on every surface for the whole session; checked live with ten musicians at once.
- A second line for every musician: `└ <tool> <target> [from vN] · <elapsed>` while playing, `done · N measures · N reads · N writes · <time>`, or `failed · <first error line>`.
- The band: a rollup line with zero counts left out, then one row per musician not yet done, folding into `… N more · /orchestra`.
- The Ensemble tab as a roster with details: part, versions seen, reads and writes with versions, last calls with times, answer, and a pointer to Claude Code's agent view.
- Key hints on the pane's last row, per tab.
- The outcome line at the end of the conductor's turn: `𝄐 Coda · N musicians · N files · N conflicts · N failed · <time> · /orchestra coda`.
- An `unknown` colour mode: when the theme cannot be read or named, Orchestra paints no background.

### Fixed

- A musician running two calls at once showed its part brief once the first ended.
- A part that ended with a failed call still counted as done.
- Events from loops outside the roster (Claude Code's own forks) re-timed and redrew Orchestra's rows.
- A failed call by an engine loop toasted as a `Guest` failure.
- Parts started together had no labelled Agent row: Claude Code draws several Agent calls from one message as one block a mod cannot draw into. The conductor now starts each background part in its own message.
- Under an ANSI theme on a truecolor terminal, Orchestra's colour names were drawn as 24-bit colours. ANSI and unknown themes now use Claude Code theme keys, which an ANSI theme draws as 16-colour codes.
- Under `auto` or a custom theme a docked pane showed Claude Code's grey fill. It is now painted the theme's `inverseText`, black or white as the theme resolves it.
- At 100×20, while Claude Code lists running agents, the band gets no rows; the status line now carries the rollup and `… N more · /orchestra`, and the row above the conflict dialog is the band's rollup, short enough for 100 columns.

### Known limitations

- Parts a person explicitly asks to start in one message share one Agent block that a mod cannot label.

## 0.1.7 and earlier

See `git log` and the history sections of `docs/verification.md`.
