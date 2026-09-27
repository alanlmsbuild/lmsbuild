import { useCallback, useEffect, useState } from 'react'
import { WITNESS_OUTCOME_OPTIONS } from '../burrowCodes'
import { formatDate } from '../lookups'
import CompletionStatus from '../CompletionStatus'
import { validateWitnessConfirmationForm } from '../validation'
import { Button, Card, Choices, Field, Heading, Meter, Notice, Stat, StatusBadge } from '../ui/components'
import './employer.css'

// Burrow for an employer contact: the witness statements waiting for their
// answer, and each apprentice's progress. Nothing else from the portfolio.

function fullName(row) {
  return `${row.GIVENNAMES ?? ''} ${row.FAMILYNAME ?? ''}`.trim() || row.LEARNREFNUMBER
}

function ReviewStatus({ apprentice, windowDays }) {
  if (apprentice.COMPSTATUS !== 1) return null
  const days = apprentice.DAYS_UNTIL_REVIEW_DUE
  if (days < 0) return <StatusBadge tone="overdue">Overdue</StatusBadge>
  if (days <= windowDays) return <StatusBadge tone="due">Due soon</StatusBadge>
  return <StatusBadge tone="done">On track</StatusBadge>
}

function ApprenticeCard({ apprentice, windowDays }) {
  const a = apprentice
  const pct = a.PCT_TIME_ON_PROGRAMME
  return (
    <Card
      as="li"
      titleLevel={3}
      title={fullName(a)}
      meta={<CompletionStatus compstatus={a.COMPSTATUS} />}
    >
      <p className="ui-muted">
        {a.STDREFERENCE ? `${a.STDREFERENCE} ${a.STDNAME}` : 'Standard not recorded'}
      </p>

      <div className="employer-figures">
        <div>
          {a.KSBS_TOTAL > 0 ? (
            <>
              <Stat value={`${a.KSBS_SIGNED_OFF} of ${a.KSBS_TOTAL}`} label="KSBs signed off" />
              <Meter
                value={a.KSBS_SIGNED_OFF}
                max={a.KSBS_TOTAL}
                label={`${a.KSBS_SIGNED_OFF} of ${a.KSBS_TOTAL} KSBs signed off`}
              />
            </>
          ) : (
            <Stat value="—" label="KSBs aren’t loaded for this standard yet" />
          )}
        </div>
        <div>
          <Stat
            value={pct === null || pct === undefined ? '—' : `${Math.max(0, pct)}%`}
            label={`of planned time, ${formatDate(a.LEARNSTARTDATE)} to ${formatDate(a.LEARNPLANENDDATE)}`}
          />
          {pct !== null && pct !== undefined && (
            <Meter value={pct} max={100} label={`${Math.max(0, pct)}% of planned time on programme used`} />
          )}
        </div>
        <div>
          <Stat value={formatDate(a.LAST_REVIEW_DATE)} label="Last progress review" />
          {a.COMPSTATUS === 1 && (
            <p className="employer-review-due">
              Next due by {formatDate(a.REVIEW_DUE_BY)} <ReviewStatus apprentice={a} windowDays={windowDays} />
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}

const EMPTY_ANSWER = { outcome: '', comment: '' }

function StatementCard({ statement, onAnswered }) {
  const s = statement
  const [answer, setAnswer] = useState(EMPTY_ANSWER)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setServerError(null)
    const fieldErrors = validateWitnessConfirmationForm(answer)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return

    setSaving(true)
    try {
      const res = await fetch(`/api/employer/witness-statements/${encodeURIComponent(s.EVIDENCE_ID)}/confirmations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answer),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrors(data.fields || {})
        setServerError(data.error || 'Could not save your answer.')
        return
      }
      onAnswered(s, answer.outcome)
    } catch {
      setServerError('Could not reach the server. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card as="li" titleLevel={3} title={s.TITLE} meta={`${fullName(s)} · ${formatDate(s.OCCURRED_ON)}`}>
      <div className="ui-stack">
        <div>
          <Heading level={4}>What they did</Heading>
          <p className="employer-reflection">{s.REFLECTION || '—'}</p>
        </div>

        {s.ksbs.length > 0 && (
          <div>
            <Heading level={4}>What it shows</Heading>
            <ul className="employer-ksbs">
              {s.ksbs.map((k) => (
                <li key={k.KSB_REFERENCE}>
                  <strong>{k.KSB_REFERENCE}</strong> {k.KSB_TEXT}
                </li>
              ))}
            </ul>
          </div>
        )}

        {s.files.length > 0 && (
          <div>
            <Heading level={4}>Files</Heading>
            <ul className="employer-files">
              {s.files.map((f) => (
                <li key={f.FILE_ID}>
                  <a
                    href={`/api/employer/witness-statements/${encodeURIComponent(s.EVIDENCE_ID)}/files/${encodeURIComponent(f.FILE_ID)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {f.ORIGINAL_FILENAME}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form className="ui-stack" onSubmit={handleSubmit} noValidate>
          {serverError && <Notice tone="error">{serverError}</Notice>}
          <Choices
            legend="Is this an accurate account of what you saw?"
            name={`outcome-${s.EVIDENCE_ID}`}
            options={WITNESS_OUTCOME_OPTIONS.map((o) => ({
              code: o.code,
              label: o.code === 'confirmed' ? 'Yes, I confirm it' : 'No, something isn’t right',
            }))}
            value={answer.outcome}
            onChange={(outcome) => setAnswer((a) => ({ ...a, outcome }))}
            error={errors.outcome}
          />
          <Field
            label={answer.outcome === 'declined' ? 'What isn’t right?' : 'Anything to add (optional)'}
            hint="The learner and their assessor will see this."
            error={errors.comment}
          >
            {(props) => (
              <textarea
                {...props}
                value={answer.comment}
                maxLength={2000}
                onChange={(e) => setAnswer((a) => ({ ...a, comment: e.target.value }))}
              />
            )}
          </Field>
          <div className="ui-actions">
            <Button type="submit" disabled={saving}>
              {saving ? 'Sending…' : 'Send answer'}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  )
}

function EmployerHome({ me }) {
  const [apprentices, setApprentices] = useState([])
  const [windowDays, setWindowDays] = useState(35)
  const [statements, setStatements] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null)
  const [flash, setFlash] = useState(null)

  const load = useCallback(async () => {
    try {
      const [aRes, sRes] = await Promise.all([
        fetch('/api/employer/apprentices'),
        fetch('/api/employer/witness-statements'),
      ])
      const [aData, sData] = await Promise.all([aRes.json(), sRes.json()])
      if (!aRes.ok) throw new Error(aData.error || `Server responded with ${aRes.status}`)
      if (!sRes.ok) throw new Error(sData.error || `Server responded with ${sRes.status}`)
      setApprentices(aData.apprentices)
      setWindowDays(aData.reviewWindowDays)
      setStatements(sData)
      setStatus('ready')
      setError(null)
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function handleAnswered(statement, outcome) {
    setFlash(
      outcome === 'confirmed'
        ? `Thanks. You confirmed “${statement.TITLE}” for ${fullName(statement)}.`
        : `Thanks. ${fullName(statement)} and their assessor will see why you declined “${statement.TITLE}”.`,
    )
    load()
  }

  const firstName = me?.DISPLAYNAME?.split(' ')[0]

  return (
    <main className="employer ui-stack">
      <div>
        <Heading level={1}>{firstName ? `Hello, ${firstName}` : 'Your apprentices'}</Heading>
        <p className="ui-muted">Your apprentices’ progress, and witness statements waiting for you.</p>
      </div>

      {flash && <Notice tone="success">{flash}</Notice>}
      {status === 'loading' && <p className="ui-muted">Loading…</p>}
      {status === 'error' && <Notice tone="error">Couldn’t load this page: {error}</Notice>}

      {status === 'ready' && (
        <>
          <section className="ui-stack" aria-labelledby="employer-statements">
            <Heading level={2}>
              <span id="employer-statements">Witness statements to confirm ({statements.length})</span>
            </Heading>
            {statements.length === 0 ? (
              <p className="ui-muted">Nothing waiting. When an apprentice sends a witness statement, it’ll show here.</p>
            ) : (
              <ul className="employer-list">
                {statements.map((s) => (
                  <StatementCard key={s.EVIDENCE_ID} statement={s} onAnswered={handleAnswered} />
                ))}
              </ul>
            )}
          </section>

          <section className="ui-stack" aria-labelledby="employer-apprentices">
            <Heading level={2}>
              <span id="employer-apprentices">Apprentices ({apprentices.length})</span>
            </Heading>
            {apprentices.length === 0 ? (
              <p className="ui-muted">You have no current apprentices.</p>
            ) : (
              <ul className="employer-list">
                {apprentices.map((a) => (
                  <ApprenticeCard key={a.LEARNREFNUMBER} apprentice={a} windowDays={windowDays} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  )
}

export default EmployerHome
