// What Orchestra draws. Every function takes the element constructors the mod resolved
// for the surface, the folded ledger state, and the pane's own view state.

import { CONDUCTOR, artifactStatus, coda, codaSections, counts, hashLabel, musicians, nameOf, plural, roster, statusLine } from './ledger.js'
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

const LEGEND = ['○ read', '← used another\'s work', '● write', '· tool', '◆ assigned', '✓ done', '✕ failed', '‼ conflict', '⚠ stale', '? you decided']

const glyphOf = (el, m) => (STATE_TOKEN[m.state] ? tone(el, STATE_TOKEN[m.state], GLYPH[m.state]) : el.Text({ children: [GLYPH[m.state]] }))

export function band(el, state, width) {
  const chunks = musicians(state).map((m) => el.Text({
    key: m.key,
    children: [who(el, m), ' ', glyphOf(el, m), ` ${m.measures}${m.tool ? ` ${m.tool.tool}` : ''}`],
  }))
  const c = counts(state)
  const alerts = [
    c.openConflicts ? tone(el, 'danger', `‼ ${plural(c.openConflicts, 'conflict')}`, true) : null,
    c.openStale ? tone(el, 'warn', `⚠ ${c.openStale} stale`) : null,
  ].filter(Boolean)
  return el.Box({
    flexDirection: 'row', flexWrap: 'wrap', columnGap: 3, width,
    children: [dim(el, '𝄐 Orchestra'), ...chunks, ...alerts],
  })
}

const HEADER_ROWS = 2

export function pane(el, state, view, width, bodyRows) {
  const render = { ensemble, score, artifacts, coda: codaTab }[view.tab]
  const body = render(el, state, view, width)
  return el.Box({ flexDirection: 'column', width, children: [tabBar(el, view), blank(el), ...paneWindow(el, view, body, bodyRows)] })
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
// one row taller than the window: the engine raises `ui.scroll` for the arrows only while
// it has a row to scroll, and the pane's hook keeps it from moving, so that row never shows.
// Without `bodyRows` the whole tab is drawn and the engine scrolls it.
function paneWindow(el, view, rows, bodyRows) {
  let end = rows.length
  while (end > 1 && blanks.has(rows[end - 1])) end -= 1
  const body = rows.slice(0, end)
  if (view.windowTab !== view.tab) Object.assign(view, { windowTab: view.tab, offset: 0 })
  const shown = Math.max(1, (bodyRows || 0) - HEADER_ROWS - 1)
  view.maxOffset = bodyRows && body.length > shown + 1 ? body.length - shown : 0
  view.page = shown
  view.offset = Math.min(view.offset || 0, view.maxOffset)
  if (!view.maxOffset) return body
  const below = body.length - view.offset - shown
  const where = [view.offset ? `↑ ${view.offset} more above` : null, below ? `↓ ${below} more below` : 'end'].filter(Boolean)
  return [...body.slice(view.offset, view.offset + shown), dim(el, `${where.join(' · ')} (↑↓ to scroll)`), blank(el)]
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

function ensemble(el, state, view, width) {
  const c = counts(state)
  return [line(el, [`${c.playing} playing · ${c.done} done${c.failed ? ` · ${c.failed} failed` : ''}`]), blank(el), ...roster(state).flatMap((key) => seat(el, state, view, key, width))]
}

function seat(el, state, view, key, width) {
  const m = state.musicians[key]
  const activity = m.tool ? `${m.tool.tool} ${m.tool.target}` : m.part || (key === CONDUCTOR ? 'Coordinating the ensemble' : m.role)
  const stale = state.stale.some((s) => s.agent === key && !s.cleared)
  const open = view.selected?.type === 'musician' && view.selected.id === key
  return [
    el.Box({ key: `seat-${key}`, flexDirection: 'row', columnGap: 1, children: [
      who(el, m), dim(el, m.role), glyphOf(el, m), dim(el, m.state), detailsButton(el, view, 'musician', key),
    ] }),
    line(el, [dim(el, `  ${short(activity, width - 3)}`)]),
    key === CONDUCTOR ? null : line(el, [`  ${plural(m.measures, 'measure')} · ${plural(m.reads, 'read')} · ${plural(m.writes, 'write')}`, stale ? tone(el, 'warn', '   ⚠ stale read') : '']),
    ...(open ? musicianDetail(el, state, key, width) : []),
    blank(el),
  ].filter(Boolean)
}

function musicianDetail(el, state, key, width) {
  const m = state.musicians[key]
  const seen = Object.entries(m.seen).map(([p, v]) => {
    const now = state.artifacts[p].versions.length - 1
    return line(el, [`    ${short(p, width - 18)} v${v}`, v < now ? tone(el, 'warn', ` (now v${now})`) : ''])
  })
  return [
    dim(el, `    ${m.name} · ${m.type}`),
    ...(m.prompt ? para(el, `Part: ${short(m.prompt, 300)}`, '    ', width, { dimColor: true }) : []),
    el.Text({ children: ['    Versions it has seen:'] }),
    ...(seen.length ? seen : [dim(el, '      none yet')]),
    ...(m.answer ? para(el, `Answer: ${short(m.answer, 400)}`, '    ', width, { dimColor: true }) : []),
  ]
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
    ...narrationBlock(el, view.narration, width),
  ]
}

// Claude's retelling of the coda, shown after the coda and labelled as a retelling.
function narrationBlock(el, narration, width) {
  if (!narration) return []
  const note = {
    writing: 'Claude is retelling the coda above…',
    failed: `Could not narrate the coda: ${narration.text}`,
    done: `A retelling of the coda above, written to ${narration.path}. The coda is the record.`,
  }[narration.status]
  const paragraphs = narration.status === 'done' ? narration.text.split(/\n\s*\n/) : []
  return [
    blank(el),
    el.Text({ bold: true, children: ['Narrated by Claude'] }),
    ...para(el, note, '', width, { dimColor: true }),
    ...paragraphs.flatMap((p) => [blank(el), ...para(el, p.trim(), '', width)]),
  ]
}
