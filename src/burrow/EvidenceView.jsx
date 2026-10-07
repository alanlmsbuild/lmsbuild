import SkillsEnglandCredit from '../SkillsEnglandCredit'
import { useEffect, useState } from 'react'
import { EVIDENCE_STATUS_LABELS, EVIDENCE_TYPE_OPTIONS, IQA_OUTCOME_OPTIONS, WITNESS_OUTCOME_OPTIONS, formatBytes } from '../burrowCodes'
import { formatDate, labelFromOptions } from '../lookups'
import { usePageTitle } from '../shell/navigation'

// Staff's read-only view of one piece of evidence, on the learner page's
// Portfolio tab: /burrow/learners/<ref>/evidence/<id>. Everything about it:
// what the learner wrote and claimed, the files, each assessor review, the
// employer's answers on a witness statement, and IQA checks. Only the
// learner changes their evidence, so there's nothing to edit here.

const REVIEW_OUTCOMES = { signed_off: 'Signed off', changes_requested: 'Changes requested' }
const KSB_DECISIONS = { confirmed: 'Confirmed', rejected: 'Not confirmed' }

function when(timestamp) {
  return timestamp ? formatDate(String(timestamp).slice(0, 10)) : '—'
}

function EvidenceView({ learnRefNumber, evidenceId, portfolioPath }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(
          `/api/burrow/learners/${encodeURIComponent(learnRefNumber)}/evidence/${encodeURIComponent(evidenceId)}`,
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || `Server responded with ${res.status}`)
        if (!cancelled) setData(json)
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [learnRefNumber, evidenceId])

  usePageTitle(data ? data.evidence.TITLE : 'Evidence')

  const fileUrl = (f) => `/api/burrow/learners/${encodeURIComponent(learnRefNumber)}/files/${encodeURIComponent(f.FILE_ID)}`

  return (
    <div className="burrow-evidence-view">
      <a className="burrow-evidence-back" href={portfolioPath}>
        <span aria-hidden="true">←</span> All evidence
      </a>

      {error && <p role="alert">Couldn&apos;t load this evidence: {error}</p>}
      {!data && !error && <p className="burrow-muted">Loading the evidence…</p>}

      {data && (
        <>
          <div className="burrow-evidence-head">
            <h2>{data.evidence.TITLE}</h2>
            <p className="burrow-muted">
              {labelFromOptions(EVIDENCE_TYPE_OPTIONS, data.evidence.EVIDENCE_TYPE)} · happened on{' '}
              {formatDate(data.evidence.OCCURRED_ON)} ·{' '}
              <span className={`burrow-evidence-status burrow-evidence-status--${data.evidence.STATUS}`}>
                {EVIDENCE_STATUS_LABELS[data.evidence.STATUS] ?? data.evidence.STATUS}
              </span>
            </p>
            <p className="burrow-muted">Read only. Only the learner can change their evidence.</p>
          </div>

          <section className="burrow-card" aria-labelledby="ev-reflection">
            <h3 id="ev-reflection">The learner&apos;s reflection</h3>
            {data.evidence.REFLECTION ? (
              <p className="burrow-evidence-text">{data.evidence.REFLECTION}</p>
            ) : (
              <p className="burrow-muted">No reflection written.</p>
            )}
          </section>

          <section className="burrow-card" aria-labelledby="ev-ksbs">
            <h3 id="ev-ksbs">KSBs claimed ({data.claimDetails.length})</h3>
            {data.claimDetails.length === 0 ? (
              <p className="burrow-muted">No KSBs claimed.</p>
            ) : (
              <ul className="burrow-evidence-list">
                {data.claimDetails.map((k) => (
                  <li key={k.KSB_REFERENCE}>
                    <strong>{k.KSB_REFERENCE}</strong> {k.KSB_TEXT ?? ''}
                    <span className="burrow-muted">
                      {' '}
                      · {KSB_DECISIONS[k.DECISION] ?? 'Not reviewed yet'}
                      {k.DECISION_COMMENT ? `: ${k.DECISION_COMMENT}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {data.claimDetails.length > 0 && <SkillsEnglandCredit />}
          </section>

          <section className="burrow-card" aria-labelledby="ev-files">
            <h3 id="ev-files">Files ({data.files.length})</h3>
            {data.files.length === 0 ? (
              <p className="burrow-muted">No files.</p>
            ) : (
              <ul className="burrow-evidence-list">
                {data.files.map((f) => (
                  <li key={f.FILE_ID}>
                    <a href={fileUrl(f)} target="_blank" rel="noopener noreferrer">
                      {f.ORIGINAL_FILENAME}
                    </a>
                    <span className="burrow-muted">
                      {' '}
                      · {formatBytes(f.SIZE_BYTES)} · added {when(f.UPLOADED_AT)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="burrow-card" aria-labelledby="ev-reviews">
            <h3 id="ev-reviews">Assessor reviews ({data.reviews.length})</h3>
            {data.reviews.length === 0 ? (
              <p className="burrow-muted">Not reviewed yet.</p>
            ) : (
              <ul className="burrow-evidence-list">
                {data.reviews.map((r) => (
                  <li key={r.REVIEW_ID}>
                    <strong>{REVIEW_OUTCOMES[r.OUTCOME] ?? r.OUTCOME}</strong>
                    <span className="burrow-muted">
                      {' '}
                      · {r.OFFICER_NAME}, {when(r.REVIEWED_AT)} · submission {r.SUBMISSION_NUMBER}
                    </span>
                    {r.FEEDBACK && <p className="burrow-evidence-text">&ldquo;{r.FEEDBACK}&rdquo;</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(data.evidence.EVIDENCE_TYPE === 'witness_statement' || data.confirmations.length > 0) && (
            <section className="burrow-card" aria-labelledby="ev-employer">
              <h3 id="ev-employer">Employer&apos;s answer</h3>
              {data.confirmations.length === 0 ? (
                <p className="burrow-muted">The employer hasn&apos;t answered yet.</p>
              ) : (
                <ul className="burrow-evidence-list">
                  {data.confirmations.map((c) => (
                    <li key={`${c.SUBMISSION_NUMBER}-${c.CONFIRMED_AT}`}>
                      <strong>{labelFromOptions(WITNESS_OUTCOME_OPTIONS, c.OUTCOME)}</strong>
                      <span className="burrow-muted">
                        {' '}
                        · {c.CONFIRMER_NAME}, {when(c.CONFIRMED_AT)} · submission {c.SUBMISSION_NUMBER}
                      </span>
                      {c.COMMENT_TEXT && <p className="burrow-evidence-text">&ldquo;{c.COMMENT_TEXT}&rdquo;</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {data.iqaChecks && (
            <section className="burrow-card" aria-labelledby="ev-iqa">
              <h3 id="ev-iqa">IQA checks ({data.iqaChecks.length})</h3>
              {data.iqaChecks.length === 0 ? (
                <p className="burrow-muted">No IQA checks yet.</p>
              ) : (
                <ul className="burrow-evidence-list">
                  {data.iqaChecks.map((c) => (
                    <li key={`${c.REVIEW_ID}-${c.CHECKED_AT}`}>
                      <strong>{labelFromOptions(IQA_OUTCOME_OPTIONS, c.OUTCOME)}</strong>
                      <span className="burrow-muted">
                        {' '}
                        · {c.IQA_NAME}, {when(c.CHECKED_AT)}
                      </span>
                      {c.FEEDBACK && <p className="burrow-evidence-text">&ldquo;{c.FEEDBACK}&rdquo;</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}

export default EvidenceView
