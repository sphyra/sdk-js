#!/bin/sh
# Fails if any commit in the given range carries an AI co-author trailer.
# Usage: no-ai-trailers.sh [<git-range>]   (no range = check HEAD only)
set -u

PATTERN='co-authored-by:.*(anthropic|cursor|claude|noreply@anthropic)'
GENERATED='generated with \[?claude'

if [ "$#" -gt 0 ] && [ -n "${1:-}" ]; then
  commits=$(git rev-list "$1")
else
  commits=$(git rev-list -1 HEAD)
fi

status=0
count=0
for c in $commits; do
  count=$((count + 1))
  body=$(git log -1 --format='%B' "$c")
  if printf '%s' "$body" | grep -iqE "$PATTERN"; then
    echo "AI co-author trailer in $(git log -1 --format='%h %s' "$c")" >&2
    status=1
  fi
  if printf '%s' "$body" | grep -iqE "$GENERATED"; then
    echo "AI 'Generated with' line in $(git log -1 --format='%h %s' "$c")" >&2
    status=1
  fi
done

if [ "$status" -eq 0 ]; then
  echo "no-ai-trailers: clean ($count commit(s) checked)"
fi
exit $status
