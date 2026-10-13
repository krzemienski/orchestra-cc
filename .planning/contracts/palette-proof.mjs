import assert from 'node:assert/strict'
import { ground, paint, setColorMode, modeFor, contrast, rendererIndex, TOKENS, XTERM, MIN_CONTRAST, BLACK, WHITE } from '../../plugin/hooks/palette.js'

// Claude Code theme keys: under an ANSI theme the engine draws each as a 16-colour code.
const ANSI = ['planMode', 'suggestion', 'warning', 'success', 'claude', 'merged', 'inactive', 'error']

for (const [k, t] of Object.entries(TOKENS)) {
  assert(contrast(t.dark, BLACK) >= MIN_CONTRAST, `${k} dark contrast`)
  assert(contrast(t.light, WHITE) >= MIN_CONTRAST, `${k} light contrast`)
  const x = XTERM[k]
  assert.equal(rendererIndex(x.send), x.index, `${k} renderer index`)
  assert(contrast(x.shown, BLACK) >= MIN_CONTRAST, `${k} 256 shown contrast`)
}

const cases = [
  [['dark', 'truecolor', 'xterm-256color'], 'dark'],
  [['dark', '', 'xterm-256color'], '256'],
  [['dark', '', 'xterm'], 'ansi'],
  [['dark-ansi', 'truecolor', 'xterm-256color'], 'ansi'],
  [['light', 'truecolor', ''], 'light'],
  [['light', '', 'xterm-256color'], 'ansi'],
  [[undefined, '24bit', ''], 'unknown'],
  [['auto', 'truecolor', 'xterm-256color'], 'unknown'],
]
for (const [args, want] of cases) assert.equal(modeFor(...args), want, `modeFor(${JSON.stringify(args)})`)

console.log('token      mode   value    contrast')
for (const mode of ['dark', 'light', '256', 'ansi', 'unknown']) {
  setColorMode(mode)
  for (const k of Object.keys(TOKENS)) {
    const v = paint(k)
    let c = '-'
    if (mode === 'ansi' || mode === 'unknown') assert(ANSI.includes(v), `${k} ${mode} ${v}`)
    else {
      assert.match(v, /^#[0-9a-f]{6}$/, `${k} ${mode} ${v}`)
      const x = contrast(v, mode === 'light' ? WHITE : BLACK)
      assert(x >= MIN_CONTRAST, `${k} ${mode} contrast`)
      c = x.toFixed(2)
    }
    console.log(`${k.padEnd(10)} ${mode.padEnd(6)} ${v.padEnd(8)} ${c}`)
  }
}
setColorMode('dark')
// The pane ground is the background each mode's contrast was measured on; ANSI and an unknown theme
// leave Claude Code's.
const GROUNDS = { dark: BLACK, '256': BLACK, light: WHITE, ansi: undefined, unknown: undefined }
for (const [m, want] of Object.entries(GROUNDS)) {
  setColorMode(m)
  assert.equal(ground(), want, `ground in ${m} mode`)
  console.log(`ground ${m.padEnd(7)} ${want ?? '(nothing painted)'}`)
}
setColorMode('dark')
console.log('palette proof: OK')
