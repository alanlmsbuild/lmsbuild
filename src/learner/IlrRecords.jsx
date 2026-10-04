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
import { learnerEditPath, learnerRecordPath } from './links'

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
// change: for a manager, the link to change the section.
export function Section({ title, rules = [], children, wide = false, change }) {
  return (
    <section className={`learner-section${wide ? ' learner-section--wide' : ''}`} aria-label={title}>
      <div className="learner-section-head">
        <h2>{title}</h2>
        {change && (
          <a className="record-change" href={change} aria-label={`Change ${title.toLowerCase()}`}>
            Change
          </a>
        )}
      </div>
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

// For a manager: links to correct or remove a record, and to add one.
// manage: { learnRefNumber, back }, or null for anyone else.
export const changePath = (manage, section) => manage && learnerEditPath(manage.learnRefNumber, section, manage.back)

function RecordActions({ manage, kind, recordKey, label, canRemove = true }) {
  if (!manage) return null
  return (
    <span className="record-actions">
      <a href={learnerRecordPath(manage.learnRefNumber, kind, recordKey, 'correct', manage.back)} aria-label={`Correct ${label}`}>
        Correct
      </a>
      {canRemove && (
        <a href={learnerRecordPath(manage.learnRefNumber, kind, recordKey, 'remove', manage.back)} aria-label={`Remove ${label}`}>
          Remove
        </a>
      )}
    </span>
  )
}

function AddLink({ manage, kind, children }) {
  if (!manage) return null
  return (
    <a className="record-add" href={learnerRecordPath(manage.learnRefNumber, kind, null, 'new', manage.back)}>
      + {children}
    </a>
  )
}

export function SupportRecords({ ilr, manage, llddHealthProb }) {
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
                  <RecordActions manage={manage} kind="lldd" recordKey={String(x.LLDDCAT)} label={llddCatLabel(x.LLDDCAT)} />
                </li>
              ))}
            </ul>
          )}
      {llddHealthProb === 1 && <AddLink manage={manage} kind="lldd">Add a category</AddLink>}
      <h3 className="record-subhead">Learner funding and monitoring</h3>
      {ilr.learnerFams.length === 0
        ? empty('None recorded.')
        : (
            <dl>
              {ilr.learnerFams.map((f) => {
                const l = learnerFamLabel(f.LEARNFAMTYPE, f.LEARNFAMCODE)
                const key = `${f.LEARNFAMTYPE}-${Number(f.LEARNFAMCODE)}`
                return (
                  <Row
                    key={key}
                    label={l.type}
                    value={
                      <>
                        {l.code}
                        <RecordActions manage={manage} kind="learner-fam" recordKey={key} label={l.type} />
                      </>
                    }
                  />
                )
              })}
            </dl>
          )}
      <AddLink manage={manage} kind="learner-fam">Add funding and monitoring</AddLink>
    </>
  )
}

export function PriorRecords({ ilr, manage }) {
  return (
    <>
      {ilr.prior.length === 0
        ? empty('No prior attainment recorded.')
        : (
            <dl>
              {ilr.prior.map((p) => (
                <Row
                  key={p.DATELEVELAPP}
                  label={`Recorded ${formatDate(p.DATELEVELAPP)}`}
                  value={
                    <>
                      {priorLevelLabel(p.PRIORLEVEL)}
                      <RecordActions
                        manage={manage}
                        kind="prior"
                        recordKey={p.DATELEVELAPP}
                        label={`prior attainment recorded ${formatDate(p.DATELEVELAPP)}`}
                      />
                    </>
                  }
                />
              ))}
            </dl>
          )}
      <AddLink manage={manage} kind="prior">Add prior attainment</AddLink>
    </>
  )
}

export function EmploymentRecords({ ilr, manage }) {
  return (
    <>
      {ilr.employment.length === 0 ? empty('No employment status recorded.') : <EmploymentList ilr={ilr} manage={manage} />}
      <AddLink manage={manage} kind="employment">Add an employment status</AddLink>
    </>
  )
}

function EmploymentList({ ilr, manage }) {
  return (
    <ol className="record-history">
      {ilr.employment.map((e) => (
        <li key={e.DATEEMPSTATAPP}>
          <p className="record-history-head">
            From {formatDate(e.DATEEMPSTATAPP)}
            <RecordActions
              manage={manage}
              kind="employment"
              recordKey={e.DATEEMPSTATAPP}
              label={`employment status from ${formatDate(e.DATEEMPSTATAPP)}`}
            />
          </p>
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

function FamRows({ fams, manage }) {
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
                {!f.DERIVED && f.FAMID && <RecordActions manage={manage} kind="aim-fam" recordKey={f.FAMID} label={l.type} />}
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
export function ProgrammeRecords({ ilr, manage }) {
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
      <FamRows fams={a.fams} manage={manage} />
      <AddLink manage={manage} kind="aim-fam">Add a funding and monitoring code</AddLink>
    </>
  )
}

// What the minimum off-the-job hours are for this programme, and where the
// figure comes from (GET /api/learners/:ref/ilr's otj, server/ilr/standards.js).
export function otjMinimumText(otj) {
  if (!otj) return 'No programme aim.'
  const prior = otj.priorLearning ? `, less ${otj.priorLearning} hours of prior learning` : ''
  switch (otj.policy) {
    case 'published':
      return `Minimum: ${otj.minimum} hours. ${otj.stReference} version ${otj.version} publishes ${otj.published} hours (Skills England, "minimum hours for compliance")${prior}${otj.minimum === 187 && otj.published - otj.priorLearning < 187 ? ', but never below 187' : ''}.`
    case 'floor':
      return `Minimum: 187 hours. ${otj.stReference ? `${otj.stReference} version ${otj.version} has` : 'This standard has'} no published minimum for this start date, so only the 187-hour floor applies (funding rules 2026 to 2027, paragraph 86.2).`
    case 'old':
      return 'Started before 1 August 2025, so the earlier rule applies: 20% of normal working hours (capped at 30 a week) over the planned duration. The ILR checks at least 278 hours.'
    default:
      return "The standards' published minimums aren't loaded yet (npm run import:standards), so only the 187-hour floor is checked."
  }
}

export function HoursRecords({ ilr }) {
  const a = programmeAim(ilr)
  return (
    <>
      <p className="record-note">{otjMinimumText(ilr.otj)}</p>
      {!a || a.hours.length === 0
        ? empty('No off-the-job hours recorded.')
        : (
            <dl>
              {[...a.hours].sort((x, y) => [1, 4, 3].indexOf(Number(x.HRSCODE)) - [1, 4, 3].indexOf(Number(y.HRSCODE))).map((h) => (
                <Row key={h.HRSCODE} label={hrsLabel(h.HRSCODE)} value={`${h.HRSAMOUNT} hours`} />
              ))}
            </dl>
          )}
    </>
  )
}

const pounds = (n) => `£${Number(n).toLocaleString('en-GB')}`

export function PriceRecords({ ilr, manage }) {
  const a = programmeAim(ilr)
  return (
    <>
      {!a || a.fin.length === 0
        ? empty('No prices or payments recorded.')
        : (
            <dl>
              {a.fin.map((f) => {
                const l = afinLabel(f.AFINTYPE, f.AFINCODE)
                const key = `${f.AFINTYPE}-${Number(f.AFINCODE)}-${f.AFINDATE}`
                const what = `${l.code}, ${f.AFINTYPE === 'PMR' ? 'paid' : 'from'} ${formatDate(f.AFINDATE)}`
                return (
                  <Row
                    key={key}
                    label={what}
                    value={
                      <>
                        {pounds(f.AFINAMOUNT)}
                        <RecordActions manage={manage} kind="price" recordKey={key} label={what} />
                      </>
                    }
                  />
                )
              })}
            </dl>
          )}
      <AddLink manage={manage} kind="price">Add a price or payment</AddLink>
    </>
  )
}

export function ComponentRecords({ ilr, manage }) {
  const components = ilr.aims.filter((a) => a.AIMTYPE === 3)
  return (
    <>
      {components.length === 0 ? empty('No component aims.') : <ComponentList components={components} manage={manage} />}
      <AddLink manage={manage} kind="component">Add a component aim</AddLink>
    </>
  )
}

function ComponentList({ components, manage }) {
  return (
    <ol className="record-history">
      {components.map((a) => (
        <li key={a.AIMSEQNUMBER}>
          <p className="record-history-head">
            {a.AIMTITLE ?? a.LEARNAIMREF} <span className="record-id">{a.LEARNAIMREF}</span>
            <RecordActions
              manage={manage}
              kind="component"
              recordKey={String(a.AIMSEQNUMBER)}
              label={a.AIMTITLE ?? a.LEARNAIMREF}
              canRemove={false}
            />
          </p>
          <dl>
            <Row label="Start and planned end" value={`${formatDate(a.LEARNSTARTDATE)} to ${formatDate(a.LEARNPLANENDDATE)}`} />
            <Row label="Status" value={describe(COMPLETION_STATUS_LABELS, a.COMPSTATUS)} />
            {a.LEARNACTENDDATE && <Row label="Actual end date" value={formatDate(a.LEARNACTENDDATE)} />}
            {a.OUTCOME !== null && <Row label="Outcome" value={describe(OUTCOME_LABELS, a.OUTCOME)} />}
            {a.PRIORLEARNFUNDADJ !== null && <Row label="Funding adjustment for prior learning" value={`${a.PRIORLEARNFUNDADJ}%`} />}
            {a.OTHERFUNDADJ !== null && <Row label="Other funding adjustment" value={a.OTHERFUNDADJ} />}
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
