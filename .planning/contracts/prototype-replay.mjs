// Replays the prototype's scripted performance through its own engine.js and checks, event by event,
// that what app.js animates has something to animate: a cue after each assignment, join/rest/stop
// steps, a handoff, held notes on open calls, and finished calls long enough for a toast.
// It derives these the way app.js does (events up to the cursor), without a browser.
// Run: node .planning/contracts/prototype-replay.mjs
import assert from 'node:assert/strict'
import { OPENING, continuation } from '../../prototype/scenario.js'
import { fold } from '../../prototype/engine.js'

const BASE_INTERVAL_MS = 650
const events = [...OPENING, ...continuation('merge')]
const seen = { cue: 0, joining: 0, resting: 0, stopping: 0, handoff: 0, held: 0, longCalls: [] }
const open = {}
for (let cursor = 1; cursor <= events.length; cursor += 1) {
  const e = events[cursor - 1]
  if (e.type === 'part.assigned' && e.by === 'conductor') seen.cue += 1
  if (e.type === 'part.assigned') seen.joining += 1
  if (e.type === 'part.done') seen.resting += 1
  if (e.type === 'part.failed') seen.stopping += 1
  if (e.type === 'handoff') seen.handoff += 1
  if (e.type === 'tool.call') open[e.agent] = cursor - 1
  if (e.type === 'measure' && open[e.agent] !== undefined) {
    const s = ((cursor - 1 - open[e.agent]) * BASE_INTERVAL_MS) / 1000
    if (s >= 3) seen.longCalls.push(`${e.agent} ${events[open[e.agent]].tool} ${events[open[e.agent]].target} ${Math.round(s)}s`)
    delete open[e.agent]
  }
  const state = fold(events, cursor)
  seen.held += Object.values(state.musicians).filter((m) => m.tool && open[m.id] !== undefined).length ? 1 : 0
}
console.log(`events ${events.length}`)
console.log(JSON.stringify({ ...seen, longCalls: seen.longCalls.length }))
for (const c of seen.longCalls) console.log(`  toast: ${c}`)
assert.ok(seen.cue >= 3, 'the conductor cues at least three musicians')
assert.ok(seen.joining >= 3 && seen.resting >= 2 && seen.stopping >= 1, 'joins, rests and a stop all happen')
assert.ok(seen.handoff >= 3, 'handoffs happen')
assert.ok(seen.held >= 5, 'held notes are drawn on several frames')
assert.ok(seen.longCalls.length >= 1, 'at least one call is long enough for a finished-call toast')
const first = events.findIndex((e) => e.type === 'part.assigned')
const firstHandoff = events.findIndex((e) => e.type === 'handoff')
const firstRest = events.findIndex((e) => e.type === 'part.done')
assert.ok(first < 25 && firstHandoff < 25 && firstRest < 25, 'a join, a handoff and a rest all come in the first 25 events')
console.log(`first join #${first + 1}, first rest #${firstRest + 1}, first handoff #${firstHandoff + 1}`)
console.log('prototype replay: OK')
