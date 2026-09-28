import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import './burrow.css'
import Portfolio from './Portfolio'
import AddEvidence from './AddEvidence'
import EmployerHome from './EmployerHome'
import { usePageTitle, useShell } from '../shell/navigation'

// Burrow, the learner e-portfolio, at /burrow. A learner's own pages:
//   /burrow           My portfolio
//   /burrow/add       Add evidence (?evidence=<id> to carry on with a draft)
//   /burrow/feedback  My portfolio, at "Feedback for you"
// Staff reading a learner's portfolio:
//   /burrow/learners/<ref>           (/burrow goes to the first learner)
//   /burrow/learners/<ref>/feedback
// An employer:
//   /burrow/apprentices  Their apprentices and witness statements
// Anything else here that someone can't use goes to the page they can.
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
  let parts = pathname.split('/').filter(Boolean).slice(1)
  try {
    parts = parts.map(decodeURIComponent)
  } catch {
    // Leave a badly encoded reference as it is; it won't match a learner.
  }
  const [first, ref, sub] = parts
  if (parts.length === 0) return { page: 'portfolio' }
  if (parts.length === 1 && first === 'add') return { page: 'add', evidenceId: params.get('evidence') }
  if (parts.length === 1 && first === 'feedback') return { page: 'feedback' }
  if (parts.length === 1 && first === 'apprentices') return { page: 'apprentices' }
  if (first === 'learners' && ref && (parts.length === 2 || (parts.length === 3 && sub === 'feedback'))) {
    return { page: sub ? 'feedback' : 'portfolio', ref }
  }
  return { page: 'notfound' }
}

// A staff member's portfolio address for a learner.
function staffPortfolioPath(ref, page) {
  return `/burrow/learners/${encodeURIComponent(ref)}${page === 'feedback' ? '/feedback' : ''}`
}

// Where this address should go instead, for this user, or null to show it.
function redirectFor(location, { isLearner, isEmployer, canReadPortfolios }, learners, learnersStatus) {
  const { page, ref } = location
  if (page === 'notfound') return null
  if (!canReadPortfolios) return page === 'apprentices' ? null : '/burrow/apprentices'
  if (page === 'apprentices') return isEmployer ? null : '/burrow'
  if (isLearner) {
    // A learner's own portfolio is /burrow, whatever reference is asked for.
    return ref ? (page === 'feedback' ? '/burrow/feedback' : '/burrow') : null
  }
  if (page === 'add') return '/burrow'
  if (!ref && learnersStatus === 'ready' && learners.length > 0) {
    return staffPortfolioPath(learners[0].LEARNREFNUMBER, page)
  }
  return null
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
  const { path, navigate, me, tabSlot } = useShell()
  const location = parseLocation(path)
  const [learners, setLearners] = useState([])
  const [learnersStatus, setLearnersStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const roles = me?.roles ?? []
  const isLearner = roles.includes('LEARNER')
  const isEmployer = roles.includes('EMPLOYER')
  const canReadPortfolios = isLearner || roles.some((r) => STAFF_ROLES.includes(r))
  const can = { isLearner, isEmployer, canReadPortfolios }

  // Whose portfolio is open: a learner's own, or the one in the address.
  const viewingAs = isLearner ? me.LEARNREFNUMBER : (location.ref ?? null)

  const redirect = redirectFor(location, can, learners, learnersStatus)
  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true })
  }, [redirect, navigate])

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

  const loadPortfolio = useCallback(async (ref) => {
    if (!ref) return
    setStatus('loading')
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
    setFlash(null)
    navigate(staffPortfolioPath(ref, page))
  }

  function handleSaved(message) {
    setFlash(message)
    loadPortfolio(viewingAs)
    navigate('/burrow')
  }

  const page = redirect ? null : location.page
  const onPortfolio = page === 'portfolio' || page === 'feedback'
  // The portfolio on screen is the one asked for (not the last one, while
  // the next loads).
  const shownPortfolio = portfolio?.learner?.LEARNREFNUMBER === viewingAs ? portfolio : null
  const portfolioStatus = viewingAs && !shownPortfolio && status === 'ready' ? 'loading' : status
  const feedbackCount = (shownPortfolio?.evidence ?? []).filter((e) => e.STATUS === 'changes_requested').length
  const viewingName = learners.find((l) => l.LEARNREFNUMBER === viewingAs)

  usePageTitle(
    page === 'notfound'
      ? 'Not found'
      : page === 'apprentices'
        ? 'Apprentices'
        : page === 'add'
          ? 'Add evidence'
          : !page
            ? null
            : isLearner
              ? page === 'feedback'
                ? 'Feedback'
                : 'My portfolio'
              : viewingName
                ? `${page === 'feedback' ? 'Feedback' : 'Portfolio'}: ${fullName(viewingName)}`
                : 'Portfolio',
  )

  // Staff's tabs go to the portfolio being read.
  const portfolioPath = isLearner ? '/burrow' : viewingAs ? staffPortfolioPath(viewingAs, 'portfolio') : '/burrow'
  const feedbackPath = isLearner ? '/burrow/feedback' : viewingAs ? staffPortfolioPath(viewingAs, 'feedback') : '/burrow'

  return (
    <div className="burrow">
      {tabSlot &&
        createPortal(
          <nav aria-label="Burrow">
            {canReadPortfolios && (
              <NavLink navigate={navigate} to={portfolioPath} className="shell-tab" active={page === 'portfolio'}>
                {isLearner ? 'My portfolio' : 'Portfolio'}
              </NavLink>
            )}
            {isLearner && (
              <NavLink navigate={navigate} to="/burrow/add" className="shell-tab" active={page === 'add'}>
                Add evidence
              </NavLink>
            )}
            {canReadPortfolios && (
              <NavLink navigate={navigate} to={feedbackPath} className="shell-tab" active={page === 'feedback'}>
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
        {page === 'notfound' && (
          <p role="alert">
            There&apos;s nothing at this address in Burrow. <a href="/burrow">Go to Burrow</a>
          </p>
        )}
        {me && !isLearner && canReadPortfolios && onPortfolio && (
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
        {page === 'apprentices' && <EmployerHome me={me} />}

        {canReadPortfolios && (onPortfolio || page === 'add') && (
          <>
            {learnersStatus === 'error' && <p role="alert">Couldn&apos;t load the list of learners.</p>}
            {learnersStatus === 'ready' && learners.length === 0 && (
              <p className="burrow-muted">There are no portfolios for you to see.</p>
            )}
            {portfolioStatus === 'loading' && learners.length > 0 && (
              <p className="burrow-muted">Opening the portfolio…</p>
            )}
            {portfolioStatus === 'error' && <p role="alert">Couldn&apos;t load this portfolio: {error}</p>}
          </>
        )}

        {shownPortfolio && onPortfolio && (
          <Portfolio
            key={viewingAs}
            readOnly={!isLearner}
            portfolio={shownPortfolio}
            flash={flash}
            onDismissFlash={() => setFlash(null)}
            scrollToFeedback={page === 'feedback'}
            navigate={navigate}
          />
        )}
        {shownPortfolio && page === 'add' && (
          <AddEvidence
            key={`${viewingAs}-${location.evidenceId ?? 'new'}`}
            portfolio={shownPortfolio}
            evidenceId={location.evidenceId}
            navigate={navigate}
            onSaved={handleSaved}
          />
        )}
      </div>

      {/* The nav on a phone: a bottom bar, as in the phone design. */}
      <nav aria-label="Burrow" className="burrow-bottom-nav">
        {canReadPortfolios && (
          <NavLink navigate={navigate} to={portfolioPath} className="burrow-bottom-link" active={page === 'portfolio'}>
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
          <NavLink navigate={navigate} to={feedbackPath} className="burrow-bottom-link" active={page === 'feedback'}>
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
