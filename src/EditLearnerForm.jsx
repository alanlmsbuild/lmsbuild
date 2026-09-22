import { useState } from 'react'
import { SEX_OPTIONS, LLDD_HEALTH_PROBLEM_OPTIONS, ETHNICITY_OPTIONS, STANDARD_OPTIONS } from './ilrCodes'
import { validateLearnerEditForm } from './validation'

// Turns a learner+aim row from GET /api/learners into the shape this form's
// fields use, the same shape AddLearnerForm's EMPTY_FORM uses.
function toFormState(learner) {
  return {
    uln: String(learner.ULN ?? ''),
    ethnicity: String(learner.ETHNICITY ?? ''),
    sex: learner.SEX ?? '',
    lldd: String(learner.LLDDHEALTHPROB ?? ''),
    postcodePrior: learner.POSTCODEPRIOR ?? '',
    postcode: learner.POSTCODE ?? '',
    familyName: learner.FAMILYNAME ?? '',
    givenNames: learner.GIVENNAMES ?? '',
    dateOfBirth: learner.DATEOFBIRTH ? String(learner.DATEOFBIRTH).slice(0, 10) : '',
    niNumber: learner.NINUMBER ?? '',
    phone: learner.TELNO ?? '',
    email: learner.EMAIL ?? '',
    startDate: learner.LEARNSTARTDATE ? String(learner.LEARNSTARTDATE).slice(0, 10) : '',
    plannedEndDate: learner.LEARNPLANENDDATE ? String(learner.LEARNPLANENDDATE).slice(0, 10) : '',
    stdCode: String(learner.STDCODE ?? ''),
    dellocPostcode: learner.DELLOCPOSTCODE ?? '',
  }
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

function EditLearnerForm({ learner, onSaved, onCancel }) {
  const [form, setForm] = useState(() => toFormState(learner))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState(null)

  // The aim's start date and standard code can only be changed while it's
  // still continuing (COMPSTATUS 1). Once it's completed or withdrawn, both
  // fields are shown but disabled, and the server would reject a change to
  // either anyway.
  const aimLocked = learner.COMPSTATUS !== 1

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setServerError(null)

    const fieldErrors = validateLearnerEditForm(form)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return

    setSaving(true)
    try {
      const res = await fetch(`/api/learners/${learner.LEARNREFNUMBER}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()

      if (!res.ok) {
        setErrors(data.fields || {})
        setServerError(data.error || 'Could not save these changes.')
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
    <section id="edit-learner">
      <h2>Edit learner</h2>
      <p className="warning-banner" role="alert">
        Dummy data only. Do not enter real people's details.
      </p>

      {serverError && (
        <p className="error-banner" role="alert">
          {serverError}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <fieldset>
          <legend>Learner details</legend>

          <Field label="Learner reference">
            <input type="text" value={learner.LEARNREFNUMBER} disabled />
          </Field>

          <Field label="ULN" error={errors.uln} required>
            <input
              type="text"
              inputMode="numeric"
              value={form.uln}
              onChange={(e) => updateField('uln', e.target.value)}
            />
          </Field>

          <Field label="Ethnicity" error={errors.ethnicity} required>
            <select value={form.ethnicity} onChange={(e) => updateField('ethnicity', e.target.value)}>
              <option value="">Select…</option>
              {ETHNICITY_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Sex" error={errors.sex} required>
            <select value={form.sex} onChange={(e) => updateField('sex', e.target.value)}>
              <option value="">Select…</option>
              {SEX_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="LLDD health problem" error={errors.lldd} required>
            <select value={form.lldd} onChange={(e) => updateField('lldd', e.target.value)}>
              <option value="">Select…</option>
              {LLDD_HEALTH_PROBLEM_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Previous postcode" error={errors.postcodePrior} required>
            <input
              type="text"
              value={form.postcodePrior}
              onChange={(e) => updateField('postcodePrior', e.target.value)}
            />
          </Field>

          <Field label="Current postcode" error={errors.postcode} required>
            <input type="text" value={form.postcode} onChange={(e) => updateField('postcode', e.target.value)} />
          </Field>

          <Field label="Family name" error={errors.familyName}>
            <input type="text" value={form.familyName} onChange={(e) => updateField('familyName', e.target.value)} />
          </Field>

          <Field label="Given names" error={errors.givenNames}>
            <input type="text" value={form.givenNames} onChange={(e) => updateField('givenNames', e.target.value)} />
          </Field>

          <Field label="Date of birth" error={errors.dateOfBirth}>
            <input
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => updateField('dateOfBirth', e.target.value)}
            />
          </Field>

          <Field label="NI number" error={errors.niNumber}>
            <input
              type="text"
              value={form.niNumber}
              placeholder="e.g. AB123456C"
              onChange={(e) => updateField('niNumber', e.target.value)}
            />
          </Field>

          <Field label="Phone" error={errors.phone}>
            <input type="tel" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
          </Field>

          <Field label="Email" error={errors.email}>
            <input type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
          </Field>
        </fieldset>

        <fieldset>
          <legend>Apprenticeship aim</legend>

          <Field label="Start date" error={errors.startDate} required>
            <input
              type="date"
              value={form.startDate}
              disabled={aimLocked}
              onChange={(e) => updateField('startDate', e.target.value)}
            />
            {aimLocked && (
              <span className="field-hint">This aim is no longer continuing, so its start date is locked.</span>
            )}
          </Field>

          <Field label="Planned end date" error={errors.plannedEndDate} required>
            <input
              type="date"
              value={form.plannedEndDate}
              onChange={(e) => updateField('plannedEndDate', e.target.value)}
            />
          </Field>

          <Field label="Standard code" error={errors.stdCode} required>
            <select value={form.stdCode} disabled={aimLocked} onChange={(e) => updateField('stdCode', e.target.value)}>
              <option value="">Select…</option>
              {STANDARD_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.code} - {o.label}
                </option>
              ))}
            </select>
            {aimLocked && (
              <span className="field-hint">This aim is no longer continuing, so its standard code is locked.</span>
            )}
          </Field>

          <Field label="Delivery location postcode" error={errors.dellocPostcode} required>
            <input
              type="text"
              value={form.dellocPostcode}
              onChange={(e) => updateField('dellocPostcode', e.target.value)}
            />
          </Field>
        </fieldset>

        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </form>
    </section>
  )
}

export default EditLearnerForm
