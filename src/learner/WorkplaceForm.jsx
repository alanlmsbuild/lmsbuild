import { useEffect, useState } from 'react'
import { todayString, validateWorkplace } from '../validation'
import { formatDate } from '../lookups'
import { Choices } from '../ui/components'

// Changing an apprentice's workplace (managers only): the site they work at
// and their line manager, on one of their current employer links. Moving
// from one site to another starts a new link from the date of the move.
// When the site changes, it asks whether their open aims' delivery location
// postcode should become the new site's: never changed without asking
// (server/employerSites.js).

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

const YES_NO = [
  { code: 'yes', label: 'Yes, use the new site\'s postcode' },
  { code: 'no', label: 'No, leave them as they are' },
]

function WorkplaceForm({ learnRefNumber, onSaved, onCancel }) {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [linkIndex, setLinkIndex] = useState(0)
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let live = true
    fetch(`/api/learners/${encodeURIComponent(learnRefNumber)}/workplace`)
      .then(async (res) => {
        const body = await res.json()
        if (!live) return
        if (!res.ok) return setLoadError(body.error)
        setData(body)
      })
      .catch(() => live && setLoadError('Could not reach the server. Please try again.'))
    return () => {
      live = false
    }
  }, [learnRefNumber])

  const link = data?.links[linkIndex]
  useEffect(() => {
    if (link) setForm({ siteId: link.SITEID ?? '', lineManagerContactId: link.LINEMANAGERCONTACTID ?? '', moveDate: '', updateDelivery: '' })
  }, [link])

  const update = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  if (!data || !link || !form) {
    return (
      <section id="edit-learner" className="ilr-record-form">
        <h2>Change workplace</h2>
        {loadError ? <p role="alert">{loadError}</p> : data?.links.length === 0 ? <p>Not linked to an employer.</p> : <p>Loading…</p>}
      </section>
    )
  }

  const sites = data.sites.filter((s) => s.EMPLOYERID === link.EMPLOYERID)
  const contacts = data.contacts.filter((c) => c.EMPLOYERID === link.EMPLOYERID)
  const chosen = sites.find((s) => s.SITEID === form.siteId)
  const siteChanged = Boolean(form.siteId) && form.siteId !== (link.SITEID ?? '')
  const moving = Boolean(link.SITEID) && siteChanged
  const differing = chosen ? data.openAims.filter((a) => a.DELLOCPOSTCODE !== chosen.POSTCODE) : []
  const ask = siteChanged && differing.length > 0

  async function submit(e) {
    e.preventDefault()
    setServerError(null)
    const body = {
      employerId: link.EMPLOYERID,
      fromDate: link.FROMDATE,
      siteId: form.siteId,
      lineManagerContactId: form.lineManagerContactId,
      moveDate: moving ? form.moveDate : undefined,
      updateDelivery: ask && form.updateDelivery === 'yes',
    }
    const fieldErrors = validateWorkplace(body, { moving, linkFrom: link.FROMDATE, today: todayString() })
    if (ask && !form.updateDelivery) fieldErrors.updateDelivery = 'Say whether their aims should use the new site\'s postcode.'
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return
    setSaving(true)
    try {
      const res = await fetch(`/api/learners/${encodeURIComponent(learnRefNumber)}/workplace`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await res.json()
      if (!res.ok) {
        setErrors(result.fields || {})
        setServerError(result.error || 'Could not save the workplace.')
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
      <h2>Change workplace</h2>
      <p className="warning-banner" role="alert">
        Dummy data only. Do not enter real people&apos;s details.
      </p>
      {serverError && (
        <p className="error-banner" role="alert">
          {serverError}
        </p>
      )}
      <form onSubmit={submit} noValidate>
        <fieldset>
          <legend>Where they work</legend>
          {data.links.length > 1 && (
            <Field label="Employer">
              <select value={linkIndex} onChange={(e) => setLinkIndex(Number(e.target.value))}>
                {data.links.map((l, i) => (
                  <option key={`${l.EMPLOYERID}-${l.FROMDATE}`} value={i}>
                    {l.EMPLOYERNAME} (since {formatDate(l.FROMDATE)})
                  </option>
                ))}
              </select>
            </Field>
          )}
          {data.links.length === 1 && <p className="field-hint field-wide">At {link.EMPLOYERNAME} since {formatDate(link.FROMDATE)}.</p>}
          <Field label="Site" error={errors.siteId} hint={sites.length === 0 ? 'This employer has no sites yet: add them on the employer\'s page.' : undefined}>
            <select aria-label="Site" value={form.siteId} onChange={(e) => update('siteId', e.target.value)}>
              <option value="">Not set</option>
              {sites.map((s) => (
                <option key={s.SITEID} value={s.SITEID}>
                  {s.NAME} ({s.POSTCODE})
                </option>
              ))}
              {link.SITEID && !sites.some((s) => s.SITEID === link.SITEID) && <option value={link.SITEID}>{link.SITENAME} (no longer used)</option>}
            </select>
          </Field>
          {moving && (
            <Field label="Date they moved" error={errors.moveDate} hint={`From ${link.SITENAME}. Their time there is kept.`}>
              <input type="date" value={form.moveDate} onChange={(e) => update('moveDate', e.target.value)} />
            </Field>
          )}
          {ask && (
            <Choices
              legend={`Change the delivery location postcode on their open aims to ${chosen.POSTCODE}? Now: ${[...new Set(differing.map((a) => a.DELLOCPOSTCODE ?? 'none'))].join(', ')}.`}
              name="updateDelivery"
              options={YES_NO}
              value={form.updateDelivery}
              onChange={(v) => update('updateDelivery', v)}
              error={errors.updateDelivery}
            />
          )}
          <Field label="Line manager" error={errors.lineManagerContactId} hint="Add them as a contact on the employer's page if they're not listed.">
            <select aria-label="Line manager" value={form.lineManagerContactId} onChange={(e) => update('lineManagerContactId', e.target.value)}>
              <option value="">Not set</option>
              {contacts.map((c) => (
                <option key={c.CONTACTID} value={c.CONTACTID}>
                  {c.NAME}
                  {c.JOBTITLE ? `, ${c.JOBTITLE}` : ''}
                </option>
              ))}
              {link.LINEMANAGERCONTACTID && !contacts.some((c) => c.CONTACTID === link.LINEMANAGERCONTACTID) && (
                <option value={link.LINEMANAGERCONTACTID}>{link.LINEMANAGERNAME} (no longer current)</option>
              )}
            </select>
          </Field>
        </fieldset>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save workplace'}
        </button>
        <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </form>
    </section>
  )
}

export default WorkplaceForm
