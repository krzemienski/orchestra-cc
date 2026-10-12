// Ledger replay render proof: folds a fixed event list with the plugin's own ledger.js, then draws
// the band and the Ensemble and Score tabs with the plugin's own views.js at several clock times and
// motion frames. Every assertion is about text the mod would hand Claude Code to draw.
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
const draw = (label, now, frame, tab) => {
  const state = at(now)
  const view = { tab, frame, live: true, now, selected: null, setTab() {}, select() {} }
  const b = band(el, state, 80, view)
  const p = pane(el, state, view, 80)
  // The band sits on the terminal's own background; the pane body is painted the palette's ground
  // (black on a dark terminal) once, at its root, over Claude Code's grey pane fill.
  assert.deepEqual(backgrounds(b), [], 'band paints no background')
  assert.equal(p.backgroundColor, ground(), 'pane root is painted the palette ground')
  assert.deepEqual(backgrounds(p), [ground()], 'only the pane root carries a background')
  const lines = rows(p).filter((l) => l.trim())
  out.push(`--- ${label} (t0+${now - t0} ms, frame ${frame}, ${tab})`, `band: ${text(b)}`, ...lines.map((l) => `  ${l}`))
  return { band: text(b), lines }
}

// 1. The conductor cues the trumpet; the trumpet joins (stepped glyph), then plays.
const cue = draw('cue and join', t0 + 400 + 300, 1, 'ensemble')
assert.ok(cue.lines.some((l) => l.includes('cue → Trumpet')), 'conductor line shows the cue')
assert.ok(cue.lines.some((l) => /Trumpet .*♩ joining/.test(l)), 'trumpet chair steps through joining')
const later = draw('after the windows', t0 + 400 + 2000, 1, 'ensemble')
assert.ok(!later.lines.some((l) => l.includes('cue →')), 'cue ends after CUE_MS')
assert.ok(!later.lines.some((l) => l.includes('joining')), 'joining ends after TRANSITION_MS')

// 2. The band moves between frames: baton and notes change, numbers stay.
const f0 = draw('band frame 0', t0 + 5000, 0, 'ensemble').band
const f1 = draw('band frame 1', t0 + 5000, 1, 'ensemble').band
assert.notEqual(f0, f1, 'band changes between frames')
assert.equal(f0.replace(/[╲│╱♩♪♫♬]/g, ''), f1.replace(/[╲│╱♩♪♫♬]/g, ''), 'only motion glyphs change')

// 3. A finished call reports tool, file and duration; an open one shows how long it has run.
const ens = draw('activity', t0 + 6100, 2, 'ensemble')
assert.ok(ens.lines.some((l) => l.includes('last: Edit src/limiter.ts · 2s')), 'trumpet seat shows its last call and duration')
assert.ok(ens.lines.some((l) => l.includes('Write docs/limits.md · 2s')), 'flute seat shows the open call and how long')
assert.ok(ens.lines.some((l) => l.includes('Trumpet · Edit src/limiter.ts · 2s')), 'ticker reports the finished call with its duration')

// 4. The Score tab plays: bar and beat from ledger and frame, a held note grows with the open call.
const s1 = draw('score early', t0 + 4100 + 1200, 1, 'score')
const s2 = draw('score later', t0 + 4100 + 4200, 2, 'score')
const header = (lines) => lines.find((l) => l.includes('Events ')) ?? ''
assert.ok(header(s1.lines).startsWith('bar 1, beat 2'), `score header has bar and beat: ${header(s1.lines)}`)
assert.ok(header(s2.lines).startsWith('bar 1, beat 3'), `beat advances with the frame: ${header(s2.lines)}`)
const held = (lines) => (lines.find((l) => l.startsWith('Flute')) ?? '').match(/♪━*/)?.[0] ?? ''
assert.equal(held(s1.lines), '♪━', 'held note: one bar after 1 s')
assert.equal(held(s2.lines), '♪━━━━', 'held note grows to four bars after 4 s')

// 5. Idle: nothing moves when no timer runs.
const idle = band(el, at(t0 + 6000), 80, { frame: 3, live: false, now: t0 + 6000 })
assert.ok(text(idle).startsWith('\u{1D110} Orchestra'), 'idle band shows the still mark, not the baton')

console.log(out.join('\n'))
console.log('render proof: OK')
