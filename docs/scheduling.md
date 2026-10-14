# Scheduling the background jobs

Ten jobs keep outside data up to date, an eleventh builds the silver
layer from it, and a twelfth checks the website links in it. Each runs when it's due, and every run, scheduled or by
hand, is recorded in `OPS.JOB_RUN`:

| Job | Runs when the last success is older than | Overdue after |
|---|---|---|
| `vacancies-full` (every advert) | 24 hours | 26 hours |
| `vacancies-new` (adverts from the last day) | 2 hours (a full run counts) | 3 hours |
| `companies-refresh` (Companies House) | 24 hours | 26 hours |
| `skills` (Skills England) | 7 days | 8 days |
| `official-nomis` (claimant count, ASHE pay by area) | 7 days | 8 days |
| `official-api` (DfE: key stage 4, destinations, apprenticeship headlines) | 7 days | 8 days |
| `official-statxplore` (DWP: Universal Credit, Work and Health Programme) | 7 days | 8 days |
| `official-ons` (ONS: online job adverts, VACS02) | 7 days | 8 days |
| `official-ofqual` (Ofqual register of qualifications) | 7 days | 8 days |
| `official-monthly` (police.uk, provider register, NaPTAN, listed buildings, Wikidata places) | 30 days | 32 days |
| `transform-silver` (the silver layer: dbt build, tests, swap in) | 24 hours | 26 hours |
| `website-links` (a seventh of the website links, so each weekly) | 24 hours | 26 hours |

The `official-*` jobs (`scripts/fetch-official.js`) fetch only what's new
into the data folder, then load it as `DATA_LOAD_USER` (`npm run load:data`
steps 14, 15 and 26 for Nomis; 17 to 19 for the DfE API; 24 for
Stat-Xplore, which needs `STATXPLORE_API_KEY` in `server/.env`; 25 and 29
for ONS; 27 for Ofqual; 34 to 36 and 38 for the monthly ones, police.uk
taking only the months after its previous archive). Population joins
the Nomis job (step 33). The postcode directory, Ofgem's price caps,
the fuel poverty tables and Graduate Outcomes are fetched by hand: their
addresses change with each release. The load adds its own `load-*` row to
`OPS.JOB_RUN`. By hand: `npm run fetch:official -- nomis` (or `api`,
`statxplore`, `ons`, `ofqual`).

`transform-silver` (`scripts/transform-silver.js`) runs last in a tick
and is in the `official` lock group, so it never runs while an official
load is open. It checks every model is described and tagged (`check:dbt`),
builds every model with dbt into `SILVER_STAGING` and runs its tests,
checks the tags read back from Snowflake (`check:tags --staging`), and
only then swaps each table into `SILVER` (its data, comments and tags move
with it; a new model is cloned in once). If any check or test fails, the
run is recorded as failed and `SILVER` is left as it was; `SILVER_STAGING`
keeps the failed build to look at. Its `OPS.JOB_RUN` summary has the
models built and the tests passed, failed and warned (from dbt's
`run_results.json`), the tables swapped, and on failure which step and
which tests. After the swap it attaches Snowflake's data metric functions to seven key
tables (postcode, lsoa, local_authority, vacancy, vacancy_soc, provider,
college_16_18: row counts, duplicates, nulls, and the vacancies'
freshness, each with an expectation; the list and thresholds are in
`scripts/data-quality.js`). It waits for one measurement of each (about 5
minutes), then sets them to run only when a table changes, so each day's
tables are measured once, complete and tested. The results show in each
table's Data Quality tab in Snowsight and in the run's summary
(`dataQuality`: measured, met, missed with values). A missed expectation
is a warning, not a failure; a metric not measured within 15 minutes fails
the run. `npm run check:dmf` checks they are all attached. It runs as
`TRANSFORM_USER` on `TRANSFORM_WH`, from the dbt
venv in the checkout (`.venv-dbt`, made as `dbt/requirements.txt` says;
not committed, so a new checkout needs it made). By hand:
`npm run transform:silver` (recorded, as manual) or `npm run silver:build`
(the same, not recorded).

`website-links` (`scripts/check-website-links.js`, decision 26) runs after
the silver build, in its own `links` lock group. Each day it checks the
links whose slice is today's (0 to 6, from a hash of the URL; about 6,600
of the 46,000 links of open schools and colleges, providers and university
courses), so each link is checked once a week. It is polite: one request
at a time per site, 10 seconds apart, 64 sites at once (a day's slice
is about 22 hours of per-site time, mostly university course pages, so
about 25 to 30 minutes); HEAD, then a GET
that reads only the headers; 15 seconds per request; at most 5 redirects;
a 429 stops that site for the run; a link checked in the last 20 hours
is skipped, so a run that stopped half way resumes. Results go to `SHARED_DB.EXT.WEBSITE_LINK`
(latest state) and `WEBSITE_LINK_CHECK` (every check), as `DATA_LOAD_USER`.
A 404 or 410 is broken; a server error, timeout or unknown host is
unreachable; 401, 403 and 429 are blocked (a site refusing robots: not a
failure); a site that fails on https but works on http is http-only. Two
failures in a row hide a link (silver's `website_link_hidden`) until a
check passes; silver shows an http-only site's working address. By hand:
`npm run links:check` (today's slice; `-- --record` to record it,
`-- --slice 3`, `-- --limit 50`). Where it has got to: `npm run check:links`.

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
  (`official-ofqual` is last). Press Ctrl+C to stop watching.
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

## Old logs

Each tick clears old files in `~/my-react-app/logs/jobs/` before it checks
what's due (`clearOldLogs` in `scripts/jobs.js`):

- daily logs (`YYYY-MM-DD.log`) more than 90 days old are deleted;
- once `tick-output.log` passes 1 MB, it's renamed `tick-output.old.log`
  (replacing the one before) and the next tick starts a new one.

It logs a line when it clears something. `state.json`, `tick.lock` and
anything else there are left alone. Manual runs log to
`logs/import-vacancies/`, `logs/import-skills/` and
`logs/refresh-companies/`, which aren't cleared.

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
