import { currentProgramme } from '../programme'
import { useCallback, useEffect, useState } from 'react'
import {
  SEX_OPTIONS,
  LLDD_HEALTH_PROBLEM_OPTIONS,
  ETHNICITY_OPTIONS,
  WITHDRAW_REASON_OPTIONS,
  CONTACT_METHOD_OPTIONS,
  CONTRACT_TYPE_OPTIONS,
  OFFICER_TYPE_OPTIONS,
} from '../ilrCodes'

// The two caseload roles every learner has exactly one current officer in.
const ASSIGNMENT_ROLES = OFFICER_TYPE_OPTIONS.filter((o) => o.code === 'TUTOR' || o.code === 'ASSESSOR')
import {
  OUTCOME_LABELS,
  describe,
  labelFromOptions,
  labelsFromCommaList,
  formatDate,
  standardLabel,
} from '../lookups'
import CompletionStatus from '../CompletionStatus'
import { learnerActionPath } from './links'
import { EPA_GRADES, outcomeActions } from '../validation'
import {
  ComponentRecords,
  EmploymentRecords,
  HoursRecords,
  IlrSummary,
  PriceRecords,
  PriorRecords,
  ProgrammeRecords,
  Row,
  Section,
  SupportRecords,
  changePath,
} from './IlrRecords'

const gradeLabel = (code) => EPA_GRADES.find((g) => g.code === code)?.label ?? (code === 'FL' ? 'Fail' : code)

// What a manager can record next for the programme (docs/ilr-outcomes.md).
const OUTCOME_LINK_LABELS = {
  'learning-complete': 'Training finished',
  'epa-result': 'Record the EPA result',
  break: 'Break in learning',
  withdraw: 'Withdraw',
  return: 'Return from the break',
}
function OutcomeLinks({ learner, back, ilr }) {
  const actions = outcomeActions({
    compStatus: learner.COMPSTATUS,
    outcome: learner.OUTCOME,
    actualEndDate: learner.LEARNACTENDDATE,
  }).map((a) => [a, OUTCOME_LINK_LABELS[a]])
  if (learner.LEARNACTENDDATE) actions.push(['correct', 'Correct the outcome'])
  if (ilr?.returnUndo?.allowed) actions.push(['undo-return', 'Undo the return'])
  if (actions.length === 0) return null
  return (
    <div className="outcome-actions">
      {actions.map(([action, label]) => (
        <a key={action} className="ui-button ui-button--secondary" href={learnerActionPath(learner.LEARNREFNUMBER, `outcome/${action}`, back)}>
          {label}
        </a>
      ))}
    </div>
  )
}

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
// continuing, or to its actual end date once it has one: completed,
// withdrawn, on a break, or training finished and waiting for the EPA
// (Outcome 8), which also says how long they've been waiting.
function timeOnPlacement(learner) {
  if (!learner.LEARNSTARTDATE) return null
  const start = new Date(learner.LEARNSTARTDATE)
  if (!learner.LEARNACTENDDATE) return formatDuration(wholeMonthsBetween(start, new Date()))
  const end = new Date(learner.LEARNACTENDDATE)
  const training = formatDuration(wholeMonthsBetween(start, end))
  if (learner.COMPSTATUS !== 1 || learner.OUTCOME !== 8) return training
  const waiting = formatDuration(wholeMonthsBetween(end, new Date())).toLowerCase()
  return `${training} to the end of training, waiting for the EPA for ${waiting}`
}

// After a return from a break: each spell of learning and the break, e.g.
// "5 months before the break, then 1 month since returning (break of 1 year
// 2 months)". Null when the current programme isn't a restart.
function timeAcrossSpells(learner, ilr) {
  const programme = ilr && currentProgramme(ilr.aims)
  if (!programme?.ORIGLEARNSTARTDATE) return null
  const earlier = ilr.aims
    .filter((a) => a.AIMTYPE === 1 && a.AIMSEQNUMBER < programme.AIMSEQNUMBER && a.LEARNACTENDDATE &&
      (a.ORIGLEARNSTARTDATE ?? a.LEARNSTARTDATE) === programme.ORIGLEARNSTARTDATE)
    .sort((a, b) => a.AIMSEQNUMBER - b.AIMSEQNUMBER)
  if (earlier.length === 0) return null
  const months = (from, to) => wholeMonthsBetween(new Date(from), new Date(to))
  const before = earlier.reduce((n, a) => n + months(a.LEARNSTARTDATE, a.LEARNACTENDDATE), 0)
  const broke = earlier.at(-1).LEARNACTENDDATE
  const since = months(programme.LEARNSTARTDATE, programme.LEARNACTENDDATE ?? new Date())
  const lower = (text) => text.charAt(0).toLowerCase() + text.slice(1)
  return `${formatDuration(before)} before the break, then ${lower(formatDuration(since))} since returning (break of ${lower(formatDuration(months(broke, programme.LEARNSTARTDATE)))})`
}

// The learner page's Record tab (Warren): everything Warren holds about the
// learner, read only, grouped as the ILR groups it, each section with the
// ILR 2026 to 2027 checks that fail for it. canManage: the signed-in user
// is a manager, so can change the learner and their officers, and sees NI
// number, ethnicity, prices and payments (the server sends them to managers
// only). Everyone else reads. back: the page's ?back=, kept on the edit and
// outcome forms.
function LearnerRecord({ learner, canManage, back }) {
  const [ilr, setIlr] = useState(null)
  const [ilrStatus, setIlrStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [ilrError, setIlrError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/learners/${encodeURIComponent(learner.LEARNREFNUMBER)}/ilr`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Server responded with ${res.status}`)
        if (cancelled) return
        setIlr(data)
        setIlrStatus('ready')
      } catch (err) {
        if (cancelled) return
        setIlrError(err.message)
        setIlrStatus('error')
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [learner.LEARNREFNUMBER])

  // A manager's links to change sections and records.
  const manage = canManage ? { learnRefNumber: learner.LEARNREFNUMBER, back } : null

  // Each section's failing checks.
  const rulesFor = (section) => (ilr?.rules ?? []).filter((r) => r.section === section)
  const ilrSection = (render) =>
    ilrStatus === 'ready' ? render(ilr) : <p className="record-empty">{ilrStatus === 'loading' ? 'Loading…' : '—'}</p>

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
    <>
      <IlrSummary ilr={ilr} status={ilrStatus} error={ilrError} canSeePrices={canManage} />

      <div className="learner-record">
        <Section title="Personal details" rules={rulesFor('personal')} change={changePath(manage, 'personal')}>
          <dl>
            <Row label="Learner reference" value={learner.LEARNREFNUMBER} />
            <Row label="ULN" value={learner.ULN ?? '—'} />
            <Row label="Date of birth" value={formatDate(learner.DATEOFBIRTH)} />
            <Row label="Age" value={age === null ? '—' : `${age} years old`} />
            <Row label="Sex" value={labelFromOptions(SEX_OPTIONS, learner.SEX)} />
            {canManage && <Row label="NI number" value={learner.NINUMBER || '—'} />}
            <Row label="Previous postcode" value={learner.POSTCODEPRIOR || '—'} />
            <Row label="Current postcode" value={learner.POSTCODE || '—'} />
            <Row label="Phone" value={learner.TELNO || '—'} />
            <Row label="Email" value={learner.EMAIL || '—'} />
          </dl>
        </Section>

        <Section title="Contact details" change={changePath(manage, 'contact')}>
          <dl>
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
          </dl>
        </Section>

        <Section title="Equality and support" rules={rulesFor('support')} change={changePath(manage, 'support')}>
          <dl>
            {canManage && <Row label="Ethnicity" value={labelFromOptions(ETHNICITY_OPTIONS, learner.ETHNICITY)} />}
            <Row
              label="LLDD health problem"
              value={labelFromOptions(LLDD_HEALTH_PROBLEM_OPTIONS, learner.LLDDHEALTHPROB)}
            />
          </dl>
          {ilrSection((d) => <SupportRecords ilr={d} manage={manage} llddHealthProb={learner.LLDDHEALTHPROB} />)}
        </Section>

        <Section title="Prior attainment" rules={rulesFor('prior')}>
          {ilrSection((d) => <PriorRecords ilr={d} manage={manage} />)}
        </Section>

        <Section title="Employment" rules={rulesFor('employment')}>
          {ilrSection((d) => <EmploymentRecords ilr={d} manage={manage} />)}
        </Section>

        <Section title="Apprenticeship programme" rules={rulesFor('programme')} change={changePath(manage, 'programme')}>
          <dl>
            <Row label="Standard" value={standardLabel(learner, { withLevel: false })} />
            <Row label="Start date" value={formatDate(learner.LEARNSTARTDATE)} />
            <Row label="Planned end date" value={formatDate(learner.LEARNPLANENDDATE)} />
            <Row label="Time on programme" value={timeAcrossSpells(learner, ilr) ?? timeOnProgramme ?? '—'} />
          </dl>
          {ilrSection((d) => <ProgrammeRecords ilr={d} manage={manage} />)}
        </Section>

        <Section title="Off-the-job hours" rules={rulesFor('hours')} change={changePath(manage, 'hours')}>
          {ilrSection((d) => <HoursRecords ilr={d} />)}
        </Section>

        {canManage && (
          <Section title="Prices and payments" rules={rulesFor('prices')}>
            {ilrSection((d) => <PriceRecords ilr={d} manage={manage} />)}
          </Section>
        )}

        <Section title="Component aims" rules={rulesFor('components')}>
          {ilrSection((d) => <ComponentRecords ilr={d} manage={manage} />)}
        </Section>

        <Section title="Outcome" rules={rulesFor('outcome')}>
          <dl>
            <Row
              label="Status"
              value={<CompletionStatus compstatus={learner.COMPSTATUS} plannedEndDate={learner.LEARNPLANENDDATE} outcome={learner.OUTCOME} />}
            />
            <Row
              label={learner.COMPSTATUS === 6 ? 'Last day before the break' : 'Actual end date'}
              value={formatDate(learner.LEARNACTENDDATE)}
            />
            <Row label="Outcome" value={describe(OUTCOME_LABELS, learner.OUTCOME)} />
            <Row label="End of the EPA period" value={formatDate(learner.ACHDATE)} />
            {learner.OUTGRADE && <Row label="Grade" value={gradeLabel(learner.OUTGRADE)} />}
            {learner.COMPSTATUS === 3 && (
              <Row label="Withdrawal reason" value={labelFromOptions(WITHDRAW_REASON_OPTIONS, learner.WITHDRAWREASON)} />
            )}
          </dl>
          {canManage && <OutcomeLinks learner={learner} back={back} ilr={ilr} />}
        </Section>

        <section className="learner-section" aria-label="Officers">
          <h2>Officers</h2>

          {officersStatus === 'loading' && <p className="empty-note">Loading officers…</p>}
          {officersStatus === 'error' && <p role="alert">Couldn't load officers.</p>}

          {officersStatus === 'ready' && (
            <>
              {ASSIGNMENT_ROLES.map(({ code: role, label }) => {
                const current = assignedOfficers.filter((a) => a.ASSIGNMENTROLE === role)
                // Inactive officers' access has ended, so they can't take learners.
                const choices = allOfficers.filter(
                  (o) =>
                    o.OFFICERTYPE === role &&
                    o.ISACTIVE &&
                    !current.some((a) => a.OFFICERREFNUMBER === o.OFFICERREFNUMBER),
                )
                return (
                  <div key={role} className="assignment-role">
                    <dl>
                      <Row
                        label={label}
                        value={current.length > 0 ? current.map((a) => a.OFFICERNAME).join(', ') : 'None assigned'}
                      />
                    </dl>
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
      </div>
    </>
  )
}

export default LearnerRecord
