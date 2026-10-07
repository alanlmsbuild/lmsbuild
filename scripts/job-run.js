// job-run.js - recording background job runs (scheduling, plan A).
//
// recordRun is the one way a job runs, whether by hand (npm run
// import:vacancies, import:skills, refresh:companies) or from the scheduler
// (npm run jobs): it writes a row to OPS.JOB_RUN, refuses to start while
// another run in the same lock group is open (vacancies full and new share
// one; the jobs' own locks still apply too), runs the job, records how it
// went, and updates the local state file.
//
// The state file (logs/jobs/state.json, gitignored; JOBS_STATE_FILE to move
// it) holds each job's last success and last attempt, so the scheduler can
// tell what's due without connecting to Snowflake. OPS.JOB_RUN is the
// record the screens read; the state file is only a cache of it, rebuilt
// from OPS.JOB_RUN when missing.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { execute } from '../server/db.js'
import { JOB_SCHEDULE, RETRY_AFTER } from '../server/jobSchedule.js'
import { ukIso } from '../src/ukTime.js'

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
export const STATE_FILE = process.env.JOBS_STATE_FILE || path.join(REPO, 'logs', 'jobs', 'state.json')

// ---------------------------------------------------------------- state file

export function readState(file = STATE_FILE) {
  try {
    const state = JSON.parse(fs.readFileSync(file, 'utf8'))
    return { jobs: {}, ...state }
  } catch {
    return { jobs: {} }
  }
}

// Written to a temporary file and renamed, so a crash never leaves half a file.
export function writeState(state, file = STATE_FILE) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2))
  fs.renameSync(tmp, file)
}

export function noteRun(job, { startedAt, outcome }, file = STATE_FILE) {
  const state = readState(file)
  const prev = state.jobs[job] ?? {}
  state.jobs[job] = {
    ...prev,
    lastAttemptAt: startedAt,
    lastOutcome: outcome,
    ...(outcome === 'succeeded' ? { lastSuccessAt: startedAt } : {}),
  }
  writeState(state, file)
}

// ---------------------------------------------------------------- due

const ms = (iso) => (iso ? Date.parse(iso) : -Infinity)

// The last success that counts for a job: its own, or the job that covers
// it (a full vacancy run covers the new-adverts run).
export function lastSuccess(job, state) {
  const own = ms(state.jobs[job]?.lastSuccessAt)
  const by = JOB_SCHEDULE[job].coveredBy
  return by ? Math.max(own, ms(state.jobs[by]?.lastSuccessAt)) : own
}

// Whether a job is due at `now` (ms). Due when its last success started
// longer ago than its interval, except straight after a failed or refused
// attempt (tried again no sooner than RETRY_AFTER). A job covered by
// another isn't due while that one is (it runs first and covers it).
export function isDue(job, state, now) {
  const s = JOB_SCHEDULE[job]
  if (now - lastSuccess(job, state) < s.every) return false
  const last = state.jobs[job]
  if (last?.lastOutcome && last.lastOutcome !== 'succeeded' && now - ms(last.lastAttemptAt) < RETRY_AFTER) return false
  if (s.coveredBy && isDue(s.coveredBy, state, now)) return false
  return true
}

// Jobs with no entry in the state file (a new machine, or a deleted file):
// their last success and attempt from OPS.JOB_RUN.
export const SEED_QUERY = `
  select JOB,
    to_varchar(max(iff(OUTCOME = 'succeeded', STARTEDAT, null)), 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM') as LAST_SUCCESS,
    to_varchar(max(STARTEDAT), 'YYYY-MM-DD"T"HH24:MI:SS.FF3TZH:TZM') as LAST_ATTEMPT,
    max_by(OUTCOME, STARTEDAT) as LAST_OUTCOME
  from OPS.JOB_RUN
  group by JOB
`
export function seedState(state, rows) {
  for (const r of rows) {
    if (state.jobs[r.JOB] || !JOB_SCHEDULE[r.JOB]) continue
    state.jobs[r.JOB] = {
      lastAttemptAt: r.LAST_ATTEMPT ? new Date(r.LAST_ATTEMPT).toISOString() : undefined,
      lastOutcome: r.LAST_OUTCOME ?? undefined,
      ...(r.LAST_SUCCESS ? { lastSuccessAt: new Date(r.LAST_SUCCESS).toISOString() } : {}),
    }
  }
  return state
}

// ---------------------------------------------------------------- recording

const START = `
  insert into OPS.JOB_RUN (JOBRUNID, JOB, TRIGGEREDBY, HOST, STARTEDAT)
  values (?, ?, ?, ?, ?::timestamp_ltz)
`
// Open runs of the same lock group, other than this one, started within
// the lock window. Binds: this run, the group's jobs (as JSON), hours.
const OTHER_OPEN = `
  select JOB, to_varchar(convert_timezone('Europe/London', STARTEDAT), 'YYYY-MM-DD HH24:MI') || ' UK time' as STARTED from OPS.JOB_RUN
  where FINISHEDAT is null and JOBRUNID <> ?
    and array_contains(JOB::variant, parse_json(?))
    and STARTEDAT > dateadd(hour, -?, current_timestamp())
`
const FINISH = `
  update OPS.JOB_RUN set FINISHEDAT = current_timestamp(), OUTCOME = ?, JOBRUNREF = ?, ERROR = ?, SUMMARY = parse_json(?)
  where JOBRUNID = ?
`

export class JobTimeout extends Error {}

// Runs one job and records it. run(connection) does the work and returns
// { outcome: 'succeeded' | 'failed' | 'refused', ref, error, summary }; a
// throw is recorded as failed. Returns that result with the JOBRUNID.
// timeoutMinutes (scheduled runs): a run still going is recorded as failed
// and JobTimeout thrown, so the caller can stop the process.
export async function recordRun({ connection, job, triggeredBy, run, log = console.log, stateFile = STATE_FILE, timeoutMinutes = null, now = () => new Date() }) {
  const s = JOB_SCHEDULE[job]
  if (!s) throw new Error(`Unknown job ${job}`)
  const jobRunId = crypto.randomUUID()
  const startedAt = now().toISOString()
  await execute(connection, START, [jobRunId, job, triggeredBy, os.hostname(), startedAt])
  const group = Object.keys(JOB_SCHEDULE).filter((j) => JOB_SCHEDULE[j].lockGroup === s.lockGroup)
  const others = await execute(connection, OTHER_OPEN, [jobRunId, JSON.stringify(group), s.lockHours])

  let result
  let timedOut = false
  if (others.length > 0) {
    result = { outcome: 'refused', error: `Another ${others[0].JOB} run is open (started ${others[0].STARTED}).` }
  } else {
    let timer
    try {
      const work = Promise.resolve().then(() => run(connection))
      const limit = timeoutMinutes
        ? new Promise((_, reject) => { timer = setTimeout(() => reject(new JobTimeout(`Still running after ${timeoutMinutes} minutes: stopped.`)), timeoutMinutes * 60_000) })
        : null
      result = await (limit ? Promise.race([work, limit]) : work)
    } catch (err) {
      timedOut = err instanceof JobTimeout
      result = { outcome: 'failed', error: err.message }
    } finally {
      clearTimeout(timer)
    }
  }
  const error = result.error ? String(result.error).slice(0, 1000) : null
  await execute(connection, FINISH, [result.outcome, result.ref ?? null, error, JSON.stringify(result.summary ?? null), jobRunId])
  noteRun(job, { startedAt, outcome: result.outcome }, stateFile)
  log(`${job} (${triggeredBy}): ${result.outcome}${error ? `: ${error}` : ''}`)
  if (timedOut) throw new JobTimeout(error)
  return { jobRunId, ...result }
}

// A job script's log: printed, and appended to logs/<name>/<UK date>.log,
// each line stamped in UK time with its offset (src/ukTime.js).
export function makeLog(name) {
  const dir = path.join(REPO, 'logs', name)
  fs.mkdirSync(dir, { recursive: true })
  return (line) => {
    const stamped = `${ukIso()} ${line}`
    console.log(stamped)
    fs.appendFileSync(path.join(dir, `${stamped.slice(0, 10)}.log`), stamped + '\n')
  }
}
