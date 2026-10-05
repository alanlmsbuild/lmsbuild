import { currentProgramme } from '../programme'
import { useEffect, useState } from 'react'
import { OTJ_FIELDS, validateOtjHours } from '../validation'
import { otjMinimumText } from './IlrRecords'

// Changing a programme's off-the-job hours (managers only): planned, removed
// for prior learning, and actual. A new figure is added; changing or
// clearing one already recorded is a correction, with a reason, and the old
// figure is kept in the history.

export const HOURS_HEADING = 'Change off-the-job hours'

function Field({ label, error, hint, children }) {
  return (
    <label className="field field-wide">
      <span>{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}

function HoursForm({ learnRefNumber, onSaved, onCancel }) {
  const [ilr, setIlr] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/learners/${encodeURIComponent(learnRefNumber)}/ilr`)
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Server responded with ${res.status}`)
        if (cancelled) return
        setIlr(data)
        const hours = currentProgramme(data.aims)?.hours ?? []
        const value = (code) => String(hours.find((h) => Number(h.HRSCODE) === code)?.HRSAMOUNT ?? '')
        setForm({ planned: value(1), priorLearning: value(4), actual: value(3), reason: '' })
      } catch (err) {
        if (!cancelled) setLoadError(err.message)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [learnRefNumber])

  const programme = ilr && currentProgramme(ilr.aims)
  const existing = Object.fromEntries((programme?.hours ?? []).map((h) => [Number(h.HRSCODE), Number(h.HRSAMOUNT)]))
  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }))
  const changingRecorded = form && Object.entries(OTJ_FIELDS).some(([field, code]) =>
    existing[code] !== undefined && String(existing[code]) !== String(form[field] ?? '').trim())

  async function handleSubmit(e) {
    e.preventDefault()
    setServerError(null)
    const fieldErrors = validateOtjHours(form, { startDate: programme?.LEARNSTARTDATE, existing })
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return
    setSaving(true)
    try {
      const res = await fetch(`/api/learners/${encodeURIComponent(learnRefNumber)}/ilr-hours`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrors(data.fields || {})
        setServerError(data.error || 'Could not save the hours.')
        return
      }
      onSaved?.()
    } catch {
      setServerError('Could not reach the server. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="edit-learner" className="ilr-record-form">
      <h2>{HOURS_HEADING}</h2>
      <p className="warning-banner" role="alert">
        Dummy data only. Do not enter real people&apos;s details.
      </p>
      {loadError && <p role="alert">Couldn&apos;t load this learner&apos;s hours: {loadError}</p>}
      {ilr && !programme && <p role="alert">This learner has no programme aim.</p>}
      {serverError && (
        <p className="error-banner" role="alert">
          {serverError}
        </p>
      )}
      {form && programme && (
        <form onSubmit={handleSubmit} noValidate>
          <fieldset>
            <legend>Off-the-job training hours</legend>
            <p className="field-hint field-wide">{otjMinimumText(ilr.otj)}</p>
            <Field
              label="Planned hours"
              error={errors.planned}
              hint="For the whole apprenticeship, as on the apprenticeship agreement and training plan. Once returned, only change it to fix an input error made at the start (funding rules, paragraph 89.2)."
            >
              <input type="text" inputMode="numeric" value={form.planned} onChange={(e) => update('planned', e.target.value)} />
            </Field>
            <Field
              label="Hours removed for prior learning"
              error={errors.priorLearning}
              hint="From the initial assessment of evidenced prior learning. It lowers the minimum by the same number of hours, but not below 187."
            >
              <input
                type="text"
                inputMode="numeric"
                value={form.priorLearning}
                onChange={(e) => update('priorLearning', e.target.value)}
              />
            </Field>
            <Field
              label="Actual hours"
              error={errors.actual}
              hint="Eligible hours delivered, recorded at the end of the practical period or when the apprentice leaves early."
            >
              <input type="text" inputMode="numeric" value={form.actual} onChange={(e) => update('actual', e.target.value)} />
            </Field>
            {(changingRecorded || errors.reason) && (
              <Field label="What was wrong?" error={errors.reason}>
                <input type="text" value={form.reason} onChange={(e) => update('reason', e.target.value)} />
              </Field>
            )}
          </fieldset>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        </form>
      )}
    </section>
  )
}

export default HoursForm
