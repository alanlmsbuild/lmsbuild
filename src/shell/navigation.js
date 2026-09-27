import { createContext, useContext } from 'react'

// What the one-app shell (Shell.jsx) shares with Warren, Burrow and the
// landing page: the address, moving to another address without a page
// reload, the signed-in user, and the header's slot for each area's tabs.
export const ShellContext = createContext(null)

export function useShell() {
  return useContext(ShellContext)
}

// The area an address belongs to, which sets the header's colour and name
// and the design tokens' accent (data-area on <html>).
export function areaOf(pathname) {
  if (/^\/app(\/|$)/.test(pathname)) return 'warren'
  if (/^\/burrow(\/|$)/.test(pathname)) return 'burrow'
  return 'rarebit'
}

export const AREA_NAMES = { warren: 'Warren', burrow: 'Burrow', rarebit: 'Rarebit' }

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

// Where someone starts. Staff start in Warren, learners in their Burrow
// portfolio, employers with their apprentices.
export function homeFor(me) {
  const roles = me?.roles ?? []
  if (areasFor(me).warren) return '/app'
  if (roles.includes('LEARNER')) return '/burrow'
  if (roles.includes('EMPLOYER')) return '/burrow/apprentices'
  return '/'
}

// Addresses the shell moves to without reloading: the areas and the
// landing page. Anything else (like /api file links) is a normal link.
export function isShellPath(pathname) {
  return pathname === '/' || areaOf(pathname) !== 'rarebit'
}
