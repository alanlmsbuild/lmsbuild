// Meadow, the recruitment CRM: the people pipeline board (GET
// /api/meadow/board). Managers only for now (there's no Recruitment role
// yet). Read from CRM_DB on Meadow's own sessions (crmSessions.js, as
// CRM_APP_USER), never Warren and Burrow's: req.db only signed the user in.
//
// Every query takes the signed-in user's organisation as a bind and joins
// each further CRM_DB table on ORGANISATIONID as well (check:scoping rule
// 21), since Meadow's sessions carry no session variables.
//
// The board, as in the approved mock-up (pipeline option C): the open
// stages in three bands (getting to know them, matching, starting), a column
// per stage with its open journeys, and Enrolled with those enrolled in the
// last 30 days. Not proceeding is only a count. A stage added later joins
// the band of the stage before it. There's no funnel or "% carry on": open
// counts per stage aren't throughput (the drop-off report will use
// STAGE_CHANGE).

import { allow, MANAGER, ORG_APP_USER_NAME_BY_BIND } from './access.js'
import { execute } from './db.js'
import { sendError } from './burrow.js'
import { withCrmSession } from './crmSessions.js'

export const ENROLLED_DAYS = 30

export const BANDS = [
  { key: 'know', name: 'Getting to know them', note: 'First contact to goals', stages: ['NEW', 'CONFIRMED', 'CONTACTED'] },
  { key: 'match', name: 'Matching', note: 'Jobs and courses that fit', stages: ['MATCHED', 'INTERVIEWING'] },
  { key: 'start', name: 'Starting', note: 'Offer to enrolment', stages: ['OFFERED', 'ASSESSMENT', 'ENROLLED'] },
]

const STAGES_QUERY = `
  select s.STAGEID, s.NAME, s.SORTORDER, s.CATEGORY, s.SYSTEMKEY
  from CRM_DB.CRM.PIPELINE_STAGE s
  join CRM_DB.CRM.PIPELINE p
    on p.PIPELINEID = s.PIPELINEID and p.ORGANISATIONID = s.ORGANISATIONID
  where s.ORGANISATIONID = ? and p.KIND = 'candidate' and p.ISACTIVE and s.ISACTIVE
  order by s.SORTORDER
`

// The open journeys, and those enrolled in the last ENROLLED_DAYS days,
// with each person's interests and whether they can be emailed (the latest
// contact_email consent).
const CARDS_QUERY = `
  select i.ITEMID, i.STAGEID, coalesce(i.STAGECHANGEDAT, i.OPENEDAT) as INSTAGESINCE, i.OWNERUSERID,
    l.LEADID, l.GIVENNAMES, l.FAMILYNAME, l.POSTCODE, l.CURRENTSITUATION, l.ANONYMISEDAT,
    (select array_agg(object_construct('text', li.TYPEDTEXT, 'title', li.SOCTITLE)) within group (order by li.ADDEDAT)
       from CRM_DB.CRM.LEAD_INTEREST li
       where li.LEADID = l.LEADID and li.ORGANISATIONID = l.ORGANISATIONID and li.REMOVEDAT is null) as INTERESTS,
    (select max_by(c.GIVEN, c.RECORDEDAT)
       from CRM_DB.CRM.LEAD_CONSENT c
       where c.LEADID = l.LEADID and c.ORGANISATIONID = l.ORGANISATIONID and c.KIND = 'contact_email') as CANEMAIL
  from CRM_DB.CRM.PIPELINE_ITEM i
  join CRM_DB.CRM.PIPELINE_STAGE s
    on s.STAGEID = i.STAGEID and s.ORGANISATIONID = i.ORGANISATIONID
  join CRM_DB.CRM.LEAD l
    on l.LEADID = i.RECORDID and l.ORGANISATIONID = i.ORGANISATIONID
  where i.ORGANISATIONID = ? and i.RECORDTYPE = 'lead'
    and ((s.CATEGORY = 'open' and i.CLOSEDAT is null)
      or (s.SYSTEMKEY = 'ENROLLED' and i.STAGECHANGEDAT >= dateadd(day, -${ENROLLED_DAYS}, current_timestamp())))
  order by INSTAGESINCE, l.FAMILYNAME, l.GIVENNAMES
`

// Closed journeys per stage, for "N not proceeding" and enrolled in all.
const CLOSED_QUERY = `
  select i.STAGEID, count(*) as N
  from CRM_DB.CRM.PIPELINE_ITEM i
  where i.ORGANISATIONID = ? and i.RECORDTYPE = 'lead' and i.CLOSEDAT is not null
  group by i.STAGEID
`

const OWNERS_QUERY = `select USERID, DISPLAYNAME from ${ORG_APP_USER_NAME_BY_BIND} u`

const SITUATIONS = { school: 'At school', college: 'At college', working: 'Working', not_working: 'Not working' }
const DAY_MS = 24 * 60 * 60 * 1000

// The stage's key from its ID: ST-ORG-T003-CANDIDATE-MATCHED is MATCHED.
const stageKey = (stageId) => stageId.split('-CANDIDATE-')[1] ?? stageId

function parseList(value) {
  if (value == null) return []
  return typeof value === 'string' ? JSON.parse(value) : value
}

export function daysText(days) {
  if (days < 1) return 'Today'
  return days === 1 ? '1 day' : `${days} days`
}

function card(row, owners, now) {
  const anonymised = row.ANONYMISEDAT != null
  const given = anonymised ? '' : row.GIVENNAMES ?? ''
  const family = anonymised ? '' : row.FAMILYNAME ?? ''
  const name = anonymised ? 'Anonymised' : `${given} ${family}`.trim() || 'No name given'
  const days = Math.floor((now - new Date(row.INSTAGESINCE).getTime()) / DAY_MS)
  return {
    itemId: row.ITEMID,
    leadId: row.LEADID,
    name,
    initials: anonymised ? '–' : `${given.charAt(0)}${family.charAt(0)}`.toUpperCase() || '?',
    district: anonymised || !row.POSTCODE ? null : row.POSTCODE.trim().split(/\s+/)[0],
    situation: SITUATIONS[row.CURRENTSITUATION] ?? null,
    interests: parseList(row.INTERESTS).filter((x) => x.text).map((x) => ({ text: x.text, title: x.title ?? null })),
    days,
    daysText: daysText(days),
    owner: row.OWNERUSERID ? owners.get(row.OWNERUSERID) ?? null : null,
    canEmail: row.CANEMAIL === true,
  }
}

// The board from the queries' rows (no database, so the test can check it).
export function buildBoard({ stages, cards, closed, owners, now = Date.now() }) {
  const ownerNames = new Map(owners.map((o) => [o.USERID, o.DISPLAYNAME]))
  const closedBy = new Map(closed.map((c) => [c.STAGEID, Number(c.N)]))
  const cardsBy = new Map()
  for (const row of cards) {
    if (!cardsBy.has(row.STAGEID)) cardsBy.set(row.STAGEID, [])
    cardsBy.get(row.STAGEID).push(card(row, ownerNames, now))
  }
  const bands = BANDS.map(({ key, name, note }) => ({ key, name, note, stages: [] }))
  let band = bands[0]
  let notProceeding = 0
  let enrolledInAll = 0
  for (const s of stages) {
    if (s.CATEGORY === 'lost') {
      notProceeding += closedBy.get(s.STAGEID) ?? 0
      continue
    }
    const key = stageKey(s.STAGEID)
    band = bands[BANDS.findIndex((b) => b.stages.includes(key))] ?? band
    const enrolled = s.SYSTEMKEY === 'ENROLLED'
    if (enrolled) enrolledInAll += closedBy.get(s.STAGEID) ?? 0
    const stageCards = cardsBy.get(s.STAGEID) ?? []
    band.stages.push({
      stageId: s.STAGEID,
      key,
      name: s.NAME,
      count: stageCards.length,
      note: enrolled ? `Last ${ENROLLED_DAYS} days` : null,
      cards: enrolled ? stageCards.reverse() : stageCards,
    })
  }
  const open = bands.flatMap((b) => b.stages).filter((s) => s.key !== 'ENROLLED').reduce((n, s) => n + s.count, 0)
  return { bands: bands.filter((b) => b.stages.length > 0), open, notProceeding, enrolledInAll, enrolledDays: ENROLLED_DAYS }
}

// The board for one organisation, on a Meadow session.
export async function loadBoard(crm, org) {
  const [stages, cards, closed, owners] = await Promise.all([
    execute(crm, STAGES_QUERY, [org]),
    execute(crm, CARDS_QUERY, [org]),
    execute(crm, CLOSED_QUERY, [org]),
    execute(crm, OWNERS_QUERY, [org]),
  ])
  return buildBoard({ stages, cards, closed, owners })
}

export function registerMeadowRoutes(app) {
  app.get('/api/meadow/board', allow(MANAGER), async (req, res) => {
    try {
      const board = await withCrmSession((crm) => loadBoard(crm, req.user.ORGANISATIONID))
      res.json({ organisation: req.user.ORGANISATIONNAME, ...board })
    } catch (err) {
      sendError(res, err, 'Could not load the pipeline')
    }
  })
}
