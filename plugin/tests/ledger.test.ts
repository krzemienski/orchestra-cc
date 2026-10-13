import { describe, expect, test } from 'claude-code/testing'
import type { CommandRunInput } from 'claude-code'
import { coda, currentCall, fold, instanceName, lastCalls, musicians, rollup, statusLine } from '../hooks/ledger.js'

// Two trumpets read config.json at v0; the first writes v1, the second then tries to write from v0
// and is sent back with nobody to ask; a cello writes notes.md from v0 after v1 landed.
const A = 'trumpet-a', B = 'trumpet-b', C = 'cello'
const v0 = '0'.repeat(64), v1 = '1'.repeat(64), notes = '2'.repeat(64)
const events = [
  { type: 'session.start', session: 's1', cwd: '/work' },
  { type: 'part.assigned', agent: A, subagentType: 'orchestra:trumpet', description: 'Raise the limit', prompt: 'p', parent: 'conductor' },
  { type: 'part.assigned', agent: B, subagentType: 'orchestra:trumpet', description: 'Add a burst', prompt: 'p', parent: 'conductor' },
  { type: 'part.assigned', agent: C, subagentType: 'orchestra:cello', description: 'Document the config', prompt: 'p', parent: 'conductor' },
  { type: 'artifact.read', agent: A, path: 'config.json', hash: v0 },
  { type: 'artifact.read', agent: B, path: 'config.json', hash: v0 },
  { type: 'artifact.read', agent: C, path: 'config.json', hash: v0 },
  { type: 'write.attempt', agent: A, path: 'config.json', hash: v0 },
  { type: 'artifact.write', agent: A, path: 'config.json', hash: v1, from: v0, added: 1, removed: 1 },
  { type: 'write.attempt', agent: B, path: 'config.json', hash: v1 },
  { type: 'conflict.resolved', id: 'c1', choice: 'reread', auto: true },
  { type: 'write.attempt', agent: C, path: 'notes.md', hash: null },
  { type: 'artifact.write', agent: C, path: 'notes.md', hash: notes, from: 'none', added: 3, removed: 0 },
].map((e, i) => ({ seq: i + 1, ts: 1000 + i, ...e }))

const ledgerCommand: CommandRunInput = {
  command: 'orchestra', args: 'ledger', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 },
}

describe('ledger', () => {
  test('a stale-base write becomes a conflict and a product of an old input is stale', async () => {
    const state = fold(events)
    const c = coda(state)
    expect(statusLine(state)).toBe('Orchestra · 3 playing · 0 done · 2 artifacts changed · 1 stale')
    expect(c.conflicts.map((x) => x.text)).toEqual([
      'Trumpet 2 tried to write config.json over v1, written by Trumpet (had seen v0). Orchestra sent the write back to re-read, without a decision from you.',
    ])
    expect(c.stale).toEqual(['Cello produced notes.md from v0 of config.json; Trumpet then wrote v1. Not redone.'])
  })

  test('the same events fold to the same coda every time', async () => {
    expect(coda(fold(events))).toEqual(coda(fold(events)))
  })

  test('/orchestra ledger answers before any part is assigned', async ($) => {
    expect((await $.command.run(ledgerCommand)).text).toBe('No performance in this session yet: no musician has been assigned a part.')
  })

  // Ten musicians at once across four instruments, assigned in this order.
  const ten = ['trumpet', 'violin', 'trumpet', 'flute', 'violin', 'trumpet', 'timpani', 'flute', 'trumpet', 'violin']
  const tenEvents = ten.map((role, i) => ({ seq: i + 1, ts: 1000 + i, type: 'part.assigned', agent: `a${i}`, subagentType: `orchestra:${role}`, description: `part ${i}` }))

  test('ten musicians at once get ten distinct names, numbered per instrument in order of assignment', async () => {
    const state = fold(tenEvents)
    const names = musicians(state).map((m) => instanceName(state, m.key))
    expect(names).toEqual(['Trumpet', 'Violin', 'Trumpet 2', 'Flute', 'Violin 2', 'Trumpet 3', 'Timpani', 'Flute 2', 'Trumpet 4', 'Violin 3'])
    expect(new Set(names).size).toBe(10)
    expect(musicians(state).map((m) => m.name)).toEqual(names)
  })

  test('replaying the same ledger gives the same names', async () => {
    const once = fold(tenEvents)
    const twice = fold(tenEvents)
    expect(ten.map((_, i) => instanceName(twice, `a${i}`))).toEqual(ten.map((_, i) => instanceName(once, `a${i}`)))
  })

  test('a loop seen through a tool call before its spawn keeps names already shown', async () => {
    const state = fold([
      { seq: 1, ts: 1, type: 'tool.call', agent: 'early', tool: 'Read', target: 'a.txt' },
      { seq: 2, ts: 2, type: 'part.assigned', agent: 'late', subagentType: 'orchestra:trumpet' },
      { seq: 3, ts: 3, type: 'part.assigned', agent: 'early', subagentType: 'orchestra:trumpet' },
    ])
    expect([instanceName(state, 'late'), instanceName(state, 'early')]).toEqual(['Trumpet', 'Trumpet 2'])
  })

  test('the current call is the newest one without a result, and finished calls carry their time', async () => {
    const state = fold([
      { seq: 1, ts: 1000, type: 'part.assigned', agent: A, subagentType: 'orchestra:trumpet' },
      { seq: 2, ts: 2000, type: 'tool.call', agent: A, tool: 'Read', target: 'x.js' },
      { seq: 3, ts: 2500, type: 'tool.result', agent: A, tool: 'Read', target: 'x.js', ok: true },
      { seq: 4, ts: 3000, type: 'tool.call', agent: A, tool: 'Bash', target: 'npm test' },
      { seq: 5, ts: 3100, type: 'tool.call', agent: B, tool: 'Read', target: 'y.js' },
      { seq: 6, ts: 9000, type: 'tool.result', agent: A, tool: 'Bash', target: 'npm test', ok: false, error: 'exit 1' },
      { seq: 7, ts: 9500, type: 'tool.call', agent: A, tool: 'Edit', target: 'x.js' },
    ])
    expect(currentCall(state, A)).toMatchObject({ tool: 'Edit', target: 'x.js', ts: 9500 })
    expect(currentCall(state, B)).toMatchObject({ tool: 'Read', target: 'y.js' })
    expect(lastCalls(state, A, 3)).toEqual([
      { tool: 'Read', target: 'x.js', ts: 2000, seq: 2, ms: 500, ok: true, error: null },
      { tool: 'Bash', target: 'npm test', ts: 3000, seq: 4, ms: 6000, ok: false, error: 'exit 1' },
      { tool: 'Edit', target: 'x.js', ts: 9500, seq: 7, ms: null, ok: null, error: null },
    ])
  })

  test('the rollup leaves zero counts out and lists open conflicts and stale reads after the states', async () => {
    expect(rollup(fold(events)).map((x) => x.text)).toEqual(['3 playing', '⚠ 1 stale'])
  })

  test('two calls running at once each get their own result, whatever order the results come in', async () => {
    const state = fold([
      { seq: 1, ts: 1000, type: 'part.assigned', agent: A, subagentType: 'orchestra:violin' },
      { seq: 2, ts: 2000, type: 'tool.call', agent: A, tool: 'Grep', target: 'limit' },
      { seq: 3, ts: 2100, type: 'tool.call', agent: A, tool: 'Read', target: 'x.js' },
      { seq: 4, ts: 2300, type: 'tool.result', agent: A, tool: 'Read', target: 'x.js', ok: true },
      { seq: 5, ts: 5000, type: 'tool.result', agent: A, tool: 'Grep', target: 'limit', ok: true },
    ])
    expect(lastCalls(state, A, 2).map((c) => [c.tool, c.ms])).toEqual([['Grep', 3000], ['Read', 200]])
    expect(currentCall(state, A)).toBe(null)
  })
})
