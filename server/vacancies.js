// Vacancies (vacancies build step 3): apprenticeship adverts from Find an
// apprenticeship, NHS Jobs and Civil Service Jobs, imported by
// scripts/import-vacancies.js into EXT.VACANCY.
//
//   GET  /api/vacancies?postcode=&miles=&larsCode=&route=&level=&source=&q=&page=
//                                       search open adverts (staff)
//   GET  /api/vacancies/filters         the choices for the search (staff)
//   GET  /api/vacancies/:ref            one advert, with the organisation's
//                                       links (staff); suggestions and
//                                       decisions too (managers)
//   POST /api/vacancies/:ref/decisions  confirm or reject a link to one of
//                                       the organisation's employers (managers)
//
// Adverts are public and the same for every organisation, so all staff see
// all of them. Which of them are your employers' is your organisation's own
// record (ILR.EMPLOYER_VACANCY), read only through ORG_EMPLOYER_VACANCY: a
// manager confirms every link, nothing is linked automatically. Warren only
// suggests: an open advert whose employer name matches one of your
// employers (its own name or its registered name), and the site whose
// postcode matches the advert's. Advert text is plain text (the import made
// it so) and pages show it only as text.

import { execute } from './db.js'
import {
  allow, CURRENT_ISTESTDATA, CURRENT_ORGANISATIONID, MANAGER, ORG_EMPLOYER, ORG_EMPLOYER_SITE, ORG_EMPLOYER_VACANCY, STAFF,
} from './access.js'
import { RequestError, sendError } from './burrow.js'
import { normalisePostcode } from '../src/validation.js'

// Open: not past its closing date, and the last complete import still
// returned it.
const OPEN = (v) => `(${v}.CLOSINGDATE > current_timestamp() and ${v}.GONEAT is null)`
export const PAGE_SIZE = 50
export const DEFAULT_MILES = 10
const KM_PER_MILE = 1.609344

// A name as compared for suggestions: lower case, letters and digits only,
// without words like Ltd, Limited, PLC and The. normName does the same in
// JavaScript (for tests).
const SUFFIXES = 'ltd|limited|plc|llp|the|co|company|uk|group'
const normSql = (x) => `trim(regexp_replace(regexp_replace(regexp_replace(' ' || regexp_replace(lower(coalesce(${x}, '')), '[^a-z0-9]+', ' ') || ' ',
  ' (${SUFFIXES}) ', ' '), ' (${SUFFIXES}) ', ' '), ' +', ' '))`
export function normName(name) {
  let t = ` ${String(name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `
  const words = new RegExp(` (${SUFFIXES}) `, 'g')
  t = t.replace(words, ' ').replace(words, ' ')
  return t.replace(/ +/g, ' ').trim()
}

const POSTCODE = `select LATITUDE, LONGITUDE from REF.POSTCODE where POSTCODE = ?`
// Binds, in order: lat, lat, lon (distance); larsCode x2, route x2, level
// x2, source x2, q x3 (filters); lat x2, lon, miles (radius); offset.
const SEARCH = `
  select v.VACANCYREFERENCE, v.SOURCE, v.TITLE, v.EMPLOYERNAME, v.COURSETITLE, v.LARSCODE, v.COURSELEVEL, v.ROUTE,
    v.APPRENTICESHIPLEVEL, v.POSTCODE, v.WAGETEXT, v.HOURSPERWEEK, v.ISNATIONALVACANCY,
    to_varchar(v.CLOSINGDATE, 'YYYY-MM-DD') as CLOSINGDATE, to_varchar(v.STARTDATE, 'YYYY-MM-DD') as STARTDATE,
    iff(?::float is null or v.LATITUDE is null, null, haversine(?::float, ?::float, v.LATITUDE, v.LONGITUDE) / ${KM_PER_MILE}) as MILES,
    count(*) over () as TOTAL
  from EXT.VACANCY v
  where ${OPEN('v')}
    and (?::number is null or v.LARSCODE = ?)
    and (?::string is null or v.ROUTE = ?)
    and (?::number is null or v.COURSELEVEL = ?)
    and (?::string is null or v.SOURCE = ?)
    and (?::string is null or v.TITLE ilike '%' || ? || '%' or v.EMPLOYERNAME ilike '%' || ? || '%')
    and (?::float is null or v.ISNATIONALVACANCY
      or (v.LATITUDE is not null and haversine(?::float, ?::float, v.LATITUDE, v.LONGITUDE) <= ?::float * ${KM_PER_MILE}))
  order by MILES nulls last, v.CLOSINGDATE, v.TITLE, v.VACANCYREFERENCE
  limit ${PAGE_SIZE} offset ?
`
const FILTERS = {
  standards: `select LARSCODE, any_value(COURSETITLE) as TITLE, count(*) as N from EXT.VACANCY v where ${OPEN('v')} and LARSCODE is not null group by LARSCODE order by TITLE`,
  routes: `select ROUTE, count(*) as N from EXT.VACANCY v where ${OPEN('v')} and ROUTE is not null group by ROUTE order by ROUTE`,
  levels: `select COURSELEVEL as LEVEL, count(*) as N from EXT.VACANCY v where ${OPEN('v')} and COURSELEVEL is not null group by COURSELEVEL order by COURSELEVEL`,
  sources: `select SOURCE, count(*) as N from EXT.VACANCY v where ${OPEN('v')} group by SOURCE order by SOURCE`,
  lastImport: `select to_varchar(max(FINISHEDAT), 'YYYY-MM-DD"T"HH24:MI:SSTZH:TZM') as AT from EXT.VACANCY_IMPORT_RUN where COMPLETE`,
}

const text = (x) => String(x ?? '').trim()
const fieldError = (status, field, message) => new RequestError('Please fix the highlighted fields.', status, { [field]: message })

// Searches open adverts. query: postcode and miles (nearest first, within
// that distance; national adverts too), larsCode, route, level, source, q
// (title or employer), page (from 1). Returns { results, total, page,
// pageSize, from: { postcode, miles } | null }.
export async function searchVacancies(connection, query) {
  let point = null
  const postcode = text(query.postcode) ? normalisePostcode(query.postcode) : null
  if (postcode) {
    const [p] = await execute(connection, POSTCODE, [postcode])
    if (!p || p.LATITUDE === null) throw fieldError(400, 'postcode', `${postcode} isn't on the ONS postcode list.`)
    point = { lat: Number(p.LATITUDE), lon: Number(p.LONGITUDE) }
  }
  const miles = point ? Math.min(Math.max(Number(query.miles) || DEFAULT_MILES, 1), 200) : null
  const num = (x) => (text(x) && Number.isFinite(Number(x)) ? Number(x) : null)
  const larsCode = num(query.larsCode)
  const level = num(query.level)
  const route = text(query.route) || null
  const source = ['FAA', 'NHS', 'CSJ'].includes(text(query.source)) ? text(query.source) : null
  const q = text(query.q).slice(0, 100) || null
  const page = Math.max(1, Math.floor(num(query.page) ?? 1))
  const lat = point?.lat ?? null
  const lon = point?.lon ?? null
  const rows = await execute(connection, SEARCH, [
    lat, lat, lon,
    larsCode, larsCode, route, route, level, level, source, source, q, q, q,
    miles, lat, lon, miles,
    (page - 1) * PAGE_SIZE,
  ])
  return {
    results: rows.map(({ TOTAL, MILES, ...r }) => ({ ...r, MILES: MILES === null ? null : Math.round(Number(MILES) * 10) / 10 })),
    total: Number(rows[0]?.TOTAL ?? 0),
    page,
    pageSize: PAGE_SIZE,
    from: point ? { postcode, miles } : null,
  }
}

export async function vacancyFilters(connection) {
  const out = {}
  for (const [name, sql] of Object.entries(FILTERS)) out[name] = await execute(connection, sql)
  out.lastImport = out.lastImport[0]?.AT ?? null
  return out
}

const ONE = `
  select v.*, ${OPEN('v')} as ISOPEN,
    to_varchar(v.CLOSINGDATE, 'YYYY-MM-DD') as CLOSINGDAY, to_varchar(v.STARTDATE, 'YYYY-MM-DD') as STARTDAY,
    to_varchar(v.POSTEDDATE, 'YYYY-MM-DD') as POSTEDDAY
  from EXT.VACANCY v where v.VACANCYREFERENCE = ?
`
// This organisation's decisions about one advert.
const DECISIONS = `
  select l.EMPLOYERID, e.NAME as EMPLOYERNAME, e.ISACTIVE, l.SITEID, s.NAME as SITENAME, l.DECISION,
    to_varchar(l.DECIDEDAT, 'YYYY-MM-DD') as DECIDEDON
  from ${ORG_EMPLOYER_VACANCY} l
  join ${ORG_EMPLOYER} e on e.EMPLOYERID = l.EMPLOYERID
  left join ${ORG_EMPLOYER_SITE} s on s.SITEID = l.SITEID
  where l.VACANCYREFERENCE = ?
  order by l.DECISION, e.NAME
`
// Employers in use whose name matches the advert's employer, not yet
// decided for this advert, with a site whose postcode is one of the
// advert's addresses. Binds: addresses JSON, employer name x2, reference.
const SUGGEST_FOR_ADVERT = `
  select e.EMPLOYERID, e.NAME as EMPLOYERNAME, s.SITEID, s.NAME as SITENAME
  from ${ORG_EMPLOYER} e
  left join ${ORG_EMPLOYER_SITE} s
    on s.EMPLOYERID = e.EMPLOYERID and s.ISACTIVE
   and s.POSTCODE in (select a.value:postcode::string from table(flatten(input => parse_json(?))) a)
  where e.ISACTIVE
    and ${normSql('?')} <> ''
    and ${normSql('?')} in (${normSql('e.NAME')}, ${normSql('e.COMPANYDETAILS:COMPANYNAME::string')})
    and e.EMPLOYERID not in (select EMPLOYERID from ${ORG_EMPLOYER_VACANCY} where VACANCYREFERENCE = ?)
  order by e.NAME, s.NAME
`
// For a manager linking by hand: the employers in use and their sites.
const EMPLOYER_CHOICES = `select EMPLOYERID, NAME from ${ORG_EMPLOYER} where ISACTIVE order by NAME`
const SITE_CHOICES = `select SITEID, EMPLOYERID, NAME, POSTCODE from ${ORG_EMPLOYER_SITE} where ISACTIVE order by NAME`

// One advert. All staff get the advert and which of your employers (still
// in use) it's confirmed for; managers also get suggestions, every decision (rejected
// too) and the employers and sites to link it to by hand.
export async function loadVacancy(connection, ref, user) {
  const [advert] = await execute(connection, ONE, [ref])
  if (!advert) throw new RequestError(`There's no advert ${ref}.`, 404)
  const decisions = await execute(connection, DECISIONS, [ref])
  // Links: confirmed, to employers still in use.
  const out = { advert, links: decisions.filter((d) => d.DECISION === 'confirmed' && d.ISACTIVE) }
  if (!user.roles.includes(MANAGER)) return out
  const addresses = JSON.stringify(typeof advert.ADDRESSES === 'string' ? JSON.parse(advert.ADDRESSES) : advert.ADDRESSES ?? [])
  const rows = advert.ISOPEN ? await execute(connection, SUGGEST_FOR_ADVERT, [addresses, advert.EMPLOYERNAME, advert.EMPLOYERNAME, ref]) : []
  // One suggestion per employer: its matching site, if any.
  const suggestions = [...new Map(rows.map((r) => [r.EMPLOYERID, r])).values()]
  return {
    ...out,
    decisions,
    suggestions,
    employers: await execute(connection, EMPLOYER_CHOICES),
    sites: await execute(connection, SITE_CHOICES),
  }
}

const ADVERT_EXISTS = `select VACANCYREFERENCE from EXT.VACANCY where VACANCYREFERENCE = ?`
const EMPLOYER_IN_USE = `select EMPLOYERID from ${ORG_EMPLOYER} where EMPLOYERID = ? and ISACTIVE`
const SITE_OF = `select SITEID from ${ORG_EMPLOYER_SITE} where SITEID = ? and EMPLOYERID = ? and ISACTIVE`
const DECIDE = `
  merge into ILR.EMPLOYER_VACANCY t
  using (select ${CURRENT_ORGANISATIONID} as ORGANISATIONID, ? as VACANCYREFERENCE, ? as EMPLOYERID, ? as SITEID,
    ? as DECISION, ? as DECIDEDBY, ${CURRENT_ISTESTDATA} as ISTESTDATA) s
  on t.ORGANISATIONID = s.ORGANISATIONID and t.VACANCYREFERENCE = s.VACANCYREFERENCE and t.EMPLOYERID = s.EMPLOYERID
  when matched then update set SITEID = s.SITEID, DECISION = s.DECISION, DECIDEDAT = current_timestamp(), DECIDEDBY = s.DECIDEDBY
  when not matched then insert (ORGANISATIONID, VACANCYREFERENCE, EMPLOYERID, SITEID, DECISION, DECIDEDBY, ISTESTDATA)
    values (s.ORGANISATIONID, s.VACANCYREFERENCE, s.EMPLOYERID, s.SITEID, s.DECISION, s.DECIDEDBY, s.ISTESTDATA)
`

// A manager's decision: this advert is (confirmed) or isn't (rejected) one
// of the organisation's employers', optionally at one of its sites. Changing
// a decision overwrites it.
export async function decideVacancy(connection, ref, body, by) {
  const decision = text(body.decision)
  if (decision !== 'confirmed' && decision !== 'rejected') throw fieldError(400, 'decision', 'Choose confirm or reject.')
  if ((await execute(connection, ADVERT_EXISTS, [ref])).length === 0) throw new RequestError(`There's no advert ${ref}.`, 404)
  const employerId = text(body.employerId)
  if (!employerId || (await execute(connection, EMPLOYER_IN_USE, [employerId])).length === 0) {
    throw fieldError(400, 'employerId', 'Choose one of your employers still in use.')
  }
  const siteId = decision === 'confirmed' ? text(body.siteId) || null : null
  if (siteId && (await execute(connection, SITE_OF, [siteId, employerId])).length === 0) {
    throw fieldError(400, 'siteId', 'Choose one of this employer\'s sites still in use.')
  }
  await execute(connection, DECIDE, [ref, employerId, siteId, decision, by])
}

// For an employer's page: its confirmed open adverts (staff), and for
// managers the open adverts suggested for it.
const EMPLOYER_LINKED = `
  select v.VACANCYREFERENCE, v.SOURCE, v.TITLE, v.COURSETITLE, to_varchar(v.CLOSINGDATE, 'YYYY-MM-DD') as CLOSINGDATE,
    l.SITEID, s.NAME as SITENAME
  from ${ORG_EMPLOYER_VACANCY} l
  join EXT.VACANCY v on v.VACANCYREFERENCE = l.VACANCYREFERENCE
  left join ${ORG_EMPLOYER_SITE} s on s.SITEID = l.SITEID
  where l.EMPLOYERID = ? and l.DECISION = 'confirmed' and ${OPEN('v')}
  order by v.CLOSINGDATE, v.TITLE
`
const EMPLOYER_SUGGESTED = `
  select v.VACANCYREFERENCE, v.SOURCE, v.TITLE, v.EMPLOYERNAME, v.POSTCODE, to_varchar(v.CLOSINGDATE, 'YYYY-MM-DD') as CLOSINGDATE,
    s.SITEID, s.NAME as SITENAME
  from EXT.VACANCY v
  join ${ORG_EMPLOYER} e on e.EMPLOYERID = ? and e.ISACTIVE
  left join ${ORG_EMPLOYER_SITE} s on s.EMPLOYERID = e.EMPLOYERID and s.ISACTIVE and s.POSTCODE = v.POSTCODE
  where ${OPEN('v')}
    and ${normSql('v.EMPLOYERNAME')} <> ''
    and ${normSql('v.EMPLOYERNAME')} in (${normSql('e.NAME')}, ${normSql('e.COMPANYDETAILS:COMPANYNAME::string')})
    and v.VACANCYREFERENCE not in (select VACANCYREFERENCE from ${ORG_EMPLOYER_VACANCY} where EMPLOYERID = ?)
  order by v.CLOSINGDATE, v.TITLE
  limit 50
`
export async function employerVacancies(connection, employerId, user) {
  const linked = await execute(connection, EMPLOYER_LINKED, [employerId])
  if (!user.roles.includes(MANAGER)) return { vacancies: linked }
  return { vacancies: linked, vacancySuggestions: await execute(connection, EMPLOYER_SUGGESTED, [employerId, employerId]) }
}

export function registerVacancyRoutes(app) {
  app.get('/api/vacancies', allow(STAFF), async (req, res) => {
    try {
      res.json(await searchVacancies(req.db, req.query))
    } catch (err) {
      sendError(res, err, 'Could not search the vacancies')
    }
  })

  app.get('/api/vacancies/filters', allow(STAFF), async (req, res) => {
    try {
      res.json(await vacancyFilters(req.db))
    } catch (err) {
      sendError(res, err, 'Could not load the vacancy filters')
    }
  })

  app.get('/api/vacancies/:ref', allow(STAFF), async (req, res) => {
    try {
      res.json(await loadVacancy(req.db, req.params.ref, req.user))
    } catch (err) {
      sendError(res, err, 'Could not load the advert')
    }
  })

  app.post('/api/vacancies/:ref/decisions', allow(MANAGER), async (req, res) => {
    try {
      await decideVacancy(req.db, req.params.ref, req.body ?? {}, req.user.USERID)
      res.json({ saved: true })
    } catch (err) {
      sendError(res, err, 'Could not save the decision')
    }
  })
}
