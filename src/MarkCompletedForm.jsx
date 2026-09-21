import { useState } from 'react'
import { validateCompleteAimForm } from './validation'

function todayString() {
  return new Date().toISOString().slice(0, 10)
}

function Field({ label, error, required, children }) {
  return (
    <label className="field">
      <span>
        {label}
        {required && <span className="required-mark"> *</span>}
      </span>
      {children}
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}

function MarkCompletedForm({ learner, onSaved, onCancel }) {
  const startDate = String(learner.LEARNSTARTDATE).slice(0, 10)

  const [actualEndDate, setActualEndDate] = useState(todayString())
  // Achievement date defaults to the actual end date, but can still be
  // changed if it's different.
  const [achievementDate, setAchievementDate] = useState(todayString())
  const [achievementDateTouched, setAchievementDateTouched] = useState(false)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState(null)

  function updateActualEndDate(value) {
    setActualEndDate(value)
    if (!achievementDateTouched) setAchievementDate(value)
  }

  function updateAchievementDate(value) {
    setAchievementDateTouched(true)
    setAchievementDate(value)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setServerError(null)

    const form = { actualEndDate, achievementDate }
    const fieldErrors = validateCompleteAimForm(form, startDate)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return

    setSaving(true)
    try {
      const res = await fetch(`/api/learners/${learner.LEARNREFNUMBER}/complete`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()

      if (!res.ok) {
        setErrors(data.fields || {})
        setServerError(data.error || 'Could not save this.')
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
    <section id="mark-completed">
      <h2>Mark aim as completed</h2>
      <p className="warning-banner" role="alert">
        Dummy data only. Do not enter real people's details.
      </p>
      <p>
        Learner <strong>{learner.LEARNREFNUMBER}</strong> ({learner.GIVENNAMES} {learner.FAMILYNAME})
      </p>

      {serverError && (
        <p className="error-banner" role="alert">
          {serverError}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <fieldset>
          <legend>Completion details</legend>

          <Field label="Actual end date" error={errors.actualEndDate} required>
            <input type="date" value={actualEndDate} onChange={(e) => updateActualEndDate(e.target.value)} />
          </Field>

          <Field label="Achievement date" error={errors.achievementDate} required>
            <input type="date" value={achievementDate} onChange={(e) => updateAchievementDate(e.target.value)} />
          </Field>
        </fieldset>

        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Mark completed'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </form>
    </section>
  )
}

export default MarkCompletedForm
