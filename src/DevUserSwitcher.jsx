import { useEffect, useState } from 'react'
import './DevUserSwitcher.css'

// DEVELOPMENT ONLY: the striped bar for switching test users while there's
// no real sign-in (see server/devUsers.js). Shows nothing unless the server
// has DEV_USER_SWITCHING=true. Picking someone reloads the page, so every
// screen starts again as them. Used by both Warren and Burrow, which share
// the pick.

const ROLE_LABELS = {
  LEARNER: 'Learner',
  TUTOR: 'Tutor',
  ASSESSOR: 'Assessor',
  IQA: 'IQA',
  EMPLOYER: 'Employer',
  MANAGER: 'Manager',
}

function describeUser(u) {
  const roles = u.ROLES.map((r) => ROLE_LABELS[r] ?? r).join(' + ') || 'No roles'
  const notes = [
    ...u.REVOKEDROLES.map((r) => `${ROLE_LABELS[r] ?? r} revoked`),
    ...(u.ISACTIVE ? [] : ['inactive']),
  ]
  return `${u.DISPLAYNAME} · ${roles}${notes.length ? ` (${notes.join(', ')})` : ''}`
}

function DevUserSwitcher() {
  const [state, setState] = useState(null) // { current, users } once loaded
  const [error, setError] = useState(null)
  const [switching, setSwitching] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/dev/users')
        if (res.status === 404) return // switching is off: show nothing
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Server responded with ${res.status}`)
        setState(data)
      } catch (err) {
        setError(err.message)
      }
    }
    load()
  }, [])

  async function handleChange(userId) {
    setSwitching(true)
    setError(null)
    try {
      const res = await fetch('/api/dev/user', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Server responded with ${res.status}`)
      window.location.reload()
    } catch (err) {
      setError(err.message)
      setSwitching(false)
    }
  }

  if (!state && !error) return null

  const organisations = []
  for (const u of state?.users ?? []) {
    let group = organisations.find((g) => g.id === u.ORGANISATIONID)
    if (!group) {
      group = { id: u.ORGANISATIONID, name: u.ORGANISATIONNAME, users: [] }
      organisations.push(group)
    }
    group.users.push(u)
  }

  return (
    <div className="dev-switcher" role="region" aria-label="Development only">
      <strong>Development only: no real sign-in.</strong>
      {state && (
        <label>
          <span>Signed in as</span>
          <select value={state.current ?? ''} disabled={switching} onChange={(e) => handleChange(e.target.value)}>
            {!state.users.some((u) => u.USERID === state.current) && (
              <option value={state.current ?? ''}>{state.current ?? 'Nobody'}</option>
            )}
            {organisations.map((g) => (
              <optgroup key={g.id} label={`${g.name} (${g.id})`}>
                {g.users.map((u) => (
                  <option key={u.USERID} value={u.USERID}>
                    {describeUser(u)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
      {error && <span role="alert">Test user switcher: {error}</span>}
    </div>
  )
}

export default DevUserSwitcher
