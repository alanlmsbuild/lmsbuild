// Whether the background jobs are running (scheduling, plan A): each job's
// last run and how it went, its last success, and whether it's overdue,
// from OPS.JOB_RUN. Managers see it on My day ("Data updates"); npm run
// check:jobs prints the same.
//
// Only times and outcomes leave here: never a run's error, counts or host.
// The Companies House refresh covers every organisation, so its counts and
// errors could show another organisation's employers.

import { execute } from './db.js'
import { allow, MANAGER } from './access.js'
import { sendError } from './burrow.js'
import { JOB_ORDER, JOB_SCHEDULE } from './jobSchedule.js'

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

// Each job's status, in JOB_ORDER, from STATUS_QUERY's rows. lastResult is
// succeeded, failed, refused, running, didn't finish (open past its lock
// window) or never run. Overdue: no success within the job's limit.
// A full vacancy run also counts as a success for new adverts.
const iso = (value) => (value == null ? null : new Date(value).toISOString())

export function jobStatuses(rows) {
  const byJob = new Map(rows.map((r) => [r.JOB, r]))
  const since = (r) => (r?.SECONDS_SINCE_SUCCESS == null ? null : Number(r.SECONDS_SINCE_SUCCESS) * 1000)
  return JOB_ORDER.map((job) => {
    const s = JOB_SCHEDULE[job]
    const r = byJob.get(job)
    const own = since(r)
    const cover = s.coveredBy ? since(byJob.get(s.coveredBy)) : null
    const sinceSuccess = [own, cover].filter((x) => x !== null).reduce((a, b) => Math.min(a, b), Infinity)
    const open = r && !r.LAST_FINISHED
    const lastResult = !r ? 'never run'
      : open ? (Number(r.SECONDS_SINCE_RUN) > s.lockHours * 3600 ? "didn't finish" : 'running')
      : r.LAST_OUTCOME
    return {
      job,
      label: s.label,
      short: s.short,
      lastRun: iso(r?.LAST_RUN),
      lastTriggeredBy: r?.LAST_TRIGGEREDBY ?? null,
      lastResult,
      lastSuccess: iso(r?.LAST_SUCCESS),
      overdue: sinceSuccess === Infinity || sinceSuccess > s.overdueAfter,
    }
  })
}

export function registerJobStatusRoutes(app) {
  // Managers only, and only what's safe to show any organisation.
  app.get('/api/jobs/status', allow(MANAGER), async (req, res) => {
    try {
      const statuses = jobStatuses(await execute(req.db, STATUS_QUERY))
      res.json(statuses.map(({ job, label, short, lastRun, lastResult, lastSuccess, overdue }) => ({ job, label, short, lastRun, lastResult, lastSuccess, overdue })))
    } catch (err) {
      sendError(res, err, 'Could not load the data updates')
    }
  })
}
