// Companies House (employers, build step 2): searching for companies and
// fetching their profiles, managers only.
//
//   GET /api/companies-house/search?q=     by name, or an exact company number
//   GET /api/companies-house/company/:n    one company's profile, to confirm
//
// Every profile fetched is stored as returned in RAW.CH_COMPANY_PROFILE
// (bronze, add-only: the app can only INSERT there), and saveProfile()
// writes the cleaned details to EXT.COMPANY (silver) with MERGE, and any
// changes to EXT.COMPANY_CHANGE. Name searches go live to Companies House
// and aren't stored. EXT is shared across organisations, so nothing a page
// shows comes from it, and saving takes the same steps whether or not
// another organisation has the company: managers see the live profile, and
// each employer keeps its own copy (sql/employers_02_own_copy.sql).
//
// The key (COMPANIES_HOUSE_API_KEY in server/.env) is used only here, on the
// server, and never logged or sent to the browser.

import crypto from 'node:crypto'
import { execute } from './db.js'
import { allow, MANAGER } from './access.js'
import { inTransaction, RequestError, sendError } from './burrow.js'
import { companyNumberOf } from '../src/validation.js'

export { companyNumberOf }

const API = 'https://api.company-information.service.gov.uk'

// Companies House allows 600 requests in five minutes per application. This
// counter keeps Warren under 500, shared by searches and refreshes. It's per
// server process (docs/before-real-data.md).
export const LIMIT = 500
const WINDOW_MS = 5 * 60 * 1000
export function makeLimiter(limit = LIMIT, windowMs = WINDOW_MS, now = () => Date.now()) {
  const times = []
  return () => {
    const t = now()
    while (times.length > 0 && times[0] <= t - windowMs) times.shift()
    if (times.length >= limit) return false
    times.push(t)
    return true
  }
}
const takeRequest = makeLimiter()

const BUSY = 'Companies House is busy just now. Please try again in a few minutes.'

// One request to Companies House: { status, etag, body }. Throws a
// RequestError the page can show when it can't be reached or is busy.
async function call(path) {
  const key = process.env.COMPANIES_HOUSE_API_KEY
  if (!key) throw new RequestError("Companies House isn't set up: COMPANIES_HOUSE_API_KEY is missing from server/.env.", 503)
  if (!takeRequest()) throw new RequestError(BUSY, 429)
  let res
  try {
    res = await fetch(API + path, {
      headers: { Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    throw new RequestError("Couldn't reach Companies House. Please try again.", 502)
  }
  if (res.status === 429) throw new RequestError(BUSY, 429)
  if (res.status === 401) throw new RequestError('Companies House refused the API key.', 502)
  const body = await res.json().catch(() => null)
  return { status: res.status, etag: res.headers.get('etag') ?? body?.etag ?? null, body }
}

// Companies that can't become an employer.
export const CLOSED = new Set(['dissolved', 'closed', 'converted-closed', 'removed'])

// Searching: an exact company number fetches that company; anything else
// searches by name (live, not stored). Results: [{ companyNumber, name,
// status, type, address, dateOfCreation, canChoose }].
export async function searchCompanies(connection, text, by) {
  const q = String(text ?? '').trim()
  if (q.length < 2) throw new RequestError('Please fix the highlighted fields.', 400, { q: 'Enter at least 2 characters of a name, or a company number.' })
  const number = companyNumberOf(q)
  if (number) {
    const found = await fetchProfile(connection, number, by)
    if (!found.profile) return []
    const p = found.profile
    return [{
      companyNumber: p.company_number, name: p.company_name, status: p.company_status ?? null, type: p.type ?? null,
      address: addressText(p.registered_office_address), dateOfCreation: p.date_of_creation ?? null,
      canChoose: !CLOSED.has(p.company_status),
    }]
  }
  const { status, body } = await call(`/search/companies?q=${encodeURIComponent(q)}&items_per_page=20`)
  if (status !== 200) throw new RequestError("Companies House couldn't search just now. Please try again.", 502)
  return (body?.items ?? []).map((i) => ({
    companyNumber: i.company_number, name: i.title, status: i.company_status ?? null, type: i.company_type ?? null,
    address: i.address_snippet ?? null, dateOfCreation: i.date_of_creation ?? null, canChoose: !CLOSED.has(i.company_status),
  }))
}

export const addressText = (a) => (a ? [a.care_of, a.po_box, a.premises, a.address_line_1, a.address_line_2, a.locality, a.region, a.postal_code, a.country].filter(Boolean).join(', ') : null)

// RAW is add-only for the app: the response ID is made here, so EXT can
// record where its details came from without reading RAW.
const RAW_INSERT = `
  insert into RAW.CH_COMPANY_PROFILE (RESPONSEID, COMPANYNUMBER, ENDPOINT, HTTPSTATUS, ETAG, BODY, FETCHEDBY)
  select ?, ?, ?, ?, ?, parse_json(?), ?
`

// Fetches one company's profile and stores the response in RAW: { responseId,
// status, etag, profile } (profile null if Companies House has no such company).
export async function fetchProfile(connection, number, by) {
  const endpoint = `/company/${encodeURIComponent(number)}`
  const { status, etag, body } = await call(endpoint)
  const responseId = crypto.randomUUID()
  await execute(connection, RAW_INSERT, [responseId, number, endpoint, status, etag, JSON.stringify(body ?? null), by])
  if (status === 404) return { responseId, status, etag, profile: null }
  if (status !== 200 || !body?.company_number) throw new RequestError("Companies House couldn't return this company just now. Please try again.", 502)
  return { responseId, status, etag, profile: body }
}

// The EXT.COMPANY columns from a profile.
export function companyColumns(p, etag) {
  const a = p.registered_office_address ?? {}
  const text = (v, n) => (v === undefined || v === null || v === '' ? null : String(v).slice(0, n))
  return {
    COMPANYNUMBER: p.company_number,
    COMPANYNAME: text(p.company_name, 160),
    PREVIOUSNAMES: p.previous_company_names ?? null,
    COMPANYSTATUS: text(p.company_status, 40),
    COMPANYSTATUSDETAIL: text(p.company_status_detail, 60),
    COMPANYTYPE: text(p.type, 60),
    COMPANYSUBTYPE: text(p.subtype, 60),
    JURISDICTION: text(p.jurisdiction, 30),
    DATEOFCREATION: p.date_of_creation ?? null,
    DATEOFCESSATION: p.date_of_cessation ?? null,
    ADDRESSPREMISES: text(a.premises, 100),
    ADDRESSLINE1: text(a.address_line_1, 100),
    ADDRESSLINE2: text(a.address_line_2, 100),
    ADDRESSLOCALITY: text(a.locality, 100),
    ADDRESSREGION: text(a.region, 100),
    ADDRESSPOSTCODE: text(a.postal_code, 10),
    ADDRESSCOUNTRY: text(a.country, 50),
    ADDRESSPOBOX: text(a.po_box, 20),
    ADDRESSCAREOF: text(a.care_of, 100),
    OFFICEINDISPUTE: p.registered_office_is_in_dispute ?? null,
    OFFICEUNDELIVERABLE: p.undeliverable_registered_office_address ?? null,
    SICCODES: p.sic_codes ?? [],
    ACCOUNTSNEXTDUE: p.accounts?.next_accounts?.due_on ?? p.accounts?.next_due ?? null,
    ACCOUNTSOVERDUE: p.accounts?.next_accounts?.overdue ?? p.accounts?.overdue ?? null,
    CONFIRMATIONNEXTDUE: p.confirmation_statement?.next_due ?? null,
    CONFIRMATIONOVERDUE: p.confirmation_statement?.overdue ?? null,
    HASINSOLVENCYHISTORY: p.has_insolvency_history ?? Boolean(p.links?.insolvency),
    ETAG: text(etag ?? p.etag, 100),
  }
}

// Columns whose changes go to EXT.COMPANY_CHANGE (everything but the ETag).
const JSON_COLUMNS = new Set(['PREVIOUSNAMES', 'SICCODES'])
export const TRACKED = Object.keys(companyColumns({ company_number: 'X' })).filter((c) => c !== 'COMPANYNUMBER' && c !== 'ETAG')

// One text form for comparing old and new values: JSON with sorted keys,
// dates as YYYY-MM-DD, booleans as true/false.
function stableJson(v) {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`
  return JSON.stringify(v)
}
export function valueText(column, v) {
  if (v === null || v === undefined) return null
  if (JSON_COLUMNS.has(column)) {
    const parsed = typeof v === 'string' ? JSON.parse(v) : v
    return parsed === null || (Array.isArray(parsed) && parsed.length === 0) ? null : stableJson(parsed)
  }
  return String(v)
}

// The changes between the stored row (as text) and the new columns.
export function companyChanges(old, cols) {
  if (!old) return []
  return TRACKED
    .map((c) => ({ field: c, oldValue: valueText(c, old[c]), newValue: valueText(c, cols[c]) }))
    .filter((ch) => ch.oldValue !== ch.newValue)
}

// The stored row, every tracked column as text. One company by its number.
const STORED = `
  select ${TRACKED.map((c) => (JSON_COLUMNS.has(c) ? `to_json(${c}) as ${c}` : `to_varchar(${c}) as ${c}`)).join(', ')}
  from EXT.COMPANY where COMPANYNUMBER = ?
`
const date = (c) => `try_to_date(?) as ${c}`
const SOURCE = Object.keys(companyColumns({ company_number: 'X' })).map((c) => {
  if (c === 'PREVIOUSNAMES') return `parse_json(?) as ${c}`
  if (c === 'SICCODES') return `parse_json(?)::array as ${c}`
  if (c.startsWith('DATEOF') || c.endsWith('NEXTDUE')) return date(c)
  return `? as ${c}`
})
const ALL = Object.keys(companyColumns({ company_number: 'X' }))
const MERGE = `
  merge into EXT.COMPANY t
  using (select ${SOURCE.join(', ')}, ? as SOURCERESPONSEID, ? as CHANGED) s
  on t.COMPANYNUMBER = s.COMPANYNUMBER
  when matched then update set
    ${ALL.filter((c) => c !== 'COMPANYNUMBER').map((c) => `${c} = s.${c}`).join(', ')},
    LASTCHECKEDAT = current_timestamp(),
    LASTCHANGEDAT = iff(s.CHANGED, current_timestamp(), t.LASTCHANGEDAT),
    SOURCERESPONSEID = s.SOURCERESPONSEID
  when not matched then insert (${ALL.join(', ')}, LASTCHECKEDAT, LASTCHANGEDAT, SOURCERESPONSEID)
    values (${ALL.map((c) => `s.${c}`).join(', ')}, current_timestamp(), current_timestamp(), s.SOURCERESPONSEID)
`
// Always one statement, whatever changed (none is no rows), so a save takes
// the same time whether or not another organisation saved the company before.
const CHANGE_INSERT = `
  insert into EXT.COMPANY_CHANGE (COMPANYNUMBER, FIELDNAME, OLDVALUE, NEWVALUE, RESPONSEID)
  select ?, f.value:field::string, left(f.value:oldValue::string, 400), left(f.value:newValue::string, 400), ?
  from table(flatten(input => parse_json(?))) f
`

// Writes one company's columns to EXT.COMPANY (one row per company, by
// MERGE), recording what changed since anyone last saved it. Run inside a
// transaction. EXT is shared: the result depends on other organisations, so
// it's for tests and the nightly refresh, never for a page or a response.
export async function writeCompany(connection, cols, responseId) {
  const [old] = await execute(connection, STORED, [cols.COMPANYNUMBER])
  const changes = companyChanges(old, cols)
  await execute(connection, CHANGE_INSERT, [cols.COMPANYNUMBER, responseId, JSON.stringify(changes)])
  const binds = ALL.map((c) => (JSON_COLUMNS.has(c) ? JSON.stringify(cols[c]) : cols[c]))
  await execute(connection, MERGE, [...binds, responseId, changes.length > 0])
  return { created: !old, changes }
}

// Saves a profile just fetched live (fetchProfile) to EXT. Returns nothing:
// what's shown is always the live profile, never what EXT had.
export async function saveProfile(connection, fetched) {
  const cols = companyColumns(fetched.profile, fetched.etag)
  await inTransaction(connection, () => writeCompany(connection, cols, fetched.responseId))
}

// Managers only: searching, and one company's details to confirm before
// it's linked to an employer.
export function registerCompaniesHouseRoutes(app) {
  app.get('/api/companies-house/search', allow(MANAGER), async (req, res) => {
    try {
      res.json({ results: await searchCompanies(req.db, req.query.q, req.user.USERID) })
    } catch (err) {
      sendError(res, err, 'Could not search Companies House')
    }
  })

  app.get('/api/companies-house/company/:companyNumber', allow(MANAGER), async (req, res) => {
    try {
      const number = companyNumberOf(req.params.companyNumber)
      if (!number) throw new RequestError("That isn't a company number.", 400)
      const { profile, etag } = await fetchProfile(req.db, number, req.user.USERID)
      if (!profile) throw new RequestError(`Companies House has no company ${number}.`, 404)
      res.json({
        company: {
          ...companyColumns(profile, etag),
          address: addressText(profile.registered_office_address),
          canChoose: !CLOSED.has(profile.company_status),
        },
      })
    } catch (err) {
      sendError(res, err, 'Could not fetch the company from Companies House')
    }
  })
}
