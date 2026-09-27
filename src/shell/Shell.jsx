import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import DevUserSwitcher from '../DevUserSwitcher'
import SkillsEnglandFooter from '../SkillsEnglandFooter'
import RarebitMark from '../logos/RarebitMark'
import AccountMenu from './AccountMenu'
import { AREA_NAMES, ShellContext, areaOf, areasFor, homeFor, isShellPath } from './navigation'
import './shell.css'

// Rarebit as one app: the landing page at /, Warren at /app and Burrow at
// /burrow share this shell. Moving between them changes the address
// without reloading the page. The header stays in place; its colour and
// area name change with a short fade (none if the device asks for reduced
// motion). Each area puts its own tabs into the header's tab slot.
//
// The signed-in user is loaded once here, and every area reads it through
// useShell().
const Warren = lazy(() => import('../App.jsx'))
const Burrow = lazy(() => import('../burrow/BurrowApp.jsx'))
const Landing = lazy(() => import('../Landing.jsx'))

const TITLES = {
  warren: 'Warren by Rarebit',
  burrow: 'Burrow by Rarebit',
  rarebit: 'Rarebit: learning and e-portfolio systems',
}

function currentPath() {
  return `${window.location.pathname}${window.location.search}`
}

function Shell() {
  const [path, setPath] = useState(currentPath)
  const [me, setMe] = useState(null)
  const [meError, setMeError] = useState(null)
  const [tabSlot, setTabSlot] = useState(null)
  const pathname = path.split('?')[0]
  const area = areaOf(pathname)

  const navigate = useCallback((to) => {
    if (currentPath() !== to) window.history.pushState(null, '', to)
    setPath(currentPath())
    window.scrollTo(0, 0)
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

  useEffect(() => {
    async function loadMe() {
      try {
        const res = await fetch('/api/me')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || `Server responded with ${res.status}`)
        setMe(data)
      } catch (err) {
        setMeError(err.message)
      }
    }
    loadMe()
  }, [])

  // The design tokens follow the area (src/ui/tokens.css).
  useEffect(() => {
    document.documentElement.dataset.area = area
    document.title = TITLES[area]
  }, [area])

  const shell = useMemo(
    () => ({ path, pathname, area, navigate, me, meError, tabSlot }),
    [path, pathname, area, navigate, me, meError, tabSlot],
  )

  return (
    <ShellContext.Provider value={shell}>
      <ShellHeader area={area} me={me} onTabSlot={setTabSlot} />
      <Suspense fallback={<div className="shell-loading" />}>
        {area === 'warren' && <Warren />}
        {area === 'burrow' && <Burrow />}
        {area === 'rarebit' && <Landing />}
      </Suspense>
      {area !== 'rarebit' && <SkillsEnglandFooter />}
    </ShellContext.Provider>
  )
}

// The header shared by every area: the Rarebit mark and name, the area's
// name, the area's tabs (put in the slot by the area), and on the right
// the switch to the other area (only for people who can use both), the
// account menu and the development-only test user pill. On the landing
// page there's no area name, and "Sign in" instead of the account menu.
function ShellHeader({ area, me, onTabSlot }) {
  const areas = areasFor(me)
  const other = area === 'warren' ? 'burrow' : area === 'burrow' ? 'warren' : null
  const canSwitch = other && areas.warren && areas.burrow

  return (
    <header className="shell-header">
      <a href={area === 'rarebit' ? '#top' : homeFor(me)} className="shell-brand" aria-label="Rarebit home">
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
        {area === 'rarebit' ? (
          <a href={me ? homeFor(me) : '/app'} className="shell-signin">
            Sign in
          </a>
        ) : (
          me && <AccountMenu me={me} />
        )}
        <DevUserSwitcher />
      </div>
    </header>
  )
}

export default Shell
