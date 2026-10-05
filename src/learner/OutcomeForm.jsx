import { currentComponents, currentProgramme } from '../programme'
import { useEffect, useState } from 'react'
import { WITHDRAW_REASON_OPTIONS } from '../ilrCodes'
import { EPA_GRADES, outcomeActions, todayString, validateOutcome } from '../validation'
import { formatDate } from '../lookups'

// Recording the programme's outcome (managers only), as docs/ilr-outcomes.md
// sets out: training finished and waiting for the EPA, the EPA result, a
// break in learning, withdrawal, or correcting an outcome entered in error.
// The server (server/outcomes.js) closes the component aims to match.

export const OUTCOME_HEADINGS = {
  'learning-complete': 'Training finished',
  'epa-result': 'Record the EPA result',
  break: 'Break in learning',
  withdraw: 'Withdraw from the apprenticeship',
  correct: 'Correct the outcome',
}
export const OUTCOME_ACTIONS = Object.keys(OUTCOME_HEADINGS)

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

function OutcomeForm({ learnRefNumber, action, onSaved, onCancel }) {
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
        const p = currentProgramme(data.aims)
        const actual = p?.hours.find((h) => Number(h.HRSCODE) === 3)?.HRSAMOUNT
        setForm({
          endDate: action === 'correct' ? iso(p?.LEARNACTENDDATE) : '',
          achDate: action === 'correct' ? iso(p?.ACHDATE) : '',
          grade: action === 'correct' ? (p?.OUTGRADE ?? '') : '',
          reason: action === 'correct' ? String(p?.WITHDRAWREASON ?? '') : '',
          result: '',
          actualHours: actual === undefined || actual === null ? '' : String(actual),
          components: {},
          why: '',
        })
      } catch (err) {
        if (!cancelled) setLoadError(err.message)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [learnRefNumber, action])

  const p = ilr && currentProgramme(ilr.aims)
  const programme = p && {
    startDate: iso(p.LEARNSTARTDATE),
    compStatus: p.COMPSTATUS,
    outcome: p.OUTCOME,
    actualEndDate: iso(p.LEARNACTENDDATE) || null,
  }
  const components = ilr ? currentComponents(ilr.aims) : []
  const open = components.filter((a) => a.COMPSTATUS === 1 && !a.LEARNACTENDDATE)
  const closedEnds = components.filter((a) => a.LEARNACTENDDATE).map((a) => iso(a.LEARNACTENDDATE))
  const allowed = programme && (action === 'correct' ? Boolean(programme.actualEndDate) : outcomeActions(programme).includes(action))
  const update = (field, value) => setForm((f) => ({ ...f, [field]: value }))
  const updateComponent = (seq, field, value) =>
    setForm((f) => ({ ...f, components: { ...f.components, [seq]: { ...f.components[seq], [field]: value } } }))

  // A component's end date is the programme's unless one is given.
  function body() {
    const components = Object.fromEntries(
      open.map((c) => {
        const cv = form.components[c.AIMSEQNUMBER] ?? {}
        return [c.AIMSEQNUMBER, { endDate: cv.endDate || form.endDate, outcome: cv.outcome ?? '' }]
      }),
    )
    return { ...form, components }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setServerError(null)
    const input = body()
    const fieldErrors = validateOutcome(action, input, {
      programme,
      components: open.map((c) => ({ seq: c.AIMSEQNUMBER, startDate: iso(c.LEARNSTARTDATE) })),
      latestComponentEnd: closedEnds.sort().at(-1) ?? null,
      today: todayString(),
    })
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return
    setSaving(true)
    try {
      const res = await fetch(`/api/learners/${encodeURIComponent(learnRefNumber)}/outcome/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrors(data.fields || {})
        setServerError(data.error || 'Could not record the outcome.')
        return
      }
      onSaved?.()
    } catch {
      setServerError('Could not reach the server. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const hoursField = (required) => (
    <Field
      label="Actual off-the-job hours"
      error={errors.actualHours}
      hint={`Eligible hours delivered over the whole apprenticeship${required ? '' : ' (optional for starts before 1 August 2022)'}. Recorded in the ILR as HRS 3.`}
    >
      <input type="text" inputMode="numeric" value={form.actualHours} onChange={(e) => update('actualHours', e.target.value)} />
    </Field>
  )
  const reasonField = (
    <Field label="Withdrawal reason" error={errors.reason}>
      <select value={form?.reason ?? ''} onChange={(e) => update('reason', e.target.value)}>
        <option value="">Select…</option>
        {WITHDRAW_REASON_OPTIONS.map((o) => (
          <option key={o.code} value={o.code}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  )
  const gradeField = (
    <Field label="Grade" error={errors.grade}>
      <select value={form?.grade ?? ''} onChange={(e) => update('grade', e.target.value)}>
        <option value="">Select…</option>
        {EPA_GRADES.map((g) => (
          <option key={g.code} value={g.code}>
            {g.label}
          </option>
        ))}
      </select>
    </Field>
  )

  return (
    <section id="edit-learner" className="ilr-record-form">
      <h2>{OUTCOME_HEADINGS[action]}</h2>
      <p className="warning-banner" role="alert">
        Dummy data only. Do not enter real people&apos;s details.
      </p>
      {loadError && <p role="alert">Couldn&apos;t load this learner&apos;s programme: {loadError}</p>}
      {ilr && !p && <p role="alert">This learner has no programme aim.</p>}
      {ilr && p && !allowed && (
        <p role="alert">
          That can&apos;t be recorded for this programme now. <a href="#" onClick={(e) => { e.preventDefault(); onCancel?.() }}>Go back</a>
        </p>
      )}
      {serverError && (
        <p className="error-banner" role="alert">
          {serverError}
        </p>
      )}
      {form && allowed && (
        <form onSubmit={handleSubmit} noValidate>
          {action === 'learning-complete' && (
            <>
              <fieldset>
                <legend>The programme</legend>
                <p className="field-hint field-wide">
                  For when the apprentice has finished their training and is going through the gateway to the
                  end-point assessment. The programme stays continuing with outcome 8 until you record the EPA
                  result.
                </p>
                <Field
                  label="Last day of training"
                  error={errors.endDate}
                  hint="The last day of learning activity, not counting the EPA period (ILR actual end date)."
                >
                  <input type="date" value={form.endDate} onChange={(e) => update('endDate', e.target.value)} />
                </Field>
                {hoursField(true)}
              </fieldset>
              {open.length > 0 && (
                <fieldset>
                  <legend>Component aims</legend>
                  <p className="field-hint field-wide">
                    Each one closes now. None can end after the programme&apos;s training (rule R_89).
                  </p>
                  {open.map((c) => {
                    const cv = form.components[c.AIMSEQNUMBER] ?? {}
                    const name = c.AIMTITLE ?? c.LEARNAIMREF
                    return (
                      <div key={c.AIMSEQNUMBER} className="field field-wide outcome-component" role="group" aria-label={`${name} (${c.LEARNAIMREF})`}>
                        <span>
                          {name} <span className="record-id">{c.LEARNAIMREF}</span>
                        </span>
                        <label className="field">
                          <span>Last day of learning</span>
                          <input
                            type="date"
                            value={cv.endDate ?? ''}
                            onChange={(e) => updateComponent(c.AIMSEQNUMBER, 'endDate', e.target.value)}
                          />
                          <span className="field-hint">Leave empty if it&apos;s the same as the programme&apos;s.</span>
                        </label>
                        <span className="radio-row">
                          {[
                            [1, 'Achieved'],
                            [3, 'Not achieved'],
                          ].map(([code, label]) => (
                            <label key={code}>
                              <input
                                type="radio"
                                name={`component-${c.AIMSEQNUMBER}`}
                                checked={String(cv.outcome ?? '') === String(code)}
                                onChange={() => updateComponent(c.AIMSEQNUMBER, 'outcome', code)}
                              />{' '}
                              {label}
                            </label>
                          ))}
                        </span>
                        {errors[`component-${c.AIMSEQNUMBER}`] && (
                          <span className="field-error">{errors[`component-${c.AIMSEQNUMBER}`]}</span>
                        )}
                      </div>
                    )
                  })}
                </fieldset>
              )}
            </>
          )}

          {action === 'epa-result' && (
            <fieldset>
              <legend>End-point assessment</legend>
              <p className="field-hint field-wide">
                Training finished on {formatDate(programme.actualEndDate)}. Record the result once the EPA period has
                ended, pass or fail. A failed EPA that needs more training is a new aim (a restart), which is a later
                step.
              </p>
              <div className="field field-wide" role="radiogroup" aria-label="Result">
                <span>Result</span>
                <span className="radio-row">
                  {[
                    ['passed', 'Passed'],
                    ['failed', 'Failed'],
                  ].map(([value, label]) => (
                    <label key={value}>
                      <input type="radio" name="result" checked={form.result === value} onChange={() => update('result', value)} />{' '}
                      {label}
                    </label>
                  ))}
                </span>
                {errors.result && <span className="field-error">{errors.result}</span>}
              </div>
              <Field
                label="End of the EPA period"
                error={errors.achDate}
                hint="The ILR achievement date: when the end-point assessment finished. Not before the last day of training."
              >
                <input type="date" value={form.achDate} onChange={(e) => update('achDate', e.target.value)} />
              </Field>
              {form.result === 'passed' && gradeField}
            </fieldset>
          )}

          {action === 'break' && (
            <fieldset>
              <legend>Break in learning</legend>
              <p className="field-hint field-wide">
                An agreed break: the apprentice is expected to come back. Open component aims go on the break too. If
                the employer paid for training or assessment that won&apos;t now be delivered, record the repayment
                under Prices and payments.
              </p>
              <Field
                label="Last day of learning before the break"
                error={errors.endDate}
                hint="The ILR actual end date for the aim on a break."
              >
                <input type="date" value={form.endDate} onChange={(e) => update('endDate', e.target.value)} />
              </Field>
            </fieldset>
          )}

          {action === 'withdraw' && (
            <fieldset>
              <legend>Withdrawal</legend>
              {programme.actualEndDate ? (
                <p className="field-hint field-wide">
                  {programme.compStatus === 6
                    ? `On a break since ${formatDate(programme.actualEndDate)}: that date stays as the end date.`
                    : `Training finished on ${formatDate(programme.actualEndDate)}: that date stays as the end date.`}
                </p>
              ) : (
                <Field label="Last day of learning" error={errors.endDate} hint="The ILR actual end date.">
                  <input type="date" value={form.endDate} onChange={(e) => update('endDate', e.target.value)} />
                </Field>
              )}
              {reasonField}
              {hoursField(programme.startDate >= '2022-08-01')}
              <p className="field-hint field-wide">
                Component aims still open are withdrawn too. If the employer paid for training or assessment that
                won&apos;t now be delivered, record the repayment under Prices and payments.
              </p>
            </fieldset>
          )}

          {action === 'correct' && (
            <fieldset>
              <legend>Fix an outcome entered in error</legend>
              <p className="field-hint field-wide">
                The old values are kept in the history. Component aims aren&apos;t changed: correct those on their own.
              </p>
              <Field
                label={
                  { 6: 'Last day of learning before the break', 3: 'Last day of learning' }[programme.compStatus] ??
                  'Last day of training'
                }
                error={errors.endDate}
              >
                <input type="date" value={form.endDate} onChange={(e) => update('endDate', e.target.value)} />
              </Field>
              {programme.compStatus === 2 && (
                <Field label="End of the EPA period" error={errors.achDate}>
                  <input type="date" value={form.achDate} onChange={(e) => update('achDate', e.target.value)} />
                </Field>
              )}
              {programme.compStatus === 2 && programme.outcome === 1 && gradeField}
              {programme.compStatus === 3 && reasonField}
              <Field label="What was wrong?" error={errors.why}>
                <input type="text" value={form.why} onChange={(e) => update('why', e.target.value)} />
              </Field>
            </fieldset>
          )}

          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        </form>
      )}
    </section>
  )
}

export default OutcomeForm
