import { useEffect, useId, useRef, useState } from 'react'
import { areasFor } from './navigation'

const ROLE_LABELS = {
  LEARNER: 'Learner',
  TUTOR: 'Tutor',
  ASSESSOR: 'Assessor',
  IQA: 'IQA',
  EMPLOYER: 'Employer',
  MANAGER: 'Manager',
}

function initials(name) {
  const parts = String(name ?? '').trim().split(/\s+/)
  return `${parts[0]?.[0] ?? ''}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase() || '?'
}

// The account menu in the shared header: who's signed in, their
// organisation and roles, and the areas they can use. It only names an
// area the person can use.
function AccountMenu({ me }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const buttonRef = useRef(null)
  const panelId = useId()
  const areas = areasFor(me)
  const roles = me.roles.map((r) => ROLE_LABELS[r] ?? r).join(', ')

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

  return (
    <div className="shell-account" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="shell-account-button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Account: ${me.DISPLAYNAME}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="shell-avatar" aria-hidden="true">
          {initials(me.DISPLAYNAME)}
        </span>
        <span className="shell-account-name">{me.DISPLAYNAME.split(' ')[0]}</span>
        <span className="shell-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div id={panelId} className="shell-account-panel" role="region" aria-label="Your account">
          <div className="shell-account-who">
            <strong>{me.DISPLAYNAME}</strong>
            <span>{[me.ORGANISATIONNAME, roles].filter(Boolean).join(' · ')}</span>
          </div>
          {(areas.warren || areas.burrow) && (
            <ul className="shell-account-links">
              {areas.warren && (
                <li>
                  <a href="/app" onClick={() => setOpen(false)}>
                    Warren
                  </a>
                </li>
              )}
              {areas.burrow && (
                <li>
                  <a href="/burrow" onClick={() => setOpen(false)}>
                    Burrow
                  </a>
                </li>
              )}
            </ul>
          )}
          <p className="shell-account-note">Signing out comes with real sign-in.</p>
        </div>
      )}
    </div>
  )
}

export default AccountMenu
