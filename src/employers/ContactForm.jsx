import { useEffect, useState } from 'react'
import { usePageTitle } from '../shell/navigation'
import { validateContactForm } from '../validation'
import { Notice } from '../ui/components'

// Adding or changing a person at an employer (managers only): one record per
// person. For someone who signs in to Burrow, their email and whether
// they're current are kept in step with their sign-in, which is changed by
// hand for now (server/employerSites.js).

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

function ContactForm({ employerId, contactId, onDone, onCancel }) {
  const adding = !contactId
  usePageTitle(adding ? 'Add a contact' : 'Change contact')
  const [employer, setEmployer] = useState(null)
  const [sites, setSites] = useState([])
  const [contact, setContact] = useState(null)
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let live = true
    fetch(`/api/employers/${encodeURIComponent(employerId)}`)
      .then(async (res) => {
        const data = await res.json()
        if (!live) return
        if (!res.ok) return setLoadError(data.error)
        const c = adding ? null : data.contacts.find((x) => x.CONTACTID === contactId)
        if (!adding && !c) return setLoadError(`There's no contact ${contactId} at this employer.`)
        setEmployer(data.employer)
        setContact(c)
        setSites(data.sites.filter((s) => s.ISACTIVE || s.SITEID === c?.SITEID))
        setForm({
          name: c?.NAME ?? '',
          jobTitle: c?.JOBTITLE ?? '',
          email: c?.EMAIL ?? '',
          phone: c?.PHONE ?? '',
          siteId: c?.SITEID ?? '',
          isCurrent: c ? c.ISCURRENT : true,
        })
      })
      .catch(() => live && setLoadError('Could not reach the server. Please try again.'))
    return () => {
      live = false
    }
  }, [employerId, contactId, adding])

  const update = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  async function submit(e) {
    e.preventDefault()
    setServerError(null)
    const fieldErrors = validateContactForm(form)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return
    setSaving(true)
    try {
      const url = `/api/employers/${encodeURIComponent(employerId)}/contacts${adding ? '' : `/${encodeURIComponent(contactId)}`}`
      const res = await fetch(url, { method: adding ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) {
        setErrors(data.fields || {})
        setServerError(data.error || 'Could not save the contact.')
        return
      }
      onDone(data.contactId)
    } catch {
      setServerError('Could not reach the server. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const signsIn = Boolean(contact?.HASSIGNIN)
  return (
    <section id="contact-form" className="ilr-record-form">
      <h2>{adding ? `Add a contact${employer ? ` at ${employer.NAME}` : ''}` : `Change ${contact?.NAME ?? 'contact'}`}</h2>
      <p className="warning-banner" role="alert">
        Dummy data only. Do not enter real people&apos;s details.
      </p>
      {loadError && <Notice tone="error">{loadError}</Notice>}
      {serverError && (
        <p className="error-banner" role="alert">
          {serverError}
        </p>
      )}
      {signsIn && <Notice tone="info">{contact.NAME} signs in to Burrow, so their email can&apos;t be changed here yet.</Notice>}
      {form && (
        <form onSubmit={submit} noValidate>
          <fieldset>
            <legend>The person</legend>
            <Field label="Name" error={errors.name}>
              <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} />
            </Field>
            <Field label="Job title (optional)" error={errors.jobTitle}>
              <input type="text" value={form.jobTitle} onChange={(e) => update('jobTitle', e.target.value)} />
            </Field>
            <Field label="Email (optional)" error={errors.email}>
              <input type="email" value={form.email} readOnly={signsIn} onChange={(e) => update('email', e.target.value)} />
            </Field>
            <Field label="Phone (optional)" error={errors.phone}>
              <input type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
            </Field>
            <Field label="Based at (optional)" error={errors.siteId} hint="For information only: it doesn't change what they see in Burrow.">
              <select value={form.siteId} onChange={(e) => update('siteId', e.target.value)}>
                <option value="">No particular site</option>
                {sites.map((s) => (
                  <option key={s.SITEID} value={s.SITEID}>
                    {s.NAME}
                  </option>
                ))}
              </select>
            </Field>
            {!adding && (
              <label className="field field-wide checkbox-field">
                <span>
                  <input type="checkbox" checked={form.isCurrent} disabled={signsIn} onChange={(e) => update('isCurrent', e.target.checked)} /> Still
                  current
                </span>
                <span className="field-hint">
                  {signsIn ? 'They can still sign in to Burrow; their sign-in has to be ended first.' : 'Untick when they leave. Contacts are never deleted.'}
                </span>
                {errors.isCurrent && <span className="field-error">{errors.isCurrent}</span>}
              </label>
            )}
          </fieldset>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : adding ? 'Add contact' : 'Save changes'}
          </button>
          <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        </form>
      )}
    </section>
  )
}

export default ContactForm
