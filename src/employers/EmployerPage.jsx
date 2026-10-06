import { useCallback, useEffect, useState } from 'react'
import { formatDate } from '../lookups'
import { usePageTitle } from '../shell/navigation'
import { Button, Card, Notice, StatusBadge } from '../ui/components'
import { CompanyStatus, Flags } from './Employers'
import '../vacancies/vacancies.css'
import { employerFlags } from './flags'

// One employer (GET /api/employers/:id). When a manager opens it, the server
// refreshes it from Companies House first if this organisation last checked
// it over a day ago, and a manager can refresh it now. The registered office
// is shown to managers only (the server leaves it out for everyone else).

const when = (value) => (value ? `${formatDate(value)} at ${new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '—')
const yesNo = (value) => (value === true ? 'Yes' : value === false ? 'No' : '—')

export function registeredOffice(d) {
  if (!d) return null
  const parts = [d.ADDRESSCAREOF && `c/o ${d.ADDRESSCAREOF}`, d.ADDRESSPOBOX && `PO Box ${d.ADDRESSPOBOX}`, d.ADDRESSPREMISES,
    d.ADDRESSLINE1, d.ADDRESSLINE2, d.ADDRESSLOCALITY, d.ADDRESSREGION, d.ADDRESSPOSTCODE, d.ADDRESSCOUNTRY].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

function Row({ label, children }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  )
}

function EmployerPage({ employerId, isManager }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [deciding, setDeciding] = useState(null)
  usePageTitle(data?.employer?.NAME ?? 'Employer')

  const load = useCallback(async (refresh = false) => {
    const url = `/api/employers/${encodeURIComponent(employerId)}${refresh ? '/refresh' : ''}`
    const res = await fetch(url, refresh ? { method: 'POST' } : undefined)
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || `Server responded with ${res.status}`)
    return body
  }, [employerId])

  useEffect(() => {
    let live = true
    load()
      .then((body) => live && setData(body))
      .catch((err) => live && setError(err.message))
    return () => {
      live = false
    }
  }, [load])

  async function refresh() {
    setRefreshing(true)
    setError(null)
    try {
      setData(await load(true))
    } catch (err) {
      setError(err.message)
    } finally {
      setRefreshing(false)
    }
  }

  // A manager's decision on a suggested advert (POST /api/vacancies/:ref/decisions).
  async function decide(reference, decision, siteId) {
    setDeciding(reference)
    setError(null)
    try {
      const res = await fetch(`/api/vacancies/${encodeURIComponent(reference)}/decisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employerId, decision, siteId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(Object.values(body.fields ?? {})[0] ?? body.error)
      setData(await load())
    } catch (err) {
      setError(err.message)
    } finally {
      setDeciding(null)
    }
  }

  const e = data?.employer
  const d = e?.COMPANYDETAILS
  const office = registeredOffice(d)
  const base = `/app/employers/${encodeURIComponent(employerId)}`

  return (
    <section id="employer" className="employer-page">
      <p>
        <a href="/app/employers">Back to employers</a>
      </p>
      {!data && !error && <p>Loading the employer…</p>}
      {error && <Notice tone="error">{error}</Notice>}
      {e && (
        <>
          <h2>
            {e.NAME}
            {!e.ISACTIVE && (
              <>
                {' '}
                <StatusBadge tone="neutral">No longer used</StatusBadge>
              </>
            )}
          </h2>
          <Flags flags={employerFlags(e)} />
          {data.note && <Notice tone="info">{data.note}</Notice>}
          {isManager && (
            <p>
              <a className="ui-button ui-button--secondary" href={`/app/employers/${encodeURIComponent(e.EMPLOYERID)}/edit`}>
                Change
              </a>
            </p>
          )}

          <Card title="Companies House" titleLevel={3}>
            {!e.COMPANYNUMBER && e.NOTONCOMPANIESHOUSE && <p>Not on Companies House: {e.NOTONCOMPANIESHOUSE}.</p>}
            {!e.COMPANYNUMBER && !e.NOTONCOMPANIESHOUSE && (
              <p>Not linked to Companies House yet.{isManager ? ' Use Change to find its company, or say why it isn\'t on Companies House.' : ''}</p>
            )}
            {e.COMPANYNUMBER && (
              <>
                <dl className="employer-details">
                  <Row label="Company number">
                    <a href={`https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(e.COMPANYNUMBER)}`} target="_blank" rel="noreferrer">
                      {e.COMPANYNUMBER}
                    </a>
                  </Row>
                  <Row label="Registered name">{d?.COMPANYNAME ?? '—'}</Row>
                  <Row label="Status">{d?.COMPANYSTATUS ? <CompanyStatus status={d.COMPANYSTATUS} /> : '—'}</Row>
                  <Row label="Type">{d?.COMPANYTYPE ?? '—'}</Row>
                  <Row label="Incorporated">{formatDate(d?.DATEOFCREATION)}</Row>
                  {d?.DATEOFCESSATION && <Row label="Ceased">{formatDate(d.DATEOFCESSATION)}</Row>}
                  <Row label="Nature of business (SIC)">
                    {data.sic.length === 0 && '—'}
                    {data.sic.length > 0 && (
                      <ul className="plain-list">
                        {data.sic.map((s) => (
                          <li key={s.code}>
                            {s.code}
                            {s.description ? ` ${s.description}` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Row>
                  {isManager && <Row label="Registered office">{office ?? '—'}</Row>}
                  {isManager && d?.OFFICEUNDELIVERABLE && <Row label="Post to the office">Undeliverable</Row>}
                  {isManager && d?.OFFICEINDISPUTE && <Row label="Office address">In dispute</Row>}
                  <Row label="Accounts next due">
                    {formatDate(d?.ACCOUNTSNEXTDUE)}
                    {d?.ACCOUNTSOVERDUE && (
                      <>
                        {' '}
                        <StatusBadge tone="overdue">Overdue</StatusBadge>
                      </>
                    )}
                  </Row>
                  <Row label="Confirmation statement next due">
                    {formatDate(d?.CONFIRMATIONNEXTDUE)}
                    {d?.CONFIRMATIONOVERDUE && (
                      <>
                        {' '}
                        <StatusBadge tone="overdue">Overdue</StatusBadge>
                      </>
                    )}
                  </Row>
                  <Row label="Insolvency history">{yesNo(d?.HASINSOLVENCYHISTORY)}</Row>
                  <Row label="Checked with Companies House">{when(e.COMPANYCHECKEDAT)}</Row>
                </dl>
                {isManager && (
                  <Button variant="secondary" onClick={refresh} disabled={refreshing}>
                    {refreshing ? 'Checking Companies House…' : 'Check Companies House now'}
                  </Button>
                )}
              </>
            )}
          </Card>

          <Card title="In Warren" titleLevel={3}>
            <dl className="employer-details">
              <Row label="Employer reference (ERN)">{e.EMPLOYERREF ?? '—'}</Row>
              <Row label="Still used">{e.ISACTIVE ? 'Yes' : 'No'}</Row>
              <Row label="Added">{formatDate(e.CREATEDAT)}</Row>
              {e.UPDATEDAT && <Row label="Last changed">{formatDate(e.UPDATEDAT)}</Row>}
            </dl>
          </Card>

          <Card title="Sites" titleLevel={3}>
            <p className="field-hint">Where apprentices work, for example a branch.</p>
            {data.sites.length === 0 && <p>No sites yet.</p>}
            {data.sites.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Site</th>
                      <th>Postcode</th>
                      <th>Contact</th>
                      <th>Apprentices</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sites.map((s) => (
                      <tr key={s.SITEID}>
                        <td>
                          <a className="link-button" href={`${base}/sites/${encodeURIComponent(s.SITEID)}`}>
                            {s.NAME}
                          </a>
                          {!s.ISACTIVE && (
                            <>
                              {' '}
                              <StatusBadge tone="neutral">No longer used</StatusBadge>
                            </>
                          )}
                        </td>
                        <td>{s.POSTCODE}</td>
                        <td>{s.CONTACTNAME ?? '—'}</td>
                        <td>{s.APPRENTICES}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {isManager && (
              <a className="ui-button ui-button--secondary" href={`${base}/sites/new`}>
                Add a site
              </a>
            )}
          </Card>

          <Card title="Contacts" titleLevel={3}>
            <p className="field-hint">People at this employer: site contacts, line managers and Burrow users.</p>
            {data.contacts.length === 0 && <p>No contacts yet.</p>}
            {data.contacts.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Job title</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Site</th>
                      {isManager && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {data.contacts.map((c) => (
                      <tr key={c.CONTACTID}>
                        <td>
                          {c.NAME}
                          {c.HASSIGNIN && (
                            <>
                              {' '}
                              <StatusBadge tone="done">Uses Burrow</StatusBadge>
                            </>
                          )}
                          {!c.ISCURRENT && (
                            <>
                              {' '}
                              <StatusBadge tone="neutral">No longer current</StatusBadge>
                            </>
                          )}
                        </td>
                        <td>{c.JOBTITLE ?? '—'}</td>
                        <td>{c.EMAIL ?? '—'}</td>
                        <td>{c.PHONE ?? '—'}</td>
                        <td>{c.SITENAME ?? '—'}</td>
                        {isManager && (
                          <td>
                            <a className="link-button" href={`${base}/contacts/${encodeURIComponent(c.CONTACTID)}/edit`} aria-label={`Change ${c.NAME}`}>
                              Change
                            </a>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {isManager && (
              <a className="ui-button ui-button--secondary" href={`${base}/contacts/new`}>
                Add a contact
              </a>
            )}
          </Card>

          <Card title="Vacancies" titleLevel={3}>
            {data.vacancies.length === 0 && <p>No open adverts linked to this employer.</p>}
            {data.vacancies.length > 0 && (
              <ul className="plain-list">
                {data.vacancies.map((v) => (
                  <li key={v.VACANCYREFERENCE}>
                    <a href={`/app/vacancies/${encodeURIComponent(v.VACANCYREFERENCE)}`}>{v.TITLE}</a>
                    {v.SITENAME && `, ${v.SITENAME}`} (closes {formatDate(v.CLOSINGDATE)})
                  </li>
                ))}
              </ul>
            )}
            {isManager && data.vacancySuggestions?.length > 0 && (
              <>
                <h4>Suggested adverts</h4>
                <p className="field-hint">Open adverts whose employer name matches this employer. Confirm only if they&apos;re theirs.</p>
                <ul className="vacancy-suggestions">
                  {data.vacancySuggestions.map((v) => (
                    <li key={v.VACANCYREFERENCE}>
                      <span>
                        <a href={`/app/vacancies/${encodeURIComponent(v.VACANCYREFERENCE)}`}>{v.TITLE}</a> ({v.EMPLOYERNAME}
                        {v.POSTCODE ? `, ${v.POSTCODE}` : ''}
                        {v.SITENAME ? `: postcode matches ${v.SITENAME}` : ''}, closes {formatDate(v.CLOSINGDATE)})
                      </span>
                      <span className="vacancy-decide">
                        <button type="button" className="secondary" disabled={deciding !== null} onClick={() => decide(v.VACANCYREFERENCE, 'confirmed', v.SITEID ?? '')}>
                          Confirm{v.SITENAME ? ` at ${v.SITENAME}` : ''}
                        </button>
                        <button type="button" className="secondary" disabled={deciding !== null} onClick={() => decide(v.VACANCYREFERENCE, 'rejected', '')}>
                          Not theirs
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </>
      )}
    </section>
  )
}

export default EmployerPage
