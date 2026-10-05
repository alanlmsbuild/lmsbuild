import { useEffect, useState } from 'react'
import {
  AIM_FAM_OPTIONS,
  PRICE_OPTIONS,
  afinLabel,
  learnDelFamLabel,
  BSI_OPTIONS,
  EII_OPTIONS,
  EMP_STAT_OPTIONS,
  LEARNER_FAM_OPTIONS,
  LLDD_CAT_OPTIONS,
  LOE_OPTIONS,
  LOU_OPTIONS,
  PRIOR_LEVEL_OPTIONS,
  empStatLabel,
  llddCatLabel,
  learnerFamLabel,
  priorLevelLabel,
} from '../ilrLabels'
import { formatDate } from '../lookups'
import {
  validateAimFamRecord,
  validateComponentAim,
  validatePriceRecord,
  teachingYearEnd,
  validateEmploymentRecord,
  validateLearnerFamRecord,
  validateLlddRecord,
  validatePriorRecord,
  validateRemoval,
} from '../validation'

// Adding, correcting or removing one of a learner's ILR records on the
// Record tab (managers only): an LLDD category, a learner funding and
// monitoring record, a prior attainment record, or an employment status
// (with its monitoring codes). A correction is for a
// record entered in error, and keeps the old values (with who and when) in
// the history. A removal marks the record removed, with a reason: it's kept,
// but no longer counted or returned.

const KINDS = {
  lldd: { name: 'an LLDD category', plural: 'LLDD categories' },
  'learner-fam': { name: 'a funding and monitoring record', plural: 'funding and monitoring records' },
  prior: { name: 'a prior attainment record', plural: 'prior attainment records' },
  employment: { name: 'an employment status', plural: 'employment statuses' },
  'aim-fam': { name: 'a programme funding and monitoring code', plural: 'funding and monitoring codes' },
  price: { name: 'a price or payment', plural: 'prices and payments' },
  component: { name: 'a component aim', plural: 'component aims' },
}

const programmeOf = (ilr) => ilr.aims.find((a) => a.AIMTYPE === 1 && a.AIMSEQNUMBER === 1)

export function recordFormTitle(kind, mode) {
  const verb = { new: 'Add', correct: 'Correct', remove: 'Remove' }[mode]
  return `${verb} ${KINDS[kind]?.name ?? 'a record'}`
}

// The record a key points at, from GET /api/learners/:ref/ilr.
function findRecord(ilr, kind, key) {
  if (kind === 'lldd') return ilr.lldd.find((x) => String(x.LLDDCAT) === key)
  if (kind === 'learner-fam') return ilr.learnerFams.find((x) => `${x.LEARNFAMTYPE}-${Number(x.LEARNFAMCODE)}` === key)
  if (kind === 'employment') return ilr.employment.find((x) => x.DATEEMPSTATAPP === key)
  if (kind === 'aim-fam') return programmeOf(ilr)?.fams.find((x) => x.FAMID === key)
  if (kind === 'price') return programmeOf(ilr)?.fin.find((x) => `${x.AFINTYPE}-${Number(x.AFINCODE)}-${x.AFINDATE}` === key)
  if (kind === 'component') return ilr.aims.find((a) => a.AIMTYPE === 3 && String(a.AIMSEQNUMBER) === key)
  return ilr.prior.find((x) => x.DATELEVELAPP === key)
}

function describeRecord(kind, record) {
  if (kind === 'lldd') return `${llddCatLabel(record.LLDDCAT)}${record.PRIMARYLLDD ? ' (primary)' : ''}`
  if (kind === 'learner-fam') {
    const l = learnerFamLabel(record.LEARNFAMTYPE, record.LEARNFAMCODE)
    return `${l.type}: ${l.code}`
  }
  if (kind === 'employment') return `${empStatLabel(record.EMPSTAT)}, from ${formatDate(record.DATEEMPSTATAPP)}`
  if (kind === 'aim-fam') {
    const l = learnDelFamLabel(record.LEARNDELFAMTYPE, record.LEARNDELFAMCODE)
    return `${l.type}: ${l.code}${record.DATEFROM ? `, ${formatDate(record.DATEFROM)} to ${formatDate(record.DATETO)}` : ''}`
  }
  if (kind === 'price') {
    const l = afinLabel(record.AFINTYPE, record.AFINCODE)
    return `${l.code}: £${Number(record.AFINAMOUNT).toLocaleString('en-GB')}, ${formatDate(record.AFINDATE)}`
  }
  if (kind === 'component') return `${record.AIMTITLE ?? record.LEARNAIMREF} (${record.LEARNAIMREF})`
  return `${priorLevelLabel(record.PRIORLEVEL)}, recorded ${formatDate(record.DATELEVELAPP)}`
}

function initialForm(kind, record, ilr) {
  if (kind === 'aim-fam') {
    return {
      fam: record ? `${record.LEARNDELFAMTYPE}-${Number(record.LEARNDELFAMCODE)}` : '',
      dateFrom: record?.DATEFROM ?? '',
      dateTo: record?.DATETO ?? '',
      origStartDate: programmeOf(ilr)?.ORIGLEARNSTARTDATE ?? '',
      reason: '',
    }
  }
  if (kind === 'price') {
    return {
      fin: record ? `${record.AFINTYPE}-${Number(record.AFINCODE)}` : '',
      date: record?.AFINDATE ?? '',
      amount: record ? String(record.AFINAMOUNT) : '',
      reason: '',
    }
  }
  if (kind === 'component') {
    const programme = programmeOf(ilr)
    return {
      learnAimRef: record?.LEARNAIMREF ?? '',
      title: record?.AIMTITLE ?? '',
      startDate: record?.LEARNSTARTDATE ?? programme?.LEARNSTARTDATE ?? '',
      plannedEndDate: record?.LEARNPLANENDDATE ?? programme?.LEARNPLANENDDATE ?? '',
      priorLearnFundAdj: record?.PRIORLEARNFUNDADJ === null || record?.PRIORLEARNFUNDADJ === undefined ? '' : String(record.PRIORLEARNFUNDADJ),
      otherFundAdj: record?.OTHERFUNDADJ === null || record?.OTHERFUNDADJ === undefined ? '' : String(record.OTHERFUNDADJ),
      reason: '',
    }
  }
  if (kind === 'employment') {
    const code = (type) => {
      const m = record?.esm.find((x) => x.ESMTYPE === type)
      return m ? String(m.ESMCODE) : ''
    }
    const linked = record?.EMPLOYERID && ilr.employers.some((e) => e.EMPLOYERID === record.EMPLOYERID)
    return {
      dateEmpStatApp: record?.DATEEMPSTATAPP ?? '',
      empStat: record ? String(record.EMPSTAT) : '',
      employer: linked ? record.EMPLOYERID : record?.EMPID ? 'other' : '',
      empId: record?.EMPID && !linked ? String(record.EMPID) : '',
      agreemId: record?.AGREEMID ?? '',
      eii: code('EII'),
      loe: code('LOE'),
      sei: Boolean(record?.esm.some((x) => x.ESMTYPE === 'SEI')),
      lou: code('LOU'),
      bsi: code('BSI'),
      pei: Boolean(record?.esm.some((x) => x.ESMTYPE === 'PEI')),
      reason: '',
    }
  }
  if (kind === 'lldd') return { llddCat: record ? String(record.LLDDCAT) : '', primary: record ? record.PRIMARYLLDD === true : false, reason: '' }
  if (kind === 'learner-fam') return { fam: record ? `${record.LEARNFAMTYPE}-${Number(record.LEARNFAMCODE)}` : '', reason: '' }
  return { priorLevel: record ? String(record.PRIORLEVEL) : '', dateLevelApp: record?.DATELEVELAPP ?? '', reason: '' }
}

function validate(kind, mode, form, earliestStart, ilr) {
  if (mode === 'remove') return validateRemoval(form)
  if (kind === 'lldd') return validateLlddRecord(form, { earliestStart })
  if (kind === 'learner-fam') return validateLearnerFamRecord(form)
  if (kind === 'employment') return validateEmploymentRecord(form, { teachingYearEnd: teachingYearEnd() })
  if (kind === 'aim-fam') {
    const p = programmeOf(ilr)
    return validateAimFamRecord(form, { startDate: p?.LEARNSTARTDATE, plannedEndDate: p?.LEARNPLANENDDATE, actualEndDate: p?.LEARNACTENDDATE })
  }
  if (kind === 'price') return validatePriceRecord(form, { startDate: programmeOf(ilr)?.LEARNSTARTDATE })
  if (kind === 'component') return validateComponentAim(form, { programmeStart: programmeOf(ilr)?.LEARNSTARTDATE })
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

// The employment status fields. Only the monitoring codes that fit the
// status are shown (and sent): hours a week and length of employment when
// in paid employment, length of unemployment and benefits when not.
function EmploymentFields({ form, errors, update, employers, earliestStart, mode }) {
  const employed = form.empStat === '10'
  const notEmployed = form.empStat === '11' || form.empStat === '12'
  return (
    <>
      {mode === 'new' && (
        <p className="field-hint field-wide">
          Add a new status from the date something changed: a new job, different hours, or no longer employed. The
          earlier status stays as it was. To fix a mistake, correct the record instead.
        </p>
      )}
      <Field
        label="Date this status applies from"
        error={errors.dateEmpStatApp}
        required
        hint={earliestStart ? `The status on the programme's start date (${formatDate(earliestStart)}) must start before it (rule EmpStat_09).` : null}
      >
        <input type="date" value={form.dateEmpStatApp} onChange={(e) => update('dateEmpStatApp', e.target.value)} />
      </Field>
      <Field label="Employment status" error={errors.empStat} required>
        <select value={form.empStat} onChange={(e) => update('empStat', e.target.value)}>
          <option value="">Select…</option>
          {EMP_STAT_OPTIONS.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      {employed && (
        <>
          <Field label="Employer" error={errors.employer} required>
            <select value={form.employer} onChange={(e) => update('employer', e.target.value)}>
              <option value="">Select…</option>
              {employers.map((e) => (
                <option key={e.EMPLOYERID} value={e.EMPLOYERID}>
                  {e.NAME}
                  {e.EMPLOYERREF ? ` (ERN ${e.EMPLOYERREF})` : ''}
                </option>
              ))}
              <option value="other">Another employer…</option>
            </select>
          </Field>
          {form.employer === 'other' && (
            <Field
              label="Employer reference number (ERN)"
              error={errors.empId}
              required
              hint="9 digits, from the Employer Data Service. 999999999 if the employer isn't on it."
            >
              <input type="text" inputMode="numeric" value={form.empId} onChange={(e) => update('empId', e.target.value)} />
            </Field>
          )}
          <Field label="Hours a week" error={errors.eii} required>
            <select value={form.eii} onChange={(e) => update('eii', e.target.value)}>
              <option value="">Select…</option>
              {EII_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Length of employment" error={errors.loe} required>
            <select value={form.loe} onChange={(e) => update('loe', e.target.value)}>
              <option value="">Select…</option>
              {LOE_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <label className="checkbox-option field-wide">
            <input type="checkbox" checked={form.sei} onChange={(e) => update('sei', e.target.checked)} />
            The learner is self-employed
          </label>
          <Field
            label="Agreement ID (optional)"
            error={errors.agreemId}
            hint="The employer's agreement ID from the Apprenticeship Service, if known."
          >
            <input type="text" value={form.agreemId} onChange={(e) => update('agreemId', e.target.value)} />
          </Field>
        </>
      )}

      {notEmployed && (
        <>
          <Field label="Length of unemployment" error={errors.lou} required={form.empStat === '11'}>
            <select value={form.lou} onChange={(e) => update('lou', e.target.value)}>
              <option value="">{form.empStat === '11' ? 'Select…' : 'Not recorded'}</option>
              {LOU_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Benefits (optional)" error={errors.bsi}>
            <select value={form.bsi} onChange={(e) => update('bsi', e.target.value)}>
              <option value="">None recorded</option>
              {BSI_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <label className="checkbox-option field-wide">
            <input type="checkbox" checked={form.pei} onChange={(e) => update('pei', e.target.checked)} />
            The learner was in full-time education or training before enrolling
          </label>
        </>
      )}
    </>
  )
}

function Select({ value, onChange, options, placeholder = 'Select…' }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.key ?? o.code} value={o.key ?? o.code}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

// A funding and monitoring code on the programme aim. Learning support has
// dates; a restart has the date the learner first started.
function AimFamFields({ form, errors, update }) {
  const type = form.fam.split('-')[0]
  return (
    <>
      <Field
        label="Funding and monitoring code"
        error={errors.fam}
        required
        hint="Source of funding and contract type aren't here: Warren works those out."
      >
        <Select value={form.fam} onChange={(v) => update('fam', v)} options={AIM_FAM_OPTIONS} />
      </Field>
      {type === 'LSF' && (
        <>
          <Field label="Learning support from" error={errors.dateFrom} required>
            <input type="date" value={form.dateFrom} onChange={(e) => update('dateFrom', e.target.value)} />
          </Field>
          <Field label="Learning support to" error={errors.dateTo} required hint="Periods mustn't overlap (rule R_61).">
            <input type="date" value={form.dateTo} onChange={(e) => update('dateTo', e.target.value)} />
          </Field>
        </>
      )}
      {type === 'RES' && (
        <Field
          label="Original start date"
          error={errors.origStartDate}
          required
          hint="When the learner first started this apprenticeship, before the restart."
        >
          <input type="date" value={form.origStartDate} onChange={(e) => update('origStartDate', e.target.value)} />
        </Field>
      )}
    </>
  )
}

// A price or payment on the programme aim (managers only).
function PriceFields({ form, errors, update, mode }) {
  const type = form.fin.split('-')[0]
  return (
    <>
      {mode === 'new' && (
        <p className="field-hint field-wide">
          When a price changes, add a new price from the date it changed: the earlier one stays. To fix a mistake,
          correct the record instead.
        </p>
      )}
      <Field label="Price or payment" error={errors.fin} required>
        <Select value={form.fin} onChange={(v) => update('fin', v)} options={PRICE_OPTIONS} />
      </Field>
      <Field
        label={type === 'PMR' ? 'Date paid' : 'Applies from'}
        error={errors.date}
        required
        hint={type === 'TNP' ? 'The first training and assessment prices apply from the programme start date (rule AFinType_13).' : null}
      >
        <input type="date" value={form.date} onChange={(e) => update('date', e.target.value)} />
      </Field>
      <Field label="Amount (£, whole pounds, excluding VAT)" error={errors.amount} required>
        <input type="text" inputMode="numeric" value={form.amount} onChange={(e) => update('amount', e.target.value)} />
      </Field>
      {type === 'RIP' && (
        <p className="field-hint field-wide">
          A price reduction for prior learning goes with the hours removed for prior learning, under Off-the-job hours
          (rules R_161 and R_162).
        </p>
      )}
    </>
  )
}

// A component aim, found in LARS by reference or title.
function ComponentFields({ form, errors, update }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)
  async function search() {
    setSearching(true)
    try {
      const res = await fetch(`/api/lars/aims?q=${encodeURIComponent(query)}`)
      setResults(res.ok ? await res.json() : [])
    } finally {
      setSearching(false)
    }
  }
  return (
    <>
      <Field label="Learning aim" error={errors.learnAimRef} required>
        <span className="record-chosen-aim">
          {form.learnAimRef ? `${form.title || 'LARS aim'} (${form.learnAimRef})` : 'None chosen yet'}
        </span>
      </Field>
      <div className="field field-wide lars-search">
        <span>Find it in LARS</span>
        <div className="lars-search-row">
          <input
            type="search"
            value={query}
            aria-label="Find a learning aim in LARS"
            placeholder="Reference (e.g. 6035060X) or words from the title"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                search()
              }
            }}
          />
          <button type="button" className="secondary" onClick={search} disabled={searching || query.trim().length < 3}>
            {searching ? 'Finding…' : 'Find'}
          </button>
        </div>
        {results && results.length === 0 && <span className="field-hint">Nothing found.</span>}
        {results && results.length > 0 && (
          <ul className="lars-results">
            {results.map((r) => (
              <li key={r.LEARN_AIM_REF}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    update('learnAimRef', r.LEARN_AIM_REF)
                    update('title', r.TITLE)
                    setResults(null)
                  }}
                >
                  {r.TITLE}
                </button>{' '}
                <span className="record-id">
                  {r.LEARN_AIM_REF}
                  {r.LEVEL ? ` · level ${r.LEVEL}` : ''}
                  {r.OPERATIONAL_END_DATE ? ` · closed ${formatDate(r.OPERATIONAL_END_DATE)}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Field label="Start date" error={errors.startDate} required>
        <input type="date" value={form.startDate} onChange={(e) => update('startDate', e.target.value)} />
      </Field>
      <Field label="Planned end date" error={errors.plannedEndDate} required>
        <input type="date" value={form.plannedEndDate} onChange={(e) => update('plannedEndDate', e.target.value)} />
      </Field>
      <Field
        label="Funding adjustment for prior learning (%, optional)"
        error={errors.priorLearnFundAdj}
        hint="The proportion of this aim still to be delivered, only when prior learning means not all of it is."
      >
        <input type="text" inputMode="numeric" value={form.priorLearnFundAdj} onChange={(e) => update('priorLearnFundAdj', e.target.value)} />
      </Field>
      <Field
        label="Other funding adjustment (optional)"
        error={errors.otherFundAdj}
        hint="Only if DfE has told you to use one, for English and maths aims."
      >
        <input type="text" inputMode="numeric" value={form.otherFundAdj} onChange={(e) => update('otherFundAdj', e.target.value)} />
      </Field>
    </>
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
        setForm(initialForm(kind, mode === 'new' ? null : findRecord(data, kind, recordKey), data))
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
    const fieldErrors = validate(kind, mode, form, earliestStart, ilr)
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
                {kind === 'component' && (
                  <p className="field-hint field-wide">
                    Its funding and monitoring records are removed with it. If the apprentice really did start this aim
                    and then stopped or finished it, don&apos;t remove it: its outcome is recorded with the programme&apos;s.
                  </p>
                )}
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

            {mode !== 'remove' && kind === 'employment' && (
              <EmploymentFields form={form} errors={errors} update={update} employers={ilr.employers} earliestStart={earliestStart} mode={mode} />
            )}

            {mode !== 'remove' && kind === 'aim-fam' && <AimFamFields form={form} errors={errors} update={update} />}
            {mode !== 'remove' && kind === 'price' && <PriceFields form={form} errors={errors} update={update} mode={mode} />}
            {mode !== 'remove' && kind === 'component' && <ComponentFields form={form} errors={errors} update={update} />}

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
