import { createContext, useContext, useEffect } from 'react'

// What the one-app shell (Shell.jsx) shares with Warren, Burrow and the
// landing page: the address, moving to another address without a page
// reload, the signed-in user, the header's slot for each area's tabs, and
// setting the page's title.
export const ShellContext = createContext(null)

export function useShell() {
  return useContext(ShellContext)
}

// Sets the browser tab's title for the page being shown, e.g. "My day".
// The shell adds the area ("My day – Warren").
export function usePageTitle(title) {
  const shell = useShell()
  const setPageTitle = shell?.setPageTitle
  useEffect(() => {
    setPageTitle?.(title)
  }, [title, setPageTitle])
}

// The area an address belongs to, which sets the header's colour and name,
// the design tokens' accent (data-area on <html>), and the tab's icon.
export function areaOf(pathname) {
  if (/^\/app(\/|$)/.test(pathname)) return 'warren'
  if (/^\/burrow(\/|$)/.test(pathname)) return 'burrow'
  return 'rarebit'
}

export const AREA_NAMES = { warren: 'Warren', burrow: 'Burrow', rarebit: 'Rarebit' }

// The browser tab: the area's mark as its icon, and its name in the title.
export const AREA_ICONS = { warren: '/icons/warren.svg', burrow: '/icons/burrow.svg', rarebit: '/icons/rarebit.svg' }
export const AREA_TITLES = {
  warren: 'Warren by Rarebit',
  burrow: 'Burrow by Rarebit',
  rarebit: 'Rarebit: learning and e-portfolio systems',
}

export function setTabIcon(area) {
  let link = document.querySelector('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    link.type = 'image/svg+xml'
    document.head.appendChild(link)
  }
  if (link.getAttribute('href') !== AREA_ICONS[area]) link.setAttribute('href', AREA_ICONS[area])
}

// Everyone who works for the provider, as STAFF in server/access.js.
const STAFF_ROLES = ['MANAGER', 'TUTOR', 'ASSESSOR', 'IQA']

// Which areas someone can use, from their roles (added together). Staff use
// both; learners and employers only Burrow.
export function areasFor(me) {
  const roles = me?.roles ?? []
  const staff = roles.some((r) => STAFF_ROLES.includes(r))
  return {
    warren: staff,
    burrow: staff || roles.includes('LEARNER') || roles.includes('EMPLOYER'),
  }
}

// Warren's first page for someone: My day for anyone with a caseload
// (managers too, until the team overview in part 8), the sign-offs to check
// for IQAs, otherwise the learners.
export function warrenHome(me) {
  const roles = me?.roles ?? []
  if (roles.some((r) => ['MANAGER', 'TUTOR', 'ASSESSOR'].includes(r))) return '/app/my-day'
  if (roles.includes('IQA')) return '/app/sign-offs'
  return '/app/learners'
}

// Where someone lands after signing in, and when they open the landing
// page or somewhere they can't use: staff on their Warren home, learners on
// their own portfolio, employers on their apprentices.
export function homeFor(me) {
  const roles = me?.roles ?? []
  if (areasFor(me).warren) return warrenHome(me)
  if (roles.includes('LEARNER')) return '/burrow'
  if (roles.includes('EMPLOYER')) return '/burrow/apprentices'
  return '/'
}

// The sign-in page, remembering where the person was going.
export function signInPath(next) {
  return next && next !== '/' ? `/sign-in?next=${encodeURIComponent(next)}` : '/sign-in'
}

// A "next" address from the sign-in page, only if it's somewhere in Rarebit
// this person can use (so a link can't send anyone off-site or to an area
// they can't open). Otherwise their home.
export function afterSignIn(next, me) {
  const areas = areasFor(me)
  if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) {
    const area = areaOf(next.split('?')[0])
    if ((area === 'warren' && areas.warren) || (area === 'burrow' && areas.burrow)) return next
  }
  return homeFor(me)
}

// Addresses the shell moves to without reloading: the areas, the landing
// page and the sign-in page. Anything else (like /api file links) is a
// normal link.
export function isShellPath(pathname) {
  return pathname === '/' || pathname === '/sign-in' || areaOf(pathname) !== 'rarebit'
}
