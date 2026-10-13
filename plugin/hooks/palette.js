// Colour tokens (PRD §6.4). The band, status line, spinner and toasts paint no background: they sit
// on the terminal's own, and only the foreground is coloured. The pane is painted `ground()`, the
// background the tokens were measured on, over Claude Code's grey pane fill. Each token has a value for
// a dark terminal, measured against pure black, and one for a light terminal, measured against white;
// both stay at least 4.5:1 (MIN_CONTRAST). A 256-colour terminal gets the xterm-256 cube entry nearest
// the dark value, so what it draws is what was measured. Anything less, an ANSI theme, or a theme
// Orchestra cannot read or name gets a Claude Code theme key (`ansi` below): the engine draws each
// key in the person's own theme, which under an ANSI theme is a 16-colour code the terminal maps
// through its palette (a colour name would be drawn as 24-bit). The keys chosen measure at least
// 4.5:1 on the dark and light presets' `inverseText` (black, white), the ground an unknown theme's
// docked pane is painted (see ground()).

export const MIN_CONTRAST = 4.5
export const BLACK = '#000000'
export const WHITE = '#ffffff'

export const TOKENS = {
  conductor: { dark: '#c3a6ff', light: '#6b3fd4', ansi: 'planMode' },
  violin: { dark: '#7eaaff', light: '#2457d6', ansi: 'remember' },
  trumpet: { dark: '#f2b950', light: '#8a5a00', ansi: 'warning' },
  flute: { dark: '#5fd3a8', light: '#1d7a4f', ansi: 'success' },
  timpani: { dark: '#ff8c6e', light: '#b4441e', ansi: 'diffRemovedWord' },
  cello: { dark: '#d78cff', light: '#8a2fb4', ansi: 'merged' },
  guest: { dark: '#a8b3c7', light: '#4f5b70', ansi: 'inactive' },
  ok: { dark: '#6bdc9a', light: '#1d7a4f', ansi: 'success' },
  warn: { dark: '#ffc65c', light: '#8a5a00', ansi: 'warning' },
  danger: { dark: '#ff6b6b', light: '#b42318', ansi: 'error' },
}

/** @param {string} hex @returns {number[]} */
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
/** @param {number[]} c */
const toHex = (c) => `#${c.map((x) => x.toString(16).padStart(2, '0')).join('')}`

// WCAG 2 relative luminance and contrast ratio.
const WEIGHTS = [0.2126, 0.7152, 0.0722]
/** @param {string} hex */
const luminance = (hex) => rgb(hex).reduce((sum, x, i) => {
  const s = x / 255
  return sum + (WEIGHTS[i] ?? 0) * (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4)
}, 0)
/** @param {string} a @param {string} b */
export function contrast(a, b) {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// The xterm-256 colour cube nearest a hex colour. Claude Code's renderer turns a hex into a cube
// index by rounding each channel to sixths (round(v / 51)), not to the cube's own levels, so the
// colour it would pick for the dark value is not the nearest one. `send` is built from k × 51 per
// channel, which that rounding maps to exactly level k; `shown` is what the terminal then draws
// for `index`, and is the colour the contrast is measured on.
const LEVELS = [0, 95, 135, 175, 215, 255]
/** @param {string} hex */
export function xterm256(hex) {
  const k = rgb(hex).map((v) => LEVELS.reduce((best, l, i) => (Math.abs(l - v) < Math.abs((LEVELS[best] ?? 0) - v) ? i : best), 0))
  const [r = 0, g = 0, b = 0] = k
  return { index: 16 + 36 * r + 6 * g + b, shown: toHex(k.map((i) => LEVELS[i] ?? 0)), send: toHex(k.map((i) => i * 51)) }
}
/** The cube index the renderer picks for a hex: what a 256-colour terminal is sent. @param {string} hex */
export const rendererIndex = (hex) => {
  const [r = 0, g = 0, b = 0] = rgb(hex).map((v) => Math.round(v / 51))
  return 16 + 36 * r + 6 * g + b
}

export const XTERM = Object.fromEntries(Object.entries(TOKENS).map(([k, t]) => [k, xterm256(t.dark)]))

let mode = 'dark'

// 'dark', 'light', '256', 'ansi' or 'unknown'.
export function setColorMode(next) {
  mode = next
}

export const colorMode = () => mode

// The pane's ground. Claude Code fills a docked pane with its own grey (xterm 235, `#262626`; the
// theme's composerSidebarBackground, which a mod cannot clear),
// which differs from the terminal's background beside it and lowers every token's contrast. The
// pane body is painted the ground its tokens were measured on instead: black for a dark or
// 256-colour terminal, white for a light one. With ANSI names the terminal maps colours through
// its own palette and no hex is right, so the engine's fill is left alone. With a theme Orchestra
// cannot name (`auto`, a custom theme, a failed read) a docked pane is painted the theme key
// `inverseText`, which Claude Code resolves in the person's own theme: black under a dark one, white
// under a light one, the same ground as above, so its grey fill does not show. An inline pane has
// no fill, so there nothing is painted.
export const THEME_GROUND = 'inverseText'
/** @param {'dock'|'inline'|undefined} placement */
export function ground(placement = 'dock') {
  if (mode === 'ansi') return undefined
  if (mode === 'unknown') return placement === 'dock' ? THEME_GROUND : undefined
  return mode === 'light' ? WHITE : BLACK
}

export function paint(token) {
  const key = TOKENS[token] ? token : 'guest'
  if (mode === '256') return XTERM[key]?.send ?? TOKENS[key].dark
  const t = TOKENS[key]
  return mode === 'ansi' || mode === 'unknown' ? t.ansi : t[mode] || t.dark
}

// Claude Code's theme names include "dark", "light", "light-daltonized", "dark-ansi" and so on.
// A theme that asks for ANSI, or a terminal with neither truecolor nor 256 colours, gets ANSI names.
export function modeFor(theme, colorterm, term = '') {
  const name = String(theme || '')
  if (name.includes('ansi')) return 'ansi'
  if (!name.startsWith('dark') && !name.startsWith('light')) return 'unknown'
  if (!/truecolor|24bit/i.test(String(colorterm || ''))) return /256/.test(String(term || '')) && !name.startsWith('light') ? '256' : 'ansi'
  return name.startsWith('light') ? 'light' : 'dark'
}
