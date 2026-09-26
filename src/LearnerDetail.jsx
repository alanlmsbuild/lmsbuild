import { useCallback, useEffect, useState } from 'react'
import {
  SEX_OPTIONS,
  LLDD_HEALTH_PROBLEM_OPTIONS,
  ETHNICITY_OPTIONS,
  WITHDRAW_REASON_OPTIONS,
  CONTACT_METHOD_OPTIONS,
  CONTRACT_TYPE_OPTIONS,
  OFFICER_TYPE_OPTIONS,
} from './ilrCodes'
import {
  COMPLETION_STATUS_LABELS,
  OUTCOME_LABELS,
  describe,
  labelFromOptions,
  labelsFromCommaList,
  formatDate,
  standardLabel,
  statusClassName,
} from './lookups'

// Age in whole years as of today, from a 'YYYY-MM-DD' (or similar
// parseable) date of birth string.
function ageFromDateOfBirth(dateOfBirth) {
  if (!dateOfBirth) return null
  const birth = new Date(dateOfBirth)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  return age
}

function wholeMonthsBetween(start, end) {
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth())
  if (end.getDate() < start.getDate()) months--
  return Math.max(months, 0)
}

function formatDuration(months) {
  if (months < 1) return 'Less than a month'
  const years = Math.floor(months / 12)
  const remainder = months % 12
  const parts = []
  if (years > 0) parts.push(`${years} year${years === 1 ? '' : 's'}`)
  if (remainder > 0) parts.push(`${remainder} month${remainder === 1 ? '' : 's'}`)
  return parts.join(' ')
}

// Time on programme runs from the aim's start date to today if it's still
// continuing, or to its actual end date if it's completed or withdrawn.
function timeOnPlacement(learner) {
  if (!learner.LEARNSTARTDATE) return null
  const start = new Date(learner.LEARNSTARTDATE)
  const end = learner.COMPSTATUS === 1 || !learner.LEARNACTENDDATE ? new Date() : new Date(learner.LEARNACTENDDATE)
  return formatDuration(wholeMonthsBetween(start, end))
}

function Row({ label, value }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  )
}

function LearnerDetail({ learner, onClose, onEdit, onComplete, onWithdraw }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const age = ageFromDateOfBirth(learner.DATEOFBIRTH)
  const timeOnProgramme = timeOnPlacement(learner)

  const [assignedOfficers, setAssignedOfficers] = useState([])
  const [allOfficers, setAllOfficers] = useState([])
  const [officersStatus, setOfficersStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [selectedOfficer, setSelectedOfficer] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [officerError, setOfficerError] = useState(null)

  const loadOfficers = useCallback(async () => {
    try {
      const [assignedRes, allRes] = await Promise.all([
        fetch(`/api/learners/${learner.LEARNREFNUMBER}/officers`),
        fetch('/api/officers'),
      ])
      if (!assignedRes.ok || !allRes.ok) throw new Error('Server error')
      setAssignedOfficers(await assignedRes.json())
      setAllOfficers(await allRes.json())
      setOfficersStatus('ready')
    } catch {
      setOfficersStatus('error')
    }
  }, [learner.LEARNREFNUMBER])

  useEffect(() => {
    loadOfficers()
  }, [loadOfficers])

  async function handleAssignOfficer(e) {
    e.preventDefault()
    if (!selectedOfficer) return
    setOfficerError(null)
    setAssigning(true)
    try {
      const res = await fetch(`/api/learners/${learner.LEARNREFNUMBER}/officers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ officerRefNumber: selectedOfficer }),
      })
      const data = await res.json()

      if (!res.ok) {
        setOfficerError(data.error || 'Could not assign this officer.')
        return
      }

      setSelectedOfficer('')
      loadOfficers()
    } catch {
      setOfficerError('Could not reach the server. Please try again.')
    } finally {
      setAssigning(false)
    }
  }

  async function handleRemoveOfficer(officerRefNumber) {
    setOfficerError(null)
    try {
      const res = await fetch(`/api/learners/${learner.LEARNREFNUMBER}/officers/${officerRefNumber}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        setOfficerError(data.error || 'Could not remove this officer.')
        return
      }
      loadOfficers()
    } catch {
      setOfficerError('Could not reach the server. Please try again.')
    }
  }

  const assignableOfficers = allOfficers.filter(
    (o) => !assignedOfficers.some((a) => a.OFFICERREFNUMBER === o.OFFICERREFNUMBER),
  )

  return (
    <div className="detail-overlay" onClick={onClose}>
      <aside className="detail-panel" onClick={(e) => e.stopPropagation()} aria-label="Learner detail">
        <div className="detail-header">
          <h2>
            {learner.GIVENNAMES} {learner.FAMILYNAME}
          </h2>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="detail-actions">
          <button type="button" className="secondary" onClick={() => onEdit(learner)}>
            Edit
          </button>
          {learner.COMPSTATUS === 1 && (
            <button type="button" className="secondary" onClick={() => onComplete(learner)}>
              Mark completed
            </button>
          )}
          {learner.COMPSTATUS === 1 && (
            <button type="button" className="secondary" onClick={() => onWithdraw(learner)}>
              Withdraw
            </button>
          )}
        </div>

        <section className="detail-section">
          <h3>Personal details</h3>
          <Row label="Learner reference" value={learner.LEARNREFNUMBER} />
          <Row label="ULN" value={learner.ULN ?? '—'} />
          <Row label="Date of birth" value={formatDate(learner.DATEOFBIRTH)} />
          <Row label="Age" value={age === null ? '—' : `${age} years old`} />
          <Row label="Ethnicity" value={labelFromOptions(ETHNICITY_OPTIONS, learner.ETHNICITY)} />
          <Row label="Sex" value={labelFromOptions(SEX_OPTIONS, learner.SEX)} />
          <Row
            label="LLDD health problem"
            value={labelFromOptions(LLDD_HEALTH_PROBLEM_OPTIONS, learner.LLDDHEALTHPROB)}
          />
          <Row label="NI number" value={learner.NINUMBER || '—'} />
          <Row label="Previous postcode" value={learner.POSTCODEPRIOR || '—'} />
          <Row label="Current postcode" value={learner.POSTCODE || '—'} />
          <Row label="Phone" value={learner.TELNO || '—'} />
          <Row label="Email" value={learner.EMAIL || '—'} />
        </section>

        <section className="detail-section">
          <h3>Contact details</h3>
          <Row label="Title" value={learner.TITLE || '—'} />
          <Row label="Address line 1" value={learner.ADDRESSLINE1 || '—'} />
          <Row label="Address line 2" value={learner.ADDRESSLINE2 || '—'} />
          <Row label="Address line 3" value={learner.ADDRESSLINE3 || '—'} />
          <Row label="Ward or county" value={learner.WARDORCOUNTY || '—'} />
          <Row label="Mobile number" value={learner.MOBILENO || '—'} />
          <Row
            label="Contact methods allowed"
            value={labelsFromCommaList(CONTACT_METHOD_OPTIONS, learner.CONTACTMETHODSALLOWED)}
          />
          <Row
            label="Preferred contact method"
            value={labelFromOptions(CONTACT_METHOD_OPTIONS, learner.PREFERREDCONTACTMETHOD)}
          />
          <Row label="Next of kin name" value={learner.NEXTOFKINNAME || '—'} />
          <Row label="Next of kin relationship" value={learner.NEXTOFKINRELATIONSHIP || '—'} />
          <Row label="Next of kin phone" value={learner.NEXTOFKINPHONE || '—'} />
          <Row label="Contract type" value={labelFromOptions(CONTRACT_TYPE_OPTIONS, learner.CONTRACTTYPE)} />
        </section>

        <section className="detail-section">
          <h3>Apprenticeship aim</h3>
          <Row label="Standard" value={standardLabel(learner, { withLevel: false })} />
          <Row label="Start date" value={formatDate(learner.LEARNSTARTDATE)} />
          <Row label="Planned end date" value={formatDate(learner.LEARNPLANENDDATE)} />
          <Row
            label="Status"
            value={
              <span className={statusClassName(learner.COMPSTATUS)}>
                {describe(COMPLETION_STATUS_LABELS, learner.COMPSTATUS)}
              </span>
            }
          />
          <Row label="Time on programme" value={timeOnProgramme ?? '—'} />
          <Row label="Actual end date" value={formatDate(learner.LEARNACTENDDATE)} />
          <Row label="Outcome" value={describe(OUTCOME_LABELS, learner.OUTCOME)} />
          {learner.COMPSTATUS === 3 && (
            <Row
              label="Withdrawal reason"
              value={labelFromOptions(WITHDRAW_REASON_OPTIONS, learner.WITHDRAWREASON)}
            />
          )}
        </section>

        <section className="detail-section">
          <h3>Officers</h3>

          {officersStatus === 'loading' && <p className="empty-note">Loading officers…</p>}
          {officersStatus === 'error' && <p role="alert">Couldn't load officers.</p>}

          {officersStatus === 'ready' && (
            <>
              {assignedOfficers.length === 0 ? (
                <p className="empty-note">No officers assigned.</p>
              ) : (
                assignedOfficers.map((officer) => (
                  <div className="detail-row" key={officer.OFFICERREFNUMBER}>
                    <span>
                      {officer.OFFICERNAME} ({labelFromOptions(OFFICER_TYPE_OPTIONS, officer.OFFICERTYPE)})
                    </span>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => handleRemoveOfficer(officer.OFFICERREFNUMBER)}
                    >
                      Remove
                    </button>
                  </div>
                ))
              )}

              {officerError && (
                <p className="error-banner" role="alert">
                  {officerError}
                </p>
              )}

              {assignableOfficers.length > 0 && (
                <form className="assign-officer-form" onSubmit={handleAssignOfficer}>
                  <select value={selectedOfficer} onChange={(e) => setSelectedOfficer(e.target.value)}>
                    <option value="">Select an officer to assign…</option>
                    {assignableOfficers.map((officer) => (
                      <option key={officer.OFFICERREFNUMBER} value={officer.OFFICERREFNUMBER}>
                        {officer.OFFICERNAME} ({labelFromOptions(OFFICER_TYPE_OPTIONS, officer.OFFICERTYPE)})
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="secondary" disabled={!selectedOfficer || assigning}>
                    {assigning ? 'Assigning…' : 'Assign'}
                  </button>
                </form>
              )}
            </>
          )}
        </section>
      </aside>
    </div>
  )
}

export default LearnerDetail
