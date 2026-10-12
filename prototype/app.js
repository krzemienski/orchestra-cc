import { TASK, MUSICIANS, OPENING, continuation } from './scenario.js';
import { fold } from './engine.js';

const SECTION_CLASS = {
  podium: 'c-podium', strings: 'c-strings', brass: 'c-brass', woodwinds: 'c-woodwinds', percussion: 'c-percussion',
};
const SECTION_VAR = {
  podium: '--podium', strings: '--strings', brass: '--brass', woodwinds: '--woodwinds', percussion: '--percussion',
};
const STATE_GLYPH = { tacet: '·', tuning: '◌', playing: '♪', waiting: '‖', failed: '✕', done: '✓' };
const STATE_WORD = { tacet: 'tacet', tuning: 'tuning', playing: 'playing', waiting: 'waiting', failed: 'failed', done: 'done' };
const BASE_INTERVAL_MS = 650;
const TRANSCRIPT_ROWS = 80;
const SCORE_WINDOW = 30;
const TOAST_LIFETIME = 5;

const player = {
  events: [...OPENING],
  choice: null,
  cursor: 0,
  playing: false,
  speed: 1,
  timer: null,
};
const view = {
  tab: 'ensemble',
  selected: { type: 'musician', id: 'conductor' },
  tabWasPicked: false,
};

const $ = (id) => document.getElementById(id);
const sectionOf = (id) => MUSICIANS.find((m) => m.id === id).section;

// ---------- Motion ----------
// The same motion as the plugin's motion.js. Every moving glyph carries a data attribute and is a
// function of `motion.frame`, which a 250 ms timer advances only while a musician is joining,
// playing or waiting, and never under reduced motion. What it says comes from the events.

const FRAME_MS = 250;
const NOTES = ['♩', '♪', '♫', '♬'];
const BATON = ['╲', '│', '╱', '│'];
const BARS = ' ▁▂▃▄▅▆▇█';
const BAR_EVENTS = 8;
const RECENT_WINDOW = 20;
const RECENT_SHOWN = 6;
const HANDOFF_WINDOW = 12;
const CUE_EVENTS = 3;
const TRANSITION_EVENTS = 2;
const SUSTAIN_MAX = 8;
const TOAST_MIN_SECONDS = 3;
const TRANSITION_GLYPHS = {
  joining: ['·', '♩', '♪', '♫'],
  resting: ['♪', '♩', '·', '·'],
  stopping: ['♪', '✕', '✕', '✕'],
};
const TRANSITION_OF = { 'part.assigned': 'joining', 'part.done': 'resting', 'part.failed': 'stopping' };
const CHAIR_WORD = { tacet: 'tacet', tuning: 'joining', playing: 'playing', waiting: 'waiting on you', done: 'resting', failed: 'stopped' };
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const motion = { frame: 0, timer: null, starts: {} };
const live = () => Boolean(motion.timer);

function syncMotion(state) {
  const busy = Object.values(state.musicians).some((m) => ['tuning', 'playing', 'waiting'].includes(m.state));
  const want = busy && !reducedMotion.matches;
  if (want && !motion.timer) motion.timer = setInterval(() => { motion.frame += 1; renderMotion(); }, FRAME_MS);
  if (!want && motion.timer) { clearInterval(motion.timer); motion.timer = null; }
}

function renderMotion() {
  const f = motion.frame;
  document.querySelectorAll('[data-baton]').forEach((el) => { el.textContent = live() ? BATON[f % BATON.length] : '𝄐'; });
  document.querySelectorAll('[data-note]').forEach((el) => { el.textContent = live() ? NOTES[(f + Number(el.dataset.note)) % NOTES.length] : '♪'; });
  document.querySelectorAll('[data-blink]').forEach((el) => { el.style.visibility = live() && f % 2 ? 'hidden' : 'visible'; });
  document.querySelectorAll('[data-pulse]').forEach((el) => {
    const n = Number(el.dataset.pulse);
    const at = f % n;
    el.textContent = live() ? `${'─'.repeat(at)}•${'─'.repeat(n - at - 1)}` : '─'.repeat(n);
  });
  document.querySelectorAll('[data-travel]').forEach((el) => {
    const n = Number(el.dataset.travel);
    const at = live() ? f % n : n - 1;
    el.textContent = `${'━'.repeat(at)}▶${' '.repeat(n - at - 1)}`;
  });
  document.querySelectorAll('[data-playhead]').forEach((el) => { el.textContent = live() && f % 2 ? '┃' : '│'; });
  document.querySelectorAll('[data-chair]').forEach((el) => {
    const glyphs = TRANSITION_GLYPHS[el.dataset.chair];
    const key = el.dataset.key;
    if (motion.starts[key] === undefined) motion.starts[key] = f;
    const step = f - motion.starts[key];
    const at = !live() ? glyphs.length - 1 : el.dataset.chair === 'joining' ? step % glyphs.length : Math.min(step, glyphs.length - 1);
    el.textContent = glyphs[at];
  });
  document.querySelectorAll('[data-beat]').forEach((el) => { el.textContent = live() ? `, beat ${(f % 4) + 1}` : ''; });
}

// The newest part.assigned / part.done / part.failed for a musician, as { kind, index }, or null.
function newestTransition(id) {
  for (let i = player.cursor - 1; i >= 0; i -= 1) {
    const e = player.events[i];
    if (e.agent === id && TRANSITION_OF[e.type]) return { kind: TRANSITION_OF[e.type], index: i };
  }
  return null;
}

// Tool calls from the events up to the cursor, in the scenario's own time. A call opens at
// `tool.call` and finishes at the same agent's next `measure`.
function toolCalls() {
  const open = {};
  const finished = [];
  for (let i = 0; i < player.cursor; i += 1) {
    const e = player.events[i];
    if (e.type === 'tool.call') open[e.agent] = { index: i, tool: e.tool, target: e.target };
    else if (e.type === 'measure' && open[e.agent]) {
      finished.push({ agent: e.agent, tool: open[e.agent].tool, target: open[e.agent].target, from: open[e.agent].index, to: i });
      delete open[e.agent];
    } else if (e.type === 'part.done' || e.type === 'part.failed') delete open[e.agent];
  }
  return { open, finished };
}
const secondsBetween = (from, to) => ((to - from) * BASE_INTERVAL_MS) / 1000;

// A musician's state mark: a cycling note while it plays (offset by seat), a blinking mark while it waits.
function stateGlyph(m) {
  const seat = MUSICIANS.findIndex((x) => x.id === m.id);
  if (m.state === 'playing') return h('span', { class: 'state playing', 'data-note': String(seat) }, STATE_GLYPH.playing);
  if (m.state === 'waiting') return h('span', { class: 'state waiting', 'data-blink': '' }, STATE_GLYPH.waiting);
  return h('span', { class: `state ${m.state}` }, STATE_GLYPH[m.state]);
}

// How busy a musician has been: its tool calls among the last RECENT_WINDOW events, as one bar.
function meterOf(id) {
  const recent = player.events.slice(Math.max(0, player.cursor - RECENT_WINDOW), player.cursor).filter((e) => e.type === 'tool.call' && e.agent === id).length;
  return BARS[Math.min(BARS.length - 1, recent)];
}

// How long a musician's open tool call has run, in the scenario's own time (one event per beat).
function elapsedOf(m) {
  if (!m.tool) return '';
  let at = player.cursor - 1;
  while (at >= 0 && !(player.events[at].type === 'tool.call' && player.events[at].agent === m.id)) at -= 1;
  return at < 0 ? '' : `${Math.round(((player.cursor - at) * BASE_INTERVAL_MS) / 1000)}s`;
}

const shortName = (id) => nameOf(id).replace('First ', '');
const baseName = (path) => String(path).split('/').pop();

// One event in words, for the ticker; null for events that say nothing to a person.
function eventWords(e) {
  switch (e.type) {
    case 'part.assigned': return `Conductor → ${shortName(e.agent)}: joins the ensemble`;
    case 'tool.call': return e.agent === 'conductor' ? null : `${shortName(e.agent)} · ${e.tool} ${e.target}`;
    case 'artifact.read': return `${shortName(e.agent)} ○ read ${e.path}`;
    case 'artifact.write': return `${shortName(e.agent)} ● wrote ${e.path}${e.added !== undefined ? ` (+${e.added} −${e.removed})` : ''}`;
    case 'handoff': return `${shortName(e.from)} ━▶ ${shortName(e.to)}: ${e.path}`;
    case 'part.done': return `${shortName(e.agent)} ✓ rests`;
    case 'part.failed': return `${shortName(e.agent)} ✕ stopped`;
    case 'decision.required': return 'Conductor asks you to decide';
    case 'conflict.resolved': return 'You decided the conflict';
    default: return null;
  }
}

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const who = (id, label) => h('span', { class: SECTION_CLASS[sectionOf(id)] }, label);
const fileLink = (path, label = path) => h('span', { class: 'clickable', onclick: () => select('artifact', path) }, label);

function select(type, id) {
  view.selected = { type, id };
  if (type === 'artifact' && !view.tabWasPicked) view.tab = 'artifacts';
  render();
}

// ---------- Playback ----------

function atUndecidedQuestion() {
  const last = player.events[player.cursor - 1];
  return Boolean(last && last.type === 'decision.required' && !player.choice);
}

function stepForward() {
  if (atUndecidedQuestion()) { pause(); return false; }
  if (player.cursor >= player.events.length) { pause(); return false; }
  player.cursor += 1;
  if (atUndecidedQuestion() || player.cursor >= player.events.length) pause();
  render();
  return true;
}

function schedule() {
  clearTimeout(player.timer);
  if (!player.playing) return;
  player.timer = setTimeout(() => { if (stepForward()) schedule(); }, BASE_INTERVAL_MS / player.speed);
}

function play() {
  if (player.cursor >= player.events.length && !atUndecidedQuestion()) player.cursor = 0;
  player.playing = true;
  renderTransport();
  schedule();
}

function pause() {
  player.playing = false;
  clearTimeout(player.timer);
  renderTransport();
}

function choose(optionId) {
  player.choice = optionId;
  player.events = OPENING.concat(continuation(optionId));
  player.cursor += 1;
  play();
  render();
}

function replayWithNewChoice() {
  pause();
  player.choice = null;
  player.events = [...OPENING];
  player.cursor = OPENING.length;
  view.tab = 'ensemble';
  render();
}

// ---------- Terminal: transcript ----------

function historyRow(entry) {
  const name = (id) => who(id, nameOf(id));
  switch (entry.kind) {
    case 'start':
      return [h('div', { class: 'row user' }, '> ', TASK), h('div', { class: 'row' }, name('conductor'), ' ⏺ ', 'Taking the podium. Reading the project, then writing the score.')];
    case 'tool': {
      const [, rest] = entry.text.split(' · ');
      const target = rest.slice(entry.tool.length + 1);
      const looksLikePath = /[./]/.test(target) && !target.startsWith('"') && !target.includes(' ');
      return [h('div', { class: 'row' }, '⏺ ', name(entry.agent), h('span', { class: 'dim' }, ' · '), `${entry.tool}(`, looksLikePath ? fileLink(target) : target, ')')];
    }
    case 'write':
      return [h('div', { class: 'row result' }, '⎿ ', fileLink(entry.path, `${entry.path} v${entry.v}`), ' ', entry.text.split('): ')[0].split(' (')[1] ? `(${entry.text.split(' (')[1].split(')')[0]})` : '')];
    case 'assign':
      return [h('div', { class: 'row log' }, '◆ ', name('conductor'), ' assigns ', name(entry.to), ': ', entry.text.split(': ').slice(1).join(': '))];
    case 'handoff':
      return [h('div', { class: 'row log' }, '→ ', name(entry.agent), ' hands ', fileLink(entry.path), ' to ', name(entry.to))];
    case 'done':
      return [h('div', { class: 'row done' }, '✓ ', entry.text)];
    case 'fail':
      return [h('div', { class: 'row fail' }, '✕ ', entry.text)];
    case 'conflict':
      return [h('div', { class: 'row conflict' }, '‼ ', entry.text)];
    case 'stale':
      return [h('div', { class: 'row stale' }, '⚠ ', entry.text)];
    case 'resolve':
      return [h('div', { class: 'row resolve' }, '✓ ', entry.text)];
    case 'decision':
      return [h('div', { class: 'row log' }, '? ', entry.text)];
    case 'coda':
      return [];
    default:
      return [];
  }
}

const nameOf = (id) => MUSICIANS.find((m) => m.id === id).name;

// Each incident sentence is built from ledger entries, never from a musician's own summary.
function staleText(x) {
  const outcome = x.cleared ? `re-read at event ${x.clearedStep}` : 'still stale';
  return `${nameOf(x.agent)} read v${x.readV}, then ${nameOf(x.writer)} wrote v${x.currentV}; ${outcome}.`;
}

function fixerOf(state, failure) {
  const h = state.handoffs.find((x) => x.from === failure.agent && x.step > failure.step);
  return h ? nameOf(h.to) : null;
}

function failureText(state, f) {
  const fixer = fixerOf(state, f);
  const how = fixer ? `${fixer} fixed it and ${nameOf(f.agent)} re-ran its part` : `${nameOf(f.agent)} re-ran its part`;
  return f.recovered ? `${f.note}. Recovered: ${how}.` : `${f.note}. Not yet recovered.`;
}

// The headline is read from the ledger: the newest test log, plus any open stale reads or conflicts.
function outcomeLine(state) {
  const logs = Object.values(state.artifacts).filter((a) => a.path.startsWith('.orchestra/logs/') && a.versions.length);
  const lastLog = logs.map((a) => a.versions[a.versions.length - 1]).sort((a, b) => b.step - a.step)[0];
  const openStale = state.stale.filter((x) => !x.cleared).length;
  const openConflicts = state.conflicts.filter((x) => !x.resolved).length;
  return [
    lastLog ? `last test run: ${lastLog.summary}` : 'no test run recorded',
    openStale ? `${openStale} stale reads open` : 'no stale reads open',
    openConflicts ? `${openConflicts} conflicts open` : 'no conflicts open',
  ].join(' · ');
}

function codaRow(state) {
  const c = state.coda;
  const musicians = c.contributions.filter((x) => x.id !== 'conductor').length;
  const lines = [
    h('div', {}, who('conductor', 'Conductor'), ` ⏺ Coda: ${TASK}. Outcome from the ledger: ${outcomeLine(state)}.`),
    h('div', { class: 'dim' }, `The conductor and ${musicians} musicians wrote ${c.changed.length} artifacts across ${c.handoffs} handoffs.`),
    ...c.conflicts.map((x) => h('div', {}, '• Conflict on ', fileLink(x.path), `: ${x.resolution}.`)),
    ...c.failures.map((f) => h('div', {}, `• ${nameOf(f.agent)} failed on `, fileLink(f.path), `. ${f.recovered ? (fixerOf(state, f) ? `Recovered after a fix by ${fixerOf(state, f)}.` : 'Recovered after a re-run.') : 'Not yet recovered.'}`)),
    c.stale.length ? h('div', {}, `• ${c.stale.length} stale ${c.stale.length === 1 ? 'read' : 'reads'} caught; ${c.stale.filter((x) => x.cleared).length} refreshed before the coda.`) : null,
    h('div', { class: 'dim' }, 'Full breakdown is in the Coda tab of the Orchestra pane.'),
  ];
  return h('div', { class: 'row coda' }, lines);
}

function renderTranscript(state) {
  const box = $('transcript');
  const rows = state.history.flatMap(historyRow).slice(-TRANSCRIPT_ROWS);
  if (state.coda) rows.push(codaRow(state));
  if (rows.length === 0) rows.push(h('div', { class: 'row dim' }, 'Press Play to start the performance, or Step to advance one event at a time.'));
  box.replaceChildren(...rows);
  box.scrollTop = box.scrollHeight;
}

function renderToasts(state) {
  const recent = state.history.filter((e) => state.step - e.step < TOAST_LIFETIME && ['conflict', 'fail', 'stale', 'handoff', 'assign', 'done'].includes(e.kind));
  // A musician joining and resting is told from what the events recorded for it, not the part's text.
  const said = (e) => {
    if (e.kind === 'assign' && e.to) return `${shortName(e.to)} joins the ensemble`;
    if (e.kind === 'done') {
      const m = state.musicians[e.agent];
      return `${shortName(e.agent)} rests: ${m.measures} measures, ${m.reads} reads, ${m.writes} writes`;
    }
    return e.kind === 'handoff' ? `${e.text.split(': ')[0]}` : e.text;
  };
  const items = recent.map((e) => ({ step: e.step, entry: e }));
  for (const c of toolCalls().finished) {
    if (state.step - (c.to + 1) < TOAST_LIFETIME && secondsBetween(c.from, c.to) >= TOAST_MIN_SECONDS) items.push({ step: c.to + 1, call: c });
  }
  items.sort((a, b) => a.step - b.step);
  const toasts = items.slice(-2).map(({ entry: e, call }) => {
    if (call) {
      return h('div', { class: 'toast ok' }, h('strong', {}, `Orchestra · ${shortName(call.agent)} finished ${call.tool} ${call.target} · ${Math.round(secondsBetween(call.from, call.to))}s`));
    }
    const tone = e.kind === 'conflict' || e.kind === 'fail' ? 'danger' : e.kind === 'coda' || e.kind === 'handoff' || e.kind === 'done' ? 'ok' : '';
    const title = { conflict: 'Conflict', fail: 'Part failed', stale: 'Stale read', coda: 'Coda ready', handoff: 'Handoff', assign: 'Joins', done: 'Rests' }[e.kind];
    return h('div', { class: `toast ${tone}` }, h('strong', {}, `Orchestra · ${title}`), h('div', { class: 'dim' }, said(e)));
  });
  $('toasts').replaceChildren(...toasts);
}

// ---------- Terminal: pane ----------

function measureBar(m) {
  const cells = [];
  for (let i = 0; i < m.total; i += 1) cells.push(h('span', { class: i < m.measures ? 'on' : 'off' }, i < m.measures ? '▮' : '▯'));
  return h('span', { class: 'bar', 'aria-label': `${m.measures} of ${m.total} measures` }, cells, ` ${m.measures}/${m.total}`);
}

function stateLabel(m) {
  return h('span', { class: `state ${m.state}` }, stateGlyph(m), ' ', STATE_WORD[m.state]);
}

// The conductor above the section: the baton beats while anyone plays, a pulse runs down to the
// chairs, each chair says how it stands, and the newest handoff is carried across.
function stage(state) {
  const ms = Object.values(state.musicians).filter((m) => m.id !== 'conductor' && m.state !== 'tacet');
  const count = (s) => ms.filter((m) => m.state === s).length;
  const tally = `${count('playing')} playing${count('waiting') ? ` · ${count('waiting')} waiting` : ''} · ${count('done')} done`;
  const last = player.events[player.cursor - 1];
  const chairs = ms.map((m) => {
    const just = last && last.agent === m.id ? (last.type === 'part.assigned' ? ' just-joined' : last.type === 'part.done' ? ' just-rested' : '') : '';
    const tr = newestTransition(m.id);
    const moving = tr && player.cursor - 1 - tr.index < TRANSITION_EVENTS;
    const word = moving
      ? [h('span', { 'data-chair': tr.kind, 'data-key': `${m.id}@${tr.index}` }, TRANSITION_GLYPHS[tr.kind][0]), ` ${tr.kind}`]
      : CHAIR_WORD[m.state];
    return h('span', { class: `chair ${m.state}${just}` }, who(m.id, shortName(m.id)), ' ', stateGlyph(m),
      h('span', { class: SECTION_CLASS[m.section] }, meterOf(m.id)), h('span', { class: 'dim' }, ' ', word));
  });
  let cue = null;
  for (let i = player.cursor - 1; i >= 0; i -= 1) {
    const e = player.events[i];
    if (e.type === 'part.assigned' && e.by === 'conductor') {
      if (player.cursor - 1 - i < CUE_EVENTS) cue = e.agent;
      break;
    }
  }
  const ho = state.lastHandoff && state.step - state.lastHandoff.step <= HANDOFF_WINDOW ? state.lastHandoff : null;
  return h('div', { class: 'stage' },
    h('div', { class: 'stage-head' }, h('span', { class: 'c-podium', 'data-baton': '' }, '𝄐'), ' ', who('conductor', 'Conductor'), h('span', { class: 'dim' }, `  ${tally}`),
      cue ? h('span', { class: 'dim cue' }, `  cue → ${shortName(cue)}`) : null),
    h('div', { class: 'pulse c-podium', 'data-pulse': String(Math.min(48, 6 + ms.length * 9)) }, ''),
    ms.length ? h('div', { class: 'chairs' }, chairs) : h('div', { class: 'dim' }, 'No musician has a part yet.'),
    ho ? h('div', { class: 'handoff-line' }, who(ho.from, shortName(ho.from)), ' ', h('span', { class: 'c-podium', 'data-travel': '14' }, ''), ' ',
      who(ho.to, shortName(ho.to)), h('span', { class: 'dim' }, `  ${ho.path} v${ho.v}`)) : null);
}

// The newest events in words, newest first.
function ticker() {
  const items = player.events.slice(0, player.cursor).map((e, i) => ({ seq: i + 1, text: eventWords(e) })).filter((x) => x.text).slice(-RECENT_SHOWN).reverse();
  if (!items.length) return null;
  return h('div', { class: 'ticker' }, h('div', {}, h('strong', {}, 'Recent')),
    ...items.map((x, i) => h('div', { class: i ? 'dim' : 'row-newest' }, h('span', { class: 'seq' }, `${String(x.seq).padStart(4)} `), x.text)));
}

function ensembleTab(state) {
  const { finished } = toolCalls();
  const seats = Object.values(state.musicians).map((m) => {
    const sel = view.selected.type === 'musician' && view.selected.id === m.id;
    const lastDone = m.tool ? null : [...finished].reverse().find((c) => c.agent === m.id);
    const activity = m.tool
      ? `${m.tool.tool} ${m.tool.target}${elapsedOf(m) ? ` · ${elapsedOf(m)}` : ''}`
      : m.id === 'conductor' ? 'Coordinating the ensemble' : m.part;
    return h('div', { class: `seat${sel ? ' selected' : ''}`, onclick: () => select('musician', m.id), role: 'button', tabindex: '0' },
      h('div', { class: 'seat-head' }, who(m.id, m.name), stateLabel(m)),
      h('div', { class: 'seat-sub' }, activity),
      lastDone ? h('div', { class: 'seat-sub dim last-call' }, `last: ${lastDone.tool} ${lastDone.target} · ${Math.round(secondsBetween(lastDone.from, lastDone.to))}s`) : null,
      m.total ? h('div', {}, measureBar(m), m.flags.includes('stale') ? h('span', { class: 'state waiting' }, '  ⚠ stale read') : null) : null);
  });
  return [stage(state), ...seats, ticker()].filter(Boolean);
}

function laneGlyph(event, agentId, historyAtStep) {
  if (historyAtStep.some((x) => x.kind === 'conflict') && event.type === 'artifact.write' && event.agent === agentId) return ['‼', 'state failed'];
  if (historyAtStep.some((x) => x.kind === 'conflict') && event.type === 'artifact.write') {
    const c = historyAtStep.find((x) => x.kind === 'conflict');
    if (c && c.text.includes(MUSICIANS.find((m) => m.id === agentId).name)) return ['‼', 'state failed'];
  }
  if (historyAtStep.some((x) => x.kind === 'stale' && x.agent === agentId)) return ['⚠', 'state waiting'];
  switch (event.type) {
    case 'tool.call': return event.agent === agentId ? ['·', 'state tacet'] : null;
    case 'artifact.read': return event.agent === agentId ? ['○', ''] : null;
    case 'artifact.write': return event.agent === agentId ? ['●', ''] : null;
    case 'measure': return event.agent === agentId ? ['|', 'state done'] : null;
    case 'part.assigned': return event.agent === agentId ? ['◆', ''] : (agentId === 'conductor' ? ['◆', ''] : null);
    case 'part.done': return event.agent === agentId ? ['✓', 'state playing'] : null;
    case 'part.failed': return event.agent === agentId ? ['✕', 'state failed'] : null;
    case 'handoff':
      if (event.from === agentId) return ['→', ''];
      if (event.to === agentId) return ['←', ''];
      return null;
    case 'decision.required':
    case 'conflict.resolved':
      return agentId === 'conductor' ? ['?', 'state waiting'] : null;
    case 'session.start':
    case 'coda':
      return agentId === 'conductor' ? ['𝄐', ''] : null;
    default: return null;
  }
}

function scoreTab(state) {
  const end = player.cursor;
  const start = Math.max(0, end - SCORE_WINDOW);
  const rows = [];
  let ruler = '';
  for (let i = start; i < end; i += 1) ruler += (i + 1) % 10 === 0 ? '┼' : '─';
  rows.push(h('div', { class: 'lane-name' }, 'event'), h('div', { class: 'ruler' }, ruler || ' '));
  for (const m of MUSICIANS) {
    const cells = [];
    for (let i = start; i < end; i += 1) {
      const event = player.events[i];
      const historyAtStep = state.history.filter((x) => x.step === i + 1);
      const g = laneGlyph(event, m.id, historyAtStep);
      // A rest on the staff line, with a bar line every BAR_EVENTS events.
      cells.push(g ? h('span', { class: g[1] || SECTION_CLASS[m.section] }, g[0]) : h('span', { class: 'rest' }, (i + 1) % BAR_EVENTS === 0 ? '┊' : '─'));
    }
    // The playhead pulses at the end of a playing musician's staff.
    // A held note beside an open tool call: one ━ per whole second since it opened, 8 characters at most.
    const open = toolCalls().open[m.id];
    if (state.musicians[m.id].tool && open) {
      const bars = Math.max(0, Math.min(SUSTAIN_MAX - 1, Math.floor(secondsBetween(open.index, end))));
      cells.push(h('span', { class: `sustain ${SECTION_CLASS[m.section]}` }, `♪${'━'.repeat(bars)}`));
    }
    if (state.musicians[m.id].state === 'playing') cells.push(h('span', { class: SECTION_CLASS[m.section], 'data-playhead': '' }, '│'));
    rows.push(h('div', { class: 'lane-name' }, who(m.id, m.name.replace('First ', ''))), h('div', { class: 'lane' }, cells));
  }
  return [
    h('p', { class: 'pane-title' }, `bar ${Math.floor(end / BAR_EVENTS) + 1}`, h('span', { 'data-beat': '' }, live() ? `, beat ${(motion.frame % 4) + 1}` : ''),
      ` · The score: one staff per musician, newest event on the right (events ${start + 1}–${end}).`),
    h('div', { class: 'score' }, rows),
    h('div', { class: 'legend' }, '─ rest   ┊ bar line   │┃ playhead   ♪━ held note\n○ read   ● write   → handoff out   ← handoff in\n| measure done   ◆ assigned   ✓ part done\n✕ failed   ‼ conflict   ⚠ stale read   ? asks you'),
  ];
}

function artifactsTab(state) {
  const arts = Object.values(state.artifacts).sort((a, b) => lastTouch(b) - lastTouch(a));
  if (arts.length === 0) return [h('p', { class: 'pane-title' }, 'No artifacts touched yet.')];
  return [
    h('p', { class: 'pane-title' }, `${arts.length} artifacts touched · newest activity first`),
    ...arts.map((a) => {
      const sel = view.selected.type === 'artifact' && view.selected.id === a.path;
      const v = a.versions.length;
      const authors = authorRuns(a.versions);
      const readers = [...new Set(a.reads.map((r) => r.agent))];
      return h('div', { class: `art${sel ? ' selected' : ''}`, onclick: () => select('artifact', a.path), role: 'button', tabindex: '0' },
        h('div', { class: 'seat-head' }, h('span', {}, a.path), h('span', { class: `badge ${a.status}` }, a.status === 'ok' ? (v ? `v${v}` : 'read') : a.status)),
        h('div', { class: 'seat-sub' }, v ? `written by ${authors.join(' → ')}` : 'read only, unchanged', readers.length ? ` · read by ${readers.length}` : ''));
    }),
  ];
}

// "Viola → Trumpet → Conductor", with repeat writes collapsed to "Flute ×2".
function authorRuns(versions) {
  const runs = [];
  for (const v of versions) {
    const last = runs[runs.length - 1];
    if (last && last.agent === v.agent) last.count += 1;
    else runs.push({ agent: v.agent, count: 1 });
  }
  return runs.map((r) => `${nameOf(r.agent).replace('First ', '')}${r.count > 1 ? ` ×${r.count}` : ''}`);
}

function lastTouch(a) {
  const steps = [...a.versions.map((v) => v.step), ...a.reads.map((r) => r.step)];
  return steps.length ? Math.max(...steps) : 0;
}

function codaTab(state) {
  const c = state.coda;
  if (!c) return [h('p', { class: 'pane-title' }, 'The coda appears when every part is done.')];
  return [
    h('p', { class: 'pane-title' }, 'Combined result'),
    h('div', {}, outcomeLine(state)),
    h('p', { class: 'pane-title', style: 'margin-top:10px' }, 'Who contributed what'),
    ...c.contributions.map((x) => h('div', { class: 'seat', onclick: () => select('musician', x.id) },
      h('div', { class: 'seat-head' }, who(x.id, x.name), h('span', { class: 'seat-sub' }, `+${x.added} −${x.removed}`)),
      h('div', { class: 'seat-sub' }, x.artifacts.join(', ')))),
    h('p', { class: 'pane-title', style: 'margin-top:10px' }, 'Incidents and how they ended'),
    ...c.conflicts.map((x) => h('div', { class: 'seat', onclick: () => select('artifact', x.path) }, h('span', { class: 'state failed' }, '‼ conflict '), x.path, h('div', { class: 'seat-sub' }, x.resolution))),
    ...c.failures.map((x) => h('div', { class: 'seat', onclick: () => select('artifact', x.path) }, h('span', { class: 'state failed' }, '✕ failure '), x.path, h('div', { class: 'seat-sub' }, failureText(state, x)))),
    ...c.stale.map((x) => h('div', { class: 'seat', onclick: () => select('artifact', x.path) }, h('span', { class: 'state waiting' }, '⚠ stale read '), x.path, h('div', { class: 'seat-sub' }, staleText(x)))),
    h('div', { style: 'margin-top:12px' }, h('button', { type: 'button', class: 'pane-action', onclick: replayWithNewChoice }, '↺ Replay with a different conflict choice')),
  ];
}

function renderPane(state) {
  const tabs = [['ensemble', 'Ensemble'], ['score', 'Score'], ['artifacts', 'Artifacts']];
  if (state.coda) tabs.push(['coda', 'Coda']);
  if (!tabs.some(([id]) => id === view.tab)) view.tab = 'ensemble';
  $('pane-tabs').replaceChildren(...tabs.map(([id, label]) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': String(view.tab === id),
    onclick: () => { view.tab = id; view.tabWasPicked = true; render(); },
  }, label)));
  const body = { ensemble: ensembleTab, score: scoreTab, artifacts: artifactsTab, coda: codaTab }[view.tab](state);
  $('pane-body').replaceChildren(...body);
}

// ---------- Terminal: spinner, band, prompt, status ----------

function renderSpinner(state) {
  const playing = Object.values(state.musicians).filter((m) => m.id !== 'conductor' && m.state === 'playing');
  let text = '';
  if (state.coda) text = '';
  else if (atUndecidedQuestion()) text = '‖ Conductor is waiting for your decision';
  else if (player.cursor > 0) {
    // Who is playing what, on which file, for how long: the first two, then a count.
    const shown = playing.slice(0, 2).map((m) => `${shortName(m.id)}${m.tool ? ` ${m.tool.tool} ${baseName(m.tool.target)}${elapsedOf(m) ? ` · ${elapsedOf(m)}` : ''}` : ''}`);
    const more = playing.length > 2 ? ` +${playing.length - 2}` : '';
    text = `✻ Conducting… ${playing.length} playing${shown.length ? `: ${shown.join(' · ')}` : ''}${more}`;
  }
  $('spinner').textContent = text;
}

function renderBand(state) {
  const chips = Object.values(state.musicians).filter((m) => m.id !== 'conductor').map((m) => {
    const extra = m.tool ? ` ${m.tool.tool}` : '';
    return h('span', { class: 'chip', onclick: () => select('musician', m.id), title: `${m.name}: ${STATE_WORD[m.state]}` },
      who(m.id, m.name.replace('First ', '')), ' ', stateGlyph(m), h('span', { class: SECTION_CLASS[m.section] }, meterOf(m.id)), h('span', { class: 'dim' }, ` ${m.measures}/${m.total}${extra}`));
  });
  $('band').replaceChildren(h('span', { class: 'c-podium baton', 'data-baton': '' }, '𝄐'), h('span', { class: 'dim' }, ' Orchestra '), ...chips);
}

function renderPromptArea(state) {
  const area = $('prompt-area');
  const last = player.events[player.cursor - 1];
  if (last && last.type === 'decision.required' && player.choice) {
    area.replaceChildren(h('div', { class: 'question answered' },
      h('p', {}, who('conductor', 'Conductor'), ' asked how to resolve ', fileLink(last.path), '. You answered:'),
      h('div', { class: 'opts' }, last.options.map((o, i) => h('button', { type: 'button', disabled: true, 'aria-pressed': String(o.id === player.choice) },
        `${i + 1}. ${o.label}${o.id === player.choice ? '  ✓ chosen' : ''}`)))));
    return;
  }
  if (atUndecidedQuestion()) {
    const d = state.decision;
    const conflict = state.conflicts.find((c) => !c.resolved);
    area.replaceChildren(h('div', { class: 'question site', 'data-site': 'Question dialog · AskUserQuestion, restylable via ui.render' },
      h('p', {}, who('conductor', 'Conductor'), ' asks: Viola and Trumpet both changed ', fileLink(d.path), '. Which version should the ensemble keep?'),
      conflict ? h('p', { class: 'dim' }, `Trumpet wrote v${conflict.versions[1]} starting from v${conflict.base}, so Viola's v${conflict.versions[0]} would be lost.`) : null,
      h('div', { class: 'opts' }, d.options.map((o, i) => h('button', { type: 'button', 'data-choice': o.id, onclick: () => choose(o.id) },
        `${i + 1}. ${o.label}`, h('div', { class: 'detail' }, o.detail))))));
    return;
  }
  area.replaceChildren(h('div', { class: 'prompt-line' }, '> ', state.coda ? 'Ask a follow-up, or /orchestra replay' : ''));
}

function renderStatus(state) {
  const ms = Object.values(state.musicians).filter((m) => m.id !== 'conductor');
  const count = (s) => ms.filter((m) => m.state === s).length;
  const openConflicts = state.conflicts.filter((c) => !c.resolved).length;
  const changed = Object.values(state.artifacts).filter((a) => a.versions.length).length;
  const parts = [
    `Orchestra · event ${player.cursor}`,
    `${count('playing')} playing`,
    `${count('waiting')} waiting`,
    `${count('done')} done`,
    openConflicts ? `${openConflicts} conflict` : null,
    state.failures.some((f) => !f.recovered) ? '1 failed' : null,
    `${changed} artifacts changed`,
  ].filter(Boolean);
  $('statusline').textContent = parts.join('  ·  ');
}

// ---------- Inspector (page chrome) ----------

function musicianInspector(state, id) {
  const m = state.musicians[id];
  const reads = Object.entries(m.lastRead);
  const written = Object.values(state.artifacts).filter((a) => a.versions.some((v) => v.agent === id));
  const recent = state.history.filter((e) => e.agent === id || e.to === id).slice(-5);
  return [
    h('p', {}, h('span', { class: 'swatch', style: `background: var(${SECTION_VAR[m.section]})` }), h('strong', {}, m.name), ' · ', m.role),
    h('dl', { class: 'kv' },
      h('dt', {}, 'State'), h('dd', {}, STATE_WORD[m.state], m.flags.includes('stale') ? h('span', { class: 'tag warn' }, 'stale read') : null),
      m.part ? [h('dt', {}, 'Part'), h('dd', {}, m.part)] : null,
      m.total ? [h('dt', {}, 'Progress'), h('dd', {}, `${m.measures} of ${m.total} measures`)] : null,
      h('dt', {}, 'Now'), h('dd', {}, m.tool ? `${m.tool.tool} ${m.tool.target}` : 'No tool running'),
      h('dt', {}, 'Data'), h('dd', {}, `${m.reads} reads, ${m.writes} writes, +${m.added} −${m.removed} lines`)),
    h('h4', {}, 'Versions it has seen (read or wrote)'),
    reads.length ? h('ul', { class: 'vlist' }, reads.map(([p, v]) => {
      const cur = state.artifacts[p].versions.length;
      return h('li', {}, h('a', { href: '#', onclick: (e) => { e.preventDefault(); select('artifact', p); } }, p), h('span', { class: 'vmeta' }, ` · v${v}`), v < cur ? h('span', { class: 'tag warn' }, `now v${cur}`) : null);
    })) : h('p', { class: 'hint' }, 'Nothing read yet.'),
    h('h4', {}, 'Wrote'),
    written.length ? h('ul', { class: 'vlist' }, written.map((a) => h('li', {}, h('a', { href: '#', onclick: (e) => { e.preventDefault(); select('artifact', a.path); } }, a.path),
      h('span', { class: 'vmeta' }, ` · ${a.versions.filter((v) => v.agent === id).map((v) => `v${v.v}`).join(', ')}`)))) : h('p', { class: 'hint' }, 'Nothing written yet.'),
    h('h4', {}, 'Recent activity'),
    recent.length ? h('ul', { class: 'vlist' }, recent.map((e) => h('li', {}, h('span', { class: 'vmeta' }, `#${e.step} `), e.text))) : h('p', { class: 'hint' }, 'Not active yet.'),
  ];
}

function artifactInspector(state, path) {
  const a = state.artifacts[path];
  if (!a) return [h('p', { class: 'hint' }, `${path} has not been touched at this point in the timeline.`)];
  const tag = a.status === 'conflict' ? h('span', { class: 'tag danger' }, 'conflict') : a.status === 'stale' ? h('span', { class: 'tag warn' }, 'stale readers') : h('span', { class: 'tag ok' }, 'consistent');
  const handoffs = state.handoffs.filter((x) => x.path === path);
  const conflicts = state.conflicts.filter((c) => c.path === path);
  return [
    h('p', {}, h('span', { class: 'path' }, path), tag),
    h('p', { class: 'hint' }, a.origin === 'created' ? 'Created during this performance.' : 'Existed in the repository before the performance (version 0).'),
    h('h4', {}, 'Versions'),
    a.versions.length ? h('ul', { class: 'vlist' }, a.versions.map((v) => h('li', {},
      h('strong', {}, `v${v.v}`), ' by ', nameOf(v.agent), h('span', { class: 'vmeta' }, ` · from v${v.base} · +${v.added} −${v.removed} · ${v.hash}`),
      v.base < v.v - 1 ? h('span', { class: 'tag danger' }, `skipped v${v.v - 1}`) : null,
      h('div', {}, v.summary)))) : h('p', { class: 'hint' }, 'Read but never changed.'),
    h('h4', {}, 'Reads'),
    a.reads.length ? h('ul', { class: 'vlist' }, a.reads.map((r) => h('li', {}, nameOf(r.agent), h('span', { class: 'vmeta' }, ` read v${r.v} at event ${r.step}`)))) : h('p', { class: 'hint' }, 'No reads recorded.'),
    handoffs.length ? [h('h4', {}, 'Handoffs carrying it'), h('ul', { class: 'vlist' }, handoffs.map((x) => h('li', {}, `${nameOf(x.from)} → ${nameOf(x.to)} (v${x.v}): ${x.note}`)))] : null,
    conflicts.length ? [h('h4', {}, 'Conflicts'), h('ul', { class: 'vlist' }, conflicts.map((c) => h('li', {},
      `${nameOf(c.agents[1])} wrote from v${c.base} over ${nameOf(c.agents[0])}'s v${c.versions[0]}. `,
      c.resolved ? h('span', { class: 'tag ok' }, 'resolved') : h('span', { class: 'tag danger' }, 'open'), c.resolution ? h('div', {}, c.resolution) : null)))] : null,
  ];
}

function renderInspector(state) {
  const { type, id } = view.selected;
  const nodes = type === 'musician' ? musicianInspector(state, id) : artifactInspector(state, id);
  $('inspector').replaceChildren(...nodes.flat().filter(Boolean));
  const last = player.events[player.cursor - 1];
  $('ledger').textContent = last ? JSON.stringify({ seq: player.cursor, ...last }) : 'No events yet.';
}

// ---------- Transport ----------

function renderTransport() {
  $('btn-play').textContent = player.playing ? 'Pause' : (player.cursor >= player.events.length && player.choice ? 'Play again' : 'Play');
  $('btn-back').disabled = player.cursor === 0;
  $('btn-fwd').disabled = player.cursor >= player.events.length || atUndecidedQuestion();
  const scrub = $('scrub');
  scrub.max = String(player.events.length);
  scrub.value = String(player.cursor);
  $('scrub-readout').textContent = `Event ${player.cursor} of ${player.events.length}${player.choice ? '' : ' · continues after your decision'}`;
}

function render() {
  const state = fold(player.events, player.cursor);
  renderTranscript(state);
  renderToasts(state);
  renderPane(state);
  renderSpinner(state);
  renderBand(state);
  renderPromptArea(state);
  renderStatus(state);
  renderInspector(state);
  renderTransport();
  syncMotion(state);
  renderMotion();
}

// ---------- Wiring ----------

$('task').replaceChildren(h('strong', {}, 'Task given to the conductor: '), TASK);
$('btn-play').addEventListener('click', () => (player.playing ? pause() : play()));
$('btn-fwd').addEventListener('click', () => { pause(); stepForward(); });
$('btn-back').addEventListener('click', () => { pause(); player.cursor = Math.max(0, player.cursor - 1); render(); });
$('btn-restart').addEventListener('click', () => { pause(); player.cursor = 0; render(); });
$('speed').addEventListener('change', (e) => { player.speed = Number(e.target.value); schedule(); });
$('scrub').addEventListener('input', (e) => {
  const target = Number(e.target.value);
  pause();
  player.cursor = target;
  render();
});
$('show-sites').addEventListener('change', (e) => { $('terminal').classList.toggle('show-sites', e.target.checked); });
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag)) return;
  if (e.key === ' ' && tag !== 'BUTTON') { e.preventDefault(); player.playing ? pause() : play(); }
  if (e.key === 'ArrowRight') { pause(); stepForward(); }
  if (e.key === 'ArrowLeft') { pause(); player.cursor = Math.max(0, player.cursor - 1); render(); }
});

render();
