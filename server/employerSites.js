// Employer sites and contacts (employers build step 5).
//
//   POST  /api/employers/:id/sites                add a site (managers)
//   PATCH /api/employers/:id/sites/:siteId        change one (managers)
//   GET   /api/employers/:id/sites/:siteId        a site and its apprentices (staff)
//   POST  /api/employers/:id/contacts             add a contact (managers)
//   PATCH /api/employers/:id/contacts/:contactId  change one (managers)
//
// An employer's page (GET /api/employers/:id, server/employers.js) lists its
// sites and contacts with loadSitesAndContacts below. All staff see sites
// and contacts; managers change them. Sites and contacts are never deleted:
// ISACTIVE or ISCURRENT goes FALSE. A contact's Burrow sign-in (USERID) and
// which sites a Burrow user sees (their site assignments) are set by hand-run
// SQL for now (docs/before-real-data.md), so they're shown, not changed.

import crypto from 'node:crypto'
import { execute } from './db.js'
import {
  allow, CURRENT_ISTESTDATA, IN_VISIBLE_LEARNERS, MANAGER, ORG_EMPLOYER, ORG_EMPLOYER_CONTACT, ORG_EMPLOYER_SITE, STAFF, VISIBLE_LEARNER,
} from './access.js'
import { inTransaction, RequestError, sendError } from './burrow.js'
import { logChange } from './recordChange.js'
import { normalisePostcode, validateContactForm, validateSiteForm, validateWorkplace } from '../src/validation.js'

const CURRENT_LINK = '(le.TODATE is null or le.TODATE >= current_date())'

const SITES = `
  select s.SITEID, s.NAME, s.ADDRESSLINE1, s.ADDRESSLINE2, s.TOWN, s.POSTCODE, s.ISACTIVE, s.CONTACTID,
    c.NAME as CONTACTNAME, c.JOBTITLE as CONTACTJOBTITLE, c.EMAIL as CONTACTEMAIL, c.PHONE as CONTACTPHONE,
    coalesce(n.APPRENTICES, 0) as APPRENTICES
  from ${ORG_EMPLOYER_SITE} s
  left join ${ORG_EMPLOYER_CONTACT} c on c.CONTACTID = s.CONTACTID
  left join (
    select le.SITEID, count(*) as APPRENTICES
    from ILR.LEARNER_EMPLOYER le
    where ${CURRENT_LINK} and le.SITEID is not null and le.${IN_VISIBLE_LEARNERS}
    group by le.SITEID
  ) n on n.SITEID = s.SITEID
  where s.EMPLOYERID = ?
  order by s.ISACTIVE desc, s.NAME, s.SITEID
`
const CONTACTS = `
  select c.CONTACTID, c.NAME, c.JOBTITLE, c.EMAIL, c.PHONE, c.SITEID, s.NAME as SITENAME, c.ISCURRENT,
    c.USERID is not null as HASSIGNIN
  from ${ORG_EMPLOYER_CONTACT} c
  left join ${ORG_EMPLOYER_SITE} s on s.SITEID = c.SITEID
  where c.EMPLOYERID = ?
  order by c.ISCURRENT desc, c.NAME, c.CONTACTID
`
const ONE_SITE = `select * from ${ORG_EMPLOYER_SITE} where EMPLOYERID = ? and SITEID = ?`
const ONE_CONTACT = `select * from ${ORG_EMPLOYER_CONTACT} where EMPLOYERID = ? and CONTACTID = ?`
// A site's current apprentices that this user can see, with their line
// managers.
const SITE_APPRENTICES = `
  select l.LEARNREFNUMBER, l.GIVENNAMES, l.FAMILYNAME, le.FROMDATE, c.NAME as LINEMANAGER
  from ILR.LEARNER_EMPLOYER le
  join ${VISIBLE_LEARNER} l on l.LEARNREFNUMBER = le.LEARNREFNUMBER
  left join ${ORG_EMPLOYER_CONTACT} c on c.CONTACTID = le.LINEMANAGERCONTACTID
  where le.SITEID = ? and ${CURRENT_LINK}
  order by l.FAMILYNAME, l.GIVENNAMES, l.LEARNREFNUMBER
`
const LIVE_POSTCODE = `select POSTCODE from SHARED_DB.REF.POSTCODE where POSTCODE = ? and TERMINATED is null and GONEAT is null`
const SAME_SITE_NAME = `select NAME from ${ORG_EMPLOYER_SITE} where EMPLOYERID = ? and lower(NAME) = lower(?) and SITEID <> ?`
const SAME_EMAIL = `
  select NAME from ${ORG_EMPLOYER_CONTACT}
  where EMPLOYERID = ? and ISCURRENT and lower(EMAIL) = lower(?) and CONTACTID <> ?
`

const INSERT_SITE = `
  insert into ILR.EMPLOYER_SITE (SITEID, EMPLOYERID, NAME, ADDRESSLINE1, ADDRESSLINE2, TOWN, POSTCODE, CONTACTID,
    ISACTIVE, CREATEDBY, ISTESTDATA)
  select ?, e.EMPLOYERID, ?, ?, ?, ?, ?, ?, true, ?, ${CURRENT_ISTESTDATA}
  from ${ORG_EMPLOYER} e where e.EMPLOYERID = ?
`
const UPDATE_SITE = `
  update ILR.EMPLOYER_SITE set NAME = ?, ADDRESSLINE1 = ?, ADDRESSLINE2 = ?, TOWN = ?, POSTCODE = ?, CONTACTID = ?,
    ISACTIVE = ?, UPDATEDAT = current_timestamp(), UPDATEDBY = ?
  where SITEID = ? and SITEID in (select SITEID from ${ORG_EMPLOYER_SITE})
`
const INSERT_CONTACT = `
  insert into ILR.EMPLOYER_CONTACT (CONTACTID, EMPLOYERID, SITEID, NAME, JOBTITLE, EMAIL, PHONE, ISCURRENT, CREATEDBY, ISTESTDATA)
  select ?, e.EMPLOYERID, ?, ?, ?, ?, ?, true, ?, ${CURRENT_ISTESTDATA}
  from ${ORG_EMPLOYER} e where e.EMPLOYERID = ?
`
const UPDATE_CONTACT = `
  update ILR.EMPLOYER_CONTACT set SITEID = ?, NAME = ?, JOBTITLE = ?, EMAIL = ?, PHONE = ?, ISCURRENT = ?,
    UPDATEDAT = current_timestamp(), UPDATEDBY = ?
  where CONTACTID = ? and CONTACTID in (select CONTACTID from ${ORG_EMPLOYER_CONTACT})
`

// An employer's sites (with their main contact and how many current
// apprentices this user can see there) and contacts, for its page.
export async function loadSitesAndContacts(connection, employerId) {
  const sites = await execute(connection, SITES, [employerId])
  const contacts = await execute(connection, CONTACTS, [employerId])
  return { sites, contacts }
}

// One site, with its current apprentices this user can see.
export async function loadSite(connection, employerId, siteId) {
  const [site] = await execute(connection, ONE_SITE, [employerId, siteId])
  if (!site) throw new RequestError(`There's no site ${siteId} at this employer.`, 404)
  const [contact] = site.CONTACTID ? await execute(connection, ONE_CONTACT, [employerId, site.CONTACTID]) : []
  const apprentices = await execute(connection, SITE_APPRENTICES, [siteId])
  return {
    site: { ...site, CONTACTNAME: contact?.NAME ?? null, CONTACTEMAIL: contact?.EMAIL ?? null, CONTACTPHONE: contact?.PHONE ?? null },
    apprentices,
  }
}

// The postcode of the site an apprentice currently works at, if any: new
// aims start with it as their delivery location postcode (the ILR's
// DelLocPostCode: "the postcode of that site should be used"). It's never
// changed on existing aims automatically; moving site asks.
// The current link is chosen first (the latest current one); its site, if
// it has one, gives the postcode. A current link with no site gives null,
// never an older link's site.
const SITE_POSTCODE = `
  select s.POSTCODE
  from (
    select le.SITEID, le.EMPLOYERID
    from ILR.LEARNER_EMPLOYER le
    where le.LEARNREFNUMBER = ? and ${CURRENT_LINK} and le.${IN_VISIBLE_LEARNERS}
    order by le.FROMDATE desc
    limit 1
  ) cur
  left join ${ORG_EMPLOYER_SITE} s on s.SITEID = cur.SITEID and s.EMPLOYERID = cur.EMPLOYERID
`
export async function sitePostcodeOf(connection, learnRefNumber) {
  const [row] = await execute(connection, SITE_POSTCODE, [learnRefNumber])
  return row?.POSTCODE ?? null
}

const EMPLOYER_EXISTS = `select EMPLOYERID from ${ORG_EMPLOYER} where EMPLOYERID = ?`
const fieldError = (status, field, message) => new RequestError('Please fix the highlighted fields.', status, { [field]: message })
const text = (x) => String(x ?? '').trim()
const newId = (prefix) => `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`

async function employerOf(connection, employerId) {
  const [employer] = await execute(connection, EMPLOYER_EXISTS, [employerId])
  if (!employer) throw new RequestError(`There's no employer ${employerId} in your organisation.`, 404)
}

// Adds a site (siteId null) or changes one. Returns its SITEID.
export async function saveSite(connection, employerId, siteId, body, by) {
  const errors = validateSiteForm(body)
  if (Object.keys(errors).length > 0) throw new RequestError('Please fix the highlighted fields.', 400, errors)
  await employerOf(connection, employerId)
  const [existing] = siteId ? await execute(connection, ONE_SITE, [employerId, siteId]) : []
  if (siteId && !existing) throw new RequestError(`There's no site ${siteId} at this employer.`, 404)
  const postcode = normalisePostcode(body.postcode)
  if ((await execute(connection, LIVE_POSTCODE, [postcode])).length === 0) {
    throw fieldError(400, 'postcode', `${postcode} isn't a current postcode on the ONS postcode list.`)
  }
  const [sameName] = await execute(connection, SAME_SITE_NAME, [employerId, text(body.name), siteId ?? ''])
  if (sameName) throw fieldError(409, 'name', `This employer already has a site called ${sameName.NAME}.`)
  const contactId = text(body.contactId) || null
  if (contactId) {
    const [contact] = await execute(connection, ONE_CONTACT, [employerId, contactId])
    if (!contact || (!contact.ISCURRENT && contactId !== existing?.CONTACTID)) {
      throw fieldError(400, 'contactId', 'Choose one of this employer\'s current contacts.')
    }
  }
  const fields = [text(body.name), text(body.addressLine1) || null, text(body.addressLine2) || null, text(body.town) || null, postcode, contactId]
  if (!siteId) {
    const id = newId('SITE')
    await execute(connection, INSERT_SITE, [id, ...fields, by, employerId])
    return id
  }
  await execute(connection, UPDATE_SITE, [...fields, body.isActive !== false, by, siteId])
  return siteId
}

// Adds a contact (contactId null) or changes one. Returns its CONTACTID.
export async function saveContact(connection, employerId, contactId, body, by) {
  const errors = validateContactForm(body)
  if (Object.keys(errors).length > 0) throw new RequestError('Please fix the highlighted fields.', 400, errors)
  await employerOf(connection, employerId)
  const [existing] = contactId ? await execute(connection, ONE_CONTACT, [employerId, contactId]) : []
  if (contactId && !existing) throw new RequestError(`There's no contact ${contactId} at this employer.`, 404)
  const siteId = text(body.siteId) || null
  if (siteId) {
    const [site] = await execute(connection, ONE_SITE, [employerId, siteId])
    if (!site || (!site.ISACTIVE && siteId !== existing?.SITEID)) throw fieldError(400, 'siteId', 'Choose one of this employer\'s sites still in use.')
  }
  const email = text(body.email) || null
  if (email) {
    const [same] = await execute(connection, SAME_EMAIL, [employerId, email, contactId ?? ''])
    if (same) throw fieldError(409, 'email', `${same.NAME} already has this email at this employer.`)
  }
  const isCurrent = body.isCurrent !== false
  if (existing?.USERID) {
    // Their Burrow sign-in is set by hand for now: keep the two in step.
    if ((email ?? '').toLowerCase() !== (existing.EMAIL ?? '').toLowerCase()) {
      throw fieldError(400, 'email', 'They sign in to Burrow with this email, so it can\'t be changed here yet.')
    }
    if (!isCurrent) throw fieldError(400, 'isCurrent', 'They can still sign in to Burrow. Their sign-in has to be ended first (by hand, for now).')
  }
  const fields = [siteId, text(body.name), text(body.jobTitle) || null, email, text(body.phone) || null]
  if (!contactId) {
    const id = newId('CON')
    await execute(connection, INSERT_CONTACT, [id, ...fields, by, employerId])
    return id
  }
  await execute(connection, UPDATE_CONTACT, [...fields, isCurrent, by, contactId])
  return contactId
}

// ---------------------------------------------------------------- an apprentice's workplace
// Their current links to employers, with each link's site and line manager.
const WORKPLACE = `
  select le.EMPLOYERID, e.NAME as EMPLOYERNAME, to_varchar(le.FROMDATE, 'YYYY-MM-DD') as FROMDATE,
    le.SITEID, s.NAME as SITENAME, s.POSTCODE as SITEPOSTCODE, s.ADDRESSLINE1 as SITEADDRESS, s.TOWN as SITETOWN,
    le.LINEMANAGERCONTACTID, c.NAME as LINEMANAGERNAME, c.JOBTITLE as LINEMANAGERJOBTITLE,
    c.EMAIL as LINEMANAGEREMAIL, c.PHONE as LINEMANAGERPHONE
  from ILR.LEARNER_EMPLOYER le
  join ${ORG_EMPLOYER} e on e.EMPLOYERID = le.EMPLOYERID
  left join ${ORG_EMPLOYER_SITE} s on s.SITEID = le.SITEID
  left join ${ORG_EMPLOYER_CONTACT} c on c.CONTACTID = le.LINEMANAGERCONTACTID
  where le.LEARNREFNUMBER = ? and ${CURRENT_LINK} and le.${IN_VISIBLE_LEARNERS}
  order by le.FROMDATE desc, le.EMPLOYERID
`
// For a manager's form: the sites still used and current contacts of the
// employers the apprentice is linked to.
const SITE_CHOICES = `
  select SITEID, EMPLOYERID, NAME, POSTCODE from ${ORG_EMPLOYER_SITE}
  where ISACTIVE and EMPLOYERID in (select value::string from table(flatten(input => parse_json(?))))
  order by NAME
`
const CONTACT_CHOICES = `
  select CONTACTID, EMPLOYERID, NAME, JOBTITLE, SITEID from ${ORG_EMPLOYER_CONTACT}
  where ISCURRENT and EMPLOYERID in (select value::string from table(flatten(input => parse_json(?))))
  order by NAME
`
// The postcode on the apprentice's open aims (not removed, not finished),
// for the question asked when they move site.
const OPEN_AIMS = `
  select AIMSEQNUMBER, LEARNAIMREF, DELLOCPOSTCODE from LEARNING_DELIVERY
  where LEARNREFNUMBER = ? and REMOVEDAT is null and LEARNACTENDDATE is null and ${IN_VISIBLE_LEARNERS}
  order by AIMSEQNUMBER
`
const LINK = `
  select EMPLOYERID, to_varchar(FROMDATE, 'YYYY-MM-DD') as FROMDATE, SITEID, LINEMANAGERCONTACTID
  from ILR.LEARNER_EMPLOYER le
  where le.LEARNREFNUMBER = ? and le.EMPLOYERID = ? and le.FROMDATE = ?::date and ${CURRENT_LINK} and le.${IN_VISIBLE_LEARNERS}
`
// A link with this key whether or not it's current: a move on a day that
// already has a link (one the same day's move started) reuses that row.
const LINK_ON_DAY = `
  select to_varchar(TODATE, 'YYYY-MM-DD') as TODATE, SITEID, LINEMANAGERCONTACTID
  from ILR.LEARNER_EMPLOYER
  where LEARNREFNUMBER = ? and EMPLOYERID = ? and FROMDATE = ?::date and ${IN_VISIBLE_LEARNERS}
`
const REOPEN_LINK = `
  update ILR.LEARNER_EMPLOYER set TODATE = null, SITEID = ?, LINEMANAGERCONTACTID = ?
  where LEARNREFNUMBER = ? and EMPLOYERID = ? and FROMDATE = ?::date and ${IN_VISIBLE_LEARNERS}
`
const SET_LINK = `
  update ILR.LEARNER_EMPLOYER set SITEID = ?, LINEMANAGERCONTACTID = ?
  where LEARNREFNUMBER = ? and EMPLOYERID = ? and FROMDATE = ?::date and ${IN_VISIBLE_LEARNERS}
`
const END_LINK = `
  update ILR.LEARNER_EMPLOYER set TODATE = ?::date
  where LEARNREFNUMBER = ? and EMPLOYERID = ? and FROMDATE = ?::date and ${IN_VISIBLE_LEARNERS}
`
const NEW_LINK = `
  insert into ILR.LEARNER_EMPLOYER (LEARNREFNUMBER, EMPLOYERID, FROMDATE, SITEID, LINEMANAGERCONTACTID, ISTESTDATA)
  select l.LEARNREFNUMBER, ?, ?::date, ?, ?, l.ISTESTDATA
  from ${VISIBLE_LEARNER} l
  where l.LEARNREFNUMBER = ?
`
const SET_DELIVERY_POSTCODE = `
  update LEARNING_DELIVERY set DELLOCPOSTCODE = ?, UPDATEDAT = current_timestamp(), UPDATEDBY = ?
  where LEARNREFNUMBER = ? and AIMSEQNUMBER = ? and REMOVEDAT is null and ${IN_VISIBLE_LEARNERS}
`

// An apprentice's current workplace(s). Managers also get the sites and
// contacts they can choose from, and the open aims' postcodes.
export async function loadWorkplace(connection, learnRefNumber, user) {
  const links = await execute(connection, WORKPLACE, [learnRefNumber])
  if (!user.roles.includes(MANAGER)) return { links }
  const employers = JSON.stringify([...new Set(links.map((l) => l.EMPLOYERID))])
  return {
    links,
    sites: await execute(connection, SITE_CHOICES, [employers]),
    contacts: await execute(connection, CONTACT_CHOICES, [employers]),
    openAims: await execute(connection, OPEN_AIMS, [learnRefNumber]),
  }
}

const dayBefore = (date) => new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)

// Sets an apprentice's site and line manager on one of their current links
// (body.employerId, body.fromDate). Moving from one site to another ends the
// link the day before body.moveDate and starts a new one from it; setting a
// site for the first time, clearing it, or changing only the line manager
// changes the link as it is. There's never a second link with the same key:
// a move dated the day the current link began (moving again on the day of a
// move) corrects that link, and a link already starting on the move date
// (one an earlier move that day started) is reopened, not added again. With body.updateDelivery, the open aims'
// delivery location postcode becomes the site's (asked, never automatic).
export async function saveWorkplace(connection, ref, body, by) {
  const [link] = await execute(connection, LINK, [ref, text(body.employerId), text(body.fromDate)])
  if (!link) throw new RequestError('That isn\'t one of their current workplaces.', 404)
  const siteId = text(body.siteId) || null
  const [site] = siteId ? await execute(connection, ONE_SITE, [link.EMPLOYERID, siteId]) : []
  if (siteId && (!site || (!site.ISACTIVE && siteId !== link.SITEID))) throw fieldError(400, 'siteId', 'Choose one of this employer\'s sites still in use.')
  const lineManagerId = text(body.lineManagerContactId) || null
  if (lineManagerId) {
    const [contact] = await execute(connection, ONE_CONTACT, [link.EMPLOYERID, lineManagerId])
    if (!contact || (!contact.ISCURRENT && lineManagerId !== link.LINEMANAGERCONTACTID)) {
      throw fieldError(400, 'lineManagerContactId', 'Choose one of this employer\'s current contacts.')
    }
  }
  const siteChange = Boolean(link.SITEID && siteId && siteId !== link.SITEID)
  const errors = validateWorkplace({ ...body, siteId }, { moving: siteChange, linkFrom: link.FROMDATE })
  if (Object.keys(errors).length > 0) throw new RequestError('Please fix the highlighted fields.', 400, errors)
  // Moving again on the day the current link began is a correction of it.
  const moving = siteChange && body.moveDate !== link.FROMDATE
  const [sameDay] = moving ? await execute(connection, LINK_ON_DAY, [ref, link.EMPLOYERID, body.moveDate]) : []
  const aims = body.updateDelivery === true && site ? await execute(connection, OPEN_AIMS, [ref]) : []
  const toChange = aims.filter((a) => a.DELLOCPOSTCODE !== site.POSTCODE)

  await inTransaction(connection, async () => {
    const log = (table, key, type, oldValues, newValues) => logChange(connection, { learnRefNumber: ref, table, key, type, oldValues, newValues, by })
    const key = { EMPLOYERID: link.EMPLOYERID, FROMDATE: link.FROMDATE }
    if (moving) {
      const to = dayBefore(body.moveDate)
      await execute(connection, END_LINK, [to, ref, link.EMPLOYERID, link.FROMDATE])
      await log('LEARNER_EMPLOYER', key, 'corrected', { TODATE: null }, { TODATE: to })
      const newKey = { EMPLOYERID: link.EMPLOYERID, FROMDATE: body.moveDate }
      if (sameDay) {
        await execute(connection, REOPEN_LINK, [siteId, lineManagerId, ref, link.EMPLOYERID, body.moveDate])
        await log('LEARNER_EMPLOYER', newKey, 'corrected', { TODATE: sameDay.TODATE, SITEID: sameDay.SITEID, LINEMANAGERCONTACTID: sameDay.LINEMANAGERCONTACTID },
          { TODATE: null, SITEID: siteId, LINEMANAGERCONTACTID: lineManagerId })
      } else {
        await execute(connection, NEW_LINK, [link.EMPLOYERID, body.moveDate, siteId, lineManagerId, ref])
        await log('LEARNER_EMPLOYER', newKey, 'added', null, { SITEID: siteId, LINEMANAGERCONTACTID: lineManagerId })
      }
    } else {
      await execute(connection, SET_LINK, [siteId, lineManagerId, ref, link.EMPLOYERID, link.FROMDATE])
      await log('LEARNER_EMPLOYER', key, 'corrected',
        { SITEID: link.SITEID, LINEMANAGERCONTACTID: link.LINEMANAGERCONTACTID }, { SITEID: siteId, LINEMANAGERCONTACTID: lineManagerId })
    }
    for (const aim of toChange) {
      await execute(connection, SET_DELIVERY_POSTCODE, [site.POSTCODE, by, ref, aim.AIMSEQNUMBER])
      await log('LEARNING_DELIVERY', { AIMSEQNUMBER: aim.AIMSEQNUMBER, LEARNAIMREF: aim.LEARNAIMREF }, 'corrected',
        { DELLOCPOSTCODE: aim.DELLOCPOSTCODE }, { DELLOCPOSTCODE: site.POSTCODE })
    }
  })
  return { moved: moving, corrected: siteChange && !moving, aimsUpdated: toChange.length }
}

export function registerEmployerSiteRoutes(app) {
  app.get('/api/learners/:learnRefNumber/workplace', allow(STAFF), async (req, res) => {
    try {
      res.json(await loadWorkplace(req.db, req.params.learnRefNumber, req.user))
    } catch (err) {
      sendError(res, err, 'Could not load the workplace')
    }
  })

  app.patch('/api/learners/:learnRefNumber/workplace', allow(MANAGER), async (req, res) => {
    try {
      res.json(await saveWorkplace(req.db, req.params.learnRefNumber, req.body ?? {}, req.user.USERID))
    } catch (err) {
      sendError(res, err, 'Could not save the workplace')
    }
  })

  app.get('/api/employers/:employerId/sites/:siteId', allow(STAFF), async (req, res) => {
    try {
      res.json(await loadSite(req.db, req.params.employerId, req.params.siteId))
    } catch (err) {
      sendError(res, err, 'Could not load the site')
    }
  })

  app.post('/api/employers/:employerId/sites', allow(MANAGER), async (req, res) => {
    try {
      res.status(201).json({ siteId: await saveSite(req.db, req.params.employerId, null, req.body ?? {}, req.user.USERID) })
    } catch (err) {
      sendError(res, err, 'Could not add the site')
    }
  })

  app.patch('/api/employers/:employerId/sites/:siteId', allow(MANAGER), async (req, res) => {
    try {
      res.json({ siteId: await saveSite(req.db, req.params.employerId, req.params.siteId, req.body ?? {}, req.user.USERID) })
    } catch (err) {
      sendError(res, err, 'Could not save the site')
    }
  })

  app.post('/api/employers/:employerId/contacts', allow(MANAGER), async (req, res) => {
    try {
      res.status(201).json({ contactId: await saveContact(req.db, req.params.employerId, null, req.body ?? {}, req.user.USERID) })
    } catch (err) {
      sendError(res, err, 'Could not add the contact')
    }
  })

  app.patch('/api/employers/:employerId/contacts/:contactId', allow(MANAGER), async (req, res) => {
    try {
      res.json({ contactId: await saveContact(req.db, req.params.employerId, req.params.contactId, req.body ?? {}, req.user.USERID) })
    } catch (err) {
      sendError(res, err, 'Could not save the contact')
    }
  })
}
