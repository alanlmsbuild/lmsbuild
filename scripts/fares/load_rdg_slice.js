// load_rdg_slice.js - puts the slice of the fares feed (scripts/fares/rdg_slice.py:
// the lines for the train_journey seed's stations, 20 thousand of 9.8 million) into
// SHARED_DB.SILVER_STAGING.RDG_FARES_SLICE, the table dbt reads with
// --vars '{rdg_slice: true}' (macros/rdg.sql), so the train fares models are
// developed and tested on a small table. A scratch table in the staging
// schema, as TRANSFORM_USER; the daily build never reads it and never sets the
// var. --drop removes it.
//   node scripts/fares/load_rdg_slice.js          make it
//   node scripts/fares/load_rdg_slice.js --drop   remove it
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, execute, destroy } from '../../server/db.js'

const TABLE = 'SHARED_DB.SILVER_STAGING.RDG_FARES_SLICE'
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'fares', 'rdg-slice')

// RFC 4180 as Python's csv module writes it: quoted fields, "" for a quote.
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(field); field = '' } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += ch
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return rows
}

const c = await connect({ as: 'transform', timeoutMs: 30000 })
try {
  if (process.argv.includes('--drop')) {
    await execute(c, `drop table if exists ${TABLE}`)
    console.log(`${TABLE} dropped`)
  } else {
    const file = fs.readdirSync(dir).filter((f) => /^RJFAF\d+_slice\.csv$/.test(f)).sort().at(-1)
    if (!file) throw new Error('No slice in data/fares/rdg-slice: run .venv-travel/bin/python scripts/fares/rdg_slice.py')
    const rows = parseCsv(fs.readFileSync(path.join(dir, file), 'utf8')).slice(1).filter((r) => r.length === 2)
    await execute(c, `create or replace transient table ${TABLE} ("file_type" varchar, "line" varchar) comment = 'Scratch: a slice of the National Rail fares feed for developing the train fares models (scripts/fares/load_rdg_slice.js). Not read by the daily build. Drop with --drop.'`)
    for (let i = 0; i < rows.length; i += 10000) await execute(c, `insert into ${TABLE} values (?, ?)`, rows.slice(i, i + 10000))
    const [n] = await execute(c, `select count(*) as N from ${TABLE}`)
    console.log(`${TABLE}: ${n.N} lines from ${file}`)
  }
} finally {
  await destroy(c)
}
