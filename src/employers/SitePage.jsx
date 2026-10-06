import { useEffect, useState } from 'react'
import { formatDate } from '../lookups'
import { usePageTitle } from '../shell/navigation'
import { Card, Notice, StatusBadge } from '../ui/components'

// One of an employer's sites (GET /api/employers/:id/sites/:siteId): its
// address and contact, and the current apprentices there that this user can
// see, with their line managers.

function SitePage({ employerId, siteId, isManager }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  usePageTitle(data?.site?.NAME ?? 'Site')

  useEffect(() => {
    let live = true
    fetch(`/api/employers/${encodeURIComponent(employerId)}/sites/${encodeURIComponent(siteId)}`)
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error || `Server responded with ${res.status}`)
        if (live) setData(body)
      })
      .catch((err) => live && setError(err.message))
    return () => {
      live = false
    }
  }, [employerId, siteId])

  const base = `/app/employers/${encodeURIComponent(employerId)}`
  const here = `${base}/sites/${encodeURIComponent(siteId)}`
  const s = data?.site
  return (
    <section id="site-page" className="employer-page">
      <p>
        <a href={base}>Back to the employer</a>
      </p>
      {!data && !error && <p>Loading the site…</p>}
      {error && <Notice tone="error">{error}</Notice>}
      {s && (
        <>
          <h2>
            {s.NAME}
            {!s.ISACTIVE && (
              <>
                {' '}
                <StatusBadge tone="neutral">No longer used</StatusBadge>
              </>
            )}
          </h2>
          {isManager && (
            <p>
              <a className="ui-button ui-button--secondary" href={`${here}/edit`}>
                Change
              </a>
            </p>
          )}
          <Card title="The site" titleLevel={3}>
            <dl className="employer-details">
              <dt>Address</dt>
              <dd>{[s.ADDRESSLINE1, s.ADDRESSLINE2, s.TOWN].filter(Boolean).join(', ') || '—'}</dd>
              <dt>Postcode</dt>
              <dd>{s.POSTCODE}</dd>
              <dt>Site contact</dt>
              <dd>{s.CONTACTNAME ? [s.CONTACTNAME, s.CONTACTEMAIL, s.CONTACTPHONE].filter(Boolean).join(', ') : '—'}</dd>
            </dl>
          </Card>
          <Card title="Apprentices here" titleLevel={3}>
            {data.apprentices.length === 0 && <p>No current apprentices at this site.</p>}
            {data.apprentices.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Apprentice</th>
                      <th>Here since</th>
                      <th>Line manager</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.apprentices.map((a) => (
                      <tr key={a.LEARNREFNUMBER}>
                        <td>
                          <a className="link-button" href={`/app/learners/${encodeURIComponent(a.LEARNREFNUMBER)}?back=${encodeURIComponent(here)}`}>
                            {[a.GIVENNAMES, a.FAMILYNAME].filter(Boolean).join(' ')}
                          </a>
                        </td>
                        <td>{formatDate(a.FROMDATE)}</td>
                        <td>{a.LINEMANAGER ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </section>
  )
}

export default SitePage
