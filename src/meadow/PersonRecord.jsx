import { useCallback, useEffect, useState } from 'react'
import { usePageTitle } from '../shell/navigation'
import { ukDateText, ukTimeText } from '../ukTime'
import { avatarColour } from './avatar'
import './person.css'

// Meadow's person record at /meadow/people/:leadId, opened from a card on
// the board. From the approved "Person record" mock-up, with what CRM_DB
// holds (GET /api/meadow/people/:leadId, server/meadowPerson.js): their
// details and contact, what they've told us, interests, consent in plain
// words, the journey's stage and owner, one timeline of stage moves,
// activities and emails, tasks, the jobs matched to them (never ranked by
// pay) and placements. Opening it is logged (who, which person, when).
// Read only for now: logging a call, adding a task and moving stage come
// later, so the mock-up's buttons aren't here.

const yesNo = (value) => (value == null ? 'Not asked' : value ? 'Yes' : 'No')

function Section({ title, note, children, className = '' }) {
  return (
    <section className={`person-section ${className}`} aria-label={title}>
      <div className="person-section-head">
        <h2>{title}</h2>
        {note && <span>{note}</span>}
      </div>
      {children}
    </section>
  )
}

function StageBar({ journey }) {
  const current = journey.stages.findIndex((s) => s.stageId === journey.stageId)
  return (
    <ol className="person-stages" aria-label="Journey stage" style={{ '--stages': journey.stages.length }}>
      {journey.stages.map((s, i) => {
        const state = current < 0 ? 'later' : i < current ? 'done' : i === current ? 'current' : 'later'
        return (
          <li key={s.stageId} className={`person-stage is-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
            <span className="person-stage-bar" aria-hidden="true" />
            <span className="person-stage-name">{s.name}</span>
          </li>
        )
      })}
    </ol>
  )
}

function Told({ person }) {
  const { told, interests } = person
  const travel = [told.travel, told.travelModes.length ? `by ${told.travelModes.join(' or ')}` : null].filter(Boolean).join(' ')
  const items = [
    { q: 'What they do now', a: told.situation ?? 'Not given' },
    { q: 'Hours they want', a: told.hours ?? 'Not given' },
    { q: 'How far they’ll travel', a: travel || 'Not given' },
    { q: 'English and maths at level 2', a: `English: ${yesNo(told.englishLevel2)} · Maths: ${yesNo(told.mathsLevel2)}` },
  ]
  return (
    <Section title="What they’ve told us" note="From their interest form">
      <dl className="person-told">
        {items.map((i) => (
          <div key={i.q}>
            <dt>{i.q}</dt>
            <dd>{i.a}</dd>
          </div>
        ))}
      </dl>
      <h3 className="person-subhead">Interests</h3>
      {interests.length > 0 ? (
        <ul className="person-interests">
          {interests.map((i) => (
            <li key={i.text}>
              <strong>{i.text}</strong>
              {i.title && <span>{i.title}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="person-empty">No interests yet</p>
      )}
    </Section>
  )
}

function Matches({ matches }) {
  return (
    <Section title="Jobs that fit" note="Matched on interests, hours and travel · never ranked by pay">
      {matches.length === 0 ? (
        <p className="person-empty">No jobs matched yet</p>
      ) : (
        <ul className="person-matches">
          {matches.map((m) => (
            <li key={m.matchId} className={m.excludedReason ? 'person-match is-excluded' : 'person-match'}>
              <div className="person-match-main">
                {m.url && !m.gone ? (
                  <a href={m.url} target="_blank" rel="noreferrer" className="person-match-title">
                    {m.title}
                  </a>
                ) : (
                  <span className="person-match-title">{m.title}</span>
                )}
                {m.employer && <span className="person-match-where">{m.employer}</span>}
                {m.reasons.length > 0 && <span className="person-match-why">Why it fits: {m.reasons.join(' · ')}</span>}
                {m.excludedReason && <span className="person-match-excluded">Ruled out: {m.excludedReason}</span>}
              </div>
              <dl className="person-match-facts">
                <div>
                  <dt>Closes</dt>
                  <dd>{m.gone ? 'Advert closed' : m.closes ? ukDateText(m.closes) : 'Not given'}</dd>
                </div>
                <div>
                  <dt>Shown to them</dt>
                  <dd>{m.shownToThemAt ? ukDateText(m.shownToThemAt) : 'Not yet'}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function Timeline({ timeline }) {
  return (
    <Section title="History" note="Stage moves, calls, meetings, notes and emails">
      {timeline.length === 0 ? (
        <p className="person-empty">Nothing yet</p>
      ) : (
        <ol className="person-timeline">
          {timeline.map((e) => (
            <li key={e.key} className={`person-event is-${e.kind}`}>
              <span className="person-event-dot" aria-hidden="true" />
              <div>
                <p className="person-event-what">{e.what}</p>
                {e.detail && <p className="person-event-detail">{e.detail}</p>}
                <p className="person-event-when">
                  {ukDateText(e.at)}, {ukTimeText(e.at)}
                  {e.who ? ` · ${e.who}` : ''}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Section>
  )
}

function Contact({ person }) {
  const d = person.details
  if (person.anonymised) {
    return (
      <Section title="Contact details">
        <p className="person-empty">Anonymised: their name and contact details were cleared under the retention rule.</p>
      </Section>
    )
  }
  return (
    <Section title="Contact details">
      <dl className="person-facts">
        <div>
          <dt>Email</dt>
          <dd>{d.email ?? 'Not given'}</dd>
        </div>
        <div>
          <dt>Mobile</dt>
          <dd>{d.mobile ?? 'Not given'}</dd>
        </div>
        <div>
          <dt>Date of birth</dt>
          <dd>{d.dateOfBirth ? `${ukDateText(d.dateOfBirth)} (${d.age})` : 'Not given'}</dd>
        </div>
        <div>
          <dt>Postcode</dt>
          <dd>{d.postcode ?? 'Not given'}</dd>
        </div>
        <div>
          <dt>Email confirmed</dt>
          <dd>{d.emailConfirmedAt ? ukDateText(d.emailConfirmedAt) : 'Not yet'}</dd>
        </div>
      </dl>
    </Section>
  )
}

function Consent({ consent, under18 }) {
  return (
    <Section title="Consent" className="person-consent">
      <ul className="person-consent-list">
        {consent.map((c) => (
          <li key={c.kind} className={c.given ? 'is-yes' : c.given === false ? 'is-no' : 'is-unknown'}>
            <span className="person-consent-mark" aria-hidden="true">
              {c.given ? '✓' : c.given === false ? '✕' : '–'}
            </span>
            <span>
              {c.text}
              {c.at && <small> since {ukDateText(c.at)}{c.version ? ` (notice ${c.version})` : ''}</small>}
            </span>
          </li>
        ))}
      </ul>
      {under18 && <p className="person-consent-note">Under 18: safeguarding rules apply.</p>}
    </Section>
  )
}

function Tasks({ tasks }) {
  const all = [...tasks.open, ...tasks.done]
  return (
    <Section title="Tasks">
      {all.length === 0 ? (
        <p className="person-empty">No tasks</p>
      ) : (
        <ul className="person-tasks">
          {all.map((t) => (
            <li key={t.taskId} className={t.done ? 'is-done' : ''}>
              <span className="person-task-mark" aria-hidden="true">{t.done ? '✓' : ''}</span>
              <span>
                <span className="person-task-title">{t.title}</span>
                <small>
                  {t.done ? `Done ${t.doneAt ? ukDateText(t.doneAt) : ''}` : t.due ? `Due ${ukDateText(t.due)}` : 'No due date'}
                  {t.owner ? ` · ${t.owner}` : ''}
                </small>
                {t.details && <span className="person-task-details">{t.details}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function Placements({ placements }) {
  return (
    <Section title="Placements">
      {placements.length === 0 ? (
        <p className="person-empty">Not put forward to an employer yet</p>
      ) : (
        <ul className="person-placements">
          {placements.map((p) => (
            <li key={p.placementId}>
              <div className="person-placement-head">
                <strong>{p.employer ?? 'An employer'}</strong>
                <span className="person-chip">{p.status}</span>
              </div>
              {(p.vacancy || p.standard) && <p>{[p.vacancy, p.standard].filter(Boolean).join(' · ')}</p>}
              <small>
                Put forward {ukDateText(p.putForwardAt)}
                {p.statusChangedAt ? ` · ${p.status} ${ukDateText(p.statusChangedAt)}` : ''}
                {p.outcomeReason ? ` · ${p.outcomeReason}` : ''}
              </small>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function PersonRecord({ leadId }) {
  const [person, setPerson] = useState(null)
  const [error, setError] = useState(null)
  const [missing, setMissing] = useState(false)
  usePageTitle(person ? person.name : missing ? 'Person not found' : 'Person')

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/meadow/people/${encodeURIComponent(leadId)}`)
      const data = await res.json()
      if (res.status === 404) {
        setMissing(true)
        return
      }
      if (!res.ok) throw new Error(data.error || `Server responded with ${res.status}`)
      setPerson(data)
    } catch (err) {
      setError(err.message)
    }
  }, [leadId])

  useEffect(() => {
    load()
  }, [load])

  const back = (
    <a href="/meadow" className="person-back">
      ← Back to the pipeline
    </a>
  )

  if (missing) {
    return (
      <main className="meadow-main person">
        {back}
        <h1 className="person-missing">We couldn’t find this person</h1>
        <p className="person-empty">They may have been removed, or the link is wrong.</p>
      </main>
    )
  }

  const d = person?.details
  const j = person?.journey
  return (
    <main className="meadow-main person">
      {back}
      {error && (
        <div className="meadow-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={load}>
            Try again
          </button>
        </div>
      )}
      {!person && !error && <p className="meadow-loading">Loading…</p>}

      {person && (
        <>
          <section className="person-header" aria-label="Who they are">
            <div className="person-who">
              <span className="person-avatar" aria-hidden="true" style={{ background: avatarColour(person.leadId) }}>
                {person.initials}
              </span>
              <div className="person-name">
                <h1>{person.name}</h1>
                <p className="person-meta">
                  {person.told.situation && <span className="person-chip">{person.told.situation}</span>}
                  {d.under18 && <span className="person-chip is-minor">Under 18</span>}
                  {d.age != null && <span>Age {d.age}</span>}
                  {d.district && <span>{d.district}</span>}
                  {d.cameVia && <span>Came via {d.cameVia}, {ukDateText(d.createdAt)}</span>}
                  {j && <span>{j.owner ? `With ${j.owner}` : 'Nobody looking after them yet'}</span>}
                </p>
              </div>
            </div>
            {j ? (
              <>
                {j.status && (
                  <p className={j.category === 'lost' ? 'person-status is-lost' : 'person-status'}>
                    {j.status}
                    {j.closedAt ? `, ${ukDateText(j.closedAt)}` : ''}
                  </p>
                )}
                {j.category !== 'lost' && <StageBar journey={j} />}
                {!j.status && (
                  <p className="person-in-stage">
                    {j.stage} since {ukDateText(j.inStageSince)}
                  </p>
                )}
              </>
            ) : (
              <p className="person-empty">Not in the pipeline</p>
            )}
          </section>

          <div className="person-columns">
            <div className="person-main">
              <Told person={person} />
              <Matches matches={person.matches} />
              <Timeline timeline={person.timeline} />
            </div>
            <aside className="person-aside">
              <Contact person={person} />
              <Consent consent={person.consent} under18={d.under18} />
              <Tasks tasks={person.tasks} />
              <Placements placements={person.placements} />
            </aside>
          </div>
        </>
      )}
    </main>
  )
}

export default PersonRecord
