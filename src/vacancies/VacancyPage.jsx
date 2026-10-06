import { useCallback, useEffect, useState } from 'react'
import { usePageTitle } from '../shell/navigation'
import { formatDate } from '../lookups'
import { Card, Notice, StatusBadge } from '../ui/components'
import { SourceBadge, SOURCE_LABELS } from './Vacancies'
import './vacancies.css'

// One advert (GET /api/vacancies/:ref). Its text is shown only as text
// (React escapes it; line breaks kept by CSS), never as HTML. People apply on
// the original site. All staff see which of your employers it's confirmed
// for; managers also confirm or reject Warren's suggestions, change
// decisions, and link it to an employer by hand.

function Text({ value }) {
  return value ? <p className="vacancy-text">{value}</p> : null
}

function Row({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
}

const addressText = (a) => [a.addressLine1, a.addressLine2, a.addressLine3, a.addressLine4, a.postcode].filter(Boolean).join(', ')

// A manager's decision about one employer: a site (when confirming) and the
// two buttons.
function Decide({ employerId, sites, defaultSite, onDecide, busy }) {
  const own = sites.filter((s) => s.EMPLOYERID === employerId)
  const [site, setSite] = useState(defaultSite ?? '')
  return (
    <span className="vacancy-decide">
      {own.length > 0 && (
        <select aria-label="Site" value={site} onChange={(e) => setSite(e.target.value)}>
          <option value="">No particular site</option>
          {own.map((s) => (
            <option key={s.SITEID} value={s.SITEID}>
              {s.NAME} ({s.POSTCODE})
            </option>
          ))}
        </select>
      )}
      <button type="button" className="secondary" disabled={busy} onClick={() => onDecide(employerId, 'confirmed', site)}>
        Confirm
      </button>
      <button type="button" className="secondary" disabled={busy} onClick={() => onDecide(employerId, 'rejected', '')}>
        Reject
      </button>
    </span>
  )
}

function VacancyPage({ reference, isManager }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [decideError, setDecideError] = useState(null)
  const [other, setOther] = useState('')
  usePageTitle(data?.advert?.TITLE ?? 'Advert')

  const load = useCallback(async () => {
    const res = await fetch(`/api/vacancies/${encodeURIComponent(reference)}`)
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || `Server responded with ${res.status}`)
    return body
  }, [reference])

  useEffect(() => {
    let live = true
    load().then((b) => live && setData(b)).catch((e) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [load])

  async function decide(employerId, decision, siteId) {
    setBusy(true)
    setDecideError(null)
    try {
      const res = await fetch(`/api/vacancies/${encodeURIComponent(reference)}/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employerId, decision, siteId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(Object.values(body.fields ?? {})[0] ?? body.error)
      setData(await load())
      setOther('')
    } catch (e) {
      setDecideError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const a = data?.advert
  const addresses = a ? (typeof a.ADDRESSES === 'string' ? JSON.parse(a.ADDRESSES) : a.ADDRESSES) ?? [] : []
  const skills = a ? (typeof a.SKILLS === 'string' ? JSON.parse(a.SKILLS) : a.SKILLS) ?? [] : []
  const decided = new Set((data?.decisions ?? []).map((d) => d.EMPLOYERID))
  const undecided = (data?.employers ?? []).filter((e) => !decided.has(e.EMPLOYERID) && !(data?.suggestions ?? []).some((s) => s.EMPLOYERID === e.EMPLOYERID))

  return (
    <section id="vacancy" className="employer-page">
      <p>
        <a href="/app/vacancies">Back to vacancies</a>
      </p>
      {!data && !error && <p>Loading the advert…</p>}
      {error && <Notice tone="error">{error}</Notice>}
      {a && (
        <>
          <h2>{a.TITLE}</h2>
          <p className="vacancy-meta">
            <SourceBadge source={a.SOURCE} />
            {!a.ISOPEN && <StatusBadge tone="overdue">{a.GONEAT ? 'No longer advertised' : 'Closed'}</StatusBadge>}
            <span>{a.EMPLOYERNAME}</span>
            <span>Closes {formatDate(a.CLOSINGDAY)}</span>
          </p>
          {a.ISOPEN && a.VACANCYURL && (
            <p>
              <a className="ui-button ui-button--primary" href={a.VACANCYURL} target="_blank" rel="noopener noreferrer">
                View and apply on {a.SOURCE === 'FAA' ? 'Find an apprenticeship' : `Find an apprenticeship (from ${SOURCE_LABELS[a.SOURCE]})`}
              </a>
              {a.APPLICATIONURL && (
                <>
                  {' '}
                  <a href={a.APPLICATIONURL} target="_blank" rel="noopener noreferrer">
                    The employer&apos;s application page
                  </a>
                </>
              )}
            </p>
          )}

          <Card title="The apprenticeship" titleLevel={3}>
            <dl className="employer-details">
              <Row label="Apprenticeship" value={a.COURSETITLE ? `${a.COURSETITLE}${a.COURSELEVEL && !/\(level \d+\)/i.test(a.COURSETITLE) ? ` (level ${a.COURSELEVEL})` : ''}` : null} />
              <Row label="Route" value={a.ROUTE} />
              <Row label="Level" value={a.APPRENTICESHIPLEVEL} />
              <Row label="Wage" value={a.WAGETEXT} />
              <Row label="Hours a week" value={a.HOURSPERWEEK} />
              <Row label="Working week" value={a.WORKINGWEEK} />
              <Row label="Expected duration" value={a.EXPECTEDDURATION} />
              <Row label="Starts" value={a.STARTDAY ? formatDate(a.STARTDAY) : null} />
              <Row label="Posted" value={a.POSTEDDAY ? formatDate(a.POSTEDDAY) : null} />
              <Row label="Positions" value={a.NUMBEROFPOSITIONS} />
              <Row label="Where" value={addresses.length ? addresses.map(addressText).join('; ') : a.ISNATIONALVACANCY ? 'National' : null} />
              <Row label="Training provider" value={a.PROVIDERNAME} />
              <Row label="Disability Confident" value={a.ISDISABILITYCONFIDENT ? 'Yes' : null} />
              <Row label="Skills" value={skills.length ? skills.join(', ') : null} />
              <Row label="Reference" value={a.VACANCYREFERENCE} />
            </dl>
          </Card>

          <Card title="About the job" titleLevel={3}>
            <Text value={a.DESCRIPTION} />
            <Text value={a.FULLDESCRIPTION} />
            {a.THINGSTOCONSIDER && <h4>Things to consider</h4>}
            <Text value={a.THINGSTOCONSIDER} />
          </Card>
          {(a.TRAININGDESCRIPTION || a.OUTCOMEDESCRIPTION) && (
            <Card title="Training and after" titleLevel={3}>
              <Text value={a.TRAININGDESCRIPTION} />
              <Text value={a.OUTCOMEDESCRIPTION} />
            </Card>
          )}
          {a.EMPLOYERDESCRIPTION && (
            <Card title="About the employer" titleLevel={3}>
              <Text value={a.EMPLOYERDESCRIPTION} />
              {a.EMPLOYERWEBSITEURL && (
                <p>
                  <a href={a.EMPLOYERWEBSITEURL} target="_blank" rel="noopener noreferrer">
                    The employer&apos;s website
                  </a>
                </p>
              )}
            </Card>
          )}

          <Card title="Your employers" titleLevel={3}>
            {data.links.length === 0 && <p>Not linked to any of your employers.</p>}
            {data.links.length > 0 && (
              <ul className="plain-list">
                {data.links.map((l) => (
                  <li key={l.EMPLOYERID}>
                    <a href={`/app/employers/${encodeURIComponent(l.EMPLOYERID)}`}>{l.EMPLOYERNAME}</a>
                    {l.SITENAME && `, ${l.SITENAME}`}
                  </li>
                ))}
              </ul>
            )}
            {isManager && (
              <>
                {decideError && <Notice tone="error">{decideError}</Notice>}
                {data.suggestions.length > 0 && (
                  <>
                    <h4>Suggested</h4>
                    <p className="field-hint">The advert&apos;s employer name matches these employers. Confirm only if it&apos;s theirs.</p>
                    <ul className="vacancy-suggestions">
                      {data.suggestions.map((s) => (
                        <li key={s.EMPLOYERID}>
                          <span>
                            {s.EMPLOYERNAME}
                            {s.SITENAME && ` (postcode matches ${s.SITENAME})`}
                          </span>
                          <Decide employerId={s.EMPLOYERID} sites={data.sites} defaultSite={s.SITEID} onDecide={decide} busy={busy} />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {data.decisions.length > 0 && (
                  <>
                    <h4>Decided</h4>
                    <ul className="vacancy-suggestions">
                      {data.decisions.map((d) => (
                        <li key={d.EMPLOYERID}>
                          <span>
                            <a href={`/app/employers/${encodeURIComponent(d.EMPLOYERID)}`}>{d.EMPLOYERNAME}</a>
                            {d.SITENAME && `, ${d.SITENAME}`}: <strong>{d.DECISION === 'confirmed' ? 'confirmed' : 'not theirs'}</strong> ({formatDate(d.DECIDEDON)})
                            {!d.ISACTIVE && ', employer no longer used'}
                          </span>
                          {d.ISACTIVE && <Decide employerId={d.EMPLOYERID} sites={data.sites} defaultSite={d.SITEID} onDecide={decide} busy={busy} />}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {undecided.length > 0 && (
                  <div className="vacancy-other">
                    <label className="field">
                      <span>Link to another of your employers</span>
                      <select value={other} onChange={(e) => setOther(e.target.value)}>
                        <option value="">Choose…</option>
                        {undecided.map((e) => (
                          <option key={e.EMPLOYERID} value={e.EMPLOYERID}>
                            {e.NAME}
                          </option>
                        ))}
                      </select>
                    </label>
                    {other && <Decide key={other} employerId={other} sites={data.sites} onDecide={decide} busy={busy} />}
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      )}
    </section>
  )
}

export default VacancyPage
