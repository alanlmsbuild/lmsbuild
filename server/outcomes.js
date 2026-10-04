// Recording the programme's outcome, as docs/ilr-outcomes.md sets out
// (managers only):
//
//   POST /api/learners/:ref/outcome/learning-complete   training finished,
//        waiting for the EPA: programme CompStatus 1 with an end date and
//        Outcome 8; every open component closed (CompStatus 2, its own end
//        date and outcome); actual off-the-job hours recorded.
//   POST .../outcome/epa-result   passed (Outcome 1, grade) or failed
//        (Outcome 3, FL): CompStatus 2 and AchDate, the end of the EPA period.
//   POST .../outcome/withdraw     CompStatus 3, Outcome 3, the reason; open
//        components withdrawn the same way. Also for a learner on a break who
//        doesn't come back (the break's end date stays).
//   POST .../outcome/break        CompStatus 6, Outcome 3; open components too.
//   POST .../outcome/correct      fix the dates, grade or reason of an
//        outcome entered in error (the old values kept).
//
// An aim's funding and monitoring records that run past its new end date
// end on it too. Every aim and record changed is logged in
// ILR.RECORD_CHANGE. Returning from a break (a new programme aim) is part 7
// step 4g-2.

import { execute } from './db.js'
import { allow, IN_VISIBLE_LEARNERS, MANAGER, VISIBLE_LEARNER } from './access.js'
import { inTransaction, RequestError, sendError } from './burrow.js'
import { logChange } from './recordChange.js'
import { todayString, validateOutcome } from '../src/validation.js'

const iso = (value) => {
  if (value === null || value === undefined) return null
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

const AIMS = `
  select AIMSEQNUMBER, AIMTYPE, LEARNAIMREF, LEARNSTARTDATE, COMPSTATUS, LEARNACTENDDATE, OUTCOME, ACHDATE, OUTGRADE, WITHDRAWREASON
  from LEARNING_DELIVERY
  where LEARNREFNUMBER = ? and ${IN_VISIBLE_LEARNERS}
  order by AIMSEQNUMBER
`
const SET_AIM = `
  update LEARNING_DELIVERY
  set COMPSTATUS = ?, LEARNACTENDDATE = ?, OUTCOME = ?, ACHDATE = ?, OUTGRADE = ?, WITHDRAWREASON = ?,
    UPDATEDAT = current_timestamp(), UPDATEDBY = ?
  where LEARNREFNUMBER = ? and AIMSEQNUMBER = ? and ${IN_VISIBLE_LEARNERS}
`
const ACTUAL_HOURS = `
  select HRSAMOUNT from ILR.HOURS_RECORD
  where LEARNREFNUMBER = ? and AIMSEQNUMBER = 1 and HRSTYPE = 'HRS' and HRSCODE = 3 and REMOVEDAT is null and ${IN_VISIBLE_LEARNERS}
`
const HRS3_INSERT = `
  insert into ILR.HOURS_RECORD (LEARNREFNUMBER, AIMSEQNUMBER, HRSTYPE, HRSCODE, HRSAMOUNT, CREATEDBY, ISTESTDATA)
  select l.LEARNREFNUMBER, 1, 'HRS', 3, ?, ?, l.ISTESTDATA
  from ${VISIBLE_LEARNER} l
  where l.LEARNREFNUMBER = ?
`
const HRS3_UPDATE = `
  update ILR.HOURS_RECORD
  set HRSAMOUNT = ?, UPDATEDAT = current_timestamp(), UPDATEDBY = ?
  where LEARNREFNUMBER = ? and AIMSEQNUMBER = 1 and HRSTYPE = 'HRS' and HRSCODE = 3 and REMOVEDAT is null and ${IN_VISIBLE_LEARNERS}
`
// An aim's dated funding and monitoring records (e.g. learning support,
// LSF) can't run past its actual end date (rule LearnDelFAMDateTo_03).
const FAMS_PAST_END = `
  select FAMID, LEARNDELFAMTYPE, LEARNDELFAMCODE, DATETO
  from ILR.LEARNING_DELIVERY_FAM
  where LEARNREFNUMBER = ? and AIMSEQNUMBER = ? and REMOVEDAT is null and DATETO > ?::date and ${IN_VISIBLE_LEARNERS}
`
const FAM_END = `
  update ILR.LEARNING_DELIVERY_FAM
  set DATETO = ?, UPDATEDAT = current_timestamp(), UPDATEDBY = ?
  where FAMID = ? and LEARNREFNUMBER = ? and REMOVEDAT is null and ${IN_VISIBLE_LEARNERS}
`

const FIELDS = ['COMPSTATUS', 'LEARNACTENDDATE', 'OUTCOME', 'ACHDATE', 'OUTGRADE', 'WITHDRAWREASON']
const valuesOf = (a) => ({
  COMPSTATUS: a.COMPSTATUS,
  LEARNACTENDDATE: iso(a.LEARNACTENDDATE),
  OUTCOME: a.OUTCOME ?? null,
  ACHDATE: iso(a.ACHDATE),
  OUTGRADE: a.OUTGRADE ?? null,
  WITHDRAWREASON: a.WITHDRAWREASON ?? null,
})

async function loadAims(connection, ref) {
  const [learner] = await execute(connection, `select LEARNREFNUMBER from ${VISIBLE_LEARNER} where LEARNREFNUMBER = ?`, [ref])
  if (!learner) throw new RequestError('Learner not found.', 404)
  const aims = (await execute(connection, AIMS, [ref])).map((a) => ({ ...a, ...valuesOf(a), LEARNSTARTDATE: iso(a.LEARNSTARTDATE) }))
  const programme = aims.find((a) => a.AIMTYPE === 1 && a.AIMSEQNUMBER === 1)
  if (!programme) throw new RequestError('This learner has no programme aim.', 409)
  return { programme, components: aims.filter((a) => a.AIMTYPE === 3) }
}

// Sets an aim's outcome fields and logs the ones that change. why: the
// reason given for a correction.
async function setAim(connection, ref, aim, next, by, why = null, type = 'outcome') {
  const before = valuesOf(aim)
  const after = { ...before, ...next }
  const changed = FIELDS.filter((f) => JSON.stringify(before[f]) !== JSON.stringify(after[f]))
  if (changed.length === 0) return
  const rows = await execute(connection, SET_AIM, [...FIELDS.map((f) => after[f]), by, ref, aim.AIMSEQNUMBER])
  if (Number(rows?.[0]?.['number of rows updated']) !== 1) throw new Error('An aim could not be updated.')
  await logChange(connection, {
    learnRefNumber: ref, table: 'LEARNING_DELIVERY', key: { AIMSEQNUMBER: aim.AIMSEQNUMBER, LEARNAIMREF: aim.LEARNAIMREF },
    type, oldValues: Object.fromEntries(changed.map((f) => [f, before[f]])), newValues: Object.fromEntries(changed.map((f) => [f, after[f]])),
    reason: why, by,
  })
  if (after.LEARNACTENDDATE) {
    for (const fam of await execute(connection, FAMS_PAST_END, [ref, aim.AIMSEQNUMBER, after.LEARNACTENDDATE])) {
      await execute(connection, FAM_END, [after.LEARNACTENDDATE, by, fam.FAMID, ref])
      await logChange(connection, {
        learnRefNumber: ref, table: 'LEARNING_DELIVERY_FAM', key: { FAMID: fam.FAMID }, type,
        oldValues: { DATETO: iso(fam.DATETO) }, newValues: { DATETO: after.LEARNACTENDDATE }, reason: why, by,
      })
    }
  }
}

async function setActualHours(connection, ref, value, by) {
  const text = String(value ?? '').trim()
  if (text === '') return
  const next = Number(text)
  const [current] = await execute(connection, ACTUAL_HOURS, [ref])
  const key = { AIMSEQNUMBER: 1, HRSTYPE: 'HRS', HRSCODE: 3 }
  if (!current) {
    await execute(connection, HRS3_INSERT, [next, by, ref])
    await logChange(connection, { learnRefNumber: ref, table: 'HOURS_RECORD', key, type: 'added', newValues: { HRSAMOUNT: next }, by })
  } else if (Number(current.HRSAMOUNT) !== next) {
    await execute(connection, HRS3_UPDATE, [next, by, ref])
    await logChange(connection, {
      learnRefNumber: ref, table: 'HOURS_RECORD', key, type: 'outcome',
      oldValues: { HRSAMOUNT: Number(current.HRSAMOUNT) }, newValues: { HRSAMOUNT: next }, by,
    })
  }
}

const programmeCtx = (p) => ({ startDate: p.LEARNSTARTDATE, compStatus: p.COMPSTATUS, outcome: p.OUTCOME, actualEndDate: p.LEARNACTENDDATE })

async function record(connection, ref, action, body, by) {
  const { programme, components } = await loadAims(connection, ref)
  const open = components.filter((c) => c.COMPSTATUS === 1 && !c.LEARNACTENDDATE)
  const errors = validateOutcome(action, body, {
    programme: programmeCtx(programme),
    components: open.map((c) => ({ seq: c.AIMSEQNUMBER, startDate: c.LEARNSTARTDATE })),
    latestComponentEnd: components.map((c) => c.LEARNACTENDDATE).filter(Boolean).sort().at(-1) ?? null,
    today: todayString(),
  })
  if (errors.action) throw new RequestError(errors.action, 409)
  if (Object.keys(errors).length > 0) throw new RequestError('Please fix the highlighted fields.', 400, errors)

  await inTransaction(connection, async () => {
    if (action === 'learning-complete') {
      for (const c of open) {
        const cv = body.components[c.AIMSEQNUMBER]
        await setAim(connection, ref, c, { COMPSTATUS: 2, LEARNACTENDDATE: cv.endDate, OUTCOME: Number(cv.outcome) }, by)
      }
      await setAim(connection, ref, programme, { LEARNACTENDDATE: body.endDate, OUTCOME: 8 }, by)
      await setActualHours(connection, ref, body.actualHours, by)
    }
    if (action === 'epa-result') {
      const passed = body.result === 'passed'
      await setAim(connection, ref, programme, {
        COMPSTATUS: 2, OUTCOME: passed ? 1 : 3, ACHDATE: body.achDate, OUTGRADE: passed ? body.grade : 'FL',
      }, by)
    }
    if (action === 'withdraw') {
      const reason = Number(body.reason)
      const endDate = programme.LEARNACTENDDATE ?? body.endDate
      // Open components end with the programme; ones on a break keep their date.
      for (const c of components.filter((x) => x.COMPSTATUS === 1 || x.COMPSTATUS === 6)) {
        await setAim(connection, ref, c, {
          COMPSTATUS: 3, LEARNACTENDDATE: c.LEARNACTENDDATE ?? endDate, OUTCOME: 3, WITHDRAWREASON: reason, ACHDATE: null, OUTGRADE: null,
        }, by)
      }
      await setAim(connection, ref, programme, {
        COMPSTATUS: 3, LEARNACTENDDATE: endDate, OUTCOME: 3, WITHDRAWREASON: reason, ACHDATE: null, OUTGRADE: null,
      }, by)
      await setActualHours(connection, ref, body.actualHours, by)
    }
    if (action === 'break') {
      for (const c of open) {
        await setAim(connection, ref, c, { COMPSTATUS: 6, LEARNACTENDDATE: body.endDate, OUTCOME: 3 }, by)
      }
      await setAim(connection, ref, programme, { COMPSTATUS: 6, LEARNACTENDDATE: body.endDate, OUTCOME: 3 }, by)
    }
    if (action === 'correct') {
      const next = { LEARNACTENDDATE: body.endDate }
      if (programme.COMPSTATUS === 2) {
        next.ACHDATE = body.achDate
        if (programme.OUTCOME === 1) next.OUTGRADE = body.grade
      }
      if (programme.COMPSTATUS === 3) next.WITHDRAWREASON = Number(body.reason)
      await setAim(connection, ref, programme, next, by, String(body.why).trim(), 'corrected')
    }
  })
}

export function registerOutcomeRoutes(app) {
  app.post('/api/learners/:learnRefNumber/outcome/:action', allow(MANAGER), async (req, res) => {
    const { learnRefNumber, action } = req.params
    if (!['learning-complete', 'epa-result', 'withdraw', 'break', 'correct'].includes(action)) {
      res.status(404).json({ error: 'Not found.' })
      return
    }
    try {
      await record(req.db, learnRefNumber, action, req.body ?? {}, req.user.USERID)
      res.json({ saved: true })
    } catch (err) {
      sendError(res, err, 'Could not record the outcome')
    }
  })
}
