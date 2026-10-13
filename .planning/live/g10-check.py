#!/usr/bin/env python3
"""G10: on every frame, does each playing musician's row show the tool and target of the call
the ledger says it is in? Usage: g10-check.py <ledger.jsonl> <names.json> <frames-dir>

The expected call is computed here from the raw ledger, not by the plugin's code: a musician's
open call at time t is its newest tool.call with ts <= t whose result (the oldest open call of the
same agent, tool and target is closed first) has not arrived by t. A row may lag by one redraw:
Claude Code redraws at most 10 times a second, so the open call 100 ms before the frame's time
is also accepted.

Rows are found by text: the band (rows under "𝄐 Orchestra" in the transcript column) and the
Ensemble's "└ " line under a musician's name row (right of the docked pane's border).
"""
import json
import re
import sys
from pathlib import Path

ledger, names_path, frames = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
events = [json.loads(l) for l in ledger.read_text().splitlines() if l.strip()]
names = json.loads(names_path.read_text())          # agent key -> instance name
by_name = {v: k for k, v in names.items()}


def open_call(agent, t):
    pending = {}
    for e in events:
        if e['ts'] > t * 1000 or e.get('agent') != agent or e['type'] not in ('tool.call', 'tool.result'):
            continue
        k = (e['tool'], e.get('target', ''))
        if e['type'] == 'tool.call':
            pending.setdefault(k, []).append(e)
        elif pending.get(k):
            pending[k].pop(0)
    calls = sorted((c for v in pending.values() for c in v), key=lambda c: c['seq'])
    return calls[-1] if calls else None


def matches(call, word, text):
    if call is None:
        return word in ('', 'held', 'failed', 'done')
    target = call.get('target', '')
    shown = text.split(' · ')[0].replace(' from v', '\0').split('\0')[0].rstrip('…').strip()
    return word == call['tool'] and (target.startswith(shown) if shown else not target)


times = {}
for line in (frames / 'times.txt').read_text().splitlines():
    f, t = line.split()
    times[f] = float(t)
order = sorted(times)
names_by_len = sorted(by_name, key=len, reverse=True)
REDRAW_S = 0.1
checked = bad = 0
per = {'band': 0, 'ensemble': 0, 'agent row': 0}
report = []
for i, f in enumerate(order):
    lines = (frames / f'{f}.txt').read_text().split('\n')
    t, prev = times[f], times[f] - REDRAW_S
    border = None
    for l in lines:
        m = re.search(r'│', l)
        if m and m.start() > 60:
            border = m.start()
            break
    left = [l[:border] if border else l for l in lines]
    right = [l[border + 1:] if border and len(l) > border else '' for l in lines]
    seen = []
    # Band rows.
    for y, l in enumerate(left):
        if not l.startswith('𝄐 Orchestra'):
            continue
        rows = []
        for r in left[y + 1:]:
            if not r.strip() or r.lstrip().startswith(('─', '❯', '…')):
                break
            name = next((n for n in names_by_len if r[2:].startswith(n + ' ') or r[2:].rstrip() == n), None)
            if name:
                rows.append((r, name))
        cols = max((len(n) for _, n in rows), default=0)
        for r, name in rows:
            if r[0] != '♪':
                continue
            word = r[2 + cols + 2: 2 + cols + 2 + 7].strip()
            text = r[2 + cols + 2 + 7:].rstrip()
            seen.append(('band', name, word, text))
    # Ensemble line 2.
    for y, l in enumerate(right):
        m = re.match(r'^♪ (\S+(?: \d+)?)  ', l)
        if not m or m.group(1) not in by_name or y + 1 >= len(right):
            continue
        nxt = right[y + 1].strip()
        if not nxt.startswith('└ '):
            continue
        body = nxt[2:]
        word, _, text = body.partition(' ')
        call_now = open_call(by_name[m.group(1)], t)
        if call_now is None and not any(word == c for c in ('Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob')):
            word, text = '', body
        seen.append(('ensemble', m.group(1), word, text))
    # Agent rows: "<Name> · <Role>" over "  └ <glyph> <tool> <target> · <elapsed>".
    TOOLS = ('Read', 'Edit', 'Write', 'Bash', 'Grep', 'Glob', 'MultiEdit', 'NotebookEdit')
    for y, l in enumerate(left):
        m = re.match(r'^(\S+(?: \d+)?) · [A-Z][a-z]+\s*$', l)
        if not m or m.group(1) not in by_name or y + 1 >= len(left):
            continue
        nxt = left[y + 1].strip()
        if not nxt.startswith('└ ♪ '):
            continue
        body = nxt[4:]
        word, _, text = body.partition(' ')
        if word not in TOOLS:
            word, text = '', body
        seen.append(('agent row', m.group(1), word, text))
    for where, name, word, text in seen:
        agent = by_name[name]
        # Every state the ledger held in the redraw before the frame: at its start and after each
        # event inside it.
        moments = [prev] + [e['ts'] / 1000 for e in events if prev < e['ts'] / 1000 <= t] + [t]
        now = open_call(agent, t)
        ok = any(matches(open_call(agent, m), word, text) for m in moments)
        checked += 1
        per[where] += 1
        if not ok:
            bad += 1
            want = f"{now['tool']} {now.get('target', '')}" if now else '(no open call)'
            report.append(f'{f} {where:8} {name:10} shows [{word}] [{text[:60]}]; ledger at frame time: {want}')
for r in report[:40]:
    print('MISMATCH', r)
print(f'frames {len(order)}; rows checked {checked} (band {per["band"]}, Ensemble {per["ensemble"]}, Agent rows {per["agent row"]}); matching the ledger (within one redraw) {checked - bad}; mismatches {bad}')
sys.exit(1 if bad else 0)
