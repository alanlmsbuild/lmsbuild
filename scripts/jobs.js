// jobs.js - the scheduler (scheduling, plan A). Started every 15 minutes by
// whatever host it's on (on Alan's laptop, a Windows scheduled task):
//
//   npm run jobs
//
// Each tick it reads the local state file (scripts/job-run.js) and runs, one
// at a time, every job that's due (server/jobSchedule.js): when its last
// success started longer ago than its interval. Asleep or switched off, the
// laptop misses ticks; the next tick finds the overdue jobs and runs each
// once. Nothing due: it exits without connecting to Snowflake, so ticks
// don't wake the warehouse.
//
// Never two at once: one tick per machine (logs/jobs/tick.lock, with the
// process ID; a lock left by a process that's gone is taken over), jobs one
// after another, and recordRun's lock across machines and manual runs. A
// job still running after its time limit is recorded as failed and the
// tick stops (the rest are due next tick).
//
// Logs to logs/jobs/<date>.log only when it runs something: a line as each
// job starts and one as it ends. Each tick also clears old logs there
// (clearOldLogs): daily logs older than 90 days, and tick-output.log once
// it passes 1 MB (kept once, as tick-output.old.log).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, execute, destroy } from '../server/db.js'
import { JOB_ORDER, JOB_SCHEDULE } from '../server/jobSchedule.js'
import { isDue, JobTimeout, makeLog, readState, recordRun, SEED_QUERY, seedState, STATE_FILE, writeState } from './job-run.js'
import { ukDate } from '../src/ukTime.js'

export const JOBS_LOG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'logs', 'jobs')
export const KEEP_LOG_DAYS = 90
export const MAX_OUTPUT_BYTES = 1_000_000

// How each job runs, loaded only when it's due.
export const JOB_RUNNERS = {
  'vacancies-full': async (connection, log) => (await import('./import-vacancies.js')).runJob({ connection, kind: 'full', log }),
  'vacancies-new': async (connection, log) => (await import('./import-vacancies.js')).runJob({ connection, kind: 'new', log }),
  'companies-refresh': async (connection, log) => (await import('./refresh-companies.js')).runJob({ connection, log }),
  skills: async (connection, log) => (await import('./import-skills.js')).runJob({ connection, log }),
}

// One tick. Returns what it did: { ran: [{ job, outcome }], seeded, connected }.
// Everything outside is passed in, so tests can use fakes.
export async function tick({
  stateFile = STATE_FILE,
  now = () => Date.now(),
  openConnection = connect,
  closeConnection = destroy,
  runners = JOB_RUNNERS,
  log = makeLog('jobs'),
} = {}) {
  const done = { ran: [], seeded: false, connected: false }
  let connection = null
  const db = async () => {
    if (!connection) {
      connection = await openConnection()
      done.connected = true
    }
    return connection
  }
  try {
    // A job missing from the state file: fill it in from OPS.JOB_RUN first,
    // so a new machine doesn't rerun everything.
    let state = readState(stateFile)
    if (JOB_ORDER.some((j) => !state.jobs[j])) {
      state = seedState(state, await execute(await db(), SEED_QUERY))
      writeState(state, stateFile)
      done.seeded = true
    }
    for (const job of JOB_ORDER) {
      // Read again each time: the job before may have covered this one.
      if (!isDue(job, readState(stateFile), now())) continue
      const result = await recordRun({
        connection: await db(),
        job,
        triggeredBy: 'schedule',
        run: (c) => runners[job](c, log),
        log,
        stateFile,
        timeoutMinutes: JOB_SCHEDULE[job].timeoutMinutes,
        now: () => new Date(now()),
      })
      done.ran.push({ job, outcome: result.outcome })
    }
  } catch (err) {
    if (err instanceof JobTimeout) done.stopped = err.message
    else throw err
  } finally {
    if (connection) await closeConnection(connection)
  }
  return done
}

// Clears old logs in dir: daily logs (YYYY-MM-DD.log, by UK date) older
// than keepDays, and tick-output.log once it's over maxBytes (renamed to
// tick-output.old.log, replacing the last one; run-jobs.sh starts a new
// one next tick). Nothing else there is touched. Returns what it did.
export function clearOldLogs(dir = JOBS_LOG_DIR, { now = new Date(), keepDays = KEEP_LOG_DAYS, maxBytes = MAX_OUTPUT_BYTES } = {}) {
  const done = { removed: [], rotated: false }
  if (!fs.existsSync(dir)) return done
  const oldest = ukDate(new Date(Date.parse(`${ukDate(now)}T12:00:00Z`) - keepDays * 86_400_000))
  for (const name of fs.readdirSync(dir)) {
    const m = name.match(/^(\d{4}-\d{2}-\d{2})\.log$/)
    if (m && m[1] < oldest) {
      fs.rmSync(path.join(dir, name), { force: true })
      done.removed.push(name)
    }
  }
  const output = path.join(dir, 'tick-output.log')
  if (fs.existsSync(output) && fs.statSync(output).size > maxBytes) {
    fs.renameSync(output, path.join(dir, 'tick-output.old.log'))
    done.rotated = true
  }
  return done
}

// One tick per machine at a time: a lock file holding the process ID.
// Returns a release function, or null if a live process holds it.
export function takeLock(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(file, String(process.pid), { flag: 'wx' })
      return () => fs.rmSync(file, { force: true })
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
      const pid = Number(fs.readFileSync(file, 'utf8'))
      let alive = false
      try {
        process.kill(pid, 0)
        alive = true
      } catch (e) {
        alive = e.code === 'EPERM'
      }
      if (alive) return null
      fs.rmSync(file, { force: true }) // left by a process that's gone
    }
  }
  return null
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const lockFile = path.join(path.dirname(STATE_FILE), 'tick.lock')
  const release = takeLock(lockFile)
  if (!release) process.exit(0) // a tick is already running here
  let code = 0
  try {
    const cleared = clearOldLogs()
    if (cleared.removed.length || cleared.rotated) {
      makeLog('jobs')(`Cleared old logs: ${cleared.removed.length} daily ${cleared.removed.length === 1 ? 'log' : 'logs'} over ${KEEP_LOG_DAYS} days old${cleared.rotated ? ', and tick-output.log (over 1 MB) kept as tick-output.old.log' : ''}`)
    }
    const done = await tick()
    if (done.stopped || done.ran.some((r) => r.outcome !== 'succeeded')) code = 1
  } catch (err) {
    makeLog('jobs')(`Tick failed: ${err.message}`)
    code = 1
  } finally {
    release()
  }
  // A job stopped at its time limit may still have work pending: exit anyway.
  process.exit(code)
}
