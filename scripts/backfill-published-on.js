// backfill-published-on.js - publication dates for the files loaded before
// SOURCE_FILE had PUBLISHEDON (sql/load_07_published_on.sql). Reads every
// SOURCE_FILE row with no date (as DATA_LOAD_USER), asks each file's page
// for its stated date (scripts/load/published.js: the same rule as the
// loaders, including "not after we downloaded it"), and writes the UPDATEs
// to sql/load_07b_published_on_backfill.sql for ACCOUNTADMIN to run (the
// loaders only add rows; they never update SOURCE_FILE). Changes nothing
// itself.
//
//   node scripts/backfill-published-on.js

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, execute, destroy } from '../server/db.js'
import { publishedOn } from './load/published.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'sql', 'load_07b_published_on_backfill.sql')
const TABLES = ['SHARED_DB.RAW.SOURCE_FILE', 'OPTIONS_DB.RAW.SOURCE_FILE']
const lit = (s) => `'${String(s).replaceAll("'", "''")}'`

const c = await connect({ as: 'loader', timeoutMs: 30000 })
const rows = []
try {
  for (const table of TABLES) {
    for (const r of await execute(c, `select SOURCEFILEID, SOURCE, PAGEURL, ORIGINALNAME, ORIGINALMODIFIEDAT from ${table} where PUBLISHEDON is null`)) rows.push({ table, ...r })
  }
} finally {
  await destroy(c)
}

const cache = new Map()
const groups = new Map()
const notes = new Map()
for (const r of rows) {
  const p = await publishedOn(r.PAGEURL, { fileName: r.ORIGINALNAME, downloadedAt: r.ORIGINALMODIFIEDAT, cache })
  if (p.date) {
    const k = `${r.table}|${p.date}|${p.from}`
    if (!groups.has(k)) groups.set(k, { table: r.table, date: p.date, from: p.from, ids: [], sources: new Set() })
    groups.get(k).ids.push(r.SOURCEFILEID)
    groups.get(k).sources.add(r.SOURCE)
  } else {
    const k = `${r.SOURCE}: ${p.why}`
    notes.set(k, (notes.get(k) ?? 0) + 1)
  }
}

const dated = [...groups.values()].reduce((n, g) => n + g.ids.length, 0)
const out = [`-- Publication dates for the files already loaded (sql/load_07_published_on.sql
-- added PUBLISHEDON to SOURCE_FILE; new loads fill it themselves). Written by
-- scripts/backfill-published-on.js on ${new Date().toISOString().slice(0, 10)} from each file's page or API: the date
-- the publisher states, and only if it is not after we downloaded the file
-- (a later date belongs to a newer version than ours). ${dated} of ${rows.length} files get
-- a date; the rest state none we can read, or only a newer version's (listed
-- at the end). Never guessed.
--
-- The loaders only add to SOURCE_FILE, so these updates run as ACCOUNTADMIN.
-- Each only touches rows that still have no date.
--
-- Paste the whole file into a Snowflake worksheet and Run All, as
-- ACCOUNTADMIN. Safe to run twice.

USE ROLE ACCOUNTADMIN;
USE WAREHOUSE capture_wh;
`]
for (const g of [...groups.values()].sort((a, b) => `${a.table}${[...a.sources][0]}`.localeCompare(`${b.table}${[...b.sources][0]}`))) {
  out.push(`-- ${[...g.sources].join(', ')}: ${g.ids.length} file${g.ids.length === 1 ? '' : 's'}, ${g.date}
UPDATE ${g.table} SET PUBLISHEDON = ${lit(g.date)}::date, PUBLISHEDONFROM = ${lit(g.from)}
WHERE PUBLISHEDON IS NULL AND SOURCEFILEID IN (${g.ids.map(lit).join(', ')});
`)
}
out.push(`-- ---------------------------------------------------------------------------
-- Left empty (${rows.length - dated} files), by source and why:
${[...notes.entries()].sort().map(([k, n]) => `--   ${k} (${n})`).join('\n')}

-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------

-- 1. Files with and without a publication date. Expected: SHARED_DB and
--    OPTIONS_DB, ${dated} dated between them; every PUBLISHEDON with its
--    PUBLISHEDONFROM.
SELECT 'SHARED_DB' AS DB_, COUNT(PUBLISHEDON) AS DATED, COUNT(*) - COUNT(PUBLISHEDON) AS NOT_DATED,
  COUNT_IF(PUBLISHEDON IS NOT NULL AND PUBLISHEDONFROM IS NULL) AS DATED_WITHOUT_FROM
FROM SHARED_DB.RAW.SOURCE_FILE
UNION ALL
SELECT 'OPTIONS_DB', COUNT(PUBLISHEDON), COUNT(*) - COUNT(PUBLISHEDON), COUNT_IF(PUBLISHEDON IS NOT NULL AND PUBLISHEDONFROM IS NULL)
FROM OPTIONS_DB.RAW.SOURCE_FILE;
`)
fs.writeFileSync(OUT, out.join('\n'))
console.log(`${rows.length} files without a date: ${dated} get one, in ${groups.size} updates; ${rows.length - dated} left empty. Written to ${path.relative(ROOT, OUT)}.`)
for (const [k, n] of [...notes.entries()].sort()) console.log(`  empty: ${k} (${n})`)
