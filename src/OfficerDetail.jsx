import { useCallback, useEffect, useState } from 'react'
import { OFFICER_TYPE_OPTIONS, STANDARD_OPTIONS } from './ilrCodes'
import { COMPLETION_STATUS_LABELS, describe, labelFromOptions, statusClassName } from './lookups'

function Row({ label, value }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  )
}

// `learners` is the full learner list App already fetched for the Learners
// tab. The officer's assignments come back as learner references only, and
// are matched against that list to get each learner's standard and status.
function OfficerDetail({ officer, learners, learnersStatus, onClose, onOpenLearner }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const [assignedRefs, setAssignedRefs] = useState([])
  const [assignedStatus, setAssignedStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [removeError, setRemoveError] = useState(null)

  const loadAssigned = useCallback(async () => {
    try {
      const res = await fetch(`/api/officers/${officer.OFFICERREFNUMBER}/learners`)
      if (!res.ok) throw new Error('Server error')
      const rows = await res.json()
      setAssignedRefs(rows.map((r) => r.LEARNREFNUMBER))
      setAssignedStatus('ready')
    } catch {
      setAssignedStatus('error')
    }
  }, [officer.OFFICERREFNUMBER])

  useEffect(() => {
    loadAssigned()
  }, [loadAssigned])

  async function handleRemoveLearner(learnRefNumber) {
    setRemoveError(null)
    try {
      const res = await fetch(`/api/learners/${learnRefNumber}/officers/${officer.OFFICERREFNUMBER}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        setRemoveError(data.error || 'Could not remove this learner.')
        return
      }
      loadAssigned()
    } catch {
      setRemoveError('Could not reach the server. Please try again.')
    }
  }

  const assignedLearners = learners.filter((l) => assignedRefs.includes(l.LEARNREFNUMBER))

  // Same counting as the Dashboard's stat cards, just scoped to this officer.
  const continuing = assignedLearners.filter((l) => l.COMPSTATUS === 1).length
  const completed = assignedLearners.filter((l) => l.COMPSTATUS === 2).length
  const withdrawn = assignedLearners.filter((l) => l.COMPSTATUS === 3).length

  const loading = assignedStatus === 'loading' || learnersStatus === 'loading'
  const failed = assignedStatus === 'error' || learnersStatus === 'error'

  return (
    <div className="detail-overlay" onClick={onClose}>
      <aside className="detail-panel" onClick={(e) => e.stopPropagation()} aria-label="Officer detail">
        <div className="detail-header">
          <h2>{officer.OFFICERNAME}</h2>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <section className="detail-section">
          <h3>Officer details</h3>
          <Row label="Officer reference" value={officer.OFFICERREFNUMBER} />
          <Row label="Name" value={officer.OFFICERNAME} />
          <Row label="Type" value={labelFromOptions(OFFICER_TYPE_OPTIONS, officer.OFFICERTYPE)} />
          <Row label="Email" value={officer.EMAIL || '—'} />
          <Row label="Phone" value={officer.TELNO || '—'} />
        </section>

        <section className="detail-section">
          <h3>Assigned learners</h3>

          {loading && <p className="empty-note">Loading learners…</p>}
          {!loading && failed && <p role="alert">Couldn't load assigned learners.</p>}

          {!loading && !failed && (
            <>
              <div className="stat-grid detail-stat-grid">
                <div className="stat-card">
                  <span className="stat-value">{assignedLearners.length}</span>
                  <span className="stat-label">Total learners</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{continuing}</span>
                  <span className="stat-label">Continuing</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value status-completed">{completed}</span>
                  <span className="stat-label">Completed</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value status-withdrawn">{withdrawn}</span>
                  <span className="stat-label">Withdrawn</span>
                </div>
              </div>

              {removeError && (
                <p className="error-banner" role="alert">
                  {removeError}
                </p>
              )}

              {assignedLearners.length === 0 ? (
                <p className="empty-note">No learners assigned.</p>
              ) : (
                <ul className="dashboard-list">
                  {assignedLearners.map((learner) => (
                    <li key={`${learner.LEARNREFNUMBER}-${learner.LEARNAIMREF}`} className="officer-learner">
                      <div className="officer-learner-main">
                        <button type="button" className="link-button" onClick={() => onOpenLearner(learner)}>
                          {learner.GIVENNAMES} {learner.FAMILYNAME}
                        </button>
                        <span className="dashboard-list-meta">
                          {learner.LEARNREFNUMBER} · {labelFromOptions(STANDARD_OPTIONS, learner.STDCODE)}
                        </span>
                      </div>
                      <div className="officer-learner-side">
                        <span className={statusClassName(learner.COMPSTATUS)}>
                          {describe(COMPLETION_STATUS_LABELS, learner.COMPSTATUS)}
                        </span>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => handleRemoveLearner(learner.LEARNREFNUMBER)}
                        >
                          Remove
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </aside>
    </div>
  )
}

export default OfficerDetail
