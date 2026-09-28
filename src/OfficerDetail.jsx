import { useCallback, useEffect, useState } from 'react'
import { OFFICER_TYPE_OPTIONS } from './ilrCodes'
import { labelFromOptions, standardLabel } from './lookups'
import CompletionStatus from './CompletionStatus'
import { Button, Card, Field, Notice } from './ui/components'

function Row({ label, value }) {
  return (
    <div className="detail-row">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value}</span>
    </div>
  )
}

// Taking this officer off a learner. Every learner keeps one tutor and one
// assessor, so this asks who takes over: saving makes them the learner's
// officer in that role, and the server ends this officer's assignment
// (sets ENDEDAT) in the same step. Nothing is deleted.
function ReplaceOfficerForm({ officer, learner, role, officers, onReplaced, onCancel }) {
  const roleLabel = labelFromOptions(OFFICER_TYPE_OPTIONS, role).toLowerCase()
  const candidates = officers.filter(
    (o) => o.OFFICERTYPE === role && o.ISACTIVE && o.OFFICERREFNUMBER !== officer.OFFICERREFNUMBER,
  )
  const [replacement, setReplacement] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const learnerName = `${learner.GIVENNAMES} ${learner.FAMILYNAME}`

  async function handleSubmit(e) {
    e.preventDefault()
    if (!replacement) {
      setError(`Choose who takes over as ${learnerName}'s ${roleLabel}.`)
      return
    }
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/learners/${encodeURIComponent(learner.LEARNREFNUMBER)}/officers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ officerRefNumber: replacement, role }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not change the officer.')
        return
      }
      const name = candidates.find((o) => o.OFFICERREFNUMBER === replacement)?.OFFICERNAME ?? replacement
      onReplaced(`${name} is now ${learnerName}'s ${roleLabel}, and ${officer.OFFICERNAME} is off their caseload.`)
    } catch {
      setError('Could not reach the server. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card as="div" className="replace-officer" title={`Remove ${learnerName}`} titleLevel={4}>
      {candidates.length === 0 ? (
        <div className="ui-stack">
          <Notice tone="error">
            {learnerName} must keep a {roleLabel}, and there&apos;s no other {roleLabel} to take over. Add one on the
            Officers page first.
          </Notice>
          <div className="ui-actions">
            <Button variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <form className="ui-stack" onSubmit={handleSubmit} noValidate>
          <Field
            label={`Who takes over as ${learnerName}'s ${roleLabel}?`}
            hint={`Every learner keeps one tutor and one assessor. ${officer.OFFICERNAME}'s assignment ends when you save, and stays in the caseload history.`}
            error={error}
          >
            {(props) => (
              <select {...props} value={replacement} onChange={(e) => setReplacement(e.target.value)}>
                <option value="">Choose a {roleLabel}…</option>
                {candidates.map((o) => (
                  <option key={o.OFFICERREFNUMBER} value={o.OFFICERREFNUMBER}>
                    {o.OFFICERNAME}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="ui-actions">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Replace and remove'}
            </Button>
            <Button variant="secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  )
}

// `learners` is the full learner list App already fetched for the Learners
// tab. The officer's assignments come back as learner references only, and
// are matched against that list to get each learner's standard and status.
// `officers` is every officer, for choosing a replacement.
function OfficerDetail({ officer, officers, learners, learnersStatus, onClose, onOpenLearner, onChanged }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // The officer's role for each learner on their caseload, by reference.
  const [roleByRef, setRoleByRef] = useState(new Map())
  const [assignedStatus, setAssignedStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [replacing, setReplacing] = useState(null) // the learner reference being removed, or null
  const [replacedMessage, setReplacedMessage] = useState(null)

  const loadAssigned = useCallback(async () => {
    try {
      const res = await fetch(`/api/officers/${officer.OFFICERREFNUMBER}/learners`)
      if (!res.ok) throw new Error('Server error')
      const rows = await res.json()
      setRoleByRef(new Map(rows.map((r) => [r.LEARNREFNUMBER, r.ASSIGNMENTROLE])))
      setAssignedStatus('ready')
    } catch {
      setAssignedStatus('error')
    }
  }, [officer.OFFICERREFNUMBER])

  useEffect(() => {
    loadAssigned()
  }, [loadAssigned])

  function handleReplaced(message) {
    setReplacing(null)
    setReplacedMessage(message)
    loadAssigned()
    onChanged?.()
  }

  const assignedLearners = learners.filter((l) => roleByRef.has(l.LEARNREFNUMBER))

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

              {replacedMessage && <Notice tone="success">{replacedMessage}</Notice>}

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
                          {learner.LEARNREFNUMBER} · {standardLabel(learner, { withLevel: false })}
                        </span>
                      </div>
                      <div className="officer-learner-side">
                        <CompletionStatus compstatus={learner.COMPSTATUS} plannedEndDate={learner.LEARNPLANENDDATE} />
                        <button
                          type="button"
                          className="link-button"
                          aria-expanded={replacing === learner.LEARNREFNUMBER}
                          onClick={() => {
                            setReplacedMessage(null)
                            setReplacing(learner.LEARNREFNUMBER)
                          }}
                        >
                          Remove
                        </button>
                      </div>
                      {replacing === learner.LEARNREFNUMBER && (
                        <ReplaceOfficerForm
                          officer={officer}
                          learner={learner}
                          role={roleByRef.get(learner.LEARNREFNUMBER)}
                          officers={officers}
                          onReplaced={handleReplaced}
                          onCancel={() => setReplacing(null)}
                        />
                      )}
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
