# Orchestra

A conductor agent and its musicians, inside Claude Code.

Orchestra is a Claude Code plugin. A **conductor** agent plans the work as a score, assigns parts to five **musician** subagents, runs independent parts in parallel, and presents a **coda** at the end. A Claude Code **mod** that ships in the same plugin watches the whole performance. It records every file each musician reads and writes into an append-only ledger with SHA-256 versions. It holds a write that would overwrite another musician's newer work and asks you what to do. It draws the ensemble beside your transcript.

| Musician | Subagent type | Role |
| --- | --- | --- |
| Violin | `orchestra:violin` | Scout: maps code, writes notes, never edits source |
| Trumpet | `orchestra:trumpet` | Implementer: changes source code |
| Flute | `orchestra:flute` | Scribe: writes documentation |
| Timpani | `orchestra:timpani` | Tester: runs tests and commands, saves logs |
| Cello | `orchestra:cello` | Reviewer: reports problems, never edits |

## What it can reach

The mod runs inside Claude Code's own process with your access to files, processes and settings; mods are not sandboxed. `claude plugin validate ./plugin` prints the same list from the code.

- **Calls:** `$.clock` (every, now), `$.command.register`, `$.config.list`, `$.env.get`, `$.fs` (exists, list, read, stat, write), `$.process.run`, `$.session.cwd`, `$.session.id`, and `$.ui` (ask, close, invalidate, log, open, resolve, status, toast).
- **Reach:** writes files and starts a process. It makes no network call of its own; the optional narrator below does.
- **Sees:** every prompt, every row added to the conversation, every subagent spawn, every tool call and its result, and the pane, the band above the prompt, the spinner, the question dialog and the Agent rows it draws into.
- **Environment:** reads `COLORTERM`; sets nothing.
- **State:** nothing in `$.state` or `$.store`; the ledger is kept in files.

Threat model:

1. **Reads:** during a performance, the project files the ledger tracks (hashed before and after tool calls); its own ledger under `.orchestra/performances/`; the `theme` setting; `COLORTERM`.
2. **Runs:** only with `narrateCoda` on, `node <plugin>/narrate/narrate.mjs`, a fixed command line. The coda goes on standard input, never into the command line.
3. **Sends:** nothing by default. With `narrateCoda` on, the narrator sends the coda to Anthropic with your Claude Code login. The coda holds your task and later requests (each cut to 500 characters), the musicians' names, file paths, short command text, and the conflict and failure lines. It holds no file contents and no musician answers.
4. **Persists:** in the session's working directory, during a performance: ledger segments `.orchestra/performances/<session>.NNNN.jsonl`, `<session>-coda.md`, the narrated coda when it is on, and `.orchestra/.gitignore` (`*`). They stay until you delete them.
5. **Hostile input:** a file or tool result only changes the hashes recorded, never anything run. A task notification quoted in a tool result or a pasted prompt is ignored; only one Claude Code itself delivers is acted on. A ledger is replayed only if its name starts with the current session id, and a malformed one is neither used nor overwritten. Text written by the model reaches the conflict dialog only as a part summary cut to 40 characters, and reaches the narrator, which runs one turn with no tools, settings, plugins or MCP servers, so crafted text can at most change the narration.

## Install

Requires Claude Code **2.1.287 or later**, the version that added mods. Tested with **2.1.289**. Mods must be allowed on your machine: they are on by default, but managed settings such as `allowManagedModsOnly`, or `--bare` and `--safe-mode`, turn them off.

```sh
claude plugin marketplace add krzemienski/orchestra-cc
claude plugin install orchestra@orchestra-cc
```

To try it without installing, clone this repository and load the plugin directory for one session:

```sh
git clone https://github.com/krzemienski/orchestra-cc
claude --plugin-dir ./orchestra-cc/plugin --agent orchestra:conductor
```

## Use

Start a session with the conductor as the main agent, then describe the work:

```sh
claude --agent orchestra:conductor
```

Installing the plugin does not change your other sessions' main agent. The mod records any session where subagents run, but the conductor only conducts when you start it.

| Command | What it does |
| --- | --- |
| `/orchestra` | Opens the Orchestra pane (tabs: Ensemble, Score, Artifacts, Coda). Esc closes it. Keys 1–4 switch tabs. |
| `/orchestra coda` | Prints the coda for this session from the ledger |
| `/orchestra ledger` | Prints the ledger's path, event count and status |
| `/orchestra close` | Closes the pane |

### Narrated coda (optional)

Every sentence of the coda comes from the ledger. If you also want it told as prose, turn on **Narrate the coda** (`narrateCoda`) for the plugin in `/config`. When the conductor's turn ends with every part settled, Claude retells the coda in a second file beside it, `.orchestra/performances/<session>-coda-narrated.md`, and the Coda tab shows the retelling under the coda. The coda stays the record: the narration may use only what the coda states.

The narration uses the [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview), which the plugin does not install for you. Install it once in the plugin's `narrate` folder:

```sh
npm install --prefix <plugin directory>/narrate
```

Each narration is one call to `claude-opus-5-5`, made with your Claude Code login, so it is billed like any other request. It runs in a separate Claude Code process with no tools, settings, plugins or MCP servers, and it never holds up your turn. An unchanged coda is not narrated again. If the narration fails, Orchestra says why in a toast, and the coda is not affected.

## What you see

- **The band above the prompt** lists every musician with a state glyph and the measures played so far:
  - `♪` playing, `‖` waiting on you, `✓` done, `✕` failed.
  - One measure is one completed tool call.
  - The tool a musician is running right now is shown beside it.
  - Open conflicts and stale reads are flagged.
- **The pane** (beside the transcript in a wide terminal, above the prompt in a narrow one):
  - **Ensemble**: every musician's role, state, current activity and read and write counts. Select one to see its part, the version of every file it has seen, and its answer.
  - **Score**: one staff per musician, newest events on the right. `○` read, `←` read another's work, `●` write, `‼` conflict, `⚠` stale read, `✓` done, `✕` failed.
  - **Artifacts**: every file touched, with its versions. Select one to see each version's author, base version, line delta and SHA-256, who read which version, and its conflicts.
  - **Coda**: who contributed what, artifacts changed, handoffs, conflicts, failures and stale reads, all computed from the ledger.
- **The narrated coda**, if you turn it on (below): Claude's retelling of the coda, under "Narrated by Claude" at the end of the Coda tab.
- **The status line** under the prompt, for example `Orchestra · 2 playing · 1 done · 3 artifacts changed · 1 conflict`.
- **Toasts** for handoffs, stale reads and failures as they happen, for each conflict once it is decided, and when the coda is ready.
- **The spinner** gains `· 2 musicians playing`.
- **Agent tool rows** are labelled with the instrument, its role, its state and its measures. When several parts start in one message, Claude Code draws a single summary row that a mod cannot redraw, so those parts are not labelled there.

## Data model

Everything Orchestra shows is folded from one append-only ledger per session in `.orchestra/performances/` in your project, written in segments of 500 events (`<session-id>.0001.jsonl`, …) so a crash can lose at most part of the newest segment. Orchestra also writes `.orchestra/.gitignore` so none of it is committed by accident.

Only observations are recorded:

| Event | Recorded when |
| --- | --- |
| `part.assigned` | The conductor's Agent call started a subagent. Carries the subagent's id, type, description and prompt. |
| `tool.call`, `tool.result` | A musician called a tool, and how it ended |
| `artifact.read` | A musician read a file. Carries the file's SHA-256 at that moment. |
| `write.attempt` | A write is about to run. Carries the SHA-256 of the file it is about to change. |
| `artifact.write` | The write landed. Carries the new SHA-256 and lines added and removed. |
| `conflict.resolved` | Your decision on a conflict |
| `part.done`, `part.failed` | The subagent's turn ended |
| `coda` | The coda file was written |

Everything else is **derived** from versions, never declared by the agents:

- **Conflict**: a musician tries to write a file whose current version is not the one it last saw. Example: Trumpet read v0, Trumpet 2 wrote v1, and Trumpet now edits from v0. Orchestra holds the write and asks in Claude Code's own question dialog: *Let it write*, *Send it back to re-read*, or *Show both versions*, which draws the lines the other musician added and the held change directly above the question before asking again. Sending it back denies the edit and tells the musician to re-read and reapply its change. In a `claude -p` run nobody can answer, so the write is sent back.
- **Stale read**: a musician produced other work after reading a version that someone has since replaced. It clears when that musician reads the current version. Revising the conductor's plan, `.orchestra/score.md`, never makes work stale.
- **Handoff**: a musician read a version that another musician wrote.
- **Coda**: written to `.orchestra/performances/<session-id>-coda.md` at the end of each conductor turn, from the ledger alone.

## Interactive prototype

`prototype/` is the approved design prototype: a scripted performance played on HTML stand-ins for the surfaces a mod can draw. Run it with:

```sh
cd prototype && python3 -m http.server 8742 --bind 127.0.0.1
# open http://127.0.0.1:8742/index.html
```

Its data is illustrative. The plugin in `plugin/` is the real integration.

## Research

- `docs/orchestra-research-report.md` covers Claude Code plugins, mods and modes; prior art; OpenCode, Pi and terminal UX with visual evidence; data-operation patterns; and open questions. Every claim is labelled and linked.
- `docs/orchestra-prototype-design.md` gives the design rationale for the prototype.
- `docs/orchestra-prd.md` is the product requirements document: every screen with wireframes, colours, data placement and keyboard access.
- `docs/orchestra-spec.md` is the engineering specification: event flow, derivation rules and the verification plan.
- `docs/verification.md` records how the plugin was verified in a real environment, screen by screen.

## Limitations

- Mod drawing appears only in the Claude Code terminal and the Desktop app's Code tab. In the VS Code extension, `claude -p` and cloud sessions, the ledger, conflict guard and coda still work, but nothing is drawn.
- A change a musician makes with Bash (for example `sed -i`) to a file Orchestra already tracks is credited to that musician, marked "via Bash", and marked uncertain if another musician ran a tool that can change files (a shell command, a write tool or an MCP tool) at the same time, or had a command running in the background. A background command's own changes are found when Claude Code reports it finished, and credited to the musician who started it. Tools added by other plugins are not counted. Files created by Bash are not recorded, so the musicians are told to create files with Write and Edit.
- A command that hides its own exit code (for example `npm test; echo $?`) is recorded as a success. The tester and conductor are instructed never to append anything to a command, but a model can still ignore that.
- If one of Orchestra's own hooks fails, Claude Code skips it and the work goes on (fail open). `claude plugin validate` reports this as `gating hook without .catch` for `session.append`, `config.set`, `prompt.submit`, `agent.spawn` and `ui.scroll`. The exception is a write Orchestra could not check against the other musicians' work in time: the `tool.call` hook's `.catch` sends it back to be read again and retried, so it never lands unchecked.
- Progress is counted in measures (completed tool calls), not as a fraction of a known total, because Claude Code exposes no step plan for a subagent.
- Hot reload of the mod waits until the current turn ends. After a reload, or after `claude --continue`, the session's ledger is replayed, so the picture is rebuilt rather than lost.
- Colours follow your Claude Code theme (dark, light or ANSI) within 2 seconds of a change. On a 256-colour terminal the hex colours are approximated.
- The mods API is new: it was added in 2.1.287, and the events and methods may change between releases. This version was last tested against 2.1.296.
- Agent teams (split-pane teammates in separate processes) were not tested.

## License

MIT
