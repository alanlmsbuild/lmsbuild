import { useEffect } from 'react'
import {
  SEX_OPTIONS,
  LLDD_HEALTH_PROBLEM_OPTIONS,
  ETHNICITY_OPTIONS,
  STANDARD_OPTIONS,
  WITHDRAW_REASON_OPTIONS,
  CONTACT_METHOD_OPTIONS,
  CONTRACT_TYPE_OPTIONS,
} from './ilrCodes'
import {
  COMPLETION_STATUS_LABELS,
  OUTCOME_LABELS,
  describe,
  labelFromOptions,
  labelsFromCommaList,
  formatDate,
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
          <Row label="Standard" value={labelFromOptions(STANDARD_OPTIONS, learner.STDCODE)} />
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
      </aside>
    </div>
  )
}

export default LearnerDetail
