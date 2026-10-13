## Per-file audit

All four files are untouched. The PRD v2 line numbers are in `docs/PRD-orchestra.md` (cited as P:n).

| Path | Describes (file:line) | Alignment with PRD v2 | Contradicting lines | Disposition |
|---|---|---|---|---|
| `docs/orchestra-prd.md` (741 lines) | "Version 1.0, 2026-10-05. Target: Claude Code 2.1.289" (`:3`). That is the 0.1.1-era PRD; the PRD v2 header says v2 replaces the "0.1.1 product PRD". | **Superseded**, partly **contradicts**. Its text matches the 0.1.6–0.1.7 code on motion and palette, and PRD v2 reverses both. The voice and narration features never appear in it. | **Motion:** `:496` says Orchestra animates "baton, notes, pulse, handoff arrow… Score playhead and beat" on a 250 ms frame timer. That contradicts P0-19 and D2.<br>**Palette:** `:497` says the pane body is painted black or white, and `:676` says "The pane's ground follows the same mode". PRD v2 P0-20/D3 says paint only when the theme is known, and the new `unknown` mode paints nothing.<br>**Old band and rows:** `:90` says "a one-line, always-visible roster". `:381` says "Agent label line… above Claude Code's own Agent row". `:495` says "band and status line are single lines". These are the designs P0-13 and P0-15 change.<br>**Ensemble tab:** `:194-224` (S4) is the old block layout. P0-16 replaces it.<br>**Prototype and browser:** `:29`, `:31-38` and `:524-525` treat `prototype/` as the reference and as a deliverable, against the PRD v2 non-goal that the prototype is a frozen artifact.<br>**Version and number cites:** `:3-4` pin 1.0 / 2.1.289 / 6 tabs of status markers. PRD v2 now cites this file by line as "spec:…" at commit 6d289ac. The PRD v2 cites `spec:495`/`:496` for "no animation of our own" and the colour revision. In the working file those lines are "Screen readers" and "Motion (revised 0.1.6-0.1.7)". The citations are valid only against `6d289ac`. | **Freeze, mark superseded.** Add a banner that PRD v2 (`docs/PRD-orchestra.md`) is authoritative. Rewrite §2.12 (motion, contrast), §2.1 (S1), §2.4 (S4), §2.8 (S8), §3 file table (`:524-525`) and §6.4 (`:658-676`) only if the file stays in the tree (P1-5). Otherwise delete it. Do not rewrite the §2.x text in place. |
| `docs/orchestra-spec.md` (224 lines) | "draft… 2026-10-05" (`:3`), Claude Code 2.1.289 (`:4`, `:188`). Describes 0.1.1 as designed. | **Mostly stale, one contradiction.** It has no voice, narration, ElevenLabs or motion text at all (nothing matches those terms). It is the engineering spec PRD v2 builds on. It describes the old surfaces. | **Old one-line band:** `:126` shows the band as `𝄐 Orchestra  Trumpet ♪ 3 Edit  Trumpet 2 ✓ 4 …`. P0-15 replaces it with a rollup line plus one row per musician.<br>**Old status line:** `:127`. P0-15 and P0-18 change what the status line and outcome line carry.<br>**Old Ensemble:** `:128` describes one block per musician. P0-16 changes it to two-line rows.<br>**Old Agent row:** `:135` says "A line above Claude Code's row: `♪ Trumpet · Implementer · 3 measures`". P0-13 makes it two lines, with the current tool, target and elapsed time.<br>**Pane hints:** `:129`-`:131` list no key hints (P0-17).<br>**Prototype:** `:4`, `:156-168` (D-a..D-g) and `:213` (publish list includes `prototype/`). PRD v2 non-goals freeze it.<br>**Release rule:** `:211` is quoted by PRD v2 and stays valid.<br>**Status vocabulary:** `:174-182` (defects 1–9) and `:178` (segmented ledger "NOT DONE") are older than 0.1.7. PRD v2 P0 baseline says the segments shipped. | **Keep, rewrite sections** §6 (`:124-138`) to match P0-13..P0-18. Then revise §9 (`:170-182`) and §8 D-b/D-c (`:163-164`). Add a version and date header. Drop the prototype from §11 (`:213`). Keep §4, §5, §7 and §10 as written. |
| `docs/verification.md` (272 lines) | A multi-version record. 2026-10-05 / 2.1.289 (`:3`), then 0.1.1 to 0.1.7 sections (`:61`, `:103`, `:126`, `:163`, `:176`, `:189`, `:205`). Latest is 0.1.7 on 2026-10-12 with 2.1.296 (`:205-207`). | **Aligned as history; contradicts as a current statement.** PRD v2 P0 baseline cites `verification.md:27-41`, which still holds. | **Voice and ElevenLabs:** `:163-174` (0.1.4 narrated coda, `narrateCoda`, `plugin/narrate/`).<br>`:189`, `:199`, `:203`: 0.1.6 "spoken coda", real ElevenLabs API, [asset-handout.md](asset-handout.md).<br>`:205`, `:220-224`, `:228`: 0.1.7 "a voice that keeps its language" and the `/orchestra voice` checks.<br>**Motion:** `:189` heading ("motion, a flat-black palette"). `:195` baton, notes and pulse each 250 ms. `:201` motion in the prototype, checked in Chrome. `:214` `node .planning/contracts/motion.contract.mjs`. `:215` held note `♪━`, `:217` "bar 6, beat 2" and playhead.<br>**Browser:** `:201` ("Prototype in Chrome"), `:203`, `:225` and `:228` (prototype replay, "the browser was set aside").<br>**Palette:** `:197`, `:198` and `:218` record the black pane ground, as in PRD v2's drift register "Keep, theme-following" for D3.<br>**Limitation:** `:249` ("one summary row") is the P0-14 open question and still holds. | **Keep** the file as a dated record. **Mark superseded** the 0.1.4, 0.1.6 and 0.1.7 voice, motion and browser rows. Add a header note that 0.2.0 removes them. Add a "Version 0.2.0" section citing the live-run captures from slice F. Do not delete the history; PRD v2 P1-5 requires only that nothing claims these features are current. |
| `docs/plan-0.2.0.md` (261 lines) | "draft for owner review, revision 2" (`:3`). Describes 0.1.7 measured (`:9`) and the 0.2.0 build. Sources: `docs/PRD-orchestra.md` (P0-12..P0-21, P1-5, D1-D5) (`:3`). | **Aligned**, with the gaps listed below. | None on voice, motion or browser. The only matches are removal lists. | **Keep.** Fix the gaps in the next section before owner sign-off. |

## Plan coverage: P0-12..P0-21 and P1-5

| PRD item | Slice | Gate | Verdict |
|---|---|---|---|
| P0-12 ten at once, numbered | None | Live run (`:225`, 10 musicians, "every row named, no name truncated") | **Gate only; no slice owns it.** The live run only checks that the behaviour holds. |
| P0-13 two-line Agent rows | D `agentRow` (`:204`) | Live run, G10 timing (`:227`) | Mapped |
| P0-14 parallel Agent rows | D fallback (`:207`) | Open question (`:232`) | Mapped. The gate is W0's capture and is not in the §6 table. |
| P0-15 band rollup and rows | D `bandRows` (`:204`) | G9 sizes (`:226`) | Mapped |
| P0-16 Ensemble roster | D (`:204`) | Keys (`:228`) | Mapped |
| P0-17 key hints | D `keyHints` (`:204`) | Keys (`:228`) | Mapped |
| P0-18 outcome line | D `outcomeLine` + `:205` | Live run (counts equal coda file) | Mapped |
| P0-19 no motion | B | Idle test (`:224`) | Mapped |
| P0-20 theme-following | D `palette.js` `unknown` mode (`:206`) | Themes (`:229`) | Mapped. The slice does not say what happens to the painted pane ground. |
| P0-21 no voice, narration, network, browser | A | Removed-surface grep (`:223`) | Mapped. See gap 2 for the grep scope. |
| P1-5 docs truthful | E (`:209`) | **None** | **Unmapped gate.** E has no checklist. |

**Unmapped items:**
1. **P1-5 has no gate.** E is one clause in `:209`. The removed-surface grep (`:223`) covers only `README.md` and `docs/guide.md`. P1-5 names `docs/orchestra-prd.md`, `docs/orchestra-spec.md` and `docs/verification.md` too, and those still hold voice and motion text (see table above).
2. **Drift-register dispositions are not in any slice.** PRD:353-361 says to delete `docs/asset-handout.md`, freeze `prototype/` and remove browser checks from the docs. The plan names none of them. `asset-handout.md` exists in `docs/`.
3. **Three PRD acceptance items are not slice work or gates.** These are P0-21's "`/orchestra` has no `voice` argument", the `plugin.json` userConfig check, and "README and guide say none of these exist". Slice A covers the argument and the userConfig. The gate covers only a text grep.
4. **`.planning/contracts/` exists but is not in the repo at the repo root listing used by the plan's own paths.** `render-proof.mjs`, `palette-proof.mjs`, `motion.contract.mjs` and `prototype-replay.mjs` are present. The plan updates `render-proof` and `prototype-replay` but never says what happens to `prototype-replay.mjs` itself once `prototype/` is frozen.

## Citation spot-check (8 plus extras)

I checked every cite I could against the real files at 0.1.7.

| # | Plan cite | Real file | Result |
|---|---|---|---|
| 1 | `register.js:453` is the `$.ui.invalidate('ui.render')` in `recordIn` (`:95`, `:260`) | `register.js:453` | **Match**. `:452` is `syncMotion($)`. |
| 2 | `register.js:1614` ToolUse mark uses `note(view.frame…)` | `register.js:1614` | **Match** |
| 3 | `register.js:179-201`, `:181`, `:184`, `:1340` (timer, `interactive`, `moving`) | `:179` comment, `:181 let interactive`, `:184 moving()`, `:201`, `:1340 interactive = e.isInteractive` | **Match** |
| 4 | `register.js:509-510`, `:517-610`, `:1524-1531`, `:1332-1338`, `:1342` (voice/narration) | `:509 narrateCoda`, `:510 voice.on`, `:517` comment, `:610`, `:1525 voice`, `:1531`, `:1332`, `:1338`, `:1342` | **Match**. The branch starts at `:1525`; `:1524` is its comment. |
| 5 | `views.js:380-410` (`narrationBlock`, `voiceBlock`) | `views.js:380`, `:381`, `:396`, `:410` | **Match** |
| 6 | `views.js:71-74`, `:154`, `:183`, `:214`, `:5` | `:71 glyphOf`, `:154 stage`, `:183 handoffLine`, `:214 seat`, `:5 import` | **Match** |
| 7 | `motion.js:79-82` (`liveHandoff`), `:86-90` (`travel`) | `motion.js:79 liveHandoff`, `:86 travel` | **Match** |
| 8 | `register.js:1349-1353`, `:1350` (theme timer, theme read fails) | `:1349 themeTimer?.cancel()`, `:1350 $.clock.every`, `:1353 themeFailed = true` | **Match** |
| 9 | `palette.js:93-98` (`modeFor` always resolves) | `palette.js:93-98` | **Match** |
| 10 | Plan size table (`:15-22`): 1619, 649, 411, 142, 98, narrate 217, tests 47 | `wc -l`: 1619, 649, 411, 142, 98, narrate `.mjs` 57+160=217, tests 47 | **Match** |

**Mismatches found: none in the code cites.** I did not verify:
- `register.js:51-53`, `:133-144` and `:172-177` line by line. Their comments match the narration and voice state described.
- `render-proof.mjs:55-75`. I read only `:55`. It is a "band moves between frames" comment, which fits.
- `verification.md:122`. It is the "forcing the conflict" limitation paragraph, which fits only loosely as the "forced conflict" cite in the live-run gate.

## Cross-file note: PRD v2's own line cites

PRD v2 cites `spec:495`, `spec:496`, `spec:63`, `spec:58` and `spec:19-25` against the 6d289ac commit of `docs/orchestra-prd.md`. In the current working file those lines read differently:
- `:495` is "Screen readers".
- `:496` is "Motion (revised 0.1.6–0.1.7)".
- `:63` is "no accounts, keys or network services".

So the D2 cite "spec:495, Orchestra draws no animation of its own" is correct only against that commit. After freezing `orchestra-prd.md`, add the commit hash next to those cites. The PRD header already names 6d289ac (`PRD-orchestra.md:11-13`).