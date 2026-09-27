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

// The two caseload roles every learner has exactly one current officer in.
const ASSIGNMENT_ROLES = OFFICER_TYPE_OPTIONS.filter((o) => o.code === 'TUTOR' || o.code === 'ASSESSOR')
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

// canManage: the signed-in user is a manager, so can change the learner and
// their officers. Everyone else reads.
function LearnerDetail({ learner, canManage, onClose, onEdit, onComplete, onWithdraw }) {
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
  // The officer picked in each role's "Change" list, keyed by role.
  const [selectedOfficer, setSelectedOfficer] = useState({})
  const [assigning, setAssigning] = useState(null) // the role being saved, or null
  const [officerError, setOfficerError] = useState(null)

  // The full officer list is only for a manager's "Change ... to" lists.
  const loadOfficers = useCallback(async () => {
    try {
      const [assignedRes, allRes] = await Promise.all([
        fetch(`/api/learners/${learner.LEARNREFNUMBER}/officers`),
        canManage ? fetch('/api/officers') : null,
      ])
      if (!assignedRes.ok || (allRes && !allRes.ok)) throw new Error('Server error')
      setAssignedOfficers(await assignedRes.json())
      setAllOfficers(allRes ? await allRes.json() : [])
      setOfficersStatus('ready')
    } catch {
      setOfficersStatus('error')
    }
  }, [learner.LEARNREFNUMBER, canManage])

  useEffect(() => {
    loadOfficers()
  }, [loadOfficers])

  // Assigning replaces the learner's current tutor or assessor: the server
  // ends the old assignment, so there's always exactly one of each.
  async function handleAssignOfficer(e, role) {
    e.preventDefault()
    const officerRefNumber = selectedOfficer[role]
    if (!officerRefNumber) return
    setOfficerError(null)
    setAssigning(role)
    try {
      const res = await fetch(`/api/learners/${learner.LEARNREFNUMBER}/officers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ officerRefNumber, role }),
      })
      const data = await res.json()

      if (!res.ok) {
        setOfficerError(data.error || 'Could not assign this officer.')
        return
      }

      setSelectedOfficer((prev) => ({ ...prev, [role]: '' }))
      loadOfficers()
    } catch {
      setOfficerError('Could not reach the server. Please try again.')
    } finally {
      setAssigning(null)
    }
  }

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

        {canManage && (
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
        )}

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
              {ASSIGNMENT_ROLES.map(({ code: role, label }) => {
                const current = assignedOfficers.filter((a) => a.ASSIGNMENTROLE === role)
                const choices = allOfficers.filter(
                  (o) => o.OFFICERTYPE === role && !current.some((a) => a.OFFICERREFNUMBER === o.OFFICERREFNUMBER),
                )
                return (
                  <div key={role} className="assignment-role">
                    <Row
                      label={label}
                      value={current.length > 0 ? current.map((a) => a.OFFICERNAME).join(', ') : 'None assigned'}
                    />
                    {canManage && choices.length > 0 && (
                      <form className="assign-officer-form" onSubmit={(e) => handleAssignOfficer(e, role)}>
                        <select
                          aria-label={`Change ${label.toLowerCase()}`}
                          value={selectedOfficer[role] ?? ''}
                          onChange={(e) => setSelectedOfficer((prev) => ({ ...prev, [role]: e.target.value }))}
                        >
                          <option value="">
                            {current.length > 0 ? `Change ${label.toLowerCase()} to…` : `Assign a ${label.toLowerCase()}…`}
                          </option>
                          {choices.map((officer) => (
                            <option key={officer.OFFICERREFNUMBER} value={officer.OFFICERREFNUMBER}>
                              {officer.OFFICERNAME}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="secondary"
                          disabled={!selectedOfficer[role] || assigning !== null}
                        >
                          {assigning === role ? 'Saving…' : current.length > 0 ? 'Change' : 'Assign'}
                        </button>
                      </form>
                    )}
                  </div>
                )
              })}

              {officerError && (
                <p className="error-banner" role="alert">
                  {officerError}
                </p>
              )}
            </>
          )}
        </section>
      </aside>
    </div>
  )
}

export default LearnerDetail
