// Test: the scheduler (scripts/jobs.js) and job records (scripts/job-run.js),
// scheduling step 2.
//   Part 1  no database: what's due when (a fake clock), catching up once
//           after a gap, retrying no sooner than an hour, the state file,
//           one tick per machine, clearing old logs (in a test folder)
//   Part 2  the database, with fake jobs, in one transaction that's rolled
//           back: a tick with nothing due never connects; a missing state
//           file is filled from SHARED_DB.OPS.JOB_RUN; due jobs run one at a time and
//           are recorded (schedule) like manual runs; a failure isn't
//           retried straight away; a run refused while another is open; a
//           run stopped at its time limit stops the tick. Stops first if a
//           real job is running (its lock would refuse the test's runs).
// Never touches the real state file (logs/jobs/state.json) or real jobs.
//   node test/db/jobs.mjs
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { connect, execute, destroy } from '../../server/db.js'
import { JOB_SCHEDULE } from '../../server/jobSchedule.js'
import { isDue, JobTimeout, readState, recordRun, writeState } from '../../scripts/job-run.js'
import { clearOldLogs, takeLock, tick } from '../../scripts/jobs.js'

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`)
}
const H = 60 * 60 * 1000
const T0 = Date.parse('2026-10-07T02:00:00Z')
const iso = (t) => new Date(t).toISOString()
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '.output', 'jobs-test')
fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(dir, { recursive: true })
const stateFile = (name) => path.join(dir, `${name}.json`)
const ok = (t) => ({ lastSuccessAt: iso(t), lastAttemptAt: iso(t), lastOutcome: 'succeeded' })
const allDone = (t) => ({ jobs: { 'vacancies-full': ok(t), 'vacancies-new': ok(t), 'companies-refresh': ok(t), skills: ok(t) } })
const due = (state, t) => ['vacancies-full', 'vacancies-new', 'companies-refresh', 'skills'].filter((j) => isDue(j, state, t))

// ---------------------------------------------------------------- part 1
console.log('Part 1: what is due when')
{
  check('nothing run yet: everything due, except new adverts (the full run covers them)',
    due({ jobs: {} }, T0).join() === 'vacancies-full,companies-refresh,skills', due({ jobs: {} }, T0).join())
  const s = allDone(T0)
  check('everything just ran: nothing due', due(s, T0 + 60_000).length === 0)
  check('2 hours later: new adverts only', due(s, T0 + 2 * H + 60_000).join() === 'vacancies-new')
  s.jobs['vacancies-full'] = ok(T0 + 24 * H + 60_000)
  check('a full run also counts for new adverts', !isDue('vacancies-new', s, T0 + 24 * H + 2 * 60_000))
  const asleep = allDone(T0)
  check('laptop asleep for 3 days: each job due once (not once per missed run), skills not yet',
    due(asleep, T0 + 72 * H).join() === 'vacancies-full,companies-refresh', due(asleep, T0 + 72 * H).join())
  check('8 days on: skills due too', due(asleep, T0 + 8 * 24 * H).includes('skills'))
  const failed = { jobs: { ...allDone(T0 - 30 * H).jobs } }
  failed.jobs['companies-refresh'] = { ...failed.jobs['companies-refresh'], lastAttemptAt: iso(T0 - 30 * 60_000), lastOutcome: 'failed' }
  check('failed 30 minutes ago: not tried again yet', !isDue('companies-refresh', failed, T0))
  check('  an hour after: tried again', isDue('companies-refresh', failed, T0 + 31 * 60_000))

  const f = stateFile('roundtrip')
  writeState(allDone(T0), f)
  check('state file written and read back', JSON.stringify(readState(f)) === JSON.stringify(allDone(T0)))
  fs.writeFileSync(f, '{ half a fi')
  check('  a damaged state file reads as empty (refilled from SHARED_DB.OPS.JOB_RUN)', JSON.stringify(readState(f)) === '{"jobs":{}}')

  const lock = path.join(dir, 'tick.lock')
  const release = takeLock(lock)
  check('one tick per machine: a second tick finds the lock taken', typeof release === 'function' && takeLock(lock) === null)
  release()
  fs.writeFileSync(lock, '99999999')
  const taken = takeLock(lock)
  check('  a lock left by a process that has gone is taken over', typeof taken === 'function' && fs.readFileSync(lock, 'utf8') === String(process.pid))
  taken()

  // Old logs: a folder like logs/jobs, on 7 October 2026 (UK).
  const logs = path.join(dir, 'logs')
  fs.mkdirSync(logs)
  for (const name of ['2026-07-08.log', '2026-07-09.log', '2026-10-06.log', 'state.json', 'notes.log']) fs.writeFileSync(path.join(logs, name), 'x')
  fs.writeFileSync(path.join(logs, 'tick-output.old.log'), 'the one before')
  fs.writeFileSync(path.join(logs, 'tick-output.log'), 'y'.repeat(1_000_001))
  const cleared = clearOldLogs(logs, { now: new Date('2026-10-07T12:00:00Z') })
  const left = fs.readdirSync(logs).sort().join()
  check('old logs: daily logs over 90 days old removed (8 July), 9 July on kept, nothing else touched',
    cleared.removed.join() === '2026-07-08.log' && left === '2026-07-09.log,2026-10-06.log,notes.log,state.json,tick-output.old.log', left)
  check('  tick-output.log over 1 MB kept once as tick-output.old.log', cleared.rotated && fs.statSync(path.join(logs, 'tick-output.old.log')).size === 1_000_001)
  fs.writeFileSync(path.join(logs, 'tick-output.log'), 'small')
  const again = clearOldLogs(logs, { now: new Date('2026-10-07T12:00:00Z') })
  check('  run again: nothing more to clear', again.removed.length === 0 && !again.rotated)
}

// ---------------------------------------------------------------- part 2
console.log('Part 2: ticks with fake jobs, rolled back')
const c = await connect()
const q = (sql, binds = []) => execute(c, sql, binds)
// Real runs share SHARED_DB.OPS.JOB_RUN, and their locks would refuse this test's runs.
const open = await q(`select JOB, to_varchar(STARTEDAT, 'HH24:MI') as AT from SHARED_DB.OPS.JOB_RUN
  where FINISHEDAT is null and STARTEDAT > dateadd(hour, -3, current_timestamp())`)
if (open.length > 0) {
  console.log(`FAIL a real job is running (${open.map((r) => `${r.JOB} since ${r.AT}`).join(', ')}): run this test when no tick is running`)
  await destroy(c)
  process.exit(1)
}
const created = []
try {
  await q('begin')
  let opens = 0
  const fakeDb = { openConnection: async () => { opens++; return c }, closeConnection: async () => {} }
  const lines = []
  const log = (l) => lines.push(l)
  let running = 0
  let overlapped = false
  const calls = []
  const fake = (job, behave) => async () => {
    if (running++) overlapped = true
    calls.push(job)
    try {
      return await behave()
    } finally {
      running--
    }
  }
  const runners = {
    'vacancies-full': fake('vacancies-full', async () => ({ outcome: 'succeeded', ref: 'TEST-REF', summary: { adverts: 1 } })),
    'vacancies-new': fake('vacancies-new', async () => ({ outcome: 'succeeded' })),
    'companies-refresh': fake('companies-refresh', async () => { throw new Error('TEST Companies House down') }),
    skills: fake('skills', async () => ({ outcome: 'succeeded' })),
  }
  const rowsSince = async (t) => q(`select JOBRUNID, JOB, TRIGGEREDBY, HOST, OUTCOME, JOBRUNREF, ERROR, to_json(SUMMARY) as SUMMARY, FINISHEDAT is not null as FINISHED
    from SHARED_DB.OPS.JOB_RUN where STARTEDAT >= ?::timestamp_ltz order by STARTEDAT, JOB`, [iso(t)])

  // Nothing due: no Snowflake at all.
  const fresh = stateFile('fresh')
  writeState(allDone(T0), fresh)
  const idle = await tick({ stateFile: fresh, now: () => T0 + 60_000, runners, log, ...fakeDb })
  check('a tick with nothing due never connects to Snowflake', idle.ran.length === 0 && !idle.connected && opens === 0)

  // A missing state file is filled from SHARED_DB.OPS.JOB_RUN.
  const T1 = Date.parse('2030-01-01T02:00:00Z') // after any real run
  for (const job of Object.keys(JOB_SCHEDULE)) {
    await q(`insert into SHARED_DB.OPS.JOB_RUN (JOBRUNID, JOB, TRIGGEREDBY, HOST, STARTEDAT, FINISHEDAT, OUTCOME)
      values (?, ?, 'manual', 'TEST', ?::timestamp_ltz, ?::timestamp_ltz, 'succeeded')`, [crypto.randomUUID(), job, iso(T1), iso(T1)])
  }
  const missing = stateFile('missing')
  const seeded = await tick({ stateFile: missing, now: () => T1 + 60_000, runners, log, ...fakeDb })
  check('no state file: filled from SHARED_DB.OPS.JOB_RUN (one connection), and nothing rerun', seeded.seeded && seeded.ran.length === 0 && calls.length === 0 &&
    readState(missing).jobs.skills?.lastSuccessAt === iso(T1), JSON.stringify(readState(missing).jobs.skills))

  // 25 hours on: the full vacancy run and the Companies House refresh are due.
  const T2 = T1 + 25 * H
  const busy = await tick({ stateFile: missing, now: () => T2, runners, log, ...fakeDb })
  check('due jobs run one at a time, in order; new adverts covered by the full run; skills not due',
    calls.join() === 'vacancies-full,companies-refresh' && !overlapped &&
    JSON.stringify(busy.ran) === JSON.stringify([{ job: 'vacancies-full', outcome: 'succeeded' }, { job: 'companies-refresh', outcome: 'failed' }]), JSON.stringify(busy.ran))
  const rows = await rowsSince(T2)
  created.push(...rows.map((r) => r.JOBRUNID))
  const full = rows.find((r) => r.JOB === 'vacancies-full')
  const ch = rows.find((r) => r.JOB === 'companies-refresh')
  check('  recorded in SHARED_DB.OPS.JOB_RUN as scheduled, with host, outcome, the job\'s run ID and its summary',
    rows.length === 2 && full.TRIGGEREDBY === 'schedule' && full.HOST === os.hostname() && full.OUTCOME === 'succeeded' && full.JOBRUNREF === 'TEST-REF' &&
    full.SUMMARY === '{"adverts":1}' && full.FINISHED, JSON.stringify(full))
  check('  a job that throws is recorded as failed, with why', ch.OUTCOME === 'failed' && ch.ERROR === 'TEST Companies House down' && ch.FINISHED, JSON.stringify(ch))
  check('  the state file has both', readState(missing).jobs['vacancies-full'].lastSuccessAt === iso(T2) &&
    readState(missing).jobs['companies-refresh'].lastOutcome === 'failed')

  const again = await tick({ stateFile: missing, now: () => T2 + 10 * 60_000, runners, log, ...fakeDb })
  check('the next tick: the failed job isn\'t retried straight away, and nothing else is due', again.ran.length === 0 && !again.connected && calls.length === 2)
  const later = await tick({ stateFile: missing, now: () => T2 + 61 * 60_000, runners, log, ...fakeDb })
  check('  an hour later it is', later.ran.map((r) => r.job).join() === 'companies-refresh')

  // Manual runs are recorded the same way; a run is refused while another
  // in its lock group is open.
  const manual = await recordRun({ connection: c, job: 'skills', triggeredBy: 'manual', run: async () => ({ outcome: 'succeeded', summary: { ksbs: 2 } }), log, stateFile: stateFile('manual') })
  const [m] = await q(`select TRIGGEREDBY, HOST, OUTCOME, to_json(SUMMARY) as SUMMARY, FINISHEDAT is not null as FINISHED from SHARED_DB.OPS.JOB_RUN where JOBRUNID = ?`, [manual.jobRunId])
  created.push(manual.jobRunId)
  check('a manual run is recorded the same way, as manual', m.TRIGGEREDBY === 'manual' && m.HOST === os.hostname() && m.OUTCOME === 'succeeded' && m.SUMMARY === '{"ksbs":2}' && m.FINISHED, JSON.stringify(m))
  await q(`insert into SHARED_DB.OPS.JOB_RUN (JOBRUNID, JOB, TRIGGEREDBY, HOST) values (?, 'vacancies-new', 'manual', 'TEST')`, [crypto.randomUUID()])
  let ranAnyway = false
  const refused = await recordRun({ connection: c, job: 'vacancies-full', triggeredBy: 'schedule', run: async () => { ranAnyway = true; return { outcome: 'succeeded' } }, log, stateFile: stateFile('manual') })
  created.push(refused.jobRunId)
  check('a full vacancy run is refused while a new-adverts run is open, and doesn\'t run', refused.outcome === 'refused' && !ranAnyway && /vacancies-new run is open/.test(refused.error), refused.error)

  // A run still going at its time limit is recorded as failed and stops the tick.
  const limit = JOB_SCHEDULE.skills.timeoutMinutes
  JOB_SCHEDULE.skills.timeoutMinutes = 0.002 // 120 ms
  const hang = stateFile('hang')
  writeState({ jobs: { ...allDone(T2).jobs, skills: ok(T2 - 8 * 24 * H) } }, hang)
  let lateRun = false
  const stopped = await tick({ stateFile: hang, now: () => T2 + 60_000, runners: { ...runners, skills: async () => { await new Promise((r) => setTimeout(r, 1000)); lateRun = true; return { outcome: 'succeeded' } } }, log, ...fakeDb })
  JOB_SCHEDULE.skills.timeoutMinutes = limit
  const [t] = await q(`select OUTCOME, ERROR from SHARED_DB.OPS.JOB_RUN where JOB = 'skills' and TRIGGEREDBY = 'schedule' order by STARTEDAT desc limit 1`)
  check('a job past its time limit is recorded as failed and stops the tick', /Still running after/.test(stopped.stopped ?? '') && t?.OUTCOME === 'failed' && /Still running after/.test(t?.ERROR ?? '') && !lateRun,
    JSON.stringify({ stopped: stopped.stopped, t }))
  check('every recorded run logs a line as it starts and one as it ends', lines.indexOf('vacancies-full (schedule): started') >= 0 &&
    lines.indexOf('vacancies-full (schedule): started') < lines.findIndex((l) => /^vacancies-full \(schedule\): succeeded/.test(l)) &&
    lines.includes('companies-refresh (schedule): started') && lines.some((l) => /^companies-refresh \(schedule\): failed: TEST/.test(l)))
  check('JobTimeout is exported for callers', typeof JobTimeout === 'function')
} finally {
  await q('rollback')
  const [left] = await q(`select count(*) as N from SHARED_DB.OPS.JOB_RUN where HOST = 'TEST' or JOBRUNID in (select value::string from table(flatten(input => parse_json(?))))`, [JSON.stringify(created)])
  check('nothing kept after the rollback', Number(left.N) === 0, left.N)
  await destroy(c)
}
console.log(failures ? `\n${failures} failed` : '\nAll passed')
process.exit(failures ? 1 : 0)
