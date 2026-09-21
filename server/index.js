import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import { connect, execute, destroy } from './db.js'
import { validateLearnerForm } from '../src/validation.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })

const app = express()
app.use(cors())
app.use(express.json())

const LEARNERS_QUERY = `
  select
    l.LEARNREFNUMBER,
    l.ULN,
    l.GIVENNAMES,
    l.FAMILYNAME,
    l.DATEOFBIRTH,
    l.POSTCODE,
    ld.LEARNAIMREF,
    ld.AIMTYPE,
    ld.PROGTYPE,
    ld.STDCODE,
    ld.FUNDMODEL,
    ld.LEARNSTARTDATE,
    ld.LEARNPLANENDDATE,
    ld.LEARNACTENDDATE,
    ld.COMPSTATUS,
    ld.OUTCOME
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

const INSERT_LEARNER = `
  insert into LEARNER (
    LEARNREFNUMBER, ULN, FAMILYNAME, GIVENNAMES, DATEOFBIRTH,
    ETHNICITY, SEX, LLDDHEALTHPROB, NINUMBER, POSTCODEPRIOR, POSTCODE, TELNO, EMAIL
  ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    await execute(connection, 'begin')

    const learnRefNumber = await nextLearnRefNumber(connection)

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

const port = process.env.PORT || 3001
app.listen(port, () => {
  console.log(`ILR API server listening on http://localhost:${port}`)
})
