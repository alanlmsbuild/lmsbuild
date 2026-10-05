#!/bin/bash
# Runs every browser test against the test servers, which must be running
# (test/start-test-servers.sh). The 4g-1 test learners are put back to
# continuing first (restore-4g1.mjs); the 4g-1 test then leaves its
# outcomes in place for checking in FIS until the test reset.
cd "$(dirname "$0")/../.."
OUT=${1:-$HOME/.cache/rarebit-test/screenshots}
failed=0
for t in step3 step4a step4b step4c step4d step4e step4f1 step4f2 step4g1; do
  [ "$t" = step4g1 ] && node test/browser/restore-4g1.mjs > /dev/null 2>&1
  r=$(timeout 900 node test/browser/$t.mjs "$OUT" 2>&1 | grep -v injected)
  last=$(echo "$r" | tail -1)
  echo "== $t: $last"
  echo "$r" | grep -E "^FAIL|^\s+at " | head -5
  [ "$last" = "all passed" ] || failed=1
done
exit $failed
