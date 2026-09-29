import { useEffect, useState } from 'react'
import { LEARNER_FAM_OPTIONS, LLDD_CAT_OPTIONS, PRIOR_LEVEL_OPTIONS, llddCatLabel, learnerFamLabel, priorLevelLabel } from '../ilrLabels'
import { formatDate } from '../lookups'
import { validateLearnerFamRecord, validateLlddRecord, validatePriorRecord, validateRemoval } from '../validation'

// Adding, correcting or removing one of a learner's ILR records on the
// Record tab (managers only): an LLDD category, a learner funding and
// monitoring record, or a prior attainment record. A correction is for a
// record entered in error, and keeps the old values (with who and when) in
// the history. A removal marks the record removed, with a reason: it's kept,
// but no longer counted or returned.

const KINDS = {
  lldd: { name: 'an LLDD category', plural: 'LLDD categories' },
  'learner-fam': { name: 'a funding and monitoring record', plural: 'funding and monitoring records' },
  prior: { name: 'a prior attainment record', plural: 'prior attainment records' },
}

export function recordFormTitle(kind, mode) {
  const verb = { new: 'Add', correct: 'Correct', remove: 'Remove' }[mode]
  return `${verb} ${KINDS[kind]?.name ?? 'a record'}`
}

// The record a key points at, from GET /api/learners/:ref/ilr.
function findRecord(ilr, kind, key) {
  if (kind === 'lldd') return ilr.lldd.find((x) => String(x.LLDDCAT) === key)
  if (kind === 'learner-fam') return ilr.learnerFams.find((x) => `${x.LEARNFAMTYPE}-${Number(x.LEARNFAMCODE)}` === key)
  return ilr.prior.find((x) => x.DATELEVELAPP === key)
}

function describeRecord(kind, record) {
  if (kind === 'lldd') return `${llddCatLabel(record.LLDDCAT)}${record.PRIMARYLLDD ? ' (primary)' : ''}`
  if (kind === 'learner-fam') {
    const l = learnerFamLabel(record.LEARNFAMTYPE, record.LEARNFAMCODE)
    return `${l.type}: ${l.code}`
  }
  return `${priorLevelLabel(record.PRIORLEVEL)}, recorded ${formatDate(record.DATELEVELAPP)}`
}

function initialForm(kind, record) {
  if (kind === 'lldd') return { llddCat: record ? String(record.LLDDCAT) : '', primary: record ? record.PRIMARYLLDD === true : false, reason: '' }
  if (kind === 'learner-fam') return { fam: record ? `${record.LEARNFAMTYPE}-${Number(record.LEARNFAMCODE)}` : '', reason: '' }
  return { priorLevel: record ? String(record.PRIORLEVEL) : '', dateLevelApp: record?.DATELEVELAPP ?? '', reason: '' }
}

function validate(kind, mode, form, earliestStart) {
  if (mode === 'remove') return validateRemoval(form)
  if (kind === 'lldd') return validateLlddRecord(form, { earliestStart })
  if (kind === 'learner-fam') return validateLearnerFamRecord(form)
  return validatePriorRecord(form)
}

function Field({ label, error, required, children, hint }) {
  return (
    <label className="field field-wide">
      <span>
        {label}
        {required && <span className="required-mark"> *</span>}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
      {error && <span className="field-error">{error}</span>}
    </label>
  )
}

function IlrRecordForm({ learnRefNumber, kind, recordKey, mode, onSaved, onCancel }) {
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
        setForm(initialForm(kind, mode === 'new' ? null : findRecord(data, kind, recordKey)))
      } catch (err) {
        if (!cancelled) setLoadError(err.message)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [learnRefNumber, kind, recordKey, mode])

  const record = ilr && mode !== 'new' ? findRecord(ilr, kind, recordKey) : null
  const earliestStart = ilr?.aims.map((a) => a.LEARNSTARTDATE).sort()[0]
  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setServerError(null)
    const fieldErrors = validate(kind, mode, form, earliestStart)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return
    const base = `/api/learners/${encodeURIComponent(learnRefNumber)}/ilr/${kind}`
    const [url, method] =
      mode === 'new'
        ? [base, 'POST']
        : mode === 'correct'
          ? [`${base}/${encodeURIComponent(recordKey)}`, 'PUT']
          : [`${base}/${encodeURIComponent(recordKey)}/remove`, 'POST']
    setSaving(true)
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'lldd' ? { ...form, llddCat: Number(form.llddCat) } : form),
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
    <section id="edit-learner" className="ilr-record-form">
      <h2>{recordFormTitle(kind, mode)}</h2>
      <p className="warning-banner" role="alert">
        Dummy data only. Do not enter real people&apos;s details.
      </p>
      {loadError && <p role="alert">Couldn&apos;t load this learner&apos;s records: {loadError}</p>}
      {ilr && mode !== 'new' && !record && (
        <p role="alert">This record isn&apos;t there any more. It may have been removed or corrected.</p>
      )}
      {serverError && (
        <p className="error-banner" role="alert">
          {serverError}
        </p>
      )}

      {form && (mode === 'new' || record) && (
        <form onSubmit={handleSubmit} noValidate>
          <fieldset>
            <legend>{recordFormTitle(kind, mode)}</legend>

            {mode === 'remove' && (
              <>
                <p className="field-wide">
                  <strong>{describeRecord(kind, record)}</strong>
                </p>
                <p className="field-hint field-wide">
                  Only remove a record that was entered in error. It&apos;s kept in the history with your reason, but
                  no longer counts or goes in the ILR return. If something has genuinely changed, add a new record.
                </p>
                <Field label="Why is it being removed?" error={errors.reason} required>
                  <textarea rows={3} value={form.reason} onChange={(e) => update('reason', e.target.value)} />
                </Field>
              </>
            )}

            {mode !== 'remove' && kind === 'lldd' && (
              <>
                <Field label="Category" error={errors.llddCat} required>
                  <select value={form.llddCat} onChange={(e) => update('llddCat', e.target.value)}>
                    <option value="">Select…</option>
                    {record && !LLDD_CAT_OPTIONS.some((o) => o.code === Number(record.LLDDCAT)) && (
                      <option value={record.LLDDCAT}>{llddCatLabel(record.LLDDCAT)}</option>
                    )}
                    {LLDD_CAT_OPTIONS.map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="checkbox-option field-wide">
                  <input type="checkbox" checked={form.primary} onChange={(e) => update('primary', e.target.checked)} />
                  This is the learner&apos;s primary LLDD or health problem
                </label>
                <p className="field-hint field-wide">
                  Only one category can be primary: choosing this one takes it off any other. A learner&apos;s only
                  category is always primary.
                </p>
              </>
            )}

            {mode !== 'remove' && kind === 'learner-fam' && (
              <Field
                label="Funding and monitoring"
                error={errors.fam}
                required
                hint="The ones an apprentice can have. Only one each of EHC, SEN and DLA, and not SEN with an EHC plan."
              >
                <select value={form.fam} onChange={(e) => update('fam', e.target.value)}>
                  <option value="">Select…</option>
                  {LEARNER_FAM_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            {mode !== 'remove' && kind === 'prior' && (
              <>
                <Field label="Prior attainment level" error={errors.priorLevel} required>
                  <select value={form.priorLevel} onChange={(e) => update('priorLevel', e.target.value)}>
                    <option value="">Select…</option>
                    {PRIOR_LEVEL_OPTIONS.map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Date the level applies from"
                  error={errors.dateLevelApp}
                  required
                  hint={
                    earliestStart
                      ? `The start of the learning agreement. The ILR needs one on or before ${formatDate(earliestStart)}, the learner's earliest start (rule R_131).`
                      : 'The start of the learning agreement.'
                  }
                >
                  <input type="date" value={form.dateLevelApp} onChange={(e) => update('dateLevelApp', e.target.value)} />
                </Field>
              </>
            )}

            {mode === 'correct' && (
              <Field label="What was wrong? (optional)" error={errors.reason}>
                <input type="text" value={form.reason} onChange={(e) => update('reason', e.target.value)} />
              </Field>
            )}
          </fieldset>

          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : mode === 'remove' ? 'Remove' : mode === 'correct' ? 'Save correction' : 'Add'}
          </button>
          <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        </form>
      )}
    </section>
  )
}

export default IlrRecordForm
