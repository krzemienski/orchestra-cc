// Motion for the pane and the band. Every moving glyph is a function of the frame counter, which
// a timer in register.js advances only while a musician is playing or waiting in an interactive
// session; what moves says "alive", and the numbers drawn beside it come from the ledger.

import { CONDUCTOR, nameOf } from './ledger.js'

export const FRAME_MS = 250
const NOTES = ['♩', '♪', '♫', '♬']
export const TRANSITION_MS = 1000
export const CUE_MS = 1500
const BATON = ['╲', '│', '╱', '│']
const BARS = ' ▁▂▃▄▅▆▇█'
const RECENT_WINDOW = 20
const JOIN = ['·', '♩', '♪', '♫']
const REST = ['♪', '♩', '·', '·']
const STOP = ['♪', '✕', '✕', '✕']
const BAR_EVENTS = 8

function newest(state, key, types) {
  for (let i = state.events.length - 1; i >= 0; i -= 1) {
    const e = state.events[i]
    if (e.agent === key && types.includes(e.type)) return e
  }
  return null
}

export function transition(state, m, now) {
  const e = newest(state, m.key, ['part.assigned', 'part.done', 'part.failed'])
  if (!e || now - e.ts >= TRANSITION_MS) return null
  const kind = e.type === 'part.assigned' ? 'joining' : e.type === 'part.done' ? 'resting' : 'stopping'
  const step = Math.max(0, Math.floor((now - e.ts) / FRAME_MS))
  const glyphs = kind === 'joining' ? JOIN : kind === 'resting' ? REST : STOP
  return { kind, step, steps: TRANSITION_MS / FRAME_MS, glyph: glyphs[Math.min(step, glyphs.length - 1)] }
}

export function cue(state, now) {
  const e = [...state.events].reverse().find((x) => x.type === 'part.assigned')
  if (!e || now - e.ts >= CUE_MS) return null
  return { to: e.agent, name: state.musicians[e.agent]?.name ?? e.agent, step: Math.max(0, Math.floor((now - e.ts) / FRAME_MS)) }
}

// A playing musician's note, offset by its seat so the section does not move in lockstep.
export const note = (frame, seat) => NOTES[(frame + seat) % NOTES.length]
export const baton = (frame) => BATON[frame % BATON.length]
// A waiting musician's mark blinks; on the off frames it keeps its width.
export const blink = (frame, glyph) => (frame % 2 ? ' ' : glyph)

// A line from the conductor to the section with a pulse travelling along it while work runs.
export function pulse(frame, cols, live) {
  const n = Math.max(4, cols)
  if (!live) return '─'.repeat(n)
  const at = frame % n
  return `${'─'.repeat(at)}•${'─'.repeat(n - at - 1)}`
}

// How busy a musician has been: its tool calls among the last RECENT_WINDOW events, as one bar.
export function meter(state, key) {
  const recent = state.events.slice(-RECENT_WINDOW).filter((e) => e.agent === key && e.type === 'tool.call').length
  return BARS[Math.min(BARS.length - 1, recent)]
}

// A duration as a person reads it: "4s", "1m 05s".
export function elapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

// What a musician is doing now and for how long: its open tool call and the time since the ledger
// recorded it. Null when it has no open call.
export function activity(state, m, now) {
  if (!m.tool) return null
  const call = state.events.findLast((e) => e.agent === m.key && e.type === 'tool.call')
  const target = m.tool.target ? ` ${m.tool.target}` : ''
  return `${m.tool.tool}${target}${call && now ? ` · ${elapsed(now - call.ts)}` : ''}`
}

// The newest handoff if it is among the last HANDOFF_WINDOW events: shown travelling on the stage.
const HANDOFF_WINDOW = 12
export function liveHandoff(state) {
  const h = state.handoffs[state.handoffs.length - 1]
  const last = state.events[state.events.length - 1]
  return h && last && last.seq - h.seq <= HANDOFF_WINDOW ? h : null
}

// An arrow carrying a file from one musician to the next; its head moves along while work runs.
export function travel(frame, cols, live) {
  const n = Math.max(3, cols)
  const at = live ? frame % n : n - 1
  return `${'━'.repeat(at)}▶${' '.repeat(n - at - 1)}`
}

// A note held for as long as the musician's open tool call has run: one bar per second.
export function sustain(state, m, now, max) {
  if (!m.tool) return ''
  const call = newest(state, m.key, ['tool.call'])
  const bars = call ? Math.max(0, Math.floor((now - call.ts) / 1000)) : 0
  return `♪${'━'.repeat(bars)}`.slice(0, Math.max(1, max))
}

// A musician's newest finished tool call, paired with the call that started it.
export function lastCall(state, key) {
  const result = newest(state, key, ['tool.result'])
  if (!result) return null
  const call = [...state.events].reverse().find((e) => e.agent === key && e.type === 'tool.call' && e.seq < result.seq)
  if (!call) return null
  return { tool: result.tool, target: result.target, ms: result.ts - call.ts, ok: Boolean(result.ok) }
}

// Where the performance is: the bar from the ledger (8 events each), the beat from the frame clock.
export function beat(state, frame) {
  return { bar: Math.floor((state.events.at(-1)?.seq ?? 0) / BAR_EVENTS) + 1, beat: (frame % 4) + 1 }
}

// One ledger event in words, for the ticker; null for events that say nothing to a person.
export function eventText(state, e) {
  const who = e.agent ? nameOf(state, e.agent) : 'Orchestra'
  const v = (path, hash) => {
    const i = state.artifacts[path]?.versions.findIndex((x) => x.hash === hash)
    return i >= 0 ? ` v${i}` : ''
  }
  switch (e.type) {
    case 'part.assigned': return `Conductor → ${who}: ${e.description || 'a part'}`
    case 'artifact.read': return `${who} ○ read ${e.path}${v(e.path, e.hash)}`
    case 'artifact.write': return `${who} ● wrote ${e.path}${v(e.path, e.hash)}${e.via === 'bash' ? ' via Bash' : ''}`
    case 'tool.call': return e.agent === CONDUCTOR ? null : `${who} · ${e.tool}${e.target ? ` ${e.target}` : ''}`
    case 'tool.result': {
      if (!e.ok) return `${who} ✕ ${e.tool} failed`
      const done = lastCall(state, e.agent)
      return done ? `${who} · ${e.tool}${e.target ? ` ${e.target}` : ''} · ${elapsed(done.ms)}` : null
    }
    case 'conflict.resolved': return `You decided a conflict: ${e.choice}${e.auto ? ' (automatic)' : ''}`
    case 'part.done': return `${who} ✓ finished the part`
    case 'part.failed': return `${who} ✕ part ended: ${e.reason}`
    case 'background.started': return `${who} started a background command`
    case 'background.ended': return `A background command ended (${e.status})`
    default: return null
  }
}

// The newest events in words, newest first.
export const recent = (state, n) => state.events.slice(-60).map((e) => ({ seq: e.seq, text: eventText(state, e) }))
  .filter((x) => x.text).slice(-n).reverse()
