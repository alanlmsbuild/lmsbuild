import { useEffect, useState } from 'react'
import { formatDate } from '../lookups'
import { Row } from './IlrRecords'

// The Record tab's Workplace section: the apprentice's current employer
// link(s), with the site they work at and their line manager
// (GET /api/learners/:ref/workplace). Managers can change them.

function Workplace({ learnRefNumber, canManage, back }) {
  const [links, setLinks] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    fetch(`/api/learners/${encodeURIComponent(learnRefNumber)}/workplace`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Server responded with ${res.status}`)
        if (live) setLinks(data.links)
      })
      .catch((err) => live && setError(err.message))
    return () => {
      live = false
    }
  }, [learnRefNumber])

  return (
    <section className="learner-section" aria-label="Workplace">
      <h2>Workplace</h2>
      {!links && !error && <p className="empty-note">Loading the workplace…</p>}
      {error && <p role="alert">Couldn&apos;t load the workplace.</p>}
      {links?.length === 0 && <p className="empty-note">Not linked to an employer.</p>}
      {links?.map((l) => (
        <dl key={`${l.EMPLOYERID}-${l.FROMDATE}`}>
          <Row label="Employer" value={<a href={`/app/employers/${encodeURIComponent(l.EMPLOYERID)}`}>{l.EMPLOYERNAME}</a>} />
          <Row
            label="Site"
            value={
              l.SITEID ? (
                <a href={`/app/employers/${encodeURIComponent(l.EMPLOYERID)}/sites/${encodeURIComponent(l.SITEID)}`}>
                  {l.SITENAME} ({l.SITEPOSTCODE})
                </a>
              ) : (
                'Not set'
              )
            }
          />
          <Row
            label="Line manager"
            value={l.LINEMANAGERNAME ? [l.LINEMANAGERNAME, l.LINEMANAGERJOBTITLE, l.LINEMANAGEREMAIL, l.LINEMANAGERPHONE].filter(Boolean).join(', ') : 'Not set'}
          />
          <Row label="Here since" value={formatDate(l.FROMDATE)} />
        </dl>
      ))}
      {canManage && links?.length > 0 && (
        <p>
          <a href={`/app/learners/${encodeURIComponent(learnRefNumber)}/workplace${back ? `?back=${encodeURIComponent(back)}` : ''}`}>Change workplace</a>
        </p>
      )}
    </section>
  )
}

export default Workplace
