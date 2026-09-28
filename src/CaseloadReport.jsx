import { useEffect, useState } from 'react'
import { OFFICER_TYPE_OPTIONS } from './ilrCodes'
import { formatDate, labelFromOptions, standardLabel } from './lookups'
import CompletionStatus from './CompletionStatus'
import { useShell } from './shell/navigation'

// Placeholder until Burrow is built: evidence awaiting an assessor's review.
function BurrowPlaceholder() {
  return <span className="burrow-placeholder">Coming with Burrow</span>
}

function OfficerLearners({ officer, onClose, onOpenLearner }) {
  const [learners, setLearners] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStatus('loading')
      try {
        const res = await fetch(`/api/reports/caseload/${encodeURIComponent(officer.OFFICERREFNUMBER)}/learners`)
        if (!res.ok) throw new Error(`Server responded with ${res.status}`)
        const json = await res.json()
        if (cancelled) return
        setLearners(json)
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
  }, [officer.OFFICERREFNUMBER])

  const isAssessor = officer.OFFICERTYPE === 'ASSESSOR'

  return (
    <div className="dashboard-panel caseload-detail">
      <div className="caseload-detail-header">
        <h3>
          {officer.OFFICERNAME}{' '}
          <span className="report-meta">({labelFromOptions(OFFICER_TYPE_OPTIONS, officer.OFFICERTYPE)})</span>
        </h3>
        <button type="button" className="secondary" onClick={onClose}>
          Close
        </button>
      </div>

      {status === 'loading' && <p className="empty-note">Loading learners…</p>}
      {status === 'error' && <p role="alert">Couldn&apos;t load this officer&apos;s learners: {error}</p>}
      {status === 'ready' && learners.length === 0 && <p className="empty-note">No learners assigned.</p>}
      {status === 'ready' && learners.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Learner</th>
                <th>Standard</th>
                <th>Start date</th>
                <th>Planned end date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {learners.map((l) => (
                <tr key={l.LEARNREFNUMBER}>
                  <td>
                    <button type="button" className="link-button" onClick={() => onOpenLearner(l.LEARNREFNUMBER)}>
                      {l.GIVENNAMES} {l.FAMILYNAME}
                    </button>
                    <span className="report-meta"> {l.LEARNREFNUMBER}</span>
                  </td>
                  <td>{standardLabel(l, { withLevel: false })}</td>
                  <td>{formatDate(l.LEARNSTARTDATE)}</td>
                  <td>{formatDate(l.LEARNPLANENDDATE)}</td>
                  <td>
                    <CompletionStatus compstatus={l.COMPSTATUS} />
                    {l.IS_OVERDUE && <span className="overdue-tag">Overdue</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isAssessor && (
        <div className="burrow-placeholder-panel">
          <strong>Burrow evidence awaiting review</strong>
          <p>Space reserved for this assessor&apos;s Burrow evidence stats, to fill in once Burrow is built.</p>
        </div>
      )}
    </div>
  )
}

// An officer's learners open below the table, at
// /app/reports/caseload/<officer ref>.
function CaseloadReport({ officerRef, onOpenLearner }) {
  const { navigate } = useShell()
  const [officers, setOfficers] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null)
  const selected = officerRef ? officers.find((o) => o.OFFICERREFNUMBER === officerRef) : null

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/reports/caseload')
        if (!res.ok) throw new Error(`Server responded with ${res.status}`)
        setOfficers(await res.json())
        setStatus('ready')
      } catch (err) {
        setError(err.message)
        setStatus('error')
      }
    }
    load()
  }, [])

  return (
    <div className="report">
      <p className="section-intro">
        Each officer&apos;s assigned learners, by the status of their programme aim. Overdue learners are continuing
        past their planned end date, and are also counted as continuing.
      </p>

      {status === 'loading' && <p className="empty-note">Loading caseloads…</p>}
      {status === 'error' && <p role="alert">Couldn&apos;t run the caseload report: {error}</p>}
      {status === 'ready' && officers.length === 0 && <p className="empty-note">No officers yet.</p>}
      {status === 'ready' && officers.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Officer</th>
                <th>Role</th>
                <th className="num">Learners</th>
                <th className="num">Continuing</th>
                <th className="num">Completed</th>
                <th className="num">Withdrawn</th>
                <th className="num">Overdue</th>
                <th>Burrow evidence awaiting review</th>
              </tr>
            </thead>
            <tbody>
              {officers.map((o) => (
                <tr key={o.OFFICERREFNUMBER} className={selected?.OFFICERREFNUMBER === o.OFFICERREFNUMBER ? 'selected-row' : ''}>
                  <td>
                    <a className="link-button" href={`/app/reports/caseload/${encodeURIComponent(o.OFFICERREFNUMBER)}`}>
                      {o.OFFICERNAME}
                    </a>
                  </td>
                  <td>{labelFromOptions(OFFICER_TYPE_OPTIONS, o.OFFICERTYPE)}</td>
                  <td className="num">{o.TOTAL}</td>
                  <td className="num">{o.CONTINUING}</td>
                  <td className="num">{o.COMPLETED}</td>
                  <td className="num">{o.WITHDRAWN}</td>
                  <td className="num">{o.OVERDUE}</td>
                  <td>{o.OFFICERTYPE === 'ASSESSOR' ? <BurrowPlaceholder /> : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {status === 'ready' && officerRef && !selected && (
        <p role="alert">There&apos;s no officer {officerRef} in this report.</p>
      )}
      {selected && (
        <OfficerLearners
          key={selected.OFFICERREFNUMBER}
          officer={selected}
          onClose={() => navigate('/app/reports/caseload')}
          onOpenLearner={onOpenLearner}
        />
      )}
    </div>
  )
}

export default CaseloadReport
