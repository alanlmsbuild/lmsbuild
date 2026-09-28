import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import DevUserSwitcher from '../DevUserSwitcher'
import SkillsEnglandFooter from '../SkillsEnglandFooter'
import RarebitMark from '../logos/RarebitMark'
import AccountMenu from './AccountMenu'
import {
  AREA_NAMES,
  AREA_TITLES,
  ShellContext,
  areaOf,
  areasFor,
  homeFor,
  isShellPath,
  setTabIcon,
  signInPath,
} from './navigation'
import './shell.css'

// Rarebit as one app: the landing page at /, the sign-in page at /sign-in,
// Warren at /app and Burrow at /burrow share this shell. Moving between
// them changes the address without reloading the page. The header stays in
// place; its colour and area name change with a short fade (none if the
// device asks for reduced motion). Each area puts its own tabs into the
// header's tab slot.
//
// The signed-in user is loaded here, and every area reads it through
// useShell(). The shell also decides who can be where:
//   /            signed in: their home (homeFor), otherwise the landing page
//   /app, /burrow signed out: the sign-in page, then back here; an area
//                the person can't use: their home
// Redirects replace the address rather than adding to the history, so Back
// doesn't bounce straight into them again.
const Warren = lazy(() => import('../App.jsx'))
const Burrow = lazy(() => import('../burrow/BurrowApp.jsx'))
const Landing = lazy(() => import('../Landing.jsx'))
const SignIn = lazy(() => import('./SignIn.jsx'))

function currentPath() {
  return `${window.location.pathname}${window.location.search}`
}

// Where the shell sends this address, or null to show it.
function redirectFor(path, pathname, area, meStatus, me) {
  if (meStatus === 'in') {
    const areas = areasFor(me)
    if (pathname === '/' || (area !== 'rarebit' && !areas[area])) return homeFor(me)
  }
  if (meStatus === 'out' && area !== 'rarebit') return signInPath(path)
  return null
}

function Shell() {
  const [path, setPath] = useState(currentPath)
  // loading, in (signed in), out (nobody signed in) or error (couldn't
  // check, or this person can't use Rarebit: meError says why).
  const [meStatus, setMeStatus] = useState('loading')
  const [me, setMe] = useState(null)
  const [meError, setMeError] = useState(null)
  const [tabSlot, setTabSlot] = useState(null)
  const [pageTitle, setPageTitleState] = useState(null)
  const pathname = path.split('?')[0]
  const area = areaOf(pathname)

  // replace: true swaps the address instead of adding to the history (for
  // redirects, and for filters that shouldn't each need a Back).
  const navigate = useCallback((to, { replace = false } = {}) => {
    if (currentPath() !== to) window.history[replace ? 'replaceState' : 'pushState'](null, '', to)
    setPath(currentPath())
    if (!replace) window.scrollTo(0, 0)
  }, [])

  useEffect(() => {
    function handlePopState() {
      setPath(currentPath())
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Ordinary links to another part of Rarebit (<a href="/burrow">) move
  // without a reload too, unless opened in a new tab or window.
  useEffect(() => {
    function handleClick(e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const link = e.target.closest?.('a[href]')
      if (!link || link.target || link.hasAttribute('download')) return
      const url = new URL(link.href, window.location.href)
      if (url.origin !== window.location.origin || !isShellPath(url.pathname)) return
      if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return
      e.preventDefault()
      navigate(`${url.pathname}${url.search}`)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [navigate])

  // Loads (or reloads, after signing in) the signed-in user. Returns
  // { me } when someone is signed in, { error } when they can't use
  // Rarebit or the check failed, and {} when nobody is signed in.
  const refreshMe = useCallback(async () => {
    try {
      const res = await fetch('/api/me')
      const data = await res.json()
      if (res.status === 401 && data.signedIn === false) {
        setMe(null)
        setMeError(null)
        setMeStatus('out')
        return {}
      }
      if (!res.ok) throw new Error(data.error || `Server responded with ${res.status}`)
      setMe(data)
      setMeError(null)
      setMeStatus('in')
      return { me: data }
    } catch (err) {
      setMe(null)
      setMeError(err.message)
      setMeStatus('error')
      return { error: err.message }
    }
  }, [])

  useEffect(() => {
    refreshMe()
  }, [refreshMe])

  const signOut = useCallback(async () => {
    const res = await fetch('/api/dev/sign-out', { method: 'POST' })
    if (!res.ok) throw new Error(`Server responded with ${res.status}`)
    setMe(null)
    setMeError(null)
    setMeStatus('out')
    navigate('/')
  }, [navigate])

  const redirect = redirectFor(path, pathname, area, meStatus, me)
  useEffect(() => {
    if (redirect && redirect !== currentPath()) navigate(redirect, { replace: true })
  }, [redirect, navigate])

  // Each page names itself (usePageTitle); the name only counts on the
  // address it was set for, so a page that doesn't set one never shows the
  // last page's.
  const setPageTitle = useCallback((title) => {
    setPageTitleState(title ? { pathname: window.location.pathname, title } : null)
  }, [])
  const title = pageTitle?.pathname === pathname ? pageTitle.title : null

  // The design tokens (src/ui/tokens.css), the tab's icon and its title
  // follow the area.
  useEffect(() => {
    document.documentElement.dataset.area = area
    setTabIcon(area)
  }, [area])
  useEffect(() => {
    document.title = title ? `${title} – ${AREA_NAMES[area]}` : AREA_TITLES[area]
  }, [title, area])

  const shell = useMemo(
    () => ({ path, pathname, area, navigate, me, tabSlot, refreshMe, signOut, setPageTitle }),
    [path, pathname, area, navigate, me, tabSlot, refreshMe, signOut, setPageTitle],
  )

  let page
  if (redirect || (meStatus === 'loading' && pathname !== '/sign-in')) {
    page = <div className="shell-loading" />
  } else if (pathname === '/sign-in') {
    page = <SignIn />
  } else if (area === 'rarebit') {
    page = pathname === '/' ? <Landing /> : <ShellNotFound />
  } else if (meStatus === 'error') {
    page = <ShellError message={meError} onRetry={refreshMe} />
  } else {
    page = area === 'warren' ? <Warren /> : <Burrow />
  }

  return (
    <ShellContext.Provider value={shell}>
      <ShellHeader area={area} pathname={pathname} me={me} onTabSlot={setTabSlot} />
      <Suspense fallback={<div className="shell-loading" />}>{page}</Suspense>
      {area !== 'rarebit' && <SkillsEnglandFooter />}
    </ShellContext.Provider>
  )
}

// The header shared by every page: the Rarebit mark and name, the area's
// name, the area's tabs (put in the slot by the area), and on the right
// the switch to the other area (only for people who can use both), the
// account menu and the development-only test user pill. On the landing
// page there's no area name, and "Sign in" instead of the account menu.
function ShellHeader({ area, pathname, me, onTabSlot }) {
  const areas = areasFor(me)
  const other = area === 'warren' ? 'burrow' : area === 'burrow' ? 'warren' : null
  const canSwitch = other && areas.warren && areas.burrow

  return (
    <header className="shell-header">
      <a href={me ? homeFor(me) : '/'} className="shell-brand" aria-label="Rarebit home">
        <span className="shell-mark" aria-hidden="true">
          <RarebitMark size={26} />
        </span>
        <span className="shell-wordmark">rarebit</span>
      </a>
      {area !== 'rarebit' && (
        <>
          <span className="shell-divider" aria-hidden="true" />
          <span key={area} className="shell-area">
            {AREA_NAMES[area]}
          </span>
        </>
      )}
      <div className="shell-tabs" ref={onTabSlot} />
      <div className="shell-right">
        {canSwitch && (
          <a href={other === 'burrow' ? '/burrow' : '/app'} className="shell-switch">
            {AREA_NAMES[other]}
          </a>
        )}
        {me ? (
          <AccountMenu me={me} />
        ) : (
          pathname !== '/sign-in' && (
            <a href="/sign-in" className="shell-signin">
              Sign in
            </a>
          )
        )}
        <DevUserSwitcher currentUserId={me?.USERID ?? null} />
      </div>
    </header>
  )
}

function ShellNotFound() {
  return (
    <main className="shell-message">
      <h1>There&apos;s nothing at this address</h1>
      <p>
        The link may be out of date. <a href="/">Go to the Rarebit home page</a>.
      </p>
    </main>
  )
}

// This person couldn't be checked, or can't use Rarebit (their access has
// ended, or they have no roles yet).
function ShellError({ message, onRetry }) {
  return (
    <main className="shell-message">
      <h1>We couldn&apos;t open this page</h1>
      <p role="alert">{message}</p>
      <p className="shell-message-actions">
        <button type="button" className="shell-message-button" onClick={onRetry}>
          Try again
        </button>
        <a href="/sign-in">Sign in as someone else</a>
      </p>
    </main>
  )
}

export default Shell
