#!/bin/bash
# The plan §6 gates that need no live session, each into its own step file of the active
# e2e-evidence run. Usage: .planning/live/static-gates.sh <run-dir>
# Exit codes are recorded, not acted on: a gate's verdict is read from its file.
set -u
RUN="$1"
cd "$(dirname "$0")/../.." || exit 1
CFG=$(mktemp -d "${TMPDIR:-/tmp}/orchestra-gates-XXXX")
export CLAUDE_CONFIG_DIR="$CFG"
n=0
gate() {
  n=$((n + 1))
  local slug="$1"; shift
  local f
  f="$RUN/step-$(printf '%02d' "$n")-$slug.txt"
  { echo "\$ $*"; echo; bash -c "$*" 2>&1; local rc=$?; echo; echo "exit=$rc"; } > "$f"
  printf '%-34s exit=%s\n' "$slug" "$(tail -1 "$f" | cut -d= -f2)"
}
gate unit 'claude plugin test ./plugin'
gate types 'npx -y -p typescript tsc -p plugin --noEmit'
gate validate 'claude plugin validate ./plugin'
gate contract-render 'node .planning/contracts/render-proof.mjs'
gate contract-palette 'node .planning/contracts/palette-proof.mjs'
gate removed-surface-code "grep -rnE 'voice|narrat|elevenlabs|clock\.every|clock\.after|setInterval|\\\$\.process|browser' plugin/hooks plugin/agents plugin/.claude-plugin/plugin.json plugin/tests README.md docs/guide.md"
gate p021-userconfig "node -e 'const k=Object.keys(require(\"./plugin/.claude-plugin/plugin.json\").userConfig||{});console.log(\"userConfig keys:\",JSON.stringify(k));const bad=k.filter(x=>/voice|narrat|eleven/i.test(x));console.log(\"matching voice|narrat|eleven:\",JSON.stringify(bad));process.exit(bad.length?1:0)'"
gate p021-docs "grep -niE 'no (voice|sound|speech)|no narrat|no network|no browser|nothing in orchestra (makes sound|speaks)' README.md docs/guide.md"
gate p15-stale-text "grep -inE 'voice|narrat|elevenlabs|motion|baton|frame timer|browser|asset-handout' README.md docs/guide.md docs/orchestra-prd.md docs/orchestra-spec.md docs/verification.md; echo; test ! -e docs/asset-handout.md && echo 'docs/asset-handout.md: absent' || echo 'docs/asset-handout.md: PRESENT'; grep -rln 'asset-handout' README.md docs plugin || echo 'no file links to asset-handout'"
rm -rf "$CFG"
