import { formatDate } from '../lookups'
import {
  afinLabel,
  empStatLabel,
  esmLabel,
  fundModelLabel,
  hrsLabel,
  learnDelFamLabel,
  learnerFamLabel,
  llddCatLabel,
  priorLevelLabel,
  progTypeLabel,
} from '../ilrLabels'
import { COMPLETION_STATUS_LABELS, OUTCOME_LABELS, describe } from '../lookups'

// The Record tab's ILR parts, read only: each section's records, and the
// ILR 2026 to 2027 checks that fail for it (from GET
// /api/learners/:ref/ilr, the same rules as Reports → ILR return).

export function Row({ label, value }) {
  return (
    <div className="record-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  )
}

// A section card. rules: this section's failing checks, shown first.
export function Section({ title, rules = [], children, wide = false }) {
  return (
    <section className={`learner-section${wide ? ' learner-section--wide' : ''}`} aria-label={title}>
      <h2>{title}</h2>
      {rules.length > 0 && <RuleList rules={rules} />}
      {children}
    </section>
  )
}

function RuleList({ rules }) {
  return (
    <ul className="record-rules">
      {rules.map((r) => (
        <li key={r.rule} className={`record-rule record-rule--${r.severity.toLowerCase()}`}>
          <strong>
            {r.severity} · {r.rule.startsWith('Warren') ? 'Warren check' : r.rule}
          </strong>{' '}
          {r.description}
        </li>
      ))}
    </ul>
  )
}

// The summary at the top of the Record tab.
export function IlrSummary({ ilr, status, error, canSeePrices }) {
  if (status === 'loading') return <p className="record-ilr-summary">Checking the ILR records…</p>
  if (status === 'error') {
    return (
      <p className="record-ilr-summary record-ilr-summary--problem" role="alert">
        Couldn&apos;t check the ILR records: {error}
      </p>
    )
  }
  const errors = ilr.rules.filter((r) => r.severity === 'Error').length
  const warnings = ilr.rules.length - errors
  const note = canSeePrices ? null : ' Checks on NI number, prices and payments are for managers only.'
  if (ilr.notInReturn) {
    return (
      <p className="record-ilr-summary">
        <strong>ILR {ilr.yearLabel}:</strong> not in this year&apos;s return. {ilr.notInReturn}
      </p>
    )
  }
  if (ilr.rules.length === 0) {
    return (
      <p className="record-ilr-summary record-ilr-summary--ok">
        <strong>ILR {ilr.yearLabel}:</strong> no problems found by Warren&apos;s checks. DfE&apos;s FIS runs a few more.
        {note}
      </p>
    )
  }
  return (
    <p className="record-ilr-summary record-ilr-summary--problem">
      <strong>ILR {ilr.yearLabel}:</strong> {errors > 0 && `${errors} error${errors === 1 ? '' : 's'}`}
      {errors > 0 && warnings > 0 && ' and '}
      {warnings > 0 && `${warnings} warning${warnings === 1 ? '' : 's'}`}, shown in the sections below.
      {errors > 0 && ' Errors stop the return being accepted.'}
      {note}
    </p>
  )
}

const empty = (text) => <p className="record-empty">{text}</p>

export function SupportRecords({ ilr }) {
  return (
    <>
      <h3 className="record-subhead">LLDD categories</h3>
      {ilr.lldd.length === 0
        ? empty('None recorded.')
        : (
            <ul className="record-list">
              {ilr.lldd.map((x) => (
                <li key={x.LLDDCAT}>
                  {llddCatLabel(x.LLDDCAT)}
                  {x.PRIMARYLLDD && <span className="record-tag">Primary</span>}
                </li>
              ))}
            </ul>
          )}
      <h3 className="record-subhead">Learner funding and monitoring</h3>
      {ilr.learnerFams.length === 0
        ? empty('None recorded.')
        : (
            <dl>
              {ilr.learnerFams.map((f) => {
                const l = learnerFamLabel(f.LEARNFAMTYPE, f.LEARNFAMCODE)
                return <Row key={`${f.LEARNFAMTYPE}-${f.LEARNFAMCODE}`} label={l.type} value={l.code} />
              })}
            </dl>
          )}
    </>
  )
}

export function PriorRecords({ ilr }) {
  if (ilr.prior.length === 0) return empty('No prior attainment recorded.')
  return (
    <dl>
      {ilr.prior.map((p) => (
        <Row key={p.DATELEVELAPP} label={`Recorded ${formatDate(p.DATELEVELAPP)}`} value={priorLevelLabel(p.PRIORLEVEL)} />
      ))}
    </dl>
  )
}

export function EmploymentRecords({ ilr }) {
  if (ilr.employment.length === 0) return empty('No employment status recorded.')
  return (
    <ol className="record-history">
      {ilr.employment.map((e) => (
        <li key={e.DATEEMPSTATAPP}>
          <p className="record-history-head">From {formatDate(e.DATEEMPSTATAPP)}</p>
          <dl>
            <Row label="Employment status" value={`${empStatLabel(e.EMPSTAT)} (${e.EMPSTAT})`} />
            {e.EMPLOYERNAME && <Row label="Employer" value={e.EMPLOYERNAME} />}
            <Row label="Employer identifier (ERN)" value={e.EMPID ?? '—'} />
            <Row label="Agreement ID" value={e.AGREEMID ?? '—'} />
            {e.esm.map((m) => {
              const l = esmLabel(m.ESMTYPE, m.ESMCODE)
              return <Row key={m.ESMTYPE} label={l.type} value={l.code} />
            })}
          </dl>
        </li>
      ))}
    </ol>
  )
}

function FamRows({ fams }) {
  if (fams.length === 0) return empty('None.')
  return (
    <dl>
      {fams.map((f, i) => {
        const l = learnDelFamLabel(f.LEARNDELFAMTYPE, f.LEARNDELFAMCODE)
        const dates = f.DATEFROM ? ` · ${formatDate(f.DATEFROM)} to ${f.DATETO ? formatDate(f.DATETO) : 'now'}` : ''
        return (
          <Row
            key={`${f.LEARNDELFAMTYPE}-${f.LEARNDELFAMCODE}-${f.DATEFROM ?? i}`}
            label={l.type}
            value={
              <>
                {l.code}
                {dates}
                {f.DERIVED && <span className="record-tag">Worked out by Warren</span>}
              </>
            }
          />
        )
      })}
    </dl>
  )
}

export function programmeAim(ilr) {
  return ilr.aims.find((a) => a.AIMTYPE === 1 && a.AIMSEQNUMBER === 1) ?? ilr.aims.find((a) => a.AIMTYPE === 1)
}

// The programme aim's ILR fields that the Apprenticeship aim rows above
// don't already show.
export function ProgrammeRecords({ ilr }) {
  const a = programmeAim(ilr)
  if (!a) return empty('No programme aim.')
  return (
    <>
      <dl>
        <Row label="Learning aim reference" value={a.LEARNAIMREF} />
        <Row label="Funding model" value={fundModelLabel(a.FUNDMODEL)} />
        <Row label="Programme type" value={progTypeLabel(a.PROGTYPE)} />
        <Row label="Original start date" value={a.ORIGLEARNSTARTDATE ? formatDate(a.ORIGLEARNSTARTDATE) : '—'} />
        <Row label="Delivery location postcode" value={a.DELLOCPOSTCODE ?? '—'} />
        <Row label="End-point assessment organisation" value={a.EPAORGID ?? '—'} />
        <Row label="Funding adjustment for prior learning" value={a.PRIORLEARNFUNDADJ ?? '—'} />
        <Row label="Other funding adjustment" value={a.OTHERFUNDADJ ?? '—'} />
        <Row label="Software supplier aim ID" value={<span className="record-id">{a.SWSUPAIMID ?? '—'}</span>} />
      </dl>
      <h3 className="record-subhead">Funding and monitoring</h3>
      <FamRows fams={a.fams} />
    </>
  )
}

export function HoursRecords({ ilr }) {
  const a = programmeAim(ilr)
  if (!a || a.hours.length === 0) return empty('No off-the-job hours recorded.')
  return (
    <dl>
      {a.hours.map((h) => (
        <Row key={h.HRSCODE} label={hrsLabel(h.HRSCODE)} value={`${h.HRSAMOUNT} hours`} />
      ))}
    </dl>
  )
}

const pounds = (n) => `£${Number(n).toLocaleString('en-GB')}`

export function PriceRecords({ ilr }) {
  const a = programmeAim(ilr)
  if (!a || a.fin.length === 0) return empty('No prices or payments recorded.')
  return (
    <dl>
      {a.fin.map((f) => {
        const l = afinLabel(f.AFINTYPE, f.AFINCODE)
        return (
          <Row
            key={`${f.AFINTYPE}-${f.AFINCODE}-${f.AFINDATE}`}
            label={`${l.code}, from ${formatDate(f.AFINDATE)}`}
            value={pounds(f.AFINAMOUNT)}
          />
        )
      })}
    </dl>
  )
}

export function ComponentRecords({ ilr }) {
  const components = ilr.aims.filter((a) => a.AIMTYPE === 3)
  if (components.length === 0) return empty('No component aims.')
  return (
    <ol className="record-history">
      {components.map((a) => (
        <li key={a.AIMSEQNUMBER}>
          <p className="record-history-head">
            {a.AIMTITLE ?? a.LEARNAIMREF} <span className="record-id">{a.LEARNAIMREF}</span>
          </p>
          <dl>
            <Row label="Start and planned end" value={`${formatDate(a.LEARNSTARTDATE)} to ${formatDate(a.LEARNPLANENDDATE)}`} />
            <Row label="Status" value={describe(COMPLETION_STATUS_LABELS, a.COMPSTATUS)} />
            {a.LEARNACTENDDATE && <Row label="Actual end date" value={formatDate(a.LEARNACTENDDATE)} />}
            {a.OUTCOME !== null && <Row label="Outcome" value={describe(OUTCOME_LABELS, a.OUTCOME)} />}
            {a.fams.length > 0 && (
              <Row
                label="Funding and monitoring"
                value={a.fams.map((f) => `${f.LEARNDELFAMTYPE} ${f.LEARNDELFAMCODE}`).join(', ')}
              />
            )}
          </dl>
        </li>
      ))}
    </ol>
  )
}
