// Lane contract: the motion API plugin/hooks/motion.js must expose after the motion lane, and the
// behaviour the prototype mirrors. Run: node .planning/contracts/motion.contract.mjs
// Every animated value is a pure function of ledger events (seq, ts, type, agent, ...) plus a clock
// reading `now` (ms) or the frame counter; nothing reads agent prose.
import assert from 'node:assert/strict'
import { fold } from '../../plugin/hooks/ledger.js'
import * as M from '../../plugin/hooks/motion.js'

for (const name of ['FRAME_MS', 'TRANSITION_MS', 'CUE_MS', 'transition', 'cue', 'sustain', 'lastCall', 'beat', 'note', 'baton', 'blink', 'pulse', 'meter', 'elapsed', 'activity', 'liveHandoff', 'travel', 'eventText', 'recent']) {
  assert.ok(name in M, `motion.js must export ${name}`)
}
assert.equal(M.FRAME_MS, 250)

const t0 = 1_000_000
const ev = (seq, dt, fields) => ({ seq, ts: t0 + dt, ...fields })
const events = [
  ev(1, 0, { type: 'session.start', session: 's', cwd: '/p' }),
  ev(2, 100, { type: 'part.assigned', agent: 'a1', subagentType: 'orchestra:trumpet', description: 'fix limiter', parent: 'conductor' }),
  ev(3, 600, { type: 'tool.call', agent: 'a1', tool: 'Edit', target: 'src/x.ts' }),
  ev(4, 2600, { type: 'tool.result', agent: 'a1', tool: 'Edit', target: 'src/x.ts', ok: true }),
  ev(5, 3000, { type: 'tool.call', agent: 'a1', tool: 'Bash', target: 'npm test' }),
]
const state = fold(events)
const m = state.musicians.a1
assert.ok(m, 'fixture musician folded')

// transition(state, m, now) -> { kind: 'joining'|'resting'|'stopping', step: number, steps: number } | null
// kind from the musician's newest part.assigned / part.done / part.failed; step = floor((now - ts) / FRAME_MS),
// null once now - ts >= TRANSITION_MS.
const j = M.transition(state, m, t0 + 100 + M.FRAME_MS)
assert.equal(j?.kind, 'joining'); assert.equal(j.step, 1)
assert.equal(M.transition(state, m, t0 + 100 + M.TRANSITION_MS), null)
assert.equal(typeof j.glyph, 'string', 'transition carries the glyph for its step')

// cue(state, now) -> { to: agentKey, name: string, step: number } | null: the conductor's newest
// part.assigned within CUE_MS.
assert.equal(M.cue(state, t0 + 100 + 10)?.to, 'a1')
assert.equal(M.cue(state, t0 + 100 + M.CUE_MS), null)

// sustain(state, m, now, max) -> string: a held note for the open tool call, '♪' plus '━' per
// elapsed second, capped at max characters; '' with no open call.
assert.equal(M.sustain(state, m, t0 + 3000 + 2500, 10), '♪━━')
assert.equal(M.sustain(state, m, t0 + 3000 + 60_000, 6).length, 6)
assert.equal(M.sustain(fold(events.slice(0, 4)), fold(events.slice(0, 4)).musicians.a1, t0 + 5000, 10), '')

// lastCall(state, key) -> { tool, target, ms, ok } | null: newest finished call, paired with its call.
assert.deepEqual(M.lastCall(fold(events.slice(0, 4)), 'a1'), { tool: 'Edit', target: 'src/x.ts', ms: 2000, ok: true })

// beat(state, frame) -> { bar: number, beat: number } : bar from the ledger (newest seq / 8 + 1),
// beat 1..4 from the frame.
assert.deepEqual(M.beat(state, 6), { bar: 1, beat: 3 })

// eventText for a finished call says how long it ran.
assert.match(M.eventText(state, events[3]) ?? '', /Edit src\/x\.ts.*2s/)
console.log('motion contract: OK')
