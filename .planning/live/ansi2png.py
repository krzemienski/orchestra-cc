#!/usr/bin/env python3
"""Renders a tmux `capture-pane -e` capture (ANSI SGR codes) to SVG, then PNG with rsvg-convert.

Usage: python3 ansi2png.py <capture.ansi> <out.png> [--crop COL0:COL1:ROW0:ROW1] [--bg #000000]

Every cell is drawn at its column and row in a monospace font, with the foreground and background
colours the capture carries (xterm 16, 256 and 24-bit codes, bold and dim). Cells with no background
code are drawn on --bg, the terminal's own background. Nothing is invented: the picture is the
capture's characters and colours.
"""
import html
import re
import subprocess
import sys
import unicodedata

CELL_W, CELL_H, FONT = 8.4, 17, 14
FAMILY = "JetBrainsMono Nerd Font Mono, JetBrains Mono, Menlo, monospace"
BASE16 = ['#000000', '#cd3131', '#0dbc79', '#e5e510', '#2472c8', '#bc3fbc', '#11a8cd', '#e5e5e5',
          '#666666', '#f14c4c', '#23d18b', '#f5f543', '#3b8eea', '#d670d6', '#29b8db', '#ffffff']
DEFAULT_FG = '#d4d4d4'


def xterm(n):
    if n < 16:
        return BASE16[n]
    if n < 232:
        n -= 16
        lv = [0, 95, 135, 175, 215, 255]
        return '#%02x%02x%02x' % (lv[n // 36], lv[(n // 6) % 6], lv[n % 6])
    g = 8 + (n - 232) * 10
    return '#%02x%02x%02x' % (g, g, g)


def parse(line):
    sgr = re.compile(r'\x1b\[([0-9;:]*)m')
    st = {'fg': None, 'bg': None, 'bold': False, 'dim': False}
    cells, pos = [], 0
    for m in sgr.finditer(line):
        for ch in line[pos:m.start()]:
            cells.append((ch, dict(st)))
        codes = [c for c in re.split('[;:]', m.group(1) or '0')]
        i = 0
        while i < len(codes):
            c = codes[i] or '0'
            v = int(c) if c.isdigit() else -1
            if v == 0:
                st = {'fg': None, 'bg': None, 'bold': False, 'dim': False}
            elif v == 1:
                st['bold'] = True
            elif v == 2:
                st['dim'] = True
            elif v == 22:
                st['bold'] = st['dim'] = False
            elif 30 <= v <= 37:
                st['fg'] = BASE16[v - 30]
            elif 90 <= v <= 97:
                st['fg'] = BASE16[v - 90 + 8]
            elif 40 <= v <= 47:
                st['bg'] = BASE16[v - 40]
            elif 100 <= v <= 107:
                st['bg'] = BASE16[v - 100 + 8]
            elif v == 39:
                st['fg'] = None
            elif v == 49:
                st['bg'] = None
            elif v in (38, 48) and i + 1 < len(codes):
                key = 'fg' if v == 38 else 'bg'
                if codes[i + 1] == '5' and i + 2 < len(codes):
                    st[key] = xterm(int(codes[i + 2]))
                    i += 2
                elif codes[i + 1] == '2' and i + 4 < len(codes):
                    st[key] = '#%02x%02x%02x' % tuple(int(x) for x in codes[i + 2:i + 5])
                    i += 4
            i += 1
        pos = m.end()
    for ch in line[pos:]:
        cells.append((ch, dict(st)))
    # Wide characters take two columns, as the terminal draws them.
    out = []
    for ch, s in cells:
        out.append((ch, s))
        if unicodedata.east_asian_width(ch) in ('W', 'F'):
            out.append(('', s))
    return out


def main():
    src, dst = sys.argv[1], sys.argv[2]
    crop, bg = None, '#000000'
    args = sys.argv[3:]
    for k, v in zip(args[::2], args[1::2]):
        if k == '--crop':
            crop = [int(x) for x in v.split(':')]
        elif k == '--bg':
            bg = v
    rows = open(src, encoding='utf-8', errors='replace').read().rstrip('\n').split('\n')
    grid = [parse(r) for r in rows]
    c0, c1, r0, r1 = crop or (0, max(len(g) for g in grid), 0, len(grid))
    grid = [g[c0:c1] for g in grid[r0:r1]]
    w, h = (c1 - c0) * CELL_W, (r1 - r0) * CELL_H
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0f}" height="{h:.0f}" viewBox="0 0 {w:.1f} {h}">',
             f'<rect width="100%" height="100%" fill="{bg}"/>',
             f'<g font-family="{FAMILY}" font-size="{FONT}" xml:space="preserve">']
    for y, row in enumerate(grid):
        for x, (ch, s) in enumerate(row):
            if s['bg']:
                parts.append(f'<rect x="{x * CELL_W:.1f}" y="{y * CELL_H}" width="{CELL_W + 0.3:.1f}" height="{CELL_H}" fill="{s["bg"]}"/>')
        for x, (ch, s) in enumerate(row):
            if not ch.strip():
                continue
            fg = s['fg'] or DEFAULT_FG
            attrs = f'fill="{fg}"' + (' font-weight="bold"' if s['bold'] else '') + (' fill-opacity="0.55"' if s['dim'] else '')
            parts.append(f'<text x="{x * CELL_W:.1f}" y="{y * CELL_H + 13}" {attrs}>{html.escape(ch)}</text>')
    parts.append('</g></svg>')
    svg = dst.rsplit('.', 1)[0] + '.svg'
    open(svg, 'w', encoding='utf-8').write('\n'.join(parts))
    subprocess.run(['rsvg-convert', '-z', '2', '-o', dst, svg], check=True)
    print(f'{dst} {int(w * 2)}x{int(h * 2)} from {src} cols {c0}-{c1} rows {r0}-{r1}')


if __name__ == '__main__':
    main()
