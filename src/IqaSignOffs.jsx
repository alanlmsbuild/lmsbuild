import { useCallback, useEffect, useState } from 'react'
import './IqaSignOffs.css'
import { EVIDENCE_TYPE_OPTIONS, IQA_OUTCOME_OPTIONS } from './burrowCodes'
import { formatDate, labelFromOptions } from './lookups'
import { validateIqaCheckForm } from './validation'

// Assessor sign-offs for an IQA to check, from GET /api/iqa/sign-offs. The
// server leaves out the IQA's own sign-offs, since nobody checks their own,
// and refuses a check of one if it's sent anyway.
function IqaSignOffs({ onOpenLearner }) {
  const [signOffs, setSignOffs] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null)
  const [checking, setChecking] = useState(null) // REVIEW_ID of the open form, or null
  const [saved, setSaved] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/iqa/sign-offs')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Server responded with ${res.status}`)
      setSignOffs(data)
      setStatus('ready')
      setError(null)
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function handleSaved(signOff) {
    setChecking(null)
    setSaved(`Check saved for “${signOff.TITLE}”.`)
    load()
  }

  const toCheck = signOffs.filter((s) => !s.CHECK_OUTCOME).length

  return (
    <section className="iqa">
      <h2>Sign-offs to check</h2>
      <p className="section-intro">
        Evidence that assessors have signed off. Your own sign-offs aren’t listed: another IQA checks those.
      </p>

      {saved && <p className="success-banner" role="status">{saved}</p>}
      {status === 'loading' && <p className="status-message">Loading sign-offs…</p>}
      {status === 'error' && <p className="status-message" role="alert">Couldn't load sign-offs: {error}</p>}
      {status === 'ready' && signOffs.length === 0 && <p className="empty-note">There are no sign-offs for you to check.</p>}
      {status === 'ready' && signOffs.length > 0 && (
        <p className="filter-count">
          {toCheck} not checked yet, {signOffs.length - toCheck} checked
        </p>
      )}

      <ul className="iqa-list">
        {signOffs.map((s) => (
          <li key={s.REVIEW_ID} className="iqa-card">
            <div className="iqa-card-header">
              <div>
                <h3>{s.TITLE}</h3>
                <p className="iqa-meta">
                  <button type="button" className="link-button" onClick={() => onOpenLearner(s.LEARNREFNUMBER)}>
                    {s.GIVENNAMES} {s.FAMILYNAME}
                  </button>{' '}
                  · {s.LEARNREFNUMBER} · {s.ST_REFERENCE} · {labelFromOptions(EVIDENCE_TYPE_OPTIONS, s.EVIDENCE_TYPE)}
                </p>
              </div>
              <span className={s.CHECK_OUTCOME ? `iqa-status iqa-status-${s.CHECK_OUTCOME}` : 'iqa-status'}>
                {s.CHECK_OUTCOME ? labelFromOptions(IQA_OUTCOME_OPTIONS, s.CHECK_OUTCOME) : 'Not checked'}
              </span>
            </div>

            <dl className="iqa-details">
              <dt>Signed off by</dt>
              <dd>{s.ASSESSOR_NAME} on {formatDate(s.REVIEWED_AT)}</dd>
              {s.REFLECTION && (
                <>
                  <dt>Learner’s reflection</dt>
                  <dd>{s.REFLECTION}</dd>
                </>
              )}
              {s.ASSESSOR_FEEDBACK && (
                <>
                  <dt>Assessor’s feedback</dt>
                  <dd>{s.ASSESSOR_FEEDBACK}</dd>
                </>
              )}
              {s.CHECK_OUTCOME && (
                <>
                  <dt>Last checked</dt>
                  <dd>
                    {s.CHECKED_BY} on {formatDate(s.CHECKED_AT)}
                    {s.CHECK_FEEDBACK && `: ${s.CHECK_FEEDBACK}`}
                  </dd>
                </>
              )}
            </dl>

            {checking === s.REVIEW_ID ? (
              <IqaCheckForm signOff={s} onSaved={handleSaved} onCancel={() => setChecking(null)} />
            ) : (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setSaved(null)
                  setChecking(s.REVIEW_ID)
                }}
              >
                {s.CHECK_OUTCOME ? 'Check again' : 'Record check'}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function IqaCheckForm({ signOff, onSaved, onCancel }) {
  const [form, setForm] = useState({ outcome: '', feedback: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setServerError(null)

    const fieldErrors = validateIqaCheckForm(form)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return

    setSaving(true)
    try {
      const res = await fetch(`/api/iqa/sign-offs/${encodeURIComponent(signOff.REVIEW_ID)}/checks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrors(data.fields || {})
        setServerError(data.error || 'Could not save this check.')
        return
      }
      onSaved(signOff)
    } catch {
      setServerError('Could not reach the server. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="iqa-form" onSubmit={handleSubmit} noValidate>
      {serverError && <p className="error-banner" role="alert">{serverError}</p>}

      <fieldset className="iqa-outcome">
        <legend>Do you agree with this sign-off?</legend>
        {IQA_OUTCOME_OPTIONS.map((o) => (
          <label key={o.code}>
            <input
              type="radio"
              name={`outcome-${signOff.REVIEW_ID}`}
              checked={form.outcome === o.code}
              onChange={() => setForm((f) => ({ ...f, outcome: o.code }))}
            />
            {o.label}
          </label>
        ))}
        {errors.outcome && <span className="field-error">{errors.outcome}</span>}
      </fieldset>

      <label className="field">
        <span>
          Feedback{form.outcome === 'action_required' && <span className="required-mark"> *</span>}
        </span>
        <textarea
          rows={3}
          maxLength={2000}
          value={form.feedback}
          onChange={(e) => setForm((f) => ({ ...f, feedback: e.target.value }))}
        />
        {errors.feedback && <span className="field-error">{errors.feedback}</span>}
      </label>

      <div className="actions-cell">
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save check'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export default IqaSignOffs
