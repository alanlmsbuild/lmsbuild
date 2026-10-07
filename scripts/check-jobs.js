// check-jobs.js - is every background job running? Read-only.
//
//   npm run check:jobs
//
// For each job (server/jobSchedule.js), from SHARED_DB.OPS.JOB_RUN: its last run and
// how it went, its last success, and whether it's overdue (server/
// jobStatus.js, which managers' Data updates tile uses too; no success
// within its overdue limit). Fails if any job is overdue, so a monitor on
// an always-on host can run it and raise an alert. Runs that never
// finished (open past the lock window) are listed too.
// Needs the Snowflake connection in server/.env.

import { fileURLToPath } from 'node:url'
import { connect, execute, destroy } from '../server/db.js'
import { jobStatuses, STATUS_QUERY } from '../server/jobStatus.js'

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
