import { useCallback, useEffect, useState } from 'react'
import { usePageTitle } from '../shell/navigation'
import './funnel.css'

// Meadow's drop-off report at /meadow/reports (the Reports tab), from the
// approved mock-up (pipeline option C, funnel with outcome): the candidate
// stages in the board's three bands, each with how many reached it, the %
// who carried on to the next stage, and how many left from it and why
// (GET /api/meadow/funnel, server/meadowFunnel.js); then the outcome box,
// which waits for Warren's outcomes. Choosing college or sixth form is
// shown as a good outcome, not a failure.

// The funnel's fills, lightest first, and whether text on them is dark.
const FILLS = ['#c9d3e6', '#a9b8d6', '#8ea1c8', '#7a8fbf', '#6a80b0', '#55699a', '#3f5683', '#2b3d60']
const fill = (i, n) => FILLS[Math.min(FILLS.length - 1, Math.round((i * (FILLS.length - 1)) / Math.max(1, n - 1)))]
const darkInk = (colour) => FILLS.indexOf(colour) < 4

const people = (n) => `${n} ${n === 1 ? 'person' : 'people'}`

function StageRow({ stage, index, count }) {
  const colour = fill(index, count)
  const carried = stage.carriedOn == null ? 'the last stage' : `${stage.carriedOn}% carried on`
  return (
    <li className="funnel-row" data-stage={stage.key}>
      <div className="funnel-stage">
        <h3>{stage.name}</h3>
        <p>
          <strong>{stage.reached}</strong> reached
        </p>
      </div>
      <div className="funnel-bar-cell">
        <div
          className={darkInk(colour) ? 'funnel-bar' : 'funnel-bar is-dark'}
          style={{ width: `${Math.max(stage.share * 100, 18)}%`, background: colour }}
        >
          {carried}
        </div>
      </div>
      <div className="funnel-left">
        {stage.left === 0 ? (
          <p className="funnel-none">Nobody left here</p>
        ) : (
          <>
            <p>
              <strong>{stage.left}</strong> left here
            </p>
            <ul aria-label={`Why people left at ${stage.name}`}>
              {stage.leftReasons.map((r) => (
                <li key={r.reasonId ?? 'none'} className={r.positive ? 'is-positive' : ''}>
                  <span>{r.label}</span>
                  <span className="funnel-reason-count">{r.count}</span>
                  {r.positive && <span className="funnel-good">Good outcome</span>}
                </li>
              ))}
            </ul>
          </>
        )}
        {stage.stillHere > 0 && <p className="funnel-still">{people(stage.stillHere)} still here</p>}
      </div>
    </li>
  )
}

function FunnelReport() {
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  usePageTitle('Reports')

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/meadow/funnel')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Server responded with ${res.status}`)
      setReport(data)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const t = report?.totals
  const stageCount = report ? report.bands.reduce((n, b) => n + b.stages.length, 0) : 0
  let index = 0
  return (
    <main className="meadow-main funnel">
      <div className="meadow-heading">
        <p className="meadow-eyebrow">Reports{report?.organisation ? ` · ${report.organisation}` : ''}</p>
        <h1>From enquiry to staying the course</h1>
        {t && (
          <p className="meadow-summary funnel-summary">
            <span>
              <strong>{t.joined}</strong> joined the pipeline:
            </span>
            <span>
              <strong>{t.enrolled}</strong> enrolled
            </span>
            <span>
              <strong>{t.inProgress}</strong> in progress
            </span>
            <span>
              <strong>{t.notProceeding}</strong> not proceeding
              {t.positive > 0 && `, of whom ${t.positive} chose college or sixth form`}
            </span>
          </p>
        )}
        <p className="funnel-how">
          Every candidate so far, counted once at the furthest stage they reached. People can skip a stage, so reaching a stage means getting there or further.
        </p>
      </div>

      {error && (
        <div className="meadow-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={load}>
            Try again
          </button>
        </div>
      )}
      {!report && !error && <p className="meadow-loading">Loading the report…</p>}

      {report && t.joined === 0 && <p className="funnel-none">Nobody has joined the pipeline yet.</p>}

      {report && t.joined > 0 && (
        <>
          <div className="funnel-bands">
            {report.bands.map((band) => (
              <section key={band.key} className={`funnel-band funnel-band-${band.key}`} aria-labelledby={`funnel-band-${band.key}`}>
                <header className="funnel-band-head">
                  <h2 id={`funnel-band-${band.key}`}>{band.name}</h2>
                  <span>{band.note}</span>
                </header>
                <ol className="funnel-rows">
                  {band.stages.map((s) => (
                    <StageRow key={s.stageId} stage={s} index={index++} count={stageCount} />
                  ))}
                </ol>
              </section>
            ))}
          </div>
          <div className="funnel-outcome-wrap">
            <span className="funnel-outcome-stem" aria-hidden="true" />
            <section className="funnel-outcome" aria-label="What happened next">
              <h2>First 12 weeks in learning</h2>
              <p>Available once Warren’s outcomes are linked.</p>
            </section>
          </div>
        </>
      )}
    </main>
  )
}

export default FunnelReport
