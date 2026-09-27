import { useEffect, useState } from 'react'
import { validateProgressReviewForm } from './validation'

// A small modal for recording a progress review against a learner, saved
// to the PROGRESS_REVIEW table. `today` comes from the server so the
// default date matches the date My day was worked out for.
function ProgressReviewForm({ learner, officer, today, onSaved, onCancel }) {
  const [form, setForm] = useState({ reviewDate: today, employerAttended: null, summary: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState(null)

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && !saving) onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onCancel, saving])

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setServerError(null)

    const fieldErrors = validateProgressReviewForm(form)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return

    setSaving(true)
    try {
      const res = await fetch(`/api/learners/${encodeURIComponent(learner.LEARNREFNUMBER)}/progress-reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, officerRefNumber: officer.OFFICERREFNUMBER }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrors(data.fields || {})
        setServerError(data.error || 'Could not save this review.')
        return
      }
      onSaved(learner)
    } catch {
      setServerError('Could not reach the server. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="myday-modal-backdrop" onClick={() => !saving && onCancel()}>
      <div
        className="myday-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="review-form-title">Record a progress review</h3>
        <p className="myday-muted">
          {learner.GIVENNAMES} {learner.FAMILYNAME} · {learner.LEARNREFNUMBER}
        </p>
        {serverError && (
          <p className="error-banner" role="alert">
            {serverError}
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <label className="myday-field">
            <span>Review date</span>
            <input
              type="date"
              value={form.reviewDate}
              max={today}
              onChange={(e) => updateField('reviewDate', e.target.value)}
            />
            {errors.reviewDate && <span className="field-error">{errors.reviewDate}</span>}
          </label>

          <fieldset className="myday-radio-group">
            <legend>Did the employer attend?</legend>
            <label>
              <input
                type="radio"
                name="employerAttended"
                checked={form.employerAttended === true}
                onChange={() => updateField('employerAttended', true)}
              />
              Yes
            </label>
            <label>
              <input
                type="radio"
                name="employerAttended"
                checked={form.employerAttended === false}
                onChange={() => updateField('employerAttended', false)}
              />
              No
            </label>
            {errors.employerAttended && <span className="field-error">{errors.employerAttended}</span>}
          </fieldset>

          <label className="myday-field">
            <span>Summary</span>
            <textarea
              rows={4}
              maxLength={1000}
              value={form.summary}
              onChange={(e) => updateField('summary', e.target.value)}
            />
            <span className="myday-muted">{form.summary.length} / 1000</span>
            {errors.summary && <span className="field-error">{errors.summary}</span>}
          </label>

          <div className="myday-modal-actions">
            <button type="submit" className="myday-button" disabled={saving}>
              {saving ? 'Saving…' : 'Save review'}
            </button>
            <button type="button" className="myday-button-secondary" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ProgressReviewForm
