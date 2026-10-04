// import-standards.js - load every version of every apprenticeship standard
// from Skills England's public standards API into SKILLS.STANDARD_VERSION:
// its LARS code, the start dates the version is for, and its "minimum hours
// for compliance", the published minimum off-the-job training hours.
//
// Why: for starts from 1 August 2025, an apprentice with no relevant prior
// learning must get at least the minimum published on their standard
// (Apprenticeship funding rules 2026 to 2027, version 3, July 2026,
// paragraphs 85 to 89, and the off-the-job training guidance version 6,
// August 2026, paragraph 63). The figure is per version: ST0005 version
// 1.3 and 2.0 both say 300 hours, versions up to 1.2 (before the rule) say
// nothing. Warren works out which version a learner is on from their start
// date and the version's earliest and latest start dates.
//
// The API needs no key: https://skillsengland.education.gov.uk/api/apprenticeshipstandards
// (every version of every standard, about 75 MB). The same figure is shown
// as "Minimum hours for compliance" on each standard's page.
//
// Usage:
//   npm run import:standards              fetch, check, and replace the table
//   npm run import:standards -- --dry-run fetch and check, write nothing
//
// Every run is logged in SKILLS.STANDARD_IMPORT_RUN with the source URL,
// the response's SHA-256 and row counts. The table is replaced in one
// transaction, so it's never half loaded.

import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', 'server', '.env') })

const SOURCE_URL = 'https://skillsengland.education.gov.uk/api/apprenticeshipstandards'
const SCHEMA = 'SKILLS'

const COLUMNS = ['ST_REFERENCE', 'VERSION', 'LARS_CODE', 'TITLE', 'LEVEL', 'STATUS', 'EARLIEST_START_DATE',
  'LATEST_START_DATE', 'LATEST_END_DATE', 'TYPICAL_DURATION_MONTHS', 'MIN_OTJ_HOURS', 'MAX_FUNDING', 'STANDARD_PAGE_URL']

const date = (value) => (value ? String(value).slice(0, 10) : null)
const number = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const n = Number(String(value).replace(/[£,]/g, ''))
  return Number.isFinite(n) ? n : null
}

// One row per version, checked.
export function parseStandards(records) {
  if (!Array.isArray(records)) throw new Error('The API did not return a list of standards.')
  const rows = records.map((r) => ({
    ST_REFERENCE: r.referenceNumber,
    VERSION: String(r.version ?? r.versionNumber ?? ''),
    LARS_CODE: number(r.larsCode),
    TITLE: r.title ?? null,
    LEVEL: number(r.level),
    STATUS: r.status ?? null,
    EARLIEST_START_DATE: date(r.earliestStartDate),
    LATEST_START_DATE: date(r.latestStartDate),
    LATEST_END_DATE: date(r.latestEndDate),
    TYPICAL_DURATION_MONTHS: number(r.typicalDuration),
    MIN_OTJ_HOURS: number(r.minimumHoursForCompliance),
    MAX_FUNDING: number(r.maxFunding),
    STANDARD_PAGE_URL: r.standardPageUrl ?? r.url ?? null,
  }))
  const problems = []
  const seen = new Set()
  for (const row of rows) {
    if (!/^ST\d{4}$/.test(row.ST_REFERENCE ?? '')) problems.push(`odd reference ${row.ST_REFERENCE}`)
    if (!row.VERSION) problems.push(`${row.ST_REFERENCE} has no version`)
    const key = `${row.ST_REFERENCE} ${row.VERSION}`
    if (seen.has(key)) problems.push(`${key} appears twice`)
    seen.add(key)
    if (row.MIN_OTJ_HOURS !== null && (row.MIN_OTJ_HOURS < 187 || row.MIN_OTJ_HOURS > 9999)) {
      problems.push(`${key} has a minimum of ${row.MIN_OTJ_HOURS} hours, outside 187 to 9999`)
    }
  }
  if (problems.length > 0) throw new Error(`The API data failed its checks: ${problems.slice(0, 10).join('; ')}`)
  return rows
}

function summarise(rows) {
  const approved = rows.filter((r) => r.STATUS === 'Approved for delivery')
  return {
    versions: rows.length,
    standards: new Set(rows.map((r) => r.ST_REFERENCE)).size,
    withMinimum: rows.filter((r) => r.MIN_OTJ_HOURS !== null).length,
    approvedWithoutMinimum: approved.filter((r) => r.MIN_OTJ_HOURS === null).map((r) => `${r.ST_REFERENCE} v${r.VERSION}`),
  }
}

// Writes the rows. names lets a test write to temporary scratch tables
// instead: { runTable, versionTable, temporary: true }.
export async function load(rows, source, names = {}) {
  const runTable = names.runTable ?? `${SCHEMA}.STANDARD_IMPORT_RUN`
  const versionTable = names.versionTable ?? `${SCHEMA}.STANDARD_VERSION`
  const create = names.temporary ? 'create temporary table' : 'create table if not exists'
  const { connect, execute, destroy } = await import('../server/db.js')
  const connection = await connect()
  try {
    await execute(connection, `${create} ${runTable} (
      ID number(38,0) not null primary key,
      STARTED_AT timestamp_ltz default current_timestamp() not null,
      FINISHED_AT timestamp_ltz,
      STATUS varchar(20) not null comment 'running | succeeded | failed',
      SOURCE_URL varchar(500) not null,
      SOURCE_SHA256 varchar(64),
      ROW_COUNTS variant,
      ERROR varchar
    ) comment = 'Each run of scripts/import-standards.js.'`)
    await execute(connection, `${create} ${versionTable} (
      ST_REFERENCE varchar(10) not null,
      VERSION varchar(10) not null,
      LARS_CODE number(5,0),
      TITLE varchar(300),
      LEVEL number(2,0),
      STATUS varchar(50),
      EARLIEST_START_DATE date comment 'The first start date this version is for.',
      LATEST_START_DATE date comment 'The last start date this version is for (empty while it is current).',
      LATEST_END_DATE date,
      TYPICAL_DURATION_MONTHS number(3,0),
      MIN_OTJ_HOURS number(4,0) comment 'Published minimum off-the-job training hours ("Minimum hours for compliance"). Empty for versions from before 1 August 2025.',
      MAX_FUNDING number(8,0),
      STANDARD_PAGE_URL varchar(500),
      LAST_IMPORT_RUN_ID number(38,0) not null,
      primary key (ST_REFERENCE, VERSION)
    ) comment = 'Every version of every apprenticeship standard, from Skills England (scripts/import-standards.js).'`)
    const [{ NEXT_ID: runId }] = await execute(connection, `select coalesce(max(ID), 0) + 1 as NEXT_ID from ${runTable}`)
    await execute(connection, `insert into ${runTable} (ID, STATUS, SOURCE_URL, SOURCE_SHA256) values (?, 'running', ?, ?)`,
      [runId, SOURCE_URL, source.sha256])
    try {
      await execute(connection, 'begin')
      await execute(connection, `delete from ${versionTable}`)
      const all = [...COLUMNS, 'LAST_IMPORT_RUN_ID']
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200)
        await execute(
          connection,
          `insert into ${versionTable} (${all.join(', ')}) values ${batch.map(() => `(${all.map(() => '?').join(', ')})`).join(', ')}`,
          batch.flatMap((r) => [...COLUMNS.map((c) => r[c]), runId]),
        )
      }
      const [{ N }] = await execute(connection, `select count(*) as N from ${versionTable}`)
      if (Number(N) !== rows.length) throw new Error(`Loaded ${N} rows, expected ${rows.length}.`)
      await execute(connection, 'commit')
      await execute(connection, `update ${runTable} set STATUS = 'succeeded', FINISHED_AT = current_timestamp(), ROW_COUNTS = parse_json(?) where ID = ?`,
        [JSON.stringify(summarise(rows)), runId])
      if (names.temporary) {
        // A test reads back what it wrote before the session (and the
        // temporary tables) end.
        const back = await execute(connection, `select * from ${versionTable} where ST_REFERENCE in ('ST0005', 'ST0072', 'ST0259') order by 1, 2`)
        const [run] = await execute(connection, `select * from ${runTable} where ID = ?`, [runId])
        return { runId, back, run }
      }
      return runId
    } catch (err) {
      await execute(connection, 'rollback').catch(() => {})
      await execute(connection, `update ${runTable} set STATUS = 'failed', FINISHED_AT = current_timestamp(), ERROR = ? where ID = ?`,
        [err.message, runId]).catch(() => {})
      throw err
    }
  } finally {
    await destroy(connection)
  }
}

export async function fetchStandards() {
  const res = await fetch(SOURCE_URL, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`The standards API answered ${res.status}.`)
  const text = await res.text()
  return { text, sha256: crypto.createHash('sha256').update(text).digest('hex') }
}

async function main() {
  const { values } = parseArgs({ options: { 'dry-run': { type: 'boolean', default: false } } })
  console.log(`Fetching ${SOURCE_URL} ...`)
  const { text, sha256 } = await fetchStandards()
  const source = { sha256 }
  const rows = parseStandards(JSON.parse(text))
  const s = summarise(rows)
  console.log(`${s.versions} versions of ${s.standards} standards, ${s.withMinimum} with a published minimum. SHA-256 ${source.sha256}`)
  if (s.approvedWithoutMinimum.length) console.log(`Approved for delivery but no minimum published yet: ${s.approvedWithoutMinimum.join(', ')}`)
  for (const st of ['ST0005', 'ST0072', 'ST0259']) {
    for (const r of rows.filter((x) => x.ST_REFERENCE === st)) {
      console.log(`  ${st} v${r.VERSION} (LARS ${r.LARS_CODE}) starts ${r.EARLIEST_START_DATE} to ${r.LATEST_START_DATE ?? 'now'}: ${r.MIN_OTJ_HOURS ?? 'no'} minimum hours`)
    }
  }
  if (values['dry-run']) {
    console.log('Dry run: nothing written.')
    return
  }
  const runId = await load(rows, source)
  console.log(`Run ${runId} succeeded: SKILLS.STANDARD_VERSION now has ${rows.length} rows.`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`Import failed: ${err.message}`)
    process.exit(1)
  })
}
