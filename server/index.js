import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import { connect, execute, destroy } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })

const app = express()
app.use(cors())

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

const port = process.env.PORT || 3001
app.listen(port, () => {
  console.log(`ILR API server listening on http://localhost:${port}`)
})
