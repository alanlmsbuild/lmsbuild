import { useCallback, useEffect, useState } from 'react'
import './burrow.css'
import BurrowArch from '../logos/BurrowArch'
import SkillsEnglandFooter from '../SkillsEnglandFooter'
import Portfolio from './Portfolio'
import AddEvidence from './AddEvidence'
import DevUserSwitcher from '../DevUserSwitcher'

// Burrow, the learner e-portfolio, at /burrow:
//   /burrow           My portfolio
//   /burrow/add       Add evidence (?evidence=<id> to carry on with a draft)
//   /burrow/feedback  My portfolio, at "Feedback for you"
// Moving between them updates the address without reloading, and the
// browser's back button works. On a phone the same screens reshape, with
// the nav as a bottom bar.
//
// A learner signed in (from /api/me) sees their own portfolio. Staff pick
// whose portfolio to read from the learners they can see.

function currentLocation() {
  const { pathname, search } = window.location
  const params = new URLSearchParams(search)
  if (pathname.startsWith('/burrow/add')) return { page: 'add', evidenceId: params.get('evidence') }
  if (pathname.startsWith('/burrow/feedback')) return { page: 'feedback' }
  return { page: 'portfolio' }
}

function initials(learner) {
  return `${learner?.GIVENNAMES?.[0] ?? ''}${learner?.FAMILYNAME?.[0] ?? ''}`.toUpperCase() || '?'
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
  const [location, setLocation] = useState(currentLocation)
  const [learners, setLearners] = useState([])
  const [learnersStatus, setLearnersStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [me, setMe] = useState(null)
  const [meError, setMeError] = useState(null)
  const [viewingAs, setViewingAs] = useState(null)
  const isLearner = me?.roles.includes('LEARNER') ?? false

  const [portfolio, setPortfolio] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ready' | 'error'
  const [error, setError] = useState(null)
  const [flash, setFlash] = useState(null)

  useEffect(() => {
    function handlePopState() {
      setLocation(currentLocation())
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = useCallback((to) => {
    if (`${window.location.pathname}${window.location.search}` !== to) window.history.pushState(null, '', to)
    setLocation(currentLocation())
    window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const meRes = await fetch('/api/me')
        const meData = await meRes.json()
        if (!meRes.ok) throw new Error(meData.error || `Server responded with ${meRes.status}`)
        setMe(meData)
      } catch (err) {
        setMeError(err.message)
        return
      }
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
  }, [])

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
    if (location.page === 'add') navigate('/burrow/add')
  }

  function handleSaved(message) {
    setFlash(message)
    loadPortfolio(viewingAs)
    navigate('/burrow')
  }

  const learner = portfolio?.learner ?? learners.find((l) => l.LEARNREFNUMBER === viewingAs)
  const feedbackCount = (portfolio?.evidence ?? []).filter((e) => e.STATUS === 'changes_requested').length
  const onPortfolio = location.page === 'portfolio' || location.page === 'feedback'

  return (
    <div className="burrow">
      <DevUserSwitcher />
      <header className="burrow-header">
        <div className="burrow-header-left">
          <NavLink navigate={navigate} to="/burrow" className="burrow-logo" active={false}>
            <BurrowArch size={36} />
            <span>Burrow</span>
          </NavLink>
          <nav aria-label="Burrow" className="burrow-nav">
            <NavLink navigate={navigate} to="/burrow" className="burrow-pill" active={location.page === 'portfolio'}>
              My portfolio
            </NavLink>
            <NavLink navigate={navigate} to="/burrow/add" className="burrow-pill" active={location.page === 'add'}>
              Add evidence
            </NavLink>
            <NavLink navigate={navigate} to="/burrow/feedback" className="burrow-pill" active={location.page === 'feedback'}>
              Feedback ({feedbackCount})
            </NavLink>
          </nav>
        </div>
        <div className="burrow-header-right">
          {me && !isLearner && (
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
          )}
          {isLearner && learner && (
            <>
              <span className="burrow-learner-name">{fullName(learner)}</span>
              <span className="burrow-avatar" aria-hidden="true">
                {initials(learner)}
              </span>
            </>
          )}
        </div>
      </header>

      <div className="burrow-body">
        {meError && <p role="alert">{meError}</p>}
        {learnersStatus === 'error' && <p role="alert">Couldn&apos;t load the list of learners.</p>}
        {learnersStatus === 'ready' && learners.length === 0 && (
          <p className="burrow-muted">There are no portfolios for you to see.</p>
        )}
        {status === 'loading' && learners.length > 0 && <p className="burrow-muted">Opening your portfolio…</p>}
        {status === 'error' && <p role="alert">Couldn&apos;t load this portfolio: {error}</p>}

        {status === 'ready' && portfolio && onPortfolio && (
          <Portfolio
            portfolio={portfolio}
            flash={flash}
            onDismissFlash={() => setFlash(null)}
            scrollToFeedback={location.page === 'feedback'}
            navigate={navigate}
          />
        )}
        {status === 'ready' && portfolio && location.page === 'add' && (
          <AddEvidence
            key={`${viewingAs}-${location.evidenceId ?? 'new'}`}
            portfolio={portfolio}
            evidenceId={location.evidenceId}
            navigate={navigate}
            onSaved={handleSaved}
          />
        )}
      </div>

      <SkillsEnglandFooter />

      {/* The nav on a phone: a bottom bar, as in the phone design. */}
      <nav aria-label="Burrow" className="burrow-bottom-nav">
        <NavLink navigate={navigate} to="/burrow" className="burrow-bottom-link" active={location.page === 'portfolio'}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <rect x="4" y="4" width="16" height="16" rx="2" />
            <path d="M8 9h8M8 13h8M8 17h5" />
          </svg>
          Portfolio
        </NavLink>
        <NavLink navigate={navigate} to="/burrow/add" className="burrow-bottom-link" active={location.page === 'add'}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v8M8 12h8" />
          </svg>
          Add
        </NavLink>
        <NavLink navigate={navigate} to="/burrow/feedback" className="burrow-bottom-link" active={location.page === 'feedback'}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M4 5h16v11H9l-5 4z" />
          </svg>
          Feedback{feedbackCount > 0 ? ` (${feedbackCount})` : ''}
        </NavLink>
      </nav>
    </div>
  )
}

export default BurrowApp
