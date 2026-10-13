// Ledger replay render proof: folds a fixed event list with the plugin's own ledger.js, then draws
// the band and the Ensemble and Score tabs with the plugin's own views.js, and draws them again with
// the clock moved on. Every assertion is about text the mod would hand Claude Code to draw.
// Run: node .planning/contracts/render-proof.mjs
import assert from 'node:assert/strict'
import { fold } from '../../plugin/hooks/ledger.js'
import { band, pane } from '../../plugin/hooks/views.js'
import { ground, setColorMode } from '../../plugin/hooks/palette.js'

const t0 = 1_000_000
const ev = (seq, dt, f) => ({ seq, ts: t0 + dt, ...f })
const events = [
  ev(1, 0, { type: 'session.start', session: 's', cwd: '/p' }),
  ev(2, 200, { type: 'turn.start' }),
  ev(3, 400, { type: 'part.assigned', agent: 'a1', subagentType: 'orchestra:trumpet', description: 'fix the limiter', parent: 'conductor' }),
  ev(4, 900, { type: 'tool.call', agent: 'a1', tool: 'Edit', target: 'src/limiter.ts' }),
  ev(5, 3400, { type: 'tool.result', agent: 'a1', tool: 'Edit', target: 'src/limiter.ts', ok: true }),
  ev(6, 3800, { type: 'part.assigned', agent: 'a2', subagentType: 'orchestra:flute', description: 'document it', parent: 'conductor' }),
  ev(7, 4100, { type: 'tool.call', agent: 'a2', tool: 'Write', target: 'docs/limits.md' }),
]
// The mod only ever holds events that have already happened, so each draw folds the prefix up to `now`.
const at = (now) => fold(events.filter((e) => e.ts <= now))

// Element constructors that keep props, like the mod's resolved `el`.
const el = new Proxy({}, { get: (_, tag) => (props = {}) => ({ tag, ...props }) })
const text = (n) => (n == null || n === false ? '' : typeof n === 'string' ? n : [].concat(n.children ?? []).map(text).join(''))
const rows = (n) => [].concat(n.children ?? []).flatMap((c) => (c && c.tag === 'Box' && c.flexDirection !== 'row' ? rows(c) : [text(c)]))
const backgrounds = (n) => (n && typeof n === 'object' ? [n.backgroundColor, ...[].concat(n.children ?? []).flatMap(backgrounds)] : []).filter(Boolean)

setColorMode('dark')
const out = []
// The mod's `view.now` is the time of the newest recorded event (register.js recordIn); the draw
// functions are given nothing else that tells time.
const draw = (label, now, tab) => {
  const state = at(now)
  const view = { tab, now: state.events.at(-1).ts, selected: null, setTab() {}, select() {} }
  const b = band(el, state, 80, view.now)
  const p = pane(el, state, view, 80)
  // The band sits on the terminal's own background; the pane body is painted the palette's ground
  // (black on a dark terminal) once, at its root, over Claude Code's grey pane fill.
  assert.deepEqual(backgrounds(b), [], 'band paints no background')
  assert.equal(p.backgroundColor, ground(), 'pane root is painted the palette ground')
  assert.deepEqual(backgrounds(p), [ground()], 'only the pane root carries a background')
  const lines = rows(p).filter((l) => l.trim())
  out.push(`--- ${label} (t0+${now - t0} ms, ${tab})`, `band: ${text(b)}`, ...lines.map((l) => `  ${l}`))
  return { band: text(b), lines }
}

// 1. Each musician's second line: an open call with its time at the newest event, or the part
// brief between calls. The band's first line is the rollup, then one row per musician playing.
const ens = draw('activity', t0 + 6100, 'ensemble')
assert.ok(ens.lines.some((l) => /└ Write docs\/limits\.md\s*· 0s/.test(l)), 'flute row shows its open call, timed at the newest event')
assert.ok(ens.lines.some((l) => l.includes('└ fix the limiter')), 'trumpet between calls shows its part brief')
assert.ok(ens.lines[ens.lines.length - 1].startsWith('1-4 tabs'), 'the key hints are the last row')
assert.ok(ens.band.startsWith('𝄐 Orchestra  2 playing'), `band line 1 is the rollup: ${ens.band}`)

// 2. Rows past the band's room fold into one row that points at the pane.
const folded = rows(band(el, at(t0 + 6100), 80, t0 + 4100, 2))
assert.deepEqual(folded.map((l) => l.trim()), ['𝄐 Orchestra  2 playing', '… 2 more · /orchestra'], `band folds: ${JSON.stringify(folded)}`)

// 3. Nothing moves without an event: the same ledger drawn again after the clock has moved on a
// minute gives the same band, Ensemble and Score, character for character.
const realNow = Date.now
for (const tab of ['ensemble', 'score']) {
  const first = draw(`${tab}, first draw`, t0 + 6100, tab)
  Date.now = () => realNow() + 60_000
  const again = draw(`${tab}, a minute later, no new event`, t0 + 66_100, tab)
  Date.now = realNow
  assert.equal(again.band, first.band, `band is the same a minute later (${tab})`)
  assert.deepEqual(again.lines, first.lines, `${tab} is the same a minute later`)
}

// 4. The band's mark is still.
assert.ok(ens.band.startsWith('\u{1D110} Orchestra'), 'band shows the still mark')

console.log(out.join('\n'))
console.log('render proof: OK')
