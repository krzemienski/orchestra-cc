// Colour tokens (PRD §6.4). Orchestra never paints a background: every element sits flat on the
// terminal's own background, and only the foreground is coloured. Each token has a value for a dark
// terminal, measured against pure black, and one for a light terminal, measured against white; both
// stay at least 4.5:1 (MIN_CONTRAST). A 256-colour terminal gets the xterm-256 cube entry nearest the
// dark value, so what it draws is what was measured; anything less gets an ANSI name, which the terminal
// maps through its own palette.

export const MIN_CONTRAST = 4.5
export const BLACK = '#000000'
export const WHITE = '#ffffff'

export const TOKENS = {
  conductor: { dark: '#c3a6ff', light: '#6b3fd4', ansi: 'cyan' },
  violin: { dark: '#7eaaff', light: '#2457d6', ansi: 'blue' },
  trumpet: { dark: '#f2b950', light: '#8a5a00', ansi: 'yellow' },
  flute: { dark: '#5fd3a8', light: '#1d7a4f', ansi: 'green' },
  timpani: { dark: '#ff8c6e', light: '#b4441e', ansi: 'red' },
  cello: { dark: '#d78cff', light: '#8a2fb4', ansi: 'magenta' },
  guest: { dark: '#a8b3c7', light: '#4f5b70', ansi: 'white' },
  ok: { dark: '#6bdc9a', light: '#1d7a4f', ansi: 'green' },
  warn: { dark: '#ffc65c', light: '#8a5a00', ansi: 'yellow' },
  danger: { dark: '#ff6b6b', light: '#b42318', ansi: 'red' },
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

// 'dark', 'light', '256' or 'ansi'.
export function setColorMode(next) {
  mode = next
}

export const colorMode = () => mode

export function paint(token) {
  const key = TOKENS[token] ? token : 'guest'
  if (mode === '256') return XTERM[key]?.send ?? TOKENS[key].dark
  const t = TOKENS[key]
  return t[mode] || t.dark
}

// Claude Code's theme names include "dark", "light", "light-daltonized", "dark-ansi" and so on.
// A theme that asks for ANSI, or a terminal with neither truecolor nor 256 colours, gets ANSI names.
export function modeFor(theme, colorterm, term = '') {
  const name = String(theme || '')
  if (name.includes('ansi')) return 'ansi'
  if (!/truecolor|24bit/i.test(String(colorterm || ''))) return /256/.test(String(term || '')) && !name.startsWith('light') ? '256' : 'ansi'
  return name.startsWith('light') ? 'light' : 'dark'
}
