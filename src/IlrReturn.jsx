import { useState } from 'react'
import { Notice, StatusBadge } from './ui/components'

const YEARS = [{ value: 2026, label: '2026 to 2027' }]
const FIS_GUIDE = 'https://www.gov.uk/government/publications/check-how-accurate-your-ilr-data-is-with-fis'

function sizeLabel(bytes) {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// The learners who fail a rule: the first few as links, the rest behind a
// "show all".
function RuleLearners({ refs, onOpenLearner }) {
  const link = (ref) => (
    <button key={ref} type="button" className="link-button" onClick={() => onOpenLearner(ref)}>
      {ref}
    </button>
  )
  if (refs.length <= 6) return <span className="ilr-refs">{refs.map(link)}</span>
  return (
    <details>
      <summary>
        {refs.length} learners: {refs.slice(0, 3).join(', ')}…
      </summary>
      <span className="ilr-refs">{refs.map(link)}</span>
    </details>
  )
}

// Reports -> ILR return (managers only). Checks the organisation's ILR file
// for a year against the official schema and the rules Warren can check,
// then offers the file for download. Warren never submits it anywhere.
function IlrReturn({ onOpenLearner }) {
  const [year, setYear] = useState(YEARS[0].value)
  const [serial, setSerial] = useState('1')
  const [result, setResult] = useState(null)
  const [status, setStatus] = useState('idle') // 'idle' | 'checking' | 'ready' | 'error'
  const [error, setError] = useState(null)

  const serialNumber = Number(serial)
  const serialValid = Number.isInteger(serialNumber) && serialNumber >= 1 && serialNumber <= 99
  const query = `year=${year}&serial=${serialNumber}`

  async function check(event) {
    event.preventDefault()
    if (!serialValid) return
    setStatus('checking')
    setError(null)
    try {
      const res = await fetch(`/api/ilr/return?${query}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `Server responded with ${res.status}`)
      setResult(json)
      setStatus('ready')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }

  const errors = result?.rules?.filter((r) => r.severity === 'Error') ?? []
  const warnings = result?.rules?.filter((r) => r.severity === 'Warning') ?? []
  const excludedCount = result?.excluded
    ? result.excluded.testLearnersInRealOrganisation + result.excluded.realLearnersInTestOrganisation
    : 0

  return (
    <div className="report ilr-return">
      <p className="report-meta ilr-intro">
        Makes your organisation&apos;s ILR file, checks it against DfE&apos;s official schema and the validation rules
        Warren can check, and lets you download it. Warren never sends the file anywhere: check it in DfE&apos;s FIS tool
        and submit it yourself through Submit Learner Data.
      </p>

      <form className="learner-filters" onSubmit={check}>
        <label className="report-year">
          Year{' '}
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEARS.map((y) => (
              <option key={y.value} value={y.value}>
                {y.label}
              </option>
            ))}
          </select>
        </label>
        <label className="report-year">
          File serial number{' '}
          <input
            className="ilr-serial"
            type="number"
            min="1"
            max="99"
            value={serial}
            onChange={(e) => setSerial(e.target.value)}
            aria-describedby="ilr-serial-hint"
          />
        </label>
        <button type="submit" className="ui-button ui-button--primary" disabled={status === 'checking' || !serialValid}>
          {status === 'checking' ? 'Checking…' : 'Check the return'}
        </button>
      </form>
      <p id="ilr-serial-hint" className="report-meta">
        {serialValid ? 'The last part of the file name (01 to 99).' : 'Enter a serial number from 1 to 99.'}
      </p>

      {status === 'error' && <Notice tone="error">Couldn&apos;t check the ILR return: {error}</Notice>}

      {status === 'ready' && result && (
        <>
          {result.organisation?.isTest && (
            <p className="indicative-banner" role="note">
              Test data. This file uses the dummy UKPRN {result.organisation.ukprn} and says TESTDATA in its header. Check
              it in FIS if you like, but never submit it.
            </p>
          )}

          {result.problem ? (
            <Notice tone="error">{result.problem}</Notice>
          ) : (
            <>
              <div className="stat-grid report-stats">
                <div className="stat-card">
                  <span className="stat-value">{result.learners}</span>
                  <span className="stat-label">Learners in the file</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{result.aims}</span>
                  <span className="stat-label">Learning aims</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{errors.length}</span>
                  <span className="stat-label">Rules failed</span>
                </div>
                <div className="stat-card">
                  <span className="stat-value">{warnings.length}</span>
                  <span className="stat-label">Warnings</span>
                </div>
              </div>
              <p className="report-meta">
                {result.organisation.name}, UKPRN {result.organisation.ukprn}, {result.yearLabel}. Learners with an aim
                open on 1 August or ending or achieved during the year.
                {excludedCount > 0 &&
                  ` ${excludedCount} learner${excludedCount === 1 ? ' was' : 's were'} left out because their test-data flag doesn't match the organisation's.`}
              </p>

              <h3>Official schema</h3>
              {result.schema.valid ? (
                <p>
                  <StatusBadge tone="done">Passes</StatusBadge> The file passes DfE&apos;s schema ({result.schema.file}).
                </p>
              ) : (
                <>
                  <p>
                    <StatusBadge tone="overdue">Fails</StatusBadge> The file doesn&apos;t pass DfE&apos;s schema (
                    {result.schema.file}), so it can&apos;t be downloaded. {result.schema.errorCount} problem
                    {result.schema.errorCount === 1 ? '' : 's'}
                    {result.schema.errorCount > result.schema.errors.length ? `, the first ${result.schema.errors.length} shown` : ''}:
                  </p>
                  <ul className="report-notes">
                    {result.schema.errors.map((e, i) => (
                      <li key={i}>
                        {e.line ? `Line ${e.line}: ` : ''}
                        {e.message}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <h3>Validation rules</h3>
              {result.rules.length === 0 ? (
                <p>
                  <StatusBadge tone="done">No problems</StatusBadge> The file passes all {result.rulesChecked} rules Warren
                  checks.
                </p>
              ) : (
                <>
                  <p className="report-meta">
                    Warren checks {result.rulesChecked} of DfE&apos;s rules for 2026 to 2027. Rule failures don&apos;t stop the
                    download, but DfE will reject records with errors.
                  </p>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Rule</th>
                          <th>Severity</th>
                          <th>What it checks</th>
                          <th>Learners</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.rules.map((r) => (
                          <tr key={r.rule}>
                            <td>{r.rule}</td>
                            <td>
                              <StatusBadge tone={r.severity === 'Error' ? 'overdue' : 'due'}>{r.severity}</StatusBadge>
                            </td>
                            <td className="wrap">{r.description}</td>
                            <td className="wrap">
                              <RuleLearners refs={r.learners} onOpenLearner={onOpenLearner} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              <details className="report-details">
                <summary>Rules only DfE can check</summary>
                <p className="report-meta">
                  These need DfE&apos;s reference data. FIS checks most of them.
                </p>
                <ul className="report-notes">
                  {result.notChecked.map(([rules, what]) => (
                    <li key={rules}>
                      {rules}: {what}
                    </li>
                  ))}
                </ul>
              </details>

              <h3>Download</h3>
              {result.schema.valid ? (
                <>
                  <a className="ui-button ui-button--primary" href={`/api/ilr/return/file?${query}`} download>
                    Download the ILR file ({sizeLabel(result.fileSize)})
                  </a>
                  <p className="report-meta">
                    Named as DfE requires, for example {result.fileName}. The file is made and checked against the schema
                    again when you download it, so the date and time in its name are the time of the download.
                  </p>
                </>
              ) : (
                <p className="report-meta">Fix the schema problems above, then check again.</p>
              )}

              <details className="report-details">
                <summary>Checking the file in DfE&apos;s FIS tool</summary>
                <ol className="report-notes">
                  <li>
                    On a Windows PC with .NET Framework 4.6.1 or later, download the latest 2026 to 2027 version of FIS from
                    the{' '}
                    <a href="https://submit-learner-data.service.gov.uk/publicdownloads/Desktop" target="_blank" rel="noreferrer">
                      FIS download page
                    </a>
                    .
                  </li>
                  <li>Right-click the downloaded zip, choose Extract All, and open the new folder.</li>
                  <li>Double-click ESFA.DC.ILR.Desktop (the file with the FIS icon) to open FIS.</li>
                  <li>
                    If the blue banner says new reference data is available, choose Update here, then Update reference
                    data.
                  </li>
                  <li>In Settings, choose the Output Directory for FIS&apos;s reports.</li>
                  <li>Choose file, pick the downloaded .XML file, then Process File.</li>
                  <li>
                    When it finishes, open the output folder from the link and read the rule violation report. FIS
                    checks the rules Warren can&apos;t, with DfE&apos;s reference data.
                  </li>
                </ol>
                <p className="report-meta">
                  From DfE&apos;s{' '}
                  <a href={FIS_GUIDE} target="_blank" rel="noreferrer">
                    FIS user guide 2026 to 2027
                  </a>
                  . FIS checks the file on your own computer. Submitting is a separate step in Submit Learner Data.
                </p>
              </details>
            </>
          )}
        </>
      )}
    </div>
  )
}

export default IlrReturn
