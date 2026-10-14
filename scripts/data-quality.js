// data-quality.js - Snowflake data metric functions on the key silver tables
// (decision 21; sql/silver_03_dmf.sql), attached by the transform job after
// each day's swap (scripts/transform-silver.js).
//
// A swapped-in table is new each day: dbt builds it from scratch in
// SILVER_STAGING, and a swap moves a table's metric bindings with it (tested
// 14 October 2026). So after the swap the SILVER tables have none, and the
// previous versions, now in SILVER_STAGING, carry yesterday's. The job:
//   1. removes the bindings from the SILVER_STAGING tables
//   2. attaches every metric below to its SILVER table, each with its
//      expectation, on a 5-minute schedule
//   3. waits until every metric has a measurement taken after it was
//      attached (about 5 minutes; at most WAIT_MINUTES)
//   4. switches each table's schedule to TRIGGER_ON_CHANGES: no further
//      runs until the table changes, so one measurement a day, always of a
//      complete, tested table (a swap is not a change; tomorrow's table is
//      a new one)
//   5. reads each expectation's result (met or missed) for the job summary.
// Results show in Snowsight (each table's Data Quality tab) and in
// SNOWFLAKE.LOCAL.DATA_QUALITY_MONITORING_RESULTS().
//
//   npm run check:dmf    every metric below is bound to its SILVER table,
//                        on TRIGGER_ON_CHANGES, and SILVER_STAGING has none

import { fileURLToPath } from 'node:url'
import { connect, execute, destroy } from '../server/db.js'

// The metrics, with thresholds from the tables on 14 October 2026 (in
// brackets) and room for normal change. FRESHNESS needs a timestamp column,
// so only VACANCY has it (the others are refreshed by hand or yearly; their
// freshness is watched on the loads).
const rows = (min, max) => ({ fn: 'ROW_COUNT', on: [], name: 'ROWS_IN_RANGE', expect: max ? `VALUE >= ${min} AND VALUE <= ${max}` : `VALUE >= ${min}` })
const nulls = (col, max = 0) => ({ fn: 'NULL_COUNT', on: [col], name: `${col}_NULLS`.toUpperCase(), expect: max ? `VALUE <= ${max}` : 'VALUE = 0' })
const dupes = (col) => ({ fn: 'DUPLICATE_COUNT', on: [col], name: `${col}_UNIQUE`.toUpperCase(), expect: 'VALUE = 0' })
const fresh = (col, hours) => ({ fn: 'FRESHNESS', on: [col], name: `${col}_FRESH`.toUpperCase(), expect: `VALUE <= ${hours * 3600}` })

export const QUALITY = {
  'SHARED_DB.SILVER.POSTCODE': [rows(2_600_000, 2_900_000), dupes('postcode'), nulls('postcode'), nulls('local_authority_code', 30_000)], // 2,729,090; 24,265 no LA
  'SHARED_DB.SILVER.LSOA': [rows(43_000, 45_000), dupes('lsoa21_code'), nulls('name'), nulls('local_authority_code'), nulls('population', 10_500)], // 43,914; 10,159 outside England
  'SHARED_DB.SILVER.LOCAL_AUTHORITY': [rows(350, 370), dupes('local_authority_code'), nulls('name')], // 361
  'SHARED_DB.SILVER.VACANCY': [rows(1_000), dupes('vacancy_reference'), nulls('title'), nulls('local_authority_code', 200), fresh('last_seen_at', 26)], // 4,659; 17 no LA
  'SHARED_DB.SILVER.VACANCY_SOC': [rows(1_000), dupes('vacancy_soc_key'), nulls('soc_title')], // 5,898
  'OPTIONS_DB.SILVER.PROVIDER': [rows(25_000, 29_000), dupes('ukprn'), nulls('name')], // 26,696
  'OPTIONS_DB.SILVER.COLLEGE_16_18': [rows(2_500, 3_100), dupes('urn'), nulls('name'), nulls('results_year')], // 2,792
}
export const WAIT_MINUTES = 15
const POLL_SECONDS = 30

const staged = (table) => table.replace('.SILVER.', '.SILVER_STAGING.')
const db = (table) => table.split('.')[0]
const fnName = (m) => `SNOWFLAKE.CORE.${m.fn}`
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))
// A list Snowflake returns as an array or as JSON text.
const list = (x) => (Array.isArray(x) ? x : JSON.parse(x || '[]'))

// The metric bindings on a table, from Snowflake.
export async function bindings(c, table) {
  return (await execute(c, `select METRIC_DATABASE_NAME, METRIC_SCHEMA_NAME, METRIC_NAME, REF_ARGUMENTS, SCHEDULE, SCHEDULE_STATUS
    from table(${db(table)}.INFORMATION_SCHEMA.DATA_METRIC_FUNCTION_REFERENCES(REF_ENTITY_NAME => ?, REF_ENTITY_DOMAIN => 'table'))`, [table]))
    .map((r) => ({ fn: `${r.METRIC_DATABASE_NAME}.${r.METRIC_SCHEMA_NAME}.${r.METRIC_NAME}`, on: list(r.REF_ARGUMENTS).map((a) => a.name), schedule: r.SCHEDULE, status: r.SCHEDULE_STATUS }))
}

async function tableExists(c, table) {
  const [d, s, t] = table.split('.')
  const [r] = await execute(c, `select count(*) as N from ${d}.INFORMATION_SCHEMA.TABLES where TABLE_SCHEMA = ? and TABLE_NAME = ?`, [s, t])
  return Number(r.N) > 0
}

// Steps 1 to 5. Returns the summary for OPS.JOB_RUN: metrics measured,
// expectations met and missed (each missed one with its value).
export async function measure(c, { log = console.log, waitMinutes = WAIT_MINUTES } = {}) {
  // 1. Yesterday's bindings, carried into SILVER_STAGING by the swap.
  let removed = 0
  for (const table of Object.keys(QUALITY).map(staged)) {
    if (!(await tableExists(c, table))) continue
    for (const b of await bindings(c, table)) {
      await execute(c, `alter table ${table} drop data metric function ${b.fn} on (${b.on.join(', ')})`)
      removed++
    }
  }
  // 2. Attach, on a 5-minute schedule. A binding already there (a run
  // stopped half way) is left as it is.
  const attachedAt = new Date()
  let attached = 0
  for (const [table, metrics] of Object.entries(QUALITY)) {
    const have = new Set((await bindings(c, table)).map((b) => `${b.fn}(${b.on.join(',')})`.toUpperCase()))
    await execute(c, `alter table ${table} set DATA_METRIC_SCHEDULE = '5 MINUTE'`)
    for (const m of metrics) {
      if (have.has(`${fnName(m)}(${m.on.join(',')})`.toUpperCase())) continue
      await execute(c, `alter table ${table} add data metric function ${fnName(m)} on (${m.on.join(', ')}) expectation ${m.name} (${m.expect})`)
      attached++
    }
  }
  log(`data quality: ${removed} old bindings removed from SILVER_STAGING; ${attached} metrics attached to ${Object.keys(QUALITY).length} SILVER tables; waiting for their first measurement`)
  // 3. Wait for a measurement of every expectation after attachedAt.
  const expected = Object.values(QUALITY).flat().length
  const deadline = Date.now() + waitMinutes * 60_000
  let results = []
  for (;;) {
    results = []
    for (const table of Object.keys(QUALITY)) {
      const rows = await execute(c, `select METRIC_NAME, ARGUMENT_NAMES, VALUE, EXPECTATION_NAME, EXPECTATION_EXPRESSION, EXPECTATION_VIOLATED, MEASUREMENT_TIME
        from table(SNOWFLAKE.LOCAL.DATA_QUALITY_MONITORING_EXPECTATION_STATUS(REF_ENTITY_NAME => ?, REF_ENTITY_DOMAIN => 'TABLE'))
        where MEASUREMENT_TIME >= ?::timestamp_ltz
        qualify row_number() over (partition by EXPECTATION_NAME order by MEASUREMENT_TIME desc) = 1`, [table, attachedAt.toISOString()])
      results.push(...rows.map((r) => ({ table, ...r })))
    }
    if (results.length >= expected || Date.now() > deadline) break
    await sleep(POLL_SECONDS * 1000)
  }
  // 4. No more runs until the table changes.
  for (const table of Object.keys(QUALITY)) await execute(c, `alter table ${table} set DATA_METRIC_SCHEDULE = 'TRIGGER_ON_CHANGES'`)
  // 5. The summary.
  const measuredNames = new Set(results.map((r) => `${r.table}|${r.EXPECTATION_NAME}`))
  const notMeasured = Object.entries(QUALITY).flatMap(([table, ms]) => ms.filter((m) => !measuredNames.has(`${table}|${m.name}`)).map((m) => `${table.split('.').at(-1)}.${m.name}`))
  const missed = results.filter((r) => r.EXPECTATION_VIOLATED).map((r) => ({
    table: r.table.split('.').at(-1), metric: r.METRIC_NAME, column: list(r.ARGUMENT_NAMES).join(',') || null, value: Number(r.VALUE), expectation: r.EXPECTATION_EXPRESSION,
  }))
  const summary = { tables: Object.keys(QUALITY).length, metrics: expected, measured: results.length, met: results.length - missed.length, missed, notMeasured, waitedSeconds: Math.round((Date.now() - attachedAt.getTime()) / 1000) }
  log(`data quality: ${summary.measured} of ${expected} measured, ${summary.met} expectations met, ${missed.length} missed${missed.length ? `: ${missed.map((m) => `${m.table} ${m.metric}${m.column ? `(${m.column})` : ''} = ${m.value} (${m.expectation})`).join('; ')}` : ''}${notMeasured.length ? `; not measured in ${waitMinutes} minutes: ${notMeasured.join(', ')}` : ''}`)
  return summary
}

// check:dmf - every metric bound to its SILVER table on TRIGGER_ON_CHANGES,
// nothing else bound there, and nothing bound in SILVER_STAGING.
export async function checkBindings(c) {
  const problems = []
  for (const [table, metrics] of Object.entries(QUALITY)) {
    const have = await bindings(c, table)
    const key = (fn, on) => `${fn}(${on.join(',')})`.toUpperCase()
    const want = new Set(metrics.map((m) => key(fnName(m), m.on)))
    for (const m of metrics) if (!have.some((b) => key(b.fn, b.on) === key(fnName(m), m.on))) problems.push(`${table}: ${m.fn}(${m.on.join(', ')}) is not attached`)
    for (const b of have) {
      if (!want.has(key(b.fn, b.on))) problems.push(`${table}: ${b.fn}(${b.on.join(', ')}) is attached but not in QUALITY`)
      if (b.schedule !== 'TRIGGER_ON_CHANGES') problems.push(`${table}: ${b.fn} runs on "${b.schedule}", not TRIGGER_ON_CHANGES`)
    }
    if (await tableExists(c, staged(table))) {
      const left = await bindings(c, staged(table))
      if (left.length) problems.push(`${staged(table)}: ${left.length} metric(s) still attached`)
    }
  }
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const c = await connect({ as: 'transform', timeoutMs: 30000 })
  let problems
  try {
    problems = await checkBindings(c)
  } finally {
    await destroy(c)
  }
  for (const p of problems) console.log(`FAIL ${p}`)
  console.log(problems.length ? `\n${problems.length} problem(s).` : `${Object.values(QUALITY).flat().length} data metric functions on ${Object.keys(QUALITY).length} SILVER tables, all attached on TRIGGER_ON_CHANGES; none left in SILVER_STAGING.`)
  process.exit(problems.length ? 1 : 0)
}
