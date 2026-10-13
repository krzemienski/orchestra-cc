// What Orchestra draws. Every function takes the element constructors the mod resolved
// for the surface, the folded ledger state, and the pane's own view state.

import { CONDUCTOR, artifactStatus, authorOf, coda, codaSections, counts, currentCall, elapsed, failureLine, hashLabel, lastCalls, liveHandoff, musicians, nameOf, partMs, plural, rollup, roster, standing, statusLine } from './ledger.js'
import { ground, paint } from './palette.js'

export const GLYPH = { resting: '·', playing: '♪', waiting: '‖', done: '✓', failed: '✕' }
export const TABS = [['ensemble', 'Ensemble'], ['score', 'Score'], ['artifacts', 'Artifacts'], ['coda', 'Coda']]
const STATE_TOKEN = { playing: 'ok', waiting: 'warn', done: null, failed: 'danger', resting: null }
const SCORE_NAME_COLUMNS = 11
const READS_SHOWN = 8
const HELD_LINES = 14
const BAR_EVENTS = 8
const CALLS_SHOWN = 5
const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
// What a state is called where a row names it.
const STATE_WORD = { resting: 'resting', playing: 'playing', waiting: 'waiting on you', done: 'done', failed: 'failed' }

export const short = (text, n) => {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim()
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

const line = (el, parts) => el.Text({ wrap: 'truncate-end', children: parts })
// Blank rows, remembered so the pane's window can drop the ones that would end a tab.
const blanks = new WeakSet()
const blank = (el) => {
  const row = el.Text({ children: [' '] })
  blanks.add(row)
  return row
}
const dim = (el, text) => el.Text({ dimColor: true, children: [text] })
const tone = (el, token, text, bold = false) => el.Text({ color: paint(token), bold, children: [text] })
const who = (el, m) => tone(el, m.color, m.name, true)

// Word-wraps text into lines of at most `cols` characters, splitting a longer word.
function wrapLines(text, cols) {
  const lines = []
  let cur = ''
  for (const word of String(text ?? '').split(/\s+/).filter(Boolean)) {
    if (cur && cur.length + 1 + word.length <= cols) {
      cur += ` ${word}`
      continue
    }
    if (cur) lines.push(cur)
    cur = word
    while (cur.length > cols) {
      lines.push(cur.slice(0, cols))
      cur = cur.slice(cols)
    }
  }
  return cur || !lines.length ? [...lines, cur] : lines
}

// A paragraph as one Text per row, every row indented, so wrapped lines keep the indent; `hang`
// indents the rows after the first a little more, so a wrapped item does not read as a new one.
const para = (el, text, indent, width, props = {}, hang = '') => wrapLines(text, Math.max(10, width - indent.length - hang.length))
  .map((l, i) => el.Text({ ...props, wrap: 'truncate-end', children: [`${indent}${i ? hang : ''}${l}`] }))

// Short items laid out on rows of at most `cols` characters, never split inside an item.
const wrapItems = (items, cols) => items.reduce((rows, item) => {
  const last = rows[rows.length - 1]
  if (last && last.length + 2 + item.length <= cols) rows[rows.length - 1] = `${last}  ${item}`
  else rows.push(item)
  return rows
}, /** @type {string[]} */ ([]))

const LEGEND = ['─ rest', '┊ bar line', '○ read', '← used another\'s work', '● write', '· tool', '◆ assigned', '✓ done', '✕ failed', '‼ conflict', '⚠ stale', '? you decided']

// What a musician is doing, as every row draws it: its state's glyph, the tool or word in the
// second column, the free text, and the time. Elapsed times run to `now`, the time of the newest
// recorded event, so they move only when an event arrives.
export function doing(state, m, now) {
  const st = standing(state, m)
  const base = { state: st, glyph: GLYPH[st], token: STATE_TOKEN[st] }
  if (st === 'done') {
    const ms = partMs(state, m.key)
    return { ...base, word: 'done', text: `${plural(m.measures, 'measure')} · ${plural(m.reads, 'read')} · ${plural(m.writes, 'write')}`, time: ms === null ? '' : elapsed(ms) }
  }
  if (st === 'failed') return { ...base, word: 'failed', text: failureLine(state, m), time: '' }
  if (st === 'waiting') {
    const c = state.conflicts.findLast((x) => x.agent === m.key && !x.resolved)
    const by = c ? authorOf(state, state.artifacts[c.path]?.versions[c.current]) : ''
    return { ...base, word: 'held', text: c ? `${c.path}: ${by} wrote v${c.current} ${c.base === null ? 'and you never read it' : `since you read v${c.base}`}` : 'waiting on you', time: '' }
  }
  const call = m.finished ? null : currentCall(state, m.key)
  if (call) {
    const seen = m.seen[call.target]
    const from = WRITE_TOOLS.has(call.tool) && seen !== undefined ? ` from v${seen}` : ''
    return { ...base, word: call.tool, text: `${call.target}${from}`, time: now ? elapsed(Math.max(0, now - call.ts)) : '' }
  }
  return { ...base, word: '', text: m.part || (m.key === CONDUCTOR ? 'Coordinating the ensemble' : m.role), time: '' }
}

// `doing` as one line: `Edit config/limits.json from v0 · 12s`, `done · 4 measures · … · 41s`,
// `failed · <first error line>`.
export const doingText = (d) => {
  const what = d.state === 'done' || d.state === 'failed' ? `${d.word} · ${d.text}` : [d.word, d.text].filter(Boolean).join(' ')
  return `${what}${d.time ? ` · ${d.time}` : ''}`
}

// The Agent row's two lines for a musician: who and in what role, then what it is doing.
export function agentRows(state, m, now) {
  const d = doing(state, m, now)
  return { title: `${m.name} · ${m.role}`, detail: `└ ${d.glyph} ${doingText(d)}`, token: d.token }
}

function glyphOf(el, m, st) {
  const g = GLYPH[st]
  return STATE_TOKEN[st] ? tone(el, STATE_TOKEN[st], g) : el.Text({ children: [g] })
}

const rollupText = (el, state) => rollup(state).flatMap((x, i) => [i ? dim(el, ' · ') : '', x.token ? tone(el, x.token, x.text, x.bold) : el.Text({ children: [x.text] })])

// Band and Ensemble rows keep the glyph, the name and the time where they are; only the free text
// gives way, cut with `…`.
const WORD_COLUMNS = 6
function row(el, key, width, nameCols, m, d) {
  return el.Box({ key, flexDirection: 'row', width, children: [
    el.Box({ flexShrink: 0, width: 2, children: [glyphOf(el, m, d.state)] }),
    el.Box({ flexShrink: 0, width: nameCols + 2, children: [who(el, m)] }),
    el.Box({ flexShrink: 0, width: WORD_COLUMNS + 1, children: [d.token ? tone(el, d.token, d.word) : el.Text({ children: [d.word] })] }),
    el.Box({ flexShrink: 1, children: [el.Text({ wrap: 'truncate-end', dimColor: d.state === 'resting', children: [d.text] })] }),
    d.time ? el.Box({ flexShrink: 0, children: [dim(el, ` · ${d.time}`)] }) : '',
  ].filter(Boolean) })
}

// The band: the rollup, then one row per musician not yet done, in the order parts were assigned.
// Rows past `maxRows` fold into one `… N more · /orchestra` row, so the band never scrolls.
export function band(el, state, width, now, maxRows = Infinity) {
  const live = musicians(state).filter((m) => standing(state, m) !== 'done')
  const title = [tone(el, 'conductor', '𝄐 Orchestra', true), '  ', ...rollupText(el, state)]
  // With one row (a small terminal while Claude Code lists its agents) the fold joins line 1, so the
  // rollup is still what shows.
  if (maxRows < 2) return el.Box({ flexDirection: 'column', width, children: [line(el, [...title, live.length ? dim(el, ` · … ${live.length} more · /orchestra`) : ''])] })
  const room = maxRows - 1
  const shown = live.length > room ? live.slice(0, Math.max(0, room - 1)) : live
  const nameCols = Math.max(0, ...shown.map((m) => m.name.length))
  return el.Box({ flexDirection: 'column', width, children: [
    line(el, title),
    ...shown.map((m) => row(el, `band-${m.key}`, width, nameCols, m, doing(state, m, now))),
    ...(shown.length < live.length ? [dim(el, `  … ${live.length - shown.length} more · /orchestra`)] : []),
  ] })
}

// The pane's last row: the keys the focused tab answers to.
const KEY_HINTS = {
  ensemble: '1-4 tabs · tab select · enter details · ↑↓ scroll · esc close',
  score: '1-4 tabs · ↑↓ scroll · esc close',
  artifacts: '1-4 tabs · tab select · enter details · ↑↓ scroll · esc close',
  coda: '1-4 tabs · ↑↓ scroll · esc close',
}
// While the tab scrolls, where the window is goes first on the same row, so a pane only a few rows
// tall (inline in a short terminal) still shows its keys.
export const keyHints = (el, tab, where = '') => dim(el, `${where ? `${where} · ` : ''}${KEY_HINTS[tab] ?? KEY_HINTS.ensemble}`)

// The line logged when the conductor's turn ends: the same counts as the coda file.
export function outcomeLine(state, ms) {
  const c = coda(state)
  return [
    '𝄐 Coda',
    plural(musicians(state).length, 'musician'),
    plural(c.changed.length, 'file'),
    plural(c.conflicts.length, 'conflict'),
    `${c.counts.failed} failed`,
    elapsed(ms),
    '/orchestra coda',
  ].join(' · ')
}

// The tab bar and the blank under it; the key hints take the last row.
const HEADER_ROWS = 2
const FOOTER_ROWS = 1

export function pane(el, state, view, width, bodyRows) {
  const render = { ensemble, score, artifacts, coda: codaTab }[view.tab]
  const body = render(el, state, view, width)
  // The body sits on the ground its colours were measured on, not on Claude Code's grey pane fill.
  const { rows, where } = paneWindow(el, view, body, bodyRows)
  // While the tab scrolls, the tree's last row is the hidden one (see paneWindow), so the key hints
  // go just above it and stay the last row shown.
  const hidden = view.maxOffset ? [blank(el)] : []
  return el.Box({ flexDirection: 'column', width, backgroundColor: ground(), children: [tabBar(el, view), blank(el), ...rows, keyHints(el, view.tab, where), ...hidden] })
}

const tabBar = (el, view) => el.Box({
  flexDirection: 'row', columnGap: 2,
  children: TABS.map(([id, label], i) => el.Box({ flexDirection: 'row', children: [
    view.tab === id ? tone(el, 'conductor', '▸', true) : el.Text({ children: [' '] }),
    el.Button({ key: `tab-${id}`, label, hotkey: String(i + 1), plain: true, dimColor: view.tab !== id, onPress: () => view.setTab(id) }),
  ] })),
})

// The pane draws its own window under the tab bar, so the tabs never scroll away; every
// row of a tab is one element, so a slice of them is exactly the rows shown. The tree is
// one row taller than the window (pane() adds that row last): the engine raises `ui.scroll`
// for the arrows only while it has a row to scroll, and the pane's hook keeps it from moving,
// so that row never shows.
// Without `bodyRows` the whole tab is drawn and the engine scrolls it.
function paneWindow(el, view, rows, bodyRows) {
  let end = rows.length
  while (end > 1 && blanks.has(rows[end - 1])) end -= 1
  const body = rows.slice(0, end)
  if (view.windowTab !== view.tab) Object.assign(view, { windowTab: view.tab, offset: 0 })
  // Where the window is gets its own row, unless the pane is too short for that and a row of the
  // tab (inline in a short terminal): then it goes on the key-hint row.
  const tight = Boolean(bodyRows) && bodyRows - HEADER_ROWS - FOOTER_ROWS < 3
  const shown = Math.max(1, (bodyRows || 0) - HEADER_ROWS - FOOTER_ROWS - (tight ? 0 : 1))
  view.maxOffset = bodyRows && body.length > shown + 1 ? body.length - shown : 0
  view.page = shown
  view.offset = Math.min(view.offset || 0, view.maxOffset)
  if (!view.maxOffset) return { rows: body, where: '' }
  const below = body.length - view.offset - shown
  const where = [view.offset ? `↑ ${view.offset} more above` : null, below ? `↓ ${below} more below` : 'end'].filter(Boolean).join(' · ')
  const visible = body.slice(view.offset, view.offset + shown)
  return tight ? { rows: visible, where } : { rows: [...visible, dim(el, where)], where: '' }
}

// Moves the pane's window for a `ui.scroll` hook on the pane. The engine sizes Home and End
// (`contentRows`) and the page keys (`bodyRows`) by the tree it was given, not by the tab.
/** @param {{ by: number, bodyRows: number, contentRows: number }} e the `ui.scroll` input */
export function scrollPane(view, e) {
  if (!e.by) return false
  const rows = Math.abs(e.by) >= e.contentRows ? Infinity : Math.abs(e.by) === e.bodyRows ? view.page : Math.abs(e.by)
  const next = Math.min(Math.max(0, (view.offset || 0) + Math.sign(e.by) * rows), view.maxOffset || 0)
  if (next === (view.offset || 0)) return false
  view.offset = next
  return true
}

const detailsButton = (el, view, type, id) => el.Button({
  key: `pick-${type}-${id}`, plain: true,
  label: view.selected?.type === type && view.selected?.id === id ? '▾ details' : '▸ details',
  onPress: () => view.select(type, id),
})

// The Ensemble tab: the rollup, the newest handoff, then every musician, conductor first, as a
// two-line row with its counts; Enter on a name opens its details.
function ensemble(el, state, view, width) {
  return [line(el, rollupText(el, state)), ...handoffLine(el, state, width), blank(el), ...roster(state).flatMap((key) => seat(el, state, view, key, width))]
}

// The newest handoff, from the musician who wrote the version to the one who took it.
function handoffLine(el, state, width) {
  const h = liveHandoff(state)
  if (!h) return []
  const from = state.musicians[h.from]
  const to = state.musicians[h.to]
  return [line(el, [
    from ? tone(el, from.color, from.name, true) : dim(el, nameOf(state, h.from)),
    dim(el, ' → '),
    to ? tone(el, to.color, to.name, true) : el.Text({ children: [nameOf(state, h.to)] }),
    dim(el, ` · ${short(`${h.path} v${h.v}`, Math.max(8, width - 30))}`),
  ])]
}

function seat(el, state, view, key, width) {
  const m = state.musicians[key]
  const d = doing(state, m, view.now)
  const stale = state.stale.some((s) => s.agent === key && !s.cleared)
  const open = view.selected?.type === 'musician' && view.selected.id === key
  const done = d.state === 'done' || d.state === 'failed'
  const what = done ? `${d.word} · ${d.text}` : [d.word, d.text].filter(Boolean).join(' ')
  return [
    // Glyph, name and state keep their width; only the role gives way.
    el.Box({ key: `seat-${key}`, flexDirection: 'row', columnGap: 1, width, children: [
      el.Box({ flexShrink: 0, children: [glyphOf(el, m, d.state)] }),
      el.Box({ flexShrink: 0, children: [el.Button({ key: `pick-musician-${key}`, plain: true, onPress: () => view.select('musician', key), children: [who(el, m)] })] }),
      el.Box({ flexShrink: 1, children: [el.Text({ dimColor: true, wrap: 'truncate-end', children: [` ${m.role}`] })] }),
      el.Box({ flexShrink: 0, children: [d.token ? tone(el, d.token, `· ${STATE_WORD[d.state]}`) : dim(el, `· ${STATE_WORD[d.state]}`)] }),
    ] }),
    el.Box({ key: `seat-doing-${key}`, flexDirection: 'row', width, children: [
      el.Box({ flexShrink: 1, children: [el.Text({ wrap: 'truncate-end', dimColor: true, children: [`  └ ${what}`] })] }),
      d.time ? el.Box({ flexShrink: 0, children: [dim(el, ` · ${d.time}`)] }) : '',
    ].filter(Boolean) }),
    key === CONDUCTOR || d.state === 'done' ? null : line(el, [`  ${plural(m.measures, 'measure')} · ${plural(m.reads, 'read')} · ${plural(m.writes, 'write')}`, stale ? tone(el, 'warn', '   ⚠ stale read') : '']),
    key !== CONDUCTOR && d.state === 'done' && stale ? line(el, [tone(el, 'warn', '  ⚠ stale read')]) : null,
    ...(open ? musicianDetail(el, state, key, width) : []),
    blank(el),
  ].filter(Boolean)
}

// A musician's details: its part, every version it has seen, its reads and writes with versions,
// its last calls with their times, its answer, and where its full transcript is.
function musicianDetail(el, state, key, width) {
  const m = state.musicians[key]
  const seen = Object.entries(m.seen).map(([p, v]) => {
    const now = state.artifacts[p].versions.length - 1
    return line(el, [`      ${short(p, width - 20)} v${v}`, v < now ? tone(el, 'warn', ` (now v${now})`) : ''])
  })
  const touched = Object.values(state.artifacts).flatMap((a) => [
    ...a.reads.filter((r) => r.agent === key).map((r) => ({ seq: r.seq, text: `read ${a.path} v${r.v}` })),
    ...a.versions.filter((v) => v.agent === key).map((v) => ({ seq: v.seq, text: `wrote ${a.path} v${v.v}${v.base !== null && v.base !== undefined ? ` from v${v.base}` : ''}` })),
  ]).sort((x, y) => x.seq - y.seq).map((x) => dim(el, `      ${short(x.text, width - 8)}`))
  const calls = lastCalls(state, key, CALLS_SHOWN).map((c) => line(el, [
    `      ${short(`${c.tool}${c.target ? ` ${c.target}` : ''}`, width - 26)}`,
    c.ok === null ? dim(el, ' · running') : c.ok ? dim(el, ` · ${elapsed(c.ms ?? 0)} ✓`) : tone(el, 'danger', ` · ${elapsed(c.ms ?? 0)} ✕`),
  ]))
  return [
    ...para(el, `Part: ${short(m.prompt || m.part || '(none recorded)', 300)}`, '    ', width, { dimColor: true }),
    el.Text({ children: ['    Versions seen:'] }),
    ...(seen.length ? seen : [dim(el, '      none yet')]),
    el.Text({ children: ['    Reads and writes:'] }),
    ...(touched.length ? touched : [dim(el, '      none yet')]),
    el.Text({ children: ['    Last calls:'] }),
    ...(calls.length ? calls : [dim(el, '      none yet')]),
    ...(m.answer ? para(el, `Answer: ${short(m.answer, 400)}`, '    ', width, { dimColor: true }) : []),
    dim(el, "    full transcript: ← in Claude Code's agent view"),
  ]
}

// One staff per musician, the newest events on the right; glyphs coloured by meaning.
function score(el, state, view, width) {
  const cols = Math.max(10, width - SCORE_NAME_COLUMNS - 2)
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
      return rest(e)
    }
    if (key === CONDUCTOR) {
      if (e.type === 'part.assigned') return ['◆', color]
      if (e.type === 'conflict.resolved') return ['?', 'warn']
      if (e.type === 'coda') return ['𝄐', color]
    }
    return rest(e)
  }
  // An event that is not this musician's is a rest on its staff line, with a bar line every
  // BAR_EVENTS events of the ledger, so the lanes read as staves of measures.
  const rest = (e) => [e.seq % BAR_EVENTS === 0 ? '┊' : '─', 'staff']
  const staff = (key, color) => {
    const runs = []
    for (const e of events) {
      const [g, token] = glyph(e, key, color)
      const last = runs[runs.length - 1]
      if (last && last.token === token) last.text += g
      else runs.push({ token, text: g })
    }
    return runs.map((r, i) => (r.token === 'staff' ? el.Text({ key: `r${i}`, dimColor: true, children: [r.text] })
      : r.token ? el.Text({ key: `r${i}`, color: paint(r.token), children: [r.text] }) : el.Text({ key: `r${i}`, children: [r.text] })))
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
    blank(el),
    ...wrapItems(LEGEND, Math.max(10, width)).map((l) => dim(el, l)),
  ]
}

const lastSeq = (a) => Math.max(0, ...a.versions.map((v) => v.seq), ...a.reads.map((r) => r.seq))

function artifacts(el, state, view, width) {
  const list = Object.values(state.artifacts).sort((a, b) => lastSeq(b) - lastSeq(a))
  if (!list.length) return [dim(el, 'No artifacts touched yet.')]
  return list.flatMap((a) => {
    const status = artifactStatus(state, a.path)
    const authors = a.versions.filter((v) => v.agent !== 'repo').map((v) => nameOf(state, v.agent))
    const open = view.selected?.type === 'artifact' && view.selected.id === a.path
    return [
      el.Box({ key: `art-${a.path}`, flexDirection: 'row', columnGap: 1, children: [
        el.Text({ wrap: 'truncate-end', children: [short(a.path, width - 26)] }),
        status === 'conflict' ? tone(el, 'danger', 'conflict', true) : status === 'stale' ? tone(el, 'warn', 'stale') : dim(el, `v${a.versions.length - 1}`),
        detailsButton(el, view, 'artifact', a.path),
      ] }),
      line(el, [dim(el, authors.length ? `  written by ${authors.join(' → ')} · ${plural(a.reads.length, 'read')}` : `  read only · ${plural(a.reads.length, 'read')}`)]),
      ...(open ? artifactDetail(el, state, view, a.path, width) : []),
      blank(el),
    ]
  })
}

function artifactDetail(el, state, view, path, width) {
  const a = state.artifacts[path]
  const versions = a.versions.map((v) => line(el, [
    `    v${v.v} ${v.agent === 'repo' ? 'as first seen' : `by ${nameOf(state, v.agent)}`}`,
    v.base !== null && v.base !== undefined ? ` from v${v.base}` : '',
    v.agent === 'repo' || v.agent === 'outside' ? '' : v.unchecked || v.added === undefined ? ' lines unknown' : ` +${v.added} −${v.removed}`,
    v.via === 'bash' ? dim(el, v.uncertain ? ' via Bash, attribution uncertain' : ' via Bash') : '',
    dim(el, `  ${hashLabel(v.hash)}`),
    v.base !== null && v.base !== undefined && v.base < v.v - 1 ? tone(el, 'danger', ` skipped v${v.v - 1}`) : '',
  ]))
  const reads = a.reads.slice(-READS_SHOWN).map((r) => dim(el, `    ${nameOf(state, r.agent)} read v${r.v} at event ${r.seq}`))
  const conflicts = state.conflicts.filter((c) => c.path === path).map((c) => line(el, [
    c.resolved ? tone(el, 'ok', '    ✓ ') : tone(el, 'danger', '    ‼ '),
    `${nameOf(state, c.agent)} wrote from v${c.base ?? '-'} over ${nameOf(state, c.against)}'s v${c.current}${c.resolved ? ` · ${c.choice}` : ' · open'}`,
  ]))
  const held = view.held && view.held.path === path ? [blank(el), ...heldWrite(el, view.held, width)] : []
  return [
    el.Text({ children: ['    Versions:'] }), ...versions,
    el.Text({ children: ['    Reads:'] }), ...(reads.length ? reads : [dim(el, '      none')]),
    ...(conflicts.length ? [el.Text({ children: ['    Conflicts:'] }), ...conflicts] : []),
    ...held,
  ]
}

// Shown while a write is held: the file as it is now, beside what the writer is about to do.
// `lines` caps each side; above the question dialog Claude Code allows at most 12 rows.
// Every row is cut to one line, so the rows drawn are exactly the rows counted.
export function heldWrite(el, held, width, lines = HELD_LINES) {
  const clip = (items) => items.filter((l) => l.trim()).slice(0, lines)
  // Cut to one row, keeping the indentation the file's own lines have.
  const cut = (text, n) => {
    const t = String(text).replace(/\t/g, '  ')
    return t.length > n ? `${t.slice(0, Math.max(1, n - 1))}…` : t
  }
  const row = (key, text, props = {}) => el.Text({ key, ...props, wrap: 'truncate-end', children: [cut(text, width - 2)] })
  const sinceSeen = held.changed !== null
  const theirs = sinceSeen ? held.changed : String(held.currentText ?? '').split('\n')
  const seen = held.base === null ? `${held.writer} never read it` : `${held.writer} saw v${held.base}`
  return [
    row('held', `Held write by ${held.writer} (${held.tool}) on ${held.path}`, { color: paint('warn'), bold: true }),
    row('since', sinceSeen ? `v${held.current} by ${held.against}, added since ${seen}:` : `v${held.current} by ${held.against}:`, { dimColor: true }),
    ...clip(theirs.length ? theirs : ['(no lines added; lines were only removed)']).map((l, i) => row(`cur${i}`, `  ${sinceSeen ? '+ ' : ''}${l}`)),
    row('wants', `${held.writer} wants to ${held.tool === 'Write' ? 'write' : 'change'}:`, { dimColor: true }),
    ...clip(String(held.proposed ?? '').split('\n')).map((l, i) => row(`new${i}`, `  ${l}`, { color: paint('warn') })),
  ]
}

function codaTab(el, state, view, width) {
  const c = coda(state)
  const section = (title, items) => [
    el.Text({ bold: true, children: [title] }),
    ...(items.length ? items.flatMap((t) => para(el, `• ${t}`, '  ', width, {}, '  ')) : [dim(el, '  • none')]),
  ]
  return [
    ...para(el, `Task: ${short(c.task || 'not recorded', width * 3)}`, '', width),
    ...(c.requests?.length ? para(el, `Later requests: ${short(c.requests.join(' | '), width * 3)}`, '', width) : []),
    ...para(el, `Status: ${statusLine(state)}`, '', width),
    ...para(el, view.codaPath ? `Written to ${view.codaPath}` : 'The coda file is written when the conductor\'s turn ends.', '', width, { dimColor: true }),
    blank(el),
    ...codaSections(state, c).flatMap(([title, items]) => section(title, items)),
  ]
}
