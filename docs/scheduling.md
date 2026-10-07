# Scheduling the background jobs

Four jobs keep outside data up to date. Each runs when it's due, and every
run, scheduled or by hand, is recorded in `OPS.JOB_RUN`:

| Job | Runs when the last success is older than | Overdue after |
|---|---|---|
| `vacancies-full` (every advert) | 24 hours | 26 hours |
| `vacancies-new` (adverts from the last day) | 2 hours (a full run counts) | 3 hours |
| `companies-refresh` (Companies House) | 24 hours | 26 hours |
| `skills` (Skills England) | 7 days | 8 days |

`npm run jobs` is one **tick**. It reads `logs/jobs/state.json` and runs
whatever is due, one job at a time. If nothing is due, it exits without
connecting to Snowflake. After sleep or shutdown, the next tick runs each
overdue job once. A failed job is tried again no sooner than an hour later.
The rules are in `server/jobSchedule.js`.

On the laptop, a Windows scheduled task starts a tick every 15 minutes, at
log on and on unlocking. It runs hidden (`wscript.exe` with
`scripts/windows/run-jobs-hidden.js`, which starts `wsl.exe` with no window)
and on battery as well as mains power. It runs the code in
`~/my-react-app`, whatever branch is checked out there.

## Setting it up

1. **PowerShell** (Start menu → type `PowerShell` → Windows PowerShell; not
   as administrator). Check what it will create:

       powershell -ExecutionPolicy Bypass -File \\wsl.localhost\Ubuntu\home\alanlmsbuild\my-react-app\scripts\windows\install-jobs-task.ps1 -DryRun

2. **PowerShell**, the same window. Create it:

       powershell -ExecutionPolicy Bypass -File \\wsl.localhost\Ubuntu\home\alanlmsbuild\my-react-app\scripts\windows\install-jobs-task.ps1

   It prints `Created 'Rarebit jobs' and started the first tick`, and the
   next run time after that. (The repeating trigger counts from the moment
   the task is created, so without that start the first tick would come 15
   minutes later. To start a tick by hand at any time, in **PowerShell**:
   `Start-ScheduledTask -TaskName 'Rarebit jobs'`.)

3. **Task Scheduler** (Start menu → type `Task Scheduler`). In Task
   Scheduler Library, find **Rarebit jobs**:
   - **Triggers** tab: three triggers (One time, repeating every 15 minutes
     indefinitely; At log on; On workstation unlock).
   - **Conditions** tab: "Start the task only if the computer is on AC
     power" is *unticked*; "Start only if the following network
     connection is available: Any connection" is ticked.
   - **Settings** tab: "Run task as soon as possible after a scheduled
     start is missed" is ticked; "If the task is already running: Do not
     start a new instance".

## Seeing that a tick has finished

The first tick after setting up runs every job that's overdue (up to all
four, about 30 minutes). To follow it:

- **WSL terminal** (Ubuntu): watch the jobs log. Each job writes a line as
  it starts and another as it ends, with the job's own lines in between
  (the vacancy import writes nothing until it has finished, about 6
  minutes):

      tail -f ~/my-react-app/logs/jobs/$(date +%F).log

  For example `2026-10-07T15:03:13+01:00 vacancies-full (schedule): started`
  and later `2026-10-07T15:09:30+01:00 vacancies-full (schedule):
  succeeded`. The tick has finished once every job that started has ended
  (`skills` is last). Press Ctrl+C to stop watching.
- **WSL terminal**: `ls ~/my-react-app/logs/jobs/tick.lock`. The lock file
  exists only while a tick is running. "No such file" means it has finished.
- **Task Scheduler**: Rarebit jobs shows Status **Running** during the tick
  and **Ready** after (press F5 to refresh). **Last Run Result** is
  `The operation completed successfully. (0x0)` if every job that ran
  succeeded, or `(0x1)` if one failed.
- **WSL terminal**, in `~/my-react-app`: `npm run check:jobs` lists every
  job's last run and result, and says if any is overdue.

## Is a tick running, and where has it got to?

Each of these is one step further along:

1. **Task Scheduler**: Rarebit jobs shows Status **Running** (F5 to
   refresh). Windows has started it.
2. **WSL terminal**: `ps -eo etime,args | grep "[j]obs.js"` shows
   `node scripts/jobs.js` and how long it has been running. wscript,
   `wsl.exe`, `run-jobs.sh` and nvm all worked.
3. **WSL terminal**: `ls ~/my-react-app/logs/jobs/` shows `tick.lock` (a
   tick holds the lock) and `state.json`. If `state.json` was missing, the
   tick has connected to Snowflake to fill it in.
4. **WSL terminal**: the jobs log above shows which job has started and
   not yet ended.
5. **WSL terminal**, in `~/my-react-app`: `npm run check:jobs` shows that
   job's last result as `running`.

If the tick isn't running but nothing appears in the log, look at
`~/my-react-app/logs/jobs/tick-output.log` (anything the tick printed
before it could log, such as a crash at start-up).

## Seeing that a job has stopped running

- **WSL terminal**: `npm run check:jobs` lists the overdue jobs and exits
  with an error if any job is overdue.
- **The app** (scheduling step 4): managers see each job's last run and
  whether it's overdue on their home page, worked out from `OPS.JOB_RUN`,
  so it shows even when the scheduler itself has stopped.

## Pausing, changing and removing

- **Task Scheduler**: right-click Rarebit jobs → **Disable** to pause it,
  **Enable** to start again. Overdue jobs catch up on the next tick.
- **PowerShell**: run the setup command again to replace the task (for
  example after moving the repo: add `-Launcher /new/path/scripts/run-jobs.sh`).
- **PowerShell**: to remove it:

      Unregister-ScheduledTask -TaskName 'Rarebit jobs' -Confirm:$false

## Moving to an always-on host

Only the trigger changes. On a Linux host, a systemd timer or cron entry
runs `scripts/run-jobs.sh` every 15 minutes. The jobs, the state file
(`JOBS_STATE_FILE` to put it elsewhere), `OPS.JOB_RUN` and `npm run
check:jobs` stay as they are. See docs/before-real-data.md.
