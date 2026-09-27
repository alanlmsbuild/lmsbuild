import { useEffect, useRef } from 'react'
import {
  EVIDENCE_STATUS_LABELS,
  EVIDENCE_TYPE_OPTIONS,
  KSB_GROUPS,
  KSB_STATUS_LABELS,
  countStatuses,
} from '../burrowCodes'
import { labelFromOptions } from '../lookups'
import { KsbChip, KsbText, NotLoaded, StatusBar } from './KsbParts'

const RECENT_COUNT = 6

function evidenceMeta(e) {
  const parts = [labelFromOptions(EVIDENCE_TYPE_OPTIONS, e.EVIDENCE_TYPE)]
  if (e.KSB_REFS) parts.push(e.KSB_REFS)
  parts.push(EVIDENCE_STATUS_LABELS[e.STATUS]?.toLowerCase() ?? e.STATUS)
  if (e.EMPLOYER_OUTCOME === 'confirmed') parts.push('confirmed by employer')
  if (e.EMPLOYER_OUTCOME === 'declined') parts.push('declined by employer')
  return parts.join(' · ')
}

// Screen 1: the learner's portfolio. Every figure comes from the server;
// KSB statuses are worked out there from evidence and reviews. readOnly is
// for staff reading it: only the learner adds or changes evidence.
function Portfolio({ portfolio, readOnly = false, flash, onDismissFlash, scrollToFeedback, navigate }) {
  const feedbackRef = useRef(null)
  const { learner, ksbs, ksbsLoaded, evidence } = portfolio
  const counts = countStatuses(ksbs)
  const waiting = evidence.filter((e) => e.STATUS === 'submitted').length
  const feedback = evidence.filter((e) => e.STATUS === 'changes_requested')
  const recent = evidence.slice(0, RECENT_COUNT)

  useEffect(() => {
    if (scrollToFeedback) feedbackRef.current?.scrollIntoView({ block: 'start' })
  }, [scrollToFeedback])

  const openEvidence = (e) => navigate(`/burrow/add?evidence=${encodeURIComponent(e.EVIDENCE_ID)}`)

  return (
    <div className="burrow-layout">
      <main className="burrow-main">
        {flash && (
          <p className="burrow-flash" role="status">
            {flash}
            <button type="button" className="burrow-flash-close" onClick={onDismissFlash} aria-label="Dismiss">
              ×
            </button>
          </p>
        )}

        <div className="burrow-greeting">
          <h1>
            {readOnly
              ? `${[learner.GIVENNAMES, learner.FAMILYNAME].filter(Boolean).join(' ') || learner.LEARNREFNUMBER}’s portfolio`
              : `Hello, ${learner.GIVENNAMES || learner.LEARNREFNUMBER}`}
          </h1>
          <p>
            {learner.STDREFERENCE} {learner.STDNAME}
            {learner.STDLEVEL !== null && learner.STDLEVEL !== undefined && ` · Level ${learner.STDLEVEL}`}
          </p>
        </div>

        <section className="burrow-card burrow-progress" aria-label="Overall progress">
          {ksbsLoaded ? (
            <>
              <div className="burrow-progress-head">
                <strong>
                  {counts.signed_off} of {ksbs.length} KSBs signed off
                </strong>
                <span>
                  {waiting} {waiting === 1 ? 'piece' : 'pieces'} waiting for {readOnly ? 'the' : 'your'} assessor
                </span>
              </div>
              <StatusBar counts={counts} total={ksbs.length} />
              <ul className="burrow-legend">
                {Object.entries(KSB_STATUS_LABELS).map(([status, label]) => (
                  <li key={status}>
                    <span className={`burrow-swatch burrow-bar-${status}`} />
                    {label}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <NotLoaded forStaff={readOnly} />
          )}
        </section>

        {ksbsLoaded && (
          <div className="burrow-ksb-columns">
            {KSB_GROUPS.map((group) => {
              const items = ksbs.filter((k) => k.KSB_TYPE === group.type)
              const signed = items.filter((k) => k.STATUS === 'signed_off').length
              return (
                <section key={group.type} className="burrow-card burrow-ksb-group">
                  <div className="burrow-ksb-group-head">
                    <h2>{group.title}</h2>
                    <span>
                      {signed} of {items.length} signed off
                    </span>
                  </div>
                  <ul className="burrow-ksb-list">
                    {items.map((k) => (
                      <li key={k.KSB_REFERENCE}>
                        <span className="burrow-ksb-ref">{k.KSB_REFERENCE}</span>
                        <KsbText text={k.DETAIL} />
                        <KsbChip status={k.STATUS} />
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </main>

      <aside className="burrow-aside">
        {!readOnly && (
          <a
            href="/burrow/add"
            className="burrow-add-button"
            onClick={(e) => {
              e.preventDefault()
              navigate('/burrow/add')
            }}
          >
            Add evidence
          </a>
        )}

        <section id="feedback" ref={feedbackRef} className="burrow-card">
          <h2>{readOnly ? 'Feedback waiting for the learner' : 'Feedback for you'}</h2>
          {feedback.length === 0 ? (
            <p className="burrow-muted">
              {readOnly
                ? 'No feedback waiting.'
                : 'No feedback waiting. When your assessor asks for changes, it’ll show here.'}
            </p>
          ) : (
            feedback.map((e) => (
              <div key={e.EVIDENCE_ID} className="burrow-feedback">
                <strong>{e.TITLE}</strong>
                {e.FEEDBACK && <p>&ldquo;{e.FEEDBACK}&rdquo;</p>}
                <span className="burrow-muted">
                  {e.OFFICER_NAME || 'Your assessor'} · needs changes
                </span>
                {!readOnly && (
                  <button type="button" className="burrow-link-button" onClick={() => openEvidence(e)}>
                    Make changes
                  </button>
                )}
              </div>
            ))
          )}
        </section>

        <section className="burrow-card">
          <h2>Recent evidence</h2>
          {recent.length === 0 ? (
            <p className="burrow-muted">
              {readOnly ? 'No evidence yet.' : 'Nothing yet. Add your first piece of evidence to get started.'}
            </p>
          ) : (
            <ul className="burrow-recent">
              {recent.map((e) => (
                <li key={e.EVIDENCE_ID}>
                  {!readOnly && (e.STATUS === 'draft' || e.STATUS === 'changes_requested') ? (
                    <button type="button" className="burrow-recent-title" onClick={() => openEvidence(e)}>
                      {e.TITLE}
                    </button>
                  ) : (
                    <strong>{e.TITLE}</strong>
                  )}
                  <span className="burrow-muted">{evidenceMeta(e)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  )
}

export default Portfolio
