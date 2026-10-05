// Folds an append-only event log into the state every view renders.
// One source of truth: the log. Scrubbing the timeline re-folds a prefix of it.

import { MUSICIANS, PARTS } from './scenario.js';

// FNV-1a, shortened. Stands in for the content hash a real build takes of the file.
function shortHash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0').slice(0, 7);
}

function freshState() {
  const musicians = {};
  for (const m of MUSICIANS) {
    const part = PARTS[m.id];
    musicians[m.id] = {
      ...m,
      state: 'tacet',
      part: part ? part.title : null,
      total: part ? part.measures : 0,
      measures: 0,
      tool: null,
      lastRead: {},
      wroteAfterRead: {},
      reads: 0,
      writes: 0,
      added: 0,
      removed: 0,
      flags: [],
    };
  }
  return {
    musicians,
    artifacts: {},
    handoffs: [],
    conflicts: [],
    failures: [],
    stale: [],
    history: [],
    decision: null,
    coda: null,
    lastHandoff: null,
    step: 0,
  };
}

function artifact(state, path) {
  if (!state.artifacts[path]) {
    state.artifacts[path] = { path, versions: [], reads: [], status: 'ok', origin: 'repo' };
  }
  return state.artifacts[path];
}

const currentVersion = (a) => (a.versions.length ? a.versions[a.versions.length - 1].v : 0);
const nameOf = (state, id) => state.musicians[id].name;

function note(state, kind, agent, text, extra = {}) {
  state.history.push({ step: state.step, kind, agent, text, ...extra });
}

function flagStaleReaders(state, a, writer, isResolution) {
  const openConflict = state.conflicts.find((c) => c.path === a.path && !c.resolved);
  for (const m of Object.values(state.musicians)) {
    if (m.id === writer || m.state === 'done') continue;
    const readV = m.lastRead[a.path];
    if (readV === undefined || readV >= currentVersion(a)) continue;
    if (!m.wroteAfterRead[a.path]) continue;
    if (isResolution && openConflict && openConflict.agents.includes(m.id)) continue;
    if (state.stale.some((s) => s.agent === m.id && s.path === a.path && !s.cleared)) continue;
    const entry = { agent: m.id, path: a.path, readV, currentV: currentVersion(a), writer, step: state.step, cleared: false };
    state.stale.push(entry);
    m.flags.push('stale');
    note(state, 'stale', m.id, `${m.name} built on version ${readV} of ${a.path}; ${nameOf(state, writer)} has since written version ${entry.currentV}`, { path: a.path });
  }
}

const handlers = {
  'session.start'(state, e) {
    state.musicians.conductor.state = 'playing';
    note(state, 'start', 'conductor', `Conductor takes the podium: ${e.note}`);
  },
  'tool.call'(state, e) {
    const m = state.musicians[e.agent];
    m.tool = { tool: e.tool, target: e.target, kind: e.kind };
    note(state, 'tool', e.agent, `${m.name} · ${e.tool} ${e.target}`, { tool: e.tool, toolKind: e.kind });
  },
  'artifact.read'(state, e) {
    const m = state.musicians[e.agent];
    const a = artifact(state, e.path);
    const v = currentVersion(a);
    a.reads.push({ agent: e.agent, v, step: state.step });
    m.lastRead[e.path] = v;
    m.wroteAfterRead[e.path] = false;
    m.reads += 1;
    const stale = state.stale.find((s) => s.agent === e.agent && s.path === e.path && !s.cleared);
    if (stale && v >= stale.currentV) {
      stale.cleared = true;
      stale.clearedStep = state.step;
      m.flags = m.flags.filter((f) => f !== 'stale');
      if (a.status === 'stale' && !state.stale.some((s) => s.path === e.path && !s.cleared)) a.status = 'ok';
      note(state, 'resolve', e.agent, `${m.name} re-read ${e.path} at version ${v}; stale flag cleared`, { path: e.path });
    }
  },
  'artifact.write'(state, e) {
    const m = state.musicians[e.agent];
    const a = artifact(state, e.path);
    const before = currentVersion(a);
    const base = m.lastRead[e.path] ?? before;
    if (a.versions.length === 0 && m.lastRead[e.path] === undefined && a.reads.length === 0) a.origin = 'created';
    const prevAuthor = a.versions.length ? a.versions[a.versions.length - 1].agent : null;
    const v = before + 1;
    const hash = shortHash(`${e.path}#${v}#${e.summary}`);
    a.versions.push({ v, agent: e.agent, summary: e.summary, added: e.added, removed: e.removed, base, hash, step: state.step });
    m.writes += 1;
    m.added += e.added;
    m.removed += e.removed;
    m.tool = null;
    m.lastRead[e.path] = v;
    for (const p of Object.keys(m.lastRead)) if (p !== e.path) m.wroteAfterRead[p] = true;
    note(state, 'write', e.agent, `${m.name} wrote ${e.path} v${v} (+${e.added} −${e.removed}): ${e.summary}`, { path: e.path, v });

    // Write-write conflict: the writer started from an older version that someone else replaced.
    if (!e.resolves && base < before && prevAuthor && prevAuthor !== e.agent) {
      const c = { id: `c${state.conflicts.length + 1}`, path: e.path, agents: [prevAuthor, e.agent], base, versions: [before, v], step: state.step, resolved: false };
      state.conflicts.push(c);
      a.status = 'conflict';
      note(state, 'conflict', e.agent, `Conflict on ${e.path}: ${nameOf(state, e.agent)} wrote v${v} from v${base}, overwriting ${nameOf(state, prevAuthor)}'s v${before}`, { path: e.path });
    }
    flagStaleReaders(state, a, e.agent, Boolean(e.resolves));
    if (state.stale.some((s) => s.path === e.path && !s.cleared) && a.status === 'ok') a.status = 'stale';
  },
  'measure'(state, e) {
    const m = state.musicians[e.agent];
    m.measures = Math.min(m.total, m.measures + 1);
  },
  'part.assigned'(state, e) {
    const m = state.musicians[e.agent];
    m.state = 'tuning';
    note(state, 'assign', e.by, `Conductor assigns ${m.name}: ${m.part}`, { to: e.agent });
  },
  'agent.state'(state, e) {
    const m = state.musicians[e.agent];
    m.state = e.state;
    if (e.state !== 'playing') m.tool = null;
  },
  'part.done'(state, e) {
    const m = state.musicians[e.agent];
    m.state = 'done';
    m.tool = null;
    m.measures = m.total;
    note(state, 'done', e.agent, `${m.name} finished: ${m.part}`);
  },
  'part.failed'(state, e) {
    const m = state.musicians[e.agent];
    m.state = 'failed';
    m.tool = null;
    m.flags.push('failed');
    state.failures.push({ agent: e.agent, path: e.path, note: e.note, step: state.step, recovered: false });
    note(state, 'fail', e.agent, `${m.name} failed: ${e.note}`, { path: e.path });
  },
  'handoff'(state, e) {
    const a = artifact(state, e.path);
    const h = { from: e.from, to: e.to, path: e.path, v: currentVersion(a), note: e.note, step: state.step };
    state.handoffs.push(h);
    state.lastHandoff = h;
    const failure = state.failures.find((f) => f.agent === e.from && !f.recovered);
    if (failure) {
      state.musicians[e.from].state = 'waiting';
      state.musicians[e.from].measures = 0;
    }
    note(state, 'handoff', e.from, `${nameOf(state, e.from)} hands ${e.path} v${h.v} to ${nameOf(state, e.to)}: ${e.note}`, { to: e.to, path: e.path });
  },
  'decision.required'(state, e) {
    state.decision = { ...e, chosen: null };
    state.musicians.conductor.state = 'waiting';
    note(state, 'decision', 'conductor', `Conductor stops the ensemble: choose how to resolve ${e.path}`);
  },
  'conflict.resolved'(state, e) {
    const c = state.conflicts.find((x) => x.path === e.path && !x.resolved);
    if (c) {
      c.resolved = true;
      c.choice = e.choice;
      c.resolution = e.note;
      c.resolvedStep = state.step;
    }
    if (state.decision) state.decision.chosen = e.choice;
    state.musicians.conductor.state = 'playing';
    artifact(state, e.path).status = 'ok';
    note(state, 'resolve', 'conductor', `Conflict on ${e.path} resolved. ${e.note}`, { path: e.path });
  },
  'coda'(state) {
    const failure = state.failures.find((f) => !f.recovered);
    if (failure) failure.recovered = true;
    state.musicians.conductor.state = 'done';
    state.coda = summarize(state);
    note(state, 'coda', 'conductor', 'Coda: the conductor presents the combined result');
  },
};

// A recovered failure is one whose musician later finished its part.
function markRecoveries(state) {
  for (const f of state.failures) {
    if (state.musicians[f.agent].state === 'done') f.recovered = true;
  }
}

function summarize(state) {
  const contributions = Object.values(state.musicians)
    .filter((m) => m.writes > 0)
    .map((m) => ({
      id: m.id,
      name: m.name,
      writes: m.writes,
      reads: m.reads,
      added: m.added,
      removed: m.removed,
      artifacts: Object.values(state.artifacts).filter((a) => a.versions.some((v) => v.agent === m.id)).map((a) => a.path),
    }));
  const changed = Object.values(state.artifacts).filter((a) => a.versions.length > 0);
  return {
    contributions,
    changed,
    handoffs: state.handoffs.length,
    conflicts: state.conflicts,
    failures: state.failures,
    stale: state.stale,
    steps: state.step,
  };
}

export function fold(events, upto = events.length) {
  const state = freshState();
  for (let i = 0; i < upto; i += 1) {
    state.step = i + 1;
    const e = events[i];
    const handle = handlers[e.type];
    if (!handle) throw new Error(`Unknown event type: ${e.type}`);
    handle(state, e);
    markRecoveries(state);
  }
  return state;
}

