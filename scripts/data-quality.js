// data-quality.js - Snowflake data metric functions on the key silver and
// gold tables (decision 21; sql/silver_03_dmf.sql, sql/gold_01_setup.sql),
// attached by the transform job after each day's swap
// (scripts/transform-silver.js).
//
// A swapped-in table is new each day: dbt builds it from scratch in
// SILVER_STAGING or GOLD_STAGING, and a swap moves a table's metric
// bindings with it (tested 14 October 2026). So after the swap the SILVER
// and GOLD tables have none, and the previous versions, now in the
// _STAGING schemas, carry yesterday's. The job:
//   0. makes the custom metrics if they aren't there (SHOWN_BASE_UNDER_10 and the two fares
//      ones, below)
//   1. removes the bindings from the _STAGING tables
//   2. attaches every metric below to its table, each with its
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
//   npm run check:dmf    every metric below is bound to its table, on
//                        TRIGGER_ON_CHANGES, and the _STAGING tables have none

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { connect, execute, destroy } from '../server/db.js'

// The honesty rules' "hidden below" (dbt var honesty_hide_below, checked
// against the app's rules.mjs by check:dbt): one source for both.
const HIDE_BELOW = Number(fs.readFileSync(new URL('../dbt/dbt_project.yml', import.meta.url), 'utf8').match(/honesty_hide_below:\s*(\d+)/)[1])

// The custom metric on gold (the gold plan): how many rows show a figure
// based on fewer than HIDE_BELOW people. Always 0 if the honesty rules hold.
export const SHOWN_BASE_UNDER = `SHARED_DB.GOVERNANCE.SHOWN_BASE_UNDER_${HIDE_BELOW}`
const CREATE_SHOWN_BASE_UNDER = `create data metric function if not exists ${SHOWN_BASE_UNDER}(ARG_T table(ARG_STATUS varchar, ARG_BASE number))
  returns number
  comment = 'Rows that show a figure (status shown) based on fewer than ${HIDE_BELOW} people: the honesty rules (dbt macros/figure.sql) say none. Attached to the gold figure tables by scripts/data-quality.js.'
  as 'select count_if(ARG_STATUS = ''shown'' and ARG_BASE < ${HIDE_BELOW}) from ARG_T'`

// Two more custom metrics, on the fares tables (gold bus_fare and tram_fare, decision 19
// phase C, 21 October 2026):
//   FARE_PRICE_PROBLEMS  rows whose price is empty or £0.00: a free fare must read "Free"
//                        (price_text), never a zero price; a range may not start at "£0.00"
//   FARES_OVER_12_MONTHS rows whose "as at" date is over 12 months old: fares that old stay
//                        in silver and are not shown (gold's public view)
export const FARE_PRICE_PROBLEMS = 'SHARED_DB.GOVERNANCE.FARE_PRICE_PROBLEMS'
export const FARES_OVER_12_MONTHS = 'SHARED_DB.GOVERNANCE.FARES_OVER_12_MONTHS'
const CREATE_FARE_METRICS = [
  `create data metric function if not exists ${FARE_PRICE_PROBLEMS}(ARG_T table(ARG_MIN number, ARG_MAX number, ARG_TEXT varchar))
  returns number
  comment = 'Fares rows with no price, or a zero price not labelled Free (a free fare reads Free in price_text; no price text starts at 0.00). Expected 0. Attached to gold bus_fare and tram_fare by scripts/data-quality.js.'
  as 'select count_if(ARG_MIN is null or ARG_MAX is null or ARG_TEXT is null or (ARG_MAX = 0 and ARG_TEXT <> ''Free'') or (ARG_MIN = 0 and ARG_MAX > 0 and ARG_TEXT not like ''Free to%'') or ARG_TEXT like ''%£0.00%'') from ARG_T'`,
  `create data metric function if not exists ${FARES_OVER_12_MONTHS}(ARG_T table(ARG_AS_AT date))
  returns number
  comment = 'Fares rows whose as-at date is over 12 months old: those stay in silver and are not in gold. Expected 0. Attached to gold bus_fare and tram_fare by scripts/data-quality.js.'
  as 'select count_if(ARG_AS_AT is null or ARG_AS_AT < dateadd(month, -12, current_date())) from ARG_T'`,
]
const fares = () => [
  { fn: FARE_PRICE_PROBLEMS, on: ['price_min', 'price_max', 'price_text'], name: 'FARE_PRICE_PROBLEMS', expect: 'VALUE = 0' },
  { fn: FARES_OVER_12_MONTHS, on: ['as_at'], name: 'FARES_OVER_12_MONTHS', expect: 'VALUE = 0' },
]

// The metrics, with thresholds from the tables on 14 October 2026 (in
// brackets) and room for normal change. FRESHNESS needs a timestamp column,
// so only VACANCY has it (the others are refreshed by hand or yearly; their
// freshness is watched on the loads).
const rows = (min, max) => ({ fn: 'ROW_COUNT', on: [], name: 'ROWS_IN_RANGE', expect: max ? `VALUE >= ${min} AND VALUE <= ${max}` : `VALUE >= ${min}` })
const nulls = (col, max = 0) => ({ fn: 'NULL_COUNT', on: [col], name: `${col}_NULLS`.toUpperCase(), expect: max ? `VALUE <= ${max}` : 'VALUE = 0' })
const dupes = (col) => ({ fn: 'DUPLICATE_COUNT', on: [col], name: `${col}_UNIQUE`.toUpperCase(), expect: 'VALUE = 0' })
const fresh = (col, hours) => ({ fn: 'FRESHNESS', on: [col], name: `${col}_FRESH`.toUpperCase(), expect: `VALUE <= ${hours * 3600}` })
const most = (col, max) => ({ fn: 'MAX', on: [col], name: `${col}_AT_MOST_${max}`.toUpperCase(), expect: `VALUE <= ${max}` })
const honest = () => ({ fn: SHOWN_BASE_UNDER, on: ['status', 'base'], name: `SHOWN_BASE_UNDER_${HIDE_BELOW}`, expect: 'VALUE = 0' })

export const QUALITY = {
  'SHARED_DB.SILVER.POSTCODE': [rows(2_600_000, 2_900_000), dupes('postcode'), nulls('postcode'), nulls('local_authority_code', 30_000)], // 2,729,090; 24,265 no LA
  'SHARED_DB.SILVER.LSOA': [rows(43_000, 45_000), dupes('lsoa21_code'), nulls('name'), nulls('local_authority_code'), nulls('population', 10_500)], // 43,914; 10,159 outside England
  'SHARED_DB.SILVER.LOCAL_AUTHORITY': [rows(350, 370), dupes('local_authority_code'), nulls('name')], // 361
  'SHARED_DB.SILVER.VACANCY': [rows(1_000), dupes('vacancy_reference'), nulls('title'), nulls('local_authority_code', 200), fresh('last_seen_at', 26)], // 4,659; 17 no LA
  'SHARED_DB.SILVER.VACANCY_SOC': [rows(1_000), dupes('vacancy_soc_key'), nulls('soc_title')], // 5,898
  'OPTIONS_DB.SILVER.PROVIDER': [rows(25_000, 29_000), dupes('ukprn'), nulls('name')], // 26,696
  'OPTIONS_DB.SILVER.COLLEGE_16_18': [rows(2_500, 3_100), dupes('urn'), nulls('name'), nulls('results_year')], // 2,792
  // Gold (15 October 2026): the figure tables also get the honesty metric.
  'OPTIONS_DB.GOLD.INSTITUTION_CARD': [rows(2_500, 2_900), dupes('urn'), nulls('name')], // 2,689
  'OPTIONS_DB.GOLD.INSTITUTION_RESULT': [rows(65_000, 85_000), dupes('result_key'), honest()], // 74,281
  'OPTIONS_DB.GOLD.INSTITUTION_ACHIEVEMENT': [rows(1_000, 1_500), dupes('achievement_key'), honest()], // 1,246
  'OPTIONS_DB.GOLD.UNIVERSITY_COURSE_CARD': [rows(27_000, 34_000), dupes('course_key'), nulls('title')], // 30,562
  'OPTIONS_DB.GOLD.UNIVERSITY_COURSE_RESULT': [rows(100_000, 125_000), dupes('outcome_key'), honest()], // 112,156
  'SHARED_DB.GOLD.VACANCY_CARD': [rows(1_000), dupes('vacancy_reference'), nulls('title')], // 3,799
  'SHARED_DB.GOLD.JOB_OUTLOOK': [rows(5_300, 5_400), dupes('outlook_key')], // 5,356: every SOC unit group by 13 areas
  'SHARED_DB.GOLD.AREA_PROFILE': [rows(350, 370), dupes('local_authority_code'), nulls('name')], // 361
  'SHARED_DB.GOLD.POSTCODE_AREA': [rows(2_600_000, 2_900_000), dupes('postcode_compact')], // 2,729,090
  'SHARED_DB.GOLD.PROVIDER_BENCHMARK': [rows(55_000, 85_000), dupes('benchmark_key'), honest()], // 68,061
  // Travel times (decision 19): every pair of South Yorkshire's 860 LSOAs, nothing over the 90-minute cap.
  'SHARED_DB.GOLD.TRAVEL_TIME': [rows(700_000, 760_000), dupes('travel_key'), nulls('summary'), most('transit_minutes_p75', 90), most('walk_minutes', 90),
    most('bus_minutes_p75', 90), most('rail_minutes_p75', 90), nulls('notes')], // 739,600
  // Fares (decision 19 phase C): no price empty or zero (free reads "Free"), nothing shown over 12 months old.
  'SHARED_DB.GOLD.BUS_FARE': [rows(40, 300), dupes('fare_key'), nulls('price_text'), nulls('caveat'), ...fares()], // 90 (21 October 2026)
  'SHARED_DB.GOLD.TRAM_FARE': [rows(10, 40), dupes('fare_key'), nulls('price_text'), nulls('caveat'), ...fares()], // 16
}
export const WAIT_MINUTES = 15
const POLL_SECONDS = 30

const staged = (table) => table.replace(/\.(SILVER|GOLD)\./, '.$1_STAGING.')
const db = (table) => table.split('.')[0]
const fnName = (m) => (m.fn.includes('.') ? m.fn : `SNOWFLAKE.CORE.${m.fn}`)
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
  // 0. The custom metrics.
  await execute(c, CREATE_SHOWN_BASE_UNDER)
  for (const create of CREATE_FARE_METRICS) await execute(c, create)
  // 1. Yesterday's bindings, carried into the _STAGING schemas by the swap.
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
  log(`data quality: ${removed} old bindings removed from the _STAGING schemas; ${attached} metrics attached to ${Object.keys(QUALITY).length} SILVER and GOLD tables; waiting for their first measurement`)
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

// check:dmf - every metric bound to its table on TRIGGER_ON_CHANGES,
// nothing else bound there, and nothing bound in the _STAGING schemas.
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
  console.log(problems.length ? `\n${problems.length} problem(s).` : `${Object.values(QUALITY).flat().length} data metric functions on ${Object.keys(QUALITY).length} SILVER and GOLD tables, all attached on TRIGGER_ON_CHANGES; none left in the _STAGING schemas.`)
  process.exit(problems.length ? 1 : 0)
}
