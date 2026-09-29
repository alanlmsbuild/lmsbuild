// A learner's ILR records that a manager adds, corrects and removes on the
// Record tab (part 7 step 4d): LLDD categories, learner funding and
// monitoring (FAMs) and prior attainment.
//
//   POST /api/learners/:ref/ilr/:kind                 add
//   PUT  /api/learners/:ref/ilr/:kind/:key            correct (entered in error)
//   POST /api/learners/:ref/ilr/:kind/:key/remove     remove (entered in error)
//
// kind is lldd (key: the category), learner-fam (key: TYPE-CODE, e.g.
// EHC-1) or prior (key: the date the level applies). Managers only.
//
// The rules (decided 28 September 2026): a correction changes the record in
// place and keeps the old values in ILR.RECORD_CHANGE with who and when. A
// removal never deletes: it marks the record removed (who, when and why),
// and the app and the ILR return leave it out. Every change is logged.
// Every record added copies the learner's ISTESTDATA. Every query goes
// through the one learner scope, so a learner outside it is "not found".

import { execute } from './db.js'
import { allow, IN_VISIBLE_LEARNERS, MANAGER, VISIBLE_LEARNER } from './access.js'
import { inTransaction, RequestError, sendError } from './burrow.js'
import { logChange } from './recordChange.js'
import {
  validateLearnerFamRecord,
  validateLlddRecord,
  validatePriorRecord,
  validateRemoval,
} from '../src/validation.js'

const LEARNER_QUERY = `
  select l.LEARNREFNUMBER, l.LLDDHEALTHPROB,
    (select min(ld.LEARNSTARTDATE) from LEARNING_DELIVERY ld where ld.LEARNREFNUMBER = l.LEARNREFNUMBER) as EARLIESTSTART
  from ${VISIBLE_LEARNER} l
  where l.LEARNREFNUMBER = ?
`

async function findLearner(connection, learnRefNumber) {
  const [learner] = await execute(connection, LEARNER_QUERY, [learnRefNumber])
  if (!learner) throw new RequestError('Learner not found.', 404)
  return { ...learner, EARLIESTSTART: isoDate(learner.EARLIESTSTART) }
}

function isoDate(value) {
  if (value === null || value === undefined) return null
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

function checkFields(errors) {
  if (Object.keys(errors).length > 0) throw new RequestError('Please fix the highlighted fields.', 400, errors)
}

function checkUpdated(rows) {
  if (Number(rows?.[0]?.['number of rows updated']) !== 1) {
    throw new RequestError('This record has changed since the page was opened. Reload and try again.', 409)
  }
}

// ---------------------------------------------------------------- LLDD categories

const LLDD_ACTIVE = `
  select LLDDCAT, PRIMARYLLDD
  from ILR.LLDD_HEALTH_PROBLEM
  where LEARNREFNUMBER = ? and REMOVEDAT is null and ${IN_VISIBLE_LEARNERS}
`
const LLDD_INSERT = `
  insert into ILR.LLDD_HEALTH_PROBLEM (LEARNREFNUMBER, LLDDCAT, PRIMARYLLDD, CREATEDBY, ISTESTDATA)
  select l.LEARNREFNUMBER, ?, ?, ?, l.ISTESTDATA
  from ${VISIBLE_LEARNER} l
  where l.LEARNREFNUMBER = ?
`
const LLDD_UPDATE = `
  update ILR.LLDD_HEALTH_PROBLEM
  set LLDDCAT = ?, PRIMARYLLDD = ?, UPDATEDAT = current_timestamp(), UPDATEDBY = ?
  where LEARNREFNUMBER = ? and LLDDCAT = ? and REMOVEDAT is null and ${IN_VISIBLE_LEARNERS}
`
const LLDD_REMOVE = `
  update ILR.LLDD_HEALTH_PROBLEM
  set REMOVEDAT = current_timestamp(), REMOVEDBY = ?, REMOVEDREASON = ?
  where LEARNREFNUMBER = ? and LLDDCAT = ? and REMOVEDAT is null and ${IN_VISIBLE_LEARNERS}
`

// Only one category can be primary (PrimaryLLDD_03), and the only one must
// be (PrimaryLLDD_01): making one primary takes it off any other, and a
// learner's first category is primary.
async function clearOtherPrimary(connection, ref, keepCat, active, by) {
  for (const other of active.filter((x) => x.PRIMARYLLDD && Number(x.LLDDCAT) !== keepCat)) {
    checkUpdated(await execute(connection, LLDD_UPDATE, [other.LLDDCAT, false, by, ref, other.LLDDCAT]))
    await logChange(connection, {
      learnRefNumber: ref, table: 'LLDD_HEALTH_PROBLEM', key: { LLDDCAT: Number(other.LLDDCAT) }, type: 'corrected',
      oldValues: { PRIMARYLLDD: true }, newValues: { PRIMARYLLDD: false },
      reason: `Category ${keepCat} made primary instead`, by,
    })
  }
}

const lldd = {
  async add(connection, ref, body, by) {
    const learner = await findLearner(connection, ref)
    if (learner.LLDDHEALTHPROB !== 1) {
      throw new RequestError('Please fix the highlighted fields.', 400, {
        llddCat: "Categories can only be recorded when 'LLDD health problem' says the learner has one (rule LLDDHealthProb_04). Change that first.",
      })
    }
    const cat = Number(body.llddCat)
    checkFields(validateLlddRecord(body, { earliestStart: learner.EARLIESTSTART }))
    const active = await execute(connection, LLDD_ACTIVE, [ref])
    if (active.some((x) => Number(x.LLDDCAT) === cat)) {
      throw new RequestError('Please fix the highlighted fields.', 400, { llddCat: 'This category is already recorded.' })
    }
    const primary = body.primary === true || active.length === 0
    await inTransaction(connection, async () => {
      if (primary) await clearOtherPrimary(connection, ref, cat, active, by)
      await execute(connection, LLDD_INSERT, [cat, primary, by, ref])
      await logChange(connection, {
        learnRefNumber: ref, table: 'LLDD_HEALTH_PROBLEM', key: { LLDDCAT: cat }, type: 'added',
        newValues: { LLDDCAT: cat, PRIMARYLLDD: primary }, by,
      })
    })
  },

  async correct(connection, ref, key, body, by) {
    const learner = await findLearner(connection, ref)
    const oldCat = Number(key)
    const cat = Number(body.llddCat)
    checkFields(validateLlddRecord(body, { earliestStart: learner.EARLIESTSTART }))
    const active = await execute(connection, LLDD_ACTIVE, [ref])
    const current = active.find((x) => Number(x.LLDDCAT) === oldCat)
    if (!current) throw new RequestError('Record not found.', 404)
    if (cat !== oldCat && active.some((x) => Number(x.LLDDCAT) === cat)) {
      throw new RequestError('Please fix the highlighted fields.', 400, { llddCat: 'This category is already recorded.' })
    }
    const primary = body.primary === true || active.length === 1
    if (cat === oldCat && primary === current.PRIMARYLLDD) return
    await inTransaction(connection, async () => {
      if (primary) await clearOtherPrimary(connection, ref, oldCat, active, by)
      checkUpdated(await execute(connection, LLDD_UPDATE, [cat, primary, by, ref, oldCat]))
      await logChange(connection, {
        learnRefNumber: ref, table: 'LLDD_HEALTH_PROBLEM', key: { LLDDCAT: oldCat }, type: 'corrected',
        oldValues: { LLDDCAT: oldCat, PRIMARYLLDD: current.PRIMARYLLDD }, newValues: { LLDDCAT: cat, PRIMARYLLDD: primary },
        reason: body.reason?.trim() || null, by,
      })
    })
  },

  async remove(connection, ref, key, body, by) {
    await findLearner(connection, ref)
    checkFields(validateRemoval(body))
    const cat = Number(key)
    const active = await execute(connection, LLDD_ACTIVE, [ref])
    const current = active.find((x) => Number(x.LLDDCAT) === cat)
    if (!current) throw new RequestError('Record not found.', 404)
    await inTransaction(connection, async () => {
      checkUpdated(await execute(connection, LLDD_REMOVE, [by, body.reason.trim(), ref, cat]))
      await logChange(connection, {
        learnRefNumber: ref, table: 'LLDD_HEALTH_PROBLEM', key: { LLDDCAT: cat }, type: 'removed',
        oldValues: { LLDDCAT: cat, PRIMARYLLDD: current.PRIMARYLLDD }, reason: body.reason.trim(), by,
      })
    })
  },
}

// ---------------------------------------------------------------- learner funding and monitoring

const FAM_ACTIVE = `
  select LEARNFAMTYPE, LEARNFAMCODE
  from ILR.LEARNER_FAM
  where LEARNREFNUMBER = ? and REMOVEDAT is null and ${IN_VISIBLE_LEARNERS}
`
const FAM_INSERT = `
  insert into ILR.LEARNER_FAM (LEARNREFNUMBER, LEARNFAMTYPE, LEARNFAMCODE, CREATEDBY, ISTESTDATA)
  select l.LEARNREFNUMBER, ?, ?, ?, l.ISTESTDATA
  from ${VISIBLE_LEARNER} l
  where l.LEARNREFNUMBER = ?
`
const FAM_UPDATE = `
  update ILR.LEARNER_FAM
  set LEARNFAMTYPE = ?, LEARNFAMCODE = ?, UPDATEDAT = current_timestamp(), UPDATEDBY = ?
  where LEARNREFNUMBER = ? and LEARNFAMTYPE = ? and LEARNFAMCODE = ? and REMOVEDAT is null and ${IN_VISIBLE_LEARNERS}
`
const FAM_REMOVE = `
  update ILR.LEARNER_FAM
  set REMOVEDAT = current_timestamp(), REMOVEDBY = ?, REMOVEDREASON = ?
  where LEARNREFNUMBER = ? and LEARNFAMTYPE = ? and LEARNFAMCODE = ? and REMOVEDAT is null and ${IN_VISIBLE_LEARNERS}
`

const famKey = (x) => `${x.LEARNFAMTYPE}-${Number(x.LEARNFAMCODE)}`
function splitFam(key) {
  const [type, code] = String(key).split('-')
  return { type, code: Number(code) }
}

// The ILR's limits across a learner's FAMs (others = the rest of them).
function checkFamRules(others, type, code) {
  const fail = (message) => {
    throw new RequestError('Please fix the highlighted fields.', 400, { fam: message })
  }
  if (others.some((x) => famKey(x) === `${type}-${code}`)) fail('This is already recorded.')
  if (['EHC', 'SEN', 'DLA'].includes(type) && others.some((x) => x.LEARNFAMTYPE === type)) {
    fail(`Only one ${type} record is allowed (rule LearnFAMType_09).`)
  }
  if (type === 'NLM' && others.filter((x) => x.LEARNFAMTYPE === 'NLM').length >= 2) {
    fail('Only two NLM records are allowed (rule LearnFAMType_11).')
  }
  const other = type === 'SEN' ? 'EHC' : type === 'EHC' ? 'SEN' : null
  if (other && others.some((x) => x.LEARNFAMTYPE === other)) {
    fail(`A learner can't have both SEN and an EHC plan (rule LearnFAMType_14). Remove the ${other} record first.`)
  }
}

const learnerFam = {
  async add(connection, ref, body, by) {
    await findLearner(connection, ref)
    checkFields(validateLearnerFamRecord(body))
    const { type, code } = splitFam(body.fam)
    const active = await execute(connection, FAM_ACTIVE, [ref])
    checkFamRules(active, type, code)
    await inTransaction(connection, async () => {
      await execute(connection, FAM_INSERT, [type, code, by, ref])
      await logChange(connection, {
        learnRefNumber: ref, table: 'LEARNER_FAM', key: { LEARNFAMTYPE: type, LEARNFAMCODE: code }, type: 'added',
        newValues: { LEARNFAMTYPE: type, LEARNFAMCODE: code }, by,
      })
    })
  },

  async correct(connection, ref, key, body, by) {
    await findLearner(connection, ref)
    checkFields(validateLearnerFamRecord(body))
    const old = splitFam(key)
    const next = splitFam(body.fam)
    const active = await execute(connection, FAM_ACTIVE, [ref])
    if (!active.some((x) => famKey(x) === `${old.type}-${old.code}`)) throw new RequestError('Record not found.', 404)
    if (old.type === next.type && old.code === next.code) return
    checkFamRules(active.filter((x) => famKey(x) !== `${old.type}-${old.code}`), next.type, next.code)
    await inTransaction(connection, async () => {
      checkUpdated(await execute(connection, FAM_UPDATE, [next.type, next.code, by, ref, old.type, old.code]))
      await logChange(connection, {
        learnRefNumber: ref, table: 'LEARNER_FAM', key: { LEARNFAMTYPE: old.type, LEARNFAMCODE: old.code }, type: 'corrected',
        oldValues: { LEARNFAMTYPE: old.type, LEARNFAMCODE: old.code }, newValues: { LEARNFAMTYPE: next.type, LEARNFAMCODE: next.code },
        reason: body.reason?.trim() || null, by,
      })
    })
  },

  async remove(connection, ref, key, body, by) {
    await findLearner(connection, ref)
    checkFields(validateRemoval(body))
    const { type, code } = splitFam(key)
    const active = await execute(connection, FAM_ACTIVE, [ref])
    if (!active.some((x) => famKey(x) === `${type}-${code}`)) throw new RequestError('Record not found.', 404)
    await inTransaction(connection, async () => {
      checkUpdated(await execute(connection, FAM_REMOVE, [by, body.reason.trim(), ref, type, code]))
      await logChange(connection, {
        learnRefNumber: ref, table: 'LEARNER_FAM', key: { LEARNFAMTYPE: type, LEARNFAMCODE: code }, type: 'removed',
        oldValues: { LEARNFAMTYPE: type, LEARNFAMCODE: code }, reason: body.reason.trim(), by,
      })
    })
  },
}

// ---------------------------------------------------------------- prior attainment

const PRIOR_ACTIVE = `
  select PRIORLEVEL, DATELEVELAPP
  from ILR.PRIOR_ATTAINMENT
  where LEARNREFNUMBER = ? and REMOVEDAT is null and ${IN_VISIBLE_LEARNERS}
`
const PRIOR_INSERT = `
  insert into ILR.PRIOR_ATTAINMENT (LEARNREFNUMBER, PRIORLEVEL, DATELEVELAPP, CREATEDBY, ISTESTDATA)
  select l.LEARNREFNUMBER, ?, ?, ?, l.ISTESTDATA
  from ${VISIBLE_LEARNER} l
  where l.LEARNREFNUMBER = ?
`
const PRIOR_UPDATE = `
  update ILR.PRIOR_ATTAINMENT
  set PRIORLEVEL = ?, DATELEVELAPP = ?, UPDATEDAT = current_timestamp(), UPDATEDBY = ?
  where LEARNREFNUMBER = ? and DATELEVELAPP = ? and REMOVEDAT is null and ${IN_VISIBLE_LEARNERS}
`
const PRIOR_REMOVE = `
  update ILR.PRIOR_ATTAINMENT
  set REMOVEDAT = current_timestamp(), REMOVEDBY = ?, REMOVEDREASON = ?
  where LEARNREFNUMBER = ? and DATELEVELAPP = ? and REMOVEDAT is null and ${IN_VISIBLE_LEARNERS}
`

const sameDate = 'Another prior attainment record has this date (rule PriorAttain_10).'

const prior = {
  async add(connection, ref, body, by) {
    await findLearner(connection, ref)
    checkFields(validatePriorRecord(body))
    const active = await execute(connection, PRIOR_ACTIVE, [ref])
    if (active.some((x) => isoDate(x.DATELEVELAPP) === body.dateLevelApp)) {
      throw new RequestError('Please fix the highlighted fields.', 400, { dateLevelApp: sameDate })
    }
    const level = Number(body.priorLevel)
    await inTransaction(connection, async () => {
      await execute(connection, PRIOR_INSERT, [level, body.dateLevelApp, by, ref])
      await logChange(connection, {
        learnRefNumber: ref, table: 'PRIOR_ATTAINMENT', key: { DATELEVELAPP: body.dateLevelApp }, type: 'added',
        newValues: { PRIORLEVEL: level, DATELEVELAPP: body.dateLevelApp }, by,
      })
    })
  },

  async correct(connection, ref, key, body, by) {
    await findLearner(connection, ref)
    checkFields(validatePriorRecord(body))
    const active = await execute(connection, PRIOR_ACTIVE, [ref])
    const current = active.find((x) => isoDate(x.DATELEVELAPP) === key)
    if (!current) throw new RequestError('Record not found.', 404)
    if (body.dateLevelApp !== key && active.some((x) => isoDate(x.DATELEVELAPP) === body.dateLevelApp)) {
      throw new RequestError('Please fix the highlighted fields.', 400, { dateLevelApp: sameDate })
    }
    const level = Number(body.priorLevel)
    if (level === Number(current.PRIORLEVEL) && body.dateLevelApp === key) return
    await inTransaction(connection, async () => {
      checkUpdated(await execute(connection, PRIOR_UPDATE, [level, body.dateLevelApp, by, ref, key]))
      await logChange(connection, {
        learnRefNumber: ref, table: 'PRIOR_ATTAINMENT', key: { DATELEVELAPP: key }, type: 'corrected',
        oldValues: { PRIORLEVEL: Number(current.PRIORLEVEL), DATELEVELAPP: key },
        newValues: { PRIORLEVEL: level, DATELEVELAPP: body.dateLevelApp },
        reason: body.reason?.trim() || null, by,
      })
    })
  },

  async remove(connection, ref, key, body, by) {
    await findLearner(connection, ref)
    checkFields(validateRemoval(body))
    const active = await execute(connection, PRIOR_ACTIVE, [ref])
    const current = active.find((x) => isoDate(x.DATELEVELAPP) === key)
    if (!current) throw new RequestError('Record not found.', 404)
    await inTransaction(connection, async () => {
      checkUpdated(await execute(connection, PRIOR_REMOVE, [by, body.reason.trim(), ref, key]))
      await logChange(connection, {
        learnRefNumber: ref, table: 'PRIOR_ATTAINMENT', key: { DATELEVELAPP: key }, type: 'removed',
        oldValues: { PRIORLEVEL: Number(current.PRIORLEVEL), DATELEVELAPP: key }, reason: body.reason.trim(), by,
      })
    })
  },
}

const KINDS = { lldd, 'learner-fam': learnerFam, prior }

function kindOf(req) {
  const kind = KINDS[req.params.kind]
  if (!kind) throw new RequestError('Not found.', 404)
  return kind
}

export function registerIlrRecordRoutes(app) {
  app.post('/api/learners/:learnRefNumber/ilr/:kind', allow(MANAGER), async (req, res) => {
    try {
      await kindOf(req).add(req.db, req.params.learnRefNumber, req.body ?? {}, req.user.USERID)
      res.status(201).json({ saved: true })
    } catch (err) {
      sendError(res, err, 'Could not add this record')
    }
  })

  app.put('/api/learners/:learnRefNumber/ilr/:kind/:key', allow(MANAGER), async (req, res) => {
    try {
      await kindOf(req).correct(req.db, req.params.learnRefNumber, req.params.key, req.body ?? {}, req.user.USERID)
      res.json({ saved: true })
    } catch (err) {
      sendError(res, err, 'Could not correct this record')
    }
  })

  app.post('/api/learners/:learnRefNumber/ilr/:kind/:key/remove', allow(MANAGER), async (req, res) => {
    try {
      await kindOf(req).remove(req.db, req.params.learnRefNumber, req.params.key, req.body ?? {}, req.user.USERID)
      res.json({ removed: true })
    } catch (err) {
      sendError(res, err, 'Could not remove this record')
    }
  })
}
