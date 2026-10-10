import { describe, expect, test } from 'claude-code/testing'
import type { CommandRunInput } from 'claude-code'
import { coda, fold, statusLine } from '../hooks/ledger.js'

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
})
