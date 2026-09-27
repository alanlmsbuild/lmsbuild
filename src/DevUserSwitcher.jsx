import { useEffect, useId, useRef, useState } from 'react'
import './DevUserSwitcher.css'

// DEVELOPMENT ONLY: the "Test user" pill in the header, for switching test
// users while there's no real sign-in (see server/devUsers.js). Shows
// nothing unless the server has DEV_USER_SWITCHING=true (the /api/dev
// routes don't exist otherwise). The pill opens a small panel, marked as
// development only, with the list of test users. Picking someone reloads
// the page, so every screen starts again as them. Used by both Warren and
// Burrow, which share the pick.

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
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const buttonRef = useRef(null)
  const panelId = useId()
  const selectId = useId()

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

  // Escape or a click outside closes the panel.
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    function handlePointerDown(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [open])

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
  const current = state?.users.find((u) => u.USERID === state.current)

  return (
    <div className="dev-switcher" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="dev-switcher-pill"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="dev-switcher-label">Test user</span>
        <span className="dev-switcher-name">{current?.DISPLAYNAME ?? state?.current ?? 'Nobody'}</span>
        <span aria-hidden="true" className="dev-switcher-caret">▾</span>
      </button>

      {open && (
        <div id={panelId} className="dev-switcher-panel" role="region" aria-label="Test users, development only">
          <p className="dev-switcher-title">Development only</p>
          <p className="dev-switcher-note">
            There&apos;s no real sign-in yet. Pick a test user to see the app as them; the page reloads.
          </p>
          {state && (
            <div className="dev-switcher-field">
              <label htmlFor={selectId}>Signed in as</label>
              <select
                id={selectId}
                value={state.current ?? ''}
                disabled={switching}
                onChange={(e) => handleChange(e.target.value)}
              >
                {!current && <option value={state.current ?? ''}>{state.current ?? 'Nobody'}</option>}
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
            </div>
          )}
          {switching && <p className="dev-switcher-note">Switching…</p>}
        </div>
      )}
      {error && (
        <span className="dev-switcher-error" role="alert">
          Test user switcher: {error}
        </span>
      )}
    </div>
  )
}

export default DevUserSwitcher
