import { useEffect, useState } from 'react'
import { usePageTitle } from '../shell/navigation'
import { Notice, StatusBadge } from '../ui/components'
import './employers.css'

// The organisation's employers (GET /api/employers). The list never asks
// Companies House: the status shown is from when this organisation last
// checked each company, which happens on the employer's own page.

// A Companies House status in words, e.g. "In liquidation".
const STATUS_WORDS = {
  active: 'Active',
  dissolved: 'Dissolved',
  liquidation: 'In liquidation',
  receivership: 'In receivership',
  administration: 'In administration',
  'voluntary-arrangement': 'Voluntary arrangement',
  'converted-closed': 'Converted or closed',
  'insolvency-proceedings': 'Insolvency proceedings',
  registered: 'Registered',
  removed: 'Removed',
  closed: 'Closed',
  open: 'Open',
}
export const statusWords = (status) => STATUS_WORDS[status] ?? (status ? status.replace(/-/g, ' ') : null)
export const statusTone = (status) => (status === 'active' || status === 'registered' || status === 'open' ? 'done' : status ? 'overdue' : 'neutral')

export function CompanyStatus({ status }) {
  if (!status) return null
  return <StatusBadge tone={statusTone(status)}>{statusWords(status)}</StatusBadge>
}

function Employers({ isManager }) {
  usePageTitle('Employers')
  const [employers, setEmployers] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    fetch('/api/employers')
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Server responded with ${res.status}`)
        if (live) setEmployers(data.employers)
      })
      .catch((err) => live && setError(err.message))
    return () => {
      live = false
    }
  }, [])

  return (
    <section id="employers">
      <h2>Employers</h2>
      <p className="section-intro">The employers your apprentices work for, with their details from Companies House.</p>
      {isManager && (
        <p>
          <a className="ui-button ui-button--primary" href="/app/employers/new">
            Add an employer
          </a>
        </p>
      )}
      {error && <Notice tone="error">Couldn&apos;t load the employers: {error}</Notice>}
      {!employers && !error && <p>Loading employers…</p>}
      {employers?.length === 0 && <p>No employers yet.</p>}
      {employers?.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Company number</th>
                <th>Companies House status</th>
                <th>Employer reference</th>
              </tr>
            </thead>
            <tbody>
              {employers.map((e) => (
                <tr key={e.EMPLOYERID}>
                  <td>
                    <a className="link-button" href={`/app/employers/${encodeURIComponent(e.EMPLOYERID)}`}>
                      {e.NAME}
                    </a>
                    {!e.ISACTIVE && (
                      <>
                        {' '}
                        <StatusBadge tone="neutral">No longer used</StatusBadge>
                      </>
                    )}
                  </td>
                  <td>{e.COMPANYNUMBER ?? (e.NOTONCOMPANIESHOUSE ? 'Not on Companies House' : 'Not linked yet')}</td>
                  <td>{e.COMPANYSTATUS ? <CompanyStatus status={e.COMPANYSTATUS} /> : '—'}</td>
                  <td>{e.EMPLOYERREF ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default Employers
