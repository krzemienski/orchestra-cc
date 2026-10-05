// Colour tokens (PRD §6.4). Each has a dark-theme value, a light-theme value and an
// ANSI name used when the terminal does not advertise truecolor. Every token is at least
// 4.5:1 against #0c1018 (dark) and #ffffff (light).

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

let mode = 'dark'

// 'dark', 'light' or 'ansi'.
export function setColorMode(next) {
  mode = next
}

export const colorMode = () => mode

export function paint(token) {
  const t = TOKENS[token] || TOKENS.guest
  return t[mode] || t.dark
}

// Claude Code's theme names include "dark", "light", "light-daltonized", "dark-ansi" and so on.
export function modeFor(theme, colorterm) {
  const name = String(theme || '')
  if (name.includes('ansi') || !/truecolor|24bit/i.test(String(colorterm || ''))) return 'ansi'
  return name.startsWith('light') ? 'light' : 'dark'
}
