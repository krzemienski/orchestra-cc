## Prompt Rating — docs/build-prompt-0.2.0.prompt.md
Overall: 75/100 — needs-work

Rated against `docs/PRD-orchestra.md` (PRD v2) and `docs/plan-0.2.0.md` (revision 3, 278 lines). The prompt was not edited. Nothing was run; the test cases below are dry-runs.

| Dimension        | Score | Notes |
|------------------|-------|-------|
| Clarity          | 15/20 | The goal, source-of-truth order (prompt:12) and slice order are clear. Two internal contradictions cost points. (a) Prompt:7 gives the order `W0 → B → A → C → D → F → E → G` as a serial chain, but step 4 (prompt:36) says C runs in parallel with B and A. (b) Prompt:36 omits the plan's dependency: B moves `elapsed`, `activity`, `lastCall`, `eventText`, `recent` and `liveHandoff` into `ledger.js` (plan:166-168), while C is "ledger.js only", and plan:205 says "Owner 1 adds B's moved helpers after C lands". Read literally, B cannot finish before C, and the prompt tells the agent B comes first. |
| Specificity      | 11/15 | Names, glyphs, strings and pass criteria are exact (prompt:78, 83, 103). Gaps: the "scripted conductor prompt" and the "fixture git repo" are never written out (prompt:76-77). The prompt never says how to force the theme read to fail (PO-5, prompt:97). It never says how to extract "Orchestra's rows" for the byte-identity diff (PO-4, prompt:92). `bun/tsx tests` (prompt:59) names runners that do not exist. The repo has one `plugin/tests/ledger.test.ts`, run by `claude plugin test`. |
| Structure        | 13/15 | All required tags in the SKILL §0.5 table are present: task, context, skills_to_activate, mcp_tools, sequential_thinking, todos, authorization, constraints, output_contract, validation, example. Tags are balanced. Deductions: `<proof_obligation id=… blocking=…>` is an invented tag with no stated reason (0.5: "no invented tags… without a stated reason"). The XML is wrapped in a markdown fence with a prose preamble (prompt:1-5). `<example>` shows only a verdict row, not a worked input/output for a proof obligation (prompt:114-118). |
| Output contract  | 11/15 | Commits, evidence dir, `requirement-map.md`, `docs/verification.md` section and final table are defined (prompt:64-70). Defects: (1) paths conflict with the plan (see D6). (2) `e2e-evidence/` is gitignored (`.gitignore:4`), and `docs/orchestra-spec.md:216` and `verification.md:7` say these captures are never published. Yet P1-5 requires README, the guide and `verification.md` to "cite a named F capture" (plan:241). The contract does not say how a clone verifies a cite. (3) "A final report… and nothing else" (prompt:69) conflicts with the LIMITATION and ask-owner paths (prompt:50, 111). (4) The `<ISO-compact>` example `20261014T1010` (prompt:116) has 4 time digits. `fresh_evidence.py:52` emits `%Y%m%dT%H%M%S`, 6 digits. |
| Edge-case cover  |  8/15 | Covered: P0-14 unknown (prompt:34, 60), W0 gates that must fail, version check, failing gates ("never relax"). Not covered: clean-config authentication (D3), dirty-tree baseline (D7), P0-14 "No" branch inside PO-1 (D2), `replay.mjs` breakage (D5), ansi/unknown contrast (D8), no owner reachable for `git push` (D9), nondeterministic LLM-driven live runs and flake budget. |
| Testability      |  8/10 | Fixed pass criteria, a requirement-to-gate map, a good/bad verdict example and "pass criteria fixed before capture" are strong. Lost points: PO-1 hard-codes Agent-row line 2 as a pass condition, though PRD:340 and plan:233 allow a fallback (D2). Step 1's stop-condition is ambiguous (D4). |
| Token efficiency |  9/10 | 119 lines. Little dead weight. Some restatement of PRD requirements inside PO-1 (prompt:78) duplicates PRD:276-281. |

## Fact check (every cite read against the files)

Verified correct:
- Paths exist: `plugin/hooks/{register,ledger,views,palette,motion}.js`, `plugin/narrate/` (4 tracked files plus untracked `node_modules`), `.planning/live/{record.sh,ansi2png.py,replay.mjs}`, `.planning/contracts/{motion.contract,palette-proof,prototype-replay,render-proof}.mjs`, `.planning/docs-audit/audit-a.md`, `prototype/`, `README.md`, `docs/guide.md`, `plugin/.claude-plugin/plugin.json`.
- `plugin.json:3` is `"version": "0.1.7"`. `CHANGELOG.md` does not exist yet, as the plan says (plan:218).
- `claude --version` is 2.1.296, as the prompt says (prompt:16). tmux, node and gh are installed. The remote is `krzemienski/orchestra-cc`.
- Commit `6d289ac` exists.
- `PRD:340` is exactly the P0-14 risk row and mitigation. `PRD:8-12` is the owner's statement. The PRD:344 "every feature needs a line in this PRD" quote is accurate. D2, G5, G7, G9, G10 and the P0-12 to P0-21 and P1-5 ids all exist.
- Plan slice order matches prompt:7 and the plan:153-163 flowchart: W0, B, A, D, then F, E, G, with C parallel and feeding D. Plan §6 contains the P0-14 W0, Idle, P0-21 userConfig and P0-21 voice-argument rows, which the prompt says must fail in W0 (prompt:34).
- PO-6's reply string matches plan:196 and plan:238. `/orchestra voice` currently opens the pane (`PRD:284`; plan:196 cites `register.js:1532-1533`).
- The only timer allowed is the theme recheck (`register.js:1350`). `view.now` is set at `register.js:447`. The sole work-driven redraw is at `register.js:453`. The redraws at `:1163`, `:1182`, `:1322`, `:1418`, `:1549`, `:1553` and `:1561` match plan:95.
- `fresh_evidence.py` has init-run, next-step, seal and validate. The `run-<ISO-compact>-<slug>` format and `step-NN` naming match prompt:67.
- Skills named in `<skills_to_activate>` all exist in the skill list.

Incorrect or stale:
- **`orchestra-spec.md:211` is stale (prompt:111).** In the working tree, line 211 is the `## 11. Publish plan` heading and the release-rule sentence is at line 213 (`docs/orchestra-spec.md` is modified, `git status`: ` M`). Line 211 is correct only at HEAD, and the PRD:398 cite has the same defect. The prompt tells the agent to treat the PRD/plan/spec order as source of truth but gives no commit qualifier for this cite. `.planning/docs-audit/audit-a.md:56-63` flagged exactly this class of drift.
- **Prompt:14 overclaims.** "The plan's line cites… were checked against 0.1.7 and match (audit-a.md)". `audit-a.md:10` says it audited plan "revision 2" (261 lines), and the plan is now revision 3 at 278 lines. `audit-a.md:51-54` lists cites it did not verify: `register.js:51-53`, `:133-144`, `:172-177`, `render-proof.mjs:55-75`, and `verification.md:122`. I spot-checked the `register.js` cites in plan:95 and they match, but the claim as worded is wrong.
- **`verification.md:122` is a weak cite for "forced conflict".** It is the Bash-attribution limitation paragraph, not a recipe for forcing a conflict. The prompt gives no recipe, only plan:236's loose cite.

## Failure modes predicted (with evidence)

- **D1. B/C ordering deadlock** (prompt:7, 36 vs plan:166-168, 205). An executor that follows the prompt starts C in parallel and B first. B then edits `ledger.js` for the moved helpers while C edits the same file. Result: a merge collision, or B's `register.js` import re-point (plan:171) pointing at helpers that do not exist yet.
- **D2. P0-14 fallback is unreachable from PO-1** (prompt:78 vs plan:233, PRD:340). PO-1 requires "Each Agent row has line 2 `└ …`". If the W0 capture answers No, the plan gates P0-13 on the band instead. An honest agent would then FAIL PO-1 or mark LIMITATION. The prompt says to ask the owner before "closing a gate as a stated limitation" (prompt:50), so the run stalls on a case the plan already resolved.
- **D3. Clean config has no login.** PO-1 and PO-7 require a clean `CLAUDE_CONFIG_DIR`, and the prompt forbids touching `~/.claude` (prompt:51). `verification.md:217` shows live runs used "installed CLI's own login", and no section records how an isolated dir authenticated. The agent will either stall at a login screen or reach into the real config.
- **D4. Step 1 stop-rule fires spuriously** (prompt:33). It says "If an item has no gate row, stop and add one to the plan." In plan §6, P0-15 and P0-18 have no row of their own. They are covered only inside "Live run" and G9 sizes, and P0-18 is named only in the Live-run pass text. An agent applying the rule literally halts before W0 and edits the plan.
- **D5. `.planning/live/replay.mjs` breaks and nobody owns it** (prompt:15). It imports `band` from `views.js` (`replay.mjs:7`) and checks tmux frames against it. Slices B and D change or replace `band` (plan:177, 212: `bandRows`). The prompt lists replay.mjs as live harness and mentions only motion.contract.mjs (deleted) and prototype-replay.mjs (retired). The plan is silent on it too. The harness will fail mid-F.
- **D6. Evidence-path mismatch with the plan gates.** The prompt uses `e2e-evidence/run-<ts>-w0-baseline/` (prompt:34) and the example `run-20261014T1010-v020-live` (prompt:116). The plan's P0-14 and P1-5 gates match on `e2e-evidence/v020-w0-*/` and `e2e-evidence/v020-*/` (plan:233, 236, 241). A glob `v020-*` does not match `run-…-v020-live`. A literal agent ends with a P1-5 checklist whose cited paths fail the plan's own pattern.
- **D7. Dirty tree at start.** `git status` shows modified `docs/PRD-orchestra.md`, `docs/orchestra-prd.md`, `docs/orchestra-spec.md`, `docs/orchestra-prd-map.html`, `.omp/config.yml`, deleted `docs/asset-handout.md`, and untracked `docs/plan-0.2.0.md`, `docs/tui-research.md`, `.planning/docs-audit/`, and the build prompt itself. Prompt:33 says only to read `git status`. The prompt does not say to commit the PRD and plan first, or to path-limit slice commits. The slice-B commit will sweep in unrelated doc edits, or the plan the agent is working from will never be committed.
- **D8. PO-5 criterion undefined for two modes** (prompt:99). "Every token is at least 4.5:1 against the mode's background", but in `ansi` mode the pane ground is left to Claude Code (`verification.md:216`) and in `unknown` mode `ground()` is undefined and nothing is painted (plan:215). There is no background to measure, so an agent must invent one.
- **D9. Autonomous run, human gate.** `git push` requires the owner (prompt:50), yet step 8 and PO-7 depend on a push followed by a GitHub install. There is no channel or fallback ("stop and report after F/E, push pending"). The release rule (prompt:111) also forbids publishing before every row passes, while PO-7's installed-copy rows can only be run after publishing. The prompt does not resolve this chicken-and-egg; spec §10 J1 has the same shape.
- **D10. Non-determinism of a live, LLM-driven run.** PO-1 needs a conductor that starts exactly ten parts at once, two trumpets that really collide, and one deliberate failure. The prompt gives no script, no retry budget, no deterministic fallback, and no definition of "scripted" beyond the word.
- **D11. render-proof rewrite is understated.** Prompt:15 treats `render-proof.mjs` as a gate, and the plan rewrites only lines 55-75 (plan:181). Lines 49-53 (`cue →`, `joining`), 61-65, 67-75 (score playhead, held note) and 78 (`frame: 3, live: false`) all depend on motion code too. The prompt does not warn the agent, so "Contracts: Pass" is unreachable as scoped.
- **D12. Model id is harness-specific.** Prompt:29 hard-codes `omniroute/cc/claude-sonnet-5-5`, valid on omp (the current workstation) but not on plain Claude Code, which the prompt names as an allowed executor (prompt:3).

## Test cases (dry-run)

1. **Input:** a literal agent reads step 4 with slices B/A/C. **Expected:** B is done before C lands, or the agent applies plan:205. **Dry-run:** FAIL (D1). Two owners touch `ledger.js`; the prompt does not state the "after C lands" rule.
2. **Input:** W0 P0-14 capture returns "No" on 2.1.296. **Expected:** gate P0-13 on the band, record the fallback, PO-1 still passes. **Dry-run:** FAIL (D2). PO-1 asserts Agent-row line 2, and the agent must stop and ask under prompt:50.
3. **Input:** a fresh machine with no `CLAUDE_CONFIG_DIR` credentials runs PO-1 step "clean CLAUDE_CONFIG_DIR". **Expected:** it authenticates without touching `~/.claude`. **Dry-run:** FAIL (D3). No instruction exists.
4. **Input:** slice E finishes and P1-5 checklist looks for `e2e-evidence/v020-*/` cites. **Expected:** match. **Dry-run:** FAIL (D6). The run dirs are named `run-…-v020-live`, which does not match the plan's pattern.
5. **Input:** step 1 with the PRD/plan as written. **Expected:** the agent lists items P0-12 to P0-21 and P1-5 with their gate rows and proceeds. **Dry-run:** PARTIAL (D4). P0-15 and P0-18 have no dedicated row, so the stop-rule is ambiguous. The remaining 10 items map cleanly (P0-12 → numbering, P0-13 → G10, P0-14 → W0 capture, P0-16/17 → Keys, P0-19 → Idle, P0-20 → Themes, P0-21 → three rows, P1-5 → two rows).

## Top fixes, ordered by impact

1. **Resolve slice B/C and the prompt's own order** (D1, prompt:7, 36). Add: "C lands first or after B; B's helper moves into `ledger.js` happen after C is committed (plan:205). One worktree, one owner for `register.js` and `views.js`." Reorder prompt:7 to match.
2. **Add the P0-14 branch to PO-1 and the authorization rule** (D2). PO-1 pass: line 2 on Agent rows if the W0 answer is Yes, else line 2 in the band and Ensemble tab with the fallback recorded in the drift register (plan:233, PRD:340). State that this fallback is not a "stated limitation" that needs owner sign-off.
3. **Specify the environment the proofs run in** (D3, D7, D10). Give the authentication method for the clean `CLAUDE_CONFIG_DIR`. Add a step 0 that commits the PRD, plan and prompt (path-limited, not `git add -A`). Include the fixture-repo creation script and the exact conductor prompt text, plus a retry budget.
4. **Fix evidence naming and cites** (D6, orchestra-spec cite). Use the plan's `e2e-evidence/v020-*` names, or change the plan's gates to `run-*-v020-*`, so P1-5 matches. Change the cite to `docs/orchestra-spec.md:213` (or add "at HEAD"). Reword prompt:14 to "audit-a covered revision 2; re-verify the rest". Say how a clone verifies cites to the gitignored evidence.
5. **Close harness gaps** (D5, D11, D8, D9). Add `replay.mjs` and the unfinished render-proof lines (49-53, 61-80) to the slice-B/D file list. Define PO-5 for `ansi` and `unknown` (no background painted; assert no `48;` codes in the capture). Add the stop-and-report path for the owner-gated push and separate the pre-push gates from PO-7's post-publish rows.

## Remediation: not applied

The assignment forbids editing the prompt, so no `.remediated.md` was written and no re-score was run. Estimated score if fixes 1 to 5 are applied: about 90/100.

## Re-score

Re-scored the revised `docs/build-prompt-0.2.0.prompt.md` (124 lines) against the same five test cases. The prompt was not edited. Nothing was run.

**Overall: 75/100 → 84/100 (needs-work, close to production-ready).**

| Dimension        | Before | After | Reason |
|------------------|--------|-------|--------|
| Clarity          | 15/20  | 17/20 | Task order now reads `W0, then B → A alongside C, then D → F → E → G` (prompt:7), so the serial-chain contradiction is gone. The spec cite is fixed (prompt:15; verified: the release rule is at `orchestra-spec.md:213`, and the two banner lines added at the top of the file explain PRD:398's `:211`). Prompt:14 now says audit-a was written against revision 2 and that cites are hints. Still missing: the plan:205 rule that B's helper moves into `ledger.js` happen after C lands (R3). Also, "The push is the only step that waits" (prompt:54) contradicts "ask the owner once and wait" for the token (prompt:18). |
| Specificity      | 11/15  | 13/15 | The fixture is concrete (prompt:19). The conductor prompt is saved word for word. The auth method is named. PO-5 criteria are measurable (`48;` escapes, ansi set). Still open: the conductor prompt text itself is not given, how to force the theme read to fail is not given, and there is no retry budget for the LLM-driven run. |
| Structure        | 13/15  | 13/15 | Unchanged. `<proof_obligation>` is still an invented tag with no stated reason. `<example>` is still a verdict row, not an input/output pair. |
| Output contract  | 11/15  | 12/15 | Evidence naming at prompt:71 is `v020-<slug>-<ISO-compact>`, matching the plan's `v020-*` globs. The gitignored evidence is acknowledged and verification rows must quote frames verbatim (prompt:72). Defects remain (R1, R2). |
| Edge-case cover  | 8/15   | 12/15 | Added: auth (prompt:18), commit-first dirty tree (prompt:17), P0-14 fallback in PO-1 (prompt:83), replay.mjs and render-proof.mjs ownership (prompt:16), PO-5 per mode (prompt:103), single owner-gated push with a 0.2.1 path (prompt:44, 54). Not covered: flake handling, a stalled login after the token ask, attribution of colour escapes to Orchestra rather than Claude Code (R4). |
| Testability      | 8/10   | 9/10  | PO-1 now has a branch for the P0-14 outcome. Step 1 defines "covered" (prompt:37). |
| Token efficiency | 9/10   | 8/10  | Context grew by about 5 lines, with some repetition. |

### Test cases re-run (same five)

1. **B/C ordering: PARTIAL (was FAIL).** The order is no longer self-contradictory, and step 4 says C touches `ledger.js` only. But step 3 never says B's helper moves into `ledger.js` (`elapsed`, `activity`, `lastCall`, `eventText`, `recent`, `liveHandoff`; plan:166-168) wait until C is committed (plan:205). An executor running B and C concurrently can still collide in `ledger.js`.
2. **P0-14 "No": PASS (was FAIL).** Prompt:38 and prompt:83 route line 2 to the band and Ensemble. Residue: the Agent-row gap is labelled LIMITATION, and prompt:54 asks the owner once, with the verdict table in hand, so it no longer stalls the run.
3. **Clean-config auth: PASS (was FAIL)**, assuming the owner has a token. Prompt:18 forbids copying `~/.claude` and waits once if there is no token. Whether `CLAUDE_CODE_OAUTH_TOKEN` authenticates a bare `CLAUDE_CONFIG_DIR` on 2.1.296 is `[INFERENCE]`; I did not test it.
4. **Evidence naming vs P1-5 globs: PARTIAL (was FAIL).** Prompt:71 is fixed. But the `<example>` still uses `e2e-evidence/run-20261014T1010-v020-live/…` (prompt:121), which matches neither prompt:71 nor `v020-*`. Also, the `end-user-testing` helper in `<skills_to_activate>` (prompt:26) always creates `run-<ISO>-<slug>` (`fresh_evidence.py:77`), and `seal`/`validate` locate the active run with `glob("run-*")` (`:68`). Following the skill produces dirs that miss the plan's `v020-*` globs, and renaming after `init-run` would break `seal`.
5. **Step 1 coverage: PASS (was PARTIAL).** The covered-by-some-row rule (prompt:37) removes the spurious stop. Minor doubt: plan §6's Live-run row names the range "P0-12 to P0-21" and no row names P0-15 or P0-18 by id, so the rule leans on the range.

### Remaining defects (cited)

- **R1. Evidence-dir naming conflict.** Prompt:71 requires `v020-<slug>-<ISO>`, but the helper skill (prompt:26) emits `run-<ISO>-<slug>` and the `<example>` (prompt:121) uses that form. Either change the plan globs to `run-*-v020-*`, or tell the agent to pass a `v020-…` slug and accept the `run-` prefix.
- **R2. Example timestamp.** `20261014T1010` has 4 time digits, while `fresh_evidence.py:52` emits `%Y%m%dT%H%M%S` (6 digits). The example is also still a verdict row, not a worked input/output.
- **R3. B/C helper-move rule absent** (prompt:39-40 vs plan:166-168, 205). Add: "B's helper moves into `ledger.js` happen after C is committed."
- **R4. PO-5 attribution** (prompt:103). "No truecolor or 256 escape appears in the .ansi frame" and "no background escape from Orchestra" cannot be attributed on a full-screen capture that includes Claude Code's own colours (`verification.md:197-198` shows Claude Code paints backgrounds). Say how to isolate Orchestra's rows, e.g. diff against the same session with the plugin off.
- **R5. Wait semantics.** The token ask (prompt:18) and a LIMITATION ask both block, but prompt:54 says the push is the only waiting step. The 0.2.1 path (prompt:44) also needs a second push approval that is not stated.
- **R6. Dirty-tree commit scope** (prompt:17). The tree also has modified `.omp/config.yml`, deleted `docs/asset-handout.md`, and untracked `docs/tui-research.md`, `.planning/docs-audit/` and `docs/build-prompt-0.2.0.rating.md`. The prompt names only some. Say "path-limited; leave `.omp/config.yml` out" and decide on the rating file and audit dir.
- **R7. Carried over:** the invented `<proof_obligation>` tag without a stated reason; no conductor-prompt text or theme-failure method; no flake budget.

Estimated score with R1, R3, R4 and R6 fixed: about 90/100.

## Re-score 2

Re-scored the latest `docs/build-prompt-0.2.0.prompt.md` (126 lines) and `docs/plan-0.2.0.md` against the same five test cases. The prompt was not edited. Nothing was run.

**Overall: 75 → 84 → 88/100 (needs-work, one notch below production-ready).**

| Dimension        | R1 | R2 | Now   | Reason |
|------------------|----|----|-------|--------|
| Clarity          | 15 | 17 | 18/20 | The B/C rule is stated (prompt:42: B's helper moves land only after C is committed, plan:205; until then a temporary local module). The "only the push waits" contradiction is gone: authorization (prompt:56) names every push, the token ask and limitation closures, and says to batch questions and keep working. Remaining: see N1. |
| Specificity      | 13 | 13 | 13/15 | The helper path (prompt:21), the flake budget of two reruns (prompt:22) and the fixture (prompt:19) are in. Still open: the conductor prompt text is not given (only "save what you send", prompt:19), and the theme-failure method is delegated to the plan, which does not give one (N2). |
| Structure        | 13 | 13 | 13/15 | Unchanged: `<proof_obligation>` is still an invented tag with no stated reason, and `<example>` is still a verdict row rather than an input/output pair. |
| Output contract  | 12 | 12 | 14/15 | Evidence naming is now consistent end to end: prompt:73 `run-<YYYYMMDDTHHMMSS>-v020-<slug>`, helper `fresh_evidence.py:52,77`, and the plan's globs `run-*-v020-w0/` and `run-*-v020-*/` (plan:233, 236, 241, verified). The example timestamp is 6 digits (prompt:123). `step-00-conductor-prompt.txt` sits beside the helper's `step-NN` files without clashing. Remaining: N3. |
| Edge-case cover  | 8  | 12 | 13/15 | Added since R2: the flake budget, the full dirty-tree scope (prompt:17 matches `git status` exactly: everything except `.omp/config.yml`, including the deleted `asset-handout.md`, `docs/tui-research.md`, `.planning/docs-audit/` and the rating file), a batched owner-question policy, and PO-5 attribution limited to Orchestra's own rows (prompt:105). Still not covered: a login that stalls after the token is exported. |
| Testability      | 8  | 9  | 9/10  | PO-5 now has locatable anchors (`𝄐 Orchestra`, band rows, pane rows above the key-hint row) and a recorded forcing method. |
| Token efficiency | 9  | 8  | 8/10  | About 126 lines. Cites are repeated in context and validation. |

### Test cases re-run (same five)

1. **B/C ordering: PASS (was PARTIAL).** Prompt:42 states the helper-move rule and the temporary-module workaround. Caveat N1.
2. **P0-14 "No": PASS.** Prompt:40 and prompt:85 route line 2 to the band and Ensemble, and the LIMITATION is batched to the owner (prompt:56) without blocking local work.
3. **Clean-config auth: PASS** (was PASS), still assuming the owner has a token. Whether `CLAUDE_CODE_OAUTH_TOKEN` authenticates a bare `CLAUDE_CONFIG_DIR` on 2.1.296 is `[INFERENCE]` and untested.
4. **Evidence naming vs P1-5 globs: PASS (was PARTIAL).** `init-run v020-w0` creates `run-<ts>-v020-w0`, which matches plan:233. The example path `run-20261014T101000-v020-live` matches `run-*-v020-*` (plan:236, 241) and the 6-digit helper format.
5. **Step 1 coverage: PASS.** The covered-by-some-row rule (prompt:39) holds. Caveat: no §6 row names P0-15 or P0-18 by id, so the rule leans on the "P0-12 to P0-21" range in the Live-run row.

### Remaining defects (cited)

- **N1. B's temporary module vs commit order** (prompt:41-42). B is sequenced first and gets "one commit each" (prompt:41), but its `ledger.js` moves wait for C's commit. If C is not committed when B is, the temporary local module survives B's commit, which contradicts "deletes in the same slice". Say whether B's commit waits for C, or the module is removed in the first commit after C lands.
- **N2. Theme-failure method undefined.** Prompt:105 says "force unknown… as the plan's Themes row describes", but plan:245 (the Themes row) says only "unknown (theme read made to fail)" with no method. The agent must invent one. Name it (for example a `config.get` failure), or give the plan a method.
- **N3. Example is still a verdict row only** (prompt:121-125), with no worked input/output pair for a proof obligation, and the first line of the example does not show the helper commands that produce the path.
- **N4. Token-wait residue.** Prompt:18 says "ask the owner once and wait", while prompt:56 says to continue local work while a question waits. The live gates cannot run without a token, so say that only live gates block.
- **N5. Carried over:** the invented `<proof_obligation>` tag with no stated reason; the conductor prompt text is not specified; a login stalling after the token export is unhandled; PO-4's "byte-identical" has no stated way to extract Orchestra's rows beyond PO-5's text anchors.

Estimated score with N1, N2 and N5 fixed: about 92/100.
