// Orchestra's hooks module. It records what each agent loop reads and writes into a
// per-session ledger, guards writes that would overwrite another musician's newer work,
// and draws the ensemble on the surfaces a mod owns: a pane, the band above the prompt,
// the status line, toasts, the spinner and the Agent tool rows.

import { CONDUCTOR, instrumentDef, apply, codaMarkdown, coda, emptyState, fold, instrumentOf, INSTRUMENTS, isPerformance, latest, lineDelta, musicians, nameOf, statusLine } from './ledger.js'
import { GLYPH, TABS, band, heldWrite, pane } from './views.js'
import { colorMode, modeFor, paint, setColorMode } from './palette.js'

const PANE = 'orchestra'
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const LET_IT_WRITE = 'Let it write'
const SEND_IT_BACK = 'Send it back to re-read'
const SHOW_BOTH = 'Show both versions'
const SEGMENT_EVENTS = 500
// 3 header rows + 3 lines per side = 9 rows, under the dialog's 12-row limit.
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
let seq = 0
// The highest sequence number already written to a segment file.
let persisted = 0
let persisting = Promise.resolve()
// Bumped whenever the session's paths and state are replaced, so a save queued by the previous
// session can finish writing its own files without moving this session's `persisted`.
let epoch = 0
// Tool calls running now, per agent loop: a Bash change is attributed with certainty only when
// no other loop had a call in flight.
const inFlight = new Map()
// Bash calls still running, one mark per call, so a loop's parallel Bash calls each keep their
// own. A call is marked overlapped when any other loop has a call in flight while it runs,
// including one that starts and ends entirely in the middle. The mark is read after the
// command's own snapshots, so it stays until those finish.
const bashRunning = new Set()
// One write to a file at a time. The guard checks the file's hash and the write lands later,
// several steps apart, so without this a second musician's write can land in between and be
// credited to the first. The lock is held until that write's result is recorded.
const fileLocks = new Map()
const lockFile = (path) => {
  const prev = fileLocks.get(path) || Promise.resolve()
  let release
  const gate = new Promise((resolve) => { release = resolve })
  fileLocks.set(path, prev.then(() => gate))
  return prev.then(() => release)
}
// The text each loop last read or wrote, in memory only (never in the ledger), so a held write
// can show what changed since the writer's version.
const lastText = new Map()
const textKey = (agent, path) => `${agent}\u0000${path}`
/**
 * @typedef {{ tab: string, selected: { type: string, id: string }|null, codaPath: string|null,
 *   held: { path: string, writer: string, against: string, tool: string, current: number, base: number|null,
 *     changed: string[]|null, currentText: string|null, proposed: string }|null,
 *   setTab: (tab: string) => void, select: (type: string, id: string) => void }} View
 */
/** @type {View} */
const view = { tab: 'ensemble', selected: null, codaPath: null, held: null, setTab: () => {}, select: () => {} }

const segmentOf = (n) => Math.ceil(n / SEGMENT_EVENTS)
const segmentFile = (n) => `${ledgerBase}.${String(n).padStart(4, '0')}.jsonl`

const short = (text, n) => {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

const relative = (path) => {
  const p = String(path || '')
  return cwd && p.startsWith(`${cwd}/`) ? p.slice(cwd.length + 1) : p
}

const loopOf = (e) => e.agentId || CONDUCTOR

async function sha256(text) {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function targetOf(e) {
  if (e.file_path) return relative(e.file_path)
  if (e.notebook_path) return relative(e.notebook_path)
  if (e.tool === 'Bash') return short(e.command, 80)
  if (e.pattern) return short(e.pattern, 60)
  if (e.tool === 'Agent') return short(e.description || e.subagent_type, 60)
  return ''
}

async function snapshot($, path) {
  try {
    const text = await $.fs.read(path)
    return { text, hash: await sha256(text) }
  } catch {
    return { text: null, hash: null }
  }
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
    if (!(await $.fs.exists(gitignore))) await $.fs.write(gitignore, '*\n')
    for (const w of writes) await $.fs.write(w.file, w.body)
    if (epoch === mine) persisted = Math.max(persisted, upTo)
  }).catch((err) => debug($, `Orchestra could not write its ledger: ${err instanceof Error ? err.message : String(err)}`))
  return persisting
}

// A debug-log line that never throws, for use inside error paths.
function debug($, text) {
  try {
    $.ui.log(text, { to: 'debug' })
  } catch {}
}

async function loadLedger($) {
  if (!(await $.fs.exists(ledgerDir))) return []
  const names = (await $.fs.list(ledgerDir)).map((x) => x.name)
    .filter((n) => n.startsWith(`${sessionId}.`) && /\.\d{4}\.jsonl$/.test(n)).sort()
  const events = []
  for (const name of names) {
    for (const text of (await $.fs.read(`${ledgerDir}/${name}`)).split('\n').filter(Boolean)) {
      try {
        events.push(JSON.parse(text))
      } catch {
        $.ui.log(`Orchestra skipped an unreadable ledger line in ${name}`, { to: 'debug' })
      }
    }
  }
  return events
}

const ledgerPath = () => relative(segmentFile(segmentOf(seq)))

// Every observation goes through here: append, fold, persist, then tell the user what changed.
// The sequence number is assigned only after the clock returns. Assigning it before the await
// let two hooks hold consecutive numbers while only the later one was applied, and the save
// then marked the earlier one as already written. Events are now applied and saved in order.
async function record($, fields) {
  const ts = await $.clock.now()
  const before = { stale: state.stale.length, handoffs: state.handoffs.length, conflicts: state.conflicts.length, failures: state.toolFailures.length }
  const event = { seq: ++seq, ts, ...fields }
  apply(state, event)
  // Once the event is applied it stands. Telling the user about it must not undo a decision
  // the caller is about to act on, so a failed toast or redraw is only logged.
  try {
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
    await persist($)
    $.ui.status(isPerformance(state) ? statusLine(state) : undefined)
    $.ui.invalidate('ui.render')
  } catch (err) {
    debug($, `Orchestra could not show event ${event.seq}: ${err instanceof Error ? err.message : String(err)}`)
  }
  return event
}

async function writeCoda($) {
  if (!isPerformance(state) || !codaFile) return
  const settled = musicians(state).every((m) => m.state === 'done' || m.state === 'failed')
  await $.fs.write(codaFile, codaMarkdown(state, ledgerPath()))
  await record($, { type: 'coda', path: relative(codaFile), settled })
  view.codaPath = relative(codaFile)
  if (settled) {
    $.ui.log(`Orchestra coda: ${statusLine(state)}. Written to ${relative(codaFile)}`)
    $.ui.toast('Orchestra · coda ready: /orchestra and open the Coda tab', { timeoutMs: 6000 })
  }
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
  if (e.tool === 'Edit') return `${e.old_string}\n  ↓\n${e.new_string}`
  if (e.tool === 'MultiEdit') return (e.edits || []).map((x) => x.new_string).join('\n…\n')
  if (e.tool === 'NotebookEdit') return e.new_source
  return ''
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
async function guardWrite($, e, key, path, current, approved = null) {
  const attempt = await record($, { type: 'write.attempt', agent: key, path, hash: current.hash })
  const conflict = state.conflicts.find((c) => c.seq === attempt.seq)
  if (approved) await record($, { type: 'conflict.resolved', id: approved.id, choice: conflict ? 'reask' : 'overwrite' })
  if (!conflict) {
    if (approved) notify($, `Orchestra · conflict on ${path}: ${nameOf(state, key)} vs ${nameOf(state, approved.against)}, write allowed`)
    return { base: current }
  }
  const writer = nameOf(state, key)
  const other = nameOf(state, conflict.against)
  const neverRead = conflict.base === null
  const seenText = neverRead ? `${writer} never read it` : `${writer} saw v${conflict.base}`
  if (neverRead) {
    await record($, { type: 'conflict.resolved', id: conflict.id, choice: 'reread' })
    notify($, `Orchestra · conflict on ${path}: ${writer} vs ${other}, sent back to re-read`)
    return { deny: `Orchestra: ${other} wrote ${path} v${conflict.current} and you never read it. Read the file, then reapply your change on top of its current content.` }
  }
  const question = `Orchestra: ${other} wrote ${path} v${conflict.current} and ${seenText}. Let ${writer}'s ${e.tool} go ahead?`
  let choice = 'reread'
  try {
    let label = await $.ui.ask(question, { header: 'Conflict', options: [LET_IT_WRITE, SEND_IT_BACK, SHOW_BOTH] })
    if (label === SHOW_BOTH) {
      const seenText = lastText.get(textKey(key, path))
      view.held = {
        path, writer, against: other, tool: e.tool, current: conflict.current, base: conflict.base,
        changed: seenText === undefined ? null : addedLines(seenText, current.text), currentText: current.text, proposed: proposedText(e),
      }
      view.tab = 'artifacts'
      view.selected = { type: 'artifact', id: path }
      await record($, { type: 'conflict.shown', id: conflict.id })
      label = await $.ui.ask(`${question} Both versions are shown above.`, { header: 'Conflict', options: [LET_IT_WRITE, SEND_IT_BACK] })
    }
    choice = label === LET_IT_WRITE ? 'overwrite' : 'reread'
  } catch {
    choice = 'reread'
  }
  view.held = null
  // Writes through Write and Edit wait on the file lock, but a Bash command or an edit outside
  // Claude Code can change the file while the dialog is open. Then the approval was for an older
  // version, so the write is attempted again against the version there now.
  if (choice === 'overwrite') {
    const again = await snapshot($, path)
    if (again.hash !== current.hash) return guardWrite($, e, key, path, again, conflict)
  }
  await record($, { type: 'conflict.resolved', id: conflict.id, choice })
  notify($, `Orchestra · conflict on ${path}: ${writer} vs ${other}, ${choice === 'overwrite' ? 'write allowed' : 'sent back to re-read'}`)
  if (choice === 'overwrite') return { base: current }
  return { deny: `Orchestra: ${other} wrote ${path} v${conflict.current} and you ${conflict.base === null ? 'never read it' : `last saw v${conflict.base}`}. Read the file again and reapply your change on top of its current content.` }
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
    !path.startsWith('.orchestra/performances/') && !path.startsWith('/') && !path.split('/').includes('..'))
  const snaps = await Promise.all(paths.map((path) => snapshot($, path)))
  return Object.fromEntries(paths.map((path, i) => [path, snaps[i]]))
}

async function attributeBash($, key, before, mark) {
  // `mark.overlapped` is read here, after the snapshots, not before them. Another loop's call
  // can start while the snapshots run, and that call can be what changed the file.
  const pairs = await Promise.all(Object.entries(before).map(async ([path, prev]) => ({ path, prev, now: await snapshot($, path) })))
  for (const { path, prev, now } of pairs) {
    if (!now.hash || now.hash === prev.hash) continue
    // A hash the ledger holds as its latest version was written by someone else and already
    // recorded. An older hash means the command reverted the file, which is a new version.
    const last = state.artifacts[path] && latest(state.artifacts[path])
    if (last && last.hash === now.hash) continue
    await record($, { type: 'artifact.write', agent: key, path, hash: now.hash, via: 'bash', uncertain: mark.overlapped, ...lineDelta(prev.text, now.text) })
  }
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

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'orchestra', description: 'Open the Orchestra pane, or /orchestra coda | ledger | close', immediate: true })
    const dir = await $.session.cwd()
    const id = await $.session.id()
    // The paths, the state and the counters change together with no await in between, so a hook
    // still running for the previous session cannot save its events into this session's files.
    epoch += 1
    cwd = dir
    sessionId = id
    ledgerDir = `${cwd}/.orchestra/performances`
    ledgerBase = `${ledgerDir}/${sessionId}`
    codaFile = `${ledgerBase}-coda.md`
    state = emptyState()
    seq = 0
    persisted = 0
    lastText.clear()
    Object.assign(view, { codaPath: null, held: null, selected: null })
    colorterm = (await $.env.get('COLORTERM')) || ''
    const theme = (await $.config.list()).find((row) => row.key === 'theme')?.value
    setColorMode(modeFor(theme, colorterm))
    $.clock.every(THEME_RECHECK_MS, () => {
      refreshTheme($).catch(() => {})
    })
    const events = await loadLedger($)
    if (events.length) {
      state = fold(events)
      seq = events[events.length - 1].seq
      persisted = seq
    } else {
      apply(state, { seq: ++seq, ts: await $.clock.now(), type: 'session.start', session: sessionId, cwd })
    }
    if (state.codaSeq) view.codaPath = relative(codaFile)
    $.ui.status(isPerformance(state) ? statusLine(state) : undefined)
    $.ui.invalidate('ui.render')
    return next(e)
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
    const fromPerson = ['composer', 'bridge', 'sdk'].includes(e.origin?.kind)
    if (fromPerson && typeof e.text === 'string' && !e.text.startsWith('/')) await record($, { type: 'prompt', text: short(e.text, 500) })
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) await record($, { type: 'turn.start' })
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    if (result && result.agentId) {
      const first = !isPerformance(state)
      await record($, {
        type: 'part.assigned', agent: result.agentId, subagentType: e.subagentType, description: e.description,
        prompt: short(e.prompt, 600), parent: e.parentAgentId || CONDUCTOR, toolUseId: e.tool_use_id, mentions: mentionsIn(e.prompt),
      })
      if (first) await $.ui.open({ id: PANE, title: 'Orchestra' })
    }
    return result
  })

  on('tool.call', async ($, e, next) => {
    const key = loopOf(e)
    const target = targetOf(e)
    const isWrite = WRITE_TOOLS.has(e.tool) && (e.file_path || e.notebook_path)
    let before = null
    let known = null
    let release = null
    let refusal = null
    let guardFrom = null
    inFlight.set(key, (inFlight.get(key) || 0) + 1)
    // Any Bash call another loop is running overlapped with this one, and this call with it.
    for (const other of bashRunning) if (other.loop !== key) other.overlapped = true
    const mark = { loop: key, overlapped: [...inFlight.entries()].some(([agent, n]) => agent !== key && n > 0) }
    if (e.tool === 'Bash') bashRunning.add(mark)
    // Orchestra's own bookkeeping fails open: an error in it is logged and the tool still runs,
    // and the tool's real result is returned. Only the tool's own error reaches the musician.
    try {
      try {
        if (e.tool === 'Bash') known = await snapshotKnown($)
        await record($, { type: 'tool.call', agent: key, tool: e.tool, target })
        if (isWrite) {
          release = await lockFile(target)
          before = await snapshot($, e.file_path || e.notebook_path)
          guardFrom = seq
          const guard = await guardWrite($, e, key, target, before)
          if (guard.deny) refusal = { deny: guard.deny }
          else before = guard.base
        }
      } catch (err) {
        // If the guard had found a conflict on this write and failed before the user's "Let it
        // write" was recorded, the write is sent back rather than landing unasked or against
        // the answer. The musician re-reads and tries again.
        const held = guardFrom === null ? undefined : state.conflicts.filter((c) => c.agent === key && c.path === target && c.seq > guardFrom).at(-1)
        if (held && held.choice !== 'overwrite') refusal = { deny: `Orchestra could not settle a conflict on ${target}. Read the file again and reapply your change on top of its current content.` }
        debug($, `Orchestra skipped recording ${e.tool}: ${err instanceof Error ? err.message : String(err)}`)
      }
      if (refusal) {
        await record($, { type: 'tool.result', agent: key, tool: e.tool, target, ok: false, sentBack: true, error: 'sent back by Orchestra: stale base' })
          .catch((err) => debug($, `Orchestra could not record a send-back: ${err instanceof Error ? err.message : String(err)}`))
        return refusal
      }
      const result = await next(e)
      try {
        const ok = !(result && (result.isError || result.deny))
        if (known) await attributeBash($, key, known, mark)
        if (ok && isWrite) {
          const after = await snapshot($, e.file_path || e.notebook_path)
          if (after.hash) await record($, { type: 'artifact.write', agent: key, path: target, hash: after.hash, ...lineDelta(before?.text ?? null, after.text) })
          if (after.text !== null) lastText.set(textKey(key, target), after.text)
        }
        if (ok && e.tool === 'Read' && e.file_path) {
          const seen = await snapshot($, e.file_path)
          if (seen.hash) await record($, { type: 'artifact.read', agent: key, path: target, hash: seen.hash })
          if (seen.text !== null) lastText.set(textKey(key, target), seen.text)
        }
        await record($, { type: 'tool.result', agent: key, tool: e.tool, target, ok, error: ok ? undefined : short(result?.text || result?.deny, 200) })
      } catch (err) {
        debug($, `Orchestra skipped recording the result of ${e.tool}: ${err instanceof Error ? err.message : String(err)}`)
      }
      return result
    } finally {
      inFlight.set(key, Math.max(0, (inFlight.get(key) || 1) - 1))
      bashRunning.delete(mark)
      if (release) release()
    }
  })

  on('turn.complete', async ($, e, next) => {
    try {
      if (e.agentId && state.musicians[e.agentId]) {
        if (e.reason === 'answer') await record($, { type: 'part.done', agent: e.agentId, answer: short(e.answer, 1200) })
        else await record($, { type: 'part.failed', agent: e.agentId, reason: e.reason, answer: short(e.answer, 600) })
      } else if (!e.agentId) {
        await record($, { type: 'turn.end' })
        await writeCoda($)
      }
    } catch (err) {
      $.ui.log(`Orchestra could not record the end of a turn: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    }
    return next(e)
  })

  on('command.run', { command: 'orchestra' }, async ($, e) => {
    const arg = String(e.args || '').trim()
    if (arg === 'close') {
      await $.ui.close(PANE)
      return {}
    }
    if (arg === 'ledger') {
      const colours = `colours: ${colorMode()}`
      return { text: isPerformance(state) ? `${ledgerPath()} · ${state.events.length} events · ${statusLine(state)} · ${colours}` : `No performance in this session yet: no musician has been assigned a part. ${colours}` }
    }
    if (arg === 'coda') {
      if (!isPerformance(state)) return { text: 'No performance in this session yet.' }
      const c = coda(state)
      return { text: [
        statusLine(state),
        ...c.contributions.map((x) => `${x.name}: ${x.reads} reads, ${x.writes} writes, +${x.added} −${x.removed}`),
        ...c.conflicts.map((x) => `Conflict: ${x.text}`),
        ...c.failures.map((x) => `Failure: ${x}`),
        ...c.stale.map((x) => `Stale: ${x}`),
        `Handoffs: ${c.handoffs.length}`,
      ].join('\n') }
    }
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
        el.Text({ dimColor: true, children: ['No performance yet. Start one with: claude --agent orchestra:conductor'] }),
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
    return pane(el, state, view, width)
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

  // While a write is held, the dialog shows the file as it is now beside the held change.
  on('ui.render', { component: 'AskUserQuestion' }, async ($, e, next) => {
    if (!view.held) return next(e)
    const el = $.ui.resolve(e)
    const ref = await next(e)
    const width = Math.max(40, e.viewport?.columns ?? 100)
    return el.Box({ flexDirection: 'column', children: [...heldWrite(el, view.held, width, DIALOG_LINES_PER_SIDE), ref] })
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
    const label = m ? `${GLYPH[m.state]} ${m.name} · ${m.role} · ${m.measures} measures` : `◌ ${def.name} · ${def.role}`
    const row = await next(e)
    return el.Box({ flexDirection: 'column', children: [el.Text({ color: paint(instrument), bold: true, children: [label] }), row].filter(Boolean) })
  })
}
