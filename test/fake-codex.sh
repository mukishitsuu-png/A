#!/bin/sh
# fake `codex exec ... --cd DIR --output-last-message FILE PROMPT`
while [ $# -gt 1 ]; do
  case "$1" in
    --cd) DIR="$2"; shift ;;
    --output-last-message) OUT="$2"; shift ;;
  esac
  shift
done
echo "$1" > "$DIR/codex.txt"
echo "done: $1" > "$OUT"
