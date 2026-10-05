import { currentComponents, currentProgramme, isEnglishOrMaths } from '../programme'
import { useEffect, useState } from 'react'
import { EII_OPTIONS, LOE_OPTIONS } from '../ilrLabels'
import { todayString, validateReturn } from '../validation'
import { formatDate } from '../lookups'

// Returning from a break in learning, and undoing a return entered in error
// (managers only). The server (server/returns.js) adds the new aims and
// records; see docs/ilr-outcomes.md.

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

const iso = (value) => (value ? String(value).slice(0, 10) : '')
const latestAmount = (fin, codes) =>
  fin.filter((f) => f.AFINTYPE === 'TNP' && codes.includes(Number(f.AFINCODE))).sort((a, b) => (iso(a.AFINDATE) < iso(b.AFINDATE) ? -1 : 1)).at(-1)?.AFINAMOUNT

// What the return starts from: the aims on the break, their prices, and the
// employer on the latest employment status.
function breakOf(ilr) {
  const programme = currentProgramme(ilr.aims)
  if (!programme || programme.COMPSTATUS !== 6) return null
  const components = currentComponents(ilr.aims).filter((c) => c.COMPSTATUS === 6)
  const latest = [...(ilr.employment ?? [])].sort((a, b) => (iso(a.DATEEMPSTATAPP) < iso(b.DATEEMPSTATAPP) ? 1 : -1))[0]
  return {
    programme,
    components,
    training: latestAmount(programme.fin ?? [], [1, 3]),
    assessment: latestAmount(programme.fin ?? [], [2, 4]),
    employerId: latest?.EMPLOYERID ?? null,
    employerName: (ilr.employers ?? []).find((e) => e.EMPLOYERID === latest?.EMPLOYERID)?.NAME,
  }
}

function ReturnForm({ learnRefNumber, action, onSaved, onCancel }) {
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
        const b = breakOf(data)
        setForm({
          restartDate: '', plannedEndDate: '', employer: 'same',
          trainingPrice: b?.training === undefined ? '' : String(b.training),
          assessmentPrice: b?.assessment === undefined ? '' : String(b.assessment),
          components: {}, empId: '', eii: '', loe: '', sei: false, agreemId: '', reason: '',
        })
      } catch (err) {
        if (!cancelled) setLoadError(err.message)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [learnRefNumber])

  const b = ilr && breakOf(ilr)
  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }))
  const updateComponent = (seq, field, value) =>
    setForm((f) => ({ ...f, components: { ...f.components, [seq]: { ...f.components[seq], [field]: value } } }))
  const newEmployer = form && form.employer !== 'same' && form.employer !== b?.employerId

  // A component's planned end is the programme's unless one is given.
  function returnBody() {
    const components = Object.fromEntries(b.components.map((c) => {
      const cv = form.components[c.AIMSEQNUMBER] ?? {}
      return [c.AIMSEQNUMBER, { plannedEndDate: cv.plannedEndDate || form.plannedEndDate, proportion: cv.proportion ?? '' }]
    }))
    return { ...form, components, employer: newEmployer ? form.employer : 'same' }
  }

  async function submit(e, body, check) {
    e.preventDefault()
    setServerError(null)
    const fieldErrors = check(body)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return
    setSaving(true)
    try {
      const res = await fetch(`/api/learners/${encodeURIComponent(learnRefNumber)}/outcome/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

  const returnErrors = (body) =>
    validateReturn(body, {
      breakAim: { startDate: iso(b.programme.LEARNSTARTDATE), endDate: iso(b.programme.LEARNACTENDDATE) },
      components: b.components.map((c) => ({ seq: c.AIMSEQNUMBER, startDate: iso(c.LEARNSTARTDATE), englishOrMaths: isEnglishOrMaths(c.AIMTITLE) })),
      newEmployer,
      today: todayString(),
    })

  return (
    <section id="edit-learner" className="ilr-record-form">
      <h2>{action === 'return' ? 'Return from the break' : 'Undo the return'}</h2>
      <p className="warning-banner" role="alert">
        Dummy data only. Do not enter real people&apos;s details.
      </p>
      {loadError && <p role="alert">Couldn&apos;t load this learner&apos;s programme: {loadError}</p>}
      {serverError && (
        <p className="error-banner" role="alert">
          {serverError}
        </p>
      )}
      {action === 'return' && ilr && !b && <p role="alert">This apprentice isn&apos;t on a break in learning.</p>}
      {action === 'return' && form && b && (
        <form onSubmit={(e) => submit(e, returnBody(), returnErrors)} noValidate>
          <fieldset>
            <legend>The programme</legend>
            <p className="field-hint field-wide">
              On a break since {formatDate(b.programme.LEARNACTENDDATE)}. Warren adds new aims from the restart date for the
              programme and each component on the break, flagged as restarts with the original start date
              ({formatDate(b.programme.ORIGLEARNSTARTDATE ?? b.programme.LEARNSTARTDATE)}). The aims on the break stay as
              they are.
            </p>
            <Field label="Restart date" error={errors.restartDate} hint="The first day of learning after the break.">
              <input type="date" value={form.restartDate} onChange={(e) => update('restartDate', e.target.value)} />
            </Field>
            <Field label="New planned end date" error={errors.plannedEndDate} hint="Re-planned for the time the break took.">
              <input type="date" value={form.plannedEndDate} onChange={(e) => update('plannedEndDate', e.target.value)} />
            </Field>
          </fieldset>

          <fieldset>
            <legend>Employer and price</legend>
            <Field label="Employer" error={errors.employer}>
              <select value={form.employer} onChange={(e) => update('employer', e.target.value)}>
                <option value="same">The same employer{b.employerName ? ` (${b.employerName})` : ''}</option>
                {(ilr.employers ?? []).filter((e) => e.EMPLOYERID !== b.employerId).map((e) => (
                  <option key={e.EMPLOYERID} value={e.EMPLOYERID}>
                    {e.NAME}
                    {e.EMPLOYERREF ? ` (ERN ${e.EMPLOYERREF})` : ''}
                  </option>
                ))}
                <option value="other">Another employer…</option>
              </select>
            </Field>
            {newEmployer && (
              <>
                <p className="field-hint field-wide">
                  A new employment status starts on the restart date, and the new employer sees the apprentice in Burrow.
                </p>
                {form.employer === 'other' && (
                  <Field label="Employer reference number (ERN)" error={errors.empId} hint="9 digits. 999999999 if the employer isn't on the Employer Data Service.">
                    <input type="text" inputMode="numeric" value={form.empId} onChange={(e) => update('empId', e.target.value)} />
                  </Field>
                )}
                <Field label="Hours a week" error={errors.eii}>
                  <select value={form.eii} onChange={(e) => update('eii', e.target.value)}>
                    <option value="">Select…</option>
                    {EII_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="Length of employment" error={errors.loe}>
                  <select value={form.loe} onChange={(e) => update('loe', e.target.value)}>
                    <option value="">Select…</option>
                    {LOE_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="Agreement ID (optional)" error={errors.agreemId}>
                  <input type="text" value={form.agreemId} onChange={(e) => update('agreemId', e.target.value)} />
                </Field>
              </>
            )}
            <p className="field-hint field-wide">
              {newEmployer
                ? 'Agree a residual price with the new employer for the training and assessment still to do (TNP 3 and 4).'
                : 'The price before the break, unless you and the employer agreed a new one (TNP 1 and 2).'}
            </p>
            <Field label={newEmployer ? 'Residual training price (£)' : 'Training price (£)'} error={errors.trainingPrice}>
              <input type="text" inputMode="numeric" value={form.trainingPrice} onChange={(e) => update('trainingPrice', e.target.value)} />
            </Field>
            <Field label={newEmployer ? 'Residual assessment price (£)' : 'Assessment price (£)'} error={errors.assessmentPrice}>
              <input type="text" inputMode="numeric" value={form.assessmentPrice} onChange={(e) => update('assessmentPrice', e.target.value)} />
            </Field>
          </fieldset>

          {b.components.length > 0 && (
            <fieldset>
              <legend>Component aims</legend>
              {b.components.map((c) => {
                const cv = form.components[c.AIMSEQNUMBER] ?? {}
                const name = c.AIMTITLE ?? c.LEARNAIMREF
                return (
                  <div key={c.AIMSEQNUMBER} className="field field-wide outcome-component" role="group" aria-label={`${name} (${c.LEARNAIMREF})`}>
                    <span>
                      {name} <span className="record-id">{c.LEARNAIMREF}</span>
                    </span>
                    <label className="field">
                      <span>Planned end date for this aim</span>
                      <input type="date" value={cv.plannedEndDate ?? ''} onChange={(e) => updateComponent(c.AIMSEQNUMBER, 'plannedEndDate', e.target.value)} />
                      <span className="field-hint">Leave empty if it&apos;s the same as the programme&apos;s.</span>
                    </label>
                    {isEnglishOrMaths(c.AIMTITLE) && (
                      <label className="field">
                        <span>Proportion still to be delivered (%)</span>
                        <input type="text" inputMode="numeric" value={cv.proportion ?? ''} onChange={(e) => updateComponent(c.AIMSEQNUMBER, 'proportion', e.target.value)} />
                        <span className="field-hint">Leave empty if all of it is still to be delivered.</span>
                      </label>
                    )}
                    {errors[`component-${c.AIMSEQNUMBER}`] && <span className="field-error">{errors[`component-${c.AIMSEQNUMBER}`]}</span>}
                  </div>
                )
              })}
            </fieldset>
          )}
          <p className="field-hint field-wide">
            Planned off-the-job hours are for the whole programme, so they&apos;re copied. Learning support (LSF) isn&apos;t:
            add it again if it still applies.
          </p>
          <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Record the return'}</button>
          <button type="button" className="secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        </form>
      )}
      {action === 'undo-return' && ilr && !ilr.returnUndo?.allowed && (
        <p role="alert">This return can&apos;t be undone: {ilr.returnUndo?.why ?? 'the current programme isn\'t a return from a break.'}</p>
      )}
      {action === 'undo-return' && form && ilr.returnUndo?.allowed && (
        <form onSubmit={(e) => submit(e, { reason: form.reason }, (body) => (String(body.reason).trim() ? {} : { reason: 'Say why the return is being undone.' }))} noValidate>
          <fieldset>
            <legend>Undo a return entered in error</legend>
            <p className="field-hint field-wide">
              The aims added by the return, with their prices, hours and funding and monitoring records, are marked
              removed (kept in the history with your reason). A new employer&apos;s employment status is removed too, and
              the employer who sees the apprentice in Burrow goes back. The apprentice is on the break again.
            </p>
            <Field label="Why is it being undone?" error={errors.reason}>
              <textarea rows={3} value={form.reason} onChange={(e) => update('reason', e.target.value)} />
            </Field>
          </fieldset>
          <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Undo the return'}</button>
          <button type="button" className="secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        </form>
      )}
    </section>
  )
}

export default ReturnForm
