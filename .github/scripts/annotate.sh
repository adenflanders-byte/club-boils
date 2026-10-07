#!/usr/bin/env bash
# Turn a log file into GitHub annotations (readable through the API).
# Usage: annotate.sh "<title>" <file>
title="$1"; file="$2"
[ -f "$file" ] || { echo "::warning title=$title::no log produced"; exit 0; }
# Failures and errors first, as error annotations.
grep -E "FAIL |not ok|error|Error|✖|Failed to compile|Type error" "$file" | grep -v "0 errors" | head -n 60 > /tmp/annot_err || true
if [ -s /tmp/annot_err ]; then
  split -l 15 /tmp/annot_err /tmp/annot_err_part_
  for p in /tmp/annot_err_part_*; do
    echo "::error title=$title::$(sed 's/%/%25/g' "$p" | tr '\n' '|' | cut -c1-3500)"
  done
  rm -f /tmp/annot_err_part_*
fi
# A short summary as a notice.
echo "::notice title=$title::$(tail -n 12 "$file" | sed 's/%/%25/g' | tr '\n' '|' | cut -c1-3500)"
