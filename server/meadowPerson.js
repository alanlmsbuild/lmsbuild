// Meadow's person record (GET /api/meadow/people/:leadId), opened from a
// card on the pipeline board. From the approved "Person record" mock-up,
// with what CRM_DB holds: their details, interests and consent, the
// journey's stage and owner, its stage history (with close reasons),
// activity and emails, tasks, the vacancy matches with their reasons, and
// placements. Managers only, like the board; read on Meadow's sessions
// (crmSessions.js, as CRM_APP_USER), the organisation a bind in every
// query (check:scoping rule 21). Another organisation's lead is a 404, the
// same as one that doesn't exist.
//
// Every view is logged in CRM_DB.CRM.RECORD_VIEW (sql/crm_02_record_view_tags.sql),
// before anything is read: if the log can't be written, nothing is shown.
// The app can only add to the log, never read it.
//
// Personal data (tagged in Snowflake, check:tags --crm): name, email,
// mobile, date of birth and postcode are shown, since managers contact
// people. An anonymised lead (the retention rule cleared them) shows none
// of them, whatever is left in the row. Editing, moving stage, logging a
// call and adding tasks come later.

import crypto from 'node:crypto'
import { allow, MANAGER, ORG_APP_USER_NAME_BY_BIND } from './access.js'
import { execute } from './db.js'
import { RequestError, sendError } from './burrow.js'
import { withCrmSession } from './crmSessions.js'
import { STAGES_QUERY } from './meadow.js'

// LEAD's columns tagged personal (check:tags --crm checks the tags match).
export const PERSONAL_LEAD_FIELDS = ['GIVENNAMES', 'FAMILYNAME', 'EMAIL', 'MOBILE', 'DATEOFBIRTH', 'POSTCODE']

const LOG_VIEW = `
  insert into CRM_DB.CRM.RECORD_VIEW (VIEWID, ORGANISATIONID, RECORDTYPE, RECORDID, VIEWEDBY, ISTESTDATA)
  select ?, l.ORGANISATIONID, 'lead', l.LEADID, ?, l.ISTESTDATA
  from CRM_DB.CRM.LEAD l
  where l.LEADID = ? and l.ORGANISATIONID = ?
`

// The lead and their latest candidate journey (there's one per lead).
const LEAD_QUERY = `
  select l.LEADID, l.GIVENNAMES, l.FAMILYNAME, l.EMAIL, l.MOBILE, l.DATEOFBIRTH, l.POSTCODE,
    l.TRAVELMILES, l.TRAVELMODES, l.HOURSWANTED, l.CURRENTSITUATION, l.HASENGLISHLEVEL2, l.HASMATHSLEVEL2,
    l.SOURCE, l.CREATEDAT, l.EMAILCONFIRMEDAT, l.HANDEDOVERAT, l.ANONYMISEDAT,
    i.ITEMID, i.STAGEID, i.OWNERUSERID, i.OPENEDAT, i.CLOSEDAT, coalesce(i.STAGECHANGEDAT, i.OPENEDAT) as INSTAGESINCE,
    s.NAME as STAGENAME, s.CATEGORY, s.SYSTEMKEY, cr.LABEL as CLOSEREASON
  from CRM_DB.CRM.LEAD l
  left join CRM_DB.CRM.PIPELINE_ITEM i
    on i.RECORDID = l.LEADID and i.RECORDTYPE = 'lead' and i.ORGANISATIONID = l.ORGANISATIONID
  left join CRM_DB.CRM.PIPELINE_STAGE s
    on s.STAGEID = i.STAGEID and s.ORGANISATIONID = i.ORGANISATIONID
  left join CRM_DB.CRM.CLOSE_REASON cr
    on cr.REASONID = i.CLOSEREASONID and cr.ORGANISATIONID = i.ORGANISATIONID
  where l.LEADID = ? and l.ORGANISATIONID = ?
  order by i.OPENEDAT desc
  limit 1
`

const INTERESTS_QUERY = `
  select li.TYPEDTEXT, li.SOCTITLE
  from CRM_DB.CRM.LEAD_INTEREST li
  where li.LEADID = ? and li.ORGANISATIONID = ? and li.REMOVEDAT is null
  order by li.ADDEDAT
`

const CONSENT_QUERY = `
  select c.KIND, c.GIVEN, c.NOTICEVERSION, c.RECORDEDAT
  from CRM_DB.CRM.LEAD_CONSENT c
  where c.LEADID = ? and c.ORGANISATIONID = ?
  order by c.RECORDEDAT
`

const STAGE_HISTORY_QUERY = `
  select c.CHANGEID, c.CHANGEDAT, c.CHANGEDBY, c.NOTE, f.NAME as FROMNAME, t.NAME as TONAME, r.LABEL as REASON
  from CRM_DB.CRM.STAGE_CHANGE c
  join CRM_DB.CRM.PIPELINE_ITEM i
    on i.ITEMID = c.ITEMID and i.ORGANISATIONID = c.ORGANISATIONID
  left join CRM_DB.CRM.PIPELINE_STAGE f
    on f.STAGEID = c.FROMSTAGEID and f.ORGANISATIONID = c.ORGANISATIONID
  left join CRM_DB.CRM.PIPELINE_STAGE t
    on t.STAGEID = c.TOSTAGEID and t.ORGANISATIONID = c.ORGANISATIONID
  left join CRM_DB.CRM.CLOSE_REASON r
    on r.REASONID = c.REASONID and r.ORGANISATIONID = c.ORGANISATIONID
  where i.RECORDTYPE = 'lead' and i.RECORDID = ? and c.ORGANISATIONID = ?
  order by c.CHANGEDAT
`

// Activities linked to the lead, their journey or one of their
// placements, once each (an activity is often linked to several).
const ACTIVITY_QUERY = `
  select distinct a.ACTIVITYID, a.KIND, a.SUBJECT, a.BODY, a.OCCURREDAT, a.BYUSERID
  from CRM_DB.CRM.ACTIVITY a
  join CRM_DB.CRM.ACTIVITY_LINK k
    on k.ACTIVITYID = a.ACTIVITYID and k.ORGANISATIONID = a.ORGANISATIONID
  where a.ORGANISATIONID = ? and a.REMOVEDAT is null
    and ((k.RECORDTYPE = 'lead' and k.RECORDID = ?)
      or (k.RECORDTYPE = 'item' and k.RECORDID in (
            select i.ITEMID from CRM_DB.CRM.PIPELINE_ITEM i
            where i.RECORDTYPE = 'lead' and i.RECORDID = ? and i.ORGANISATIONID = ?))
      or (k.RECORDTYPE = 'placement' and k.RECORDID in (
            select p.PLACEMENTID from CRM_DB.CRM.PLACEMENT p
            where p.LEADID = ? and p.ORGANISATIONID = ?)))
`

// The emails to them: never the address (it's in their details).
const EMAILS_QUERY = `
  select e.MESSAGEID, e.TEMPLATE, e.SUBJECT, e.STATUS, e.CREATEDAT, e.SENTAT
  from CRM_DB.CRM.EMAIL_MESSAGE e
  where e.RECORDTYPE = 'lead' and e.RECORDID = ? and e.ORGANISATIONID = ?
`

// Tasks on the lead, their journey or one of their placements; not the
// cancelled ones.
const TASKS_QUERY = `
  select t.TASKID, t.TITLE, t.DETAILS, t.DUEDATE, t.OWNERUSERID, t.STATUS, t.DONEAT
  from CRM_DB.CRM.TASK t
  where t.ORGANISATIONID = ? and t.STATUS in ('open', 'done')
    and ((t.RECORDTYPE = 'lead' and t.RECORDID = ?)
      or (t.RECORDTYPE = 'item' and t.RECORDID in (
            select i.ITEMID from CRM_DB.CRM.PIPELINE_ITEM i
            where i.RECORDTYPE = 'lead' and i.RECORDID = ? and i.ORGANISATIONID = ?))
      or (t.RECORDTYPE = 'placement' and t.RECORDID in (
            select p.PLACEMENTID from CRM_DB.CRM.PLACEMENT p
            where p.LEADID = ? and p.ORGANISATIONID = ?)))
  order by t.DUEDATE nulls last, t.CREATEDAT
`

// Best fit first, ruled-out ones last; never by pay.
const MATCHES_QUERY = `
  select m.MATCHID, m.VACANCYREFERENCE, m.SCORE, m.REASONS, m.EXCLUDEDREASON, m.MATCHEDAT, m.SHOWNTOLEADAT,
    v.TITLE, v.EMPLOYERNAME, v.CLOSINGDATE, v.VACANCYURL, v.GONEAT
  from CRM_DB.CRM.LEAD_MATCH m
  left join SHARED_DB.EXT.VACANCY v on v.VACANCYREFERENCE = m.VACANCYREFERENCE
  where m.LEADID = ? and m.ORGANISATIONID = ?
  order by m.EXCLUDEDREASON is not null, m.SCORE desc nulls last, m.MATCHEDAT
`

// Each standard's title from its latest version.
const PLACEMENTS_QUERY = `
  select p.PLACEMENTID, p.STATUS, p.PUTFORWARDAT, p.STATUSCHANGEDAT, p.VACANCYREFERENCE, p.STANDARDCODE,
    e.NAME as EMPLOYERNAME, r.LABEL as OUTCOMEREASON, v.TITLE as VACANCYTITLE, sv.TITLE as STANDARDTITLE, sv.LEVEL as STANDARDLEVEL
  from CRM_DB.CRM.PLACEMENT p
  left join CRM_DB.CRM.EMPLOYER e
    on e.EMPLOYERID = p.EMPLOYERID and e.ORGANISATIONID = p.ORGANISATIONID
  left join CRM_DB.CRM.CLOSE_REASON r
    on r.REASONID = p.OUTCOMEREASONID and r.ORGANISATIONID = p.ORGANISATIONID
  left join SHARED_DB.EXT.VACANCY v on v.VACANCYREFERENCE = p.VACANCYREFERENCE
  left join (
    select LARS_CODE,
      max_by(TITLE, try_to_number(split_part(VERSION, '.', 1)) * 1000 + coalesce(try_to_number(split_part(VERSION, '.', 2)), 0)) as TITLE,
      max_by(LEVEL, try_to_number(split_part(VERSION, '.', 1)) * 1000 + coalesce(try_to_number(split_part(VERSION, '.', 2)), 0)) as LEVEL
    from SHARED_DB.SKILLS.STANDARD_VERSION
    group by LARS_CODE
  ) sv on sv.LARS_CODE = p.STANDARDCODE
  where p.LEADID = ? and p.ORGANISATIONID = ?
  order by p.PUTFORWARDAT desc
`

const OWNERS_QUERY = `select USERID, DISPLAYNAME from ${ORG_APP_USER_NAME_BY_BIND} u`

const SITUATIONS = { school: 'At school', college: 'At college', working: 'Working', not_working: 'Not working' }
const HOURS = { full_time: 'Full time', part_time: 'Part time' }
const MODES = { bus: 'bus', train: 'train', walk: 'walking', cycle: 'cycling', car: 'car', lift: 'a lift' }
const SOURCES = { web_form: 'the interest form' }
const CONSENTS = [
  { kind: 'contact_email', yes: 'OK to email', no: 'Not OK to email', unasked: 'Email: not asked' },
  { kind: 'contact_phone', yes: 'OK to phone', no: 'Not OK to phone', unasked: 'Phone: not asked' },
  { kind: 'marketing', yes: 'OK to send news', no: 'No news emails', unasked: 'News emails: not asked' },
  { kind: 'privacy_notice', yes: 'Saw the privacy notice', no: "Hasn't seen the privacy notice", unasked: "Hasn't seen the privacy notice" },
]
const ACTIVITY_KINDS = { call: 'Call', email: 'Email', note: 'Note', meeting: 'Meeting' }
const EMAIL_TEMPLATES = { confirm_email: 'Confirm your email', next_steps: 'Next steps' }
const EMAIL_STATUSES = { outbox: 'In the outbox (not sent)', queued: 'Waiting to send', sent: 'Sent', failed: "Couldn't be sent", bounced: 'Bounced' }
const PLACEMENT_STATUSES = {
  put_forward: 'Put forward', interviewing: 'Interviewing', offered: 'Offered', accepted: 'Accepted',
  declined: 'Declined', withdrawn: 'Withdrawn', enrolled: 'Enrolled',
}
const DONE_TASKS_SHOWN = 5

const iso = (value) => (value == null ? null : new Date(value).toISOString())
// A Snowflake DATE (a Date at midnight UTC, or YYYY-MM-DD) as YYYY-MM-DD.
const dateOnly = (value) => (value == null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10))
const sentence = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text)

function parseList(value) {
  if (value == null) return []
  return typeof value === 'string' ? JSON.parse(value) : value
}

// Today's date in the UK, as YYYY-MM-DD.
function ukToday(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

// Whole years from a date of birth (YYYY-MM-DD) to a UK day (YYYY-MM-DD).
export function ageOn(dateOfBirth, today) {
  if (!dateOfBirth) return null
  const [by, bm, bd] = dateOfBirth.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0)
}

// "interest: it" to "Interest: it", "hours: full_time" to "Hours: full time".
export function reasonText(reason) {
  return sentence(String(reason).replace(/_/g, ' '))
}

// Who did something: a person by name, or what the system did.
function byText(id, names) {
  if (!id) return null
  if (names.has(id)) return names.get(id)
  if (id === 'web-form') return 'The interest form'
  if (id.startsWith('system:')) return 'Meadow'
  return 'Someone no longer here'
}

// The record from the queries' rows (no database, so the test can check it).
export function buildPerson({ lead, stages, interests, consents, history, activities, emails, tasks, matches, placements, owners, now = new Date() }) {
  const names = new Map(owners.map((o) => [o.USERID, o.DISPLAYNAME]))
  const anonymised = lead.ANONYMISEDAT != null
  const personal = anonymised ? Object.fromEntries(PERSONAL_LEAD_FIELDS.map((f) => [f, null])) : lead
  const given = personal.GIVENNAMES ?? ''
  const family = personal.FAMILYNAME ?? ''
  const dateOfBirth = dateOnly(personal.DATEOFBIRTH)
  const age = ageOn(dateOfBirth, ukToday(now))

  const latest = new Map()
  for (const c of consents) latest.set(c.KIND, c)
  const consent = CONSENTS.map(({ kind, yes, no, unasked }) => {
    const c = latest.get(kind)
    if (!c) return { kind, given: null, text: unasked, at: null, version: null }
    return { kind, given: c.GIVEN === true, text: c.GIVEN === true ? yes : no, at: iso(c.RECORDEDAT), version: c.NOTICEVERSION ?? null }
  })

  const lost = lead.CATEGORY === 'lost'
  const journey = lead.ITEMID
    ? {
        itemId: lead.ITEMID,
        stageId: lead.STAGEID,
        stage: lead.STAGENAME,
        category: lead.CATEGORY,
        owner: lead.OWNERUSERID ? names.get(lead.OWNERUSERID) ?? null : null,
        openedAt: iso(lead.OPENEDAT),
        inStageSince: iso(lead.INSTAGESINCE),
        closedAt: iso(lead.CLOSEDAT),
        closeReason: lost ? lead.CLOSEREASON ?? null : null,
        status: lost
          ? `Not proceeding${lead.CLOSEREASON ? `: ${lead.CLOSEREASON}` : ''}`
          : lead.SYSTEMKEY === 'ENROLLED'
            ? 'Enrolled'
            : null,
        stages: stages
          .filter((s) => s.CATEGORY !== 'lost')
          .map((s) => ({ stageId: s.STAGEID, name: s.NAME })),
      }
    : null

  // One timeline, newest first: stage moves, activities and emails.
  const timeline = [
    ...history.map((h) => ({
      key: `stage-${h.CHANGEID}`,
      kind: 'stage',
      at: iso(h.CHANGEDAT),
      what: h.FROMNAME ? `Moved to ${h.TONAME}` : `Joined the pipeline at ${h.TONAME}`,
      detail: [h.REASON ? `Reason: ${h.REASON}` : null, h.NOTE].filter(Boolean).join('. ') || null,
      who: byText(h.CHANGEDBY, names),
    })),
    ...activities.map((a) => ({
      key: `activity-${a.ACTIVITYID}`,
      kind: 'activity',
      at: iso(a.OCCURREDAT),
      what: `${ACTIVITY_KINDS[a.KIND] ?? sentence(a.KIND)}${a.SUBJECT ? `: ${a.SUBJECT}` : ''}`,
      detail: a.BODY ?? null,
      who: byText(a.BYUSERID, names),
    })),
    ...emails.map((e) => ({
      key: `email-${e.MESSAGEID}`,
      kind: 'email',
      at: iso(e.SENTAT ?? e.CREATEDAT),
      what: `Email: ${e.SUBJECT ?? EMAIL_TEMPLATES[e.TEMPLATE] ?? e.TEMPLATE}`,
      detail: EMAIL_STATUSES[e.STATUS] ?? e.STATUS,
      who: 'Meadow',
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))

  const openTasks = tasks.filter((t) => t.STATUS === 'open')
  const doneTasks = tasks.filter((t) => t.STATUS === 'done').sort((a, b) => (iso(a.DONEAT) < iso(b.DONEAT) ? 1 : -1)).slice(0, DONE_TASKS_SHOWN)
  const task = (t) => ({
    taskId: t.TASKID,
    title: t.TITLE,
    details: t.DETAILS ?? null,
    due: dateOnly(t.DUEDATE),
    owner: names.get(t.OWNERUSERID) ?? null,
    done: t.STATUS === 'done',
    doneAt: iso(t.DONEAT),
  })

  return {
    leadId: lead.LEADID,
    anonymised,
    name: anonymised ? 'Anonymised' : `${given} ${family}`.trim() || 'No name given',
    initials: anonymised ? '–' : `${given.charAt(0)}${family.charAt(0)}`.toUpperCase() || '?',
    details: {
      email: personal.EMAIL ?? null,
      mobile: personal.MOBILE ?? null,
      dateOfBirth,
      age,
      under18: age != null && age < 18,
      postcode: personal.POSTCODE ?? null,
      district: personal.POSTCODE ? personal.POSTCODE.trim().split(/\s+/)[0] : null,
      emailConfirmedAt: iso(lead.EMAILCONFIRMEDAT),
      cameVia: SOURCES[lead.SOURCE] ?? (lead.SOURCE ? lead.SOURCE.replace(/_/g, ' ') : null),
      createdAt: iso(lead.CREATEDAT),
      handedOverAt: iso(lead.HANDEDOVERAT),
    },
    told: {
      situation: SITUATIONS[lead.CURRENTSITUATION] ?? null,
      hours: HOURS[lead.HOURSWANTED] ?? null,
      travel: lead.TRAVELMILES == null ? null : `Up to ${lead.TRAVELMILES} ${Number(lead.TRAVELMILES) === 1 ? 'mile' : 'miles'}`,
      travelModes: parseList(lead.TRAVELMODES).map((m) => MODES[m] ?? m),
      englishLevel2: lead.HASENGLISHLEVEL2 ?? null,
      mathsLevel2: lead.HASMATHSLEVEL2 ?? null,
    },
    interests: interests.filter((i) => i.TYPEDTEXT).map((i) => ({ text: i.TYPEDTEXT, title: i.SOCTITLE ?? null })),
    consent,
    journey,
    timeline,
    tasks: { open: openTasks.map(task), done: doneTasks.map(task) },
    matches: matches.map((m) => ({
      matchId: m.MATCHID,
      reference: m.VACANCYREFERENCE,
      title: m.TITLE ?? `Advert ${m.VACANCYREFERENCE}`,
      employer: m.EMPLOYERNAME ?? null,
      // The advert's own closing day: the import keeps its end-of-day
      // closing time in UTC (23:59:59), which is the next day in UK summer time.
      closes: m.CLOSINGDATE == null ? null : dateOnly(new Date(m.CLOSINGDATE)),
      url: m.VACANCYURL ?? null,
      gone: m.TITLE == null || m.GONEAT != null,
      score: m.SCORE == null ? null : Number(m.SCORE),
      reasons: parseList(m.REASONS).map(reasonText),
      excludedReason: m.EXCLUDEDREASON ?? null,
      shownToThemAt: iso(m.SHOWNTOLEADAT),
    })),
    placements: placements.map((p) => ({
      placementId: p.PLACEMENTID,
      employer: p.EMPLOYERNAME ?? null,
      vacancy: p.VACANCYTITLE ?? null,
      standard: p.STANDARDTITLE ? `${p.STANDARDTITLE}${p.STANDARDLEVEL ? `, level ${p.STANDARDLEVEL}` : ''}` : null,
      status: PLACEMENT_STATUSES[p.STATUS] ?? p.STATUS,
      putForwardAt: iso(p.PUTFORWARDAT),
      statusChangedAt: iso(p.STATUSCHANGEDAT),
      outcomeReason: p.OUTCOMEREASON ?? null,
    })),
  }
}

// Logs that userId opened the lead: one RECORD_VIEW row, or none when the
// lead isn't this organisation's. Returns the rows added (1 or 0).
export async function logView(crm, org, leadId, userId) {
  const [result] = await execute(crm, LOG_VIEW, [crypto.randomUUID(), userId, leadId, org])
  return Number(result?.['number of rows inserted'] ?? 0)
}

// The record, or null when the organisation has no such lead. Reads only.
export async function loadPerson(crm, org, leadId) {
  const [lead] = await execute(crm, LEAD_QUERY, [leadId, org])
  if (!lead) return null
  const [stages, interests, consents, history, activities, emails, tasks, matches, placements, owners] = await Promise.all([
    execute(crm, STAGES_QUERY, [org]),
    execute(crm, INTERESTS_QUERY, [leadId, org]),
    execute(crm, CONSENT_QUERY, [leadId, org]),
    execute(crm, STAGE_HISTORY_QUERY, [leadId, org]),
    execute(crm, ACTIVITY_QUERY, [org, leadId, leadId, org, leadId, org]),
    execute(crm, EMAILS_QUERY, [leadId, org]),
    execute(crm, TASKS_QUERY, [org, leadId, leadId, org, leadId, org]),
    execute(crm, MATCHES_QUERY, [leadId, org]),
    execute(crm, PLACEMENTS_QUERY, [leadId, org]),
    execute(crm, OWNERS_QUERY, [org]),
  ])
  return buildPerson({ lead, stages, interests, consents, history, activities, emails, tasks, matches, placements, owners })
}

export function registerMeadowPersonRoutes(app) {
  app.get('/api/meadow/people/:leadId', allow(MANAGER), async (req, res) => {
    try {
      const org = req.user.ORGANISATIONID
      const leadId = String(req.params.leadId)
      const person = await withCrmSession(async (crm) => {
        await logView(crm, org, leadId, req.user.USERID)
        return loadPerson(crm, org, leadId)
      })
      if (!person) throw new RequestError('There is no such person.', 404)
      res.json(person)
    } catch (err) {
      sendError(res, err, 'Could not load this person')
    }
  })
}
