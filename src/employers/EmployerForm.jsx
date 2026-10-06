import { useEffect, useState } from 'react'
import { usePageTitle } from '../shell/navigation'
import { formatDate } from '../lookups'
import { validateEmployerForm } from '../validation'
import { Choices, Notice } from '../ui/components'
import { CompanyStatus } from './Employers'
import { registeredOffice } from './EmployerPage'

// Adding an employer, or changing one (managers only). A company is found
// by searching Companies House live (by name, or its number), and the one
// chosen is shown as Companies House has it now, before it's saved. The
// server fetches it again live when it's saved (server/employers.js).

const WHERE = [
  { code: 'ch', label: 'On Companies House' },
  { code: 'not', label: 'Not on Companies House (for example a sole trader, partnership or public body)' },
]

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

async function getJson(url, options) {
  const res = await fetch(url, options)
  const data = await res.json()
  return { ok: res.ok, data }
}

// The company chosen, as Companies House has it now.
function ChosenCompany({ company, onChangeCompany }) {
  return (
    <div className="chosen-company" aria-live="polite">
      <p>
        <strong>{company.COMPANYNAME}</strong> ({company.COMPANYNUMBER}) <CompanyStatus status={company.COMPANYSTATUS} />
      </p>
      <dl className="employer-details">
        <dt>Type</dt>
        <dd>{company.COMPANYTYPE ?? '—'}</dd>
        <dt>Incorporated</dt>
        <dd>{formatDate(company.DATEOFCREATION)}</dd>
        <dt>Registered office</dt>
        <dd>{registeredOffice(company) ?? '—'}</dd>
        <dt>SIC codes</dt>
        <dd>{company.SICCODES?.length ? company.SICCODES.join(', ') : '—'}</dd>
      </dl>
      {!company.canChoose && <Notice tone="error">This company is closed, so it can&apos;t be an employer.</Notice>}
      <button type="button" className="secondary" onClick={onChangeCompany}>
        Choose a different company
      </button>
    </div>
  )
}

function CompanySearch({ onChoose, error }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)

  async function search() {
    setSearching(true)
    setSearchError(null)
    try {
      const { ok, data } = await getJson(`/api/companies-house/search?q=${encodeURIComponent(q)}`)
      if (!ok) {
        setSearchError(data.fields?.q ?? data.error)
        setResults(null)
      } else setResults(data.results)
    } catch {
      setSearchError('Could not reach the server. Please try again.')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="company-search">
      <Field label="Company name or number" error={searchError ?? error} hint="Searches Companies House now.">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              search()
            }
          }}
        />
      </Field>
      <button type="button" className="secondary" onClick={search} disabled={searching}>
        {searching ? 'Searching…' : 'Search Companies House'}
      </button>
      {results?.length === 0 && <p>Companies House has no company matching that.</p>}
      {results?.length > 0 && (
        <ul className="company-results">
          {results.map((r) => (
            <li key={r.companyNumber}>
              <div>
                <strong>{r.name}</strong> ({r.companyNumber}) <CompanyStatus status={r.status} />
                <br />
                <span className="field-hint">{[r.address, r.dateOfCreation && `incorporated ${formatDate(r.dateOfCreation)}`].filter(Boolean).join(' · ')}</span>
              </div>
              <button type="button" className="secondary" onClick={() => onChoose(r.companyNumber)} disabled={!r.canChoose}>
                {r.canChoose ? 'Choose' : 'Closed'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function EmployerForm({ employerId, onDone, onCancel }) {
  const adding = !employerId
  usePageTitle(adding ? 'Add an employer' : 'Change employer')
  const [employer, setEmployer] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [form, setForm] = useState(adding ? { where: '', name: '', notOnCompaniesHouse: '', employerRef: '', isActive: true } : null)
  const [company, setCompany] = useState(null) // the company chosen, live
  const [choosing, setChoosing] = useState(adding)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (adding) return
    let live = true
    getJson(`/api/employers/${encodeURIComponent(employerId)}`)
      .then(({ ok, data }) => {
        if (!live) return
        if (!ok) return setLoadError(data.error)
        const e = data.employer
        setEmployer(e)
        setForm({
          where: e.COMPANYNUMBER ? 'ch' : e.NOTONCOMPANIESHOUSE ? 'not' : '',
          name: e.COMPANYNUMBER ? '' : e.NAME,
          notOnCompaniesHouse: e.NOTONCOMPANIESHOUSE ?? '',
          employerRef: e.EMPLOYERREF == null ? '' : String(e.EMPLOYERREF),
          isActive: e.ISACTIVE,
        })
        setChoosing(!e.COMPANYNUMBER)
      })
      .catch(() => live && setLoadError('Could not reach the server. Please try again.'))
    return () => {
      live = false
    }
  }, [adding, employerId])

  const update = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  async function choose(number) {
    setServerError(null)
    setErrors({})
    try {
      const { ok, data } = await getJson(`/api/companies-house/company/${encodeURIComponent(number)}`)
      if (!ok) return setErrors({ companyNumber: data.error })
      setCompany(data.company)
      setChoosing(false)
    } catch {
      setServerError('Could not reach the server. Please try again.')
    }
  }

  // The company number to save: the one just chosen, or the employer's own.
  const companyNumber = form?.where === 'ch' ? (company?.COMPANYNUMBER ?? (choosing ? '' : employer?.COMPANYNUMBER ?? '')) : ''

  async function submit(e) {
    e.preventDefault()
    setServerError(null)
    if (!form.where) return setErrors({ where: 'Choose whether the employer is on Companies House.' })
    if (form.where === 'ch' && !companyNumber) return setErrors({ companyNumber: 'Search for the company and choose it.' })
    if (company && !company.canChoose) return setErrors({ companyNumber: 'This company is closed. Choose a different one.' })
    const body = {
      companyNumber,
      name: form.where === 'not' ? form.name : '',
      notOnCompaniesHouse: form.where === 'not' ? form.notOnCompaniesHouse : '',
      employerRef: form.employerRef,
      isActive: form.isActive,
    }
    const fieldErrors = validateEmployerForm(body)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return
    setSaving(true)
    try {
      const { ok, data } = await getJson(adding ? '/api/employers' : `/api/employers/${encodeURIComponent(employerId)}`, {
        method: adding ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!ok) {
        setErrors(data.fields || {})
        setServerError(data.error || 'Could not save the employer.')
        return
      }
      onDone(adding ? data.employerId : employerId)
    } catch {
      setServerError('Could not reach the server. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section id="employer-form" className="ilr-record-form">
      <h2>{adding ? 'Add an employer' : `Change ${employer?.NAME ?? 'employer'}`}</h2>
      <p className="warning-banner" role="alert">
        Test data only. Employers added now are test employers.
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
            <legend>The employer</legend>
            <Choices legend="Is the employer on Companies House?" name="where" options={WHERE} value={form.where} onChange={(v) => update('where', v)} error={errors.where} />

            {form.where === 'ch' && company && !choosing && <ChosenCompany company={company} onChangeCompany={() => setChoosing(true)} />}
            {form.where === 'ch' && !company && !choosing && employer?.COMPANYNUMBER && (
              <div className="chosen-company">
                <p>
                  <strong>{employer.NAME}</strong> ({employer.COMPANYNUMBER})
                </p>
                <button type="button" className="secondary" onClick={() => setChoosing(true)}>
                  Change the company
                </button>
              </div>
            )}
            {form.where === 'ch' && choosing && <CompanySearch onChoose={choose} error={errors.companyNumber} />}
            {form.where === 'ch' && !choosing && errors.companyNumber && <span className="field-error">{errors.companyNumber}</span>}

            {form.where === 'not' && (
              <>
                <Field label="Name" error={errors.name}>
                  <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)} />
                </Field>
                <Field label="Why isn't it on Companies House?" error={errors.notOnCompaniesHouse} hint="For example: sole trader, partnership, public body or charity not registered as a company.">
                  <input type="text" value={form.notOnCompaniesHouse} onChange={(e) => update('notOnCompaniesHouse', e.target.value)} />
                </Field>
              </>
            )}

            <Field label="Employer reference number (ERN, optional)" error={errors.employerRef} hint="9 digits. 999999999 if the employer isn't on the Employer Data Service.">
              <input type="text" inputMode="numeric" value={form.employerRef} onChange={(e) => update('employerRef', e.target.value)} />
            </Field>

            {!adding && (
              <label className="field field-wide checkbox-field">
                <span>
                  <input type="checkbox" checked={form.isActive} onChange={(e) => update('isActive', e.target.checked)} /> Still used
                </span>
                <span className="field-hint">Untick when the employer is no longer used. Employers are never deleted.</span>
              </label>
            )}
          </fieldset>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : adding ? 'Add employer' : 'Save changes'}
          </button>
          <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        </form>
      )}
    </section>
  )
}

export default EmployerForm
