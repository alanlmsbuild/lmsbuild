import { useEffect, useState } from 'react'
import { usePageTitle } from '../shell/navigation'
import { validateSiteForm } from '../validation'
import { Notice } from '../ui/components'

// Adding or changing one of an employer's sites (managers only). The server
// checks the postcode is a current one on the ONS list (server/employerSites.js).

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

function SiteForm({ employerId, siteId, onDone, onCancel }) {
  const adding = !siteId
  usePageTitle(adding ? 'Add a site' : 'Change site')
  const [employer, setEmployer] = useState(null)
  const [contacts, setContacts] = useState([])
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
        const site = adding ? null : data.sites.find((s) => s.SITEID === siteId)
        if (!adding && !site) return setLoadError(`There's no site ${siteId} at this employer.`)
        setEmployer(data.employer)
        setContacts(data.contacts.filter((c) => c.ISCURRENT || c.CONTACTID === site?.CONTACTID))
        setForm({
          name: site?.NAME ?? '',
          addressLine1: site?.ADDRESSLINE1 ?? '',
          addressLine2: site?.ADDRESSLINE2 ?? '',
          town: site?.TOWN ?? '',
          postcode: site?.POSTCODE ?? '',
          contactId: site?.CONTACTID ?? '',
          isActive: site ? site.ISACTIVE : true,
        })
      })
      .catch(() => live && setLoadError('Could not reach the server. Please try again.'))
    return () => {
      live = false
    }
  }, [employerId, siteId, adding])

  const update = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  async function submit(e) {
    e.preventDefault()
    setServerError(null)
    const fieldErrors = validateSiteForm(form)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return
    setSaving(true)
    try {
      const url = `/api/employers/${encodeURIComponent(employerId)}/sites${adding ? '' : `/${encodeURIComponent(siteId)}`}`
      const res = await fetch(url, { method: adding ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const data = await res.json()
      if (!res.ok) {
        setErrors(data.fields || {})
        setServerError(data.error || 'Could not save the site.')
        return
      }
      onDone(data.siteId)
    } catch {
      setServerError('Could not reach the server. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="site-form" className="ilr-record-form">
      <h2>{adding ? `Add a site${employer ? ` for ${employer.NAME}` : ''}` : `Change ${form?.name || 'site'}`}</h2>
      <p className="warning-banner" role="alert">
        Test data only. Sites added now are test sites.
      </p>
      {loadError && <Notice tone="error">{loadError}</Notice>}
      {serverError && (
        <p className="error-banner" role="alert">
          {serverError}
        </p>
      )}
      {form && (
        <form onSubmit={submit} noValidate>
          <fieldset>
            <legend>The site</legend>
            <Field label="Name" error={errors.name} hint='For example "Tesco Express Crosspool".'>
              <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} />
            </Field>
            <Field label="Address line 1" error={errors.addressLine1}>
              <input type="text" value={form.addressLine1} onChange={(e) => update('addressLine1', e.target.value)} />
            </Field>
            <Field label="Address line 2" error={errors.addressLine2}>
              <input type="text" value={form.addressLine2} onChange={(e) => update('addressLine2', e.target.value)} />
            </Field>
            <Field label="Town" error={errors.town}>
              <input type="text" value={form.town} onChange={(e) => update('town', e.target.value)} />
            </Field>
            <Field label="Postcode" error={errors.postcode} hint="New apprentices' aims here start with this as their delivery location postcode.">
              <input type="text" value={form.postcode} onChange={(e) => update('postcode', e.target.value)} />
            </Field>
            <Field label="Site contact (optional)" error={errors.contactId} hint="Add the person under Contacts first if they're not listed.">
              <select value={form.contactId} onChange={(e) => update('contactId', e.target.value)}>
                <option value="">None</option>
                {contacts.map((c) => (
                  <option key={c.CONTACTID} value={c.CONTACTID}>
                    {c.NAME}
                    {c.JOBTITLE ? `, ${c.JOBTITLE}` : ''}
                  </option>
                ))}
              </select>
            </Field>
            {!adding && (
              <label className="field field-wide checkbox-field">
                <span>
                  <input type="checkbox" checked={form.isActive} onChange={(e) => update('isActive', e.target.checked)} /> Still used
                </span>
                <span className="field-hint">Untick when the site closes. Sites are never deleted.</span>
              </label>
            )}
          </fieldset>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : adding ? 'Add site' : 'Save changes'}
          </button>
          <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        </form>
      )}
    </section>
  )
}

export default SiteForm
