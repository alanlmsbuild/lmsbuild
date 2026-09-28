import { useEffect, useState } from 'react'
import { formatDate, standardLabel } from './lookups'
import { StatusBadge } from './ui/components'

const DEFAULT_YEAR = 2025

// Academic years are numbered by the calendar year they start in, as in
// the DfE guidance: 2025 is 1 August 2025 to 31 July 2026.
function academicYearLabel(year) {
  return year === null || year === undefined ? '—' : `${year} to ${year + 1}`
}

function rate(value) {
  return value === null || value === undefined ? '—' : `${value}%`
}

function StandardCell({ row }) {
  return row.STDCODE === null || row.STDCODE === undefined
    ? 'No standard code'
    : standardLabel(row, { withLevel: false })
}

// One table of aims, used for both the cohort and the aims not counted.
function AimsTable({ rows, onOpenLearner }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Learner</th>
            <th>Standard</th>
            <th>Planned end</th>
            <th>Actual end</th>
            <th>Achieved</th>
            <th>Hybrid end year</th>
            <th>Counted as</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.LEARNREFNUMBER}-${r.LEARNSTARTDATE}`}>
              <td>
                <button type="button" className="link-button" onClick={() => onOpenLearner(r.LEARNREFNUMBER)}>
                  {r.GIVENNAMES} {r.FAMILYNAME}
                </button>
                <span className="report-meta"> {r.LEARNREFNUMBER}</span>
              </td>
              <td>
                <StandardCell row={r} />
              </td>
              <td>{formatDate(r.LEARNPLANENDDATE)}</td>
              <td>{formatDate(r.LEARNACTENDDATE)}</td>
              <td>{formatDate(r.ACHDATE)}</td>
              <td>{academicYearLabel(r.HYBRID_END_YEAR)}</td>
              <td>{r.COUNTED_AS}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Data quality: aims past their planned end date with no outcome. They
// aren't leavers until someone completes or withdraws them, so they're
// listed here to be updated, whatever their year.
function PastPlannedEndWarning({ rows, onOpenLearner }) {
  if (rows.length === 0) return null
  const count = rows.length === 1 ? '1 learner is' : `${rows.length} learners are`
  return (
    <section className="qar-warning" aria-labelledby="qar-warning-heading">
      <h3 id="qar-warning-heading">
        <StatusBadge tone="due">Data quality</StatusBadge> {count} past their planned end date with no outcome
      </h3>
      <p>
        They&apos;re still continuing or on a break in learning, so they aren&apos;t counted as leavers in any
        year. The DfE would count them as withdrawn only if they stopped appearing in the ILR. Record whether each one
        completed, withdrew or has a new planned end date.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Learner</th>
              <th>Standard</th>
              <th>Status</th>
              <th>Planned end</th>
              <th className="num">Days past</th>
              <th>Tutor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.LEARNREFNUMBER}>
                <td>
                  <button type="button" className="link-button" onClick={() => onOpenLearner(r.LEARNREFNUMBER)}>
                    {r.GIVENNAMES} {r.FAMILYNAME}
                  </button>
                  <span className="report-meta"> {r.LEARNREFNUMBER}</span>
                </td>
                <td className="wrap">
                  <StandardCell row={r} />
                </td>
                <td className="wrap">
                  {r.COMPSTATUS === 6 ? `On a break since ${formatDate(r.LEARNACTENDDATE)}` : 'Continuing'}
                </td>
                <td>{formatDate(r.LEARNPLANENDDATE)}</td>
                <td className="num">{r.DAYS_PAST}</td>
                <td>{r.TUTORNAME ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function QarReport({ onOpenLearner }) {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus('loading')
      try {
        const res = await fetch(`/api/reports/qar?year=${year}`)
        if (!res.ok) throw new Error(`Server responded with ${res.status}`)
        const json = await res.json()
        if (cancelled) return
        setData(json)
        setStatus('ready')
        setError(null)
      } catch (err) {
        if (cancelled) return
        setError(err.message)
        setStatus('error')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [year])

  // Offer every hybrid end year in the data, plus the default and the
  // year being shown.
  const years = [...new Set([...(data?.years ?? []), DEFAULT_YEAR, year])].sort((a, b) => a - b)
  const cohort = data?.learners.filter((r) => r.IN_COHORT) ?? []
  const notCounted = data?.learners.filter((r) => !r.IN_COHORT) ?? []
  const total = data?.total

  return (
    <div className="report">
      <p className="indicative-banner" role="note">
        Indicative. Calculated from Warren&apos;s data using the DfE QAR method. Not the official published QAR.
      </p>

      <div className="learner-filters">
        <label className="report-year">
          Academic year{' '}
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {academicYearLabel(y)}
              </option>
            ))}
          </select>
        </label>
        <a className="ui-button ui-button--secondary" href={`/api/reports/qar/export?year=${year}`} download>
          Download spreadsheet (.xlsx)
        </a>
      </div>

      {status === 'loading' && <p className="empty-note">Calculating…</p>}
      {status === 'error' && <p role="alert">Couldn&apos;t run the QAR report: {error}</p>}

      {status === 'ready' && total && (
        <>
          <div className="stat-grid report-stats">
            <div className="stat-card">
              <span className="stat-value">{rate(total.ACHIEVEMENT_RATE)}</span>
              <span className="stat-label">Achievement rate</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{rate(total.RETENTION_RATE)}</span>
              <span className="stat-label">Retention rate</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{rate(total.PASS_RATE)}</span>
              <span className="stat-label">Pass rate</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{total.LEAVERS}</span>
              <span className="stat-label">Leavers</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{total.COMPLETERS}</span>
              <span className="stat-label">Completers</span>
            </div>
            <div className="stat-card">
              <span className="stat-value">{total.ACHIEVERS}</span>
              <span className="stat-label">Achievers</span>
            </div>
          </div>
          <p className="report-meta">
            Achievement rate = achievers ÷ leavers. Retention rate = completers ÷ leavers. Pass rate = achievers ÷
            completers.
          </p>

          <PastPlannedEndWarning rows={data.pastPlannedEnd} onOpenLearner={onOpenLearner} />

          <h3>By standard, {academicYearLabel(data.year)}</h3>
          {data.byStandard.length === 0 ? (
            <p className="empty-note">No apprenticeship aims are in the {academicYearLabel(data.year)} cohort.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Standard</th>
                    <th className="num">Leavers</th>
                    <th className="num">Completers</th>
                    <th className="num">Achievers</th>
                    <th className="num">Achievement rate</th>
                    <th className="num">Retention rate</th>
                    <th className="num">Pass rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byStandard.map((r) => (
                    <tr key={r.STDCODE ?? 'none'}>
                      <td>
                        <StandardCell row={r} />
                      </td>
                      <td className="num">{r.LEAVERS}</td>
                      <td className="num">{r.COMPLETERS}</td>
                      <td className="num">{r.ACHIEVERS}</td>
                      <td className="num">{rate(r.ACHIEVEMENT_RATE)}</td>
                      <td className="num">{rate(r.RETENTION_RATE)}</td>
                      <td className="num">{rate(r.PASS_RATE)}</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td>All standards</td>
                    <td className="num">{total.LEAVERS}</td>
                    <td className="num">{total.COMPLETERS}</td>
                    <td className="num">{total.ACHIEVERS}</td>
                    <td className="num">{rate(total.ACHIEVEMENT_RATE)}</td>
                    <td className="num">{rate(total.RETENTION_RATE)}</td>
                    <td className="num">{rate(total.PASS_RATE)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <h3>Learners in the {academicYearLabel(data.year)} cohort ({cohort.length})</h3>
          {cohort.length === 0 ? (
            <p className="empty-note">None.</p>
          ) : (
            <AimsTable rows={cohort} onOpenLearner={onOpenLearner} />
          )}

          <details className="report-details">
            <summary>Not counted in {academicYearLabel(data.year)} ({notCounted.length})</summary>
            {notCounted.length === 0 ? (
              <p className="empty-note">None.</p>
            ) : (
              <AimsTable rows={notCounted} onOpenLearner={onOpenLearner} />
            )}
          </details>

          <details className="report-details">
            <summary>How this is calculated</summary>
            <ul className="report-notes">
              <li>
                Apprenticeship programme aims only (aim type 1 with an apprenticeship programme type), following the
                DfE guidance &ldquo;Qualification achievement rates 2025 to 2026&rdquo;.
              </li>
              <li>
                Each aim belongs to the academic year (1 August to 31 July) of its hybrid end year: the latest of its
                achievement date, actual end date and planned end date.
              </li>
              <li>
                Leavers are aims that have ended (completed or withdrawn). Completers have completion status 2.
                Achievers have outcome 1.
              </li>
              <li>
                Aims past their planned end date with no outcome (still continuing, or on a break in learning) aren&apos;t
                leavers. The DfE counts them as withdrawn only when they&apos;re missing from the next year&apos;s ILR
                returns (&ldquo;overdue continuing aims&rdquo; and &ldquo;overdue planned breaks&rdquo;). Warren holds the
                live record, so while one is still continuing or on a break here, it&apos;s treated as still being
                returned. They&apos;re listed as a data quality warning instead.
              </li>
              <li>
                Excluded: withdrawals within the funding qualifying period without achieving (under 42 days when
                planned for 168 days or more; under 14 days when planned for 14 to 167 days), breaks in learning,
                and transfers to a new provider by DfE intervention.
              </li>
              <li>
                Not yet possible with Warren&apos;s data: the DfE uses five years of ILR returns (R14) to find the
                reporting year, the year an aim was first reported complete, overdue continuing aims, overdue planned
                breaks and restarts, and to match aims across years. Warren only holds each aim&apos;s current record,
                so these figures can differ from the official QAR, especially for the aims in the data quality
                warning.
              </li>
            </ul>
          </details>
        </>
      )}
    </div>
  )
}

export default QarReport
