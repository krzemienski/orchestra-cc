// Replays a real ledger from a live performance through the plugin's own ledger.js and views.js,
// and checks the recorded tmux frames against it.
// Usage: node .planning/live/replay.mjs <ledger.jsonl> <frames-dir>
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fold, musicians } from '../../plugin/hooks/ledger.js'
import { band } from '../../plugin/hooks/views.js'

const [ledgerPath, framesDir] = process.argv.slice(2)
const events = (await readFile(ledgerPath, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l))
const state = fold(events)
const t0 = events[0].ts

console.log(`ledger: ${events.length} events over ${((events.at(-1).ts - t0) / 1000).toFixed(1)} s`)
for (const e of events.filter((x) => ['part.assigned', 'tool.call', 'tool.result', 'part.done', 'part.failed', 'artifact.write'].includes(x.type))) {
  const who = state.musicians[e.agent]?.name ?? e.agent ?? ''
  console.log(`  +${((e.ts - t0) / 1000).toFixed(1).padStart(5)}s #${String(e.seq).padStart(3)} ${e.type.padEnd(15)} ${who} ${e.tool ?? ''} ${e.target ?? e.path ?? e.description ?? ''}`.trimEnd())
}
console.log(`musicians: ${musicians(state).map((m) => `${m.name}=${m.state} (${m.measures} measures)`).join(', ')}`)

// The band the mod would draw now.
const el = new Proxy({}, { get: (_, tag) => (props = {}) => ({ tag, ...props }) })
const text = (n) => (n == null || n === false ? '' : typeof n === 'string' ? n : [].concat(n.children ?? []).map(text).join(''))
console.log(`band (still): ${text(band(el, state, 140))}`)

if (framesDir) {
  const names = (await readdir(framesDir)).filter((f) => f.endsWith('.txt')).sort()
  const seen = { baton: new Set(), notes: new Set(), cue: [], joining: [], resting: [], spinner: new Set(), toasts: new Set(), lastLine: new Set(), bandLines: new Set() }
  for (const name of names) {
    const lines = (await readFile(join(framesDir, name), 'utf8')).split('\n')
    for (const l of lines) {
      const band = l.match(/^([╲│╱𝄐]) Orchestra\s+(.*)$/)
      if (band) {
        seen.baton.add(band[1])
        for (const ch of band[2].match(/[♩♪♫♬]/g) ?? []) seen.notes.add(ch)
        seen.bandLines.add(l.trimEnd())
      }
      if (l.includes('cue →')) seen.cue.push(`${name}: ${l.trim()}`)
      if (/ joining/.test(l)) seen.joining.push(`${name}: ${l.trim()}`)
      if (/♩ resting|· resting|♪ resting/.test(l)) seen.resting.push(`${name}: ${l.trim()}`)
      const sp = l.match(/·\s+(\d+ playing:.*?)(?:\(|$)/)
      if (sp) seen.spinner.add(sp[1].trim())
      if (/Orchestra · .*(joins|rests|finished|handoff|coda ready)/.test(l)) seen.toasts.add(l.trim())
      if (/last: /.test(l)) seen.lastLine.add(l.trim())
    }
  }
  console.log(`frames: ${names.length}`)
  console.log(`band baton glyphs seen: ${[...seen.baton].join(' ')}`)
  console.log(`band note glyphs seen: ${[...seen.notes].join(' ')}`)
  console.log(`distinct band lines: ${seen.bandLines.size}`)
  for (const l of [...seen.bandLines].slice(0, 8)) console.log(`  ${l}`)
  console.log(`spinner suffixes: ${seen.spinner.size}`)
  for (const s of seen.spinner) console.log(`  ${s}`)
  console.log(`toasts: ${seen.toasts.size}`)
  for (const s of seen.toasts) console.log(`  ${s}`)
  console.log(`cue lines: ${seen.cue.length}`); for (const s of seen.cue.slice(0, 4)) console.log(`  ${s}`)
  console.log(`joining lines: ${seen.joining.length}`); for (const s of seen.joining.slice(0, 4)) console.log(`  ${s}`)
  console.log(`resting lines: ${seen.resting.length}`); for (const s of seen.resting.slice(0, 4)) console.log(`  ${s}`)
  console.log(`last: lines: ${seen.lastLine.size}`); for (const s of seen.lastLine) console.log(`  ${s}`)
}
