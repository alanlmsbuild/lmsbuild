// Employers (employers via Companies House, build step 3).
//
//   GET   /api/employers                  the organisation's employers (staff)
//   GET   /api/employers/:id              one employer (staff). For a manager,
//                                         refreshes it from Companies House
//                                         first if this organisation last
//                                         checked it over a day ago
//   POST  /api/employers                  add one (managers)
//   PATCH /api/employers/:id              change one (managers)
//   POST  /api/employers/:id/refresh      refresh it now (managers)
//
// An employer is a company on Companies House (its name comes from there) or
// says why it isn't. What's shown is this organisation's own copy of the
// company's details (COMPANYDETAILS), taken from the live profile when it
// added or refreshed the employer, never the shared EXT tables: nothing a
// manager sees, nor how long it takes, depends on whether another
// organisation has the same company. The registered office is managers only
// (ORG_EMPLOYER removes it for everyone else). The Employers list never
// calls Companies House. Employers are never deleted: ISACTIVE goes FALSE.

import crypto from 'node:crypto'
import { execute } from './db.js'
import { allow, CURRENT_ISTESTDATA, CURRENT_ORGANISATIONID, MANAGER, ORG_EMPLOYER, STAFF } from './access.js'
import { inTransaction, RequestError, sendError } from './burrow.js'
import { CLOSED, companyColumns, fetchProfile, writeCompany } from './companiesHouse.js'
import { companyNumberOf, validateEmployerForm } from '../src/validation.js'
import { loadSitesAndContacts } from './employerSites.js'

// A manager opening an employer refreshes it when this organisation last
// checked it longer ago than this.
export const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000

const LIST = `
  select EMPLOYERID, NAME, EMPLOYERREF, COMPANYNUMBER, NOTONCOMPANIESHOUSE, ISACTIVE,
    COMPANYDETAILS:COMPANYSTATUS::string as COMPANYSTATUS, COMPANYCHECKEDAT,
    COMPANYDETAILS:ACCOUNTSOVERDUE::boolean as ACCOUNTSOVERDUE, COMPANYDETAILS:CONFIRMATIONOVERDUE::boolean as CONFIRMATIONOVERDUE,
    COMPANYDETAILS:OFFICEUNDELIVERABLE::boolean as OFFICEUNDELIVERABLE, COMPANYDETAILS:OFFICEINDISPUTE::boolean as OFFICEINDISPUTE
  from ${ORG_EMPLOYER}
  order by ISACTIVE desc, NAME, EMPLOYERID
`
const ONE = `
  select EMPLOYERID, NAME, EMPLOYERREF, COMPANYNUMBER, NOTONCOMPANIESHOUSE, ISACTIVE,
    COMPANYDETAILS, COMPANYCHECKEDAT, CREATEDAT, UPDATEDAT
  from ${ORG_EMPLOYER}
  where EMPLOYERID = ?
`
const SIC = `
  select SIC2007, DESCRIPTION from REF.SIC2007
  where SIC2007 in (select value::string from table(flatten(input => parse_json(?))))
`
// Another of this organisation's employers with the same company or the
// same employer reference.
const SAME_COMPANY = `select NAME from ${ORG_EMPLOYER} where COMPANYNUMBER = ? and EMPLOYERID <> ?`
const SAME_REF = `select NAME from ${ORG_EMPLOYER} where EMPLOYERREF = ? and EMPLOYERREF <> 999999999 and EMPLOYERID <> ?`

const INSERT = `
  insert into ILR.EMPLOYER (EMPLOYERID, ORGANISATIONID, NAME, EMPLOYERREF, COMPANYNUMBER, NOTONCOMPANIESHOUSE,
    ISACTIVE, COMPANYDETAILS, COMPANYCHECKEDAT, COMPANYRESPONSEID, CREATEDBY, ISTESTDATA)
  select ?, ${CURRENT_ORGANISATIONID}, ?, ?, ?, ?,
    true, parse_json(?), iff(?, current_timestamp(), null), ?, ?, ${CURRENT_ISTESTDATA}
`
const UPDATE = `
  update ILR.EMPLOYER set NAME = ?, EMPLOYERREF = ?, COMPANYNUMBER = ?, NOTONCOMPANIESHOUSE = ?, ISACTIVE = ?,
    UPDATEDAT = current_timestamp(), UPDATEDBY = ?
  where EMPLOYERID = ? and EMPLOYERID in (select EMPLOYERID from ${ORG_EMPLOYER})
`
// This organisation's copy of the company's details, from a live profile
// (or cleared, for an employer no longer on Companies House).
const SET_COPY = `
  update ILR.EMPLOYER set NAME = coalesce(?, NAME), COMPANYDETAILS = parse_json(?),
    COMPANYCHECKEDAT = iff(?, current_timestamp(), null), COMPANYRESPONSEID = ?
  where EMPLOYERID = ? and EMPLOYERID in (select EMPLOYERID from ${ORG_EMPLOYER})
`
const CHECKED = `
  update ILR.EMPLOYER set COMPANYCHECKEDAT = current_timestamp()
  where EMPLOYERID = ? and EMPLOYERID in (select EMPLOYERID from ${ORG_EMPLOYER})
`

const fieldError = (status, field, message) => new RequestError('Please fix the highlighted fields.', status, { [field]: message })

// A company for one of this organisation's employers, fetched live: refused
// if another of its employers already has it (this organisation's own
// records only), if Companies House has no such company, or if it's closed.
async function liveCompany(connection, number, employerId, by) {
  const [same] = await execute(connection, SAME_COMPANY, [number, employerId ?? ''])
  if (same) throw fieldError(409, 'companyNumber', `${same.NAME} is already an employer with company number ${number}.`)
  const fetched = await fetchProfile(connection, number, by)
  if (!fetched.profile) throw fieldError(404, 'companyNumber', `Companies House has no company ${number}.`)
  if (CLOSED.has(fetched.profile.company_status)) {
    throw fieldError(400, 'companyNumber', `${fetched.profile.company_name} is ${fetched.profile.company_status} on Companies House, so it can't be added as an employer.`)
  }
  return { cols: companyColumns(fetched.profile, fetched.etag), responseId: fetched.responseId }
}

// Saves a live company to the shared EXT tables and to the employer's own
// copy. Run inside a transaction, after the employer row exists.
async function saveCopy(connection, employerId, live) {
  await writeCompany(connection, live.cols, live.responseId)
  await execute(connection, SET_COPY, [live.cols.COMPANYNAME, JSON.stringify(live.cols), true, live.responseId, employerId])
}

// Refreshes an employer's copy from Companies House. Returns a note for the
// page if it couldn't (the copy is kept as it was).
async function refreshEmployer(connection, row, by) {
  let fetched
  try {
    fetched = await fetchProfile(connection, row.COMPANYNUMBER, by)
  } catch (err) {
    if (err instanceof RequestError) return `Couldn't check Companies House just now: ${err.message}`
    throw err
  }
  if (!fetched.profile) {
    await execute(connection, CHECKED, [row.EMPLOYERID])
    return `Companies House no longer has company ${row.COMPANYNUMBER}. The details below are from when it was last found.`
  }
  const live = { cols: companyColumns(fetched.profile, fetched.etag), responseId: fetched.responseId }
  await inTransaction(connection, () => saveCopy(connection, row.EMPLOYERID, live))
  return null
}

export const isStale = (checkedAt, now = Date.now()) => !checkedAt || now - new Date(checkedAt).getTime() > REFRESH_AFTER_MS

// One employer, with its SIC codes' descriptions. A manager opening it
// refreshes it first if it's stale (or always, with refresh).
export async function loadEmployer(connection, employerId, user, { refresh = false } = {}) {
  let [row] = await execute(connection, ONE, [employerId])
  if (!row) throw new RequestError(`There's no employer ${employerId} in your organisation.`, 404)
  let note = null
  if (user.roles.includes(MANAGER) && row.COMPANYNUMBER && (refresh || isStale(row.COMPANYCHECKEDAT))) {
    note = await refreshEmployer(connection, row, user.USERID)
    ;[row] = await execute(connection, ONE, [employerId])
  }
  const details = typeof row.COMPANYDETAILS === 'string' ? JSON.parse(row.COMPANYDETAILS) : row.COMPANYDETAILS
  const codes = details?.SICCODES ?? []
  const described = codes.length > 0 ? await execute(connection, SIC, [JSON.stringify(codes)]) : []
  const sic = codes.map((code) => ({ code, description: described.find((d) => d.SIC2007 === code)?.DESCRIPTION ?? null }))
  return { employer: { ...row, COMPANYDETAILS: details ?? null }, sic, note, ...(await loadSitesAndContacts(connection, employerId)) }
}

// The form, checked, with the employer reference as a number (or null).
async function checkedForm(connection, body, employerId) {
  const errors = validateEmployerForm(body)
  if (Object.keys(errors).length > 0) throw new RequestError('Please fix the highlighted fields.', 400, errors)
  const text = (x) => String(x ?? '').trim()
  const employerRef = text(body.employerRef) ? Number(text(body.employerRef)) : null
  if (employerRef !== null) {
    const [same] = await execute(connection, SAME_REF, [employerRef, employerId ?? ''])
    if (same) throw fieldError(409, 'employerRef', `${same.NAME} already has employer reference ${employerRef}.`)
  }
  const companyNumber = text(body.companyNumber) ? companyNumberOf(body.companyNumber) : null
  return { companyNumber, employerRef, name: text(body.name), notOnCompaniesHouse: companyNumber ? null : text(body.notOnCompaniesHouse) }
}

const newEmployerId = () => `EMP-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`

// Adds an employer. On Companies House: from the live profile, fetched now.
export async function addEmployer(connection, body, by) {
  const form = await checkedForm(connection, body, null)
  const employerId = newEmployerId()
  const live = form.companyNumber ? await liveCompany(connection, form.companyNumber, null, by) : null
  await inTransaction(connection, async () => {
    await execute(connection, INSERT, [
      employerId, live ? live.cols.COMPANYNAME : form.name, form.employerRef, form.companyNumber, form.notOnCompaniesHouse,
      live ? JSON.stringify(live.cols) : null, Boolean(live), live?.responseId ?? null, by,
    ])
    if (live) await writeCompany(connection, live.cols, live.responseId)
  })
  return employerId
}

// Changes an employer: its employer reference, whether it's still in use,
// and its company (a new company number is fetched live) or, off Companies
// House, its name and why.
export async function changeEmployer(connection, employerId, body, by) {
  const [row] = await execute(connection, ONE, [employerId])
  if (!row) throw new RequestError(`There's no employer ${employerId} in your organisation.`, 404)
  const form = await checkedForm(connection, body, employerId)
  const isActive = body.isActive !== false
  const newCompany = form.companyNumber && form.companyNumber !== row.COMPANYNUMBER
  const live = newCompany ? await liveCompany(connection, form.companyNumber, employerId, by) : null
  const name = form.companyNumber ? (live ? live.cols.COMPANYNAME : row.NAME) : form.name
  await inTransaction(connection, async () => {
    await execute(connection, UPDATE, [name, form.employerRef, form.companyNumber, form.notOnCompaniesHouse, isActive, by, employerId])
    if (live) await saveCopy(connection, employerId, live)
    else if (!form.companyNumber && row.COMPANYNUMBER) await execute(connection, SET_COPY, [null, null, false, null, employerId])
  })
}

export function registerEmployerListRoutes(app) {
  app.get('/api/employers', allow(STAFF), async (req, res) => {
    try {
      res.json({ employers: await execute(req.db, LIST) })
    } catch (err) {
      sendError(res, err, 'Could not load the employers')
    }
  })

  app.get('/api/employers/:employerId', allow(STAFF), async (req, res) => {
    try {
      res.json(await loadEmployer(req.db, req.params.employerId, req.user))
    } catch (err) {
      sendError(res, err, 'Could not load the employer')
    }
  })

  app.post('/api/employers', allow(MANAGER), async (req, res) => {
    try {
      res.status(201).json({ employerId: await addEmployer(req.db, req.body ?? {}, req.user.USERID) })
    } catch (err) {
      sendError(res, err, 'Could not add the employer')
    }
  })

  app.patch('/api/employers/:employerId', allow(MANAGER), async (req, res) => {
    try {
      await changeEmployer(req.db, req.params.employerId, req.body ?? {}, req.user.USERID)
      res.json({ saved: true })
    } catch (err) {
      sendError(res, err, 'Could not save the employer')
    }
  })

  app.post('/api/employers/:employerId/refresh', allow(MANAGER), async (req, res) => {
    try {
      res.json(await loadEmployer(req.db, req.params.employerId, req.user, { refresh: true }))
    } catch (err) {
      sendError(res, err, 'Could not refresh the employer')
    }
  })
}
