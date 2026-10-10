// Motion for the pane and the band. Every moving glyph is a function of the frame counter, which
// a timer in register.js advances only while a musician is playing or waiting in an interactive
// session; what moves says "alive", and the numbers drawn beside it come from the ledger.

import { CONDUCTOR, nameOf } from './ledger.js'

export const FRAME_MS = 250
const NOTES = ['♩', '♪', '♫', '♬']
const BATON = ['╲', '│', '╱', '│']
const BARS = ' ▁▂▃▄▅▆▇█'
const RECENT_WINDOW = 20

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
    case 'tool.result': return e.ok ? null : `${who} ✕ ${e.tool} failed`
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
