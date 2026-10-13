// The real run of the test journeys: the phases in order, each skipping what
// is already there. --slice does 10 people end to end, their Warren and
// Burrow records through the app's own HTTP routes on the test server
// (3002), to prove the real paths; the full run does everyone else.

import os from 'node:os'
import crypto from 'node:crypto'
import { connect, execute, destroy } from '../../server/db.js'
import { ORG, MANAGERS, addDays } from './world.js'
import { insertRows, crmRows, warrenRows, existing, callFlow, stageId, at, BY } from './write.js'

const CRM_KEYS = { EMPLOYER: 'EMPLOYERID', EMPLOYER_SITE: 'SITEID', CONTACT: 'CONTACTID', PIPELINE_ITEM: 'ITEMID', STAGE_CHANGE: 'CHANGEID', LEAD: 'LEADID',
  LEAD_INTEREST: 'INTERESTID', LEAD_CONSENT: 'CONSENTID', CONFIRM_TOKEN: 'TOKENID', LEAD_MATCH: 'MATCHID', EMAIL_MESSAGE: 'MESSAGEID', PLACEMENT: 'PLACEMENTID',
  ACTIVITY: 'ACTIVITYID', TASK: 'TASKID', ACTIVITY_LINK: "ACTIVITYID || '|' || RECORDTYPE || '|' || RECORDID" }
const keyOf = (table, row) => (table === 'ACTIVITY_LINK' ? `${row.ACTIVITYID}|${row.RECORDTYPE}|${row.RECORDID}` : row[CRM_KEYS[table]])

export function sliceOf(world) {
  return world.learners.filter((l) => !l.person.backCohort && l.status === 'continuing' && l.start >= '2026-04-01').sort((a, b) => (a.ref < b.ref ? -1 : 1)).slice(0, 10)
}

export async function run(world, ref, { slice = false, log = console.log, api = 'http://localhost:3002' } = {}) {
  const crm = await connect({ as: 'crm', timeoutMs: 30000 })
  const app = await connect({ timeoutMs: 30000 })
  const counts = {}
  const add = (k, n) => { counts[k] = (counts[k] ?? 0) + n }
  const jobRunId = crypto.randomUUID()
  await execute(app, `insert into SHARED_DB.OPS.JOB_RUN (JOBRUNID, JOB, TRIGGEREDBY, HOST, STARTEDAT) values (?, 'generate-journeys', 'manual', ?, current_timestamp())`, [jobRunId, os.hostname()])
  log(`generate-journeys (${slice ? 'slice' : 'full'}): JOB_RUN ${jobRunId}`)
  try {
    const sliceLearners = sliceOf(world)
    const slicePeople = new Set(sliceLearners.map((l) => l.person.id))
    const people = slice ? world.people.filter((p) => slicePeople.has(p.id)) : world.people.filter((p) => !slicePeople.has(p.id))
    const employers = slice ? [...new Set(sliceLearners.flatMap((l) => l.person.placements.map((pl) => pl.employer)))] : world.employers

    // ---------------------------------------------------------- A. CRM rows
    const crmOut = crmRows(world, ref, people, employers)
    const leadsThere = await existing(crm, `select LEADID from CRM_DB.CRM.LEAD where ORGANISATIONID = ?`, [ORG])
    crmOut.FORM_SUBMISSION = crmOut.FORM_SUBMISSION.filter((r) => !leadsThere.has(r.LEADID))
    for (const [table, rows] of Object.entries(crmOut)) {
      const schema = table === 'FORM_SUBMISSION' ? 'BRONZE' : 'CRM'
      let todo = rows
      if (CRM_KEYS[table]) {
        const have = await existing(crm, `select ${CRM_KEYS[table]} from CRM_DB.CRM.${table} where ORGANISATIONID = ?`, [ORG])
        todo = rows.filter((r) => !have.has(keyOf(table, r)))
      }
      add(`CRM ${table}`, await insertRows(crm, `CRM_DB.${schema}.${table}`, todo))
    }
    log(`  A. CRM rows: ${Object.entries(counts).map(([k, v]) => `${k.replace('CRM ', '')} ${v}`).join(', ')}`)

    // ---------------------------------------------------------- B. F8: won employers become clients
    const won = employers.filter((e) => e.wonAt)
    const clientOf = new Map((await execute(crm, `select EMPLOYERID, WARRENEMPLOYERID from CRM_DB.CRM.EMPLOYER where ORGANISATIONID = ? and WARRENEMPLOYERID is not null`, [ORG]))
      .map((r) => [r.EMPLOYERID, r.WARRENEMPLOYERID]))
    for (const e of won.filter((x) => !clientOf.has(x.id))) {
      const out = await callFlow(crm, `CALL SHARED_DB.FLOW.F8_WON_EMPLOYER(?, PARSE_JSON(?)::ARRAY, PARSE_JSON(?)::ARRAY, ?)`,
        [e.id, JSON.stringify(e.sites.map((s) => s.id)), JSON.stringify(e.contacts.map((c) => c.id)), e.owner])
      clientOf.set(e.id, out.warrenEmployerId)
      add('F8 calls', 1)
    }
    for (const e of won) {
      await execute(crm, `update CRM_DB.CRM.EMPLOYER set BECAMECLIENTAT = ?::timestamp_ltz, UPDATEDBY = ? where EMPLOYERID = ?`, [at(e.wonAt, 15), BY, e.id])
      await execute(app, `update CAPTURE_DB.ILR.EMPLOYER set EMPLOYERREF = ?, UPDATEDAT = current_timestamp(), UPDATEDBY = ? where EMPLOYERID = ? and ORGANISATIONID = ?`, [e.ern, BY, clientOf.get(e.id), ORG])
    }
    log(`  B. F8: ${counts['F8 calls'] ?? 0} employers made clients (${won.length} won in scope)`)

    // ---------------------------------------------------------- C. Warren-only employers (the back cohort's)
    if (!slice) {
      const have = await existing(app, `select EMPLOYERID from CAPTURE_DB.ILR.EMPLOYER where ORGANISATIONID = ?`, [ORG])
      const todo = world.warrenOnlyEmployers.filter((e) => !have.has(e.id))
      add('Warren-only employers', await insertRows(app, 'CAPTURE_DB.ILR.EMPLOYER', todo.map((e) => ({ EMPLOYERID: e.id, ORGANISATIONID: ORG, NAME: e.name, EMPLOYERREF: e.ern,
        NOTONCOMPANIESHOUSE: 'Not on Companies House', ISACTIVE: true, CREATEDAT: at('2024-07-01'), CREATEDBY: BY, ISTESTDATA: true }))))
      await insertRows(app, 'CAPTURE_DB.ILR.EMPLOYER_SITE', todo.map((e) => ({ SITEID: e.site.id, EMPLOYERID: e.id, NAME: e.site.name, ADDRESSLINE1: e.site.line1, TOWN: e.site.town,
        POSTCODE: e.site.postcode, CREATEDAT: at('2024-07-01'), CREATEDBY: BY, ISTESTDATA: true })))
      await insertRows(app, 'CAPTURE_DB.ILR.EMPLOYER_CONTACT', todo.map((e) => ({ CONTACTID: e.contact.id, EMPLOYERID: e.id, SITEID: e.site.id, NAME: e.contact.name, JOBTITLE: e.contact.jobTitle,
        EMAIL: e.contact.email, PHONE: e.contact.phone, CREATEDAT: at('2024-07-01'), CREATEDBY: BY, ISTESTDATA: true })))
      log(`  C. Warren-only employers: ${counts['Warren-only employers']} added`)
    }

    // ---------------------------------------------------------- D. F6: hand-over
    const handed = people.filter((p) => p.handoverAt)
    const onboardingOf = async () => new Map((await execute(app, `select LEADID, ONBOARDINGID, CANDIDATEUSERID, STATUS, LASTREPORTEDSTATUS, LEARNREFNUMBER from CAPTURE_DB.ILR.ONBOARDING where ORGANISATIONID = ?`, [ORG]))
      .map((r) => [r.LEADID, r]))
    let onb = await onboardingOf()
    for (const p of handed.filter((x) => !onb.has(`LEAD-${x.id}`))) {
      await callFlow(crm, `CALL SHARED_DB.FLOW.F6_HANDOVER(?, ?)`, [p.placements.at(-1).id, MANAGERS[p.n % 2]])
      add('F6 calls', 1)
    }
    onb = await onboardingOf()
    for (const p of handed) {
      await execute(crm, `update CRM_DB.CRM.LEAD set HANDEDOVERAT = ?::timestamp_ltz where LEADID = ?`, [at(p.handoverAt, 14), `LEAD-${p.id}`])
      await execute(app, `update CAPTURE_DB.ILR.ONBOARDING set HANDEDOVERAT = ?::timestamp_ltz where ONBOARDINGID = ?`, [at(p.handoverAt, 14), onb.get(`LEAD-${p.id}`).ONBOARDINGID])
    }
    log(`  D. F6: ${counts['F6 calls'] ?? 0} handed over (${handed.length} in scope)`)

    // Stage 2 for everyone handed over (F7 moves them to Initial assessment).
    const f7 = async (p, status, extra = {}) => {
      const o = onb.get(`LEAD-${p.id}`)
      if (o.LASTREPORTEDSTATUS === status) return
      await execute(app, `update CAPTURE_DB.ILR.ONBOARDING set STATUS = ?, STATUSCHANGEDAT = ?::timestamp_ltz, LEARNREFNUMBER = coalesce(?, LEARNREFNUMBER),
        NOTPROCEEDINGREASON = coalesce(?, NOTPROCEEDINGREASON), UPDATEDAT = current_timestamp(), UPDATEDBY = ? where ONBOARDINGID = ?`,
      [status, at(extra.date ?? addDays(p.handoverAt, 1), 10), extra.learnRef ?? null, extra.reason ?? null, MANAGERS[p.n % 2], o.ONBOARDINGID])
      await callFlow(app, `CALL SHARED_DB.FLOW.F7_ONBOARDING_STATUS(?, ?)`, [o.ONBOARDINGID, MANAGERS[p.n % 2]])
      o.LASTREPORTEDSTATUS = status
      add('F7 calls', 1)
    }
    for (const p of handed) if (!['enrolled', 'not_proceeding'].includes(onb.get(`LEAD-${p.id}`).LASTREPORTEDSTATUS)) await f7(p, 'stage2')
    log(`  D. F7 stage 2: ${counts['F7 calls'] ?? 0} calls`)

    // ---------------------------------------------------------- E. Warren learners
    const sites = await execute(app, `select SITEID, EMPLOYERID, POSTCODE from CAPTURE_DB.ILR.EMPLOYER_SITE where EMPLOYERID in (select EMPLOYERID from CAPTURE_DB.ILR.EMPLOYER where ORGANISATIONID = ?)`, [ORG])
    const warrenContact = new Map((await execute(crm, `select CONTACTID, WARRENCONTACTID from CRM_DB.CRM.CONTACT where ORGANISATIONID = ? and WARRENCONTACTID is not null`, [ORG])).map((r) => [r.CONTACTID, r.WARRENCONTACTID]))
    // Fifteen won employers' line managers get Burrow sign-ins (made by
    // sql/journeys_02_snapshot.sql) and confirm witness statements.
    const witnessEmployers = world.employers.filter((e) => e.wonAt && world.learners.some((l) => l.employer === e)).slice(0, 15)
    const witnessOf = new Map(witnessEmployers.map((e, i) => {
      const c = e.contacts.find((x) => x.salesRole === 'line_manager')
      return [e.id, { userId: `USR-JW${String(i + 1).padStart(2, '0')}`, name: c.name, crmContactId: c.id }]
    }))
    for (const [empId, w] of witnessOf) {
      await execute(app, `update CAPTURE_DB.ILR.EMPLOYER_CONTACT set USERID = ? where CONTACTID = ? and USERID is null`, [w.userId, warrenContact.get(w.crmContactId)])
      w.employerId = clientOf.get(empId)
    }
    const linksFor = (l) => {
      if (l.person.backCohort) return { employerId: l.employer.id, siteId: l.site.id, contactId: l.contact.id }
      const employerId = clientOf.get(l.employer.id)
      const site = sites.find((s) => s.EMPLOYERID === employerId && s.POSTCODE === l.site.postcode)
      return { employerId, siteId: site?.SITEID ?? null, contactId: warrenContact.get(l.contact.id) ?? null, learnerUserId: onb.get(`LEAD-${l.person.id}`)?.CANDIDATEUSERID,
        witness: witnessOf.get(l.employer.id) }
    }
    const learnersThere = await existing(app, `select LEARNREFNUMBER from CAPTURE_DB.ILR.LEARNER where ORGANISATIONID = ?`, [ORG])
    const scope = slice ? [] : world.learners.filter((l) => !sliceLearners.includes(l) && !learnersThere.has(l.ref))
    const tables = {}
    for (const l of scope) for (const [t, rows] of Object.entries(warrenRows(l, ref, world.asOf, linksFor(l)))) (tables[t] ??= []).push(...rows)
    const schemaOf = (t) => (['EVIDENCE', 'EVIDENCE_KSB', 'EVIDENCE_REVIEW', 'IQA_CHECK', 'WITNESS_CONFIRMATION'].includes(t) ? 'BURROW' : 'ILR')
    for (const [t, rows] of Object.entries(tables)) add(`${schemaOf(t)}.${t}`, await insertRows(app, `CAPTURE_DB.${schemaOf(t)}.${t}`, rows))
    if (!slice) log(`  E. Warren: ${scope.length} learners; ${Object.entries(counts).filter(([k]) => /^(ILR|BURROW)\./.test(k)).map(([k, v]) => `${k} ${v}`).join(', ')}`)

    // ---------------------------------------------------------- E (slice). Warren learners through the HTTP routes
    if (slice) {
      const { sliceThroughHttp } = await import('./http.js')
      for (const l of sliceLearners) {
        const p = l.person
        const o = onb.get(`LEAD-${p.id}`)
        if (o.LEARNREFNUMBER) continue
        const learnRef = await sliceThroughHttp(api, l, ref, world.asOf, linksFor(l), MANAGERS[p.n % 2], app)
        await f7(p, 'enrolled', { learnRef, date: l.start })
        const { evidenceThroughHttp } = await import('./http.js')
        add('slice evidence (HTTP)', await evidenceThroughHttp(api, l, learnRef, o.CANDIDATEUSERID))
        add('slice learners (HTTP)', 1)
      }
      log(`  E. slice: ${counts['slice learners (HTTP)'] ?? 0} learners and ${counts['slice evidence (HTTP)'] ?? 0} pieces of evidence through the HTTP routes`)
    }

    // ---------------------------------------------------------- F. F7: enrolled and not proceeding
    for (const p of handed) {
      const l = world.learners.find((x) => x.person === p)
      if (p.onboardingStatus === 'enrolled' && !slice) await f7(p, 'enrolled', { learnRef: l.ref, date: l.start })
      if (p.onboardingStatus === 'not_proceeding') await f7(p, 'not_proceeding', { reason: p.notProceeding, date: p.path.at(-1)[1] })
      if (p.onboardingStatus === 'stage3') await execute(app, `update CAPTURE_DB.ILR.ONBOARDING set STATUS = 'stage3', STATUSCHANGEDAT = ?::timestamp_ltz where ONBOARDINGID = ?`,
        [at(addDays(p.handoverAt, 10), 10), onb.get(`LEAD-${p.id}`).ONBOARDINGID])
    }
    // The journeys the flows moved: their last move's real date.
    for (const p of handed) {
      const last = p.path.at(-1)
      await execute(crm, `update CRM_DB.CRM.PIPELINE_ITEM set STAGECHANGEDAT = ?::timestamp_ltz, CLOSEDAT = iff(CLOSEDAT is null, null, ?::timestamp_ltz) where ITEMID = ?`,
        [at(last[1], 15), at(last[1], 15), `ITEM-${p.id}`])
    }
    for (const e of employers.filter((x) => x.placedAt)) {
      await execute(crm, `update CRM_DB.CRM.PIPELINE_ITEM set STAGECHANGEDAT = ?::timestamp_ltz, CLOSEDAT = ?::timestamp_ltz where ITEMID = ? and STAGEID = ?`,
        [at(e.placedAt, 15), at(e.placedAt, 15), e.itemId, stageId('EMPLOYER', 'PLACED')])
    }
    log(`  F. F7: ${counts['F7 calls'] ?? 0} calls in all; journey dates set`)
    await execute(app, `update SHARED_DB.OPS.JOB_RUN set FINISHEDAT = current_timestamp(), OUTCOME = 'succeeded', SUMMARY = parse_json(?) where JOBRUNID = ?`, [JSON.stringify(counts), jobRunId])
    return { jobRunId, counts }
  } catch (err) {
    await execute(app, `update SHARED_DB.OPS.JOB_RUN set FINISHEDAT = current_timestamp(), OUTCOME = 'failed', ERROR = ?, SUMMARY = parse_json(?) where JOBRUNID = ?`,
      [String(err.message).slice(0, 1000), JSON.stringify(counts), jobRunId])
    throw err
  } finally {
    await destroy(crm)
    await destroy(app)
  }
}
