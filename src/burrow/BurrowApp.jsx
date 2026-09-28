import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import './burrow.css'
import Portfolio from './Portfolio'
import AddEvidence from './AddEvidence'
import EmployerHome from './EmployerHome'
import { usePageTitle, useShell } from '../shell/navigation'
import LearnerHeader from '../learner/LearnerHeader'
import { evidencePath, learnerPath, learnerTabPath, safeBack } from '../learner/links'
import EvidenceView from './EvidenceView'
import StaffLearnerList from './StaffLearnerList'

// Burrow, the learner e-portfolio, at /burrow. A learner's own pages:
//   /burrow           My portfolio
//   /burrow/add       Add evidence (?evidence=<id> to carry on with a draft)
//   /burrow/feedback  My portfolio, at "Feedback for you"
// Staff:
//   /burrow/learners                 the learners they can see (/burrow
//                                    goes here)
//   /burrow/learners/<ref>           the learner page's Portfolio tab, read
//                                    only; its Record tab is Warren's
//                                    /app/learners/<ref>. ?back= as there.
//   /burrow/learners/<ref>/feedback  the same, at "Feedback for you"
//   /burrow/learners/<ref>/evidence/<id>  one piece of evidence, read only
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
  const [first, ref, sub, evidenceId] = parts
  if (parts.length === 0) return { page: 'portfolio' }
  if (parts.length === 1 && first === 'add') return { page: 'add', evidenceId: params.get('evidence') }
  if (parts.length === 1 && first === 'feedback') return { page: 'feedback' }
  if (parts.length === 1 && first === 'apprentices') return { page: 'apprentices' }
  if (parts.length === 1 && first === 'learners') return { page: 'list' }
  if (first === 'learners' && ref && parts.length === 4 && sub === 'evidence' && evidenceId) {
    return { page: 'evidence', ref, evidenceId }
  }
  if (first === 'learners' && ref && (parts.length === 2 || (parts.length === 3 && sub === 'feedback'))) {
    return { page: sub ? 'feedback' : 'portfolio', ref }
  }
  return { page: 'notfound' }
}

// Where this address should go instead, for this user, or null to show it.
function redirectFor(location, { isLearner, isEmployer, canReadPortfolios }) {
  const { page, ref } = location
  if (page === 'notfound') return null
  if (!canReadPortfolios) return page === 'apprentices' ? null : '/burrow/apprentices'
  if (page === 'apprentices') return isEmployer ? null : '/burrow'
  if (isLearner) {
    // A learner's own portfolio is /burrow, whatever reference is asked for.
    if (page === 'list') return '/burrow'
    return ref ? (page === 'feedback' ? '/burrow/feedback' : '/burrow') : null
  }
  if (page === 'add' || !ref) return page === 'list' ? null : '/burrow/learners'
  return null
}

const ICONS = {
  portfolio: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  ),
  add: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  ),
  feedback: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M4 5h16v11H9l-5 4z" />
    </svg>
  ),
  learners: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 19c0-3.3 2.7-5 6-5s6 1.7 6 5M15 14.5c2.8 0 5 1.4 5 4.5" />
    </svg>
  ),
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

  const redirect = redirectFor(location, can)
  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true })
  }, [redirect, navigate])

  const [portfolio, setPortfolio] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null)
  const [flash, setFlash] = useState(null)

  // Staff's learner list. Employers never get it, and a learner only has
  // their own portfolio.
  useEffect(() => {
    if (!canReadPortfolios || isLearner) return
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
  }, [canReadPortfolios, isLearner])

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

  function handleSaved(message) {
    setFlash(message)
    loadPortfolio(viewingAs)
    navigate('/burrow')
  }

  const page = redirect ? null : location.page
  const onPortfolio = page === 'portfolio' || page === 'feedback'
  const onEvidence = page === 'evidence'
  // The portfolio on screen is the one asked for (not the last one, while
  // the next loads).
  const shownPortfolio = portfolio?.learner?.LEARNREFNUMBER === viewingAs ? portfolio : null
  const portfolioStatus = viewingAs && !shownPortfolio && status === 'ready' ? 'loading' : status
  const feedbackCount = (shownPortfolio?.evidence ?? []).filter((e) => e.STATUS === 'changes_requested').length
  const viewingName = shownPortfolio ? fullName(shownPortfolio.learner) : null
  // Staff's Back from a portfolio: where they opened it, or their list.
  const back = safeBack(new URLSearchParams(path.split('?')[1] ?? '').get('back')) ?? '/burrow/learners'

  // The tab title for each page. The evidence view names itself.
  function pageTitle() {
    if (onEvidence) return undefined
    if (!page) return null
    if (page === 'notfound') return 'Not found'
    if (page === 'apprentices') return 'Apprentices'
    if (page === 'add') return 'Add evidence'
    if (page === 'list') return 'Learners'
    if (isLearner) return page === 'feedback' ? 'Feedback' : 'My portfolio'
    return viewingName ? `Portfolio: ${viewingName}` : 'Portfolio'
  }
  usePageTitle(pageTitle())

  // Burrow's tabs, in the header (and as a bottom bar on a phone). A
  // learner's are their own pages; staff have their learner list, and
  // reach Record and Portfolio from the learner page.
  const navItems = [
    isLearner && {
      to: '/burrow',
      label: 'My portfolio',
      short: 'Portfolio',
      active: page === 'portfolio',
      icon: ICONS.portfolio,
    },
    isLearner && { to: '/burrow/add', label: 'Add evidence', short: 'Add', active: page === 'add', icon: ICONS.add },
    isLearner && {
      to: '/burrow/feedback',
      label: `Feedback (${feedbackCount})`,
      short: `Feedback${feedbackCount > 0 ? ` (${feedbackCount})` : ''}`,
      active: page === 'feedback',
      icon: ICONS.feedback,
    },
    !isLearner &&
      canReadPortfolios && {
        to: '/burrow/learners',
        label: 'Learners',
        active: page === 'list' || onPortfolio || onEvidence,
        icon: ICONS.learners,
      },
    isEmployer && {
      to: '/burrow/apprentices',
      label: 'Apprentices',
      active: page === 'apprentices',
      icon: ICONS.learners,
    },
  ].filter(Boolean)

  return (
    <div className="burrow">
      {tabSlot &&
        createPortal(
          <nav aria-label="Burrow">
            {navItems.map((item) => (
              <NavLink key={item.to} navigate={navigate} to={item.to} className="shell-tab" active={item.active}>
                {item.label}
              </NavLink>
            ))}
          </nav>,
          tabSlot,
        )}

      <div className="burrow-body">
        {page === 'notfound' && (
          <p role="alert">
            There&apos;s nothing at this address in Burrow. <a href="/burrow">Go to Burrow</a>
          </p>
        )}
        {page === 'list' && (
          <StaffLearnerList
            learners={learners}
            status={learnersStatus}
            linkFor={(ref) => learnerPath(me, ref, '/burrow/learners')}
          />
        )}
        {page === 'apprentices' && <EmployerHome me={me} />}

        {canReadPortfolios && (onPortfolio || onEvidence || page === 'add') && (
          <>
            {portfolioStatus === 'loading' && <p className="burrow-muted">Opening the portfolio…</p>}
            {portfolioStatus === 'error' && (
              <p role="alert">
                Couldn&apos;t load this portfolio: {error}
                {!isLearner && (
                  <>
                    {' '}
                    <a href={back}>Go back</a>
                  </>
                )}
              </p>
            )}
          </>
        )}

        {shownPortfolio && (onPortfolio || onEvidence) && !isLearner && (
          <LearnerHeader
            learnRefNumber={viewingAs}
            name={viewingName}
            detail={[shownPortfolio.learner.STDREFERENCE, shownPortfolio.learner.STDNAME].filter(Boolean).join(' ')}
            tab="portfolio"
            back={back}
          />
        )}

        {shownPortfolio && onEvidence && !isLearner && (
          <EvidenceView
            learnRefNumber={viewingAs}
            evidenceId={location.evidenceId}
            portfolioPath={learnerTabPath(viewingAs, 'portfolio', back)}
          />
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
            evidenceHref={isLearner ? null : (e) => evidencePath(viewingAs, e.EVIDENCE_ID, back)}
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
        {navItems.map((item) => (
          <NavLink key={item.to} navigate={navigate} to={item.to} className="burrow-bottom-link" active={item.active}>
            {item.icon}
            {item.short ?? item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default BurrowApp
