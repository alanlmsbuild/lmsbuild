import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import { execute } from './db.js'
import {
  allow,
  ASSESSOR,
  attachUser,
  CURRENT_ISTESTDATA,
  CURRENT_ORGANISATIONID,
  EMPLOYER,
  IN_ORG_LEARNERS,
  LEARNER,
  MANAGER,
  ORG_APP_USER,
  ORG_LEARNER,
  ORG_OFFICER,
  ORG_OFFICER_ASSIGNMENT,
  STAFF,
  TUTOR,
  VISIBLE_LEARNER,
  VISIBLE_OFFICER,
} from './access.js'
import {
  validateLearnerForm,
  validateLearnerEditForm,
  validateCompleteAimForm,
  validateWithdrawAimForm,
  validateOfficerForm,
  todayString,
} from '../src/validation.js'
import { OUTCOME_ACHIEVED } from '../src/ilrCodes.js'
import { standardLabel } from '../src/lookups.js'
import { registerReportRoutes } from './reports.js'
import { registerIlrRoutes } from './ilr/routes.js'
import { registerMyDayRoutes } from './myday.js'
import { registerBurrowRoutes } from './burrow.js'
import { registerIqaRoutes } from './iqa.js'
import { registerEmployerRoutes } from './employer.js'
import { refuseTestSignInInProduction, registerDevUserRoutes, testSignInEnabled } from './devUsers.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })

refuseTestSignInInProduction()

const app = express()
app.use(cors())
app.use(express.json())

// Development only: test sign-in (TEST_SIGN_IN=true). Registered before
// attachUser, since it runs before anyone is signed in.
registerDevUserRoutes(app)

// Every API request is made as the signed-in user, and only sees their
// organisation's data (see access.js). Each route then says which roles may
// use it with allow(...). Only managers change ILR records and caseloads.
app.use('/api', attachUser)

// Selects every column the browser needs both to list learners and to
// pre-fill the edit / mark-completed forms, so no separate "get one
// learner" endpoint is needed.
const LEARNERS_QUERY = `
  select
    l.LEARNREFNUMBER,
    l.ULN,
    l.GIVENNAMES,
    l.FAMILYNAME,
    l.DATEOFBIRTH,
    l.ETHNICITY,
    l.SEX,
    l.LLDDHEALTHPROB,
    l.NINUMBER,
    l.POSTCODEPRIOR,
    l.POSTCODE,
    l.TELNO,
    l.EMAIL,
    l.TITLE,
    l.ADDRESSLINE1,
    l.ADDRESSLINE2,
    l.ADDRESSLINE3,
    l.WARDORCOUNTY,
    l.MOBILENO,
    l.CONTACTMETHODSALLOWED,
    l.PREFERREDCONTACTMETHOD,
    l.NEXTOFKINNAME,
    l.NEXTOFKINRELATIONSHIP,
    l.NEXTOFKINPHONE,
    l.CONTRACTTYPE,
    ld.LEARNAIMREF,
    ld.AIMTYPE,
    ld.PROGTYPE,
    ld.STDCODE,
    s.REFERENCE as STDREFERENCE,
    s.NAME as STDNAME,
    s.NOTIONAL_END_LEVEL as STDLEVEL,
    ld.FUNDMODEL,
    ld.LEARNSTARTDATE,
    ld.LEARNPLANENDDATE,
    ld.DELLOCPOSTCODE,
    ld.LEARNACTENDDATE,
    ld.COMPSTATUS,
    ld.OUTCOME,
    ld.ACHDATE,
    ld.WITHDRAWREASON
  from ${VISIBLE_LEARNER} l
  join LEARNING_DELIVERY ld
    on l.LEARNREFNUMBER = ld.LEARNREFNUMBER
   and ld.LEARNAIMREF = 'ZPROG001'
   and ld.AIMSEQNUMBER = 1
  left join LARS.STANDARD s
    on s.STANDARD_CODE = ld.STDCODE
  order by l.LEARNREFNUMBER
`

app.get('/api/learners', allow(STAFF), async (req, res) => {
  const connection = req.db
  try {
    const rows = await execute(connection, LEARNERS_QUERY)
    res.json(rows)
  } catch (err) {
    console.error('Failed to fetch learners:', err.message)
    res.status(500).json({ error: 'Failed to fetch learners' })
  }
})

// A standard is open for new starts when neither its last date for starts
// nor its effective-to date has passed. Both placeholders are today's date.
const STANDARD_IS_OPEN = `
  (LAST_DATE_STARTS is null or LAST_DATE_STARTS >= ?)
  and (EFFECTIVE_TO is null or EFFECTIVE_TO >= ?)
`

// Same column names as the STDREFERENCE / STDNAME / STDLEVEL columns on
// each learner row, so standardLabel() in lookups.js works on either.
const STANDARDS_QUERY = `
  select
    STANDARD_CODE as STDCODE,
    REFERENCE as STDREFERENCE,
    NAME as STDNAME,
    NOTIONAL_END_LEVEL as STDLEVEL,
    ${STANDARD_IS_OPEN} as ISOPEN
  from LARS.STANDARD
  order by REFERENCE, STANDARD_CODE
`

const STANDARD_BY_CODE_QUERY = `
  select
    STANDARD_CODE as STDCODE,
    REFERENCE as STDREFERENCE,
    NAME as STDNAME,
    NOTIONAL_END_LEVEL as STDLEVEL,
    ${STANDARD_IS_OPEN} as ISOPEN
  from LARS.STANDARD
  where STANDARD_CODE = ?
`

app.get('/api/standards', allow(STAFF), async (req, res) => {
  const connection = req.db
  try {
    const today = todayString()
    const rows = await execute(connection, STANDARDS_QUERY, [today, today])
    res.json(rows)
  } catch (err) {
    console.error('Failed to fetch standards:', err.message)
    res.status(500).json({ error: 'Failed to fetch standards' })
  }
})

// Snowflake doesn't enforce the link from LEARNING_DELIVERY.STDCODE to
// LARS.STANDARD, so every save checks it here. A closed standard is only
// accepted when it's the one the aim is already on (keptCode), so a learner
// who started before their standard closed can still be edited. Returns an
// error message for the stdCode field, or null if the standard is fine.
async function checkStandard(connection, stdCode, keptCode = null) {
  const code = Number(stdCode)
  const today = todayString()
  const [standard] = await execute(connection, STANDARD_BY_CODE_QUERY, [today, today, code])
  if (!standard) {
    return `Standard code ${code} is not in the LARS standards list.`
  }
  if (!standard.ISOPEN && code !== keptCode) {
    return keptCode === null
      ? `${standardLabel(standard)} is closed to new starts, so it can't be used for a new learner. Choose an open standard.`
      : `${standardLabel(standard)} is closed to new starts. Choose an open standard, or keep the learner's current one.`
  }
  return null
}

// Finds the highest existing TESTL learner reference and returns the next
// one in the same style, e.g. current highest TESTL0012 -> TESTL0013.
// Deliberately across every organisation: LEARNREFNUMBER is the table's
// key, so it must be unique everywhere. Only the reference is read.
const HIGHEST_REF_QUERY = `
  select LEARNREFNUMBER
  from LEARNER -- all organisations
  where LEARNREFNUMBER like 'TESTL%'
  order by LEARNREFNUMBER desc
  limit 1
`

async function nextLearnRefNumber(connection) {
  const rows = await execute(connection, HIGHEST_REF_QUERY)
  const highest = rows[0]?.LEARNREFNUMBER
  const highestNumber = highest ? Number(highest.slice('TESTL'.length)) : 0
  return `TESTL${String(highestNumber + 1).padStart(4, '0')}`
}

// A ULN must not already belong to a different learner in the same
// organisation. The same person can be a learner at another provider, with
// the same ULN, and this must not reveal that. excludeLearnRefNumber
// is the learner being added or edited, so it doesn't flag itself as a
// conflict when editing.
const ULN_CONFLICT_QUERY = `
  select LEARNREFNUMBER from ${ORG_LEARNER} where ULN = ? and LEARNREFNUMBER <> ?
`

async function isUlnTaken(connection, uln, excludeLearnRefNumber) {
  const rows = await execute(connection, ULN_CONFLICT_QUERY, [uln, excludeLearnRefNumber])
  return rows.length > 0
}

// The one row (learner joined with their aim) that the edit,
// mark-completed, and withdraw routes all need to read before they can
// validate or update anything.
const LEARNER_BY_REF_QUERY = `
  select
    l.LEARNREFNUMBER,
    ld.LEARNSTARTDATE,
    ld.STDCODE,
    ld.COMPSTATUS
  from ${ORG_LEARNER} l
  join LEARNING_DELIVERY ld
    on l.LEARNREFNUMBER = ld.LEARNREFNUMBER
   and ld.LEARNAIMREF = 'ZPROG001'
   and ld.AIMSEQNUMBER = 1
  where l.LEARNREFNUMBER = ?
`

async function findLearnerAim(connection, learnRefNumber) {
  const rows = await execute(connection, LEARNER_BY_REF_QUERY, [learnRefNumber])
  const row = rows[0]
  if (!row) return null
  // The Snowflake driver can hand back a DATE column as either a Date
  // object or a 'YYYY-MM-DD' string depending on driver settings, but the
  // rest of this file compares dates as plain ISO strings, so normalise it
  // once here.
  return { ...row, LEARNSTARTDATE: toIsoDateString(row.LEARNSTARTDATE) }
}

function toIsoDateString(value) {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

// CONTACTMETHODSALLOWED is stored as a single comma-separated column, but
// the browser sends/receives it as an array of codes.
function joinContactMethods(value) {
  if (!Array.isArray(value) || value.length === 0) return null
  return value.join(',')
}

const INSERT_LEARNER = `
  insert into LEARNER (
    LEARNREFNUMBER, ULN, FAMILYNAME, GIVENNAMES, DATEOFBIRTH,
    ETHNICITY, SEX, LLDDHEALTHPROB, NINUMBER, POSTCODEPRIOR, POSTCODE, TELNO, EMAIL,
    TITLE, ADDRESSLINE1, ADDRESSLINE2, ADDRESSLINE3, WARDORCOUNTY, MOBILENO,
    CONTACTMETHODSALLOWED, PREFERREDCONTACTMETHOD,
    NEXTOFKINNAME, NEXTOFKINRELATIONSHIP, NEXTOFKINPHONE, CONTRACTTYPE, ORGANISATIONID, ISTESTDATA
  ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${CURRENT_ORGANISATIONID}, ${CURRENT_ISTESTDATA})
`

// The aim fields fixed by the milestone spec (LEARNAIMREF, AIMTYPE,
// AIMSEQNUMBER, FUNDMODEL, PROGTYPE, COMPSTATUS) are written as literals
// rather than bound values since they never vary for this form.
const INSERT_LEARNING_DELIVERY = `
  insert into LEARNING_DELIVERY (
    LEARNREFNUMBER, LEARNAIMREF, AIMTYPE, AIMSEQNUMBER, LEARNSTARTDATE, LEARNPLANENDDATE,
    FUNDMODEL, PROGTYPE, STDCODE, DELLOCPOSTCODE, COMPSTATUS, ISTESTDATA
  ) values (?, 'ZPROG001', 1, 1, ?, ?, 36, 25, ?, ?, 1, ${CURRENT_ISTESTDATA})
`

app.post('/api/learners', allow(MANAGER), async (req, res) => {
  const fieldErrors = validateLearnerForm(req.body)
  if (Object.keys(fieldErrors).length > 0) {
    return res.status(400).json({
      error: 'Please fix the highlighted fields.',
      fields: fieldErrors,
    })
  }

  const v = req.body
  const connection = req.db
  try {

    const standardError = await checkStandard(connection, v.stdCode)
    if (standardError) {
      res.status(400).json({
        error: 'Please fix the highlighted fields.',
        fields: { stdCode: standardError },
      })
      return
    }

    const learnRefNumber = await nextLearnRefNumber(connection)

    if (await isUlnTaken(connection, Number(v.uln), learnRefNumber)) {
      res.status(400).json({
        error: 'Please fix the highlighted fields.',
        fields: { uln: 'This ULN is already used by another learner.' },
      })
      return
    }

    await execute(connection, 'begin')

    await execute(connection, INSERT_LEARNER, [
      learnRefNumber,
      Number(v.uln),
      v.familyName?.trim() || null,
      v.givenNames?.trim() || null,
      v.dateOfBirth || null,
      Number(v.ethnicity),
      v.sex,
      Number(v.lldd),
      v.niNumber ? v.niNumber.trim().toUpperCase() : null,
      v.postcodePrior.trim().toUpperCase(),
      v.postcode.trim().toUpperCase(),
      v.phone?.trim() || null,
      v.email?.trim() || null,
      v.title?.trim() || null,
      v.addressLine1?.trim() || null,
      v.addressLine2?.trim() || null,
      v.addressLine3?.trim() || null,
      v.wardOrCounty?.trim() || null,
      v.mobile?.trim() || null,
      joinContactMethods(v.contactMethodsAllowed),
      v.preferredContactMethod?.trim() || null,
      v.nextOfKinName?.trim() || null,
      v.nextOfKinRelationship?.trim() || null,
      v.nextOfKinPhone?.trim() || null,
      v.contractType?.trim() || null,
    ])

    await execute(connection, INSERT_LEARNING_DELIVERY, [
      learnRefNumber,
      v.startDate,
      v.plannedEndDate,
      Number(v.stdCode),
      v.dellocPostcode.trim().toUpperCase(),
    ])

    await execute(connection, 'commit')
    res.status(201).json({ learnRefNumber })
  } catch (err) {
    if (connection) {
      try {
        await execute(connection, 'rollback')
      } catch (rollbackErr) {
        console.error('Failed to roll back transaction:', rollbackErr.message)
      }
    }
    console.error('Failed to add learner:', err.message)
    res.status(500).json({ error: 'Could not save the new learner. Please try again.' })
  }
})

// Only these columns can ever be written by PUT /api/learners/:learnRefNumber
// - anything else in the request body is ignored, because these two
// statements never reference it.
const UPDATE_LEARNER = `
  update LEARNER set
    ULN = ?, FAMILYNAME = ?, GIVENNAMES = ?, DATEOFBIRTH = ?,
    ETHNICITY = ?, SEX = ?, LLDDHEALTHPROB = ?, NINUMBER = ?,
    POSTCODEPRIOR = ?, POSTCODE = ?, TELNO = ?, EMAIL = ?,
    TITLE = ?, ADDRESSLINE1 = ?, ADDRESSLINE2 = ?, ADDRESSLINE3 = ?,
    WARDORCOUNTY = ?, MOBILENO = ?, CONTACTMETHODSALLOWED = ?, PREFERREDCONTACTMETHOD = ?,
    NEXTOFKINNAME = ?, NEXTOFKINRELATIONSHIP = ?, NEXTOFKINPHONE = ?, CONTRACTTYPE = ?
  where LEARNREFNUMBER = ? and ${IN_ORG_LEARNERS}
`

const UPDATE_LEARNING_DELIVERY = `
  update LEARNING_DELIVERY set
    LEARNSTARTDATE = ?, LEARNPLANENDDATE = ?, STDCODE = ?, DELLOCPOSTCODE = ?
  where LEARNREFNUMBER = ? and LEARNAIMREF = 'ZPROG001' and AIMSEQNUMBER = 1 and ${IN_ORG_LEARNERS}
`

app.put('/api/learners/:learnRefNumber', allow(MANAGER), async (req, res) => {
  const { learnRefNumber } = req.params
  const connection = req.db
  try {

    const existing = await findLearnerAim(connection, learnRefNumber)
    if (!existing) {
      res.status(404).json({ error: 'Learner not found.' })
      return
    }

    // The start date and standard code can only be changed while the aim is
    // still continuing (COMPSTATUS 1). Once it's completed or withdrawn,
    // both are locked - the browser disables the fields (see
    // EditLearnerForm's aimLocked), and this check enforces it server-side
    // too in case that was bypassed.
    const aimLocked = existing.COMPSTATUS !== 1
    const fieldErrors = validateLearnerEditForm(req.body)

    const v = req.body
    if (aimLocked && v.startDate !== existing.LEARNSTARTDATE) {
      fieldErrors.startDate = 'Start date cannot be changed because this aim is no longer continuing.'
    }
    if (aimLocked && Number(v.stdCode) !== existing.STDCODE) {
      fieldErrors.stdCode = 'Standard code cannot be changed because this aim is no longer continuing.'
    }
    if (!fieldErrors.stdCode) {
      const standardError = await checkStandard(connection, v.stdCode, existing.STDCODE)
      if (standardError) fieldErrors.stdCode = standardError
    }

    if (Object.keys(fieldErrors).length > 0) {
      res.status(400).json({
        error: 'Please fix the highlighted fields.',
        fields: fieldErrors,
      })
      return
    }

    if (await isUlnTaken(connection, Number(v.uln), learnRefNumber)) {
      res.status(400).json({
        error: 'Please fix the highlighted fields.',
        fields: { uln: 'This ULN is already used by another learner.' },
      })
      return
    }

    await execute(connection, 'begin')

    await execute(connection, UPDATE_LEARNER, [
      Number(v.uln),
      v.familyName?.trim() || null,
      v.givenNames?.trim() || null,
      v.dateOfBirth || null,
      Number(v.ethnicity),
      v.sex,
      Number(v.lldd),
      v.niNumber ? v.niNumber.trim().toUpperCase() : null,
      v.postcodePrior.trim().toUpperCase(),
      v.postcode.trim().toUpperCase(),
      v.phone?.trim() || null,
      v.email?.trim() || null,
      v.title?.trim() || null,
      v.addressLine1?.trim() || null,
      v.addressLine2?.trim() || null,
      v.addressLine3?.trim() || null,
      v.wardOrCounty?.trim() || null,
      v.mobile?.trim() || null,
      joinContactMethods(v.contactMethodsAllowed),
      v.preferredContactMethod?.trim() || null,
      v.nextOfKinName?.trim() || null,
      v.nextOfKinRelationship?.trim() || null,
      v.nextOfKinPhone?.trim() || null,
      v.contractType?.trim() || null,
      learnRefNumber,
    ])

    await execute(connection, UPDATE_LEARNING_DELIVERY, [
      aimLocked ? existing.LEARNSTARTDATE : v.startDate,
      v.plannedEndDate,
      aimLocked ? existing.STDCODE : Number(v.stdCode),
      v.dellocPostcode.trim().toUpperCase(),
      learnRefNumber,
    ])

    await execute(connection, 'commit')
    res.json({ learnRefNumber })
  } catch (err) {
    if (connection) {
      try {
        await execute(connection, 'rollback')
      } catch (rollbackErr) {
        console.error('Failed to roll back transaction:', rollbackErr.message)
      }
    }
    console.error('Failed to update learner:', err.message)
    res.status(500).json({ error: 'Could not save these changes. Please try again.' })
  }
})

// Only these columns can ever be written by
// PUT /api/learners/:learnRefNumber/complete.
const COMPLETE_AIM = `
  update LEARNING_DELIVERY set
    COMPSTATUS = 2, OUTCOME = ?, LEARNACTENDDATE = ?, ACHDATE = ?
  where LEARNREFNUMBER = ? and LEARNAIMREF = 'ZPROG001' and AIMSEQNUMBER = 1 and ${IN_ORG_LEARNERS}
`

app.put('/api/learners/:learnRefNumber/complete', allow(MANAGER), async (req, res) => {
  const { learnRefNumber } = req.params
  const connection = req.db
  try {

    const existing = await findLearnerAim(connection, learnRefNumber)
    if (!existing) {
      res.status(404).json({ error: 'Learner not found.' })
      return
    }
    if (existing.COMPSTATUS !== 1) {
      res.status(409).json({ error: 'This aim has already been completed.' })
      return
    }

    const fieldErrors = validateCompleteAimForm(req.body, existing.LEARNSTARTDATE)
    if (Object.keys(fieldErrors).length > 0) {
      res.status(400).json({
        error: 'Please fix the highlighted fields.',
        fields: fieldErrors,
      })
      return
    }

    const v = req.body
    await execute(connection, 'begin')
    await execute(connection, COMPLETE_AIM, [
      OUTCOME_ACHIEVED,
      v.actualEndDate,
      v.achievementDate,
      learnRefNumber,
    ])
    await execute(connection, 'commit')
    res.json({ learnRefNumber })
  } catch (err) {
    if (connection) {
      try {
        await execute(connection, 'rollback')
      } catch (rollbackErr) {
        console.error('Failed to roll back transaction:', rollbackErr.message)
      }
    }
    console.error('Failed to mark aim completed:', err.message)
    res.status(500).json({ error: 'Could not save this. Please try again.' })
  }
})

// Only these columns can ever be written by
// PUT /api/learners/:learnRefNumber/withdraw. OUTCOME is 3 (no
// achievement), as the ILR expects once an aim has an actual end date, and
// ACHDATE is left empty, since a withdrawn aim was never achieved.
const WITHDRAW_AIM = `
  update LEARNING_DELIVERY set
    COMPSTATUS = 3, LEARNACTENDDATE = ?, WITHDRAWREASON = ?, OUTCOME = 3, ACHDATE = null
  where LEARNREFNUMBER = ? and LEARNAIMREF = 'ZPROG001' and AIMSEQNUMBER = 1 and ${IN_ORG_LEARNERS}
`

// Withdrawing from the programme ends its open component aims (the
// standard's own aim, English and maths) the same way and on the same
// date: the ILR doesn't allow open component aims under a closed programme
// aim (rule R_90), or one ending after it (R_89).
const WITHDRAW_COMPONENT_AIMS = `
  update LEARNING_DELIVERY set
    COMPSTATUS = 3, LEARNACTENDDATE = ?, WITHDRAWREASON = ?, OUTCOME = 3, ACHDATE = null
  where LEARNREFNUMBER = ? and AIMTYPE = 3 and COMPSTATUS = 1 and ${IN_ORG_LEARNERS}
`

app.put('/api/learners/:learnRefNumber/withdraw', allow(MANAGER), async (req, res) => {
  const { learnRefNumber } = req.params
  const connection = req.db
  try {

    const existing = await findLearnerAim(connection, learnRefNumber)
    if (!existing) {
      res.status(404).json({ error: 'Learner not found.' })
      return
    }
    if (existing.COMPSTATUS !== 1) {
      res.status(409).json({ error: 'This aim is not currently continuing, so it cannot be withdrawn.' })
      return
    }

    const fieldErrors = validateWithdrawAimForm(req.body, existing.LEARNSTARTDATE)
    if (Object.keys(fieldErrors).length > 0) {
      res.status(400).json({
        error: 'Please fix the highlighted fields.',
        fields: fieldErrors,
      })
      return
    }

    const v = req.body
    await execute(connection, 'begin')
    await execute(connection, WITHDRAW_AIM, [
      v.actualEndDate,
      Number(v.withdrawReason),
      learnRefNumber,
    ])
    await execute(connection, WITHDRAW_COMPONENT_AIMS, [
      v.actualEndDate,
      Number(v.withdrawReason),
      learnRefNumber,
    ])
    await execute(connection, 'commit')
    res.json({ learnRefNumber })
  } catch (err) {
    if (connection) {
      try {
        await execute(connection, 'rollback')
      } catch (rollbackErr) {
        console.error('Failed to roll back transaction:', rollbackErr.message)
      }
    }
    console.error('Failed to withdraw aim:', err.message)
    res.status(500).json({ error: 'Could not save this. Please try again.' })
  }
})

// An officer is inactive when their user account is (APP_USER.ISACTIVE is
// FALSE): their access has ended, so they can't be given learners. An
// officer with no user account yet counts as active.
const OFFICER_IS_ACTIVE = `not exists (
    select 1 from ${ORG_APP_USER} u
    where u.OFFICERREFNUMBER = o.OFFICERREFNUMBER and not u.ISACTIVE)`

const OFFICERS_QUERY = `
  select o.OFFICERREFNUMBER, o.OFFICERNAME, o.OFFICERTYPE, o.EMAIL, o.TELNO,
    ${OFFICER_IS_ACTIVE} as ISACTIVE
  from ${ORG_OFFICER} o
  order by o.OFFICERNAME
`

app.get('/api/officers', allow(MANAGER), async (req, res) => {
  const connection = req.db
  try {
    const rows = await execute(connection, OFFICERS_QUERY)
    res.json(rows)
  } catch (err) {
    console.error('Failed to fetch officers:', err.message)
    res.status(500).json({ error: 'Failed to fetch officers' })
  }
})

// Finds the highest existing OFF officer reference and returns the next one
// in the same style, e.g. current highest OFF0012 -> OFF0013 - the same
// approach nextLearnRefNumber uses for learner references, and across every
// organisation for the same reason.
const HIGHEST_OFFICER_REF_QUERY = `
  select OFFICERREFNUMBER
  from OFFICER -- all organisations
  where OFFICERREFNUMBER like 'OFF%'
  order by OFFICERREFNUMBER desc
  limit 1
`

async function nextOfficerRefNumber(connection) {
  const rows = await execute(connection, HIGHEST_OFFICER_REF_QUERY)
  const highest = rows[0]?.OFFICERREFNUMBER
  const highestNumber = highest ? Number(highest.slice('OFF'.length)) : 0
  return `OFF${String(highestNumber + 1).padStart(4, '0')}`
}

const INSERT_OFFICER = `
  insert into OFFICER (OFFICERREFNUMBER, OFFICERNAME, OFFICERTYPE, EMAIL, TELNO, ORGANISATIONID, ISTESTDATA)
  values (?, ?, ?, ?, ?, ${CURRENT_ORGANISATIONID}, ${CURRENT_ISTESTDATA})
`

app.post('/api/officers', allow(MANAGER), async (req, res) => {
  const fieldErrors = validateOfficerForm(req.body)
  if (Object.keys(fieldErrors).length > 0) {
    return res.status(400).json({
      error: 'Please fix the highlighted fields.',
      fields: fieldErrors,
    })
  }

  const v = req.body
  const connection = req.db
  try {

    const officerRefNumber = await nextOfficerRefNumber(connection)

    await execute(connection, INSERT_OFFICER, [
      officerRefNumber,
      v.name.trim(),
      v.officerType,
      v.email?.trim() || null,
      v.phone?.trim() || null,
    ])

    res.status(201).json({ officerRefNumber })
  } catch (err) {
    console.error('Failed to add officer:', err.message)
    res.status(500).json({ error: 'Could not save the new officer. Please try again.' })
  }
})

// Caseloads live in OFFICER_ASSIGNMENT: one row per officer per learner per
// spell, with the officer's role for that learner (TUTOR or ASSESSOR). An
// assignment is current while ENDEDAT is empty. Assignments are ended, never
// deleted, so caseload history is kept.
//
// A tutor or assessor can look up only the learners on their caseload and
// their own officer record; anything else gives "not found".
const LEARNER_EXISTS_QUERY = `select LEARNREFNUMBER from ${VISIBLE_LEARNER} where LEARNREFNUMBER = ?`
const OFFICER_TYPE_QUERY = `
  select o.OFFICERNAME, o.OFFICERTYPE, ${OFFICER_IS_ACTIVE} as ISACTIVE
  from ${VISIBLE_OFFICER} o
  where o.OFFICERREFNUMBER = ?
`

const LEARNER_OFFICERS_QUERY = `
  select o.OFFICERREFNUMBER, o.OFFICERNAME, o.OFFICERTYPE, o.EMAIL, o.TELNO,
    a.ASSIGNMENTID, a.ASSIGNMENTROLE, a.STARTEDAT
  from ${ORG_OFFICER_ASSIGNMENT} a
  join ${ORG_OFFICER} o on a.OFFICERREFNUMBER = o.OFFICERREFNUMBER
  where a.LEARNREFNUMBER = ?
    and a.ENDEDAT is null
  order by decode(a.ASSIGNMENTROLE, 'TUTOR', 1, 'ASSESSOR', 2, 3), o.OFFICERNAME
`

app.get('/api/learners/:learnRefNumber/officers', allow(STAFF), async (req, res) => {
  const { learnRefNumber } = req.params
  const connection = req.db
  try {
    const learnerRows = await execute(connection, LEARNER_EXISTS_QUERY, [learnRefNumber])
    if (learnerRows.length === 0) {
      res.status(404).json({ error: 'Learner not found.' })
      return
    }
    const rows = await execute(connection, LEARNER_OFFICERS_QUERY, [learnRefNumber])
    res.json(rows)
  } catch (err) {
    console.error('Failed to fetch officers for learner:', err.message)
    res.status(500).json({ error: 'Failed to fetch officers for this learner' })
  }
})

// Only the learner references are returned: the browser already holds the
// full learner rows from /api/learners and matches these against them, so
// the officer detail panel can show status/standard and link straight
// through to the learner detail panel without repeating that query here.
const OFFICER_LEARNERS_QUERY = `
  select LEARNREFNUMBER, ASSIGNMENTROLE
  from ${ORG_OFFICER_ASSIGNMENT}
  where OFFICERREFNUMBER = ?
    and ENDEDAT is null
  order by LEARNREFNUMBER
`

app.get('/api/officers/:officerRefNumber/learners', allow(MANAGER, TUTOR, ASSESSOR), async (req, res) => {
  const { officerRefNumber } = req.params
  const connection = req.db
  try {
    const officerRows = await execute(connection, OFFICER_TYPE_QUERY, [officerRefNumber])
    if (officerRows.length === 0) {
      res.status(404).json({ error: 'Officer not found.' })
      return
    }
    const rows = await execute(connection, OFFICER_LEARNERS_QUERY, [officerRefNumber])
    res.json(rows)
  } catch (err) {
    console.error('Failed to fetch learners for officer:', err.message)
    res.status(500).json({ error: 'Failed to fetch learners for this officer' })
  }
})

const ASSIGNMENT_ROLES = new Set(['TUTOR', 'ASSESSOR'])

const CURRENT_ASSIGNMENT_QUERY = `
  select ASSIGNMENTID, OFFICERREFNUMBER
  from ${ORG_OFFICER_ASSIGNMENT}
  where LEARNREFNUMBER = ? and ASSIGNMENTROLE = ? and ENDEDAT is null
`
const END_ASSIGNMENT = `
  update OFFICER_ASSIGNMENT
  set ENDEDAT = current_timestamp(), ENDEDBY = ?
  where ASSIGNMENTID = ? and ENDEDAT is null
    and ASSIGNMENTID in (select ASSIGNMENTID from ${ORG_OFFICER_ASSIGNMENT})
`
const INSERT_ASSIGNMENT = `
  insert into OFFICER_ASSIGNMENT (LEARNREFNUMBER, OFFICERREFNUMBER, ASSIGNMENTROLE, STARTEDBY, ISTESTDATA)
  values (?, ?, ?, ?, ${CURRENT_ISTESTDATA})
`

// Makes the officer the learner's tutor or assessor. Each learner has
// exactly one current tutor and one current assessor, so any current
// assignment in that role is ended in the same transaction. An inactive
// officer can't be assigned. This is also
// how an officer is taken off a learner: there's no route that only ends
// an assignment, so a learner is never left without one. The role
// defaults to the officer's type, and must match it. STARTEDBY and
// ENDEDBY are the signed-in user's USERID.
app.post('/api/learners/:learnRefNumber/officers', allow(MANAGER), async (req, res) => {
  const { learnRefNumber } = req.params
  const officerRefNumber = req.body?.officerRefNumber
  if (!officerRefNumber) {
    res.status(400).json({ error: 'officerRefNumber is required.' })
    return
  }

  const connection = req.db
  try {

    const learnerRows = await execute(connection, LEARNER_EXISTS_QUERY, [learnRefNumber])
    if (learnerRows.length === 0) {
      res.status(404).json({ error: 'Learner not found.' })
      return
    }

    const [officer] = await execute(connection, OFFICER_TYPE_QUERY, [officerRefNumber])
    if (!officer) {
      res.status(404).json({ error: 'Officer not found.' })
      return
    }

    if (!officer.ISACTIVE) {
      res.status(409).json({ error: `${officer.OFFICERNAME}'s access has ended, so they can't be given learners.` })
      return
    }

    const role = req.body?.role ?? officer.OFFICERTYPE
    if (!ASSIGNMENT_ROLES.has(role)) {
      res.status(400).json({ error: 'Only tutors and assessors can be assigned to a learner.' })
      return
    }
    if (role !== officer.OFFICERTYPE) {
      res.status(400).json({ error: `This officer isn't a ${role.toLowerCase()}.` })
      return
    }

    const current = await execute(connection, CURRENT_ASSIGNMENT_QUERY, [learnRefNumber, role])
    if (current.some((a) => a.OFFICERREFNUMBER === officerRefNumber)) {
      res.status(409).json({ error: `This officer is already this learner's ${role.toLowerCase()}.` })
      return
    }

    await execute(connection, 'begin')
    for (const a of current) {
      await execute(connection, END_ASSIGNMENT, [req.user.USERID, a.ASSIGNMENTID])
    }
    await execute(connection, INSERT_ASSIGNMENT, [learnRefNumber, officerRefNumber, role, req.user.USERID])
    await execute(connection, 'commit')

    res.status(201).json({
      learnRefNumber,
      officerRefNumber,
      role,
      replaced: current.map((a) => a.OFFICERREFNUMBER),
    })
  } catch (err) {
    if (connection) {
      try {
        await execute(connection, 'rollback')
      } catch (rollbackErr) {
        console.error('Failed to roll back transaction:', rollbackErr.message)
      }
    }
    console.error('Failed to assign officer to learner:', err.message)
    res.status(500).json({ error: 'Could not assign this officer. Please try again.' })
  }
})

// Who is signed in and which roles they hold, so the screens can show what
// this user can use. The server still checks every request itself.
app.get('/api/me', allow(LEARNER, EMPLOYER, STAFF), (req, res) => {
  const u = req.user
  res.json({
    USERID: u.USERID,
    DISPLAYNAME: u.DISPLAYNAME,
    ORGANISATIONNAME: u.ORGANISATIONNAME,
    OFFICERREFNUMBER: u.OFFICERREFNUMBER,
    LEARNREFNUMBER: u.LEARNREFNUMBER,
    EMPLOYERID: u.EMPLOYERID,
    roles: u.roles,
    // Signing out only exists with test sign-in (devUsers.js) for now.
    canSignOut: testSignInEnabled(),
  })
})

// The Reports tab's endpoints live in reports.js, My day's in myday.js,
// Burrow's in burrow.js, employers' in employer.js, and IQA checks' in iqa.js.
registerReportRoutes(app)
registerIlrRoutes(app)
registerMyDayRoutes(app)
registerBurrowRoutes(app)
registerEmployerRoutes(app)
registerIqaRoutes(app)

const port = process.env.PORT || 3001
app.listen(port, () => {
  console.log(`ILR API server listening on http://localhost:${port}`)
})
