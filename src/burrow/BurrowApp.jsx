import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import './burrow.css'
import Portfolio from './Portfolio'
import AddEvidence from './AddEvidence'
import EmployerHome from './EmployerHome'
import { useShell } from '../shell/navigation'

// Burrow, the learner e-portfolio, at /burrow:
//   /burrow           My portfolio
//   /burrow/add       Add evidence (?evidence=<id> to carry on with a draft)
//   /burrow/feedback  My portfolio, at "Feedback for you"
//   /burrow/apprentices  An employer's apprentices and witness statements
// It lives in the one-app shell (src/shell), which owns the address and
// the header: moving between pages (and to Warren) doesn't reload, and the
// browser's back button works. Burrow's tabs go in the shared header. On a
// phone the same screens reshape, with the tabs as a bottom bar.
//
// What each user gets, from their roles (/api/me), added together:
//   Learner   their own portfolio, and adds and changes their evidence
//   Staff     pick whose portfolio to read, from the learners they can
//             see. Read only: only the learner changes their evidence.
//   Employer  their apprentices' progress and the witness statements
//             waiting for them, never the portfolio itself

// Everyone who works for the provider, as STAFF in server/access.js.
const STAFF_ROLES = ['MANAGER', 'TUTOR', 'ASSESSOR', 'IQA']

function parseLocation(path) {
  const [pathname, search = ''] = path.split('?')
  const params = new URLSearchParams(search)
  if (pathname.startsWith('/burrow/add')) return { page: 'add', evidenceId: params.get('evidence') }
  if (pathname.startsWith('/burrow/feedback')) return { page: 'feedback' }
  if (pathname.startsWith('/burrow/apprentices')) return { page: 'apprentices' }
  return { page: 'portfolio' }
}

// The page to show: the one asked for, or one this user can use instead.
function pageFor(asked, { isLearner, isEmployer, canReadPortfolios }) {
  if (!canReadPortfolios) return isEmployer ? 'apprentices' : null
  if (asked === 'apprentices') return isEmployer ? 'apprentices' : 'portfolio'
  if (asked === 'add' && !isLearner) return 'portfolio'
  return asked
}

function fullName(learner) {
  return `${learner?.GIVENNAMES ?? ''} ${learner?.FAMILYNAME ?? ''}`.trim() || learner?.LEARNREFNUMBER || ''
}

// A real link (so it can be opened in a new tab), handled in-page.
function NavLink({ to, active, navigate, className, children }) {
  return (
    <a
      href={to}
      className={`${className}${active ? ' is-active' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}

function BurrowApp() {
  const { path, navigate, me, meError, tabSlot } = useShell()
  const location = parseLocation(path)
  const [learners, setLearners] = useState([])
  const [learnersStatus, setLearnersStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [viewingAs, setViewingAs] = useState(null)
  const roles = me?.roles ?? []
  const isLearner = roles.includes('LEARNER')
  const isEmployer = roles.includes('EMPLOYER')
  const canReadPortfolios = isLearner || roles.some((r) => STAFF_ROLES.includes(r))

  const [portfolio, setPortfolio] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null)
  const [flash, setFlash] = useState(null)

  // Only learners and staff read portfolios; employers never get the list.
  useEffect(() => {
    if (!canReadPortfolios) return
    async function load() {
      try {
        const res = await fetch('/api/burrow/learners')
        if (!res.ok) throw new Error(`Server responded with ${res.status}`)
        const list = await res.json()
        setLearners(list)
        setLearnersStatus('ready')
      } catch {
        setLearnersStatus('error')
      }
    }
    load()
  }, [canReadPortfolios])

  // A learner opens their own portfolio; anyone else starts at the first.
  useEffect(() => {
    if (!me || learnersStatus !== 'ready') return
    setViewingAs(me.roles.includes('LEARNER') ? me.LEARNREFNUMBER : (learners[0]?.LEARNREFNUMBER ?? null))
  }, [me, learners, learnersStatus])

  const loadPortfolio = useCallback(async (ref) => {
    if (!ref) return
    try {
      const res = await fetch(`/api/burrow/learners/${encodeURIComponent(ref)}/portfolio`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Server responded with ${res.status}`)
      setPortfolio(data)
      setStatus('ready')
      setError(null)
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    loadPortfolio(viewingAs)
  }, [viewingAs, loadPortfolio])

  function handleViewingAs(ref) {
    setStatus('loading')
    setFlash(null)
    setViewingAs(ref)
  }

  function handleSaved(message) {
    setFlash(message)
    loadPortfolio(viewingAs)
    navigate('/burrow')
  }

  const feedbackCount = (portfolio?.evidence ?? []).filter((e) => e.STATUS === 'changes_requested').length
  const page = me ? pageFor(location.page, { isLearner, isEmployer, canReadPortfolios }) : null
  const onPortfolio = page === 'portfolio' || page === 'feedback'

  return (
    <div className="burrow">
      {tabSlot &&
        createPortal(
          <nav aria-label="Burrow">
            {canReadPortfolios && (
              <NavLink navigate={navigate} to="/burrow" className="shell-tab" active={page === 'portfolio'}>
                {isLearner ? 'My portfolio' : 'Portfolio'}
              </NavLink>
            )}
            {isLearner && (
              <NavLink navigate={navigate} to="/burrow/add" className="shell-tab" active={page === 'add'}>
                Add evidence
              </NavLink>
            )}
            {canReadPortfolios && (
              <NavLink navigate={navigate} to="/burrow/feedback" className="shell-tab" active={page === 'feedback'}>
                Feedback ({feedbackCount})
              </NavLink>
            )}
            {isEmployer && (
              <NavLink navigate={navigate} to="/burrow/apprentices" className="shell-tab" active={page === 'apprentices'}>
                Apprentices
              </NavLink>
            )}
          </nav>,
          tabSlot,
        )}

      <div className="burrow-body">
        {meError && <p role="alert">{meError}</p>}
        {me && !isLearner && canReadPortfolios && page !== 'apprentices' && (
          <div className="burrow-toolbar">
            <label className="burrow-viewing-as">
              <span>Portfolio of</span>
              <select
                value={viewingAs ?? ''}
                disabled={learnersStatus !== 'ready' || learners.length === 0}
                onChange={(e) => handleViewingAs(e.target.value)}
              >
                {learnersStatus === 'loading' && <option value="">Loading learners…</option>}
                {learners.map((l) => (
                  <option key={l.LEARNREFNUMBER} value={l.LEARNREFNUMBER}>
                    {fullName(l)} ({l.LEARNREFNUMBER})
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {me && !canReadPortfolios && !isEmployer && (
          <p className="burrow-muted">There&apos;s nothing in Burrow for your account yet.</p>
        )}
        {page === 'apprentices' && <EmployerHome me={me} />}

        {canReadPortfolios && page !== 'apprentices' && (
          <>
            {learnersStatus === 'error' && <p role="alert">Couldn&apos;t load the list of learners.</p>}
            {learnersStatus === 'ready' && learners.length === 0 && (
              <p className="burrow-muted">There are no portfolios for you to see.</p>
            )}
            {status === 'loading' && learners.length > 0 && <p className="burrow-muted">Opening the portfolio…</p>}
            {status === 'error' && <p role="alert">Couldn&apos;t load this portfolio: {error}</p>}
          </>
        )}

        {status === 'ready' && portfolio && onPortfolio && (
          <Portfolio
            readOnly={!isLearner}
            portfolio={portfolio}
            flash={flash}
            onDismissFlash={() => setFlash(null)}
            scrollToFeedback={page === 'feedback'}
            navigate={navigate}
          />
        )}
        {status === 'ready' && portfolio && page === 'add' && (
          <AddEvidence
            key={`${viewingAs}-${location.evidenceId ?? 'new'}`}
            portfolio={portfolio}
            evidenceId={location.evidenceId}
            navigate={navigate}
            onSaved={handleSaved}
          />
        )}
      </div>

      {/* The nav on a phone: a bottom bar, as in the phone design. */}
      <nav aria-label="Burrow" className="burrow-bottom-nav">
        {canReadPortfolios && (
          <NavLink navigate={navigate} to="/burrow" className="burrow-bottom-link" active={page === 'portfolio'}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <path d="M8 9h8M8 13h8M8 17h5" />
            </svg>
            Portfolio
          </NavLink>
        )}
        {isLearner && (
          <NavLink navigate={navigate} to="/burrow/add" className="burrow-bottom-link" active={page === 'add'}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v8M8 12h8" />
            </svg>
            Add
          </NavLink>
        )}
        {canReadPortfolios && (
          <NavLink navigate={navigate} to="/burrow/feedback" className="burrow-bottom-link" active={page === 'feedback'}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path d="M4 5h16v11H9l-5 4z" />
            </svg>
            Feedback{feedbackCount > 0 ? ` (${feedbackCount})` : ''}
          </NavLink>
        )}
        {isEmployer && (
          <NavLink navigate={navigate} to="/burrow/apprentices" className="burrow-bottom-link" active={page === 'apprentices'}>
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <circle cx="9" cy="8" r="3" />
              <circle cx="17" cy="9" r="2.5" />
              <path d="M3 19c0-3.3 2.7-5 6-5s6 1.7 6 5M15 14.5c2.8 0 5 1.4 5 4.5" />
            </svg>
            Apprentices
          </NavLink>
        )}
      </nav>
    </div>
  )
}

export default BurrowApp
