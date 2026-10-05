// What Orchestra draws. Every function takes the element constructors the mod resolved
// for the surface, the folded ledger state, and the pane's own view state.

import { CONDUCTOR, artifactStatus, coda, counts, musicians, nameOf, roster } from './ledger.js'
import { paint } from './palette.js'

export const GLYPH = { resting: '·', playing: '♪', waiting: '‖', done: '✓', failed: '✕' }
export const TABS = [['ensemble', 'Ensemble'], ['score', 'Score'], ['artifacts', 'Artifacts'], ['coda', 'Coda']]
const STATE_TOKEN = { playing: 'ok', waiting: 'warn', done: null, failed: 'danger', resting: null }
const SCORE_NAME_COLUMNS = 11
const READS_SHOWN = 8
const HELD_LINES = 14

export const short = (text, n) => {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

const line = (el, parts) => el.Text({ wrap: 'truncate-end', children: parts })
const dim = (el, text) => el.Text({ dimColor: true, children: [text] })
const tone = (el, token, text, bold = false) => el.Text({ color: paint(token), bold, children: [text] })
const who = (el, m) => tone(el, m.color, m.name, true)
const glyphOf = (el, m) => (STATE_TOKEN[m.state] ? tone(el, STATE_TOKEN[m.state], GLYPH[m.state]) : el.Text({ children: [GLYPH[m.state]] }))

export function band(el, state, width) {
  const chunks = musicians(state).map((m) => el.Text({
    key: m.key,
    children: [who(el, m), ' ', glyphOf(el, m), ` ${m.measures}${m.tool ? ` ${m.tool.tool}` : ''}`],
  }))
  const c = counts(state)
  const alerts = [
    c.openConflicts ? tone(el, 'danger', `‼ ${c.openConflicts} conflict`, true) : null,
    c.openStale ? tone(el, 'warn', `⚠ ${c.openStale} stale`) : null,
  ].filter(Boolean)
  return el.Box({
    flexDirection: 'row', flexWrap: 'wrap', columnGap: 3, width,
    children: [dim(el, '𝄐 Orchestra'), ...chunks, ...alerts],
  })
}

export function pane(el, state, view, width) {
  const tabs = el.Box({
    flexDirection: 'row', columnGap: 3,
    children: TABS.map(([id, label], i) => el.Button({
      key: `tab-${id}`, label, hotkey: String(i + 1), plain: true, dimColor: view.tab !== id,
      onPress: () => view.setTab(id),
    })),
  })
  const render = { ensemble, score, artifacts, coda: codaTab }[view.tab]
  return el.Box({ flexDirection: 'column', width, children: [tabs, el.Text({ children: [' '] }), ...render(el, state, view, width)] })
}

const detailsButton = (el, view, type, id) => el.Button({
  key: `pick-${type}-${id}`, plain: true,
  label: view.selected?.type === type && view.selected?.id === id ? '▾ details' : '▸ details',
  onPress: () => view.select(type, id),
})

function ensemble(el, state, view, width) {
  const c = counts(state)
  const rows = roster(state).map((key) => {
    const m = state.musicians[key]
    const activity = m.tool ? `${m.tool.tool} ${m.tool.target}` : m.part || (key === CONDUCTOR ? 'Coordinating the ensemble' : m.role)
    const stale = state.stale.some((s) => s.agent === key && !s.cleared)
    const open = view.selected?.type === 'musician' && view.selected.id === key
    return el.Box({
      key: `seat-${key}`, flexDirection: 'column', marginBottom: 1,
      children: [
        el.Box({ flexDirection: 'row', columnGap: 1, children: [
          who(el, m), dim(el, `${m.role} ·`), glyphOf(el, m), dim(el, m.state), detailsButton(el, view, 'musician', key),
        ] }),
        line(el, [dim(el, `  ${short(activity, width - 3)}`)]),
        key === CONDUCTOR ? null : line(el, [`  ${m.measures} measures · ${m.reads} reads · ${m.writes} writes`, stale ? tone(el, 'warn', '   ⚠ stale read') : '']),
        ...(open ? musicianDetail(el, state, key, width) : []),
      ].filter(Boolean),
    })
  })
  return [line(el, [`${c.playing} playing in parallel · ${c.done} done`]), el.Text({ children: [' '] }), ...rows]
}

function musicianDetail(el, state, key, width) {
  const m = state.musicians[key]
  const seen = Object.entries(m.seen).map(([p, v]) => {
    const now = state.artifacts[p].versions.length - 1
    return line(el, [`    ${short(p, width - 18)} v${v}`, v < now ? tone(el, 'warn', ` (now v${now})`) : ''])
  })
  return [
    dim(el, `    ${m.name} · ${m.type}`),
    m.prompt ? el.Text({ wrap: 'wrap', dimColor: true, children: [`    Part: ${short(m.prompt, 300)}`] }) : null,
    el.Text({ children: ['    Versions it has seen:'] }),
    ...(seen.length ? seen : [dim(el, '      none yet')]),
    m.answer ? el.Text({ wrap: 'wrap', dimColor: true, children: [`    Answer: ${short(m.answer, 400)}`] }) : null,
  ].filter(Boolean)
}

// One staff per musician, the newest events on the right; glyphs coloured by meaning.
function score(el, state, view, width) {
  const cols = Math.max(10, width - SCORE_NAME_COLUMNS - 1)
  const events = state.events.slice(-cols)
  const conflictSeqs = new Set(state.conflicts.map((c) => c.seq))
  const staleSeqs = new Set(state.stale.map((s) => `${s.seq}:${s.agent}`))
  const handoffIn = new Set(state.handoffs.map((h) => `${h.seq}:${h.to}`))
  const glyph = (e, key, color) => {
    if (staleSeqs.has(`${e.seq}:${key}`)) return ['⚠', 'warn']
    if (e.agent === key) {
      if (e.type === 'write.attempt' && conflictSeqs.has(e.seq)) return ['‼', 'danger']
      if (e.type === 'artifact.read') return [handoffIn.has(`${e.seq}:${key}`) ? '←' : '○', color]
      if (e.type === 'part.assigned' && handoffIn.has(`${e.seq}:${key}`)) return ['←', color]
      const g = { 'tool.call': ['·', color], 'artifact.write': ['●', color], 'part.assigned': ['◆', color], 'part.done': ['✓', 'ok'], 'part.failed': ['✕', 'danger'] }[e.type]
      if (g) return g
      if (e.type === 'tool.result' && !e.ok && !e.sentBack) return ['✕', 'danger']
      return [' ', null]
    }
    if (key === CONDUCTOR) {
      if (e.type === 'part.assigned') return ['◆', color]
      if (e.type === 'conflict.resolved') return ['?', 'warn']
      if (e.type === 'coda') return ['𝄐', color]
    }
    return [' ', null]
  }
  const staff = (key, color) => {
    const runs = []
    for (const e of events) {
      const [g, token] = glyph(e, key, color)
      const last = runs[runs.length - 1]
      if (last && last.token === token) last.text += g
      else runs.push({ token, text: g })
    }
    return runs.map((r, i) => (r.token ? el.Text({ key: `r${i}`, color: paint(r.token), children: [r.text] }) : el.Text({ key: `r${i}`, children: [r.text] })))
  }
  const lanes = roster(state).map((key) => {
    const m = state.musicians[key]
    return el.Box({ key: `lane-${key}`, flexDirection: 'row', children: [
      el.Box({ width: SCORE_NAME_COLUMNS, children: [el.Text({ color: paint(m.color), wrap: 'truncate-end', children: [m.name] })] }),
      el.Text({ wrap: 'truncate-end', children: staff(key, m.color) }),
    ] })
  })
  const first = events.length ? events[0].seq : 0
  const lastSeq = events.length ? events[events.length - 1].seq : 0
  return [
    dim(el, `Events ${first}–${lastSeq} of the ledger, newest on the right`),
    ...lanes,
    el.Text({ children: [' '] }),
    el.Text({ dimColor: true, wrap: 'wrap', children: ['○ read  ← used another\'s work  ● write  · tool  ◆ assigned  ✓ done  ✕ failed  ‼ conflict  ⚠ stale  ? you decided'] }),
  ]
}

const lastSeq = (a) => Math.max(0, ...a.versions.map((v) => v.seq), ...a.reads.map((r) => r.seq))

function artifacts(el, state, view, width) {
  const list = Object.values(state.artifacts).sort((a, b) => lastSeq(b) - lastSeq(a))
  if (!list.length) return [dim(el, 'No artifacts touched yet.')]
  return list.map((a) => {
    const status = artifactStatus(state, a.path)
    const authors = a.versions.filter((v) => v.agent !== 'repo').map((v) => nameOf(state, v.agent))
    const open = view.selected?.type === 'artifact' && view.selected.id === a.path
    return el.Box({ key: `art-${a.path}`, flexDirection: 'column', marginBottom: 1, children: [
      el.Box({ flexDirection: 'row', columnGap: 1, children: [
        el.Text({ wrap: 'truncate-end', children: [short(a.path, width - 26)] }),
        status === 'conflict' ? tone(el, 'danger', 'conflict', true) : status === 'stale' ? tone(el, 'warn', 'stale') : dim(el, `v${a.versions.length - 1}`),
        detailsButton(el, view, 'artifact', a.path),
      ] }),
      line(el, [dim(el, authors.length ? `  written by ${authors.join(' → ')} · ${a.reads.length} reads` : `  read only · ${a.reads.length} reads`)]),
      ...(open ? artifactDetail(el, state, view, a.path, width) : []),
    ] })
  })
}

function artifactDetail(el, state, view, path, width) {
  const a = state.artifacts[path]
  const versions = a.versions.map((v) => line(el, [
    `    v${v.v} ${v.agent === 'repo' ? 'as first seen' : `by ${nameOf(state, v.agent)}`}`,
    v.base !== null && v.base !== undefined ? ` from v${v.base}` : '',
    v.agent === 'repo' || v.agent === 'outside' ? '' : ` +${v.added} −${v.removed}`,
    v.via === 'bash' ? dim(el, v.uncertain ? ' via Bash, attribution uncertain' : ' via Bash') : '',
    dim(el, `  sha256:${v.hash.slice(0, 12)}`),
    v.base !== null && v.base !== undefined && v.base < v.v - 1 ? tone(el, 'danger', ` skipped v${v.v - 1}`) : '',
  ]))
  const reads = a.reads.slice(-READS_SHOWN).map((r) => dim(el, `    ${nameOf(state, r.agent)} read v${r.v} at event ${r.seq}`))
  const conflicts = state.conflicts.filter((c) => c.path === path).map((c) => line(el, [
    c.resolved ? tone(el, 'ok', '    ✓ ') : tone(el, 'danger', '    ‼ '),
    `${nameOf(state, c.agent)} wrote from v${c.base ?? '-'} over ${nameOf(state, c.against)}'s v${c.current}${c.resolved ? ` · ${c.choice}` : ' · open'}`,
  ]))
  const held = view.held && view.held.path === path ? [el.Text({ children: [' '] }), ...heldWrite(el, view.held, width)] : []
  return [
    el.Text({ children: ['    Versions:'] }), ...versions,
    el.Text({ children: ['    Reads:'] }), ...(reads.length ? reads : [dim(el, '      none')]),
    ...(conflicts.length ? [el.Text({ children: ['    Conflicts:'] }), ...conflicts] : []),
    ...held,
  ]
}

// Shown while a write is held: the file as it is now, beside what the writer is about to do.
// `lines` caps each side; above the question dialog Claude Code allows at most 12 rows.
export function heldWrite(el, held, width, lines = HELD_LINES) {
  const clip = (items) => items.filter((l) => l.trim()).slice(0, lines).map((l) => short(l, width - 8))
  const sinceSeen = held.changed !== null
  const theirs = sinceSeen ? held.changed : String(held.currentText ?? '').split('\n')
  const seen = held.base === null ? `${held.writer} never read it` : `${held.writer} saw v${held.base}`
  return [
    tone(el, 'warn', `Held write by ${held.writer} (${held.tool}) on ${short(held.path, width - 30)}`, true),
    dim(el, sinceSeen ? `Added by ${held.against} since ${seen} (now v${held.current}):` : `Now v${held.current} by ${held.against}:`),
    ...clip(theirs.length ? theirs : ['(no lines added; lines were only removed)']).map((l, i) => el.Text({ key: `cur${i}`, children: [`  ${sinceSeen ? '+ ' : ''}${l}`] })),
    dim(el, `${held.writer} wants to ${held.tool === 'Write' ? 'write' : 'replace'}:`),
    ...clip(String(held.proposed ?? '').split('\n')).map((l, i) => el.Text({ key: `new${i}`, color: paint('warn'), children: [`  ${l}`] })),
  ]
}

function codaTab(el, state, view, width) {
  const c = coda(state)
  const section = (title, items) => [
    el.Text({ bold: true, children: [title] }),
    ...(items.length ? items.map((t, i) => el.Text({ key: `${title}${i}`, wrap: 'wrap', children: [`  ${t}`] })) : [dim(el, '  none')]),
  ]
  return [
    el.Text({ wrap: 'wrap', children: [`Task: ${short(c.task || 'not recorded', width * 3)}`] }),
    dim(el, view.codaPath ? `Written to ${view.codaPath}` : 'The coda file is written when the conductor\'s turn ends.'),
    el.Text({ children: [' '] }),
    ...section('Who contributed what', c.contributions.map((x) => `${x.name}: ${x.reads} reads, ${x.writes} writes, +${x.added} −${x.removed}`)),
    ...section('Artifacts changed', c.changed.map((a) => `${a.path} · ${a.versions} new · ${a.authors.join(', ')}`)),
    ...section('Handoffs', c.handoffs),
    ...section('Conflicts', c.conflicts.map((x) => x.text)),
    ...section('Failures', c.failures),
    ...section('Stale reads', c.stale),
  ]
}
