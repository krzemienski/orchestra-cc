#!/bin/bash
# Saves a tmux pane every <interval> seconds, <count> times, plain (fNNNN.txt) and with colour
# codes (fNNNN.ansi), with the wall-clock time of each frame in <dir>/times.txt.
# Usage: .planning/live/frames.sh <session> <dir> <interval> <count>
S="$1"; D="$2"; I="$3"; N="$4"
mkdir -p "$D"
for ((k = 1; k <= N; k++)); do
  id=$(printf '%04d' "$k")
  t0=$(python3 -c 'import time; print(f"{time.time():.3f}")')
  tmux capture-pane -p -t "$S" > "$D/f$id.txt" 2>/dev/null || { echo "pane gone at frame $k"; break; }
  tmux capture-pane -p -e -t "$S" > "$D/f$id.ansi" 2>/dev/null || break
  echo "f$id $t0" >> "$D/times.txt"
  sleep "$I"
done
echo "frames=$(ls "$D"/f*.txt 2>/dev/null | wc -l | tr -d ' ')"
