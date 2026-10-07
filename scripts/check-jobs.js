// check-jobs.js - is every background job running? Read-only.
//
//   npm run check:jobs
//
// For each job (server/jobSchedule.js), from OPS.JOB_RUN: its last run and
// how it went, its last success, and whether it's overdue (no success
// within its overdue limit). Fails if any job is overdue, so a monitor on
// an always-on host can run it and raise an alert. Runs that never
// finished (open past the lock window) are listed too.
// Needs the Snowflake connection in server/.env.

import { fileURLToPath } from 'node:url'
import { connect, execute, destroy } from '../server/db.js'
import { JOB_ORDER, JOB_SCHEDULE } from '../server/jobSchedule.js'

export const STATUS_QUERY = `
  select JOB,
    max(iff(OUTCOME = 'succeeded', STARTEDAT, null)) as LAST_SUCCESS,
    datediff(second, max(iff(OUTCOME = 'succeeded', STARTEDAT, null)), current_timestamp()) as SECONDS_SINCE_SUCCESS,
    max(STARTEDAT) as LAST_RUN,
    max_by(OUTCOME, STARTEDAT) as LAST_OUTCOME,
    max_by(TRIGGEREDBY, STARTEDAT) as LAST_TRIGGEREDBY,
    max_by(FINISHEDAT, STARTEDAT) as LAST_FINISHED,
    datediff(second, max(STARTEDAT), current_timestamp()) as SECONDS_SINCE_RUN
  from OPS.JOB_RUN
  group by JOB
`

// Each job's status from STATUS_QUERY's rows.
export function jobStatuses(rows) {
  const byJob = new Map(rows.map((r) => [r.JOB, r]))
  return JOB_ORDER.map((job) => {
    const s = JOB_SCHEDULE[job]
    const r = byJob.get(job)
    const sinceSuccess = r?.SECONDS_SINCE_SUCCESS == null ? null : Number(r.SECONDS_SINCE_SUCCESS) * 1000
    const open = r && !r.LAST_FINISHED
    const lastResult = !r ? 'never run'
      : open ? (Number(r.SECONDS_SINCE_RUN) > s.lockHours * 3600 ? "didn't finish" : 'running')
      : r.LAST_OUTCOME
    return {
      job,
      label: s.label,
      lastRun: r?.LAST_RUN ?? null,
      lastTriggeredBy: r?.LAST_TRIGGEREDBY ?? null,
      lastResult,
      lastSuccess: r?.LAST_SUCCESS ?? null,
      overdue: sinceSuccess === null || sinceSuccess > s.overdueAfter,
    }
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const connection = await connect()
  let statuses
  try {
    statuses = jobStatuses(await execute(connection, STATUS_QUERY))
  } finally {
    await destroy(connection)
  }
  const when = (d) => (d ? `${new Date(d).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'short', timeStyle: 'short' })} UK time` : 'never')
  for (const s of statuses) {
    console.log(`${s.overdue ? 'OVERDUE' : 'ok     '} ${s.job.padEnd(18)} last run ${when(s.lastRun)} (${s.lastTriggeredBy ?? '-'}): ${s.lastResult}; last success ${when(s.lastSuccess)}`)
  }
  const overdue = statuses.filter((s) => s.overdue)
  console.log(overdue.length ? `\n${overdue.length} job(s) overdue: ${overdue.map((s) => s.job).join(', ')}.` : '\nEvery job has succeeded within its limit.')
  process.exit(overdue.length ? 1 : 0)
}
