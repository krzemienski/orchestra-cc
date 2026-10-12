# Orchestra asset handout

What Orchestra needs, what already exists, and the one thing you have to get yourself: an ElevenLabs account for the spoken coda. Audited on 2026-10-10 and re-checked on 2026-10-12 across `plugin/`, `prototype/`, `docs/`, `plans/` and the root files. `e2e-evidence/` holds run evidence; the only images in it that are Orchestra's own are listed below, and there is no audio in it.

## The short answer

Everything Orchestra draws or writes is already in the repository, as code. There are no image, audio, font or video files to collect: the glyphs are Unicode characters in `plugin/hooks/views.js` and `plugin/hooks/motion.js`, the colours are tokens in `plugin/hooks/palette.js`, the prototype's fonts load from Google Fonts, and the sample performance is `prototype/scenario.js`.

The only missing asset is a voice. Orchestra can now read the coda aloud through ElevenLabs (`plugin/narrate/voice.mjs`), and that needs three things only you can supply: an API key, a voice, and the language that voice should speak.

## What you need to acquire

| Asset | Exact form | Where it goes | What reads it |
| --- | --- | --- | --- |
| ElevenLabs API key | The key string from elevenlabs.io → Developers → API Keys, with access to Text to Speech and Voices (read) | The environment variable `ELEVENLABS_API_KEY` in the shell you start Claude Code from, for example a line `export ELEVENLABS_API_KEY=…` in `~/.zshrc`. Never in the repository, a settings file or the plugin options | `plugin/narrate/voice.mjs` (`process.env.ELEVENLABS_API_KEY`). The mod never reads it: the sidecar inherits Claude Code's environment |
| A voice | An ElevenLabs voice id, a 20-character string such as `JBFqnCBsd6RMkjVDRZzb`, for a voice in your account's library that is verified for the language below | The plugin option `voiceId` | `plugin/hooks/register.js` (`voice.voiceId`), sent to the sidecar on standard input |
| The voice's language | An ISO 639-1 code. The coda and its narration are written in English, so `en`; choose another code only if you change what is spoken | The plugin option `voiceLanguage` (default `en`) | `voice.mjs` checks the voice's `verified_languages` and refuses a voice that is not verified for it |
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
   It prints `voice_id  name  verified (accents)` for each voice in your account verified for that language. For another language, `--voices hi`, `--voices es` and so on; add a model id to check against it, `--voices hi eleven_flash_v2_5`.
4. Set the plugin options in `/config` (Orchestra's options) or from a shell:
   ```sh
   printf '{"voiceCoda":true,"voiceId":"<voice id>","voiceLanguage":"en"}' | claude plugin configure orchestra --values-stdin
   ```
5. Run a performance: `claude --agent orchestra:conductor`. When the conductor's turn ends with every part settled, the coda (or its narration, if **Narrate the coda** is on) is read aloud into the MP3, a toast names the file, and the Coda tab shows "Spoken by ElevenLabs" with the voice and language. `/orchestra voice` reads the current coda again at any time.
6. If something is wrong, the Coda tab and a toast give ElevenLabs' own reason, for example `ElevenLabs answered 401 for /v1/voices/… (unauthorized: Invalid API key)` or `voice … is not verified for "hi" on eleven_multilingual_v2`.

Each reading is billed to your ElevenLabs account, about one credit per character on most plans. An unchanged coda is not read twice.

## Why each missing asset cannot be made from what is here

- **The API key.** It is a credential tied to your ElevenLabs account and billing. Nothing in the repository or this machine holds one (`ELEVENLABS_API_KEY` is not set in this session), and it must never be committed, so it cannot be generated or repurposed.
- **The voice.** ElevenLabs voices live in your account's voice library; a voice id is only usable by an account that has the voice. The repository holds no audio at all (the audit found no `.mp3`, `.wav` or other audio file anywhere, and no text-to-speech code before `voice.mjs`), so there is no recording to clone from, and cloning someone's voice needs their consent in any case.
- **The language choice.** It depends on who will listen. The default, `en`, matches what Orchestra writes; any other choice is yours.

What could be repurposed, and was: the narrated coda from `plugin/narrate/narrate.mjs` is already plain prose, so it is what the voice reads when narration is on; otherwise `register.js` turns the coda into plain sentences (no Markdown marks, ledger path or hashes) before sending it.

One alternative was considered and rejected. Claude Code's mods API offers `$.audio.speak`, which runs macOS `say`, and `$.audio.play`. It was not built: it is not ElevenLabs, it only exists on macOS, and it would be a second voice path to keep honest. The mod still makes no audio call of its own.

## Everything the audit found

| Asset | Where it lives | Status |
| --- | --- | --- |
| Musician and score glyphs (`· ♪ ‖ ✓ ✕`, `♩ ♪ ♫ ♬`, `╲│╱`, `▁…█`, `─ ┊ │┃`, `○ ← ● ◆ ‼ ⚠ ?`) | `plugin/hooks/views.js`, `plugin/hooks/motion.js` | In code |
| Terminal colour tokens (10 tokens; dark, light, xterm-256 and ANSI values) | `plugin/hooks/palette.js` | In code |
| Agent colours in Claude Code's agent list | `plugin/agents/*.md` frontmatter | In code |
| Prototype colours and section variables | `prototype/styles.css` | In code |
| Prototype fonts: Inter, JetBrains Mono | Google Fonts, linked from `prototype/index.html`; system fallbacks in `styles.css` | Remote; offline the fallbacks are used |
| PRD map fonts: Instrument Serif, IBM Plex Sans, IBM Plex Mono | Google Fonts, all three in the `css2` URL in `docs/orchestra-prd-map.html` | Remote |
| PRD map instrument colours | Hard-coded hex in `docs/orchestra-prd-map.html`, copied from `palette.js` | In code, but it will drift if the palette changes |
| Plugin directory icon | Not set: `plugin/.claude-plugin/plugin.json` has no `icon` | Optional. Anthropic's plugin directory listing reads one. A PNG of the mark would have to be drawn; nothing in the repo is an image of it |
| README screenshots | None embedded | Optional. `e2e-evidence/prototype-motion-20261010-1905/` holds five captures of the prototype, which show the HTML emulation rather than the real terminal |
| Research reference media | Screenshots, mp4 and gif of other tools, linked from `docs/orchestra-research-report.md` and `docs/orchestra-prd.md` | Remote, third-party; reference only, not reusable |
| PRD map diagrams | Mermaid 11 and `@mermaid-js/layout-elk` from jsDelivr, `docs/orchestra-prd-map.html` | Remote |
| Sample performance | `prototype/scenario.js` | In repo |
| Eval case and scaffold | `plugin/evals/ensemble-records/` | In repo |
| Test fixture events | `plugin/tests/ledger.test.ts` | In repo |
| Narration model | Claude through the Agent SDK (`@anthropic-ai/claude-agent-sdk` 0.3.296, installed with `npm install --prefix plugin/narrate`) | Installed on demand; uses your Claude Code login |
| Voice | ElevenLabs, `plugin/narrate/voice.mjs`, no npm dependency | **Needs your key and voice** |

Not part of this repository: the screenplay video assets discussed in another session (the beats and transcript documents, the Hindi voice lines, shots S015, S041 and S058). `/tmp/ltx-audit` does not exist on this machine, and no beats or transcript file is under your home folder; those assets belong to that project's own workspace.

One unrelated finding: `.mcp.json` and `.codex/config.toml` (both untracked) name the package `@modelcontextprotocol/serversequentialthinking`; the published name is `@modelcontextprotocol/server-sequential-thinking`. Orchestra does not use either file.
