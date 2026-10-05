// Orchestra's ledger: an append-only list of observations, and the state folded from it.
// Only observations are recorded (a spawn, a tool call, the hash of a file read or written,
// a user's decision). Conflicts, stale reads and handoffs are derived here from versions,
// so replaying the same log always gives the same picture.

/**
 * @typedef {{ v: number, hash: string, agent: string, base: number|null, added: number, removed: number, seq: number, via?: string, uncertain?: boolean }} Version
 * @typedef {{ path: string, versions: Version[], reads: { agent: string, v: number, seq: number }[] }} Artifact
 * @typedef {{ key: string, instrument: string, name: string, type: string, role: string, color: string, state: string,
 *   assigned: boolean, part: string|null, prompt?: string, parent?: string, measures: number,
 *   tool: { tool: string, target: string }|null, answer: string|null, failure?: string,
 *   seen: Record<string, number>, readSeq: Record<string, number>, reads: number, writes: number, added: number, removed: number }} Musician
 * @typedef {{ id: string, path: string, agent: string, against: string, base: number|null, current: number, seq: number,
 *   resolved: boolean, choice: string|null, resolvedSeq?: number, shown?: number }} Conflict
 * @typedef {{ agent: string, path: string, readV: number, currentV: number, writer: string, products: string[], seq: number,
 *   cleared: boolean, clearedSeq?: number, clearedBy?: string }} Stale
 * @typedef {{ from: string, to: string, path: string, v: number, seq: number, via: string }} Handoff
 * @typedef {{ agent: string, tool: string, target: string, error?: string, seq: number, recoveredSeq: number|null, recoveredBy?: string }} ToolFailure
 * @typedef {Record<string, any> & { seq: number, ts: number, type: string }} LedgerEvent
 * @typedef {{ session: string|null, cwd: string|null, task: string|null, events: LedgerEvent[],
 *   musicians: Record<string, Musician>, order: string[], artifacts: Record<string, Artifact>,
 *   conflicts: Conflict[], stale: Stale[], handoffs: Handoff[], toolFailures: ToolFailure[],
 *   rows: Record<string, string>, codaSeq: number|null }} State
 */

/** @type {Record<string, { name: string, role: string }>} */
export const INSTRUMENTS = {
  conductor: { name: 'Conductor', role: 'Plans the score, assigns parts, resolves conflicts' },
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
const NOBODY = new Set(['repo', 'outside'])

/** @returns {State} */
export function emptyState() {
  return {
    session: null,
    cwd: null,
    task: null,
    events: [],
    musicians: { [CONDUCTOR]: newMusician(CONDUCTOR, 'conductor', instrumentDef('conductor').name, 'main loop') },
    order: [CONDUCTOR],
    artifacts: {},
    conflicts: [],
    stale: [],
    handoffs: [],
    toolFailures: [],
    rows: {},
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
    seen: {}, readSeq: {},
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

const latest = (a) => a.versions[a.versions.length - 1]

// The version a hash belongs to. A hash never seen before is a version nobody in the
// ensemble wrote: the file as it was at first sight, or a change made outside.
function versionOf(state, path, hash, seq) {
  const a = ensureArtifact(state, path)
  const known = [...a.versions].reverse().find((x) => x.hash === hash)
  if (known) return known
  const v = { v: a.versions.length, hash, agent: a.versions.length ? 'outside' : 'repo', base: null, added: 0, removed: 0, seq }
  a.versions.push(v)
  return v
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
  'prompt'(state, e) {
    state.task = e.text
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
    if (m.state !== 'waiting') m.state = 'playing'
  },
  'tool.result'(state, e) {
    const m = ensureMusician(state, e.agent)
    m.tool = null
    m.measures += 1
    if (!e.ok && e.sentBack) return
    if (!e.ok) {
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
    const overSomeoneElse = !NOBODY.has(cur.agent) && cur.agent !== e.agent
    const changedSinceSeen = seen !== undefined && seen !== cur.v
    const blind = seen === undefined && overSomeoneElse
    if (!changedSinceSeen && !blind) return
    state.conflicts.push({
      id: `c${state.conflicts.length + 1}`, path: e.path, agent: e.agent, against: cur.agent,
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
    c.resolvedSeq = e.seq
    const m = state.musicians[c.agent]
    if (m && m.state === 'waiting') m.state = 'playing'
  },
  'artifact.write'(state, e) {
    const m = ensureMusician(state, e.agent)
    const a = ensureArtifact(state, e.path)
    const prev = latest(a)
    m.writes += 1
    m.added += e.added
    m.removed += e.removed
    for (const f of state.toolFailures) {
      if (f.agent === e.agent && f.target === e.path && f.recoveredSeq === null) f.recoveredSeq = e.seq
    }
    // Stale work is redone when its product is rewritten by someone who has seen the current input.
    for (const s of state.stale) {
      if (s.cleared || !s.products.includes(e.path)) continue
      if ((m.seen[s.path] ?? -1) >= s.currentV) {
        s.cleared = true
        s.clearedSeq = e.seq
        s.clearedBy = e.agent
      }
    }
    if (prev && prev.hash === e.hash) {
      m.seen[e.path] = prev.v
      return
    }
    const ver = { v: a.versions.length, hash: e.hash, agent: e.agent, base: m.seen[e.path] ?? null, added: e.added, removed: e.removed, seq: e.seq, via: e.via, uncertain: e.uncertain }
    a.versions.push(ver)
    m.seen[e.path] = ver.v
    m.readSeq[e.path] = e.seq
    // Anyone who used an older version of this file to produce something else is now stale.
    for (const key of state.order) {
      const other = state.musicians[key]
      if (!other) continue
      const readV = other.seen[e.path]
      if (key === e.agent || readV === undefined || readV >= ver.v) continue
      const products = productsSince(state, key, other.readSeq[e.path]).filter((p) => p !== e.path)
      if (!products.length) continue
      if (state.stale.some((s) => s.agent === key && s.path === e.path && !s.cleared)) continue
      state.stale.push({ agent: key, path: e.path, readV, currentV: ver.v, writer: e.agent, products, seq: e.seq, cleared: false })
    }
  },
  'part.done'(state, e) {
    const m = ensureMusician(state, e.agent)
    m.state = 'done'
    m.tool = null
    m.answer = e.answer
  },
  'part.failed'(state, e) {
    const m = ensureMusician(state, e.agent)
    m.state = 'failed'
    m.tool = null
    m.answer = e.answer
    m.failure = e.reason
  },
  'coda'(state, e) {
    state.codaSeq = e.seq
  },
}

// Files a musician wrote after a given moment: the work that depends on what it had read then.
function productsSince(state, key, sinceSeq) {
  return Object.values(state.artifacts)
    .filter((a) => a.versions.some((v) => v.agent === key && v.seq > (sinceSeq ?? 0)))
    .map((a) => a.path)
}

export function apply(state, e) {
  const handle = handlers[e.type]
  if (!handle) return state
  state.events.push(e)
  handle(state, e)
  return state
}

export function fold(events) {
  return events.reduce(apply, emptyState())
}

// The roster: the conductor plus every loop it assigned a part to. Other loops (another
// plugin's hook agents, the engine's own forks) stay in the ledger but are not musicians.
export const roster = (state) => state.order.filter((k) => state.musicians[k].assigned)
export const musicians = (state) => roster(state).filter((k) => k !== CONDUCTOR).map((k) => state.musicians[k])
export const isPerformance = (state) => musicians(state).length > 0
export const nameOf = (state, key) => (state.musicians[key] ? state.musicians[key].name : key === 'outside' ? 'someone outside the ensemble' : key)

export function counts(state) {
  const ms = musicians(state)
  const by = (s) => ms.filter((m) => m.state === s).length
  return {
    playing: by('playing'), waiting: by('waiting'), done: by('done'), failed: by('failed'),
    changed: Object.values(state.artifacts).filter((a) => a.versions.some((v) => !NOBODY.has(v.agent))).length,
    openConflicts: state.conflicts.filter((c) => !c.resolved).length,
    openStale: state.stale.filter((s) => !s.cleared).length,
  }
}

export function statusLine(state) {
  const c = counts(state)
  return [
    'Orchestra',
    `${c.playing} playing`,
    c.waiting ? `${c.waiting} waiting` : null,
    `${c.done} done`,
    c.failed ? `${c.failed} failed` : null,
    `${c.changed} artifacts changed`,
    c.openConflicts ? `${c.openConflicts} conflict` : null,
    c.openStale ? `${c.openStale} stale` : null,
  ].filter(Boolean).join(' · ')
}

const rosterFailures = (state) => state.toolFailures.filter((f) => f.agent !== CONDUCTOR && state.musicians[f.agent]?.assigned)

// Every sentence of the coda comes from ledger state, never from a musician's own prose.
export function coda(state) {
  const contributions = roster(state).map((k) => state.musicians[k]).filter((m) => m.writes > 0 || m.reads > 0).map((m) => ({
    key: m.key, name: m.name, role: m.role, reads: m.reads, writes: m.writes, added: m.added, removed: m.removed,
    artifacts: Object.values(state.artifacts).filter((a) => a.versions.some((v) => v.agent === m.key)).map((a) => a.path),
  }))
  const changed = Object.values(state.artifacts)
    .filter((a) => a.versions.some((v) => !NOBODY.has(v.agent)))
    .map((a) => ({ path: a.path, versions: a.versions.filter((v) => !NOBODY.has(v.agent)).length, authors: [...new Set(a.versions.filter((v) => !NOBODY.has(v.agent)).map((v) => nameOf(state, v.agent)))], hash: latest(a).hash }))
  const conflicts = state.conflicts.map((c) => ({
    ...c,
    text: `${nameOf(state, c.agent)} tried to write ${c.path} over ${nameOf(state, c.against)}'s v${c.current} (${c.base === null ? 'never read it' : `had seen v${c.base}`}). ${
      !c.resolved ? 'Still open.' : c.choice === 'overwrite' ? 'You let the write go ahead.' : 'The write was sent back to re-read first.'}`,
  }))
  const failures = [
    ...musicians(state).filter((m) => m.state === 'failed').map((m) => `${m.name}'s part ended with ${m.failure}.`),
    ...rosterFailures(state).map((f) => `${nameOf(state, f.agent)}: ${f.tool} ${f.target} failed${f.recoveredSeq ? `; ${nameOf(state, f.recoveredBy || f.agent)} later ran it successfully` : '; not yet recovered'}.`),
  ]
  const stale = state.stale.map((s) => `${nameOf(state, s.agent)} produced ${s.products.join(', ')} from v${s.readV} of ${s.path}; ${nameOf(state, s.writer)} then wrote v${s.currentV}. ${
    s.cleared ? `Redone from the current version by ${nameOf(state, s.clearedBy)}.` : 'Not redone.'}`)
  const handoffs = state.handoffs.map((h) => `${nameOf(state, h.from)} → ${nameOf(state, h.to)}: ${h.path} v${h.v}${h.via === 'brief' ? ' (named in the brief)' : ''}`)
  return { task: state.task, counts: counts(state), contributions, changed, conflicts, failures, stale, handoffs }
}

export function codaMarkdown(state, sessionFile) {
  const c = coda(state)
  const list = (items) => (items.length ? items.map((x) => `- ${x}`) : ['- none'])
  return [
    '# Orchestra coda',
    '',
    `Task: ${c.task || '(not recorded)'}`,
    `Ledger: ${sessionFile}`,
    `Status: ${statusLine(state)}`,
    '',
    '## Who contributed what',
    ...list(c.contributions.map((x) => `${x.name} (${x.role}): ${x.reads} reads, ${x.writes} writes, +${x.added} −${x.removed}${x.artifacts.length ? `; wrote ${x.artifacts.join(', ')}` : ''}`)),
    '',
    '## Artifacts changed',
    ...list(c.changed.map((a) => `${a.path}: ${a.versions} new version(s) by ${a.authors.join(', ')}; now sha256:${a.hash}`)),
    '',
    '## Handoffs',
    ...list(c.handoffs),
    '',
    '## Conflicts',
    ...list(c.conflicts.map((x) => x.text)),
    '',
    '## Failures',
    ...list(c.failures),
    '',
    '## Stale reads',
    ...list(c.stale),
    '',
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
