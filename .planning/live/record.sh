#!/bin/bash
# Records a tmux pane every 200 ms, plain and with colour codes, until the pane goes away or
# <seconds> pass. Usage: .planning/live/record.sh <session> <frames-dir> <seconds>
S="$1"; F="$2"; LIMIT="${3:-240}"
mkdir -p "$F"
start=$(date +%s)
n=0
while [ $(( $(date +%s) - start )) -lt "$LIMIT" ]; do
  n=$((n + 1))
  id=$(printf '%04d' "$n")
  tmux capture-pane -p -t "$S" > "$F/f$id.txt" 2>/dev/null || break
  tmux capture-pane -p -e -t "$S" > "$F/f$id.ansi" 2>/dev/null || break
  sleep 0.2
done
echo "frames=$n seconds=$(( $(date +%s) - start ))"
