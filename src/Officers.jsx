import { useCallback, useEffect, useState } from 'react'
import { OFFICER_TYPE_OPTIONS } from './ilrCodes'
import { labelFromOptions } from './lookups'
import { validateOfficerForm } from './validation'

const EMPTY_FORM = { name: '', officerType: '', email: '', phone: '' }

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

function Officers() {
  const [officers, setOfficers] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null)

  const [form, setForm] = useState(EMPTY_FORM)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState(null)
  const [successRef, setSuccessRef] = useState(null)

  const loadOfficers = useCallback(async () => {
    try {
      const res = await fetch('/api/officers')
      if (!res.ok) throw new Error(`Server responded with ${res.status}`)
      const data = await res.json()
      setOfficers(data)
      setStatus('ready')
      setError(null)
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    loadOfficers()
  }, [loadOfficers])

  function updateField(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSuccessRef(null)
    setServerError(null)

    const fieldErrors = validateOfficerForm(form)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return

    setSaving(true)
    try {
      const res = await fetch('/api/officers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()

      if (!res.ok) {
        setErrors(data.fields || {})
        setServerError(data.error || 'Could not save the new officer.')
        return
      }

      setSuccessRef(data.officerRefNumber)
      setForm(EMPTY_FORM)
      loadOfficers()
    } catch {
      setServerError('Could not reach the server. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="officers">
      <h2>Officers</h2>
      <p className="section-intro">Tutors, assessors, and other staff who support learners.</p>

      {status === 'loading' && <p>Loading officers…</p>}
      {status === 'error' && <p role="alert">Couldn't load officers: {error}</p>}

      {status === 'ready' && officers.length === 0 && <p>No officers yet.</p>}

      {status === 'ready' && officers.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>Name</th>
                <th>Type</th>
                <th>Email</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {officers.map((officer) => (
                <tr key={officer.OFFICERREFNUMBER}>
                  <td>{officer.OFFICERREFNUMBER}</td>
                  <td>{officer.OFFICERNAME}</td>
                  <td>{labelFromOptions(OFFICER_TYPE_OPTIONS, officer.OFFICERTYPE)}</td>
                  <td>{officer.EMAIL || '—'}</td>
                  <td>{officer.TELNO || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3>Add an officer</h3>
      {successRef && (
        <p className="success-banner" role="status">
          Saved. New officer reference: <strong>{successRef}</strong>
        </p>
      )}
      {serverError && (
        <p className="error-banner" role="alert">
          {serverError}
        </p>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <fieldset>
          <legend>Officer details</legend>

          <Field label="Name" error={errors.name} required>
            <input type="text" value={form.name} onChange={(e) => updateField('name', e.target.value)} />
          </Field>

          <Field label="Officer type" error={errors.officerType} required>
            <select value={form.officerType} onChange={(e) => updateField('officerType', e.target.value)}>
              <option value="">Select…</option>
              {OFFICER_TYPE_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Email" error={errors.email}>
            <input type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} />
          </Field>

          <Field label="Phone" error={errors.phone}>
            <input type="tel" value={form.phone} onChange={(e) => updateField('phone', e.target.value)} />
          </Field>
        </fieldset>

        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Add officer'}
        </button>
      </form>
    </section>
  )
}

export default Officers
