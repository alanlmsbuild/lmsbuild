// What needs attention about an employer, for the Employers list and an
// employer's page: [{ tone, text }], most important first. Worked out from
// the employer and this organisation's own copy of its Companies House
// details only. An employer no longer used has none.
//
// employer: EMPLOYERREF, ISACTIVE, COMPANYNUMBER, NOTONCOMPANIESHOUSE,
// COMPANYCHECKEDAT and COMPANYDETAILS (or the list's COMPANYSTATUS,
// ACCOUNTSOVERDUE... columns). The registered office flags only show when
// the copy has them, which is for managers (server/access.js).

import { formatDate } from '../lookups.js'

// A copy not refreshed for this long is flagged: the nightly refresh or
// opening the employer should have refreshed it.
export const CHECK_OVERDUE_DAYS = 7

const STATUS_WORDS = {
  dissolved: 'dissolved',
  liquidation: 'in liquidation',
  receivership: 'in receivership',
  administration: 'in administration',
  'voluntary-arrangement': 'in a voluntary arrangement',
  'converted-closed': 'converted or closed',
  'insolvency-proceedings': 'in insolvency proceedings',
  removed: 'removed',
  closed: 'closed',
}
const OK_STATUSES = new Set(['active', 'registered', 'open'])

export function employerFlags(employer, now = Date.now()) {
  const e = employer ?? {}
  if (e.ISACTIVE === false) return []
  const d = e.COMPANYDETAILS ?? e
  const flags = []
  const status = d.COMPANYSTATUS
  if (e.COMPANYNUMBER && status && !OK_STATUSES.has(status)) {
    flags.push({ tone: 'overdue', text: `Companies House: ${STATUS_WORDS[status] ?? status.replace(/-/g, ' ')}` })
  }
  if (e.COMPANYNUMBER && d.ACCOUNTSOVERDUE === true) flags.push({ tone: 'due', text: 'Accounts overdue at Companies House' })
  if (e.COMPANYNUMBER && d.CONFIRMATIONOVERDUE === true) flags.push({ tone: 'due', text: 'Confirmation statement overdue' })
  if (e.COMPANYNUMBER && d.OFFICEUNDELIVERABLE === true) flags.push({ tone: 'due', text: 'Registered office undeliverable' })
  if (e.COMPANYNUMBER && d.OFFICEINDISPUTE === true) flags.push({ tone: 'due', text: 'Registered office in dispute' })
  if (e.EMPLOYERREF === null || e.EMPLOYERREF === undefined || e.EMPLOYERREF === '') {
    flags.push({ tone: 'due', text: 'Employer reference needed for the ILR' })
  }
  if (!e.COMPANYNUMBER && !e.NOTONCOMPANIESHOUSE) flags.push({ tone: 'neutral', text: 'Not linked to Companies House yet' })
  if (e.COMPANYNUMBER) {
    const checked = e.COMPANYCHECKEDAT ? new Date(e.COMPANYCHECKEDAT).getTime() : null
    if (!checked || now - checked > CHECK_OVERDUE_DAYS * 24 * 60 * 60 * 1000) {
      flags.push({ tone: 'neutral', text: checked ? `Not checked with Companies House since ${formatDate(e.COMPANYCHECKEDAT)}` : 'Never checked with Companies House' })
    }
  }
  return flags
}
