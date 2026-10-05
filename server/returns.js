// Returning from a break in learning (part 7 step 4g-2), managers only:
//
//   POST /api/learners/:ref/outcome/return        new aims from the restart date
//   POST /api/learners/:ref/outcome/undo-return   a return entered in error
//
// A return adds a new programme aim, and a new aim for each component that
// was on the break, from the restart date: flagged as restarts (RES 1) with
// the original start date (provider support manual, "Recording
// apprenticeship programmes"). The aims on the break stay as they are and
// are still returned. Prices go on the new programme aim: TNP 1 and 2 for
// the same employer, residual TNP 3 and 4 for a new one (technical funding
// guide, scenario F and "Changes in price"). Planned off-the-job hours and
// any price reduction for prior learning are copied: they're for the whole
// programme. A new employer also gets an employment status from the restart
// date and becomes the employer who sees the apprentice in Burrow.
//
// Undo is allowed while the restart has no outcome and nothing has been
// added to the ILR records since (Burrow evidence doesn't count). It marks
// everything the return added as removed and puts the employer back.
// Every change is logged in ILR.RECORD_CHANGE, as type 'return'.

import crypto from 'node:crypto'
import { execute } from './db.js'
import { IN_VISIBLE_LEARNERS, ORG_APP_FIN_RECORD, VISIBLE_LEARNER } from './access.js'
import { inTransaction, RequestError } from './burrow.js'
import { logChange } from './recordChange.js'
import { prepareEmploymentStatus, removeEmploymentStatus, writeEmploymentStatus } from './ilrRecords.js'
import { currentComponents, currentProgramme, isEnglishOrMaths } from '../src/programme.js'
import { todayString, validateReturn, teachingYearEnd } from '../src/validation.js'

const iso = (value) => (value === null || value === undefined ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10))

const AIMS = `
  select ld.AIMSEQNUMBER, ld.AIMTYPE, ld.LEARNAIMREF, ld.LEARNSTARTDATE, ld.ORIGLEARNSTARTDATE, ld.LEARNPLANENDDATE,
    ld.LEARNACTENDDATE, ld.COMPSTATUS, ld.OUTCOME, la.TITLE as AIMTITLE
  from LEARNING_DELIVERY ld
  left join LARS.LEARNING_AIM la on la.LEARN_AIM_REF = ld.LEARNAIMREF
  where ld.LEARNREFNUMBER = ? and ld.REMOVEDAT is null and ld.${IN_VISIBLE_LEARNERS}
  order by ld.AIMSEQNUMBER
`
const FAMS = `
  select AIMSEQNUMBER, LEARNDELFAMTYPE, LEARNDELFAMCODE from ILR.LEARNING_DELIVERY_FAM
  where LEARNREFNUMBER = ? and REMOVEDAT is null and ${IN_VISIBLE_LEARNERS}
`
const PRICES = `
  select AFINTYPE, AFINCODE, AFINDATE, AFINAMOUNT from ${ORG_APP_FIN_RECORD}
  where LEARNREFNUMBER = ? and AIMSEQNUMBER = ? and REMOVEDAT is null and ${IN_VISIBLE_LEARNERS}
  order by AFINDATE
`
const HOURS = `
  select HRSCODE, HRSAMOUNT from ILR.HOURS_RECORD
  where LEARNREFNUMBER = ? and AIMSEQNUMBER = ? and HRSTYPE = 'HRS' and REMOVEDAT is null and ${IN_VISIBLE_LEARNERS}
`
const EMPLOYMENT = `
  select DATEEMPSTATAPP, EMPSTAT, EMPLOYERID from ILR.EMPLOYMENT_STATUS
  where LEARNREFNUMBER = ? and REMOVEDAT is null and ${IN_VISIBLE_LEARNERS}
  order by DATEEMPSTATAPP desc
`

// The learner's aims on the break and what the return copies from them:
// { programme, components (on the break), fams (by aim number), prices,
// hours, employerId (on the latest employment status) }.
async function loadBreak(connection, ref) {
  const [learner] = await execute(connection, `select LEARNREFNUMBER from ${VISIBLE_LEARNER} where LEARNREFNUMBER = ?`, [ref])
  if (!learner) throw new RequestError('Learner not found.', 404)
  const aims = (await execute(connection, AIMS, [ref])).map((a) => ({
    ...a, LEARNSTARTDATE: iso(a.LEARNSTARTDATE), ORIGLEARNSTARTDATE: iso(a.ORIGLEARNSTARTDATE),
    LEARNPLANENDDATE: iso(a.LEARNPLANENDDATE), LEARNACTENDDATE: iso(a.LEARNACTENDDATE),
  }))
  const programme = currentProgramme(aims)
  if (!programme) throw new RequestError('This learner has no programme aim.', 409)
  if (programme.COMPSTATUS !== 6) throw new RequestError('This apprentice isn\'t on a break in learning.', 409)
  const components = currentComponents(aims).filter((c) => c.COMPSTATUS === 6)
  const fams = await execute(connection, FAMS, [ref])
  const prices = (await execute(connection, PRICES, [ref, programme.AIMSEQNUMBER])).map((p) => ({ ...p, AFINDATE: iso(p.AFINDATE), AFINCODE: Number(p.AFINCODE), AFINAMOUNT: Number(p.AFINAMOUNT) }))
  const hours = await execute(connection, HOURS, [ref, programme.AIMSEQNUMBER])
  const [employment] = await execute(connection, EMPLOYMENT, [ref])
  return {
    programme,
    components: components.map((c) => ({ ...c, englishOrMaths: isEnglishOrMaths(c.AIMTITLE) })),
    famsOf: (seq) => fams.filter((f) => f.AIMSEQNUMBER === seq),
    prices,
    hours,
    employerId: employment?.EMPLOYERID ?? null,
  }
}

const NEXT_SEQ = `
  -- including removed: a removed aim's number is never used again
  select coalesce(max(AIMSEQNUMBER), 0) + 1 as N from LEARNING_DELIVERY
  where LEARNREFNUMBER = ? and ${IN_VISIBLE_LEARNERS}
`
// A new aim copied from the one on the break: same aim, standard, funding
// and delivery details, from the restart date, with the original start.
const AIM_INSERT = `
  insert into LEARNING_DELIVERY (LEARNREFNUMBER, LEARNAIMREF, AIMTYPE, AIMSEQNUMBER, LEARNSTARTDATE, LEARNPLANENDDATE,
    FUNDMODEL, PROGTYPE, STDCODE, DELLOCPOSTCODE, COMPSTATUS, EPAORGID, ORIGLEARNSTARTDATE, PRIORLEARNFUNDADJ,
    OTHERFUNDADJ, SWSUPAIMID, UPDATEDAT, UPDATEDBY, ISTESTDATA)
  select l.LEARNREFNUMBER, o.LEARNAIMREF, o.AIMTYPE, ?, ?, ?, o.FUNDMODEL, o.PROGTYPE, o.STDCODE, o.DELLOCPOSTCODE, 1,
    o.EPAORGID, coalesce(o.ORIGLEARNSTARTDATE, o.LEARNSTARTDATE), ?, o.OTHERFUNDADJ, uuid_string(),
    current_timestamp(), ?, l.ISTESTDATA
  from ${VISIBLE_LEARNER} l
  join LEARNING_DELIVERY o on o.LEARNREFNUMBER = l.LEARNREFNUMBER and o.AIMSEQNUMBER = ? and o.REMOVEDAT is null
  where l.LEARNREFNUMBER = ?
`
const FAM_INSERT = `
  insert into ILR.LEARNING_DELIVERY_FAM (FAMID, LEARNREFNUMBER, AIMSEQNUMBER, LEARNDELFAMTYPE, LEARNDELFAMCODE, CREATEDBY, ISTESTDATA)
  select ?, l.LEARNREFNUMBER, ?, ?, ?, ?, l.ISTESTDATA
  from ${VISIBLE_LEARNER} l
  where l.LEARNREFNUMBER = ?
`
const PRICE_INSERT = `
  insert into ILR.APP_FIN_RECORD (LEARNREFNUMBER, AIMSEQNUMBER, AFINTYPE, AFINCODE, AFINDATE, AFINAMOUNT, CREATEDBY, ISTESTDATA)
  select l.LEARNREFNUMBER, ?, ?, ?, ?, ?, ?, l.ISTESTDATA
  from ${VISIBLE_LEARNER} l
  where l.LEARNREFNUMBER = ?
`
const HOURS_INSERT = `
  insert into ILR.HOURS_RECORD (LEARNREFNUMBER, AIMSEQNUMBER, HRSTYPE, HRSCODE, HRSAMOUNT, CREATEDBY, ISTESTDATA)
  select l.LEARNREFNUMBER, ?, 'HRS', ?, ?, ?, l.ISTESTDATA
  from ${VISIBLE_LEARNER} l
  where l.LEARNREFNUMBER = ?
`
const OPEN_LINKS = `
  select EMPLOYERID, FROMDATE, TODATE from ILR.LEARNER_EMPLOYER
  where LEARNREFNUMBER = ? and (TODATE is null or TODATE >= ?::date) and ${IN_VISIBLE_LEARNERS}
`
const LINK_END = `
  update ILR.LEARNER_EMPLOYER set TODATE = ?
  where LEARNREFNUMBER = ? and EMPLOYERID = ? and FROMDATE = ? and ${IN_VISIBLE_LEARNERS}
`
const LINK_ON = `
  select TODATE from ILR.LEARNER_EMPLOYER
  where LEARNREFNUMBER = ? and EMPLOYERID = ? and FROMDATE = ?::date and ${IN_VISIBLE_LEARNERS}
`
const LINK_INSERT = `
  insert into ILR.LEARNER_EMPLOYER (LEARNREFNUMBER, EMPLOYERID, FROMDATE, ISTESTDATA)
  select l.LEARNREFNUMBER, ?, ?, l.ISTESTDATA
  from ${VISIBLE_LEARNER} l
  where l.LEARNREFNUMBER = ?
`

const json = (value) => (typeof value === 'string' ? JSON.parse(value) : value ?? {})
const dayBefore = (date) => new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)
const COPIED_FAMS = ['EEF'] // dated ones (LSF and the like) are re-entered if they still apply

// Records a return. body: see validateReturn (src/validation.js).
export async function recordReturn(connection, ref, body, by) {
  const b = await loadBreak(connection, ref)
  const newEmployer = Boolean(body.employer) && body.employer !== 'same' && body.employer !== b.employerId
  const errors = validateReturn(body, {
    breakAim: { startDate: b.programme.LEARNSTARTDATE, endDate: b.programme.LEARNACTENDDATE },
    components: b.components.map((c) => ({ seq: c.AIMSEQNUMBER, startDate: c.LEARNSTARTDATE, englishOrMaths: c.englishOrMaths })),
    newEmployer, teachingYearEnd: teachingYearEnd(), today: todayString(),
  })
  const restart = body.restartDate
  // Prices on the aim on the break must be before the restart (rule R_142).
  const late = b.prices.find((p) => p.AFINTYPE === 'TNP' && p.AFINDATE >= restart)
  if (!errors.restartDate && late) errors.restartDate = `A price on the aims on the break is dated ${late.AFINDATE}: the restart must be after it (rule R_142).`
  if (Object.keys(errors).length > 0) throw new RequestError('Please fix the highlighted fields.', 400, errors)
  const status = newEmployer ? await prepareEmploymentStatus(connection, ref, { ...body, empStat: '10', dateEmpStatApp: restart }) : null

  const log = (table, key, newValues) => logChange(connection, { learnRefNumber: ref, table, key, type: 'return', newValues, by })
  await inTransaction(connection, async () => {
    let [{ N: seq }] = await execute(connection, NEXT_SEQ, [ref])
    seq = Number(seq)
    const addAim = async (old, plannedEnd, priorLearnFundAdj) => {
      const aimSeq = seq++
      await execute(connection, AIM_INSERT, [aimSeq, restart, plannedEnd, priorLearnFundAdj, by, old.AIMSEQNUMBER, ref])
      await log('LEARNING_DELIVERY', { AIMSEQNUMBER: aimSeq, LEARNAIMREF: old.LEARNAIMREF }, {
        LEARNSTARTDATE: restart, LEARNPLANENDDATE: plannedEnd, ORIGLEARNSTARTDATE: old.ORIGLEARNSTARTDATE ?? old.LEARNSTARTDATE,
        PRIORLEARNFUNDADJ: priorLearnFundAdj, RESTART_OF: old.AIMSEQNUMBER,
      })
      const fams = [{ LEARNDELFAMTYPE: 'RES', LEARNDELFAMCODE: '1' }, ...b.famsOf(old.AIMSEQNUMBER).filter((f) => COPIED_FAMS.includes(f.LEARNDELFAMTYPE))]
      for (const f of fams) {
        const famId = crypto.randomUUID()
        await execute(connection, FAM_INSERT, [famId, aimSeq, f.LEARNDELFAMTYPE, String(f.LEARNDELFAMCODE), by, ref])
        await log('LEARNING_DELIVERY_FAM', { FAMID: famId }, { AIMSEQNUMBER: aimSeq, LEARNDELFAMTYPE: f.LEARNDELFAMTYPE, LEARNDELFAMCODE: String(f.LEARNDELFAMCODE) })
      }
      return aimSeq
    }

    const programmeSeq = await addAim(b.programme, body.plannedEndDate, null)
    // Prices: total (TNP 1, 2) with the same employer, residual (TNP 3, 4) with a new one.
    const codes = newEmployer ? [3, 4] : [1, 2]
    const prices = [['TNP', codes[0], Number(body.trainingPrice)], ['TNP', codes[1], Number(body.assessmentPrice)]]
    const reduction = b.prices.filter((p) => p.AFINTYPE === 'RIP').at(-1)
    if (reduction) prices.push(['RIP', reduction.AFINCODE, reduction.AFINAMOUNT])
    for (const [type, code, amount] of prices) {
      await execute(connection, PRICE_INSERT, [programmeSeq, type, code, restart, amount, by, ref])
      await log('APP_FIN_RECORD', { AIMSEQNUMBER: programmeSeq, AFINTYPE: type, AFINCODE: code, AFINDATE: restart }, { AFINAMOUNT: amount })
    }
    // Planned hours and hours removed for prior learning are for the whole programme.
    for (const h of b.hours.filter((x) => [1, 4].includes(Number(x.HRSCODE)))) {
      await execute(connection, HOURS_INSERT, [programmeSeq, Number(h.HRSCODE), Number(h.HRSAMOUNT), by, ref])
      await log('HOURS_RECORD', { AIMSEQNUMBER: programmeSeq, HRSTYPE: 'HRS', HRSCODE: Number(h.HRSCODE) }, { HRSAMOUNT: Number(h.HRSAMOUNT) })
    }
    for (const c of b.components) {
      const cv = body.components?.[c.AIMSEQNUMBER] ?? {}
      const proportion = c.englishOrMaths && String(cv.proportion ?? '').trim() !== '' ? Number(cv.proportion) : null
      await addAim(c, cv.plannedEndDate, proportion)
    }
    if (newEmployer) {
      await writeEmploymentStatus(connection, ref, status, by, 'return')
      // The new employer sees the apprentice in Burrow from the restart date
      // (only an employer in Warren can; one entered by its ERN can't).
      if (status.EMPLOYERID) for (const link of await execute(connection, OPEN_LINKS, [ref, restart])) {
        await execute(connection, LINK_END, [dayBefore(restart), ref, link.EMPLOYERID, link.FROMDATE])
        await logChange(connection, {
          learnRefNumber: ref, table: 'LEARNER_EMPLOYER', key: { EMPLOYERID: link.EMPLOYERID, FROMDATE: iso(link.FROMDATE) }, type: 'return',
          oldValues: { TODATE: iso(link.TODATE) }, newValues: { TODATE: dayBefore(restart) }, by,
        })
      }
      if (status.EMPLOYERID) {
        // A link from an undone return to the same employer and date is
        // reopened rather than added again (the key is employer and date).
        const [earlier] = await execute(connection, LINK_ON, [ref, status.EMPLOYERID, restart])
        if (earlier) {
          await execute(connection, LINK_END, [null, ref, status.EMPLOYERID, restart])
          await logChange(connection, {
            learnRefNumber: ref, table: 'LEARNER_EMPLOYER', key: { EMPLOYERID: status.EMPLOYERID, FROMDATE: restart }, type: 'return',
            oldValues: { TODATE: iso(earlier.TODATE) }, newValues: { TODATE: null }, by,
          })
        } else {
          await execute(connection, LINK_INSERT, [status.EMPLOYERID, restart, ref])
          await log('LEARNER_EMPLOYER', { EMPLOYERID: status.EMPLOYERID, FROMDATE: restart }, { TODATE: null })
        }
      }
    }
  })
}

const RETURNED_AT = `
  select min(CHANGEDAT) as AT from ILR.RECORD_CHANGE
  where LEARNREFNUMBER = ? and TABLENAME = 'LEARNING_DELIVERY' and CHANGETYPE = 'return'
    and RECORDKEY:AIMSEQNUMBER::int = ? and ${IN_VISIBLE_LEARNERS}
`
// Changes to the ILR records since the return, other than the return's own.
// Burrow evidence and the learner's own details don't count.
const CHANGED_SINCE = `
  select TABLENAME, CHANGETYPE, CHANGEDAT from ILR.RECORD_CHANGE
  where LEARNREFNUMBER = ? and CHANGEDAT > ? and CHANGETYPE <> 'return' and ${IN_VISIBLE_LEARNERS}
    and TABLENAME in ('LEARNING_DELIVERY', 'LEARNING_DELIVERY_FAM', 'APP_FIN_RECORD', 'HOURS_RECORD',
      'EMPLOYMENT_STATUS', 'EMPLOYMENT_STATUS_MONITORING', 'LEARNER_EMPLOYER')
  order by CHANGEDAT
  limit 1
`

// Whether the latest return can be undone: { allowed, why, programme,
// components, returnedAt }.
export async function checkUndoReturn(connection, ref) {
  const aims = (await execute(connection, AIMS, [ref])).map((a) => ({ ...a, LEARNACTENDDATE: iso(a.LEARNACTENDDATE) }))
  const programme = currentProgramme(aims)
  const no = (why) => ({ allowed: false, why })
  if (!programme?.ORIGLEARNSTARTDATE || !aims.some((a) => a.AIMTYPE === 1 && a.AIMSEQNUMBER < programme.AIMSEQNUMBER && a.COMPSTATUS === 6)) {
    return no("The current programme isn't a return from a break.")
  }
  const components = currentComponents(aims)
  if (programme.COMPSTATUS !== 1 || programme.LEARNACTENDDATE || programme.OUTCOME !== null || components.some((c) => c.COMPSTATUS !== 1 || c.LEARNACTENDDATE || c.OUTCOME !== null)) {
    return no('An outcome has been recorded since the return.')
  }
  const [{ AT: returnedAt }] = await execute(connection, RETURNED_AT, [ref, programme.AIMSEQNUMBER])
  if (!returnedAt) return no("Warren didn't record this return, so it can't undo it.")
  const [later] = await execute(connection, CHANGED_SINCE, [ref, returnedAt])
  if (later) return no(`ILR records have changed since the return (${later.TABLENAME.toLowerCase().replaceAll('_', ' ')}).`)
  return { allowed: true, why: null, programme, components, returnedAt }
}

const REMOVE = (table) => `
  update ${table} set REMOVEDAT = current_timestamp(), REMOVEDBY = ?, REMOVEDREASON = ?
  where LEARNREFNUMBER = ? and AIMSEQNUMBER = ? and REMOVEDAT is null and ${IN_VISIBLE_LEARNERS}
`
const ON_AIM = (table, columns) => `
  select ${columns} from ${table}
  where LEARNREFNUMBER = ? and AIMSEQNUMBER = ? and REMOVEDAT is null and ${IN_VISIBLE_LEARNERS}
`
const PRICES_REMOVE = `
  update ILR.APP_FIN_RECORD set REMOVEDAT = current_timestamp(), REMOVEDBY = ?, REMOVEDREASON = ?
  where LEARNREFNUMBER = ? and AIMSEQNUMBER = ? and REMOVEDAT is null and ${IN_VISIBLE_LEARNERS}
`
// The return's own changes to employment and the Burrow employer link.
const RETURN_CHANGES = `
  select TABLENAME, RECORDKEY, OLDVALUES from ILR.RECORD_CHANGE
  where LEARNREFNUMBER = ? and CHANGETYPE = 'return' and CHANGEDAT >= ? and ${IN_VISIBLE_LEARNERS}
    and TABLENAME in ('EMPLOYMENT_STATUS', 'LEARNER_EMPLOYER')
`

// Undoes the latest return. body: { reason }.
export async function undoReturn(connection, ref, body, by) {
  const reason = String(body?.reason ?? '').trim()
  if (!reason) throw new RequestError('Please fix the highlighted fields.', 400, { reason: 'Say why the return is being undone.' })
  const check = await checkUndoReturn(connection, ref)
  if (!check.allowed) throw new RequestError(`This return can't be undone: ${check.why}`, 409)
  const changes = await execute(connection, RETURN_CHANGES, [ref, check.returnedAt])
  const removed = (table, key, oldValues) => logChange(connection, { learnRefNumber: ref, table, key, type: 'removed', oldValues, reason, by })

  await inTransaction(connection, async () => {
    // The new aims, with their funding and monitoring, prices and hours.
    for (const aim of [check.programme, ...check.components]) {
      const seq = aim.AIMSEQNUMBER
      for (const f of await execute(connection, ON_AIM('ILR.LEARNING_DELIVERY_FAM', 'FAMID, LEARNDELFAMTYPE, LEARNDELFAMCODE'), [ref, seq])) {
        await removed('LEARNING_DELIVERY_FAM', { FAMID: f.FAMID }, { LEARNDELFAMTYPE: f.LEARNDELFAMTYPE, LEARNDELFAMCODE: String(f.LEARNDELFAMCODE) })
      }
      await execute(connection, REMOVE('ILR.LEARNING_DELIVERY_FAM'), [by, reason, ref, seq])
      for (const p of await execute(connection, PRICES, [ref, seq])) {
        await removed('APP_FIN_RECORD', { AIMSEQNUMBER: seq, AFINTYPE: p.AFINTYPE, AFINCODE: Number(p.AFINCODE), AFINDATE: iso(p.AFINDATE) }, { AFINAMOUNT: Number(p.AFINAMOUNT) })
      }
      await execute(connection, PRICES_REMOVE, [by, reason, ref, seq])
      for (const h of await execute(connection, ON_AIM('ILR.HOURS_RECORD', 'HRSTYPE, HRSCODE, HRSAMOUNT'), [ref, seq])) {
        await removed('HOURS_RECORD', { AIMSEQNUMBER: seq, HRSTYPE: h.HRSTYPE, HRSCODE: Number(h.HRSCODE) }, { HRSAMOUNT: Number(h.HRSAMOUNT) })
      }
      await execute(connection, REMOVE('ILR.HOURS_RECORD'), [by, reason, ref, seq])
      await execute(connection, REMOVE('LEARNING_DELIVERY'), [by, reason, ref, seq])
      await removed('LEARNING_DELIVERY', { AIMSEQNUMBER: seq, LEARNAIMREF: aim.LEARNAIMREF }, { LEARNSTARTDATE: iso(aim.LEARNSTARTDATE), COMPSTATUS: aim.COMPSTATUS })
    }
    // The employment status a return to a new employer added.
    for (const c of changes.filter((x) => x.TABLENAME === 'EMPLOYMENT_STATUS')) {
      const key = json(c.RECORDKEY).DATEEMPSTATAPP
      await removeEmploymentStatus(connection, ref, key, reason, by)
    }
    // The Burrow employer link: the old one reopened as it was, the new one
    // ended the day before it began, so it never counts.
    for (const c of changes.filter((x) => x.TABLENAME === 'LEARNER_EMPLOYER')) {
      const key = json(c.RECORDKEY)
      const old = json(c.OLDVALUES)
      const toDate = c.OLDVALUES ? (old.TODATE ?? null) : dayBefore(key.FROMDATE)
      await execute(connection, LINK_END, [toDate, ref, key.EMPLOYERID, key.FROMDATE])
      await logChange(connection, {
        learnRefNumber: ref, table: 'LEARNER_EMPLOYER', key, type: 'corrected',
        newValues: { TODATE: toDate }, reason, by,
      })
    }
  })
}
