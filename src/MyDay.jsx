import { useCallback, useEffect, useState } from 'react'
import './MyDay.css'
import { OFFICER_TYPE_OPTIONS } from './ilrCodes'
import { labelFromOptions, standardLabel } from './lookups'
import ProgressReviewForm from './ProgressReviewForm'

// The officer home page. There are no logins yet, so the whole page
// follows whoever is picked in "I'm viewing as" (remembered in this
// browser only). Every figure and every task comes from
// /api/myday/:officerRefNumber, where it's worked out in Snowflake SQL.

const VIEWING_AS_KEY = 'warren.myday.viewingAs'

function readViewingAs() {
  try {
    return localStorage.getItem(VIEWING_AS_KEY)
  } catch {
    return null
  }
}

function saveViewingAs(ref) {
  try {
    localStorage.setItem(VIEWING_AS_KEY, ref)
  } catch {
    // Not remembering the choice is fine.
  }
}

// Dates arrive as 'YYYY-MM-DD'. Treat them as calendar dates, not moments,
// so they never shift a day with the time zone.
function toDate(iso) {
  return new Date(`${String(iso).slice(0, 10)}T00:00:00Z`)
}

function longDate(iso) {
  return toDate(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// "30 Jun", or "30 Jun 2027" when it's not this year.
function shortDate(iso, todayIso) {
  if (!iso) return '—'
  const sameYear = String(iso).slice(0, 4) === String(todayIso).slice(0, 4)
  return toDate(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  })
}

function days(n) {
  return `${n} ${Math.abs(n) === 1 ? 'day' : 'days'}`
}

function fullName(learner) {
  return `${learner.GIVENNAMES ?? ''} ${learner.FAMILYNAME ?? ''}`.trim() || learner.LEARNREFNUMBER
}

// The five checks, in the order they're listed.
const CHECKS = [
  {
    task: 'past_end',
    filter: 'end_dates',
    label: 'Past planned end date',
    clear: 'No one is past their planned end date',
  },
  {
    task: 'ending_soon',
    filter: 'end_dates',
    label: 'Ending soon',
    clear: 'No one finishes in the next 30 days',
  },
  {
    task: 'review_due',
    filter: 'reviews',
    label: 'Progress review due',
    clear: 'No progress reviews are overdue or due in the next 5 weeks',
  },
  {
    task: 'no_recent_evidence',
    filter: 'no_recent_evidence',
    label: 'No recent evidence',
    clear: 'Everyone has added evidence in the last 28 days',
  },
  {
    task: 'evidence_review',
    filter: 'evidence',
    label: 'Evidence to review',
    clear: 'No evidence is waiting for review yet',
  },
]
const CHECK_BY_TASK = new Map(CHECKS.map((c) => [c.task, c]))

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'evidence', label: 'Evidence' },
  { key: 'reviews', label: 'Reviews' },
  { key: 'no_recent_evidence', label: 'No recent evidence' },
  { key: 'end_dates', label: 'End dates' },
]

function taskDetail(task, learner, today) {
  switch (task.TASK) {
    case 'past_end':
      return `Planned end ${shortDate(learner.LEARNPLANENDDATE, today)}, ${days(-learner.DAYS_UNTIL_PLANNED_END)} ago`
    case 'ending_soon':
      return learner.DAYS_UNTIL_PLANNED_END === 0
        ? `Planned end today, ${shortDate(learner.LEARNPLANENDDATE, today)}`
        : `Planned end ${shortDate(learner.LEARNPLANENDDATE, today)}, in ${days(learner.DAYS_UNTIL_PLANNED_END)}`
    case 'review_due': {
      const from = learner.LAST_REVIEW_DATE
        ? `Last review ${shortDate(learner.LAST_REVIEW_DATE, today)}`
        : `No review yet, started ${shortDate(learner.LEARNSTARTDATE, today)}`
      const due = `due by ${shortDate(learner.REVIEW_DUE_BY, today)}`
      const overdue = learner.DAYS_UNTIL_REVIEW_DUE < 0 ? `, ${days(-learner.DAYS_UNTIL_REVIEW_DUE)} overdue` : ''
      return `${from}, ${due}${overdue}`
    }
    case 'no_recent_evidence':
      return learner.LAST_EVIDENCE_DATE
        ? `Last evidence ${shortDate(learner.LAST_EVIDENCE_DATE, today)}, ${days(learner.DAYS_SINCE_EVIDENCE)} ago`
        : `No evidence yet, started ${shortDate(learner.LEARNSTARTDATE, today)} (${days(learner.DAYS_SINCE_EVIDENCE)} ago)`
    case 'evidence_review':
      return `"${task.EVIDENCE_TITLE}", submitted ${shortDate(task.SUBMITTED_AT, today)}, waiting ${days(task.DAYS_WAITING)}`
    default:
      return ''
  }
}

function TaskCard({ task, learner, today, onOpenLearner, onRecordReview }) {
  const check = CHECK_BY_TASK.get(task.TASK)
  let action
  if (task.TASK === 'review_due') {
    action = (
      <button type="button" className="myday-button" onClick={() => onRecordReview(learner)}>
        Record review
      </button>
    )
  } else if (task.TASK === 'evidence_review') {
    // Burrow's review screen doesn't exist yet.
    action = (
      <button type="button" className="myday-button" disabled title="Available once Burrow is built">
        Review evidence
      </button>
    )
  } else {
    action = (
      <button type="button" className="myday-button-secondary" onClick={() => onOpenLearner(learner.LEARNREFNUMBER)}>
        Open learner
      </button>
    )
  }

  return (
    <li className={`myday-task myday-task-${task.TASK}`}>
      <span className="myday-task-type">{check?.label}</span>
      <button type="button" className="myday-task-name" onClick={() => onOpenLearner(learner.LEARNREFNUMBER)}>
        {fullName(learner)}
      </button>
      <span className="myday-task-detail">{taskDetail(task, learner, today)}</span>
      <div className="myday-task-action">{action}</div>
    </li>
  )
}

function StackedBar({ segments, total }) {
  if (!total) return <div className="myday-stack myday-stack-empty" />
  return (
    <div className="myday-stack" role="img" aria-label={segments.map((s) => `${s.value} ${s.label}`).join(', ')}>
      {segments
        .filter((s) => s.value > 0)
        .map((s) => (
          <span key={s.key} className={`myday-stack-${s.key}`} style={{ width: `${(100 * s.value) / total}%` }} />
        ))}
    </div>
  )
}

function RateTile({ title, rate, count, of, verb, year }) {
  return (
    <div className="myday-tile">
      <span className="myday-tile-title">{title}</span>
      <span className="myday-tile-year">
        {year} to {year + 1}
      </span>
      <span className="myday-tile-value">{rate === null || rate === undefined ? '—' : `${rate}%`}</span>
      <span className="myday-tile-note">
        {of > 0 ? `${count} of ${of} leavers ${verb}` : `No leavers in ${year} to ${year + 1} yet`}
      </span>
      <span className="myday-tile-foot">Indicative, QAR method</span>
    </div>
  )
}

function TrackerRow({ learner, today, onOpenLearner }) {
  const pct = learner.PCT_TIME_ON_PROGRAMME
  const position = Math.min(Math.max(pct ?? 0, 0), 100)
  let label
  if (pct === null || pct === undefined) label = '—'
  else if (pct < 0) label = `Starts ${shortDate(learner.LEARNSTARTDATE, today)}`
  else if (pct > 100) label = `Past planned end (${pct}% of time)`
  else label = `${pct}% of time`

  return (
    <li className="myday-track-row">
      <div className="myday-track-who">
        <button type="button" className="myday-task-name" onClick={() => onOpenLearner(learner.LEARNREFNUMBER)}>
          {fullName(learner)}
        </button>
        <span className="myday-muted">{standardLabel(learner, { withLevel: false })}</span>
      </div>
      <div className="myday-track-bar-wrap">
        <div
          className="myday-track-bar"
          role="img"
          aria-label={`${label}. Planned ${shortDate(learner.LEARNSTARTDATE, today)} to ${shortDate(learner.LEARNPLANENDDATE, today)}.`}
        >
          {/* Reserved for KSB progress once sign-off data exists: its
              width will be the share of KSBs signed off. */}
          <span className="myday-track-ksb" style={{ width: '0%' }} />
          <span className="myday-track-time" style={{ width: `${position}%` }} />
          <span className={`myday-track-marker${pct > 100 ? ' is-over' : ''}`} style={{ left: `${position}%` }} />
        </div>
        <span className="myday-track-label">{label}</span>
      </div>
    </li>
  )
}

function MyDay({ onOpenLearner }) {
  const [officers, setOfficers] = useState([])
  const [officersStatus, setOfficersStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [viewingAs, setViewingAs] = useState(null)

  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null)

  const [filter, setFilter] = useState('all')
  const [reviewLearner, setReviewLearner] = useState(null)
  const [savedMessage, setSavedMessage] = useState(null)

  useEffect(() => {
    async function loadOfficers() {
      try {
        const res = await fetch('/api/officers')
        if (!res.ok) throw new Error(`Server responded with ${res.status}`)
        const list = await res.json()
        setOfficers(list)
        setOfficersStatus('ready')
        const saved = readViewingAs()
        const pick = list.find((o) => o.OFFICERREFNUMBER === saved) ?? list[0]
        setViewingAs(pick?.OFFICERREFNUMBER ?? null)
      } catch {
        setOfficersStatus('error')
      }
    }
    loadOfficers()
  }, [])

  // Sets 'loading' itself only when an officer is picked (handleViewingAs),
  // so a reload after saving a review keeps the page in place.
  const loadDay = useCallback(async (ref) => {
    if (!ref) return
    try {
      const res = await fetch(`/api/myday/${encodeURIComponent(ref)}`)
      if (!res.ok) throw new Error(`Server responded with ${res.status}`)
      setData(await res.json())
      setStatus('ready')
      setError(null)
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    loadDay(viewingAs)
  }, [viewingAs, loadDay])

  function handleViewingAs(ref) {
    setStatus('loading')
    setViewingAs(ref)
    setSavedMessage(null)
    saveViewingAs(ref)
  }

  function handleReviewSaved(learner) {
    setReviewLearner(null)
    setSavedMessage(`Review saved for ${fullName(learner)}.`)
    loadDay(viewingAs)
  }

  const officer = data?.officer
  const today = data?.today
  const learnersByRef = new Map((data?.learners ?? []).map((l) => [l.LEARNREFNUMBER, l]))
  const inFilter = (task) => filter === 'all' || CHECK_BY_TASK.get(task)?.filter === filter
  const tasks = (data?.tasks ?? []).filter((t) => learnersByRef.has(t.LEARNREFNUMBER) && inFilter(t.TASK))
  const doFirst = tasks.filter((t) => t.PRIORITY === 'do_first')
  const comingUp = tasks.filter((t) => t.PRIORITY === 'coming_up')
  const clearChecks = CHECKS.filter(
    (c) => inFilter(c.task) && !(data?.tasks ?? []).some((t) => t.TASK === c.task),
  )
  const firstName = officer?.OFFICERNAME?.split(' ')[0] ?? ''
  const caseload = data?.caseload
  const qar = data?.qar

  const renderCards = (list) =>
    list.map((t) => (
      <TaskCard
        key={`${t.TASK}-${t.LEARNREFNUMBER}-${t.EVIDENCE_ID ?? ''}`}
        task={t}
        learner={learnersByRef.get(t.LEARNREFNUMBER)}
        today={today}
        onOpenLearner={onOpenLearner}
        onRecordReview={setReviewLearner}
      />
    ))

  return (
    <div className="myday">
      <section id="myday">
        <div className="myday-top">
          <div>
            {officer && (
              <p className="myday-date">
                {longDate(today)} · {labelFromOptions(OFFICER_TYPE_OPTIONS, officer.OFFICERTYPE)}
              </p>
            )}
            <h2 className="myday-greeting">
              {officer ? `Morning, ${firstName}. Here's your day.` : 'My day'}
            </h2>
          </div>
          <label className="myday-viewing-as">
            <span>I&apos;m viewing as</span>
            <select
              value={viewingAs ?? ''}
              disabled={officersStatus !== 'ready' || officers.length === 0}
              onChange={(e) => handleViewingAs(e.target.value)}
            >
              {officersStatus === 'loading' && <option value="">Loading officers…</option>}
              {officers.map((o) => (
                <option key={o.OFFICERREFNUMBER} value={o.OFFICERREFNUMBER}>
                  {o.OFFICERNAME} ({labelFromOptions(OFFICER_TYPE_OPTIONS, o.OFFICERTYPE)})
                </option>
              ))}
            </select>
          </label>
        </div>

        {officersStatus === 'error' && <p role="alert">Couldn&apos;t load the list of officers.</p>}
        {officersStatus === 'ready' && officers.length === 0 && (
          <p className="myday-muted">Add an officer on the Officers tab to see their day.</p>
        )}
        {status === 'loading' && officersStatus !== 'error' && officers.length > 0 && (
          <p className="myday-muted">Working out your day…</p>
        )}
        {status === 'error' && <p role="alert">Couldn&apos;t load My day: {error}</p>}

        {status === 'ready' && data && (
          <>
            {savedMessage && (
              <p className="myday-saved" role="status">
                {savedMessage}
              </p>
            )}

            <div className="myday-tiles">
              <div className="myday-tile">
                <span className="myday-tile-title">Caseload</span>
                <span className="myday-tile-value">{caseload.TOTAL}</span>
                <span className="myday-tile-note">learners assigned</span>
                <StackedBar
                  total={caseload.TOTAL}
                  segments={[
                    { key: 'continuing', label: 'continuing', value: caseload.CONTINUING },
                    { key: 'completed', label: 'completed', value: caseload.COMPLETED },
                    { key: 'withdrawn', label: 'withdrawn', value: caseload.WITHDRAWN },
                  ]}
                />
                <ul className="myday-legend">
                  <li>
                    <span className="myday-swatch myday-stack-continuing" /> {caseload.CONTINUING} continuing
                  </li>
                  <li>
                    <span className="myday-swatch myday-stack-completed" /> {caseload.COMPLETED} completed
                  </li>
                  <li>
                    <span className="myday-swatch myday-stack-withdrawn" /> {caseload.WITHDRAWN} withdrawn
                  </li>
                </ul>
              </div>

              <RateTile
                title="Achievement"
                rate={qar.ACHIEVEMENT_RATE}
                count={qar.ACHIEVERS ?? 0}
                of={qar.LEAVERS ?? 0}
                verb="achieved"
                year={qar.YEAR}
              />
              <RateTile
                title="Retention"
                rate={qar.RETENTION_RATE}
                count={qar.COMPLETERS ?? 0}
                of={qar.LEAVERS ?? 0}
                verb="completed"
                year={qar.YEAR}
              />

              {/* Placeholder until KSB sign-off data exists. */}
              <div className="myday-tile myday-tile-placeholder">
                <span className="myday-tile-title">On track</span>
                <svg className="myday-ring" viewBox="0 0 80 80" aria-hidden="true">
                  <circle cx="40" cy="40" r="32" />
                </svg>
                <span className="myday-tile-note">Available once KSB sign-off is live</span>
              </div>
            </div>

            <h3 className="myday-heading">Today&apos;s tasks</h3>
            <div className="myday-filters" role="group" aria-label="Filter tasks">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={filter === f.key ? 'myday-filter active' : 'myday-filter'}
                  aria-pressed={filter === f.key}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="myday-columns">
              <div className="myday-column myday-column-do-first">
                <h4>
                  Do first <span className="myday-count">{doFirst.length}</span>
                </h4>
                {doFirst.length === 0 ? (
                  <p className="myday-muted">Nothing urgent.</p>
                ) : (
                  <ul className="myday-task-list">{renderCards(doFirst)}</ul>
                )}
              </div>

              <div className="myday-column myday-column-coming-up">
                <h4>
                  Coming up <span className="myday-count">{comingUp.length}</span>
                </h4>
                {comingUp.length === 0 ? (
                  <p className="myday-muted">Nothing coming up.</p>
                ) : (
                  <ul className="myday-task-list">{renderCards(comingUp)}</ul>
                )}
              </div>

              <div className="myday-column myday-column-clear">
                <h4>
                  Checked and clear <span className="myday-count">{clearChecks.length}</span>
                </h4>
                {clearChecks.length === 0 ? (
                  <p className="myday-muted">Every check has something in it.</p>
                ) : (
                  <ul className="myday-clear-list">
                    {clearChecks.map((c) => (
                      <li key={c.task}>
                        <span className="myday-tick" aria-hidden="true">
                          ✓
                        </span>
                        <span>
                          {c.clear}
                          {c.task === 'ending_soon' && (
                            <span className="myday-clear-note">
                              {data.nextToFinish
                                ? `Next to finish: ${fullName(data.nextToFinish)}, ${shortDate(data.nextToFinish.LEARNPLANENDDATE, today)}`
                                : 'No continuing learners with a planned end date ahead.'}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <h3 className="myday-heading">How my learners are tracking</h3>
            <p className="myday-muted myday-track-key">
              <span className="myday-key-time" /> Time on programme, start to planned end date{' '}
              <span className="myday-key-marker" /> Today
              <span className="myday-key-ksb" /> KSB progress: available once KSB sign-off is live
            </p>
            {data.learners.length === 0 ? (
              <p className="myday-muted">No continuing learners.</p>
            ) : (
              <ul className="myday-track-list">
                {data.learners.map((l) => (
                  <TrackerRow key={l.LEARNREFNUMBER} learner={l} today={today} onOpenLearner={onOpenLearner} />
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {reviewLearner && officer && (
        <ProgressReviewForm
          learner={reviewLearner}
          officer={officer}
          today={today}
          onSaved={handleReviewSaved}
          onCancel={() => setReviewLearner(null)}
        />
      )}
    </div>
  )
}

export default MyDay
