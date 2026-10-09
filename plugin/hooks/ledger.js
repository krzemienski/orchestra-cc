// Orchestra's ledger: an append-only list of observations, and the state folded from it.
// Only observations are recorded (a spawn, a tool call, the hash of a file read or written,
// a user's decision). Conflicts, stale reads and handoffs are derived here from versions,
// so replaying the same log always gives the same picture.

/**
 * @typedef {{ v: number, hash: string, agent: string, base: number|null, added: number, removed: number, seq: number, via?: string, uncertain?: boolean, unchecked?: boolean, observed?: boolean, candidates?: string[] }} Version
 * @typedef {{ path: string, versions: Version[], reads: { agent: string, v: number, seq: number }[] }} Artifact
 * @typedef {{ key: string, instrument: string, name: string, type: string, role: string, color: string, state: string, finished?: boolean,
 *   assigned: boolean, part: string|null, prompt?: string, parent?: string, measures: number,
 *   tool: { tool: string, target: string }|null, answer: string|null, failure?: string,
 *   seen: Record<string, number>, readSeq: Record<string, number>, reads: number, writes: number, added: number, removed: number }} Musician
 * @typedef {{ id: string, path: string, agent: string, tool?: string, against: string, base: number|null, current: number, seq: number,
 *   resolved: boolean, choice: string|null, auto?: boolean, resolvedSeq?: number, shown?: number,
 *   said?: string, landed?: boolean, refused?: string, redone?: boolean }} Conflict
 * @typedef {{ agent: string, path: string, readV: number, currentV: number, writer: string, products: string[], seq: number,
 *   cleared: boolean, clearedSeq?: number, clearedBy?: string }} Stale
 * @typedef {{ from: string, to: string, path: string, v: number, seq: number, via: string }} Handoff
 * @typedef {{ agent: string, tool: string, target: string, error?: string, seq: number, recoveredSeq: number|null, recoveredBy?: string }} ToolFailure
 * @typedef {Record<string, any> & { seq: number, ts: number, type: string }} LedgerEvent
 * @typedef {{ session: string|null, cwd: string|null, task: string|null, events: LedgerEvent[],
 *   musicians: Record<string, Musician>, order: string[], artifacts: Record<string, Artifact>,
 *   conflicts: Conflict[], stale: Stale[], handoffs: Handoff[], toolFailures: ToolFailure[],
 *   rows: Record<string, string>, codaSeq: number|null, requests: string[], ended: number|null,
 *   background: Record<string, { agent: string, command: string, seq: number, status: string|null }>,
 *   busySendBacks: { agent: string, target: string, seq: number }[] }} State
 */

/** @type {Record<string, { name: string, role: string }>} */
export const INSTRUMENTS = {
  conductor: { name: 'Conductor', role: 'Plans the score, assigns parts, presents the coda' },
  violin: { name: 'Violin', role: 'Scout' },
  trumpet: { name: 'Trumpet', role: 'Implementer' },
  flute: { name: 'Flute', role: 'Scribe' },
  timpani: { name: 'Timpani', role: 'Tester' },
  cello: { name: 'Cello', role: 'Reviewer' },
  guest: { name: 'Guest', role: 'Subagent outside the orchestra' },
}

export const CONDUCTOR = 'conductor'
const GUEST = { name: 'Guest', role: 'Subagent outside the orchestra' }
export const instrumentDef = (name) => INSTRUMENTS[name] ?? GUEST
// Authors who are not musicians: the file as first seen, a change made outside the ensemble, and
// a shell change that more than one musician's command could have made.
const NOBODY = new Set(['repo', 'outside', 'shell'])
// The conductor's plan, as recorded: paths inside the project are kept relative to it.
// Revising it is the plan working, not stale work, so it is never an input to stale work and
// never a product of it.
// The same path is named in agents/conductor.md, step 1.
const SCORE = '.orchestra/score.md'
// Ledgers written before 0.1.3 can name the score by its absolute path.
const isScore = (state, path) => path === SCORE || (state.cwd !== null && path === `${state.cwd}/${SCORE}`)

/** @returns {State} */
export function emptyState() {
  return {
    session: null,
    cwd: null,
    task: null,
    events: [],
    musicians: Object.assign(Object.create(null), { [CONDUCTOR]: newMusician(CONDUCTOR, 'conductor', instrumentDef('conductor').name, 'main loop') }),
    order: [CONDUCTOR],
    artifacts: Object.create(null),
    conflicts: [],
    stale: [],
    handoffs: [],
    toolFailures: [],
    background: Object.create(null),
    busySendBacks: [],
    rows: Object.create(null),
    requests: [],
    ended: null,
    codaSeq: null,
  }
}

// `color` is a palette token (see palette.js), the instrument's own key.
/** @returns {Musician} */
function newMusician(key, instrument, name, type) {
  return {
    key, instrument, name, type,
    role: instrumentDef(instrument).role, color: instrument,
    state: key === CONDUCTOR ? 'resting' : 'playing',
    assigned: key === CONDUCTOR,
    part: null, measures: 0, tool: null, answer: null,
    seen: Object.create(null), readSeq: Object.create(null),
    reads: 0, writes: 0, added: 0, removed: 0,
  }
}

export function instrumentOf(type) {
  const name = String(type || '').replace(/^orchestra:/, '')
  return INSTRUMENTS[name] && name !== 'conductor' && name !== 'guest' ? name : 'guest'
}

function displayName(state, key, instrument, type) {
  const same = state.order.filter((k) => k !== key && state.musicians[k].instrument === instrument).length
  const base = instrument === 'guest' ? `${GUEST.name} (${type})` : instrumentDef(instrument).name
  return same ? `${base} ${same + 1}` : base
}

function ensureMusician(state, key, type = 'unknown') {
  if (state.musicians[key]) return state.musicians[key]
  const instrument = instrumentOf(type)
  const m = newMusician(key, instrument, displayName(state, key, instrument, type), type)
  state.musicians[key] = m
  state.order.push(key)
  return m
}

// A loop first seen through a tool call is identified once its spawn is recorded.
function identify(state, m, type) {
  if (!type || m.type === type) return
  const instrument = instrumentOf(type)
  Object.assign(m, { type, instrument, role: instrumentDef(instrument).role, color: instrument, name: displayName(state, m.key, instrument, type) })
}

function ensureArtifact(state, path) {
  if (!state.artifacts[path]) state.artifacts[path] = { path, versions: [], reads: [] }
  return state.artifacts[path]
}

export const latest = (a) => a.versions[a.versions.length - 1]

// Two version numbers of one file can hold the same bytes, for example after a revert.
const sameContent = (a, v1, v2) => v1 === v2 || (a.versions[v1] !== undefined && a.versions[v1]?.hash === a.versions[v2]?.hash)

// The version a hash belongs to. A hash never seen before is a version nobody in the
// ensemble wrote: the file as it was at first sight, or a change made outside.
function versionOf(state, path, hash, seq) {
  const a = ensureArtifact(state, path)
  const known = [...a.versions].reverse().find((x) => x.hash === hash)
  if (known) return known
  const v = { v: a.versions.length, hash, agent: a.versions.length ? 'outside' : 'repo', base: null, added: 0, removed: 0, seq, observed: true }
  a.versions.push(v)
  // A change made outside the ensemble replaces a version like any other: what was produced from
  // the older one is now stale.
  if (v.agent === 'outside') markStaleReaders(state, a, v, { path, agent: 'outside', seq })
  return v
}

// Whether a write by `agent` over version `cur` of a file conflicts: the file changed since the
// writer last saw it, or the writer never read it and another musician wrote it.
function overwritesUnseen(state, agent, path, cur) {
  const seen = state.musicians[agent]?.seen[path]
  if (seen === undefined) return !NOBODY.has(cur.agent) && cur.agent !== agent
  const a = state.artifacts[path]
  return seen !== cur.v && a?.versions[seen]?.hash !== cur.hash
}

// Whether a write attempt over the file at `hash` would conflict, without recording anything.
export function wouldConflict(state, agent, path, hash) {
  // A file that is gone has no version to overwrite (the write.attempt fold skips it too).
  if (hash === null || hash === undefined) return false
  const a = state.artifacts[path]
  const known = a && [...a.versions].reverse().find((x) => x.hash === hash)
  const n = a ? a.versions.length : 0
  return overwritesUnseen(state, agent, path, known ?? { v: n, hash, agent: n ? 'outside' : 'repo' })
}

// Anyone who used an older version of this file to produce something else is now stale.
function markStaleReaders(state, a, ver, e) {
  if (isScore(state, e.path)) return
  for (const key of state.order) {
    const other = state.musicians[key]
    if (!other) continue
    const readV = other.seen[e.path]
    if (key === e.agent || key === CONDUCTOR || readV === undefined || readV >= ver.v || sameContent(a, readV, ver.v)) continue
    const products = productsSince(state, key, other.readSeq[e.path]).filter((p) => p !== e.path)
    if (!products.length) continue
    if (state.stale.some((s) => s.agent === key && s.path === e.path && !s.cleared)) continue
    state.stale.push({ agent: key, path: e.path, readV, currentV: ver.v, writer: e.agent, products, seq: e.seq, cleared: false })
  }
}

function addHandoff(state, from, to, path, v, seq, via) {
  if (NOBODY.has(from) || from === to) return
  if (state.handoffs.some((h) => h.from === from && h.to === to && h.path === path && h.v === v)) return
  state.handoffs.push({ from, to, path, v, seq, via })
}

export function artifactStatus(state, path) {
  if (state.conflicts.some((c) => c.path === path && !c.resolved)) return 'conflict'
  if (state.stale.some((s) => s.path === path && !s.cleared)) return 'stale'
  return 'ok'
}

/** @type {Record<string, (state: State, e: LedgerEvent) => void>} */
const handlers = {
  'session.start'(state, e) {
    state.session = e.session
    state.cwd = e.cwd
  },
  // The task is the person's prompt the performance began under; prompts after that are later
  // requests within it.
  'prompt'(state, e) {
    if (isPerformance(state)) state.requests.push(e.text)
    else state.task = e.text
  },
  // The session went on in a new process (--continue, --resume): kept as a marker in the ledger.
  'session.resumed'(state) {
    state.ended = null
  },
  // The process holding the session ended (exit, /clear, a switch to another session).
  'session.ended'(state, e) {
    state.ended = e.seq
  },
  'turn.start'(state) {
    ensureMusician(state, CONDUCTOR).state = 'playing'
  },
  'turn.end'(state) {
    ensureMusician(state, CONDUCTOR).state = 'resting'
  },
  'part.assigned'(state, e) {
    const m = ensureMusician(state, e.agent, e.subagentType)
    identify(state, m, e.subagentType)
    m.assigned = true
    m.part = e.description || null
    m.prompt = e.prompt
    m.parent = e.parent || CONDUCTOR
    m.state = 'playing'
    m.finished = false
    if (e.toolUseId) state.rows[e.toolUseId] = e.agent
    // A brief that names a file another musician wrote hands that version over.
    for (const path of e.mentions || []) {
      const a = state.artifacts[path]
      if (a && a.versions.length) addHandoff(state, latest(a).agent, e.agent, path, latest(a).v, e.seq, 'brief')
    }
  },
  'tool.call'(state, e) {
    const m = ensureMusician(state, e.agent)
    m.tool = { tool: e.tool, target: e.target }
    // A finished musician woken only to read its background command's notification stays finished.
    if (m.state !== 'waiting' && !m.finished) m.state = 'playing'
  },
  'tool.result'(state, e) {
    const m = ensureMusician(state, e.agent)
    m.tool = null
    m.measures += 1
    if (!e.ok && e.sentBack) {
      if (String(e.error).includes('file busy')) state.busySendBacks.push({ agent: e.agent, target: e.target, seq: e.seq })
      return
    }
    // A call cut off when the session ended is not a failure of the tool.
    if (!e.ok && e.error === 'session ended') return
    if (!e.ok) {
      // A write the user let go ahead that then failed (Claude Code's own check that the file is
      // unchanged since it was read, say): the decision did not land.
      const allowed = state.conflicts.filter((c) => c.agent === e.agent && c.path === e.target && (!c.tool || c.tool === e.tool) && c.choice === 'overwrite' && !c.landed && !c.refused).at(-1)
      if (allowed) allowed.refused = String(e.error || 'the write failed')
      state.toolFailures.push({ agent: e.agent, tool: e.tool, target: e.target, error: e.error, seq: e.seq, recoveredSeq: null })
      return
    }
    // A failed call is recovered when any musician later runs the same call successfully.
    for (const f of state.toolFailures) {
      if (f.tool === e.tool && f.target === e.target && f.recoveredSeq === null) {
        f.recoveredSeq = e.seq
        f.recoveredBy = e.agent
      }
    }
  },
  'artifact.read'(state, e) {
    const m = ensureMusician(state, e.agent)
    const ver = versionOf(state, e.path, e.hash, e.seq)
    ensureArtifact(state, e.path).reads.push({ agent: e.agent, v: ver.v, seq: e.seq })
    m.reads += 1
    m.seen[e.path] = ver.v
    m.readSeq[e.path] = e.seq
    for (const s of state.stale) {
      if (s.agent === e.agent && s.path === e.path && !s.cleared && ver.v >= s.currentV) {
        s.cleared = true
        s.clearedSeq = e.seq
        s.clearedBy = e.agent
      }
    }
    addHandoff(state, ver.agent, e.agent, e.path, ver.v, e.seq, 'read')
  },
  // Seen just before a write runs: the hash of the file as the writer is about to change it.
  'write.attempt'(state, e) {
    const m = ensureMusician(state, e.agent)
    if (e.hash === null) return
    const cur = versionOf(state, e.path, e.hash, e.seq)
    const seen = m.seen[e.path]
    if (!overwritesUnseen(state, e.agent, e.path, cur)) return
    state.conflicts.push({
      id: `c${state.conflicts.length + 1}`, path: e.path, agent: e.agent, tool: e.tool, against: cur.agent,
      base: seen ?? null, current: cur.v, seq: e.seq, resolved: false, choice: null,
    })
    m.state = 'waiting'
  },
  'conflict.shown'(state, e) {
    const c = state.conflicts.find((x) => x.id === e.id)
    if (c) c.shown = (c.shown || 0) + 1
  },
  'conflict.resolved'(state, e) {
    const c = state.conflicts.find((x) => x.id === e.id)
    if (!c) return
    c.resolved = true
    c.choice = e.choice
    c.auto = Boolean(e.auto)
    if (e.said) c.said = e.said
    c.resolvedSeq = e.seq
    const m = state.musicians[c.agent]
    const stillHeld = state.conflicts.some((x) => x.agent === c.agent && !x.resolved)
    // A finished musician woken to read its task's output stays finished once the write is settled.
    if (m && m.state === 'waiting' && !stillHeld) m.state = m.finished ? (m.failure ? 'failed' : 'done') : 'playing'
  },
  'artifact.write'(state, e) {
    const a = ensureArtifact(state, e.path)
    const prev = latest(a)
    // A shell change no single musician can be credited with: a version of nobody's, seen by none.
    if (NOBODY.has(e.agent)) {
      if (prev && prev.hash === e.hash) return
      const ver = { v: a.versions.length, hash: e.hash, agent: e.agent, candidates: e.candidates, base: null, added: e.added, removed: e.removed, seq: e.seq, via: e.via, uncertain: true, unchecked: e.unchecked }
      a.versions.push(ver)
      markStaleReaders(state, a, ver, e)
      return
    }
    const m = ensureMusician(state, e.agent)
    for (const f of state.toolFailures) {
      if (f.agent === e.agent && f.target === e.path && f.recoveredSeq === null) f.recoveredSeq = e.seq
    }
    for (const c of state.conflicts) {
      if (c.agent !== e.agent || c.path !== e.path || c.choice !== 'overwrite') continue
      if (!c.refused) c.landed = true
      else c.redone = true
    }
    // Stale work is redone when its product is rewritten by someone who has seen the current input.
    for (const s of state.stale) {
      if (s.cleared || !s.products.includes(e.path)) continue
      const art = ensureArtifact(state, s.path)
      const input = latest(art)
      const seenV = m.seen[s.path]
      if (input && seenV !== undefined && (seenV >= input.v || sameContent(art, seenV, input.v))) {
        s.cleared = true
        s.clearedSeq = e.seq
        s.clearedBy = e.agent
      }
    }
    // The same bytes as the latest version: nothing changed, so nothing is counted. Unless that
    // version was first seen by a read while this write was landing (the write changed the file,
    // `from` its earlier bytes): then this write made it, and it is credited here.
    if (prev && prev.hash === e.hash) {
      const landedUnseen = prev.observed && (prev.agent === 'outside' || prev.agent === 'repo') && e.from && e.from !== e.hash
      if (!landedUnseen) {
        m.seen[e.path] = prev.v
        return
      }
      a.versions.pop()
      // What that first sight flagged as stale was blamed on a change from outside. This write is
      // that change: its own check below flags the other readers again, against the real writer.
      state.stale = state.stale.filter((s) => s.cleared || s.path !== e.path || s.currentV !== prev.v || s.writer !== prev.agent)
    }
    m.writes += 1
    m.added += e.added ?? 0
    m.removed += e.removed ?? 0
    const ver = { v: a.versions.length, hash: e.hash, agent: e.agent, base: m.seen[e.path] ?? null, added: e.added, removed: e.removed, seq: e.seq, via: e.via, uncertain: e.uncertain, unchecked: e.unchecked }
    a.versions.push(ver)
    m.seen[e.path] = ver.v
    m.readSeq[e.path] = e.seq
    for (const r of a.reads) if (r.v === ver.v) addHandoff(state, e.agent, r.agent, e.path, ver.v, r.seq, 'read')
    if (isScore(state, e.path)) return
    markStaleReaders(state, a, ver, e)
    // The other order: this writer read an input, someone else changed it, and only now does
    // the writer produce from the version they first saw. The check above never sees that,
    // because it runs when the input changes, before the product exists.
    // The conductor is left out of both checks: it reads to plan, and its only product is the
    // score, so an input changing under it is the plan working, not stale work.
    if (e.agent === CONDUCTOR) return
    for (const [input, readV] of Object.entries(m.seen)) {
      if (input === e.path || isScore(state, input)) continue
      const cur = latest(state.artifacts[input])
      if (!cur || readV >= cur.v || sameContent(state.artifacts[input], readV, cur.v)) continue
      if (state.stale.some((s) => s.agent === e.agent && s.path === input && !s.cleared)) continue
      state.stale.push({ agent: e.agent, path: input, readV, currentV: cur.v, writer: cur.agent, products: [e.path], seq: e.seq, cleared: false })
    }
  },
  // A finished musician the conductor sent more work (SendMessage) plays again.
  'part.resumed'(state, e) {
    const m = ensureMusician(state, e.agent)
    m.finished = false
    m.failure = undefined
    m.state = 'playing'
  },
  'part.done'(state, e) {
    const m = ensureMusician(state, e.agent)
    m.finished = true
    m.state = 'done'
    m.tool = null
    m.answer = e.answer
  },
  'part.failed'(state, e) {
    const m = ensureMusician(state, e.agent)
    m.finished = true
    m.state = 'failed'
    m.tool = null
    m.answer = e.answer
    m.failure = e.reason
  },
  'background.started'(state, e) {
    ensureMusician(state, e.agent)
    state.background[e.task] = { agent: e.agent, command: e.command, seq: e.seq, status: null }
  },
  'background.ended'(state, e) {
    const b = state.background[e.task]
    if (b) b.status = e.status
  },
  'coda'(state, e) {
    state.codaSeq = e.seq
  },
}

// Files a musician wrote after a given moment and that still hold its work (nobody rewrote them
// since): the work that depends on what it had read then.
function productsSince(state, key, sinceSeq) {
  return Object.values(state.artifacts)
    .filter((a) => !isScore(state, a.path) && latest(a)?.agent === key && a.versions.some((v) => v.agent === key && v.seq > (sinceSeq ?? 0)))
    .map((a) => a.path)
}

// An event is kept only once its handler has applied it, so a handler that throws leaves no
// half-recorded event behind to be saved.
export function apply(state, e) {
  const handle = handlers[e.type]
  if (!handle) return state
  handle(state, e)
  state.events.push(e)
  return state
}

// What a loaded ledger's process left open, as events that close it: that process is gone (it
// exited, crashed, or the session was switched away from), so parts still playing or waiting end
// as failed, conflicts still open are settled as sent back (the write never ran), and the
// conductor's turn ends. Background commands still running are closed by the caller.
export function closeLeftOpen(state) {
  const open = state.conflicts.filter((c) => !c.resolved).map((c) => ({ type: 'conflict.resolved', id: c.id, choice: 'reread', auto: true }))
  // Calls that never got a result, oldest first, per agent and tool.
  const pending = new Map()
  for (const e of state.events) {
    if (e.type !== 'tool.call' && e.type !== 'tool.result') continue
    const k = `${e.agent}\u0000${e.tool}\u0000${e.target}`
    const list = pending.get(k) || []
    if (e.type === 'tool.call') list.push(e)
    else list.shift()
    pending.set(k, list)
  }
  const calls = [...pending.values()].flat().sort((x, y) => x.seq - y.seq)
    .map((c) => ({ type: 'tool.result', agent: c.agent, tool: c.tool, target: c.target, ok: false, error: 'session ended' }))
  const parts = musicians(state).filter((m) => !m.finished && (m.state === 'playing' || m.state === 'waiting'))
    .map((m) => ({ type: 'part.failed', agent: m.key, reason: 'session ended', answer: null }))
  const conductorState = state.musicians[CONDUCTOR]?.state
  const conductor = conductorState === 'playing' || conductorState === 'waiting' ? [{ type: 'turn.end' }] : []
  return [...open, ...calls, ...parts, ...conductor]
}

export function fold(events) {
  return events.reduce(apply, emptyState())
}

// The roster: the conductor plus every loop it assigned a part to. Other loops (another
// plugin's hook agents, the engine's own forks) stay in the ledger but are not musicians.
export const roster = (state) => state.order.filter((k) => state.musicians[k].assigned)
export const musicians = (state) => roster(state).filter((k) => k !== CONDUCTOR).map((k) => state.musicians[k])
export const isPerformance = (state) => musicians(state).length > 0
// A musician's name with its part, as the conflict dialog and toasts name it, so two trumpets can
// be told apart.
export const whoOf = (state, key) => {
  const m = state.musicians[key]
  return m && m.part ? `${m.name} (${m.part.length > 40 ? `${m.part.slice(0, 39)}…` : m.part})` : nameOf(state, key)
}

export const nameOf = (state, key) => (state.musicians[key] ? state.musicians[key].name
  : key === 'outside' ? 'someone outside the ensemble' : key === 'shell' ? 'a shell command' : key)

// Who wrote a version: a musician, or for a shell change no single musician made, the musicians
// whose commands could have.
export const authorOf = (state, v) => (v?.agent === 'shell' && v.candidates?.length
  ? `a shell command run by ${v.candidates.map((k) => nameOf(state, k)).join(' or ')}`
  : nameOf(state, v?.agent))

export function counts(state) {
  const ms = musicians(state)
  const by = (s) => ms.filter((m) => m.state === s).length
  return {
    playing: by('playing'), waiting: by('waiting'), done: by('done'), failed: by('failed'),
    changed: Object.values(state.artifacts).filter((a) => a.versions.some((v) => v.agent !== 'repo')).length,
    openConflicts: state.conflicts.filter((c) => !c.resolved).length,
    openStale: state.stale.filter((s) => !s.cleared).length,
  }
}

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export function statusLine(state) {
  const c = counts(state)
  return [
    'Orchestra',
    `${c.playing} playing`,
    c.waiting ? `${c.waiting} waiting` : null,
    `${c.done} done`,
    c.failed ? `${c.failed} failed` : null,
    `${plural(c.changed, 'artifact')} changed`,
    c.openConflicts ? plural(c.openConflicts, 'conflict') : null,
    c.openStale ? `${c.openStale} stale` : null,
  ].filter(Boolean).join(' · ')
}

const rosterFailures = (state) => state.toolFailures.filter((f) => f.agent !== CONDUCTOR && state.musicians[f.agent]?.assigned)

// Every sentence of the coda comes from ledger state, never from a musician's own prose.
// A file's authors for the coda: musicians first, in the order they wrote, then anyone else.
function authorsOf(state, versions) {
  return [...new Set(versions.map((v) => authorOf(state, v)))]
}

// "a", "a and b", "a, b and c".
export const listJoin = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

// Why a part ended without its answer, in words.
export const failureText = (reason) => (reason === 'session ended' ? 'the part was cut off when the session ended'
  : reason ? `the part ended early (${reason})` : 'the part ended early')

export function coda(state) {
  // Every assigned musician, including one whose work left no recorded reads or writes (a
  // reviewer that only answered); the conductor only when it touched files.
  const contributions = roster(state).map((k) => state.musicians[k])
    .filter((m) => m.key !== CONDUCTOR || m.writes > 0 || m.reads > 0)
    .map((m) => {
      const own = Object.values(state.artifacts).flatMap((a) => a.versions.filter((v) => v.agent === m.key))
      return {
        key: m.key, name: m.name, role: m.role, reads: m.reads, writes: m.writes, added: m.added, removed: m.removed,
        failure: m.state === 'failed' ? m.failure || 'a failure' : null,
        shell: own.filter((v) => v.via === 'bash').length,
        uncertain: own.filter((v) => v.uncertain).length,
        unchecked: own.filter((v) => v.unchecked).length,
        shared: Object.values(state.artifacts).flatMap((a) => a.versions.filter((v) => v.agent === 'shell' && v.candidates?.includes(m.key)))
          .flatMap((v) => v.candidates.filter((k) => k !== m.key).map((k) => nameOf(state, k))),
        artifacts: Object.values(state.artifacts).filter((a) => a.versions.some((v) => v.agent === m.key)).map((a) => a.path),
      }
    })
  // Every version after the file as first seen, the ones written outside the ensemble included.
  const newVersions = (a) => a.versions.filter((v) => v.agent !== 'repo')
  const changed = Object.values(state.artifacts)
    .filter((a) => newVersions(a).length)
    .map((a) => ({ path: a.path, versions: newVersions(a).length, authors: authorsOf(state, newVersions(a)), hash: latest(a).hash }))
  const conflicts = [
    ...state.conflicts.map((c) => ({
      ...c,
      text: c.base === null
        ? `${nameOf(state, c.agent)}'s write to ${c.path} was sent back without asking: it had never read the file, and ${authorOf(state, state.artifacts[c.path]?.versions[c.current])} had written v${c.current}.`
        : `${nameOf(state, c.agent)} tried to write ${c.path} over v${c.current}, written by ${authorOf(state, state.artifacts[c.path]?.versions[c.current])} (had seen v${c.base}). ${
          !c.resolved ? 'Still open.'
            : c.choice === 'overwrite' && c.refused ? `You let the write go ahead, but it then failed${
              /modified since read/i.test(c.refused) ? ` (Claude Code refused it: the file had changed since ${nameOf(state, c.agent)} read it)` : ` (${c.refused.slice(0, 120)})`}.${
              c.redone ? ` ${nameOf(state, c.agent)} redid it after reading the file again.` : ''}`
            : c.choice === 'overwrite' ? 'You let the write go ahead.'
            : c.choice === 'reask' ? 'You let the write go ahead, but the file changed before it landed, so you were asked again.'
            : c.auto ? 'Orchestra sent the write back to re-read, without a decision from you.'
            : c.said ? `You sent the write back to re-read, saying: "${c.said}".`
            : 'You sent the write back to re-read.'}`,
    })),
    ...state.busySendBacks.map((b) => ({ seq: b.seq, text: `${nameOf(state, b.agent)}'s write to ${b.target} was sent back because another write to it was in progress.` })),
  ].sort((x, y) => x.seq - y.seq)
  const failures = [
    ...musicians(state).filter((m) => m.state === 'failed').map((m) => `${m.name}: ${failureText(m.failure)}.`),
    ...rosterFailures(state).map((f) => `${nameOf(state, f.agent)}: ${f.tool} ${f.target} failed${f.recoveredSeq ? `; ${nameOf(state, f.recoveredBy || f.agent)} later ran it successfully`
      : state.musicians[f.agent]?.finished ? '; the part has ended' : '; not yet recovered'}.`),
  ]
  const stale = state.stale.map((s) => `${nameOf(state, s.agent)} produced ${s.products.join(', ')} from v${s.readV} of ${s.path}; ${nameOf(state, s.writer)} then wrote v${s.currentV}. ${
    s.cleared ? `Redone from the current version by ${nameOf(state, s.clearedBy)}.` : 'Not redone.'}`)
  const handoffs = state.handoffs.map((h) => `${nameOf(state, h.from)} → ${nameOf(state, h.to)}: ${h.path} v${h.v}${h.via === 'brief' ? ' (named in the brief)' : ''}`)
  const ending = {
    completed: 'it finished.', failed: 'it failed.', killed: 'it was stopped.',
    'part ended': 'it was stopped when its part ended.',
    'turn ended': "it was stopped when the conductor's turn ended.",
    'session ended': 'it was still running when the session ended, so later changes it made are not recorded.',
  }
  const background = Object.entries(state.background).map(([task, b]) => `${nameOf(state, b.agent)} ran \`${b.command}\` in the background (task ${task}): ${
    b.status === null ? 'still running when this was written.' : ending[b.status] ?? `it ended (${b.status}).`}`)
  return { task: state.task, requests: state.requests, counts: counts(state), contributions, changed, conflicts, failures, stale, handoffs, background }
}

// One musician's line in every coda: the file, /orchestra coda and the pane's Coda tab.
export function contributionText(x) {
  const failed = x.failure ? `; ${failureText(x.failure)}` : ''
  if (!x.reads && !x.writes) return `${x.name}: no file reads or writes recorded${failed}`
  const notes = [
    x.shell ? `${plural(x.shell, 'change')} by shell command${x.uncertain ? `, ${x.uncertain} uncertain because other musicians' commands or edits ran at the same time` : ''}` : null,
    x.unchecked && x.unchecked < x.writes ? `line counts unknown for ${x.unchecked}` : null,
    x.shared?.length ? `${plural(x.shared.length, 'shell change')} shared with ${listJoin([...new Set(x.shared)])}, credited to neither` : null,
  ].filter(Boolean)
  const wrote = x.artifacts.length ? `; wrote ${x.artifacts.join(', ')}` : ''
  const lines = !x.writes ? '' : x.unchecked === x.writes ? ', line counts unknown' : `, +${x.added} −${x.removed}`
  return `${x.name}: ${plural(x.reads, 'read')}, ${plural(x.writes, 'write')}${lines}${notes.length ? ` (${notes.join('; ')})` : ''}${wrote}${failed}`
}

// A version's hash as the pane shows it: short SHA-256, or "size/time" for a file too large to hash.
export const hashLabel = (hash) => (String(hash).startsWith('stat:') ? 'size/time' : `sha256:${String(hash).slice(0, 12)}`)

// A file's current version as the coda names it: its SHA-256, or its size when it was too large
// for Orchestra to read and hash.
const versionLabel = (hash) => {
  const stat = /^stat:(\d+):/.exec(hash)
  return stat ? `now ${stat[1]} bytes (too large to hash)` : `now sha256:${hash}`
}

// The coda's sections, the same in the coda file, /orchestra coda and the pane's Coda tab.
export function codaSections(state, c = coda(state)) {
  return [
    ['Who contributed what', c.contributions.map(contributionText)],
    ['Artifacts changed', c.changed.map((a) => `${a.path}: ${plural(a.versions, 'new version')} by ${a.authors.join(', then ')}; ${versionLabel(a.hash)}`)],
    ['Handoffs', c.handoffs],
    ['Conflicts', c.conflicts.map((x) => x.text)],
    ['Failures', c.failures],
    ['Stale reads', c.stale],
    ['Background commands', c.background],
  ]
}

export function codaMarkdown(state, sessionFile) {
  const list = (items) => (items.length ? items.map((x) => `- ${x}`) : ['- none'])
  return [
    '# Orchestra coda',
    '',
    `Task: ${state.task || '(not recorded)'}`,
    ...(state.requests.length ? [`Later requests: ${state.requests.join(' | ')}`] : []),
    `Ledger: ${sessionFile}`,
    `Status: ${statusLine(state)}`,
    '',
    ...codaSections(state).flatMap(([title, items]) => [`## ${title}`, ...list(items), '']),
  ].join('\n')
}

// Lines added and removed between two texts, counted as a multiset of lines.
export function lineDelta(before, after) {
  const count = (text) => {
    const m = new Map()
    for (const line of String(text ?? '').split('\n')) m.set(line, (m.get(line) || 0) + 1)
    return m
  }
  const a = count(before)
  const b = count(after)
  let added = 0
  let removed = 0
  for (const [line, n] of b) added += Math.max(0, n - (a.get(line) || 0))
  for (const [line, n] of a) removed += Math.max(0, n - (b.get(line) || 0))
  if (before === null || before === undefined) removed = 0
  return { added, removed }
}
