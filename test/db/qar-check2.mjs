// Runs check 2 from sql/test_reset_02_reset.sql (the QAR mix, worked out as
// the Reports page does) exactly as written there, and prints the result.
// Reads only.
import fs from 'node:fs'
import { connect, execute, destroy } from '../../server/db.js'

const sql = fs.readFileSync(new URL('../../sql/test_reset_02_reset.sql', import.meta.url), 'utf8')
const start = sql.indexOf('WITH aims AS (', sql.indexOf('-- 2. The QAR mix'))
const end = sql.indexOf(';', start)
const c = await connect()
try {
  for (const r of await execute(c, sql.slice(start, end))) console.log(Object.values(r).join('  '))
} finally {
  await destroy(c)
}
