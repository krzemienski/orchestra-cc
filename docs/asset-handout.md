# Orchestra asset handout

What Orchestra needs, what already exists, and the one thing you have to get yourself: an ElevenLabs account for the spoken coda. Audited on 2026-10-10 and re-checked on 2026-10-12 across `plugin/`, `prototype/`, `docs/`, `plans/` and the root files. `e2e-evidence/` holds run evidence; the only images in it that are Orchestra's own are listed below, and there is no audio in it.

## The short answer

Everything Orchestra draws or writes is already in the repository, as code. There are no font, audio or video files to collect: the glyphs are Unicode characters in `plugin/hooks/views.js` and `plugin/hooks/motion.js`, the colours are tokens in `plugin/hooks/palette.js`, the prototype's fonts load from Google Fonts, and the sample performance is `prototype/scenario.js`. The only images are the documentation screenshots in `docs/screenshots/`, made from a live session.

The only asset that has to come from outside is a voice. Orchestra reads the coda aloud through ElevenLabs (`plugin/narrate/voice.mjs`), and that needs three things only you can supply: an API key, a voice, and the language that voice should speak. One more is optional: an icon for Anthropic's plugin directory, which nothing in the repository is an image of.

## What you need to acquire

| Asset | Exact form | Where it goes | What reads it |
| --- | --- | --- | --- |
| ElevenLabs API key | The key string from elevenlabs.io → Developers → API Keys, with access to Text to Speech and Voices (read) | The environment variable `ELEVENLABS_API_KEY` in the shell you start Claude Code from, for example a line `export ELEVENLABS_API_KEY=…` in `~/.zshrc`. Never in the repository, a settings file or the plugin options | `plugin/narrate/voice.mjs` (`process.env.ELEVENLABS_API_KEY`). The mod never reads it: the sidecar inherits Claude Code's environment |
| A voice | An ElevenLabs voice id, a 20-character string such as `JBFqnCBsd6RMkjVDRZzb`, for a voice in your account's library. Best: one verified for the language below on the model you use; with `eleven_v4` any voice can speak the language | The plugin option `voiceId` | `plugin/hooks/register.js` (`voice.voiceId`), sent to the sidecar on standard input |
| The voice's language | An ISO 639-1 code. The coda and its narration are written in English, so `en`; choose another code only if you change what is spoken | The plugin option `voiceLanguage` (default `en`) | `voice.mjs` sends it as `language_code` (every model but `eleven_multilingual_v2`), and refuses a voice whose `verified_languages` entries for that model name only other languages |
| A model (optional) | An ElevenLabs model id. The default is `eleven_v4` (10,000 characters, speaks the requested language without the voice's own accent, takes `language_code`). `eleven_multilingual_v2` (10,000) cannot take `language_code`, so the language can drift. `eleven_flash_v2_5` (40,000) and `eleven_v3` (5,000) also work. `eleven_v4_turbo` does not: the docs place it on text-to-dialogue only | The plugin option `voiceModel` | `voice.mjs` reads the real per-request limit from `GET /v1/models` and cuts text longer than it at a sentence end; the Coda tab says so |

Output: `.orchestra/performances/<session>-coda.mp3` in the project where the performance ran (MP3, 44.1 kHz, 128 kbps, `mp3_44100_128`), beside `<session>-coda.md`. Nothing is written to the plugin.

## Setup, step by step

1. Create an ElevenLabs account and an API key (Developers → API Keys). Give it Text to Speech and read access to Voices.
2. Put the key in the environment Claude Code starts from, then open a new terminal:
   ```sh
   echo 'export ELEVENLABS_API_KEY=<your key>' >> ~/.zshrc
   ```
3. Pick a voice that speaks the language. From the plugin folder:
   ```sh
   node plugin/narrate/voice.mjs --voices en
   ```
   It reads every page of your account's voices and prints `voice_id  name  verified (accents)` for each voice verified for that language on the default model, and `no language data` for one that has no verification for that model (usable with `eleven_v4`, which speaks the language anyway). For another language, `--voices hi`, `--voices es` and so on; add a model id to check against it, `--voices hi eleven_flash_v2_5`. `node plugin/narrate/voice.mjs --models` lists the models your account can use for speech, their character limits and languages.
4. Set the plugin options in `/config` (Orchestra's options) or from a shell:
   ```sh
   printf '{"voiceCoda":true,"voiceId":"<voice id>","voiceLanguage":"en"}' | claude plugin configure orchestra --values-stdin
   ```
5. Run a performance: `claude --agent orchestra:conductor`. When the conductor's turn ends with every part settled, the coda (or its narration, if **Narrate the coda** is on) is read aloud into the MP3, a toast names the file, and the Coda tab shows "Spoken by ElevenLabs" with the voice and language. `/orchestra voice` reads the current coda again at any time.
6. If something is wrong, the Coda tab and a toast give the reason, for example `ElevenLabs answered 401 for /v1/voices/… (unauthorized: Invalid API key)`, `voice … is not verified for "hi" on eleven_v4`, or `eleven_v4_turbo cannot do text to speech on this account`.

Each reading is billed to your ElevenLabs account, about one credit per character on most plans. An unchanged coda is not read twice.

## Why each missing asset cannot be made from what is here

- **The API key.** It is a credential tied to your ElevenLabs account and billing. Nothing in the repository or this machine holds one (`ELEVENLABS_API_KEY` is not set in this session), and it must never be committed, so it cannot be generated or repurposed.
- **The voice.** ElevenLabs voices live in your account's voice library; a voice id is only usable by an account that has the voice. The repository holds no audio at all (the audit found no `.mp3`, `.wav` or other audio file anywhere, and no text-to-speech code before `voice.mjs`), so there is no recording to clone from, and cloning someone's voice needs their consent in any case.
- **The language choice.** It depends on who will listen. The default, `en`, matches what Orchestra writes; any other choice is yours.
- **The plugin-directory icon (optional).** Anthropic's plugin directory reads an `icon` from `plugin/.claude-plugin/plugin.json`. Nothing in the repository is an image of Orchestra's mark: the mark is the text glyph `𝄐`, and the screenshots are of the pane, not a logo. An icon is a brand decision (the mark as drawn, its colours, its crop), so it is listed rather than invented. If you want one: an image file inside the plugin, for example `plugin/logo.png`, named in `plugin.json` as `"icon": "./logo.png"`. The plugins reference sets no size or format; a square PNG is the safe choice. Claude Code ignores the field at load time; only the directory listing reads it.

What could be repurposed, and was: the narrated coda from `plugin/narrate/narrate.mjs` is already plain prose, so it is what the voice reads when narration is on; otherwise `register.js` turns the coda into plain sentences (no Markdown marks, ledger path or hashes) before sending it.

One alternative was considered and rejected. Claude Code's mods API offers `$.audio.speak`, which runs macOS `say`, and `$.audio.play`. It was not built: it is not ElevenLabs, it only exists on macOS, and it would be a second voice path to keep honest. The mod still makes no audio call of its own.

## Everything the audit found

Line numbers are as of version 0.1.7.

| Asset | Defined at (file:line) | Status |
| --- | --- | --- |
| State glyphs `· ♪ ‖ ✓ ✕` | `plugin/hooks/views.js:8` (`GLYPH`) | In code |
| Score legend glyphs `─ ┊ │┃ ○ ← ● · ◆ ✓ ✕ ‼ ⚠ ?` | `plugin/hooks/views.js:66` (`LEGEND`) | In code |
| Motion glyphs: notes `♩ ♪ ♫ ♬`, baton `╲ │ ╱ │`, activity bar `▁…█`, join/rest/stop steps | `plugin/hooks/motion.js:8`, `:11`, `:12`, `:14-16` | In code |
| Handoff arrow `━…▶`, pulse `─…•…─`, held note `♪━━` | `plugin/hooks/motion.js:89` (`travel`), `:49` (`pulse`), `:93` (`sustain`) | In code |
| Orchestra mark `𝄐` (U+1D110) | `plugin/hooks/views.js:89`, `:161`, `:260`; `plugin/hooks/register.js:1600`; `prototype/app.js:71`, `:398`, `:455`, `:579` | In code. It lies outside the Basic Multilingual Plane, so a terminal font without it draws a box (`docs/orchestra-prototype-design.md` notes this). Nerd Fonts and JetBrains Mono have it |
| Agent-row mark `◌` (not yet playing) | `plugin/hooks/register.js:1615` | In code |
| Prototype-only glyphs (`◌` tuning, `→`, `\|`) | `prototype/app.js:10` (`STATE_GLYPH`), `:490` (legend) | In code |
| Terminal colour tokens (10; dark, light, xterm-256, ANSI) | `plugin/hooks/palette.js:13` (`TOKENS`) | In code |
| Pane ground (black, white, or Claude Code's under ANSI) | `plugin/hooks/palette.js:79` (`ground`), used at `plugin/hooks/views.js:99` | In code |
| Agent colours in Claude Code's agent list | `plugin/agents/conductor.md:4` (cyan), `violin.md:5` (blue), `trumpet.md:5` (yellow), `flute.md:5` (green), `timpani.md:5` (red), `cello.md:5` (purple) | In code |
| Prototype colours and section variables | `prototype/styles.css:18` (`--term-bg`), `:24-28` (sections) | In code |
| Prototype fonts: Inter, JetBrains Mono | `prototype/index.html:9` (Google Fonts); fallbacks `prototype/styles.css:33-34` | Remote; offline the fallbacks are used |
| PRD map fonts: Instrument Serif, IBM Plex Sans, IBM Plex Mono | `docs/orchestra-prd-map.html:9` (one `css2` URL) | Remote |
| PRD map instrument colours | `docs/orchestra-prd-map.html:158-160`, `:483-492` (copied from `palette.js`) | In code, but it will drift if the palette changes |
| PRD map diagrams | `docs/orchestra-prd-map.html:573-574` (Mermaid 11, `@mermaid-js/layout-elk`, jsDelivr) | Remote |
| Plugin directory icon | Not set: `plugin/.claude-plugin/plugin.json:1-47` has no `icon` | Optional; see the icon entry under "Why each missing asset cannot be made" |
| README and guide screenshots | `docs/screenshots/*.png`, embedded at `README.md:15` and in `docs/guide.md` section 4 | In repo. Rendered by `.planning/live/ansi2png.py` from a live session's `tmux capture-pane -e`; the captures are in `e2e-evidence/run-20261012-voice-theme-motion/shots/` |
| Research reference media | Linked from `docs/orchestra-research-report.md` and `docs/orchestra-prd.md` (third-party screenshots, mp4, gif) | Remote, third-party; reference only, not reusable |
| Sample performance | `prototype/scenario.js:29` (`OPENING`) and `continuation` | In repo |
| Eval case and scaffold | `plugin/evals/ensemble-records/case.yaml:2`, `:7`; `scaffold.sh` | In repo |
| Test fixture events | `plugin/tests/ledger.test.ts:29` | In repo |
| Narration model | `plugin/narrate/narrate.mjs:5` (import), `:7` (`claude-opus-5-5`); `plugin/narrate/package.json:7` (`@anthropic-ai/claude-agent-sdk` 0.3.296) | Installed on demand (`npm install --prefix plugin/narrate`); uses your Claude Code login |
| Voice | `plugin/narrate/voice.mjs:15` (`api.elevenlabs.io`), `:18` (default model); options `plugin/.claude-plugin/plugin.json:18-45` (`voiceCoda` to `voiceModel`) | **Needs your key and voice** |

One unrelated finding: `.codex/config.toml` names the package `@modelcontextprotocol/serversequentialthinking`; the published name is `@modelcontextprotocol/server-sequential-thinking`. Orchestra does not use that file.
