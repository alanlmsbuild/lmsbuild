// Writing the test journeys (scripts/journeys/world.js) as the app's own
// roles: the CRM's rows as CRM_APP_USER, Warren's as ILR_APP_USER, and
// records that cross between them only through flows F8, F6 and F7. Every
// phase skips what is already there, so a run that stops can be run again.
//
// Dates: rows are written with the dates of the journey. The flows stamp
// their own changes with the time they run; afterwards the run sets the
// business dates each role may change (when a lead was handed over, an
// employer became a client, a journey last moved). The stage history rows
// the flows add are add-only for the app, so their dates are set by
// sql/journeys_02_snapshot.sql (ACCOUNTADMIN, test data only).

import { execute } from '../../server/db.js'
import { SECTORS } from './reference.js'
import { ORG, MANAGERS, IQA, OFFICER_NAMES, tokenHash, addDays } from './world.js'
import { ilrRows } from './ilr.js'

export const at = (date, hour = 10) => `${date}T${String(hour).padStart(2, '0')}:00:00Z`
const BY = 'generate-journeys'

// ---------------------------------------------------------------- inserting many rows

const typeCache = new Map()
async function columnTypes(conn, table) {
  if (typeCache.has(table)) return typeCache.get(table)
  const [db, schema, name] = table.split('.')
  const rows = await execute(conn, `select COLUMN_NAME, DATA_TYPE from ${db}.INFORMATION_SCHEMA.COLUMNS where TABLE_SCHEMA = ? and TABLE_NAME = ?`, [schema, name])
  const map = new Map(rows.map((r) => [r.COLUMN_NAME, r.DATA_TYPE]))
  typeCache.set(table, map)
  return map
}

// Inserts rows (objects with the same keys) in batches: one statement per
// batch, each value cast to its column's type (JSON for VARIANT and ARRAY).
export async function insertRows(conn, table, rows) {
  if (!rows.length) return 0
  const types = await columnTypes(conn, table)
  const cols = Object.keys(rows[0])
  for (const c of cols) if (!types.has(c)) throw new Error(`${table} has no column ${c}`)
  const cast = (c, i) => {
    const t = types.get(c)
    const v = `column${i + 1}`
    if (t === 'VARIANT' || t === 'OBJECT') return `parse_json(${v})`
    if (t === 'ARRAY') return `parse_json(${v})::array`
    if (t === 'DATE') return `${v}::date`
    if (t.startsWith('TIMESTAMP')) return `${v}::timestamp_ltz`
    if (t === 'BOOLEAN') return `${v}::boolean`
    if (t === 'NUMBER' || t === 'FLOAT') return `${v}::number(38, 2)`
    return `${v}::varchar`
  }
  const json = (c) => ['VARIANT', 'OBJECT', 'ARRAY'].includes(types.get(c))
  const per = Math.max(1, Math.floor(12000 / cols.length))
  for (let i = 0; i < rows.length; i += per) {
    const part = rows.slice(i, i + per)
    const values = part.map(() => `(${cols.map(() => '?').join(', ')})`).join(', ')
    const binds = part.flatMap((r) => cols.map((c) => (r[c] === undefined || r[c] === null ? null : json(c) ? JSON.stringify(r[c]) : r[c])))
    await execute(conn, `insert into ${table} (${cols.join(', ')}) select ${cols.map(cast).join(', ')} from values ${values}`, binds)
  }
  return rows.length
}

const existing = async (conn, sql, binds = []) => new Set((await execute(conn, sql, binds)).map((r) => Object.values(r)[0]))
const callFlow = async (conn, sql, binds) => {
  const [row] = await execute(conn, sql, binds)
  const v = Object.values(row)[0]
  const out = typeof v === 'string' ? JSON.parse(v) : v
  if (out.outcome !== 'succeeded') throw new Error(`${sql.split('(')[0].replace('CALL ', '')} ${JSON.stringify(binds)}: ${out.outcome}: ${out.reason ?? out.error}`)
  return out
}

// ---------------------------------------------------------------- CRM rows

const stageId = (kind, key) => `ST-${ORG}-${kind}-${key}`
const reasonId = (kind, key) => `CR-${ORG}-${kind}-${key}`
const sectorOf = (key) => SECTORS.find((s) => s.key === key)

// The lead's stages the run writes itself: everything before hand-over, and
// a loss before hand-over. Hand-over and after are the flows' (F6, F7).
const leadPathByRun = (p) => (p.handoverAt ? p.path.filter(([k]) => !['ASSESSMENT', 'ENROLLED', 'LOST'].includes(k)) : p.path)
// The employer's: everything but Apprentice placed (F7, as F9).
const employerPathByRun = (e) => e.path.filter(([k]) => k !== 'PLACED')

export function crmRows(world, ref, people, employers) {
  const out = { FORM_SUBMISSION: [], LEAD: [], LEAD_INTEREST: [], LEAD_CONSENT: [], CONFIRM_TOKEN: [], LEAD_MATCH: [], EMAIL_MESSAGE: [], EMPLOYER: [], EMPLOYER_SITE: [],
    CONTACT: [], PIPELINE_ITEM: [], STAGE_CHANGE: [], PLACEMENT: [], ACTIVITY: [], ACTIVITY_LINK: [], TASK: [] }
  const T = { ISTESTDATA: true }
  for (const e of employers) {
    const created = e.path[0]?.[1] ?? world.asOf
    out.EMPLOYER.push({ EMPLOYERID: e.id, ORGANISATIONID: ORG, NAME: e.name, NOTONCOMPANIESHOUSE: true, ISACTIVE: true, CREATEDAT: at(created), CREATEDBY: e.owner, ...T })
    for (const s of e.sites) out.EMPLOYER_SITE.push({ SITEID: s.id, EMPLOYERID: e.id, ORGANISATIONID: ORG, NAME: s.name, ADDRESSLINE1: s.line1, TOWN: s.town, POSTCODE: s.postcode, CREATEDAT: at(created), CREATEDBY: e.owner, ...T })
    for (const c of e.contacts) out.CONTACT.push({ CONTACTID: c.id, EMPLOYERID: e.id, ORGANISATIONID: ORG, NAME: c.name, JOBTITLE: c.jobTitle, EMAIL: c.email, PHONE: c.phone, SALESROLE: c.salesRole,
      PREFERREDCONTACTMETHOD: c.method, MARKETINGCONSENT: c.marketing, MARKETINGCONSENTAT: c.marketing ? at(created) : null, CREATEDAT: at(created), CREATEDBY: e.owner, ...T })
    const path = employerPathByRun(e)
    if (!path.length) continue
    const last = path.at(-1)
    out.PIPELINE_ITEM.push({ ITEMID: e.itemId, ORGANISATIONID: ORG, PIPELINEID: `PL-${ORG}-EMPLOYER`, RECORDTYPE: 'employer', RECORDID: e.id, STAGEID: stageId('EMPLOYER', last[0]),
      OWNERUSERID: e.owner, TITLE: e.title, OPENEDAT: at(path[0][1]), OPENEDBY: e.owner, CLOSEDAT: last[0] === 'LOST' ? at(last[1], 15) : null,
      CLOSEREASONID: last[0] === 'LOST' ? reasonId('EMPLOYER', e.lostReason) : null, STAGECHANGEDAT: at(last[1], 15), ...T })
    path.forEach(([k, d], i) => out.STAGE_CHANGE.push({ CHANGEID: `SC-E${e.id.slice(5)}-${i + 1}`, ITEMID: e.itemId, ORGANISATIONID: ORG, FROMSTAGEID: i ? stageId('EMPLOYER', path[i - 1][0]) : null,
      TOSTAGEID: stageId('EMPLOYER', k), CHANGEDAT: at(d, 15), CHANGEDBY: e.owner, REASONID: k === 'LOST' ? reasonId('EMPLOYER', e.lostReason) : null, ...T }))
    const meeting = path.find(([k]) => k === 'MEETING')
    if (meeting) {
      const id = `ACT-E${e.id.slice(5)}`
      out.ACTIVITY.push({ ACTIVITYID: id, ORGANISATIONID: ORG, KIND: 'meeting', SUBJECT: `Meeting at ${e.name}`, BODY: 'Talked through apprenticeships and the roles they have.', OCCURREDAT: at(meeting[1], 11), BYUSERID: e.owner, CREATEDAT: at(meeting[1], 16), ...T })
      for (const [rt, rid] of [['employer', e.id], ['item', e.itemId], ['contact', e.contacts[0].id]]) out.ACTIVITY_LINK.push({ ACTIVITYID: id, ORGANISATIONID: ORG, RECORDTYPE: rt, RECORDID: rid, ...T })
    }
    if (!['LOST', 'AGREED'].includes(last[0]) || (last[0] === 'AGREED' && !e.wonAt)) {
      out.TASK.push({ TASKID: `TASK-E${e.id.slice(5)}`, ORGANISATIONID: ORG, TITLE: `Follow up ${e.name}`, DUEDATE: addDays(world.asOf, (Number(e.id.slice(-3)) % 14) + 1), OWNERUSERID: e.owner,
        RECORDTYPE: 'employer', RECORDID: e.id, STATUS: 'open', CREATEDAT: at(last[1], 16), CREATEDBY: e.owner, ...T })
    }
  }
  for (const p of people) {
    const lead = `LEAD-${p.id}`
    const owner = MANAGERS[p.n % 2]
    const answers = { givenNames: p.given, familyName: p.family, email: p.email, dateOfBirth: p.dob, mobile: p.mobile, postcode: p.postcode, travelMiles: p.travelMiles,
      travelModes: p.travelModes, hoursWanted: p.hours, currentSituation: p.situation, englishLevel2: p.english2, mathsLevel2: p.maths2, interests: p.interests.map((s) => s.words[0]) }
    p.submissions.forEach((d, i) => {
      out.FORM_SUBMISSION.push({ SUBMISSIONID: `FS-${p.id}-${i + 1}`, ORGANISATIONID: ORG, FORM: 'interest', FORMVERSION: 'TEST-1', NOTICEVERSION: 'TEST-1', RECEIVEDAT: at(d, 9), PAYLOAD: answers, LEADID: lead, ...T })
      out.EMAIL_MESSAGE.push({ MESSAGEID: `EM-${p.id}-CONFIRM-${i + 1}`, ORGANISATIONID: ORG, RECORDTYPE: 'lead', RECORDID: lead, TOADDRESS: p.email, TEMPLATE: 'confirm_email',
        SUBJECT: 'Please confirm your email', MODE: 'outbox', STATUS: 'outbox', CREATEDAT: at(d, 9), ...T })
    })
    const path = leadPathByRun(p)
    const last = path.at(-1)
    const lostByRun = last[0] === 'LOST'
    out.LEAD.push({ LEADID: lead, ORGANISATIONID: ORG, GIVENNAMES: p.given, FAMILYNAME: p.family, EMAIL: p.email, DATEOFBIRTH: p.dob, MOBILE: p.mobile, POSTCODE: p.postcode,
      TRAVELMILES: p.travelMiles, TRAVELMODES: p.travelModes, HOURSWANTED: p.hours, CURRENTSITUATION: p.situation, HASENGLISHLEVEL2: p.english2, HASMATHSLEVEL2: p.maths2,
      SOURCE: 'web_form', CREATEDAT: at(p.enquiry, 9), EMAILCONFIRMEDAT: p.confirmedAt ? at(p.confirmedAt, 11) : null, LASTACTIVITYAT: at(p.path.at(-1)[1], 15), ...T })
    p.interests.forEach((s, i) => out.LEAD_INTEREST.push({ INTERESTID: `LI-${p.id}-${i + 1}`, LEADID: lead, ORGANISATIONID: ORG, TYPEDTEXT: s.words[p.n % s.words.length],
      SOCTITLE: ref.socs.get(s.soc), SOC2020: s.soc, ADDEDAT: at(p.enquiry, 9), ...T }))
    for (const [k, kind] of [['PRIVACY', 'privacy_notice'], ['EMAIL', 'contact_email'], ...(p.marketing ? [['MARKETING', 'marketing']] : [])]) {
      out.LEAD_CONSENT.push({ CONSENTID: `LC-${p.id}-${k}`, LEADID: lead, ORGANISATIONID: ORG, KIND: kind, NOTICEVERSION: 'TEST-1', GIVEN: true, RECORDEDAT: at(p.enquiry, 9), SUBMISSIONID: `FS-${p.id}-1`, ...T })
    }
    out.CONFIRM_TOKEN.push({ TOKENID: `CT-${p.id}`, LEADID: lead, ORGANISATIONID: ORG, TOKENHASH: tokenHash(p.id), CREATEDAT: at(p.enquiry, 9), EXPIRESAT: at(addDays(p.enquiry, 7), 9),
      USEDAT: p.confirmedAt ? at(p.confirmedAt, 11) : null, ...T })
    if (p.enquiry >= '2026-06-01' && p.confirmedAt) {
      ref.adverts.filter((a) => Number(a.LARSCODE) === sectorOf(p.sector).std).sort((a, b) => (a.VACANCYREFERENCE < b.VACANCYREFERENCE ? -1 : 1)).slice(0, 3)
        .forEach((a, i) => out.LEAD_MATCH.push({ MATCHID: `LM-${p.id}-${i + 1}`, LEADID: lead, ORGANISATIONID: ORG, VACANCYREFERENCE: a.VACANCYREFERENCE, SCORE: 85 - i * 7,
          REASONS: [`interest: ${p.sector}`, `hours: ${p.hours}`], MATCHEDAT: at(p.confirmedAt, 11), SHOWNTOLEADAT: at(p.confirmedAt, 11), ...T }))
    }
    const contacted = p.path.find(([k]) => k === 'CONTACTED')
    const itemOwner = contacted ? owner : null
    out.PIPELINE_ITEM.push({ ITEMID: `ITEM-${p.id}`, ORGANISATIONID: ORG, PIPELINEID: `PL-${ORG}-CANDIDATE`, RECORDTYPE: 'lead', RECORDID: lead, STAGEID: stageId('CANDIDATE', last[0]),
      OWNERUSERID: itemOwner, OPENEDAT: at(p.enquiry, 9), OPENEDBY: 'web-form', CLOSEDAT: lostByRun ? at(last[1], 15) : null,
      CLOSEREASONID: lostByRun ? reasonId('CANDIDATE', p.lostReason) : null, STAGECHANGEDAT: at(last[1], 15), ...T })
    path.forEach(([k, d], i) => out.STAGE_CHANGE.push({ CHANGEID: `SC-${p.id}-${i + 1}`, ITEMID: `ITEM-${p.id}`, ORGANISATIONID: ORG,
      FROMSTAGEID: i ? stageId('CANDIDATE', path[i - 1][0]) : null, TOSTAGEID: stageId('CANDIDATE', k), CHANGEDAT: at(d, k === 'NEW' ? 9 : 15),
      CHANGEDBY: k === 'NEW' ? 'web-form' : k === 'CONFIRMED' ? 'system:email-confirmed' : owner, REASONID: k === 'LOST' ? reasonId('CANDIDATE', p.lostReason) : null, ...T }))
    if (contacted) {
      out.EMAIL_MESSAGE.push({ MESSAGEID: `EM-${p.id}-CONTACT`, ORGANISATIONID: ORG, RECORDTYPE: 'lead', RECORDID: lead, TOADDRESS: p.email, TEMPLATE: 'next_steps',
        SUBJECT: 'Your apprenticeship enquiry', MODE: 'outbox', STATUS: 'outbox', CREATEDAT: at(contacted[1], 12), ...T })
      out.ACTIVITY.push({ ACTIVITYID: `ACT-${p.id}`, ORGANISATIONID: ORG, KIND: 'call', SUBJECT: 'First call', BODY: `Talked about ${sectorOf(p.sector).words[0]} apprenticeships.`,
        OCCURREDAT: at(contacted[1], 11), BYUSERID: owner, CREATEDAT: at(contacted[1], 11), ...T })
      for (const [rt, rid] of [['lead', lead], ['item', `ITEM-${p.id}`]]) out.ACTIVITY_LINK.push({ ACTIVITYID: `ACT-${p.id}`, ORGANISATIONID: ORG, RECORDTYPE: rt, RECORDID: rid, ...T })
    }
    const open = !['LOST', 'ENROLLED'].includes(p.path.at(-1)[0])
    if (open) out.TASK.push({ TASKID: `TASK-${p.id}`, ORGANISATIONID: ORG, TITLE: `Next step with ${p.given}`, DUEDATE: addDays(world.asOf, (p.n % 14) + 1), OWNERUSERID: owner,
      RECORDTYPE: 'lead', RECORDID: lead, STATUS: 'open', CREATEDAT: at(p.path.at(-1)[1], 16), CREATEDBY: owner, ...T })
    for (const pl of p.placements ?? []) {
      // Enrolled and withdrawn-at-assessment placements are F7's to set.
      const status = p.handoverAt ? 'accepted' : pl.status
      out.PLACEMENT.push({ PLACEMENTID: pl.id, ORGANISATIONID: ORG, LEADID: lead, CANDIDATEITEMID: `ITEM-${p.id}`, EMPLOYERID: pl.employer.id, EMPLOYERITEMID: pl.employer.itemId,
        STANDARDCODE: pl.std, STATUS: status, PUTFORWARDAT: at(pl.at, 10), PUTFORWARDBY: owner, STATUSCHANGEDAT: at(pl.offeredAt ?? pl.at, 14), ...T })
    }
  }
  return out
}

// ---------------------------------------------------------------- Warren rows for one learner

export function warrenRows(l, ref, today, links) {
  const { learner, rows } = ilrRows(l, ref, today)
  const T = { ISTESTDATA: true }
  const made = { CREATEDAT: at(l.start, 9), CREATEDBY: BY }
  const ref_ = links.learnRef ?? l.ref
  const re = (x) => ({ ...x, LEARNREFNUMBER: ref_ })
  const out = {
    LEARNER: [{ ...re(learner), ORGANISATIONID: ORG, ...T }],
    LEARNING_DELIVERY: rows.aims.map(({ AIMTITLE, IN_LARS, ...a }) => ({ ...re(a), ...T })), // eslint-disable-line no-unused-vars
    APP_FIN_RECORD: rows.fin.map((x) => ({ ...re(x), ...made, ...T })),
    HOURS_RECORD: rows.hours.map((x) => ({ ...re(x), ...made, ...T })),
    EMPLOYMENT_STATUS: rows.employment.map((x) => ({ ...re(x), EMPLOYERID: links.employerId, ...made, ...T })),
    EMPLOYMENT_STATUS_MONITORING: rows.esm.map((x) => ({ ...re(x), ...made, ...T })),
    PRIOR_ATTAINMENT: rows.prior.map((x) => ({ ...re(x), ...made, ...T })),
    LLDD_HEALTH_PROBLEM: rows.lldd.map((x) => ({ ...re(x), ...made, ...T })),
    OFFICER_ASSIGNMENT: [['TUTOR', l.tutor], ['ASSESSOR', l.assessor]].map(([role, off]) => ({ ASSIGNMENTID: `ASG-J-${ref_}-${role}`, LEARNREFNUMBER: ref_, OFFICERREFNUMBER: off,
      ASSIGNMENTROLE: role, STARTEDAT: at(l.start, 9), STARTEDBY: BY, ...T })),
    LEARNER_EMPLOYER: [{ LEARNREFNUMBER: ref_, EMPLOYERID: links.employerId, FROMDATE: l.start, TODATE: l.status === 'withdrawn' ? l.endDate : null, SITEID: links.siteId,
      LINEMANAGERCONTACTID: links.contactId, CREATEDAT: at(l.start, 9), ...T }],
    PROGRESS_REVIEW: l.reviews.map((rv, i) => ({ REVIEWID: `PR-${ref_}-${i + 1}`, LEARNREFNUMBER: ref_, OFFICERREFNUMBER: rv.officer, REVIEWDATE: rv.date, EMPLOYERATTENDED: rv.employerAttended,
      SUMMARY: `Review ${i + 1}: progress on the ${l.standard.NAME} standard, off-the-job training on track, next steps agreed.`, CREATEDAT: at(rv.date, 16), CREATEDBY: BY })),
    EVIDENCE: [], EVIDENCE_KSB: [], EVIDENCE_REVIEW: [], IQA_CHECK: [], WITNESS_CONFIRMATION: [],
  }
  const by = links.learnerUserId ?? ref_
  for (const e of l.evidence) {
    const title = e.type === 'witness_statement' ? 'Witness statement from my supervisor' : `What I did at work, ${e.occurred}`
    const reflection = `TEST reflection for ${l.standard.NAME}: what I did, what I learned and what I would do differently.`
    const submitted = e.status !== 'draft'
    const signedOff = e.status === 'signed_off'
    out.EVIDENCE.push({ EVIDENCE_ID: e.id, LEARNREFNUMBER: ref_, STDCODE: l.std, ST_REFERENCE: l.standard.REFERENCE, TITLE: title, EVIDENCE_TYPE: e.type, OCCURRED_ON: e.occurred,
      REFLECTION: reflection, STATUS: e.status, SUBMISSION_COUNT: !submitted ? 0 : e.resubmitted ? 2 : 1, CREATED_AT: at(e.occurred, 18), CREATED_BY: by, UPDATED_AT: at(e.decided, 12), UPDATED_BY: by,
      SUBMITTED_AT: submitted ? at(e.submitted, 18) : null, SIGNED_OFF_AT: signedOff ? at(e.decided, 12) : null, SIGNED_OFF_BY: signedOff ? l.assessor : null,
      WITHDRAWN_AT: e.status === 'withdrawn' ? at(e.decided, 12) : null, WITHDRAWN_BY: e.status === 'withdrawn' ? by : null, WITHDRAWN_REASON: e.status === 'withdrawn' ? 'Added by mistake' : null })
    const reviewId = `RV-${e.id.slice(0, 8)}-`
    for (const k of e.claims) {
      out.EVIDENCE_KSB.push({ EVIDENCE_ID: e.id, ST_REFERENCE: l.standard.REFERENCE, KSB_TYPE: k.KSB_TYPE, KSB_REFERENCE: k.KSB_REFERENCE, KSB_TEXT: k.DETAIL, STANDARD_VERSION: k.VERSION,
        CLAIMED_AT: at(e.occurred, 18), CLAIMED_BY: by, DECISION: signedOff ? 'confirmed' : null, DECIDED_AT: signedOff ? at(e.decided, 12) : null, DECIDED_BY: signedOff ? l.assessor : null,
        DECIDED_IN_REVIEW: signedOff ? `${reviewId}${e.resubmitted ? 2 : 1}` : null })
    }
    const snapshot = { evidence_type: e.type, file_ids: [], ksbs: e.claims.map((k) => k.KSB_REFERENCE), occurred_on: e.occurred, reflection, title }
    const review = (n, outcome, date) => out.EVIDENCE_REVIEW.push({ REVIEW_ID: `${reviewId}${n}`, EVIDENCE_ID: e.id, SUBMISSION_NUMBER: n, OFFICERREFNUMBER: l.assessor,
      OFFICER_NAME: OFFICER_NAMES[l.assessor], REVIEWED_AT: at(date, 12), OUTCOME: outcome, FEEDBACK: outcome === 'signed_off' ? 'Good evidence, KSBs confirmed.' : 'Please say more about what you did.',
      KSB_DECISIONS: outcome === 'signed_off' ? e.claims.map((k) => ({ type: k.KSB_TYPE, reference: k.KSB_REFERENCE, decision: 'confirmed' })) : [], EVIDENCE_SNAPSHOT: snapshot })
    if (e.status === 'changes_requested') review(1, 'changes_requested', e.decided)
    if (signedOff && e.resubmitted) { review(1, 'changes_requested', addDays(e.decided, -5)); review(2, 'signed_off', e.decided) }
    else if (signedOff) review(1, 'signed_off', e.decided)
    if (e.iqa) out.IQA_CHECK.push({ CHECK_ID: `IQ-${e.id.slice(0, 8)}`, EVIDENCE_ID: e.id, REVIEW_ID: `${reviewId}${e.resubmitted ? 2 : 1}`, ASSESSOR_OFFICERREFNUMBER: l.assessor,
      IQA_USERID: IQA.userId, IQA_OFFICERREFNUMBER: IQA.officer, IQA_NAME: IQA.name, OUTCOME: e.iqa, FEEDBACK: e.iqa === 'agreed' ? 'Agree with the sign-off.' : 'Ask for more detail next time.',
      CHECKED_AT: at([addDays(e.decided, 7), today].sort()[0], 14) })
    if (links.witness && e.type === 'witness_statement' && submitted && e.status !== 'withdrawn') {
      out.WITNESS_CONFIRMATION.push({ CONFIRMATION_ID: `WC-${e.id.slice(0, 8)}`, EVIDENCE_ID: e.id, SUBMISSION_NUMBER: e.resubmitted ? 2 : 1, EMPLOYERID: links.employerId,
        CONFIRMED_BY: links.witness.userId, CONFIRMER_NAME: links.witness.name, OUTCOME: 'confirmed', COMMENT_TEXT: 'I saw this happen.', CONFIRMED_AT: at([addDays(e.submitted, 2), today].sort()[0], 13) })
    }
  }
  return out
}

export { existing, callFlow, crmRows as _crmRows, leadPathByRun, employerPathByRun, stageId, reasonId, BY }
