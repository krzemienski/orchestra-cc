// Reads Orchestra's coda aloud with ElevenLabs text-to-speech and writes an MP3. No dependencies:
// Node's own fetch. The API key comes only from the ELEVENLABS_API_KEY environment variable.
//
// From the mod (a fixed command line): `node voice.mjs`, with JSON on standard input:
//   { "text": "...", "out": "/abs/path/x-coda.mp3", "voiceId": "...", "language": "en", "model": "..." }
// It checks that the voice is verified for the language on that model, speaks the text, writes the
// MP3 to `out`, and prints one JSON line: { path, bytes, characters, truncated, voice, verified }.
// Any failure exits 1 with one line on standard error, which the mod shows as the reason.
//
// For a person choosing a voice: `node voice.mjs --voices <language> [model]` lists the voices in the
// account verified for that language (ISO 639-1, for example en, hi, es).
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const API = 'https://api.elevenlabs.io'
// eleven_v4 speaks the requested language without carrying the voice's own accent, and it takes
// language_code. eleven_multilingual_v2 cannot (the API ignores language_code for it).
const DEFAULT_MODEL = 'eleven_v4'
const OUTPUT_FORMAT = 'mp3_44100_128'
// Characters per request (https://elevenlabs.io/docs/overview/models).
// Fallback when GET /v1/models cannot be reached. eleven_v4_turbo is not listed: the docs place it
// on the Text to Dialogue websocket, not on text-to-speech.
const LIMITS = { eleven_v4: 10000, eleven_v3: 5000, eleven_flash_v2_5: 40000, eleven_flash_v2: 30000, eleven_multilingual_v2: 10000, eleven_multilingual_v1: 10000 }
const FALLBACK_LIMIT = 5000
// `language_code` is "not supported for multilingual_v2 models"; other models take it.
const TAKES_LANGUAGE_CODE = (model) => model !== 'eleven_multilingual_v2'

// The live character limit from GET /v1/models, falling back to the table above. Also refuses a
// model the account's catalogue says cannot do text to speech, such as one that is dialogue only.
async function limitFor(model) {
  let models = []
  try {
    models = await (await api('/v1/models')).json()
  } catch {
    return LIMITS[model] ?? FALLBACK_LIMIT
  }
  const row = Array.isArray(models) ? models.find((m) => m.model_id === model) : undefined
  if (row && row.can_do_text_to_speech === false) fail(`${model} cannot do text to speech on this account; run node voice.mjs --models`)
  return row?.maximum_text_length_per_request || LIMITS[model] || FALLBACK_LIMIT
}

async function listModels() {
  const models = await (await api('/v1/models')).json()
  for (const m of Array.isArray(models) ? models : []) {
    if (m.can_do_text_to_speech === false) continue
    process.stdout.write(`${m.model_id}  ${m.maximum_text_length_per_request ?? '?'} chars  ${(m.languages || []).map((l) => l.language_id).join(',')}\n`)
  }
}

function fail(reason) {
  process.stderr.write(`${reason}\n`)
  process.exit(1)
}

async function api(path, init = {}) {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) fail('ELEVENLABS_API_KEY is not set in the environment Claude Code was started from')
  const res = await fetch(`${API}${path}`, { ...init, headers: { 'xi-api-key': key, ...(init.headers || {}) } })
  if (res.ok) return res
  const body = await res.text()
  let detail = body
  try {
    const d = JSON.parse(body).detail
    detail = Array.isArray(d) ? d.map((x) => x.msg).join('; ') : d?.message ? `${d.code || d.status || ''}: ${d.message}` : JSON.stringify(d)
  } catch {}
  fail(`ElevenLabs answered ${res.status} for ${path.split('?')[0]} (${String(detail).slice(0, 300)})`)
}

// A language matches when the voice's entry names it, with or without a region (en, en-US, en_GB).
const speaks = (entry, language) => [entry.language, entry.locale].some((x) => String(x || '').toLowerCase().replace('_', '-').split('-')[0] === language)

function verifiedFor(voice, language, model) {
  const entries = voice.verified_languages || []
  if (!entries.length) return null
  // Entries are per model. A voice verified only on another model is not a refusal: eleven_v4 is
  // documented to speak a language the voice was not recorded in. Refuse only a voice this model
  // has been checked for and found not to speak the language.
  const forModel = entries.filter((e) => e.model_id === model)
  if (!forModel.length) return null
  return forModel.some((e) => speaks(e, language))
}

// Cut at the last sentence end that fits, so the voice never stops mid-word.
function fit(text, limit) {
  if (text.length <= limit) return { text, truncated: false }
  const head = text.slice(0, limit)
  const end = Math.max(head.lastIndexOf('. '), head.lastIndexOf('.\n'), head.lastIndexOf('\n'))
  return { text: head.slice(0, end > limit / 2 ? end + 1 : limit).trim(), truncated: true }
}

async function listVoices(language, model) {
  if (!language) fail('usage: node voice.mjs --voices <language> [model], for example --voices hi')
  // No language filter: that filter matches the voice's free-form label, which would hide a voice
  // whose verified languages are right but whose label is not. Pages continue while has_more is set.
  const voices = []
  let page = ''
  for (let n = 0; n < 20; n += 1) {
    const res = await api(`/v2/voices?page_size=100${page}`)
    const body = await res.json()
    voices.push(...(body.voices || []))
    if (!body.has_more || !body.next_page_token) break
    page = `&next_page_token=${encodeURIComponent(body.next_page_token)}`
  }
  const rows = voices
    .map((v) => ({ v, ok: verifiedFor(v, language, model) }))
    .filter((x) => x.ok !== false)
  if (!rows.length) fail(`no voice in this account is verified for "${language}" on ${model}`)
  for (const { v, ok } of rows) {
    const accents = (v.verified_languages || []).filter((e) => speaks(e, language)).map((e) => e.accent).filter(Boolean)
    process.stdout.write(`${v.voice_id}  ${v.name}  ${ok ? 'verified' : 'no language data'}${accents.length ? `  (${[...new Set(accents)].join(', ')})` : ''}\n`)
  }
}

async function speak() {
  let raw = ''
  for await (const chunk of process.stdin) raw += chunk
  let req
  try {
    req = JSON.parse(raw)
  } catch {
    fail('standard input is not JSON')
  }
  const { voiceId, out } = req
  const language = String(req.language || 'en').toLowerCase()
  const model = req.model || DEFAULT_MODEL
  if (!voiceId) fail('no voice id: set the voiceId option for the plugin (find one with node voice.mjs --voices <language>)')
  if (!out || !out.endsWith('.mp3')) fail('no .mp3 output path was given')
  if (!String(req.text || '').trim()) fail('no text was given')

  const voice = await (await api(`/v1/voices/${encodeURIComponent(voiceId)}`)).json()
  const verified = verifiedFor(voice, language, model)
  if (verified === false) {
    fail(`voice ${voice.name} (${voiceId}) is not verified for "${language}" on ${model}; run node voice.mjs --voices ${language} ${model} to pick one that is`)
  }
  const { text, truncated } = fit(String(req.text), await limitFor(model))
  const body = { text, model_id: model, ...(TAKES_LANGUAGE_CODE(model) ? { language_code: language } : {}) }
  const res = await api(`/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${OUTPUT_FORMAT}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify(body),
  })
  const audio = Buffer.from(await res.arrayBuffer())
  if (!audio.length) fail('ElevenLabs returned no audio')
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, audio)
  process.stdout.write(`${JSON.stringify({ path: out, bytes: audio.length, characters: text.length, truncated, voice: voice.name, verified: verified === true })}\n`)
}

const [flag, language, model] = process.argv.slice(2)
if (flag === '--voices') await listVoices(String(language || '').toLowerCase(), model || DEFAULT_MODEL)
else if (flag === '--models') await listModels()
else if (flag) fail(`unknown option ${flag}`)
else await speak()
