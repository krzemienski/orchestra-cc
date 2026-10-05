// Orchestra's hooks module. It records what each agent loop reads and writes into a
// per-session ledger, guards writes that would overwrite another musician's newer work,
// and draws the ensemble on the surfaces a mod owns: a pane, the band above the prompt,
// the status line, toasts, the spinner and the Agent tool rows.

import { CONDUCTOR, instrumentDef, apply, codaMarkdown, coda, emptyState, fold, instrumentOf, INSTRUMENTS, isPerformance, lineDelta, musicians, nameOf, statusLine } from './ledger.js'
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
let persisting = Promise.resolve()
// Tool calls running now, per agent loop: a Bash change is attributed with certainty only when
// no other loop had a call in flight.
const inFlight = new Map()
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

// The ledger is written in segments of SEGMENT_EVENTS events; only the newest segment is
// rewritten, so a torn write can lose at most the events of that one segment.
async function persist($) {
  if (!isPerformance(state) || !ledgerBase) return
  const current = segmentOf(seq)
  const body = state.events.filter((x) => segmentOf(x.seq) === current).map((x) => JSON.stringify(x)).join('\n')
  persisting = persisting.then(async () => {
    if (!(await $.fs.exists(`${cwd}/.orchestra/.gitignore`))) await $.fs.write(`${cwd}/.orchestra/.gitignore`, '*\n')
    await $.fs.write(segmentFile(current), `${body}\n`)
  }).catch((err) => $.ui.log(`Orchestra could not write its ledger: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' }))
  return persisting
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
async function record($, fields) {
  const before = { stale: state.stale.length, handoffs: state.handoffs.length, conflicts: state.conflicts.length, failures: state.toolFailures.length }
  const event = { seq: ++seq, ts: await $.clock.now(), ...fields }
  apply(state, event)
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
async function guardWrite($, e, key, path, current) {
  const attempt = await record($, { type: 'write.attempt', agent: key, path, hash: current.hash })
  const conflict = state.conflicts.find((c) => c.seq === attempt.seq)
  if (!conflict) return null
  const writer = nameOf(state, key)
  const other = nameOf(state, conflict.against)
  const seenText = conflict.base === null ? `${writer} never read it` : `${writer} saw v${conflict.base}`
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
  await record($, { type: 'conflict.resolved', id: conflict.id, choice })
  $.ui.toast(`Orchestra · conflict on ${path}: ${writer} vs ${other}, ${choice === 'overwrite' ? 'write allowed' : 'sent back to re-read'}`, { timeoutMs: 8000 })
  if (choice === 'overwrite') return null
  return { deny: `Orchestra: ${other} wrote ${path} v${conflict.current} and you ${conflict.base === null ? 'never read it' : `last saw v${conflict.base}`}. Read the file again and reapply your change on top of its current content.` }
}

// Files the ledger already knows, read before and after a Bash call; any that changed is a
// version written by whoever ran the command.
async function snapshotKnown($) {
  const known = {}
  for (const path of Object.keys(state.artifacts)) known[path] = await snapshot($, path)
  return known
}

async function attributeBash($, key, before) {
  const uncertain = [...inFlight.entries()].some(([agent, n]) => agent !== key && n > 0)
  for (const [path, prev] of Object.entries(before)) {
    const now = await snapshot($, path)
    if (!now.hash || now.hash === prev.hash) continue
    // A hash the ledger already holds was written by someone else while this command ran.
    if (state.artifacts[path]?.versions.some((v) => v.hash === now.hash)) continue
    await record($, { type: 'artifact.write', agent: key, path, hash: now.hash, via: 'bash', uncertain, ...lineDelta(prev.text, now.text) })
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
    cwd = await $.session.cwd()
    sessionId = await $.session.id()
    ledgerDir = `${cwd}/.orchestra/performances`
    ledgerBase = `${ledgerDir}/${sessionId}`
    codaFile = `${ledgerBase}-coda.md`
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
    } else {
      state = emptyState()
      seq = 0
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
    inFlight.set(key, (inFlight.get(key) || 0) + 1)
    try {
      if (e.tool === 'Bash') known = await snapshotKnown($)
      await record($, { type: 'tool.call', agent: key, tool: e.tool, target })
      if (isWrite) {
        before = await snapshot($, e.file_path || e.notebook_path)
        const refusal = await guardWrite($, e, key, target, before)
        if (refusal) {
          await record($, { type: 'tool.result', agent: key, tool: e.tool, target, ok: false, sentBack: true, error: 'sent back by Orchestra: stale base' })
          inFlight.set(key, Math.max(0, (inFlight.get(key) || 1) - 1))
          return refusal
        }
      }
    } catch (err) {
      $.ui.log(`Orchestra skipped recording ${e.tool}: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    }
    let result
    try {
      result = await next(e)
    } finally {
      inFlight.set(key, Math.max(0, (inFlight.get(key) || 1) - 1))
    }
    try {
      const ok = !(result && (result.isError || result.deny))
      if (known) await attributeBash($, key, known)
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
      $.ui.log(`Orchestra skipped recording the result of ${e.tool}: ${err instanceof Error ? err.message : String(err)}`, { to: 'debug' })
    }
    return result
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
