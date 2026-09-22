import { useState } from 'react'
import { WITHDRAW_REASON_OPTIONS } from './ilrCodes'
import { validateWithdrawAimForm } from './validation'

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

function WithdrawAimForm({ learner, onSaved, onCancel }) {
  const startDate = String(learner.LEARNSTARTDATE).slice(0, 10)

  const [actualEndDate, setActualEndDate] = useState(todayString())
  const [withdrawReason, setWithdrawReason] = useState('')
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setServerError(null)

    const form = { actualEndDate, withdrawReason }
    const fieldErrors = validateWithdrawAimForm(form, startDate)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return

    setSaving(true)
    try {
      const res = await fetch(`/api/learners/${learner.LEARNREFNUMBER}/withdraw`, {
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
    <section id="withdraw-aim">
      <h2>Withdraw aim</h2>
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
          <legend>Withdrawal details</legend>

          <Field label="Actual end date" error={errors.actualEndDate} required>
            <input type="date" value={actualEndDate} onChange={(e) => setActualEndDate(e.target.value)} />
          </Field>

          <Field label="Withdrawal reason" error={errors.withdrawReason} required>
            <select value={withdrawReason} onChange={(e) => setWithdrawReason(e.target.value)}>
              <option value="">Select…</option>
              {WITHDRAW_REASON_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </fieldset>

        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Withdraw'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </form>
    </section>
  )
}

export default WithdrawAimForm
