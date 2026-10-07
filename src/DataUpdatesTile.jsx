import { useEffect, useState } from 'react'
import { ukWhenText } from './ukTime'

// Managers' "Data updates" tile on My day: whether each background job
// (adverts, Companies House, Skills England) last ran successfully, and
// which are overdue (GET /api/jobs/status, from OPS.JOB_RUN). Times only,
// in UK time: never counts or errors, which could cover other
// organisations. docs/scheduling.md says what to do when one is overdue.

const RESULT_TEXT = {
  failed: 'Failed',
  refused: 'Skipped: another run was going',
  running: 'Running now',
  "didn't finish": "Didn't finish",
  'never run': 'Never run',
}

function JobRow({ job }) {
  const tone = job.overdue ? 'overdue' : job.lastResult === 'succeeded' ? 'ok' : job.lastResult === 'running' ? 'running' : 'warn'
  const notes = []
  if (job.lastResult !== 'succeeded' && RESULT_TEXT[job.lastResult]) notes.push(RESULT_TEXT[job.lastResult])
  if (job.lastResult !== 'succeeded' && job.lastSuccess) notes.push(`last success ${ukWhenText(job.lastSuccess)}`)
  if (job.overdue) notes.unshift('Overdue')
  return (
    <li className={`myday-job myday-job-${tone}`}>
      <span className="myday-job-dot" aria-hidden="true" />
      <span className="myday-job-name">{job.short}</span>
      <span className="myday-job-when">{job.lastRun ? ukWhenText(job.lastRun) : '—'}</span>
      {notes.length > 0 && <span className="myday-job-note">{notes.join(' · ')}</span>}
    </li>
  )
}

function DataUpdatesTile() {
  const [jobs, setJobs] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/jobs/status')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body) => { if (!cancelled) setJobs(body) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [])

  const overdue = jobs?.filter((j) => j.overdue).length ?? 0
  return (
    <div className="myday-tile myday-tile-data" aria-label="Data updates">
      <span className="myday-tile-title">Data updates</span>
      {failed && <span className="myday-tile-note">Couldn&apos;t load.</span>}
      {!failed && !jobs && <span className="myday-tile-note">Loading…</span>}
      {jobs && (
        <>
          <span className={`myday-data-summary${overdue ? ' is-overdue' : ''}`}>
            {overdue === 0 ? 'All up to date' : `${overdue} overdue`}
          </span>
          <ul className="myday-jobs">
            {jobs.map((j) => (
              <JobRow key={j.job} job={j} />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export default DataUpdatesTile
