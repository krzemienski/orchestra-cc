// Orchestra's hooks module. It records what each agent loop reads and writes into a
// per-session ledger, guards writes that would overwrite another musician's newer work,
// and draws the ensemble on the surfaces a mod owns: a pane, the band above the prompt,
// the status line, toasts, the spinner and the Agent tool rows.

import { CONDUCTOR, instrumentDef, apply, authorOf, closeLeftOpen, codaMarkdown, emptyState, wouldConflict, plural, whoOf, fold, instrumentOf, INSTRUMENTS, isPerformance, latest, lineDelta, musicians, nameOf, statusLine } from './ledger.js'
import { GLYPH, TABS, band, heldWrite, pane, scrollPane } from './views.js'
import { colorMode, modeFor, paint, setColorMode } from './palette.js'

const PANE = 'orchestra'
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const LET_IT_WRITE = 'Let it write'
const SEND_IT_BACK = 'Send it back to re-read'
const SHOW_BOTH = 'Show both versions'
const SEGMENT_EVENTS = 500
// Files one hook reads at once around a shell command. Reading every tracked file together could
// run out of file handles in a large project.
const SNAPSHOT_BATCH = 16
// Tools whose calls are kept before a performance begins: the Agent call that begins it and the
// conductor's writes (the score), which are recorded as artifacts anyway.
const KEPT_EARLY = new Set(['Agent', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
// Shell tools: their changes are found by hashing tracked files before and after the command.
// PowerShell is the Windows shell tool.
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])
// Claude Code reads files up to this size; a larger one is versioned by its size and time.
const READ_LIMIT = 4 * 1024 * 1024
// Calls that can change a project file, so one running alongside a shell call makes that call's
// changes uncertain. An MCP tool might write anything. Every other call (the Agent call that
// waits on a subagent, reads, searches, dialogs, task waits, a Monitor that only watches) does
// not count.
const CHANGES_FILES = new Set([...SHELL_TOOLS, ...WRITE_TOOLS])
const changesFiles = (tool) => CHANGES_FILES.has(tool) || String(tool).startsWith('mcp__')
// Claude Code refuses more than 12 rows drawn around its question dialog. Every row Orchestra
// draws there is truncated to one line: 1 status row + 3 headings + 3 lines per side = 10 rows.
const DIALOG_LINES_PER_SIDE = 3

/** @type {import('./ledger.js').State} */
let state = emptyState()
let cwd = ''
let ledgerBase = ''
let ledgerDir = ''
let sessionId = ''
let codaFile = ''
let colorterm = ''
const THEME_RECHECK_MS = 2000
// One narration: the Agent SDK starts a Claude Code process and makes one model call.
const NARRATE_TIMEOUT_MS = 180_000
let seq = 0
// The highest sequence number already written to a segment file.
let persisted = 0
let persisting = Promise.resolve()
// Bumped whenever the session's paths and state are replaced, so a save queued by the previous
// session can finish writing its own files without moving this session's `persisted`.
let epoch = 0
// Calls that can change a file, running now, per agent loop: a shell change is attributed with
// certainty only when no other loop had one running. A write tool counts from when Orchestra
// lets it through, so not while it waits for the file lock or the user's answer to a conflict.
// The mod sees nothing between Claude Code's own permission prompt and the tool running, so a
// call waiting on that prompt already counts.
const inFlight = new Map()
// Shell calls still running, one mark per call, so a loop's parallel shell calls each keep their
// own. A call is marked overlapped when another loop runs a call that can change files while it
// runs, including one that starts and ends entirely in the middle. The mark is read after the
// command's own snapshots, so it stays until those finish.
const bashRunning = new Set()
// Shell commands left running in the background, by task id. Each is one shell command that
// runs from its call until Claude Code's notification that it finished: it counts as overlap
// for every other loop until then, so a change another loop's command sees meanwhile is
// recorded as uncertain. At the end its changes not yet recorded are found against the
// snapshot taken before it started, and credited to the loop that started it.
/** @type {Map<string, { loop: string, endsWithAnswer: boolean, known: Record<string, any>|null, mark: { loop: string, overlapped: boolean } }>} */
const background = new Map()
// Writes Orchestra has let through and not yet recorded, by path: the loops writing them. A
// shell command that sees such a file change has seen that write, not its own.
/** @type {Map<string, Set<string>>} */
const landing = new Map()

// A loop starts something that can change files: every other loop's running shell call has now
// overlapped with it.
function overlapOthers(key) {
  for (const other of bashRunning) if (other.loop !== key) other.overlapped = true
}
function startWriting(key) {
  inFlight.set(key, (inFlight.get(key) || 0) + 1)
  overlapOthers(key)
}
const stopWriting = (key) => inFlight.set(key, Math.max(0, (inFlight.get(key) || 1) - 1))
// Whether another loop has a call that can change files running now, or a background command.
const othersWriting = (key) => [...inFlight.entries()].some(([agent, n]) => agent !== key && n > 0)
  || [...background.values()].some((b) => b.loop !== key)
// One write to a file at a time. The guard checks the file's hash and the write lands later,
// several steps apart, so without this a second musician's write can land in between and be
// credited to the first. A write that finds the file busy is sent back at once rather than
// waiting: a hook's waiting time counts against its 10-second budget, and a hook past its budget
// is skipped, which would let the write land unchecked.
/** @type {Map<string, symbol>} */
const busyFiles = new Map()
// Files whose write is waiting on the user's answer to a conflict question.
const askingFiles = new Set()
// Claims a file for one write; only the claim's own release frees it.
const claimFile = (path) => {
  if (busyFiles.has(path)) return null
  const token = Symbol(path)
  busyFiles.set(path, token)
  return () => {
    if (busyFiles.get(path) === token) busyFiles.delete(path)
  }
}
// Background task ids whose notification arrived before their call's result was seen, with the
// status the notification gave.
/** @type {Map<string, string>} */
const endedTasks = new Map()
// A new session is started at most once at a time: concurrent hooks share it.
/** @type {Promise<void>|null} */
let starting = null
// Musicians woken after their part ended only to hear that their background command finished.
const wokenByTask = new Set()
// The loop each already-ended background task belonged to, for a notification that arrives late.
/** @type {Map<string, string>} */
const endedTaskLoops = new Map()
// The tab shown before Orchestra's first open conflict dialog switched it, restored after the last.
/** @type {{ tab: string, selected: any }|null} */
let restoreTo = null
let codaWrites = Promise.resolve()
let stopThemeRecheck = () => {}
// The narrated coda (the narrateCoda option): Claude's retelling of the coda, in a file beside it.
// The coda text last sent to be narrated, so an unchanged coda is not narrated twice, and the
// number of the latest narration, so an older one that finishes late is dropped.
let narrateCoda = false
let narratedText = ''
let narrations = 0
// Musicians the conductor sent more work after their part ended, until that part.resumed is recorded.
const resumedByMessage = new Set()
// Write tools let through and still landing: whether another loop's shell command ran meanwhile,
// in which case the write's line counts may include that command's change.
/** @type {Set<{ loop: string, overlapped: boolean }>} */
const writesLanding = new Set()
// Files found to be over the read limit, so they are not read again while still too large.
/** @type {Map<string, number>} */
const tooBig = new Map()
// Failures already shown to the user in this session, by kind; each is toasted once.
const warned = new Set()
// Write tool calls still being checked, by tool_use_id, so a hook that runs out of time can be
// answered for: a checked file's write is sent back, an untracked one passes.
/** @type {Map<string, { key: string, target: string, isWrite: boolean, called: boolean }>} */
const guarding = new Map()
// The text of the latest version Orchestra saw of each project file, so a change found later can
// be measured against the version it replaced.
/** @type {Map<string, { hash: string, text: string }>} */
const versionText = new Map()
// The text each loop last read or wrote, in memory only (never in the ledger), so a held write
// can show what changed since the writer's version.
const lastText = new Map()
const textKey = (agent, path) => `${agent}\u0000${path}`
/**
 * @typedef {{ tab: string, selected: { type: string, id: string }|null, codaPath: string|null,
 *   held: { path: string, writer: string, against: string, tool: string, current: number, base: number|null,
 *     changed: string[]|null, currentText: string|null, proposed: string }|null,
 *   narration: { status: 'writing'|'done'|'failed', path: string, text: string }|null,
 *   offset?: number, setTab: (tab: string) => void, select: (type: string, id: string) => void }} View
 */
/** @type {View} */
const view = { tab: 'ensemble', selected: null, codaPath: null, held: null, narration: null, setTab: () => {}, select: () => {} }

const segmentOf = (n) => Math.ceil(n / SEGMENT_EVENTS)
const segmentFile = (n) => `${ledgerBase}.${String(n).padStart(4, '0')}.jsonl`

const short = (text, n) => {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

// Paths are compared with forward slashes, so a Windows path matches the same way.
const slashes = (p) => String(p).replace(/\\/g, '/')
const isAbsolute = (p) => p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('\\\\')
// On macOS /tmp and /var are links into /private, so the session's folder and a tool's path can
// name one place two ways. Both are compared without the prefix.
const unprivate = (p) => (p.startsWith('/private/') ? p.slice('/private'.length) : p)
// Windows drive letters and folder names ignore case.
const sameRoot = (p, r) => (/^[A-Za-z]:\//.test(r) ? p.toLowerCase().startsWith(`${r.toLowerCase()}/`) : p.startsWith(`${r}/`))
// The project's folder as the session names it and where it really lands, so a path through a
// symbolic link to the project is recognised as inside it. Set at session start.
/** @type {string[]} */
let roots = []
async function rootsOf($, dir) {
  const real = (await $.fs.stat(dir, { resolve: true }).catch(() => undefined))?.realPath
  return [...new Set([dir, real].filter(Boolean).map((r) => unprivate(slashes(r).replace(/\/$/, ''))))]
}
const relative = (path) => {
  const p = unprivate(slashes(path || ''))
  const root = roots.find((r) => sameRoot(p, r))
  return root ? p.slice(root.length + 1) : slashes(path || '')
}
// Where a path really lands: the file if it exists, else its folder plus the name (a new file).
async function realPathOf($, path) {
  const own = await $.fs.stat(path, { resolve: true }).catch(() => undefined)
  if (own?.realPath) return own.realPath
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  // The folder keeps its trailing separator, so a drive or file-system root stays that root.
  const dir = await $.fs.stat(cut < 0 ? '.' : path.slice(0, cut + 1), { resolve: true }).catch(() => undefined)
  return dir?.realPath ? `${slashes(dir.realPath).replace(/\/$/, '')}/${path.slice(cut + 1)}` : undefined
}
// A tool's file path as the ledger keys it: relative to the project wherever it really lands,
// so two spellings of one file (a link, a different letter case where the disk ignores case)
// are one file. A project file linked to somewhere outside keeps its project path, so it is
// still guarded. Paths outside the project stay absolute.
async function projectPath($, path) {
  const p = String(path || '')
  if (!isAbsolute(slashes(p))) return slashes(p)
  const real = await realPathOf($, p)
  const inside = real ? relative(real) : null
  return inside && !isAbsolute(inside) ? inside : relative(p)
}

const loopOf = (e) => e.agentId || CONDUCTOR

async function sha256(text) {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function targetOf($, e) {
  const path = e.file_path || e.notebook_path
  if (path) {
    // Resolving the path is bookkeeping: if it fails, the path is used as written.
    try {
      return await projectPath($, path)
    } catch (err) {
      debug($, `Orchestra could not resolve ${path}: ${err instanceof Error ? err.message : String(err)}`)
      return relative(path)
    }
  }
  if (SHELL_TOOLS.has(e.tool)) return short(e.command, 80)
  if (e.tool === 'TaskStop') return String(e.task_id || e.shell_id || '')
  if (e.tool === 'SendMessage') return short(String(state.musicians[String(e.to)]?.name || e.to || ''), 60)
  if (e.pattern) return short(e.pattern, 60)
  if (e.tool === 'Agent') return short(e.description || e.subagent_type, 60)
  return ''
}

// A file as it is now. `error` is set when the file exists but could not be read, so a caller
// can tell a failed read from a missing file.
async function snapshot($, path) {
  // A file already found too large is only re-read once its size drops under the limit.
  if (tooBig.has(path)) {
    const st = await $.fs.stat(path).catch(() => undefined)
    if (st && st.size > READ_LIMIT) return { text: null, hash: null, error: true, reason: 'over the read limit', stamp: `stat:${st.size}:${Math.round(st.mtimeMs)}` }
    tooBig.delete(path)
  }
  try {
    const text = await $.fs.read(path)
    return { text, hash: await sha256(text), error: false, reason: '' }
  } catch (err) {
    const exists = await $.fs.exists(path).catch(() => true)
    const st = exists ? await $.fs.stat(path).catch(() => undefined) : undefined
    if (st && st.size > READ_LIMIT) tooBig.set(path, st.size)
    return { text: null, hash: null, error: exists, reason: exists ? (err instanceof Error ? err.message : String(err)) : '', stamp: exists ? await stampOf($, path) : null }
  }
}

// A file Orchestra cannot read (over the 4 MiB read limit, say) still gets a version: its size
// and modification time stand in for the content hash, so its reads and writes are recorded.
async function stampOf($, path) {
  const st = await $.fs.stat(path).catch(() => undefined)
  return st ? `stat:${st.size}:${Math.round(st.mtimeMs)}` : null
}

// Snapshots of many files, SNAPSHOT_BATCH at a time. The reads are calls to Claude Code, which do
// not count against the hook's time budget.
async function snapshotAll($, paths) {
  const out = []
  for (let i = 0; i < paths.length; i += SNAPSHOT_BATCH) out.push(...await Promise.all(paths.slice(i, i + SNAPSHOT_BATCH).map((path) => snapshot($, path))))
  return out
}

// Remembers a project file's text at a version Orchestra recorded.
function rememberText(path, snap) {
  if (snap?.hash && snap.text !== null && !isAbsolute(path)) versionText.set(path, { hash: snap.hash, text: snap.text })
}

// The ledger is written in segments of SEGMENT_EVENTS events. Each save rewrites only the
// segments holding events not yet saved: normally just the newest, and both sides of a segment
// boundary when one is crossed between saves. A torn write can lose at most one segment.
// Everything a save writes is captured when it is queued, so it always writes one session's own
// events to that session's files, even if it runs after the next session has started.
async function persist($) {
  if (!isPerformance(state) || !ledgerBase) return
  const mine = epoch
  const pending = state.events.filter((x) => x.seq > persisted)
  if (!pending.length) return persisting
  const upTo = Math.max(...pending.map((x) => x.seq))
  const gitignore = `${cwd}/.orchestra/.gitignore`
  const writes = [...new Set(pending.map((x) => segmentOf(x.seq)))].map((segment) => ({
    file: segmentFile(segment),
    body: `${state.events.filter((x) => segmentOf(x.seq) === segment).map((x) => JSON.stringify(x)).join('\n')}\n`,
  }))
  persisting = persisting.then(async () => {
    // The .gitignore only keeps the ledger out of commits; failing to write it must not stop the save.
    try {
      if (!(await $.fs.exists(gitignore))) await $.fs.write(gitignore, '*\n')
    } catch (err) {
      debug($, `Orchestra could not write ${gitignore}: ${err instanceof Error ? err.message : String(err)}`)
    }
    for (const w of writes) await $.fs.write(w.file, w.body)
    if (epoch === mine) persisted = Math.max(persisted, upTo)
  }).catch((err) => warn($, 'save', `could not save its ledger (${err instanceof Error ? err.message : String(err)}); events since the last save are only in memory`))
  return persisting
}

// A debug-log line that never throws, for use inside error paths.
// A failure the user should know about: always in the debug log, and the first of each kind in
// a session also as a toast.
function warn($, kind, text) {
  debug($, text)
  if (warned.has(kind)) return
  warned.add(kind)
  try {
    $.ui.toast(`Orchestra: ${text}`, { timeoutMs: 8000 })
  } catch {}
}

function debug($, text) {
  try {
    $.ui.log(text, { to: 'debug' })
  } catch {}
}

async function loadLedger($, dir, id) {
  if (!(await $.fs.exists(dir))) return []
  const names = (await $.fs.list(dir)).map((x) => x.name)
    .filter((n) => n.startsWith(`${id}.`) && /\.\d{4}\.jsonl$/.test(n)).sort()
  // Every line must be an event in order; a damaged ledger is not used (and not overwritten).
  const events = []
  for (const [n, name] of names.entries()) {
    const lines = (await $.fs.read(`${dir}/${name}`)).split('\n').filter(Boolean)
    for (const [i, text] of lines.entries()) {
      let e
      try {
        e = JSON.parse(text)
      } catch {
        // The last line of the last file cut short by a process that died while saving: the
        // event is lost, and the next save writes the file whole again.
        if (n === names.length - 1 && i === lines.length - 1) {
          debug($, `Orchestra dropped a line cut short at the end of ${name}`)
          continue
        }
        throw new Error(`line ${i + 1} of ${name} is not JSON`)
      }
      const last = events.length ? events[events.length - 1].seq : 0
      if (!e || typeof e !== 'object' || typeof e.type !== 'string' || !Number.isInteger(e.seq) || e.seq <= last) {
        throw new Error(`line ${i + 1} of ${name} is not an event in order`)
      }
      events.push(e)
    }
  }
  return events
}

const ledgerPath = () => (ledgerBase ? relative(segmentFile(segmentOf(seq))) : '(not saved: the ledger could not be read)')

// Every observation goes through here: append, fold, persist, then tell the user what changed.
// The sequence number is assigned only after the clock returns. Assigning it before the await
// let two hooks hold consecutive numbers while only the later one was applied, and the save
// then marked the earlier one as already written. Events are now applied and saved in order.
// `fields` is an event, several events, or a function that builds them synchronously right after
// the clock (so their checks and the apply happen with no other hook in between); a null entry
// is dropped. Events built together are applied together. `quiet` skips the toasts: the event is
// one the user just decided, and its stale reads would push the decision's own toast off the
// screen. Before a performance, tool calls and results are kept only for KEPT_EARLY tools: only
// reads and writes matter then, and a long session without one would grow forever.
// `at` is the epoch the caller started in: a hook that began before a session switch records
// nothing into the session that replaced it. Most callers use `record`, which takes the epoch now;
// a function that awaits across several steps binds its own (see the local `record`s).
async function recordIn(at, $, fields, quiet = false) {
  if (at !== epoch) return null
  const ts = await $.clock.now()
  if (at !== epoch) return null
  const built = typeof fields === 'function' ? fields() : fields
  const before = { stale: state.stale.length, handoffs: state.handoffs.length, conflicts: state.conflicts.length, failures: state.toolFailures.length }
  /** @type {any} */
  let event = null
  for (const x of Array.isArray(built) ? built : [built]) {
    if (!x) continue
    // Once the session has ended nothing more is recorded into it (a killed command's result
    // arriving at exit, say), until a resume reopens it.
    if (state.ended !== null && x.type !== 'session.resumed') continue
    if (!isPerformance(state) && (x.type === 'tool.call' || x.type === 'tool.result') && !KEPT_EARLY.has(x.tool)) continue
    const next = { seq: seq + 1, ts, ...x }
    try {
      apply(state, next)
    } catch (err) {
      debug($, `Orchestra could not record a ${x.type} event: ${err instanceof Error ? err.message : String(err)}`)
      // The handler may have changed the state before it threw: rebuild it from the events kept,
      // so what is shown matches what is saved.
      state = fold(state.events)
      continue
    }
    seq += 1
    event = next
  }
  if (!event) return null
  // Once the events are applied they stand. Telling the user about them must not undo a decision
  // the caller is about to act on, so a failed toast or redraw is only logged.
  try {
    if (!quiet) toastNews($, before)
    // Not awaited: waiting on the save chain would spend this hook's time budget.
    persist($).catch((err) => debug($, `Orchestra could not queue a save: ${err instanceof Error ? err.message : String(err)}`))
    $.ui.status(isPerformance(state) ? statusLine(state) : undefined)
    $.ui.invalidate('ui.render')
  } catch (err) {
    debug($, `Orchestra could not show event ${event.seq}: ${err instanceof Error ? err.message : String(err)}`)
  }
  return event
}

const record = ($, fields, quiet = false) => recordIn(epoch, $, fields, quiet)

// Toasts for what an event changed: stale reads, handoffs and failures.
function toastNews($, before) {
  for (const s of state.stale.slice(before.stale)) {
    $.ui.toast(`Orchestra · stale read: ${nameOf(state, s.agent)} worked from v${s.readV} of ${s.path}; ${nameOf(state, s.writer)} wrote v${s.currentV}`, { timeoutMs: 6000 })
  }
  for (const h of state.handoffs.slice(before.handoffs)) {
    const how = h.via === 'brief' ? 'was handed' : 'read'
    $.ui.toast(`Orchestra · handoff: ${nameOf(state, h.to)} ${how} ${h.path} v${h.v} from ${nameOf(state, h.from)}`)
  }
  for (const f of state.toolFailures.slice(before.failures).filter((x) => x.agent !== CONDUCTOR)) {
    $.ui.toast(`Orchestra · ${nameOf(state, f.agent)}: ${f.tool} failed`, { timeoutMs: 6000 })
  }
}

// Rewritten whenever a part, a background command or the conductor's turn ends, so whoever reads
// the file mid-turn sees the performance so far. Only the end of the conductor's turn announces it.
// The text is taken now and the writes are queued in order, so an older coda never lands last;
// the queue is not awaited, which would spend the hook's time budget.
async function writeCoda($, announce = false, at = epoch) {
  if (at !== epoch || !isPerformance(state) || !codaFile) return
  const settled = musicians(state).every((m) => m.state === 'done' || m.state === 'failed')
    && Object.values(state.background).every((b) => b.status !== null)
  const file = codaFile
  const text = codaMarkdown(state, ledgerPath())
  const line = statusLine(state)
  // The coda is announced only once its file is written.
  codaWrites = codaWrites.then(async () => {
    await $.fs.write(file, text)
    if (settled && announce) {
      $.ui.log(`Orchestra coda: ${line}. Written to ${relative(file)}`)
      $.ui.toast('Orchestra · coda ready: /orchestra and open the Coda tab', { timeoutMs: 6000 })
      // Not awaited: a narration takes seconds, and later coda writes must not wait on it.
      if (narrateCoda) narrate($, text, file, at).catch((err) => warn($, 'narrate', `could not narrate the coda (${err instanceof Error ? err.message : String(err)})`))
    }
  }).catch((err) => warn($, 'coda', `could not write the coda to ${relative(file)} (${err instanceof Error ? err.message : String(err)})`))
  await recordIn(at, $, { type: 'coda', path: relative(file), settled })
  view.codaPath = relative(file)
}

// Has Claude retell the coda in a file beside it, through the Agent SDK helper in narrate/. The
// coda goes on standard input, never in the command line. A failure is shown and the coda itself
// is untouched; the same coda is tried again the next time the conductor's turn ends.
async function narrate($, coda, codaPath, at) {
  if (at !== epoch || coda === narratedText) return
  narratedText = coda
  const run = ++narrations
  const current = () => at === epoch && run === narrations
  const file = codaPath.replace(/-coda\.md$/, '-coda-narrated.md')
  const show = (status, text) => {
    view.narration = { status, path: relative(file), text }
    $.ui.invalidate('ui.render')
  }
  const fail = (reason) => {
    if (!current()) return
    narratedText = ''
    show('failed', reason)
    warn($, 'narrate', `could not narrate the coda (${reason})`)
  }
  show('writing', '')
  const dir = `${$.plugin.root}/narrate`
  if (!(await $.fs.stat(`${dir}/node_modules/@anthropic-ai/claude-agent-sdk`).catch(() => undefined))) {
    return fail(`its dependency is not installed: run npm install --prefix ${dir}`)
  }
  let out
  try {
    out = await $.process.run(['node', `${dir}/narrate.mjs`], { stdin: coda, timeoutMs: NARRATE_TIMEOUT_MS })
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err))
  }
  if (out.exitCode !== 0) return fail(out.stderr.trim().split('\n').pop() || `the narrator exited with code ${out.exitCode}`)
  if (!current()) return
  const text = out.stdout.trim()
  try {
    await $.fs.write(file, ['# Orchestra coda, narrated', '', `Claude's retelling of ${relative(codaPath)}. The coda is the record: where the two differ, the coda is right.`, '', text, ''].join('\n'))
  } catch (err) {
    return fail(`could not write ${relative(file)} (${err instanceof Error ? err.message : String(err)})`)
  }
  if (!current()) return
  show('done', text)
  $.ui.toast('Orchestra · narrated coda ready in the Coda tab', { timeoutMs: 6000 })
}

// Lines in `now` that are not in `then`, counted as a multiset.
function addedLines(then, now) {
  const left = new Map()
  for (const l of String(then ?? '').split('\n')) left.set(l, (left.get(l) || 0) + 1)
  return String(now ?? '').split('\n').filter((l) => {
    const n = left.get(l) || 0
    if (n > 0) {
      left.set(l, n - 1)
      return false
    }
    return l.trim() !== ''
  })
}

function proposedText(e) {
  if (e.tool === 'Write') return e.content
  // An Edit's old and new text share their context lines: what it adds is what the user decides on.
  if (e.tool === 'Edit') {
    const added = addedLines(e.old_string, e.new_string).filter((l) => l.trim())
    return added.length ? added.map((l) => `+ ${l}`).join('\n') : '(the Edit only removes lines)'
  }
  if (e.tool === 'MultiEdit') return (e.edits || []).map((x) => x.new_string).join('\n…\n')
  if (e.tool === 'NotebookEdit') return e.new_source
  return ''
}

// The file a write tool makes of `text`, or undefined when it cannot be worked out here.
function writeResult(e, text) {
  const edit = (t, x) => (x.replace_all ? t.split(x.old_string).join(x.new_string) : t.replace(x.old_string, () => x.new_string))
  if (e.tool === 'Write') return e.content
  if (e.tool === 'Edit') return edit(text, e)
  if (e.tool === 'MultiEdit') return (e.edits || []).reduce(edit, text)
  return undefined
}

// A write that would land on a version the writer never saw is held here and put to the user.
// With nobody to ask (a -p run, or the dialog dismissed) it is sent back, the safe choice.
// A write the musician has never read is also sent back without a question. Claude Code refuses
// any Write or Edit of a file that loop has not read ("File has not been read yet"), and a mod
// cannot record the read for it, so "Let it write" would fail every time. Sending it back makes
// the musician read the file and reapply the change, which is the only path that succeeds.
// Returns `{ deny }` to send the write back, or `{ base }`: the snapshot the write will replace.
// `approved` is an earlier conflict on this write that the user let through before the file
// moved on; it is settled here, once it is known whether the new version needs a question.
/** @param {import('./ledger.js').Conflict|null} [approved] */
async function guardWrite($, e, key, path, current, signal, approved = null, at = epoch) {
  // The file changed after the user let the write go ahead: their answer is recorded as a re-ask
  // when the new version is one more conflict, together with the new attempt, in one step.
  const attempt = await recordIn(at, $, () => [
    approved ? { type: 'conflict.resolved', id: approved.id, choice: wouldConflict(state, key, path, current.hash) ? 'reask' : 'overwrite' } : null,
    { type: 'write.attempt', agent: key, tool: e.tool, path, hash: current.hash },
  ])
  const conflict = attempt ? state.conflicts.find((c) => c.seq === attempt.seq) : undefined
  if (!conflict) {
    if (!approved) return { base: current }
    notify($, `Orchestra · conflict on ${path}: ${whoOf(state, key)} vs ${writerOf(path, approved)}, write allowed`)
    return { base: current, allowedOver: { who: writerOf(path, approved), v: approved.current } }
  }
  const writer = whoOf(state, key)
  const other = writerOf(path, conflict)
  const neverRead = conflict.base === null
  const seenText = neverRead ? `${writer} never read it` : `${writer} saw v${conflict.base}`
  if (neverRead) {
    await recordIn(at, $, { type: 'conflict.resolved', id: conflict.id, choice: 'reread', auto: true })
    notify($, `Orchestra · conflict on ${path}: ${writer} vs ${other}, sent back to re-read`)
    return { reason: 'never read it', deny: `Orchestra: ${other} wrote ${path} v${conflict.current} and you never read it. Read the file, then reapply your change on top of its current content.` }
  }
  const question = `Orchestra: ${other} wrote ${path} v${conflict.current} and ${seenText}. Let the ${e.tool} by ${writer} go ahead?`
  let choice = 'reread'
  // Whether the user made the choice, or Orchestra sent the write back on its own (the dialog
  // could not be shown, the dispatch ended, or the file can no longer be read).
  let decided = false
  // Text the user typed instead of picking an option, passed to the musician with the send-back.
  let said = ''
  /** @type {any} */
  let mine = null
  askingFiles.add(path)
  try {
    // A dispatch that has already gone on without this hook (its time ran out, or the person
    // interrupted) is not asked about: the write is sent back.
    if (signal?.aborted) throw new Error('dispatch ended')
    let label = await $.ui.ask(question, { header: 'Conflict', options: [LET_IT_WRITE, SEND_IT_BACK, SHOW_BOTH] })
    if (label === SHOW_BOTH) {
      const seenText = lastText.get(textKey(key, path))
      mine = {
        path, writer, against: other, tool: e.tool, current: conflict.current, base: conflict.base,
        changed: seenText === undefined || current.text == null ? null : addedLines(seenText, current.text), currentText: current.text, proposed: proposedText(e),
      }
      view.held = mine
      if (!restoreTo) restoreTo = { tab: view.tab, selected: view.selected }
      view.tab = 'artifacts'
      view.selected = { type: 'artifact', id: path }
      await recordIn(at, $, { type: 'conflict.shown', id: conflict.id })
      label = await $.ui.ask(`${question} The changes are shown above.`, { header: 'Conflict', options: [LET_IT_WRITE, SEND_IT_BACK] })
    }
    // Any answer is the user's decision; only Let it write lets the write go ahead.
    decided = !signal?.aborted && typeof label === 'string' && label.length > 0
    choice = label === LET_IT_WRITE && decided ? 'overwrite' : 'reread'
    if (decided && label !== LET_IT_WRITE && label !== SEND_IT_BACK) said = short(label, 300)
  } catch (err) {
    choice = 'reread'
    debug($, `Orchestra could not ask about the conflict on ${path}, so the write is sent back: ${err instanceof Error ? err.message : String(err)}`)
  }
  // The session changed while the user was being asked (/clear, a resume): the conflict belonged
  // to the session that ended, so nothing about it is recorded here and the write is sent back.
  if (at !== epoch) return { reason: 'session changed', deny: `Orchestra: the session changed while the user was being asked about ${path}. Read the file again and reapply your change.` }
  askingFiles.delete(path)
  if (mine && view.held === mine) view.held = null
  if (askingFiles.size === 0 && restoreTo) {
    Object.assign(view, restoreTo)
    restoreTo = null
  }
  // Writes through Write and Edit wait on the file lock, but a Bash command or an edit outside
  // Claude Code can change the file while the dialog is open. Then the approval was for an older
  // version, so the write is attempted again against the version there now.
  if (choice === 'overwrite') {
    const mark = seq
    const again = await snapshot($, path)
    // A file that can no longer be read may have changed since the answer, so the approval does
    // not cover it: the write is sent back.
    if (again.error && !again.stamp) {
      choice = 'reread'
      decided = false
    }
    else if (versionOfSnap(again) !== current.hash) {
      await claimForRunning($, path, again, mark, at)
      return guardWrite($, e, key, path, { ...again, hash: versionOfSnap(again) }, signal, conflict, at)
    }
  }
  await recordIn(at, $, { type: 'conflict.resolved', id: conflict.id, choice, ...(decided ? {} : { auto: true }), ...(said ? { said } : {}) })
  notify($, `Orchestra · conflict on ${path}: ${writer} vs ${other}, ${choice === 'overwrite' ? 'write allowed' : 'sent back to re-read'}`)
  if (choice === 'overwrite') return { base: current, allowedOver: { who: other, v: conflict.current } }
  const note = said ? ` The user said: ${said}` : ''
  return { reason: 'stale base', deny: `Orchestra: ${other} wrote ${path} v${conflict.current} and you last saw v${conflict.base}. Read the file again and reapply your change on top of its current content.${note}` }
}

// Who wrote the version a conflict is about: a musician with its part, someone outside, or for a
// shell change no single musician made, the musicians whose commands could have.
function writerOf(path, conflict) {
  return conflict.against === 'shell' ? authorOf(state, state.artifacts[path]?.versions[conflict.current]) : whoOf(state, conflict.against)
}

// A conflict's outcome toast. Shown after the decision is recorded, and never allowed to throw.
function notify($, text) {
  try {
    $.ui.toast(text, { timeoutMs: 8000 })
  } catch (err) {
    debug($, `Orchestra could not show a toast: ${err instanceof Error ? err.message : String(err)}`)
  }
}

// Files the ledger already knows, read before and after a Bash call; any that changed is a
// version written by whoever ran the command.
async function snapshotKnown($) {
  // Only while a performance is running, and only for files inside the project. Every Bash
  // call reads and hashes these twice, so tracking the whole machine would stall the session.
  if (!isPerformance(state)) return {}
  const paths = Object.keys(state.artifacts).filter((path) =>
    !path.startsWith('.orchestra/performances/') && !isAbsolute(path) && !path.split('/').includes('..'))
  const snaps = await snapshotAll($, paths)
  // A file that cannot be read is compared by size and time; one without even those is left out.
  for (const [i, s] of snaps.entries()) if (s.error && !s.stamp) debug($, `Orchestra could not read ${paths[i]} before a shell command (${s.reason}), so a change to it is not attributed`)
  return Object.fromEntries(paths.map((path, i) => [path, snaps[i]]).filter(([, s]) => !s.error || s.stamp))
}


async function attributeBash($, key, before, mark, at = epoch) {
  // `mark.overlapped` is read here, after the snapshots, not before them. Another loop's call
  // can start while the snapshots run, and that call can be what changed the file.
  const entries = Object.entries(before)
  const watermark = seq
  const nows = await snapshotAll($, entries.map(([path]) => path))
  mark.after = Object.fromEntries(entries.map(([path], i) => [path, nows[i]]))
  for (const [i, [path, prev]] of entries.entries()) {
    const now = nows[i]
    if (!now) continue
    if (now.error && !now.stamp) {
      debug($, `Orchestra could not read ${path} after a shell command (${now.reason}), so a change to it may be missing from the ledger`)
      continue
    }
    if (versionOfSnap(now) === versionOfSnap(prev)) continue
    // Another loop's foreground command still running started from the same version of this file,
    // so either could have made the change: it is credited to neither (a background command only
    // makes this change uncertain, through the overlap mark). A command that is ending too counts
    // unless its own after-snapshot already showed the file unchanged: then it did not make it.
    const others = [...bashRunning].filter((m) => m !== mark && m.loop !== key && !m.background && m.known && path in m.known
      && versionOfSnap(m.known[path]) === versionOfSnap(prev)
      && !(m.after?.[path] && versionOfSnap(m.after[path]) === versionOfSnap(prev)))
    const change = { key, prev, now, uncertain: mark.overlapped, watermark, loops: [key, ...new Set(others.map((m) => m.loop))] }
    // A write to this file is landing: the change is most likely that write, which records itself.
    // It is kept until the write's result: if the write fails, the change is the command's after all.
    if (landing.get(path)?.size) {
      holdForLanding(path, change)
      continue
    }
    await recordShellChange($, key, path, prev, now, change.uncertain, watermark, change.loops, at)
  }
}

// Shell changes seen while a write to the same file was landing, by path, until that write's result.
/** @type {Map<string, any[]>} */
const heldForLanding = new Map()
function holdForLanding(path, change) {
  heldForLanding.set(path, [...(heldForLanding.get(path) || []), change])
}
// The write to `path` has its result: when it failed, the changes held for it are recorded.
async function settleHeld($, path, ok, at) {
  const held = heldForLanding.get(path)
  heldForLanding.delete(path)
  if (ok || !held) return
  for (const c of held) await recordShellChange($, c.key, path, c.prev, c.now, c.uncertain, c.watermark, c.loops, at)
}

// A snapshot's version key: the content hash, or size and time for a file too large to read.
const versionOfSnap = (snap) => snap.hash ?? snap.stamp

// A shell command's change to a project file. Decided right before the event is applied: a
// hash the ledger already holds as its latest version was recorded by someone else; a version
// recorded after this change was seen (`watermark`) makes this one an older state, dropped. The
// lines are measured against the version it replaced: the latest recorded one when Orchestra
// knows its text, else the command's own starting point when that is still the latest;
// otherwise they are unknown, none are counted and the version is marked unchecked.
async function recordShellChange($, key, path, prev, now, uncertain, watermark, loops = [key], at = epoch) {
  const hash = versionOfSnap(now)
  const rank = (k) => (state.order.indexOf(k) + 1 || Infinity)
  const candidates = [...loops].sort((x, y) => rank(x) - rank(y))
  const event = await recordIn(at, $, () => {
    const last = state.artifacts[path] && latest(state.artifacts[path])
    if (last && last.hash === hash) return null
    if (last && last.seq > watermark) return null
    const known = versionText.get(path)
    const base = now.error || prev.error ? undefined
      : !last || last.hash === prev.hash ? prev.text
      : known && known.hash === last.hash ? known.text : undefined
    const delta = base === undefined ? { unchecked: true } : lineDelta(base, now.text)
    // Commands of more than one musician could have made it: a shell change credited to none.
    if (candidates.length > 1) return { type: 'artifact.write', agent: 'shell', candidates, path, hash, via: 'bash', uncertain: true, ...delta }
    return { type: 'artifact.write', agent: key, path, hash, via: 'bash', uncertain, ...delta }
  })
  if (event) rememberText(path, now)
}

// A file a running shell command covers changed and nobody recorded it: the commands that started
// before the change are the likeliest authors, so the change is credited before a read or a write
// attempt would record it as written outside the ensemble. One loop's commands: credited to it,
// certain only when nothing else ran during them. Several loops' commands: credited to none of
// them (a shell change by one of them). `watermark` is the sequence number taken before `snap`
// was read, so a version recorded since is never followed by this older one.
async function claimForRunning($, path, snap, watermark, at = epoch) {
  const hash = snap && versionOfSnap(snap)
  const a = state.artifacts[path]
  // Already the latest version (an older one, a revert, is a change like any other).
  if (!hash || (a && latest(a)?.hash === hash)) return
  // A command that started from this very version did not make it: the change came before it.
  const running = [...bashRunning].filter((m) => m.known && path in m.known && versionOfSnap(m.known[path]) !== hash)
  if (!running.length) return
  const m = running[running.length - 1]
  const loops = [...new Set(running.map((x) => x.loop))]
  const change = { key: m.loop, prev: m.known[path], now: snap, uncertain: loops.length > 1 || m.overlapped, watermark, loops }
  // A write tool's change landing now records itself; if that write fails, this was the command's.
  if (landing.get(path)?.size) {
    holdForLanding(path, change)
    return
  }
  await recordShellChange($, m.loop, path, change.prev, snap, change.uncertain, watermark, loops, at)
}

// Orchestra's own bookkeeping fails open: an error in it is logged and the tool still runs, and
// the tool's real result is returned. Only the tool's own error reaches the musician.

// Before the tool runs: snapshot tracked files around a shell command, record the call, and for
// a write take the file lock and run the guard. The caller releases `out.release`.
async function beforeTool($, e, key, target, isWrite, mark, untracked, signal, at = epoch) {
  /** @type {{ known: Record<string, any>|null, base: any, readBefore: any, readBeforeSeq: number, at: number, allowedOver: { who: string, v: number }|null, refusal: { deny: string }|null, openConflict: string|null, reason: string, release: (() => void)|null, callRecorded: boolean }} */
  const out = { known: null, base: null, readBefore: null, readBeforeSeq: 0, allowedOver: null, refusal: null, openConflict: null, reason: '', release: null, callRecorded: false, at }
  /** @type {number|null} */
  let guardFrom = null
  let guarded = false
  try {
    if (mark) {
      out.known = await snapshotKnown($)
      mark.known = out.known
      // A change another loop made while the snapshots were queued may be in some of them and not
      // others, so overlap seen then still counts, as does anything running now.
      mark.overlapped = mark.overlapped || othersWriting(key)
    }
    out.callRecorded = Boolean(await recordIn(at, $, { type: 'tool.call', agent: key, tool: e.tool, target }))
    const g = e.tool_use_id ? guarding.get(e.tool_use_id) : undefined
    if (g) g.called = out.callRecorded
    // A Read is snapshotted before it runs too: if a write lands while it runs, the earlier
    // version is the one recorded, so a later write from this view is still checked.
    if (e.tool === 'Read' && e.file_path && !untracked) {
      out.readBeforeSeq = seq
      out.readBefore = await snapshot($, e.file_path)
    }
    // The dispatch went on without this hook (it ran out of time): nothing more is done for it.
    if (!isWrite || signal?.aborted) return out
    out.release = claimFile(target)
    if (!out.release) {
      out.reason = 'file busy'
      out.refusal = { deny: askingFiles.has(target)
        ? `Orchestra: another musician's write to ${target} is waiting for the user's decision. Do your other work first; when you come back to this file, read it again and reapply your change on top of its current content (if the decision is still pending you will be told again).`
        : `Orchestra: another musician is writing ${target} right now. Read the file again and reapply your change on top of its current content.` }
    } else {
      await guardFile($, e, key, target, out, signal, () => { guardFrom = seq }, at)
      guarded = true
    }
  } catch (err) {
    const settle = refusalAfterError(key, target, guardFrom)
    if (settle) {
      out.refusal = { deny: settle.deny }
      out.openConflict = settle.open
      out.reason = 'conflict not settled'
    }
    // The guard failed after its snapshot: the write is not checked, so its lines are not counted.
    else if (isWrite && !guarded) out.base = null
    debug($, `Orchestra could not prepare ${e.tool} (${err instanceof Error ? err.message : String(err)}); the call runs, and what it changes may show as outside the ensemble`)
  }
  if (out.refusal) {
    // A conflict the error left open is settled as sent back, which is what happens to the write.
    const open = out.openConflict
    await recordIn(at, $, [
      open ? { type: 'conflict.resolved', id: open, choice: 'reread', auto: true } : null,
      { type: 'tool.result', agent: key, tool: e.tool, target, ok: false, sentBack: true, error: `sent back by Orchestra: ${out.reason}` },
    ])
      .catch((err) => debug($, `Orchestra could not record a send-back: ${err instanceof Error ? err.message : String(err)}`))
  }
  return out
}

// The guard's part of beforeTool, once the file is claimed: snapshot it, credit a background
// command's unrecorded change, then check the write against other musicians' work.
async function guardFile($, e, key, target, out, signal, onGuard, at = epoch) {
  out.baseSeq = seq
  out.base = await snapshot($, e.file_path || e.notebook_path)
  // A file too large to read is checked by its size and modification time; one whose size is
  // unknown too cannot be checked, and the write goes ahead rather than being refused for good.
  if (out.base.error && !out.base.stamp) {
    debug($, `Orchestra could not read ${target} (${out.base.reason}), so ${e.tool} goes ahead without a conflict check`)
    return
  }
  await claimForRunning($, target, out.base, out.baseSeq, at)
  onGuard()
  if (signal?.aborted) return
  const guard = await guardWrite($, e, key, target, { ...out.base, hash: versionOfSnap(out.base) }, signal, null, at)
  if (guard.deny) {
    out.refusal = { deny: guard.deny }
    out.reason = guard.reason
  } else {
    out.base = guard.base
    out.allowedOver = guard.allowedOver ?? null
  }
}

// If the guard had found a conflict on this write and failed before the user's "Let it write"
// was recorded, the write is sent back rather than landing unasked or against the answer.
function refusalAfterError(key, target, guardFrom) {
  if (guardFrom === null) return null
  const held = state.conflicts.filter((c) => c.agent === key && c.path === target && c.seq > guardFrom).at(-1)
  if (!held || held.choice === 'overwrite') return null
  return { deny: `Orchestra could not settle a conflict on ${target}. Read the file again and reapply your change on top of its current content.`, open: held.resolved ? null : held.id }
}

// After the tool ran: attribute shell changes, record a write or a read, and record the result.
// Each step fails on its own, so the result is recorded whatever happened before it.
async function afterTool($, e, key, target, isWrite, mark, before, result, untracked, wmark) {
  const at = before.at
  const ok = !(result && (result.isError || result.deny))
  const output = /** @type {any} */ (result)?.result
  const step = async (what, fn) => {
    try {
      await fn()
    } catch (err) {
      debug($, `Orchestra could not ${what} after ${e.tool}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if (mark && output?.backgroundTaskId) await step('track the background command', () => startBackground($, String(output.backgroundTaskId), key, e, before, mark, output))
  else if (mark && e.run_in_background) debug($, `Orchestra saw ${e.tool} run in the background with no task id, so it is not tracked`)
  else if (before.known && mark) await step('attribute the shell command\'s changes', () => attributeBash($, key, before.known, mark, at))
  if (ok && e.tool === 'TaskStop') await step('end the stopped task', () => stopBackground($, String(output?.task_id || e.task_id || e.shell_id || '')))
  if (ok && isWrite) await step('record the write', () => recordWrite($, e, key, target, before, wmark))
  if (isWrite) await step('settle shell changes held for the write', () => settleHeld($, target, ok, at))
  if (ok && e.tool === 'Read' && e.file_path && !untracked) await step('record the read', () => recordRead($, e, key, target, before))
  // A call made before the performance began is recorded with its result, so no result stands
  // without its call.
  await step('record the result', () => recordIn(at, $, [
    before.callRecorded ? null : { type: 'tool.call', agent: key, tool: e.tool, target },
    { type: 'tool.result', agent: key, tool: e.tool, target, ok, error: ok ? undefined : short(result?.text || result?.deny, 200) },
  ]))
}

async function recordWrite($, e, key, target, before, wmark) {
  const at = before.at
  const after = await snapshot($, e.file_path || e.notebook_path)
  const hash = after.hash ?? after.stamp
  if (!hash) debug($, `Orchestra could not read ${target} after ${e.tool} (${after.reason}), so the write is missing from the ledger`)
  // Without a readable starting point or result (an unreadable file, or a guard that failed
  // before its snapshot) the lines changed are unknown: none are counted, marked unchecked.
  // Another loop's shell command ran while the write landed and may have changed the file too:
  // the counts stand only when the file is exactly what this write alone makes of its base.
  const alone = wmark?.overlapped && before.base?.text != null ? writeResult(e, before.base.text) : undefined
  const mixed = wmark?.overlapped && (alone === undefined || alone !== after.text)
  const unknown = !before.base || before.base.error || after.error || mixed
  const delta = unknown ? { unchecked: true } : lineDelta(before.base.text, after.text)
  // The bytes the write started from; 'none' for a file it created.
  const from = before.base ? versionOfSnap(before.base) ?? 'none' : undefined
  if (hash) await recordIn(at, $, { type: 'artifact.write', agent: key, path: target, hash, from, ...delta }, Boolean(before.allowedOver))
  rememberText(target, after)
  if (after.text !== null) lastText.set(textKey(key, target), after.text)
}

async function recordRead($, e, key, target, before) {
  const at = before.at
  const afterSeq = seq
  const after = await snapshot($, e.file_path)
  const seen = before.readBefore?.hash && before.readBefore.hash !== after.hash ? before.readBefore : after
  const hash = seen.hash ?? seen.stamp
  if (!hash) {
    debug($, `Orchestra could not read ${target} after a Read (${after.reason}), so the read is missing from the ledger`)
    return
  }
  await claimForRunning($, target, seen, seen === before.readBefore ? before.readBeforeSeq : afterSeq, at)
  await recordIn(at, $, { type: 'artifact.read', agent: key, path: target, hash })
  rememberText(target, seen)
  if (seen.text !== null) lastText.set(textKey(key, target), seen.text)
}

// Each background task's notification in a message names the task and, once it has ended, its
// status.
// A status counts as the end only when one is given and it is not still running.
// `trackedOnly`: the row may only quote a notification, so only tasks Orchestra tracks are ended.
async function endBackground($, text, trackedOnly) {
  for (const [block] of text.matchAll(/<task-notification>[\s\S]*?<\/task-notification>/g)) {
    const id = /<task-id>([^<]+)<\/task-id>/.exec(block)?.[1]?.trim()
    const status = /<status>([^<]+)<\/status>/.exec(block)?.[1]?.trim()
    if (!id) continue
    if (!status) debug($, `Orchestra read a notification for task ${id} with no status, so the task stays open`)
    else if (status !== 'running' && status !== 'pending') await finishBackground($, id, status, trackedOnly)
  }
}

// A shell command moved to the background: it is tracked until it ends. Its notification may
// already have arrived, in which case it ends at once.
async function startBackground($, id, key, e, before, mark, output) {
  const at = before.at
  mark.background = true
  background.set(id, { loop: key, endsWithAnswer: Boolean(output.backgroundEndsWithFinalResponse), known: before.known, mark })
  await recordIn(at, $, { type: 'background.started', agent: key, task: id, command: short(e.command, 120) })
  debug($, `Orchestra is tracking background task ${id} from ${nameOf(state, key)}`)
  overlapOthers(key)
  const ended = endedTasks.get(id)
  if (ended) {
    endedTasks.delete(id)
    await finishBackground($, id, ended, false, at)
  } else await writeCoda($, false, at)
}

async function stopBackground($, id) {
  if (id) await finishBackground($, id, 'killed')
}

// A background command ended: it stops counting as overlap, and its changes not yet recorded are
// found and credited to the loop that started it.
async function finishBackground($, id, status, tracked = false, at = epoch) {
  const b = background.get(id)
  if (!b) {
    if (endedTaskLoops.has(id)) return
    // A row that may only quote a notification ends nothing Orchestra is not tracking.
    if (tracked) {
      debug($, `Orchestra ignored a notification for background task ${id}, which it is not tracking`)
      return
    }
    endedTasks.set(id, status)
    if (endedTasks.size > 200) endedTasks.delete(endedTasks.keys().next().value ?? '')
    return
  }
  background.delete(id)
  endedTaskLoops.set(id, b.loop)
  if (endedTaskLoops.size > 200) endedTaskLoops.delete(endedTaskLoops.keys().next().value ?? '')
  debug($, `Orchestra: background task ${id} ended (${status})`)
  // Each step fails on its own; the command covers its files until its changes are attributed
  // (claimForRunning).
  const step = async (what, fn) => {
    try {
      await fn()
    } catch (err) {
      debug($, `Orchestra could not ${what} for background task ${id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  try {
    await step('record the end', () => recordIn(at, $, { type: 'background.ended', task: id, status }))
    if (b.known) await step('attribute the changes', () => attributeBash($, b.loop, b.known, b.mark, at))
    await step('rewrite the coda', () => writeCoda($, false, at))
  } finally {
    bashRunning.delete(b.mark)
  }
}

// Sets up a new performance for the session now running. Everything is read first; then the
// paths, the state and the counters are replaced together with no await in between, so no hook
// sees a half-started session, and a hook still running for the previous one (older epoch)
// cannot save its events into this session's files. A ledger that cannot be read is never
// overwritten: the session goes on unsaved.
async function startSession($) {
  const dir = await $.session.cwd()
  const id = await $.session.id()
  const base = `${dir}/.orchestra/performances`
  const nextRoots = await rootsOf($, dir)
  let events = []
  let folded = emptyState()
  let readable = true
  try {
    events = await loadLedger($, base, id)
    if (events.length) folded = fold(events)
  } catch (err) {
    readable = false
    events = []
    folded = emptyState()
    debug($, `Orchestra could not read the ledger in ${base} (${err instanceof Error ? err.message : String(err)}), so this session's events are not saved`)
  }
  const ts = await $.clock.now()
  epoch += 1
  cwd = dir
  sessionId = id
  ledgerDir = base
  ledgerBase = readable ? `${base}/${id}` : ''
  codaFile = readable ? `${ledgerBase}-coda.md` : ''
  roots = nextRoots
  for (const m of [background, landing, inFlight, versionText, busyFiles, endedTasks, endedTaskLoops, heldForLanding]) m.clear()
  for (const s of [bashRunning, askingFiles, wokenByTask, resumedByMessage, writesLanding, warned]) s.clear()
  tooBig.clear()
  guarding.clear()
  lastText.clear()
  restoreTo = null
  narratedText = ''
  Object.assign(view, { codaPath: null, held: null, narration: null, selected: null, offset: 0 })
  state = folded
  seq = events.length ? events[events.length - 1].seq : 0
  persisted = seq
  if (!events.length) apply(state, { seq: ++seq, ts, type: 'session.start', session: sessionId, cwd })
  if (!readable) warn($, 'ledger', `could not read its ledger in ${relative(base)}, so this session is not being saved (the files are left as they are)`)
  if (events.length && isPerformance(state)) {
    // What the loaded ledger left open belonged to a process that has ended.
    const open = Object.entries(state.background).filter(([, b]) => b.status === null).map(([task]) => task)
    const closing = [...open.map((task) => ({ type: 'background.ended', task, status: 'session ended' })), ...closeLeftOpen(state)]
    await record($, [{ type: 'session.resumed', session: sessionId }, ...closing])
    if (closing.length) await writeCoda($)
  }
  if (state.codaSeq && codaFile) view.codaPath = relative(codaFile)
  $.ui.status(isPerformance(state) ? statusLine(state) : undefined)
  $.ui.invalidate('ui.render')
}

// Lets go of the session that ended: nothing more is saved into its files and nothing of it is
// shown. A hook still running for it holds an older epoch and records nothing.
function retireSession($) {
  epoch += 1
  sessionId = ''
  ledgerBase = ''
  codaFile = ''
  state = emptyState()
  seq = 0
  persisted = 0
  restoreTo = null
  narratedText = ''
  askingFiles.clear()
  Object.assign(view, { codaPath: null, held: null, narration: null, selected: null, offset: 0 })
  $.ui.status(undefined)
  $.ui.invalidate('ui.render')
}

// Starts a new performance when the session running now is not the one Orchestra holds: at
// session.start, after a /clear or an in-process resume (which raise no session.start), and after
// a reload. Concurrent hooks share one start, and none compares ids while a start is running.
async function ensureSession($) {
  const id = await $.session.id()
  if (starting) await starting
  if (id === sessionId) return
  if (!starting) {
    starting = (async () => {
      // The session held now ended without its session.end reaching Orchestra (or before it did):
      // it is closed first, so its coda and ledger say how it ended.
      if (sessionId && isPerformance(state) && state.ended === null) await safely($, 'close the previous session', () => endSession($))
      await startSession($)
    })()
      .catch((err) => warn($, 'start', `could not start recording this session (${err instanceof Error ? err.message : String(err)})`))
      .finally(() => { starting = null })
  }
  await starting
}

// A session ends: what it leaves open is closed (parts still playing fail as cut off, open
// conflicts are sent back, calls without a result are closed, the conductor's turn ends), running
// background commands are ended and their changes so far found, the end is recorded, and the coda
// is rewritten when anything happened since it was last written. Cheap records come first: the
// background attribution reads files and may not finish if the process is going away.
async function endSession($) {
  const at = epoch
  if (isPerformance(state) && state.ended === null) {
    await recordIn(at, $, closeLeftOpen(state))
    for (const id of [...background.keys()]) await finishBackground($, id, 'session ended', false, at)
    await recordIn(at, $, { type: 'session.ended', session: sessionId })
    const sinceCoda = state.events.filter((x) => x.seq > (state.codaSeq ?? 0) && x.type !== 'session.ended').length
    if (sinceCoda && at === epoch && codaFile) {
      // Written directly: the session has ended, so no coda event is added after its end marker.
      const text = codaMarkdown(state, ledgerPath())
      const file = codaFile
      codaWrites = codaWrites.then(() => $.fs.write(file, text))
        .catch((err) => warn($, 'coda', `could not write the coda to ${relative(file)} (${err instanceof Error ? err.message : String(err)})`))
    }
  } else {
    for (const id of [...background.keys()]) await finishBackground($, id, 'session ended', false, at)
  }
  await persisting
  await codaWrites
}

// Runs Orchestra's bookkeeping for a hook so that a failure is logged, never thrown into the turn.
async function safely($, what, fn) {
  try {
    await fn()
  } catch (err) {
    debug($, `Orchestra could not ${what}: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function toolCall($, e, next) {
  await safely($, 'start a new performance', () => ensureSession($))
  const mine = epoch
  const at = mine
  const key = loopOf(e)
  const target = await targetOf($, e)
  const path = e.file_path || e.notebook_path
  // Orchestra tracks the project's files only: a file outside it (Claude Code's own task output,
  // say) and Orchestra's own ledger and coda are recorded as calls, never as reads or writes, and
  // their writes are not guarded.
  const untracked = Boolean(path && (isAbsolute(target) || target.startsWith('.orchestra/performances/')))
  const isWrite = Boolean(WRITE_TOOLS.has(e.tool) && path && !untracked)
  if (next.signal?.aborted) return undefined
  if (e.tool_use_id) guarding.set(e.tool_use_id, { key, target, isWrite, called: false })
  // A finished musician working again was sent more work (SendMessage), unless it was woken only to
  // hear that its background command ended.
  const message = resumedByMessage.delete(key)
  if (state.musicians[key]?.finished && (message || !wokenByTask.has(key))) await safely($, 'record a resumed part', () => recordIn(at, $, { type: 'part.resumed', agent: key }))
  // A write tool counts as changing files only once it is let through (see `inFlight`).
  let counted = changesFiles(e.tool) && !isWrite && !(WRITE_TOOLS.has(e.tool) && untracked)
  if (counted) startWriting(key)
  const mark = SHELL_TOOLS.has(e.tool) ? { loop: key, overlapped: othersWriting(key), known: /** @type {Record<string, any>|null} */ (null), background: false } : null
  if (mark) {
    bashRunning.add(mark)
    for (const w of writesLanding) if (w.loop !== key) w.overlapped = true
  }
  /** @type {{ loop: string, overlapped: boolean }|null} */
  let wmark = null
  /** @type {(() => void)|null} */
  let release = null
  try {
    const before = await beforeTool($, e, key, target, isWrite, mark, untracked, next.signal, mine)
    release = before.release
    if (before.refusal) return before.refusal
    // The hook ran out of time or was interrupted: the dispatch has gone on without it (the
    // `.catch` answered for the call), so nothing more is recorded for it.
    if (next.signal?.aborted) {
      debug($, `Orchestra's check of ${e.tool} on ${target} did not finish in time; the call went on without being recorded`)
      return undefined
    }
    if (e.tool_use_id) guarding.delete(e.tool_use_id)
    if (isWrite) {
      counted = true
      startWriting(key)
      landing.set(target, (landing.get(target) || new Set()).add(key))
      wmark = { loop: key, overlapped: [...bashRunning].some((m) => m.loop !== key) }
      writesLanding.add(wmark)
    }
    const result = await next(e)
    if (mine === epoch) await afterTool($, e, key, target, isWrite, mark, before, result, untracked, wmark)
    return withContext(e, before, result)
  } finally {
    if (release) release()
    if (wmark) writesLanding.delete(wmark)
    if (e.tool_use_id) guarding.delete(e.tool_use_id)
    // A hook from a session that has since been replaced leaves the new session's maps alone.
    if (mine === epoch) {
      if (counted) stopWriting(key)
      if (isWrite && landing.get(target)?.delete(key) && !landing.get(target)?.size) landing.delete(target)
      // A backgrounded command's mark stays until the command ends (finishBackground).
      if (mark && ![...background.values()].some((b) => b.mark === mark)) bashRunning.delete(mark)
    }
  }
}

// What the model is told beside a tool's result: that the user let a write go ahead over another
// musician's version, and an Agent call's musician name as Orchestra shows it.
function withContext(e, before, result) {
  const notes = []
  if (before.allowedOver && result && !result.isError && !result.deny) notes.push(`Orchestra: ${before.allowedOver.who} had written v${before.allowedOver.v} of this file since you last read it. The user let your write go ahead over it.`)
  const agent = e.tool === 'Agent' && e.tool_use_id ? state.rows[e.tool_use_id] : undefined
  if (agent && state.musicians[agent]) notes.push(`Orchestra shows this musician as ${state.musicians[agent].name}.`)
  if (!notes.length || !result || result.deny) return result
  return { ...result, context: [...(result.context || []), ...notes] }
}

// /theme does not raise config.set, so a timer re-reads the theme every THEME_RECHECK_MS.
async function refreshTheme($) {
  const theme = (await $.config.list()).find((row) => row.key === 'theme')?.value
  const next = modeFor(theme, colorterm)
  if (next === colorMode()) return
  setColorMode(next)
  $.ui.invalidate('ui.render')
}

// Paths a brief names that the ledger already knows, so a handoff by brief can be derived.
function mentionsIn(prompt) {
  const text = String(prompt || '')
  return Object.keys(state.artifacts).filter((p) => text.includes(p))
}

export function register(on, options) {
  narrateCoda = options?.narrateCoda === true
  on('session.start', async ($, e, next) => {
    await safely($, 'set up its command and theme', async () => {
      await $.command.register({ name: 'orchestra', description: 'Open the Orchestra pane, or /orchestra coda | ledger | close', immediate: true })
      colorterm = (await $.env.get('COLORTERM')) || ''
      const theme = (await $.config.list()).find((row) => row.key === 'theme')?.value
      setColorMode(modeFor(theme, colorterm))
      let themeFailed = false
      // session.start fires again on /clear, resume and compaction: one recheck timer, not one each.
      stopThemeRecheck()
      stopThemeRecheck = $.clock.every(THEME_RECHECK_MS, () => {
        refreshTheme($).then(() => { themeFailed = false }).catch((err) => {
          if (!themeFailed) debug($, `Orchestra could not re-read the theme: ${err instanceof Error ? err.message : String(err)}`)
          themeFailed = true
        })
      })
    })
    await ensureSession($)
    return next(e)
  })

  // Every way a session ends (exit, /clear, a resume elsewhere): running background commands are
  // closed. After a /clear or an in-process resume no session.start follows; the next hook sees the
  // new session id and starts a new performance (ensureSession).
  on('session.end', async ($, e, next) => {
    // Only the session Orchestra holds is closed: a late end for another (one a start has already
    // replaced) leaves the session running now alone.
    if (e.sessionId && e.sessionId !== sessionId) return next(e)
    try {
      await endSession($)
    } catch (err) {
      debug($, `Orchestra could not close the session: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      // After /clear or a resume the conversation goes on as another session and no session.start
      // follows: this session's performance stops being shown or saved now, and the next hook
      // starts the new one (ensureSession).
      if ((e.reason === 'clear' || e.reason === 'resume') && e.sessionId === sessionId) retireSession($)
    }
    return next(e)
  })

  // A background task's notification is appended to the conversation of the loop that started the
  // task: the main conversation, or a subagent's even after that subagent has answered; as a
  // prompt row when the loop is idle, or another kind of row inside a running turn. Every row is
  // read, the row is passed on first, then any ended shell command is closed.
  on('session.append', async ($, e, next) => {
    const out = await next(e)
    // Only the engine delivers a background task's notification: as a turn of its own (origin
    // task-notification) or into a running turn (an attachment the engine wrote). A tool's output,
    // the model's text, a pasted prompt or another hook's context can only quote one.
    const asTurn = e.origin?.kind === 'task-notification'
    const delivered = asTurn || (e.door === 'attachment' && e.origin?.kind === 'engine')
    try {
      const text = JSON.stringify(e.message ?? '').replace(/\\n/g, '\n').replace(/\\"/g, '"')
      const finished = e.agentId && state.musicians[e.agentId]?.finished
      if (!text.includes('<task-notification>')) {
        // More work sent to a musician whose part ended (SendMessage from the conductor).
        if (finished && (e.door === 'prompt' || e.door === 'delivery')) resumedByMessage.add(e.agentId)
        return out
      }
      if (!delivered) {
        debug($, `Orchestra ignored a task notification quoted in a ${e.door} row (origin ${e.origin?.kind})`)
        return out
      }
      // A notification that comes as a turn of its own wakes its musician for a turn that is not new
      // work, whether or not the part has finished yet (its last turn may still be ending).
      if (asTurn && e.agentId) wokenByTask.add(e.agentId)
      await ensureSession($)
      await endBackground($, text, !asTurn)
    } catch (err) {
      debug($, `Orchestra could not read a task notification: ${err instanceof Error ? err.message : String(err)}`)
    }
    return out
  })

  on('config.set', { key: 'theme' }, async ($, e, next) => {
    const result = await next(e)
    setColorMode(modeFor(e.value, colorterm))
    $.ui.invalidate('ui.render')
    return result
  })

  // Only a person's own prompt sets the task; background-task notifications and peer
  // messages also arrive as prompts and must not overwrite it.
  on('prompt.submit', async ($, e, next) => {
    await safely($, 'record a prompt', async () => {
      await ensureSession($)
      const fromPerson = ['composer', 'bridge', 'sdk'].includes(e.origin?.kind)
      if (fromPerson && typeof e.text === 'string' && !e.text.startsWith('/')) await record($, { type: 'prompt', text: short(e.text, 500) })
    })
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await safely($, 'record a turn', async () => {
      await ensureSession($)
      if (!e.agentId) await record($, { type: 'turn.start' })
    })
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (result && result.agentId) {
      await safely($, 'record a part', async () => {
        await ensureSession($)
        const first = !isPerformance(state)
        await record($, {
          type: 'part.assigned', agent: result.agentId, subagentType: e.subagentType, description: e.description,
          prompt: short(e.prompt, 600), parent: e.parentAgentId || CONDUCTOR, toolUseId: e.tool_use_id, mentions: mentionsIn(e.prompt),
        })
        if (first) await $.ui.open({ id: PANE, title: 'Orchestra', closeOnEscape: true })
      })
    }
    return result
  })

  // A write that the guard did not finish checking (the hook failed or ran out of time before
  // reaching the tool) is refused rather than left to land unchecked; everything else runs.
  on('tool.call', toolCall).catch(async ($, e, next) => {
    // Re-entry is no fault (the event rose beneath another hook's own call): it passes through.
    if (next.called || next.error?.kind === 're-entry' || !WRITE_TOOLS.has(e.tool) || !(e.file_path || e.notebook_path)) return next(e)
    const g = e.tool_use_id ? guarding.get(e.tool_use_id) : undefined
    const path = slashes(String(e.file_path || e.notebook_path))
    // A file Orchestra does not track is never checked, so its write goes on: known from the guard's
    // entry, or, when the hook ran out of time before making one, from the path itself, by the same
    // test toolCall makes.
    const target = g?.target ?? relative(path)
    if (g ? !g.isWrite : isAbsolute(target) || target.startsWith('.orchestra/performances/')) return next(e)
    const key = g?.key ?? loopOf(e)
    await record($, [
      g?.called ? null : { type: 'tool.call', agent: key, tool: e.tool, target },
      { type: 'tool.result', agent: key, tool: e.tool, target, ok: false, sentBack: true, error: 'sent back by Orchestra: not checked in time' },
    ])
      .catch((err) => debug($, `Orchestra could not record a send-back: ${err instanceof Error ? err.message : String(err)}`))
    return { deny: `Orchestra could not check this write against other musicians' work in time. Read the file again and retry.` }
  })

  on('turn.complete', async ($, e, next) => {
    try {
      await ensureSession($)
      const at = epoch
      const loop = e.agentId || CONDUCTOR
      for (const [id, b] of [...background]) if (b.loop === loop && b.endsWithAnswer) await finishBackground($, id, loop === CONDUCTOR ? 'turn ended' : 'part ended')
      // A finished musician woken only by its background command's notification is not recorded
      // as finishing twice.
      const m = e.agentId ? state.musicians[e.agentId] : null
      // A finished musician woken only by its command's notification has not finished again; one
      // the conductor sent more work (seen here if it made no tool call) has. A wake for a part
      // still finishing is kept for the turn it will cause.
      const woken = Boolean(m?.finished && e.agentId && wokenByTask.delete(e.agentId))
      const message = Boolean(e.agentId && resumedByMessage.delete(e.agentId))
      if (m && m.assigned && !(m.finished && woken && !message)) {
        const resumed = m.finished ? { type: 'part.resumed', agent: e.agentId } : null
        const end = e.reason === 'answer'
          ? { type: 'part.done', agent: e.agentId, answer: short(e.answer, 1200) }
          : { type: 'part.failed', agent: e.agentId, reason: e.reason, answer: short(e.answer, 600) }
        if (!(await recordIn(at, $, [resumed, end]))) warn($, 'part', `could not record that ${m.name}'s part ended`)
        await writeCoda($)
      } else if (!e.agentId) {
        await recordIn(at, $, { type: 'turn.end' })
        await writeCoda($, true)
      }
    } catch (err) {
      warn($, 'part', `could not record the end of a turn (${err instanceof Error ? err.message : String(err)})`)
    }
    return next(e)
  })

  on('command.run', { command: 'orchestra' }, async ($, e) => {
    await safely($, 'start a new performance', () => ensureSession($))
    const arg = String(e.args || '').trim()
    if (arg === 'close') {
      await $.ui.close({ id: PANE })
      return {}
    }
    if (arg === 'ledger') {
      return { text: isPerformance(state) ? `${ledgerPath()} · ${state.events.length} events · ${statusLine(state)}` : 'No performance in this session yet: no musician has been assigned a part.' }
    }
    if (arg === 'coda') {
      if (!isPerformance(state)) return { text: 'No performance in this session yet.' }
      // The same text as the coda file; Claude Code shows command output as Markdown.
      return { text: codaMarkdown(state, ledgerPath()).replace(/^# Orchestra coda\n\n/, '') }
    }
    view.offset = 0
    await $.ui.open({ id: PANE, title: 'Orchestra', focus: true, closeOnEscape: true })
    return {}
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const el = $.ui.resolve(e)
    const width = Math.max(30, e.props.bodyColumns || 60)
    if (!isPerformance(state)) {
      return el.Box({ flexDirection: 'column', children: [
        el.Text({ bold: true, children: ['Orchestra'] }),
        el.Text({ dimColor: true, children: ['No performance yet: one starts when the conductor (claude --agent orchestra:conductor) assigns a part to a musician.'] }),
      ] })
    }
    view.setTab = (tab) => {
      view.tab = tab
      $.ui.invalidate('ui.render')
    }
    view.select = (type, id) => {
      view.selected = view.selected?.type === type && view.selected?.id === id ? null : { type, id }
      $.ui.invalidate('ui.render')
    }
    if (!TABS.some(([id]) => id === view.tab)) view.tab = 'ensemble'
    return pane(el, state, view, width, e.props.scroll?.bodyRows)
  })

  // The pane scrolls its own rows under the tab bar, which stays in place (views.js paneWindow).
  on('ui.scroll', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (scrollPane(view, e)) $.ui.invalidate('ui.render')
    return {}
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!isPerformance(state)) return next(e)
    const el = $.ui.resolve(e)
    const theirs = await next(e)
    const mine = band(el, state, Math.max(30, e.props.bodyColumns || 80))
    return el.Box({ flexDirection: 'column', children: [mine, theirs].filter(Boolean) })
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const playing = musicians(state).filter((m) => m.state === 'playing').length
    if (!playing) return next(e)
    return next({ ...e, props: { ...e.props, suffix: `${e.props.suffix || ''} · ${playing} ${playing === 1 ? 'musician' : 'musicians'} playing` } })
  })

  // While Orchestra asks about a conflict, the band above the prompt is hidden, so one line of it
  // is drawn above the question; with Show both versions, the comparison follows it.
  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    if (!askingFiles.size || !isPerformance(state)) return next(e)
    const el = $.ui.resolve(e)
    const ref = await next(e)
    const width = Math.max(40, e.viewport?.columns ?? 100)
    const status = el.Text({ dimColor: true, wrap: 'truncate-end', children: [`𝄐 ${statusLine(state)}`] })
    const held = view.held ? heldWrite(el, view.held, width, DIALOG_LINES_PER_SIDE) : []
    return el.Box({ flexDirection: 'column', children: [status, ...held, ref] })
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.props.tool !== 'Agent') return next(e)
    const agentId = e.props.tool_use_id ? state.rows[e.props.tool_use_id] : undefined
    const m = agentId ? state.musicians[agentId] : null
    const type = e.props.input?.subagent_type
    if (!m && !String(type || '').startsWith('orchestra:')) return next(e)
    const el = $.ui.resolve(e)
    const instrument = m ? m.instrument : instrumentOf(type)
    const def = instrumentDef(instrument)
    const label = m ? `${GLYPH[m.state]} ${m.name} · ${m.role} · ${plural(m.measures, 'measure')}` : `◌ ${def.name} · ${def.role}`
    const row = await next(e)
    return el.Box({ flexDirection: 'column', children: [el.Text({ color: paint(instrument), bold: true, children: [label] }), row].filter(Boolean) })
  })
}
