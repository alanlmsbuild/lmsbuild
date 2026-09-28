import { useId, useState } from 'react'

// Burrow's learner list for staff (/burrow/learners): the learners they
// can see (a manager's or IQA's whole organisation, a tutor's or
// assessor's caseload), with a search. Each opens the learner page, on the
// tab the person used last.
function StaffLearnerList({ learners, status, linkFor }) {
  const [search, setSearch] = useState('')
  const searchId = useId()
  const query = search.trim().toLowerCase()
  const shown = learners.filter(
    (l) =>
      !query ||
      `${l.GIVENNAMES ?? ''} ${l.FAMILYNAME ?? ''} ${l.LEARNREFNUMBER} ${l.STDREFERENCE ?? ''} ${l.STDNAME ?? ''}`
        .toLowerCase()
        .includes(query),
  )

  return (
    <div className="burrow-learner-list">
      <div className="burrow-greeting">
        <h1>Learners</h1>
        <p>Open a learner to see their portfolio and their record.</p>
      </div>

      {status === 'loading' && <p className="burrow-muted">Loading learners…</p>}
      {status === 'error' && <p role="alert">Couldn&apos;t load the list of learners.</p>}
      {status === 'ready' && learners.length === 0 && (
        <p className="burrow-muted">There are no learners for you to see.</p>
      )}
      {status === 'ready' && learners.length > 0 && (
        <>
          <div className="burrow-list-search">
            <label htmlFor={searchId}>Find a learner</label>
            <input
              id={searchId}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, reference or standard"
              autoComplete="off"
            />
          </div>
          <p className="burrow-muted" aria-live="polite">
            {shown.length === learners.length ? `${learners.length} learners` : `${shown.length} of ${learners.length} learners`}
          </p>
          <ul className="burrow-learner-rows">
            {shown.map((l) => (
              <li key={l.LEARNREFNUMBER}>
                <a href={linkFor(l.LEARNREFNUMBER)} className="burrow-learner-row">
                  <strong>{[l.GIVENNAMES, l.FAMILYNAME].filter(Boolean).join(' ') || l.LEARNREFNUMBER}</strong>
                  <span>
                    {l.LEARNREFNUMBER}
                    {l.STDREFERENCE ? ` · ${l.STDREFERENCE} ${l.STDNAME ?? ''}` : ''}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export default StaffLearnerList
