# Scheduling the background jobs

Fourteen jobs: eleven keep outside data up to date, a twelfth builds the
silver layer from it, a thirteenth exports the reach map's files from gold,
and a fourteenth checks the website links in it. Each
runs when it's due, and every run, scheduled or by hand, is recorded in
`OPS.JOB_RUN`. They are listed in the order a tick runs them
(`JOB_ORDER` in `server/jobSchedule.js`):

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
| `travel-monthly` (travel times: Network Rail timetable, OpenStreetMap, rail GTFS, the four r5py runs; refuses to start with under 5.5 GB free, so it waits for the dev servers to be stopped) | 30 days | 32 days |
| `transform-silver` (the silver layer: dbt build, tests, swap in) | 24 hours | 26 hours |
| `reach-export` (the reach map's files: export from gold, check, copy to the school leavers site; not on a clock: runs after a new `travel-monthly` run has been built into gold) | at least 24 hours, and only after a new travel run | 34 days |
| `website-links` (a seventh of the website links, so each weekly) | 24 hours | 26 hours |

The `official-*` jobs (`scripts/fetch-official.js`) fetch only what's new
into the data folder, then load it as `DATA_LOAD_USER`. Each fetch and each
load step is independent: one failing doesn't stop the others. If some fail
the run is recorded as **partial** (not a success, so it is tried again no
sooner than an hour later; steps already loaded are skipped), with the failed
fetches and steps, and why, in its `OPS.JOB_RUN` summary and error; if every
load step fails it is **failed**. Managers' Data updates tile shows "Partly
done: some steps failed". The loads (`npm run load:data`
steps 14, 15 and 26 for Nomis; 17 to 19 for the DfE API; 24 for
Stat-Xplore, which needs `STATXPLORE_API_KEY` in `server/.env`; 25 and 29
for ONS; 27 for Ofqual; 34 to 36 and 38 for the monthly ones, police.uk
taking only the months after its previous archive). Population joins
the Nomis job (step 33). The postcode directory, Ofgem's price caps,
the fuel poverty tables and Graduate Outcomes are fetched by hand: their
addresses change with each release. The load adds its own `load-*` row to
`OPS.JOB_RUN`. The Ofqual register is fetched 10,000 records a page (the API's
most; 6 calls for the whole register) and checked before it is saved: the
records fetched must equal the API's own count, every QAN (or recognition
number) must be distinct, the fields must be the same as in the last file, and
the register must not have shrunk by over 5%. A failed check fails the run and
saves nothing; a real change to the fields or size is accepted by running once
with `OFQUAL_ACCEPT_CHANGES=1 npm run fetch:official -- ofqual`. By hand: `npm run fetch:official -- nomis` (or `api`,
`statxplore`, `ons`, `ofqual`).

`transform-silver` (`scripts/transform-silver.js`) runs last in a tick
and is in the `official` lock group, so it never runs while an official
load is open. It checks every model is described and tagged (`check:dbt`),
builds every model with dbt into `SILVER_STAGING` and `GOLD_STAGING` (gold from the new silver) and runs its tests,
checks the tags read back from Snowflake (`check:tags --staging`), and
only then swaps each table into `SILVER` or `GOLD` (its data, comments,
tags and gold's reader grants move with it; a new model is cloned in once). If any check or test fails, the
run is recorded as failed and `SILVER` is left as it was; `SILVER_STAGING`
keeps the failed build to look at. Its `OPS.JOB_RUN` summary has the
models built and the tests passed, failed and warned (from dbt's
`run_results.json`), the tables swapped, and on failure which step and
which tests. After the swap it attaches Snowflake's data metric functions to 18 key
tables: seven in `SILVER` (postcode, lsoa, local_authority, vacancy,
vacancy_soc, provider, college_16_18: row counts, duplicates, nulls, and
the vacancies' freshness) and eleven in `GOLD` (the institution, university
course, vacancy, job outlook, area, postcode, provider benchmark and travel
time tables: row counts, duplicate keys, nulls; on the four tables of
figures our own `SHARED_DB.GOVERNANCE.SHOWN_BASE_UNDER_10`, the rows
showing a figure based on fewer than 10 people, expected 0; on travel_time
the longest times, expected at most the 90-minute cap). The travel times
themselves are computed by hand (`scripts/travel/README.md`, decision 19);
the job only rebuilds their silver and gold from the latest run. Each has an
expectation; the list and thresholds are in `scripts/data-quality.js`. It waits for one measurement of each (about 5
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

`reach-export` (`scripts/reach/job.js`, gap 3 of docs/data-journey.md)
follows `travel-monthly`: it is due only when a travel run has finished since
the last export and `transform-silver` has then succeeded (so gold has the new
times), at least 24 hours after the last export, and never the first time
before both have run. It is in the `official` lock group, so it never reads
gold while a silver swap is running. It runs `scripts/reach/export.js`, then
`check-export.js` (any failed check fails the job, and nothing is copied), then
`npm run reach:data` in the school leavers site (`~/school-leavers-app`, or
`SCHOOL_LEAVERS_APP_DIR`) given this checkout's `data/reach/export`. If that
folder isn't there the copy is skipped: the run still succeeds, but the skip
is logged and recorded in its `OPS.JOB_RUN` summary (`copied: false`,
`skipped: why`). A run takes about 15 seconds. By hand: `node scripts/reach/job.js`
(`--record` to record it as a manual run). Don't run `reach:data` yourself
after a failed export: the export folder may be half written.

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

## Checked by hand every year

Some data has no feed to fetch, so a person re-checks it once a year and the
file is loaded again (the load skips what hasn't changed):

- **The four colleges' campuses** (reach map): each year, from October, open
  each college's own campus pages (the addresses are in
  `scripts/reach/college-campuses.csv`, every row has its page), update the
  file for campuses opened, closed or moved, change `date_checked`, then
  `npm run load:data -- 47`, `node scripts/reach/check-campuses.js`, and
  `node scripts/reach/export.js`. Barnsley College, DN Colleges Group, RNN
  Group and The Sheffield College. Last checked 21 October 2026; next by
  October 2027. A campus whose page prints no address stays in the file with
  an empty postcode and a note, and the reach page says "Some campuses aren't
  shown yet". The table's REFRESH tag is `yearly` (`sql/load_14`).
  Two terminated Barnsley postcodes to look at each time: **S70 2AN** (the
  college's own Church Street page still prints it; the ONS directory has
  ended it but still places it, and `check-campuses.js` accepts it with a
  note) and **S70 2YW** (the postcode GIAS holds for Barnsley College; also
  ended, 233 m from a campus). If the college corrects its page to a live
  postcode, update the file; if GIAS corrects its own record, nothing to do.
- **Supertram's fares** (fares phase C): each January, when fares change,
  check each ticket in `scripts/fares/supertram-fares.csv` on Travel South
  Yorkshire's Supertram pages (its site stops scripts with a captcha, so use a
  browser), update the price and `date_checked`, then
  `node scripts/fares/check-supertram.js --ready`, `npm run load:data -- 49`.
  Also look at the bus fares' product map (`dbt/seeds/bus_fare_product_map.csv`)
  and `bus_fare_unmapped` after each BODS refresh (fares data is refreshed
  quarterly: `node scripts/fares/fetch_bus_fares.py --fetch`, then
  `npm run load:data -- 48`).
- **Term dates** for the travel-times day (`scripts/travel/travelDay.js`):
  each summer, add the next year's terms and the timetable change dates.

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
fourteen; the travel times alone take about an hour, so allow well over
an hour in all). To follow it:

- **WSL terminal** (Ubuntu): watch the jobs log. Each job writes a line as
  it starts and another as it ends, with the job's own lines in between
  (the vacancy import writes nothing until it has finished, about 6
  minutes):

      tail -f ~/my-react-app/logs/jobs/$(date +%F).log

  For example `2026-10-07T15:03:13+01:00 vacancies-full (schedule): started`
  and later `2026-10-07T15:09:30+01:00 vacancies-full (schedule):
  succeeded`. The tick has finished once every job that started has ended
  (`website-links` is last). Press Ctrl+C to stop watching.
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
