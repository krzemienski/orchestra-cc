# Orchestra: Stage 1 Research Report

**Interpretation** (this summary states conclusions; the Facts and links behind them are in sections (a) to (f)). Orchestra is meant to be an orchestration experience for Claude Code, modelled on a symphony orchestra, in which a conductor agent coordinates specialised musician agents and the user can always see which musicians are playing, what each is doing, how far along it is, which data it read or changed, and how the parts combine into one result. The research supports shipping Orchestra as one Claude Code plugin built on Claude Code's own primitives: a conductor agent installed as the session's main agent, musician subagents, a mod (a plugin with a JavaScript hooks module) that draws the Orchestra interface inside Claude Code, and an append-only ledger from which conflicts, stale reads and the final summary are derived rather than self-reported. Mods have been official since Claude Code v2.1.287 and are the only mechanism that can draw live panes, bands and redrawn tool rows inside Claude Code, but they are about two releases old, draw only in the terminal and the Desktop Code tab, and on this machine their loading from installed plugins may be gated by a rollout flag, so Orchestra also needs a settings-hooks capture path that works without any UI. Other coding clients (OpenCode, Pi, Crush, Codex CLI, Gemini CLI, Claude Squad) offer useful visual patterns, such as roster rows with state glyphs, one-line tool rows, dense cost footers and drill-down from parent to child, but their architectures do not transfer to Claude Code. The data gap is real: no surveyed tool joins what each agent read to what it then wrote. Finally, the name "Orchestra" is heavily taken, so the public repository needs a qualified name, and its destination must be confirmed by the user.

## How to read this report

Every bullet and claim carries exactly one of three labels.

- **Fact** marks a sourced statement and gives a direct link to the source. A few Facts are local observations made on this machine. They cite the command that was run instead of a URL, plus the scout report at `plans/reports/scout-261005-1726-local-environment.md` or the lane report that recorded them.
- **Visual observation** marks what a specific linked image, video or in-page demo shows. A lane researcher viewed it in a real browser on 2026-10-05. The media link is given.
- **Interpretation** marks a design inference for Orchestra drawn from the Facts and Visual observations around it. Interpretations are not claims about any product.

All links were accessed on 2026-10-05 (America/New_York). A table caption states the label that applies to its rows, and an indented sub-bullet carries the label of the bullet it sits under.

This report consolidates five lane reports in `plans/reports/`: `research-261005-1726-claude-code-extensions.md`, `research-261005-1726-coding-clients-terminal-ux.md`, `research-261005-1726-data-operations.md`, `research-261005-1726-community-builds.md` and `scout-261005-1726-local-environment.md`. It adds a few orchestrator spot-checks of the mods documentation, made on 2026-10-05.

## (a) Plugins, mods and modes in Claude Code

### What each term refers to

- **Fact.** A *plugin* is Claude Code's packaging and distribution unit. It holds a manifest at `.claude-plugin/plugin.json` (optional; `name` is the only required field) and components in a standard layout: `skills/`, `commands/`, `agents/`, `hooks/hooks.json`, `.mcp.json`, `.lsp.json`, `output-styles/`, `workflows/`, `themes/`, `monitors/`, `bin/` and `settings.json`. Every component is namespaced under the plugin name, as in `plugin:agent`. Sources: https://code.claude.com/docs/en/plugins-reference and https://code.claude.com/docs/en/plugins/components
- **Fact.** A *mod* is an official kind of plugin. The docs define it as "a plugin that changes how Claude Code looks and behaves… made of JavaScript or TypeScript event handlers". Its `hooks/hooks.json` names a module (`"modules": ["./register.js"]`) that exports `register(on, options)`. The module runs inside Claude Code's process and is not sandboxed. Sources: https://code.claude.com/docs/en/plugins/mods/overview and https://code.claude.com/docs/en/plugins/mods/reference
- **Fact.** Mods were added in v2.1.287 ("Added Claude Mods: plugins may now modify deeper behavior"). The 2.1.288 and 2.1.289 entries contain several mod fixes. Source: https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md
- **Fact.** The docs call a mod's handlers *function hooks*, as distinct from *settings hooks*. The type declarations are published as "Claude Code function hooks: the plugin API's TypeScript declarations". Sources: https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts and https://code.claude.com/docs/en/hooks
- **Fact.** A *mode* is not an extension mechanism. The word names session states:
  - the permission modes `default` (shown as "Manual"), `acceptEdits`, `plan`, `auto`, `dontAsk` and `bypassPermissions`;
  - fast mode;
  - fork mode, under which subagents run in the background;
  - the teammate display modes.

  Output styles are not called modes. Sources: https://code.claude.com/docs/en/permission-modes, https://code.claude.com/docs/en/fast-mode, https://code.claude.com/docs/en/sub-agents, https://code.claude.com/docs/en/agent-teams and https://code.claude.com/docs/en/output-styles
- **Fact.** The `plugin-authoring` lead is documented. It is a built-in skill, shipped in the built-in plugin `cc-plugin-plugin-authoring`, which "holds a skill and no mod code". Claude uses it to write mods into `~/.claude/dev-mods/<session-id>/`, and those mods hot-reload at the end of each turn that changes them. Sources: https://code.claude.com/docs/en/plugins/mods/create and https://code.claude.com/docs/en/plugins/mods/overview
- **Fact (local observation).** `claude --version` returned `2.1.289 (Claude Code)`. Running `strings` on that binary shows the `plugin-authoring` skill and loader messages such as "installed plugins' hooks modules not loaded: rollout flag (" (scout report).

### How each mechanism works, and what matters for Orchestra

**Plugins and plugin settings.**

- **Fact.** In a plugin's `settings.json`, only the `agent` and `subagentStatusLine` keys take effect. A plugin can therefore set the session's main-thread agent and the per-subagent row renderer, but it cannot set the main `statusLine`. Source: https://code.claude.com/docs/en/plugins-reference
- **Fact.** `${CLAUDE_PLUGIN_ROOT}` changes on every update. `${CLAUDE_PLUGIN_DATA}` (`~/.claude/plugins/data/<id>/`) persists across updates. Plugins can be loaded for one session with `claude --plugin-dir <dir>` and checked with `claude plugin validate`. Source: https://code.claude.com/docs/en/plugins-reference

**Subagents.**

- **Fact.** A subagent is defined in Markdown with YAML frontmatter, and the body becomes its entire system prompt. Its frontmatter includes `color`, one of `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink` or `cyan`, documented as the "display color for the subagent in the task list and transcript". Source: https://code.claude.com/docs/en/sub-agents
- **Fact.** Plugin subagents ignore the `permissionMode`, `mcpServers`, `hooks` and `initialPrompt` fields. Source: https://code.claude.com/docs/en/sub-agents
- **Fact.** A whole session can run as an agent through `--agent <name>` or the `agent` setting. The agent's prompt then replaces the default system prompt. Source: https://code.claude.com/docs/en/sub-agents
- **Fact.** Fork mode is on by default in interactive sessions, so subagents run in the background there; it is off in `-p` and the SDK. Running subagents appear in a panel below the prompt, with a default row of `name · description · token count`. Finished rows clear at once. Failed or stopped rows linger for 30 seconds. Source: https://code.claude.com/docs/en/sub-agents
- **Fact.** A subagent returns only a summary to its caller. Its full work lives in `~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl`. Source: https://code.claude.com/docs/en/sub-agents

**Agent teams.**

- **Fact.** Agent teams are experimental and off by default; `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` enables them. A team has a lead, teammates that are separate Claude Code instances, a shared task list with file-locked claiming, and per-agent JSON mailboxes. Source: https://code.claude.com/docs/en/agent-teams
- **Fact.** The documented limits are:
  - one team per session;
  - no nested teams;
  - no `/resume` or `/rewind` for in-process teammates;
  - task status can lag;
  - "Two teammates editing the same file leads to overwrites."

  Source: https://code.claude.com/docs/en/agent-teams

**Settings hooks.**

- **Fact.** There are five handler types: `command`, `http`, `mcp_tool`, `prompt` and `agent`. There are 33 events, among them `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `TeammateIdle`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `Stop` and `StopFailure`. Hooks fired inside a subagent receive `agent_id` and `agent_type`. Source: https://code.claude.com/docs/en/hooks
- **Fact.** Settings hooks never draw UI. The hooks page says that function hooks which draw belong to mods. Source: https://code.claude.com/docs/en/hooks

**Mods (function hooks).**

- **Fact.** A mod can draw in several places:
  - a pane, which sits as a sidebar beside the transcript in a wide fullscreen terminal and as a framed region above the prompt otherwise;
  - a band above the prompt (the `AbovePrompt` render site, shared by every mod);
  - toasts at the top right;
  - a log line in the transcript;
  - a status line under the prompt.

  A mod can also redraw messages, tool call rows (`ToolUse`, `ToolResult`, `ToolGroup`), the `Spinner` and the `AskUserQuestion` dialog. Panes support tabs. Sources: https://code.claude.com/docs/en/plugins/mods/interface and https://code.claude.com/docs/en/plugins/mods/reference
- **Fact.** `$.ui.status(text)` draws one persistent line under the prompt that starts with `⚠` and the mod's name. This is separate from the `statusLine` setting. `$.ui.toast(text)` shows a notice at the top right that disappears after a few seconds. Source: https://code.claude.com/docs/en/plugins/mods/api
- **Fact.** A pane that a mod opens on its own appears only in a terminal at least 144 columns wide, or 110 columns once the user has opened that pane themselves. Otherwise the pane waits and `$.ui.open` resolves with `isPlaced: false`. Source: https://code.claude.com/docs/en/plugins/mods/interface
- **Fact.** A mod's hooks run in every session that loads the plugin, including the VS Code chat panel, `claude -p`, the Agent SDK and cloud sessions. Its drawing appears only in the terminal and the Desktop Code tab. Plugins do not load at all in Desktop WSL sessions. Source: https://code.claude.com/docs/en/plugins/mods/overview
- **Fact.** Mod events include:
  - `tool.call`, which carries the `agentId` of the loop that made the call (absent for the main loop);
  - `agent.spawn`, with `prompt`, `description`, `subagentType`, `parentAgentId`, `background` and `name`;
  - `turn.start`, `turn.step` and `turn.complete`;
  - `session.append`, `session.send` and `session.receive`;
  - `classic.<Event>`, which carries settings-hook payloads.

  Source: https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts
- **Fact.** The documented limits are:
  - 10 seconds of hook execution per event;
  - redraws throttled to 10 per second, or 30 for the visible pane in the terminal;
  - `$.store`, a JSON key-value store of up to 4 MiB shared by every session on the machine;
  - `$.fs.write`, which is not atomic.

  Sources: https://code.claude.com/docs/en/plugins/mods/reference and https://code.claude.com/docs/en/plugins/mods/interface
- **Fact.** A user's `disableAllHooks` setting or an organisation's `allowManagedModsOnly` stops an installed mod while the rest of its plugin keeps loading. `--bare` and `--safe-mode` also stop installed mods. Built-in mods are not affected by any of these. Source: https://code.claude.com/docs/en/plugins/mods/overview

**Skills, commands, MCP, output styles and status lines.**

- **Fact.** Custom commands have been merged into skills. A skill can run as a subagent with `context: fork` plus `agent`. Source: https://code.claude.com/docs/en/skills
- **Fact.** Plugin MCP tools are named `mcp__plugin_<plugin>_<server>__<tool>`. Source: https://code.claude.com/docs/en/hooks
- **Fact.** An output style sets role, tone and format, but the docs say it "doesn't guarantee that something always happens". Source: https://code.claude.com/docs/en/output-styles
- **Fact.** `subagentStatusLine` runs on each refresh tick. It receives `tasks[]` (with `id`, `name`, `status`, `description`, `model`, `tokenCount` and more) and prints one `{"id","content"}` JSON line per row. A plugin can ship it as a default. Source: https://code.claude.com/docs/en/statusline
- **Fact.** The session `statusLine` "can go quiet when the main session is idle, for example while a coordinator waits on background subagents". The docs recommend setting `refreshInterval` for that case. Source: https://code.claude.com/docs/en/statusline

**Workflows, headless mode and the SDK.**

- **Fact.** Dynamic workflows are JavaScript scripts that orchestrate "dozens to hundreds of agents" in the background, using `agent()`, `parallel()`, `pipeline()` and `phase()`. Progress shows in a `/workflows` view with per-phase agent counts, tokens and elapsed time. Source: https://code.claude.com/docs/en/workflows
- **Fact.** In headless mode, `claude -p --output-format stream-json` tags subagent messages with `parent_tool_use_id`. Adding `--include-hook-events` puts hook lifecycle events into the stream. Source: https://code.claude.com/docs/en/headless
- **Fact.** The Agent SDK streams `task_started`, `task_progress`, `task_updated` and `task_notification` messages. Sources: https://code.claude.com/docs/en/agent-sdk/subagents and https://code.claude.com/docs/en/agent-sdk/typescript

### Mechanism summary

In this table, the "What it gives Orchestra" column is **Interpretation**. The "Limits" column is **Fact** from the source in the last column.

| Mechanism | What it gives Orchestra | Limits | Source |
| --- | --- | --- | --- |
| Plugin | One installable unit holding the conductor, musicians, mod and fallback hooks | Settings take only `agent` and `subagentStatusLine`; no main `statusLine` | https://code.claude.com/docs/en/plugins-reference |
| Subagents (`agents/`) | Musicians with a role, model, tools and a `color` | Eight colours only; plugin agents ignore `hooks`, `mcpServers`, `permissionMode` and `initialPrompt` | https://code.claude.com/docs/en/sub-agents |
| Plugin `agent` setting | Makes the conductor the main-thread agent | Its prompt replaces the default system prompt | https://code.claude.com/docs/en/sub-agents |
| Agent teams | A native task list and mailbox for peer coordination | Experimental and off by default; claims are locked but file writes are not; no resume | https://code.claude.com/docs/en/agent-teams |
| Settings hooks | Event capture in every surface, attributed by `agent_id` | No UI; separate processes; Bash I/O visible only as command strings | https://code.claude.com/docs/en/hooks |
| Mod (function hooks) | Pane, band, toasts, status line, redrawn tool rows, and per-loop `agentId` | Terminal and Desktop drawing only; unsandboxed; about two releases old | https://code.claude.com/docs/en/plugins/mods/overview |
| Skills and commands | `/orchestra`-style entry points and reusable "parts" | Run as a subagent only with `context: fork` | https://code.claude.com/docs/en/skills |
| MCP server | A structured tool for musicians, for example to record decisions | Extra process; tool names are namespaced | https://code.claude.com/docs/en/hooks |
| `subagentStatusLine` | Restyled rows in the agent panel with no mod required | Refresh-tick driven; one line per row | https://code.claude.com/docs/en/statusline |
| `statusLine` | A session-level bar | User or project settings only; can go stale while the conductor idles | https://code.claude.com/docs/en/statusline |
| Workflows | Wide, deterministic scores | Script sandbox: `Date.now()` and `Math.random()` throw | https://code.claude.com/docs/en/workflows |
| Headless mode and SDK | An external viewer or a test harness | No mod drawing; no agent teams | https://code.claude.com/docs/en/headless |

## (b) What others have built or configured

### Plugins and collections

- **Fact.** Anthropic's official plugin directory, `anthropics/claude-plugins-official` (37,430 stars), lists internal plugins and partner plugins. Its plugins install with `/plugin install {name}@claude-plugins-official`. Source: https://github.com/anthropics/claude-plugins-official
- **Fact.** `wshobson/agents` (40,218 stars) is a multi-harness plugin marketplace with 94 plugins and 202 agents. `VoltAgent/awesome-claude-code-subagents` (25,511 stars) collects more than 100 subagents. Sources: https://github.com/wshobson/agents and https://github.com/VoltAgent/awesome-claude-code-subagents
- **Fact.** `obra/superpowers` (295,629 stars) is a skills framework with `subagent-driven-development` and `dispatching-parallel-agents` workflows. Source: https://github.com/obra/superpowers
- **Fact.** `oh-my-claudecode` (39,602 stars) is a teams-first orchestration plugin. It has a native in-session `/team` runtime, a tmux worker-pane runtime and a HUD status line with "real-time orchestration metrics". Source: https://github.com/Yeachan-Heo/oh-my-claudecode
- **Fact.** `hesreallyhim/awesome-claude-code` has curated sections for Agent Orchestration, Observability & Monitoring, and Status Lines. Source: https://github.com/hesreallyhim/awesome-claude-code
- **Fact (local observation).** A locally cached third-party plugin, `claude-hud`, describes itself as a "Real-time statusline HUD for Claude Code - context health, tool activity, agent tracking, and todo progress". This was read with `cat ~/.claude/plugins/cache/claude-hud/claude-hud/0.1.0/.claude-plugin/plugin.json`, as recorded in the extensions lane report.

### Orchestrators and parallel-work tools

- **Fact.** Claude Code itself lists five built-in approaches to parallel work: subagents, agent view, agent teams, dynamic workflows and projects. It adds worktrees, cross-session messaging and `/batch`. Source: https://code.claude.com/docs/en/agents
- **Fact.** Agent view (`claude agents`, research preview) shows background sessions in one screen. `claude agents --json` is "the supported way to read session state from outside Claude Code". Source: https://code.claude.com/docs/en/agent-view
- **Fact.** Ruflo (formerly claude-flow, 73,932 stars) installs an MCP server, hooks and a daemon. It offers a `/ruflo` console, and its `ruflo-swarm` mod "shows the swarm in a pane". This is an existing community mod. Source: https://github.com/ruvnet/ruflo
- **Fact.** Several tools run one git worktree per agent and add a session manager on top:
  - Claude Squad: tmux-based, with an instance list and preview/diff tabs. https://github.com/smtg-ai/claude-squad
  - CCManager: Busy, Waiting and Idle indicators, no tmux. https://github.com/kbwo/ccmanager
  - Conductor by Melty Labs: closed source. https://www.conductor.build/
  - Vibe Kanban: now sunsetting. https://github.com/BloopAI/vibe-kanban
  - Agent of Empires. https://github.com/agent-of-empires/agent-of-empires
  - Agent Orchestrator: a live Kanban of workers. https://github.com/OrchestratorInc/agent-orchestrator
  - awslabs CLI Agent Orchestrator. https://github.com/awslabs/cli-agent-orchestrator

### Observability builds

- **Fact.** `disler/claude-code-hooks-multi-agent-observability` sends 12 hook events through HTTP to a Bun server, stores them in SQLite (WAL mode) and pushes them over WebSocket to a Vue timeline, with app and session colour coding. Its last push was 2026-02-08, before `TaskCreated`, `TeammateIdle` and `FileChanged` existed. Source: https://github.com/disler/claude-code-hooks-multi-agent-observability
- **Fact.** `ccusage` analyses token cost from local logs and offers a status line. `claude-code-log` renders transcript JSONL to HTML with a live `watch` mode. `ccstatusline` is a customisable status line. Sources: https://github.com/ccusage/ccusage, https://github.com/daaain/claude-code-log and https://github.com/sirmalloc/ccstatusline
- **Fact.** Claude Code's OpenTelemetry export emits a `subagent_completed` event and beta traces, in which subagent spans nest under the parent's tool span. Content is redacted by default. Source: https://code.claude.com/docs/en/monitoring-usage

### Patterns

- **Interpretation.** Four patterns recur:
  1. hooks feeding a server that drives a live dashboard;
  2. one worktree per agent plus a session manager;
  3. tmux panes as the runtime;
  4. kanban boards.

  Most of these tools show busy/waiting/idle status and diffs. None found renders a per-agent read-to-write provenance view or a view of how the lead combined its workers' outputs.
- **Interpretation.** Agent status is close to solved natively (agent panel, `claude agents`, `/workflows`). Orchestra's distinct value lies in role-framed presentation, data provenance, derived conflicts and a visible synthesis.

### Name collisions for "Orchestra"

- **Fact.** getorchestra.io sells "Orchestra Runtime: The Control Plane for AI Agents", announced 2026-06-30. Source: https://www.getorchestra.io/blog/announcing-orchestra-runtime-the-control-plane-for-ai-agents
- **Fact.** At least six AI-agent repositories are named exactly `orchestra` or `Orchestra`:
  - `lcsmas/orchestra`: parallel Claude Code agents in worktrees. https://github.com/lcsmas/orchestra
  - `Armin2708/Orchestra`: a shared kanban with scope-overlap warnings. https://github.com/Armin2708/Orchestra
  - `DrSeedon/orchestra`. https://github.com/DrSeedon/orchestra
  - `Traves-Theberge/Orchestra`. https://github.com/Traves-Theberge/Orchestra
  - `0xSero/orchestra`, for OpenCode. https://github.com/0xSero/orchestra
  - `mainframecomputer/orchestra`. https://github.com/mainframecomputer/orchestra
- **Fact.** `vyn-store/orchestra-agents` uses the same conductor-and-synthesis concept and publishes an `orchestra` CLI. Source: https://github.com/vyn-store/orchestra-agents
- **Fact.** The npm names `orchestra` and `claude-orchestra` are taken, and the PyPI name `orchestra` belongs to b12io. Sources: https://www.npmjs.com/package/orchestra, https://www.npmjs.com/package/claude-orchestra and https://pypi.org/project/orchestra/
- **Fact.** Orchestra Research (13,277 stars) has a strong presence in the Claude Code skills ecosystem. Source: https://github.com/Orchestra-Research/AI-Research-SKILLs
- **Fact.** Music-themed neighbours include Conductor (https://www.conductor.build/), `openai/symphony` (https://github.com/openai/symphony) and `RunMaestro/Maestro` (https://github.com/RunMaestro/Maestro).
- **Fact.** On 2026-10-05, the npm names and exact GitHub repository names `orchestra-pit`, `orchestra-podium`, `orchestra-console`, `orchestra-baton` and `orchestra-cc` were free. Source: the npm and `gh search repos` checks recorded in `plans/reports/research-261005-1726-community-builds.md` §4.5 (no public page exists for a free name).
- **Interpretation.** No trademark search was done. Treat the getorchestra.io product as the largest brand risk.

## (c) Coding clients and terminal UX

### Name verdicts

- **Fact.** The canonical OpenCode repository is `anomalyco/opencode`. `https://github.com/sst/opencode` resolves to it, and the homepage is https://opencode.ai/. An OpenCode v2 exists (https://opencode.ai/v2), but every OpenCode visual in this report shows v1.x. Source: https://github.com/sst/opencode
- **Fact (local observation).** The orchestrator ran `gh repo view sst/opencode` on 2026-10-05, and it resolved to `anomalyco/opencode`.
- **Fact.** Crush (`charmbracelet/crush`) is the separate continuation of the original Go OpenCode. The archived repository says "The project has continued under the name Crush". The two sides dispute who owned the name; this report takes no side. Sources: https://github.com/opencode-ai/opencode, https://github.com/charmbracelet/crush/discussions/360 and https://github.com/sst/opencode/issues/705
- **Fact.** Pi is Mario Zechner's minimal agent harness. `https://github.com/badlogic/pi-mono` resolves to `earendil-works/pi`, packages live under `@earendil-works/*`, and the site is https://pi.dev/. The old package `@mariozechner/pi-coding-agent` is deprecated. Sources: https://github.com/badlogic/pi-mono and https://registry.npmjs.org/@mariozechner/pi-coding-agent
- **Fact (local observation).** `gh repo view badlogic/pi-mono` resolved to `earendil-works/pi` on 2026-10-05.
- **Fact.** `Physical-Intelligence/openpi` is a robotics vision-language-action model repository, not a coding agent. Source: https://github.com/Physical-Intelligence/openpi
- **Fact.** Community projects named "openpi" are built on Pi and are unaffiliated with both Physical Intelligence and official Pi. Sources: https://github.com/tt-a1i/openpi/blob/main/README.md, https://github.com/heyhuynhgiabuu/openpi and https://github.com/haytamAroui/OpenPi
- **Interpretation.** There is no official "OpenPi" coding agent. "OpenPi" most likely means Pi itself or one of these add-ons, and it is irrelevant to Orchestra's architecture.

### Visual evidence

Every row in this table is a **Visual observation** of the linked media, viewed in Chrome by the coding-clients lane on 2026-10-05.

| Tool | Media link | What is visible |
| --- | --- | --- |
| OpenCode | https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/web/src/assets/lander/screenshot.png | A session header with `39,413 20% ($0.29)`; one dim line per tool (`✱ Grep "…"`, `→ Read path`); `~ Asking questions...`; footer `▣ Build · claude-opus-4-5`; agent/model chip in the input |
| OpenCode | https://opencode.ai/_build/assets/opencode-min-CiEsORKQ.mp4 | At about 11 s, a block `● Explore Task "Find signup/registration code"` with a `├`/`└` tree of the subagent's tool calls and the hint "ctrl+x right, ctrl+x left to navigate between subagent sessions"; a sidebar with context, cost, MCP, LSP and todos; side-by-side diffs; elapsed time in the footer |
| Pi | https://pi.dev/ (in-page demos, no media file) | A session-tree overlay with typed, coloured nodes and failures in red; steering messages queued under a running tool; a dense footer `↑476k ↓38k R8.9M $3.992 (sub) 54.1%/272k` |
| Pi | https://mariozechner.at/posts/2025-11-30-pi-coding-agent/media/header.png | A tinted user block and full-width dark-green bash blocks, with no borders or icons |
| Pi | https://mariozechner.at/posts/2025-11-30-pi-coding-agent/media/subagent.jpeg | A sub-agent run as a bash call to `pi -p "…"`, its answer truncated inside the bash block, then the parent's synthesis |
| Claude Code | https://mintcdn.com/claude-code/HDAmBwgbrZVk0pOt/images/agent-view-dark.png?fit=max&auto=format&n=HDAmBwgbrZVk0pOt&q=85&s=fc3c195bfc57e313ced1f1beb36cee93 | Agent view: `1 awaiting input · 1 working · 2 completed`; rows grouped Needs input / Working / Completed, each with a glyph, name, one-line activity and age |
| Claude Code | https://mintcdn.com/claude-code/nsvRFSDNfpSU5nT7/images/subagents-vs-agent-teams-dark.png?fit=max&auto=format&n=nsvRFSDNfpSU5nT7&q=85&s=d573a037540f2ada6a9ae7d8285b46fd | A diagram, not UI: subagents report back to a main agent, while teammates share a task list and talk laterally |
| Codex CLI | https://raw.githubusercontent.com/openai/codex/main/.github/codex-cli-splash.png | An `• Updated Plan` checklist with the active step in bold cyan and the others dim |
| Gemini CLI | https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/assets/gemini-screenshot.png | A bordered tool box `✓ WriteFile`; a status line `Using: 2 GEMINI.md files \| 2 MCP servers`; red `no sandbox` in the footer |
| Crush | https://github.com/user-attachments/assets/58280caf-851b-470a-b6f7-d5c4ea8a1968 | One frame: `✓ Bash task fmt`; a scrambled-glyph "Thinking..." indicator; a sidebar with model, `22% (45.8K) $3.70`, Modified Files and LSPs |
| Claude Squad | https://raw.githubusercontent.com/smtg-ai/claude-squad/main/assets/screenshot.png | A numbered instance list with branch, diffstat `+48,-47` and a status dot; Preview and Diff tabs for the selected agent |

- **Fact.** Not viewed: the Pi blog videos `subagent.mp4` and `tmux.mp4`, the Claude Squad demo video, and any screenshot of Claude Code's in-process agent panel, split-pane teammates, Ctrl+T task list or `/tasks`. Source: https://mariozechner.at/posts/2025-11-30-pi-coding-agent/
- **Fact.** The mods documentation describes its own screen map in alt text: "A mod can add a pane as a sidebar on the right, a toast at the top right of the transcript, a log line in the transcript, a band above the prompt, and a status line under the prompt." Source: https://code.claude.com/docs/en/plugins/mods/interface

### Observed interaction patterns

- **Interpretation (sessions).** Sessions have a stable human title shown in the window title, header or sidebar, with cwd and version nearby. This rests on the Visual observations of OpenCode, Crush and Claude Squad above. Each Orchestra musician therefore needs a stable name, a role and a colour.
- **Interpretation (agent and task status).** Two roster shapes are proven:
  - a grouped status list with a count summary and one line of current activity per row (the Claude Code agent view);
  - a numbered instance list with a diffstat and a status dot (Claude Squad).

  Rows that need input should come first.
- **Interpretation (parallel activity).** The established pattern is an aggregate count plus drill-down into one transcript. Examples are OpenCode's child-session cycling, Claude Squad's preview tab and the Claude Code agent view. No viewed visual showed several agents' live output at once outside tmux splits, so a full-score view would be new ground.
- **Interpretation (tool use).** The convention is one dim line per tool, made of a verb, a target and an inline result count, which expands on demand. Heavy tools (bash, edits) get blocks. Pi tints blocks by state: green for done, grey for pending.
- **Interpretation (progress).** Spinners carry a verb, plan checklists highlight the active step, elapsed time appears per turn, and cost and context meters are always visible. Orchestra should show these per musician and for the whole ensemble.
- **Interpretation (handoffs).** Visible handoffs are rare. The best examples are OpenCode's `● Explore Task "<brief>"` block and Pi's `pi -p "<brief>"` with the answer returned inline. Orchestra should render a handoff as a first-class event: who handed off, the quoted brief, the artifacts passed and the result returned.
- **Interpretation (errors).** Errors are mostly inline and low-ceremony. OpenCode shows `ERROR` inside a bash block, and Pi shows red failed nodes in its tree. Orchestra needs a roster-level signal as well.

### What does not transfer to Claude Code

- **Fact.** OpenCode is a client/server system whose child sessions are first-class, navigable objects. Claude Code's subagents and teammates live in its agent panel and `/tasks`, with their own background and permission semantics. Sources: https://opencode.ai/docs/agents/ and https://code.claude.com/docs/en/sub-agents
- **Fact.** Pi extensions own the TUI and can draw custom footers and overlays. Pi subagents are separate `pi` processes. Sources: https://pi.dev/ and https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/examples/extensions/subagent/README.md
- **Fact.** Claude Code mods can draw only at named render sites: Pane, AbovePrompt, message and tool rows, Spinner, AskUserQuestion and a few others. The prompt remains Claude Code's own. Source: https://code.claude.com/docs/en/plugins/mods/reference
- **Interpretation.** Orchestra cannot copy OpenCode's session tree, Pi's free-form overlays, or Claude Squad's tmux wrapper, which orchestrates from outside the agent. It must map its views onto Claude Code's render sites and keep the built-in agent panel, `/tasks` and agent view rather than replace them.

## (d) Data operations

### How agent systems represent, share and persist data

- **Fact.** Anthropic's multi-agent research post recommends that subagents "store their work in external systems, then pass lightweight references back to the coordinator", to avoid a "game of telephone". Source: https://www.anthropic.com/engineering/multi-agent-research-system
- **Fact.** Cognition argues that "actions carry implicit decisions, and conflicting decisions carry bad results", and recommends sharing full agent traces. Source: https://cognition.ai/blog/dont-build-multi-agents
- **Fact.** LangGraph gives each state key a reducer. Parallel writes to a key that has no reducer raise `INVALID_CONCURRENT_GRAPH_UPDATE`. Source: https://docs.langchain.com/oss/python/langgraph/errors/INVALID_CONCURRENT_GRAPH_UPDATE
- **Fact.** Google ADK applies state changes as event `state_delta`s through `append_event`, and versions artifacts on every save. Sources: https://google.github.io/adk-docs/sessions/state/ and https://google.github.io/adk-docs/artifacts/
- **Fact.** CrewAI tasks declare which other tasks' outputs they use as `context`. Source: https://docs.crewai.com/en/concepts/tasks
- **Fact.** OpenCode snapshots the git tree hash at each step start and finish, in a separate internal git directory, and records `patch { hash, files[] }` parts. Sources: https://opencode.ai/docs/config/ and https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/v1/session.ts
- **Fact.** Pi stores each session as an append-only JSONL tree linked by `id`/`parentId`, with `context_edit` and `branch_summary` entries. Source: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session-format.md
- **Fact.** W3C PROV models provenance as entities, activities and agents, linked by `used`, `wasGeneratedBy` and `wasDerivedFrom`. Source: https://www.w3.org/TR/prov-primer/

### Concurrency coordination

- **Fact.** Agent teams lock task claiming but not file writes, and the docs advise each teammate to own different files. Source: https://code.claude.com/docs/en/agent-teams
- **Fact.** Edit checks read-before-edit and exact `old_string` matching within one conversation. Source: https://code.claude.com/docs/en/tools-reference
- **Interpretation.** That check is per conversation, so it cannot catch a stale read by one musician followed by a write from another.
- **Fact.** Git worktrees give each agent its own checkout. Claude Code supports worktree-isolated subagents (`isolation: worktree`). Sources: https://git-scm.com/docs/git-worktree and https://code.claude.com/docs/en/worktrees
- **Fact.** MCP Agent Mail uses advisory file leases with TTLs and returns `FILE_RESERVATION_CONFLICT`. Source: https://github.com/Dicklesworthstone/mcp_agent_mail
- **Fact.** HTTP `If-Match` exists "to prevent the 'lost update' problem". Source: https://www.rfc-editor.org/rfc/rfc9110#section-13.1.1
- **Interpretation.** Worktrees move conflicts to merge time. Leases can be enforced at `PreToolUse` for Edit and Write, but not for Bash. The If-Match idea, comparing the content hash a musician last read with the hash just before its write, catches stale writes early.

### State, errors and history

- **Fact.** Claude Code's `/rewind` does not restore subagent edits or Bash changes. Source: https://code.claude.com/docs/en/checkpointing
- **Fact.** Agent SDK session forks branch the conversation but not the filesystem. Source: https://code.claude.com/docs/en/agent-sdk/sessions
- **Fact.** A failed background subagent is marked failed, and its last output is returned "so partial work isn't lost". `StopFailure` reports error types such as `rate_limit` and `overloaded`. Sources: https://code.claude.com/docs/en/sub-agents and https://code.claude.com/docs/en/hooks
- **Fact.** Event sourcing allows complete rebuild, temporal query and replay from an append-only log of changes. Source: https://martinfowler.com/eaaDev/EventSourcing.html
- **Fact.** The OpenTelemetry GenAI agent spans (`invoke_agent`, `invoke_workflow`, `execute_tool`) are still at Development status. Source: https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md
- **Interpretation.** No surveyed system shows "which agent changed this file, based on what it read". Orchestra's own content-addressed versions are needed for per-musician history and undo.

### What Claude Code hooks and mod events expose

- **Fact.** Settings hooks expose:
  - `agent_id` and `agent_type` inside subagents;
  - an absolute `file_path` for Read, Edit and Write;
  - the Bash `command`;
  - `tool_use_id`;
  - `PostToolUse(Agent)` results with `agentId`, `status` and `content`;
  - `SubagentStop` with `agent_transcript_path` and `last_assistant_message`;
  - `FileChanged` events from a filesystem watcher.

  Source: https://code.claude.com/docs/en/hooks
- **Fact.** `tool_response.bashEditDiff` is beta and best-effort. It lists `changedFiles`, sets `shared` when another agent's Bash ran in the same repository at the same time, and is recorded by default only in auto or bypassPermissions mode. Source: https://code.claude.com/docs/en/hooks
- **Fact.** Mod events add per-loop `agentId` on `tool.call`, `parentAgentId` on `agent.spawn`, per-agent answers on `turn.complete`, and inter-agent messages on `session.send` and `session.receive`. Source: https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts
- **Fact.** What neither exposes, or documents:
  - Bash reads, which are visible only as command strings;
  - the `SendMessage` tool input schema, which the hooks page does not document;
  - the mailbox and task-list file formats;
  - musicians' decisions and assumptions;
  - whether hooks in split-pane teammate processes carry `agent_id`.

  The transcript path "may lag". Sources: https://code.claude.com/docs/en/hooks and https://code.claude.com/docs/en/agent-teams
- **Fact.** `PostToolUse` fires concurrently for parallel tool calls. `PostToolBatch` fires once per batch. Source: https://code.claude.com/docs/en/hooks

## (e) Implications for the conductor-and-musicians concept

### Vocabulary

Every row in this table is **Interpretation**: a mapping chosen for Orchestra.

| Orchestra term | Meaning | Claude Code anchor |
| --- | --- | --- |
| Conductor | The coordinating main agent | Plugin `agent` setting |
| Musician (instrument) | A specialised subagent with a colour | `agents/*.md` |
| Part | An assigned task given to one musician | An Agent tool call (`part.assigned`) |
| Measure | One progress step within a part | Tool calls and turn steps |
| Tacet | Assigned but not started | Before `SubagentStart` or `agent.spawn` |
| Score | The plan plus the timeline of what happened | A fold over the ledger |
| Coda | The combined result | A fold over the ledger, not musicians' prose |

### Orchestrator design decisions

1. **Interpretation.** Orchestra ships as one Claude Code plugin.
   - Evidence: a plugin carries agents, hooks, a mod and settings together, and the plugin namespace keeps its components distinct (https://code.claude.com/docs/en/plugins-reference).
   - Evidence: the community tools that live outside Claude Code, such as tmux wrappers and desktop apps, cannot draw inside it ((b) and (c) above).
2. **Interpretation.** The conductor is made the session's main agent through the plugin `settings.json` `agent` key.
   - Evidence: plugin settings honour only `agent` and `subagentStatusLine`, and the agent's prompt replaces the default system prompt (https://code.claude.com/docs/en/plugins-reference, https://code.claude.com/docs/en/sub-agents).
   - Constraint: because plugin agents ignore `hooks` and `permissionMode`, the conductor's guardrails must live in the plugin's hooks or the mod.
3. **Interpretation.** Musicians are subagents in `agents/`, each with a `color`.
   - Evidence: `color` is the native display colour "in the task list and transcript" (https://code.claude.com/docs/en/sub-agents).
   - Evidence: colour-as-identity is a pattern seen in OpenCode's agent `color` (https://opencode.ai/docs/agents/) and in disler's colour coding.
   - Limit: only eight colours exist, so ensembles larger than eight need a second identifier, such as a name prefix.
4. **Interpretation.** A mod draws the Orchestra interface, which has five surfaces.

   **The Orchestra pane.** It has four tabs:
   - **Ensemble**: the roster;
   - **Score**: the plan and timeline;
   - **Artifacts**: versions and provenance;
   - **Coda**: the derived combined result.

   Evidence: panes support tabs and sit beside the transcript when the terminal is wide (https://code.claude.com/docs/en/plugins/mods/interface). The tab set reflects the roster, tree and diff views seen in Claude Squad, Pi and OpenCode.

   **A band above the prompt.** The `AbovePrompt` band shows a compact roster: each musician with a state glyph and its measures.
   - Evidence: the agent-view rows (glyph, one-line activity, age) and the count summary `1 awaiting input · 1 working · 2 completed` (Visual observation above).
   - Constraint: the band is shared with every other mod.

   **Toasts.** Toasts announce conflicts, failures, stale reads and handoffs.
   - Evidence: `$.ui.toast` exists (https://code.claude.com/docs/en/plugins/mods/api).
   - Evidence: errors in other clients are low-ceremony and inline, so roster-level signals fill a gap.

   **A status line.** It is drawn with `$.ui.status` and carries the `⚠ <mod>:` prefix.
   - Evidence: https://code.claude.com/docs/en/plugins/mods/api
   - Constraint: a plugin cannot set the main `statusLine`.

   **Instrument-prefixed tool rows.** The mod redraws `ToolUse` rows to prefix the instrument.
   - Evidence: tool rows are redrawable render sites keyed by tool call id (https://code.claude.com/docs/en/plugins/mods/reference).
   - Evidence: `tool.call` carries `agentId`, so the mod can join a row's id to a musician.
   - Evidence: one-line verb-and-target tool rows are the cross-client convention.

5. **Interpretation.** An append-only ledger at `.orchestra/ledger.jsonl` is the single source of truth.
   - Artifact versions are identified by content hash.
   - Every write records the version that musician last read (read-before-write provenance).
   - Conflicts and stale reads are derived from versions, never declared by agents.
   - The conductor's coda is derived from the ledger, not from musicians' prose.

   Evidence:
   - event sourcing and ADK's `append_event` (https://martinfowler.com/eaaDev/EventSourcing.html, https://google.github.io/adk-docs/sessions/state/);
   - PROV `used`/`wasDerivedFrom` (https://www.w3.org/TR/prov-primer/);
   - If-Match (https://www.rfc-editor.org/rfc/rfc9110#section-13.1.1);
   - Anthropic's artifact-reference advice (https://www.anthropic.com/engineering/multi-agent-research-system);
   - the provenance gap found in (b).

   Caveat: the data lane recommends a single serialising writer, because hooks fire concurrently. The mod's in-process handler can be that writer.
6. **Interpretation.** Settings hooks provide a fallback for event capture where mods cannot run or cannot draw, and there is no UI in that mode.
   - Where mods cannot load: an organisation's `allowManagedModsOnly`, a user's `disableAllHooks`, `--bare`, `--safe-mode` or the rollout flag.
   - Where mods cannot draw: VS Code chat, `-p` and cloud sessions.
   - Evidence: settings hooks run in every surface, and mods draw only in the terminal and Desktop (https://code.claude.com/docs/en/hooks, https://code.claude.com/docs/en/plugins/mods/overview).
   - Correction to the brief: the docs say mod *hooks* do run in VS Code, `-p` and cloud. Only the drawing is missing there. The fallback is therefore needed mainly where the mod is disabled or not loaded. Where the mod loads but cannot draw, the fallback must not double-write events.
7. **Interpretation.** The conductor asks the user to resolve conflicts through the `AskUserQuestion` dialog.
   - Evidence: `AskUserQuestion` is a native dialog and a render site the mod can redraw, for example to show the conflicting versions (https://code.claude.com/docs/en/plugins/mods/reference).
   - Evidence: LangGraph's `interrupt()` is a precedent for human-in-the-loop resolution (https://docs.langchain.com/oss/python/langgraph/interrupts).
8. **Interpretation.** Orchestra starts with subagents, not agent teams.
   - Evidence: teams are experimental and off by default, file writes are not locked, there is no resume, and there is one team per session (https://code.claude.com/docs/en/agent-teams).
   - Evidence: whether a mod sees split-pane teammates' tool calls is unknown (see (f)).
   - Teams can be added later, because subagent definitions double as teammate roles.

- **Interpretation.** Following Cognition, musicians should record decisions explicitly, for example as a structured report section or through a small MCP tool, because hooks cannot observe decisions. The conductor can share the decision log with new musicians through `SubagentStart.additionalContext` (https://code.claude.com/docs/en/hooks).

## (f) Unknowns and assumptions to resolve before implementation

- **Fact.** There is evidence on both sides about whether installed-plugin mods load for this account.
  - The docs say mods "are on by default" from v2.1.287, and that a mod installs like any plugin (https://code.claude.com/docs/en/plugins/mods/overview).
  - The 2.1.289 binary contains "installed plugins' hooks modules not loaded: rollout flag (", plus the identifiers `hooksModulesRolloutOn` and `hooksModulesRolloutSource` (scout report, from `strings` on the binary).
  - The same docs page says the authoring plugin loads "unless Anthropic has turned installed mods off remotely" (https://code.claude.com/docs/en/plugins/mods/overview).
- **Interpretation.** Stage 3 must load a minimal mod with `--plugin-dir` and through a real install, then confirm which mods the session loaded before building on mods.
- **Interpretation.** Split-pane teammates are separate processes, so a lead-session mod may not see their `tool.call` events. This needs a live test, as does whether `$.store` can bridge the processes. Background: https://code.claude.com/docs/en/agent-teams
- **Interpretation.** Under concurrency, Bash write attribution is uncertain.
  - `bashEditDiff` is best-effort, off by default outside auto and bypassPermissions modes, and flagged `shared` when Bash calls overlap (https://code.claude.com/docs/en/hooks).
  - Orchestra should show such writes as low-confidence attributions and reconcile them with tree snapshots at the end of each part.
- **Interpretation.** Handoffs and decisions are hard to capture.
  - The `SendMessage` tool input is undocumented on the hooks page, and mailbox formats are undocumented (https://code.claude.com/docs/en/hooks, https://code.claude.com/docs/en/agent-teams).
  - Handoff capture needs a live `PreToolUse` probe or the mod's `session.send` event.
  - Decisions need an explicit Orchestra convention.
- **Fact.** The mods API is churning. The published `claude-code.d.ts` is stamped `// Written by Claude Code 2.1.277`, while the docs require v2.1.287. The 2.1.288 and 2.1.289 changelog entries are mostly mod fixes. Sources: https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts and https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md
- **Interpretation.** Orchestra should pin a minimum version and build against the build-exact types that Claude Code writes into `<mod>/.claude-plugin/types/` (https://code.claude.com/docs/en/plugins/mods/create).
- **Fact.** Organisation policy can disable mods: `allowManagedModsOnly` and `disableAllHooks` stop installed mods, and `allowManagedHooksOnly` affects plugin hooks. Source: https://code.claude.com/docs/en/plugins/mods/overview
- **Interpretation.** The hooks-only fallback and the built-in panels must remain usable when that happens.
- **Interpretation.** It is not yet confirmed whether a subagent's tool calls produce `ToolUse` rows in the main transcript at all. If they do not, the instrument prefix only appears in the pane and in the subagent's own transcript. This must be observed in Stage 3. Background: https://code.claude.com/docs/en/plugins/mods/reference
- **Interpretation.** Several details of the ledger writer remain open:
  - how `.orchestra/ledger.jsonl` is appended safely, given that `$.fs.write` is not atomic (https://code.claude.com/docs/en/plugins/mods/reference);
  - how the fallback hooks, which are separate processes, avoid interleaved appends;
  - whether `.orchestra/` should be git-ignored.
- **Interpretation.** The name "Orchestra" collides with many projects. Candidate repository and plugin names, free on npm and GitHub as of 2026-10-05, are `orchestra-pit`, `orchestra-podium`, `orchestra-console` and `orchestra-cc` (community lane report §4.5). The plugin name also becomes the agent namespace, as in `orchestra-pit:conductor`. A trademark check has not been done.
- **Fact (local observation).** `gh` is logged in as the GitHub account `krzemienski` (scout report).
- **Interpretation.** The public destination and visibility for Stage 3 (owner, repository name, public or private) must be confirmed by the user. This report does not assume them.
- **Interpretation.** The pane auto-opens only at 144 columns or more (https://code.claude.com/docs/en/plugins/mods/interface). The band and status line must carry the essentials on narrow terminals, and the user can open the pane with a command.

## Sources

All links were accessed on 2026-10-05.

**Claude Code documentation**
- https://code.claude.com/docs/en/plugins/mods/overview
- https://code.claude.com/docs/en/plugins/mods/reference
- https://code.claude.com/docs/en/plugins/mods/interface
- https://code.claude.com/docs/en/plugins/mods/api
- https://code.claude.com/docs/en/plugins/mods/create
- https://code.claude.com/docs/en/plugins-reference
- https://code.claude.com/docs/en/plugins/components
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/agent-teams
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/output-styles
- https://code.claude.com/docs/en/statusline
- https://code.claude.com/docs/en/permission-modes
- https://code.claude.com/docs/en/fast-mode
- https://code.claude.com/docs/en/workflows
- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/agent-sdk/subagents
- https://code.claude.com/docs/en/agent-sdk/typescript
- https://code.claude.com/docs/en/agent-sdk/sessions
- https://code.claude.com/docs/en/agents
- https://code.claude.com/docs/en/agent-view
- https://code.claude.com/docs/en/checkpointing
- https://code.claude.com/docs/en/worktrees
- https://code.claude.com/docs/en/tools-reference
- https://code.claude.com/docs/en/monitoring-usage

**Claude Code source and samples**
- https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md
- https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts
- https://github.com/anthropics/claude-plugins-official

**Community plugins, orchestrators and observability**
- https://github.com/wshobson/agents
- https://github.com/VoltAgent/awesome-claude-code-subagents
- https://github.com/obra/superpowers
- https://github.com/Yeachan-Heo/oh-my-claudecode
- https://github.com/hesreallyhim/awesome-claude-code
- https://github.com/ruvnet/ruflo
- https://github.com/smtg-ai/claude-squad
- https://github.com/kbwo/ccmanager
- https://www.conductor.build/
- https://github.com/BloopAI/vibe-kanban
- https://github.com/agent-of-empires/agent-of-empires
- https://github.com/OrchestratorInc/agent-orchestrator
- https://github.com/awslabs/cli-agent-orchestrator
- https://github.com/disler/claude-code-hooks-multi-agent-observability
- https://github.com/ccusage/ccusage
- https://github.com/daaain/claude-code-log
- https://github.com/sirmalloc/ccstatusline
- https://github.com/Dicklesworthstone/mcp_agent_mail

**Name collisions**
- https://www.getorchestra.io/blog/announcing-orchestra-runtime-the-control-plane-for-ai-agents
- https://github.com/lcsmas/orchestra
- https://github.com/Armin2708/Orchestra
- https://github.com/DrSeedon/orchestra
- https://github.com/Traves-Theberge/Orchestra
- https://github.com/0xSero/orchestra
- https://github.com/mainframecomputer/orchestra
- https://github.com/vyn-store/orchestra-agents
- https://github.com/Orchestra-Research/AI-Research-SKILLs
- https://www.npmjs.com/package/orchestra
- https://www.npmjs.com/package/claude-orchestra
- https://pypi.org/project/orchestra/
- https://github.com/openai/symphony
- https://github.com/RunMaestro/Maestro

**Coding clients**
- https://github.com/sst/opencode
- https://opencode.ai/
- https://opencode.ai/v2
- https://opencode.ai/docs/agents/
- https://opencode.ai/docs/config/
- https://github.com/anomalyco/opencode/blob/dev/packages/schema/src/v1/session.ts
- https://github.com/opencode-ai/opencode
- https://github.com/charmbracelet/crush/discussions/360
- https://github.com/sst/opencode/issues/705
- https://github.com/badlogic/pi-mono
- https://registry.npmjs.org/@mariozechner/pi-coding-agent
- https://pi.dev/
- https://mariozechner.at/posts/2025-11-30-pi-coding-agent/
- https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/examples/extensions/subagent/README.md
- https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session-format.md
- https://github.com/Physical-Intelligence/openpi
- https://github.com/tt-a1i/openpi/blob/main/README.md
- https://github.com/heyhuynhgiabuu/openpi
- https://github.com/haytamAroui/OpenPi

**Visual media**
- https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/web/src/assets/lander/screenshot.png
- https://opencode.ai/_build/assets/opencode-min-CiEsORKQ.mp4
- https://mariozechner.at/posts/2025-11-30-pi-coding-agent/media/header.png
- https://mariozechner.at/posts/2025-11-30-pi-coding-agent/media/subagent.jpeg
- https://mintcdn.com/claude-code/HDAmBwgbrZVk0pOt/images/agent-view-dark.png?fit=max&auto=format&n=HDAmBwgbrZVk0pOt&q=85&s=fc3c195bfc57e313ced1f1beb36cee93
- https://mintcdn.com/claude-code/nsvRFSDNfpSU5nT7/images/subagents-vs-agent-teams-dark.png?fit=max&auto=format&n=nsvRFSDNfpSU5nT7&q=85&s=d573a037540f2ada6a9ae7d8285b46fd
- https://raw.githubusercontent.com/openai/codex/main/.github/codex-cli-splash.png
- https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/assets/gemini-screenshot.png
- https://github.com/user-attachments/assets/58280caf-851b-470a-b6f7-d5c4ea8a1968
- https://raw.githubusercontent.com/smtg-ai/claude-squad/main/assets/screenshot.png

**Data operations, frameworks and standards**
- https://www.anthropic.com/engineering/multi-agent-research-system
- https://cognition.ai/blog/dont-build-multi-agents
- https://docs.langchain.com/oss/python/langgraph/errors/INVALID_CONCURRENT_GRAPH_UPDATE
- https://docs.langchain.com/oss/python/langgraph/interrupts
- https://google.github.io/adk-docs/sessions/state/
- https://google.github.io/adk-docs/artifacts/
- https://docs.crewai.com/en/concepts/tasks
- https://git-scm.com/docs/git-worktree
- https://www.rfc-editor.org/rfc/rfc9110#section-13.1.1
- https://martinfowler.com/eaaDev/EventSourcing.html
- https://www.w3.org/TR/prov-primer/
- https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md
