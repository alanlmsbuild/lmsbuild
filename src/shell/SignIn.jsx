import { useEffect, useId, useState } from 'react'
import RarebitMark from '../logos/RarebitMark'
import { afterSignIn, usePageTitle, useShell } from './navigation'
import './SignIn.css'

// The sign-in page at /sign-in ("Who are you?"). There's no real sign-in
// yet: this lists the test users (server/devUsers.js, only while
// TEST_SIGN_IN=true) and picking one signs in as them. Then it goes on
// to where the person was going (?next=, if they can use it) or their home.
// Real sign-in replaces this page.

const ROLE_LABELS = {
  LEARNER: 'Learner',
  TUTOR: 'Tutor',
  ASSESSOR: 'Assessor',
  IQA: 'IQA',
  EMPLOYER: 'Employer',
  MANAGER: 'Manager',
}

// The groups on the page, in order. Someone with several roles goes in the
// first group that fits and shows all their roles.
const GROUPS = [
  { key: 'managers', title: 'Managers', fits: (r) => r.includes('MANAGER') },
  { key: 'officers', title: 'Tutors and assessors', fits: (r) => r.includes('TUTOR') || r.includes('ASSESSOR') },
  { key: 'iqa', title: 'Quality assurance', fits: (r) => r.includes('IQA') },
  { key: 'employers', title: 'Employers', fits: (r) => r.includes('EMPLOYER') },
  { key: 'learners', title: 'Learners', fits: (r) => r.includes('LEARNER') },
  { key: 'refused', title: 'No access (to try being refused)', fits: () => true },
]

// Long groups show this many until "Show all" or a search.
const SHORT_LIST = 6

function initials(name) {
  const parts = String(name ?? '').trim().split(/\s+/)
  return `${parts[0]?.[0] ?? ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase() || '?'
}

function groupFor(u) {
  if (!u.ISACTIVE || u.ROLES.length === 0) return 'refused'
  return GROUPS.find((g) => g.fits(u.ROLES)).key
}

function describe(u) {
  const roles = u.ROLES.map((r) => ROLE_LABELS[r] ?? r)
  const notes = [...u.REVOKEDROLES.map((r) => `${ROLE_LABELS[r] ?? r} role revoked`), ...(u.ISACTIVE ? [] : ['access ended'])]
  return [roles.join(' and ') || 'No roles', ...notes].join(' · ')
}

function SignIn() {
  const { path, me, navigate, refreshMe } = useShell()
  const [users, setUsers] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [switchedOff, setSwitchedOff] = useState(false)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState({})
  const [signingIn, setSigningIn] = useState(null)
  const [error, setError] = useState(null)
  const searchId = useId()
  usePageTitle('Sign in')

  const next = new URLSearchParams(path.split('?')[1] ?? '').get('next')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/dev/users')
        if (res.status === 404) {
          setSwitchedOff(true)
          return
        }
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Server responded with ${res.status}`)
        setUsers(data.users)
      } catch (err) {
        setLoadError(err.message)
      }
    }
    load()
  }, [])

  async function signInAs(u) {
    setSigningIn(u.USERID)
    setError(null)
    try {
      const res = await fetch('/api/dev/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.USERID }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Server responded with ${res.status}`)
      const result = await refreshMe()
      if (!result.me) throw new Error(result.error ?? 'Signing in didn’t work. Please try again.')
      navigate(afterSignIn(next, result.me), { replace: true })
    } catch (err) {
      setError(`${u.DISPLAYNAME} can’t sign in: ${err.message}`)
      setSigningIn(null)
    }
  }

  const query = search.trim().toLowerCase()
  const organisations = []
  for (const u of users ?? []) {
    if (query && !`${u.DISPLAYNAME} ${u.ORGANISATIONNAME} ${describe(u)}`.toLowerCase().includes(query)) continue
    let org = organisations.find((o) => o.id === u.ORGANISATIONID)
    if (!org) {
      org = { id: u.ORGANISATIONID, name: u.ORGANISATIONNAME, groups: GROUPS.map((g) => ({ ...g, users: [] })) }
      organisations.push(org)
    }
    org.groups.find((g) => g.key === groupFor(u)).users.push(u)
  }

  return (
    <main className="signin">
      <div className="signin-page">
        <header className="signin-intro">
          <span className="signin-mark" aria-hidden="true">
            <RarebitMark size={44} />
          </span>
          <h1>Who are you?</h1>
          <p>Pick yourself from the list to sign in.</p>
          <p className="signin-dev">
            <strong>Test sign-in.</strong> Everyone here is a test user. This page stands in for real sign-in until it
            arrives.
          </p>
          {me && (
            <p className="signin-current">
              You’re signed in as <strong>{me.DISPLAYNAME}</strong>. Pick someone else to switch.
            </p>
          )}
        </header>

        {switchedOff && (
          <p className="signin-alert" role="alert">
            Test sign-in is turned off, so there&apos;s nobody to sign in as. To use it on this computer, set
            TEST_SIGN_IN=true in server/.env and restart the server.
          </p>
        )}
        {loadError && (
          <p className="signin-alert" role="alert">
            Couldn’t load the test users: {loadError}
          </p>
        )}
        {error && (
          <p className="signin-alert" role="alert">
            {error}
          </p>
        )}

        {users && (
          <>
            <div className="signin-search">
              <label htmlFor={searchId}>Find a name</label>
              <input
                id={searchId}
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoComplete="off"
              />
            </div>

            {organisations.length === 0 && <p className="signin-empty">Nobody matches “{search.trim()}”.</p>}

            {organisations.map((org) => (
              <section key={org.id} className="signin-org" aria-labelledby={`signin-${org.id}`}>
                <h2 id={`signin-${org.id}`}>
                  {org.name} <span>{org.id}</span>
                </h2>
                {org.groups
                  .filter((g) => g.users.length > 0)
                  .map((g) => {
                    const groupKey = `${org.id}-${g.key}`
                    const showAll = query || expanded[groupKey] || g.users.length <= SHORT_LIST + 1
                    const shown = showAll ? g.users : g.users.slice(0, SHORT_LIST)
                    return (
                      <div key={g.key} className="signin-group">
                        <h3>
                          {g.title} <span>{g.users.length}</span>
                        </h3>
                        <ul className="signin-people">
                          {shown.map((u) => (
                            <li key={u.USERID}>
                              <button
                                type="button"
                                className="signin-person"
                                disabled={signingIn !== null}
                                aria-current={me?.USERID === u.USERID ? 'true' : undefined}
                                onClick={() => signInAs(u)}
                              >
                                <span className="signin-avatar" aria-hidden="true">
                                  {initials(u.DISPLAYNAME)}
                                </span>
                                <span className="signin-person-text">
                                  <strong>{u.DISPLAYNAME}</strong>
                                  <span>
                                    {signingIn === u.USERID
                                      ? 'Signing in…'
                                      : me?.USERID === u.USERID
                                        ? `${describe(u)} · signed in now`
                                        : describe(u)}
                                  </span>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        {!showAll && (
                          <button
                            type="button"
                            className="signin-more"
                            onClick={() => setExpanded((e) => ({ ...e, [groupKey]: true }))}
                          >
                            Show all {g.users.length} {g.title.toLowerCase()}
                          </button>
                        )}
                      </div>
                    )
                  })}
              </section>
            ))}
          </>
        )}
        {!users && !switchedOff && !loadError && <p className="signin-empty">Loading the test users…</p>}
      </div>
    </main>
  )
}

export default SignIn
