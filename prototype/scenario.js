// Scripted performance for the Orchestra design prototype.
// Every event here is illustrative design data, not output from a real Claude Code run.
// The UI never reads this array directly: it folds events into state (see engine.js),
// which is how the real implementation is intended to work from hook-captured events.

export const TASK = 'Add rate limiting to the /upload endpoint and document it';

export const MUSICIANS = [
  { id: 'conductor', name: 'Conductor', role: 'Plans the score, assigns parts, resolves conflicts, writes the coda', section: 'podium' },
  { id: 'violin', name: 'First Violin', role: 'Scout: reads and maps the code path', section: 'strings' },
  { id: 'viola', name: 'Viola', role: 'Config: owns limits and environment settings', section: 'strings' },
  { id: 'trumpet', name: 'Trumpet', role: 'Implementer: writes the middleware and route change', section: 'brass' },
  { id: 'flute', name: 'Flute', role: 'Scribe: writes user-facing docs', section: 'woodwinds' },
  { id: 'timpani', name: 'Timpani', role: 'Tester: runs the suite and reports', section: 'percussion' },
];

// Parts: what each musician was asked to play. `measures` = number of steps in the part.
export const PARTS = {
  violin: { title: 'Map the upload request path', measures: 4, after: [] },
  viola: { title: 'Add upload limits to config', measures: 3, after: ['violin'] },
  trumpet: { title: 'Implement rate-limit middleware', measures: 4, after: ['violin'] },
  flute: { title: 'Document the new limits', measures: 4, after: ['trumpet'] },
  timpani: { title: 'Run the test suite', measures: 2, after: ['trumpet', 'viola'] },
};

const ev = (type, fields) => ({ type, ...fields });

// Opening through the conflict. The decision event pauses playback until the user chooses.
export const OPENING = [
  ev('session.start', { agent: 'conductor', note: TASK }),
  ev('tool.call', { agent: 'conductor', tool: 'Read', kind: 'read', target: 'CLAUDE.md' }),
  ev('artifact.read', { agent: 'conductor', path: 'CLAUDE.md' }),
  ev('artifact.write', { agent: 'conductor', path: '.orchestra/score.md', summary: 'Score: 5 parts in dependency order violin, then viola and trumpet, then flute and timpani', added: 22, removed: 0 }),
  ev('part.assigned', { agent: 'violin', by: 'conductor' }),
  ev('agent.state', { agent: 'violin', state: 'playing' }),
  ev('tool.call', { agent: 'violin', tool: 'Grep', kind: 'search', target: '"upload" in src/' }),
  ev('tool.call', { agent: 'violin', tool: 'Read', kind: 'read', target: 'src/routes/upload.ts' }),
  ev('artifact.read', { agent: 'violin', path: 'src/routes/upload.ts' }),
  ev('measure', { agent: 'violin' }),
  ev('tool.call', { agent: 'violin', tool: 'Read', kind: 'read', target: 'src/server.ts' }),
  ev('artifact.read', { agent: 'violin', path: 'src/server.ts' }),
  ev('measure', { agent: 'violin' }),
  ev('tool.call', { agent: 'violin', tool: 'Read', kind: 'read', target: 'config/limits.json' }),
  ev('artifact.read', { agent: 'violin', path: 'config/limits.json' }),
  ev('measure', { agent: 'violin' }),
  ev('tool.call', { agent: 'violin', tool: 'Write', kind: 'write', target: '.orchestra/notes/upload-map.md' }),
  ev('artifact.write', { agent: 'violin', path: '.orchestra/notes/upload-map.md', summary: 'Upload path: server.ts to routes/upload.ts to storage.put; limits live in config/limits.json', added: 31, removed: 0 }),
  ev('measure', { agent: 'violin' }),
  ev('part.done', { agent: 'violin' }),
  ev('handoff', { from: 'violin', to: 'trumpet', path: '.orchestra/notes/upload-map.md', note: 'Map of the upload path' }),
  ev('handoff', { from: 'violin', to: 'viola', path: '.orchestra/notes/upload-map.md', note: 'Where limits are read' }),
  ev('part.assigned', { agent: 'trumpet', by: 'conductor' }),
  ev('part.assigned', { agent: 'viola', by: 'conductor' }),
  ev('agent.state', { agent: 'trumpet', state: 'playing' }),
  ev('agent.state', { agent: 'viola', state: 'playing' }),
  ev('artifact.read', { agent: 'trumpet', path: '.orchestra/notes/upload-map.md' }),
  ev('artifact.read', { agent: 'viola', path: '.orchestra/notes/upload-map.md' }),
  ev('tool.call', { agent: 'trumpet', tool: 'Read', kind: 'read', target: 'config/limits.json' }),
  ev('artifact.read', { agent: 'trumpet', path: 'config/limits.json' }),
  ev('tool.call', { agent: 'trumpet', tool: 'Write', kind: 'write', target: 'src/middleware/rateLimit.ts' }),
  ev('artifact.write', { agent: 'trumpet', path: 'src/middleware/rateLimit.ts', summary: 'Token-bucket limiter; returns 429 with Retry-After', added: 48, removed: 0 }),
  ev('measure', { agent: 'trumpet' }),
  ev('tool.call', { agent: 'viola', tool: 'Read', kind: 'read', target: 'config/limits.json' }),
  ev('artifact.read', { agent: 'viola', path: 'config/limits.json' }),
  ev('measure', { agent: 'viola' }),
  ev('tool.call', { agent: 'trumpet', tool: 'Edit', kind: 'write', target: 'src/routes/upload.ts' }),
  ev('artifact.write', { agent: 'trumpet', path: 'src/routes/upload.ts', summary: 'Mount rateLimit() before the upload handler', added: 3, removed: 1 }),
  ev('measure', { agent: 'trumpet' }),
  ev('part.assigned', { agent: 'flute', by: 'conductor' }),
  ev('agent.state', { agent: 'flute', state: 'playing' }),
  ev('artifact.read', { agent: 'flute', path: 'src/middleware/rateLimit.ts' }),
  ev('measure', { agent: 'flute' }),
  ev('tool.call', { agent: 'viola', tool: 'Edit', kind: 'write', target: 'config/limits.json' }),
  ev('artifact.write', { agent: 'viola', path: 'config/limits.json', summary: 'upload: { perMinute: 20, burst: 5 }', added: 4, removed: 0 }),
  ev('measure', { agent: 'viola' }),
  ev('tool.call', { agent: 'trumpet', tool: 'Edit', kind: 'write', target: 'config/limits.json' }),
  ev('artifact.write', { agent: 'trumpet', path: 'config/limits.json', summary: 'upload: { perMinute: 60 } (based on the version before Viola’s edit)', added: 3, removed: 0 }),
  ev('agent.state', { agent: 'trumpet', state: 'waiting' }),
  ev('agent.state', { agent: 'viola', state: 'waiting' }),
  ev('decision.required', { id: 'limits-conflict', path: 'config/limits.json', options: [
    { id: 'viola', label: 'Keep Viola’s version', detail: 'perMinute 20, burst 5. Trumpet adapts its defaults.' },
    { id: 'trumpet', label: 'Keep Trumpet’s version', detail: 'perMinute 60, no burst. Viola’s burst setting is dropped.' },
    { id: 'merge', label: 'Ask the conductor to merge', detail: 'Combine both: perMinute from Trumpet, burst from Viola.' },
  ] }),
];

const RESOLUTIONS = {
  viola: { summary: 'Kept Viola’s version: perMinute 20, burst 5', added: 0, removed: 3 },
  trumpet: { summary: 'Kept Trumpet’s version: perMinute 60, burst removed', added: 0, removed: 4 },
  merge: { summary: 'Merged: perMinute 60 from Trumpet, burst 5 from Viola', added: 1, removed: 0 },
};

// Everything after the user's choice. The resolution changes the config artifact,
// and the rest of the performance (a failed test, a re-assignment, a stale doc) follows.
// Conflicts and stale reads are not scripted: engine.js derives them from read/write versions.
export function continuation(choice) {
  const r = RESOLUTIONS[choice];
  return [
    ev('conflict.resolved', { path: 'config/limits.json', choice, note: r.summary }),
    ev('artifact.write', { agent: 'conductor', path: 'config/limits.json', summary: r.summary, added: r.added, removed: r.removed, resolves: true }),
    ev('artifact.read', { agent: 'viola', path: 'config/limits.json' }),
    ev('artifact.read', { agent: 'trumpet', path: 'config/limits.json' }),
    ev('agent.state', { agent: 'viola', state: 'playing' }),
    ev('agent.state', { agent: 'trumpet', state: 'playing' }),
    ev('measure', { agent: 'viola' }),
    ev('part.done', { agent: 'viola' }),
    ev('measure', { agent: 'trumpet' }),
    ev('tool.call', { agent: 'flute', tool: 'Write', kind: 'write', target: 'docs/rate-limits.md' }),
    ev('artifact.write', { agent: 'flute', path: 'docs/rate-limits.md', summary: 'Documents the 429 response and Retry-After header', added: 26, removed: 0 }),
    ev('measure', { agent: 'flute' }),
    ev('handoff', { from: 'trumpet', to: 'timpani', path: 'src/middleware/rateLimit.ts', note: 'Ready for tests' }),
    ev('part.assigned', { agent: 'timpani', by: 'conductor' }),
    ev('agent.state', { agent: 'timpani', state: 'playing' }),
    ev('tool.call', { agent: 'timpani', tool: 'Bash', kind: 'exec', target: 'npm test' }),
    ev('artifact.write', { agent: 'timpani', path: '.orchestra/logs/test-run-1.txt', summary: '41 passed, 1 failed: "upload over limit returns 429" got 500', added: 58, removed: 0 }),
    ev('part.failed', { agent: 'timpani', path: '.orchestra/logs/test-run-1.txt', note: 'Over-limit upload returns 500 instead of 429: the limiter throws before headers are set' }),
    ev('handoff', { from: 'timpani', to: 'trumpet', path: '.orchestra/logs/test-run-1.txt', note: 'Failing test log, fix requested by the conductor' }),
    ev('artifact.read', { agent: 'trumpet', path: '.orchestra/logs/test-run-1.txt' }),
    ev('tool.call', { agent: 'trumpet', tool: 'Edit', kind: 'write', target: 'src/middleware/rateLimit.ts' }),
    ev('artifact.write', { agent: 'trumpet', path: 'src/middleware/rateLimit.ts', summary: 'Return 429 via res.status() instead of throwing; header renamed to RateLimit-Reset', added: 6, removed: 4 }),
    ev('measure', { agent: 'trumpet' }),
      ev('part.done', { agent: 'trumpet' }),
    ev('handoff', { from: 'trumpet', to: 'timpani', path: 'src/middleware/rateLimit.ts', note: 'Fix ready for a re-run' }),
    ev('agent.state', { agent: 'timpani', state: 'playing' }),
    ev('tool.call', { agent: 'timpani', tool: 'Bash', kind: 'exec', target: 'npm test' }),
    ev('artifact.write', { agent: 'timpani', path: '.orchestra/logs/test-run-2.txt', summary: '42 passed, 0 failed', added: 57, removed: 0 }),
    ev('measure', { agent: 'timpani' }),
    ev('measure', { agent: 'timpani' }),
    ev('part.done', { agent: 'timpani' }),
    ev('artifact.read', { agent: 'flute', path: 'src/middleware/rateLimit.ts' }),
    ev('tool.call', { agent: 'flute', tool: 'Edit', kind: 'write', target: 'docs/rate-limits.md' }),
    ev('artifact.write', { agent: 'flute', path: 'docs/rate-limits.md', summary: 'Header renamed to RateLimit-Reset to match version 2', added: 2, removed: 2 }),
    ev('measure', { agent: 'flute' }),
    ev('measure', { agent: 'flute' }),
    ev('part.done', { agent: 'flute' }),
    ev('coda', { agent: 'conductor', choice }),
  ];
}
