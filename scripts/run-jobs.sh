#!/bin/bash
# Starts one scheduler tick (npm run jobs) from outside a terminal: on
# Alan's laptop the Windows scheduled task runs this through wsl.exe (see
# docs/scheduling.md). A non-interactive shell doesn't load nvm, so this
# does, if it's there; on a host with node on the PATH it isn't needed.
# Output that isn't already in logs/jobs/ (a crash before logging starts)
# goes to logs/jobs/tick-output.log.
#
#   scripts/run-jobs.sh           one tick
#   scripts/run-jobs.sh --check   just say which node it would use
cd "$(dirname "$0")/.." || exit 1
if ! command -v node >/dev/null 2>&1 && [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  . "$NVM_DIR/nvm.sh"
fi
mkdir -p logs/jobs
if [ "$1" = "--check" ]; then
  echo "$(date -Iseconds) run-jobs.sh --check: $(command -v node) $(node -v) in $(pwd)" | tee -a logs/jobs/tick-output.log
  exit 0
fi
exec node scripts/jobs.js >> logs/jobs/tick-output.log 2>&1
