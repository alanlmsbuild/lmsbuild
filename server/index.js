import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import { connect, execute, destroy } from './db.js'
import {
  validateLearnerForm,
  validateLearnerEditForm,
  validateCompleteAimForm,
  validateWithdrawAimForm,
} from '../src/validation.js'
import { OUTCOME_ACHIEVED } from '../src/ilrCodes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })

const app = express()
app.use(cors())
app.use(express.json())

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
    ld.FUNDMODEL,
    ld.LEARNSTARTDATE,
    ld.LEARNPLANENDDATE,
    ld.DELLOCPOSTCODE,
    ld.LEARNACTENDDATE,
    ld.COMPSTATUS,
    ld.OUTCOME,
    ld.ACHDATE,
    ld.WITHDRAWREASON
  from LEARNER l
  join LEARNING_DELIVERY ld
    on l.LEARNREFNUMBER = ld.LEARNREFNUMBER
  order by l.LEARNREFNUMBER
`

app.get('/api/learners', async (_req, res) => {
  let connection
  try {
    connection = await connect()
    const rows = await execute(connection, LEARNERS_QUERY)
    res.json(rows)
  } catch (err) {
    console.error('Failed to fetch learners:', err.message)
    res.status(500).json({ error: 'Failed to fetch learners' })
  } finally {
    if (connection) await destroy(connection)
  }
})

// Finds the highest existing TESTL learner reference and returns the next
// one in the same style, e.g. current highest TESTL0012 -> TESTL0013.
const HIGHEST_REF_QUERY = `
  select LEARNREFNUMBER
  from LEARNER
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

// A ULN must not already belong to a different learner. excludeLearnRefNumber
// is the learner being added or edited, so it doesn't flag itself as a
// conflict when editing.
const ULN_CONFLICT_QUERY = `
  select LEARNREFNUMBER from LEARNER where ULN = ? and LEARNREFNUMBER <> ?
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
  from LEARNER l
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
    NEXTOFKINNAME, NEXTOFKINRELATIONSHIP, NEXTOFKINPHONE, CONTRACTTYPE
  ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`

// The aim fields fixed by the milestone spec (LEARNAIMREF, AIMTYPE,
// AIMSEQNUMBER, FUNDMODEL, PROGTYPE, COMPSTATUS) are written as literals
// rather than bound values since they never vary for this form.
const INSERT_LEARNING_DELIVERY = `
  insert into LEARNING_DELIVERY (
    LEARNREFNUMBER, LEARNAIMREF, AIMTYPE, AIMSEQNUMBER, LEARNSTARTDATE, LEARNPLANENDDATE,
    FUNDMODEL, PROGTYPE, STDCODE, DELLOCPOSTCODE, COMPSTATUS
  ) values (?, 'ZPROG001', 1, 1, ?, ?, 36, 25, ?, ?, 1)
`

app.post('/api/learners', async (req, res) => {
  const fieldErrors = validateLearnerForm(req.body)
  if (Object.keys(fieldErrors).length > 0) {
    return res.status(400).json({
      error: 'Please fix the highlighted fields.',
      fields: fieldErrors,
    })
  }

  const v = req.body
  let connection
  try {
    connection = await connect()

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
  } finally {
    if (connection) await destroy(connection)
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
  where LEARNREFNUMBER = ?
`

const UPDATE_LEARNING_DELIVERY = `
  update LEARNING_DELIVERY set
    LEARNSTARTDATE = ?, LEARNPLANENDDATE = ?, STDCODE = ?, DELLOCPOSTCODE = ?
  where LEARNREFNUMBER = ? and LEARNAIMREF = 'ZPROG001' and AIMSEQNUMBER = 1
`

app.put('/api/learners/:learnRefNumber', async (req, res) => {
  const { learnRefNumber } = req.params
  let connection
  try {
    connection = await connect()

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
  } finally {
    if (connection) await destroy(connection)
  }
})

// Only these columns can ever be written by
// PUT /api/learners/:learnRefNumber/complete.
const COMPLETE_AIM = `
  update LEARNING_DELIVERY set
    COMPSTATUS = 2, OUTCOME = ?, LEARNACTENDDATE = ?, ACHDATE = ?
  where LEARNREFNUMBER = ? and LEARNAIMREF = 'ZPROG001' and AIMSEQNUMBER = 1
`

app.put('/api/learners/:learnRefNumber/complete', async (req, res) => {
  const { learnRefNumber } = req.params
  let connection
  try {
    connection = await connect()

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
  } finally {
    if (connection) await destroy(connection)
  }
})

// Only these columns can ever be written by
// PUT /api/learners/:learnRefNumber/withdraw. OUTCOME and ACHDATE are left
// empty, since a withdrawn aim was never achieved.
const WITHDRAW_AIM = `
  update LEARNING_DELIVERY set
    COMPSTATUS = 3, LEARNACTENDDATE = ?, WITHDRAWREASON = ?, OUTCOME = null, ACHDATE = null
  where LEARNREFNUMBER = ? and LEARNAIMREF = 'ZPROG001' and AIMSEQNUMBER = 1
`

app.put('/api/learners/:learnRefNumber/withdraw', async (req, res) => {
  const { learnRefNumber } = req.params
  let connection
  try {
    connection = await connect()

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
  } finally {
    if (connection) await destroy(connection)
  }
})

const port = process.env.PORT || 3001
app.listen(port, () => {
  console.log(`ILR API server listening on http://localhost:${port}`)
})
