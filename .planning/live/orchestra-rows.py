#!/usr/bin/env python3
"""Finds the rows Orchestra draws in tmux `capture-pane -e` frames (.ansi), by their text, and compares them
across frames (glyphs and per-cell colours), or lists the ones painted with a background.

  orchestra-rows.py same <frames-dir>     every frame's Orchestra rows vs the first; exit 1 if any differ
  orchestra-rows.py ground <frames-dir>   Orchestra cells whose background is not the terminal's own

Orchestra's rows, located by text, never by position:
  band      the line starting "𝄐 Orchestra" (or a baton glyph + " Orchestra") and the rows under it
            up to the prompt rule
  status    the "𝄐 Orchestra · …" row Orchestra draws above Claude Code's question dialog
  agent     Agent-row label lines: "<glyph> <Name> · <Role>" and their "└ " second line
  spinner   the text after the spinner's own words that names musicians ("N playing", "waiting on you")
  pane      a docked pane: every row right of the column where the pane's border sits; a pane
            above the prompt: the rows from its tab bar ("1 Ensemble"… or "Ensemble  Score") to its
            key-hint row ("esc close")
Claude Code's own rows (its spinner word and timer, the prompt, its agent list) are left out,
because they change on their own.
"""
import glob
import json
import os
import re
import sys
import unicodedata

NAMES = r'(Conductor|Violin|Trumpet|Flute|Timpani|Cello)( \d+)?'
AGENT_LABEL = re.compile(r'^\s*[·♪♩♫♬‖✓✕◌‼⏺ ]\s*' + NAMES + r' · ')
BAND = re.compile(r'^\s*[𝄐╲│╱] Orchestra(?!:)')


ESC = re.compile(r'\x1b\[([0-9;:]*)m|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-9;?]*[A-Za-z]')


def sgr(params, st):
    """Applies one SGR parameter list to the pen {fg, bg, bold}; colours kept as their codes."""
    p = [x for x in params.replace(':', ';').split(';')] if params else ['0']
    i = 0
    while i < len(p):
        c = int(p[i] or 0)
        if c == 0:
            st.update(fg=None, bg=None, bold=False)
        elif c == 1:
            st['bold'] = True
        elif c == 22:
            st['bold'] = False
        elif c in (38, 48):
            n = 3 if i + 1 < len(p) and p[i + 1] == '5' else 5
            st['fg' if c == 38 else 'bg'] = ';'.join(p[i:i + n])
            i += n - 1
        elif c == 39:
            st['fg'] = None
        elif c == 49:
            st['bg'] = None
        elif 30 <= c <= 37 or 90 <= c <= 97:
            st['fg'] = str(c)
        elif 40 <= c <= 47 or 100 <= c <= 107:
            st['bg'] = str(c)
        i += 1


def load(path):
    """A tmux `capture-pane -e` frame as a grid of cells {text, foreground, background, bold}."""
    rows = []
    for raw in open(path, encoding='utf-8', errors='replace').read().split('\n'):
        st = {'fg': None, 'bg': None, 'bold': False}
        row, pos = [], 0
        for m in ESC.finditer(raw):
            for ch in raw[pos:m.start()]:
                cell = {'text': ch, 'foreground': st['fg'], 'background': st['bg'], 'attributes': {'bold': st['bold']}}
                row.append(cell)
                if unicodedata.east_asian_width(ch) in 'WF':
                    row.append(None)
            if m.group(1) is not None:
                sgr(m.group(1), st)
            pos = m.end()
        for ch in raw[pos:]:
            row.append({'text': ch, 'foreground': st['fg'], 'background': st['bg'], 'attributes': {'bold': st['bold']}})
            if unicodedata.east_asian_width(ch) in 'WF':
                row.append(None)
        rows.append(row)
    cols = max(len(r) for r in rows)
    grid = [r + [None] * (cols - len(r)) for r in rows]
    return {'cols': cols, 'rows': len(grid), 'background': None}, grid


def text_of(row, x0=0, x1=None):
    return ''.join((c['text'] if c else ' ') for c in row[x0:x1])


def pane_column(grid):
    """The column of a docked pane's left border: a '│' at the same x on most rows."""
    counts = {}
    for row in grid:
        for x, c in enumerate(row):
            if c and c['text'] == '│' and 40 < x < len(row) - 20:
                counts[x] = counts.get(x, 0) + 1
    if not counts:
        return None
    x, n = max(counts.items(), key=lambda kv: kv[1])
    return x if n > len(grid) // 2 else None


def rows_of(_meta, grid):
    """[(kind, y, x0, x1)] for every Orchestra row in one frame."""
    out = []
    px = pane_column(grid)
    right = px + 1 if px is not None else None
    left_end = px
    lines = [text_of(r, 0, left_end) for r in grid]
    for y, t in enumerate(lines):
        if BAND.match(t):
            out.append(('band' if '·' not in t[:16] else 'status', y, 0, left_end))
            for y2 in range(y + 1, len(lines)):
                if lines[y2].lstrip().startswith(('─', '❯', '☐')) or not lines[y2].strip():
                    break
                out.append(('band', y2, 0, left_end))
        elif AGENT_LABEL.match(t):
            out.append(('agent', y, 0, left_end))
            if y + 1 < len(lines) and lines[y + 1].lstrip().startswith('└'):
                out.append(('agent', y + 1, 0, left_end))
        else:
            m = re.search(r'· (\d+ (playing|musicians? playing)|[A-Z][a-z]+( \d+)? .*waiting on you)', t)
            if m and re.match(r'^\s*[✻✽✶✳✢·*]', t):
                out.append(('spinner', y, m.start(), left_end))
    if right is not None:
        out += [('pane', y, right, None) for y in range(len(grid))]
    else:
        start = next((y for y, t in enumerate(lines) if re.search(r'Ensemble.*Score.*Artifacts.*Coda', t)), None)
        if start is not None:
            end = next((y for y in range(start, len(lines)) if 'esc close' in lines[y]), len(lines) - 1)
            out += [('pane', y, 0, None) for y in range(start, end + 1)]
    return out


def cells(grid, y, x0, x1):
    return [(c['text'], json.dumps(c['foreground']), json.dumps(c['background']), c['attributes']['bold'])
            for c in grid[y][x0:x1] if c]


def frames(d):
    return sorted(glob.glob(os.path.join(d, 'f*.ansi')))


def same(d):
    names = frames(d)
    sigs = []
    for f in names:
        meta, g = load(f)
        rows = rows_of(meta, g)
        sigs.append((os.path.basename(f), [(k, text_of(g[y], x0, x1).rstrip(), cells(g, y, x0, x1)) for k, y, x0, x1 in rows]))
    first_name, first = sigs[0]
    print(f'{len(names)} frames; Orchestra rows in {first_name}:')
    for k, t, _ in first:
        if t.strip():
            print(f'  [{k}] {t.strip()[:150]}')
    bad = 0
    for name, sig in sigs[1:]:
        a = [(k, t, c) for k, t, c in first]
        b = [(k, t, c) for k, t, c in sig]
        if a != b:
            bad += 1
            ta = [f'[{k}] {t.strip()}' for k, t, _ in a if t.strip()]
            tb = [f'[{k}] {t.strip()}' for k, t, _ in b if t.strip()]
            changed = [x for x in tb if x not in ta][:3]
            print(f'{name}: differs from {first_name}' + (f'; new text: {[x[:110] for x in changed]}' if changed else '; same text, different colours or attributes'))
    print(f'frames whose Orchestra rows differ from the first: {bad} of {len(names) - 1}')
    return 1 if bad else 0


def ground(d):
    names = frames(d)
    total = 0
    for f in names:
        meta, g = load(f)
        default = json.dumps(meta['background'])
        for k, y, x0, x1 in rows_of(meta, g):
            painted = [c for c in g[y][x0:x1] if c and json.dumps(c['background']) != default]
            if painted:
                total += len(painted)
                print(f'{os.path.basename(f)} [{k}] y={y}: {len(painted)} cells on {painted[0]["background"]}: {text_of(g[y], x0, x1).strip()[:90]}')
    print(f'Orchestra cells painted with a background: {total} across {len(names)} frames')
    return 1 if total else 0


if __name__ == '__main__':
    sys.exit({'same': same, 'ground': ground}[sys.argv[1]](sys.argv[2]))
