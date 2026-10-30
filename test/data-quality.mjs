// Test: data metric functions on one weekly schedule (scripts/data-quality.js),
// and a tick recording each job on the connection of the warehouse it wakes
// (scripts/jobs.js, JOB_SCHEDULE connectAs). No Snowflake: a fake connection.
//   node test/data-quality.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DMF_SCHEDULE, QUALITY, STALE_DAYS, latestResults, measure } from '../scripts/data-quality.js'
import { JOB_ORDER, JOB_SCHEDULE } from '../server/jobSchedule.js'
import { tick } from '../scripts/jobs.js'

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`)
}
const quiet = () => {}
const fake = (answer) => {
  const sql = []
  return { sql, execute: ({ sqlText, binds, complete }) => { sql.push(sqlText); complete(null, null, answer(sqlText, binds)) } }
}

// ---- attaching
{
  const stagedTable = 'OPTIONS_DB.SILVER_STAGING.PROVIDER'
  const c = fake((t, b) => {
    if (/INFORMATION_SCHEMA\.TABLES/.test(t)) return [{ N: 1 }]
    if (/DATA_METRIC_FUNCTION_REFERENCES/.test(t)) {
      return b[0] === stagedTable ? [{ METRIC_DATABASE_NAME: 'SNOWFLAKE', METRIC_SCHEMA_NAME: 'CORE', METRIC_NAME: 'ROW_COUNT', REF_ARGUMENTS: '[]', SCHEDULE: DMF_SCHEDULE }] : []
    }
    return []
  })
  const summary = await measure(c, { log: quiet })
  const all = c.sql.join('\n')
  const tables = Object.keys(QUALITY).length
  check('the schedule is Mondays at 07:00 UK time, once a week', DMF_SCHEDULE === 'USING CRON 0 7 * * 1 Europe/London')
  check('every live table is put on it', c.sql.filter((s) => s.includes(`set DATA_METRIC_SCHEDULE = '${DMF_SCHEDULE}'`)).length === tables, String(tables))
  check('  no other schedule is used (not 5 minutes, not TRIGGER_ON_CHANGES)', !/5 MINUTE|TRIGGER_ON_CHANGES/.test(all))
  check('  nothing waits for a measurement', !/DATA_QUALITY_MONITORING/.test(all))
  check('  every metric is attached', summary.attached === Object.values(QUALITY).flat().length && summary.schedule === DMF_SCHEDULE, JSON.stringify(summary))
  check('  a binding left on a _STAGING table is dropped', summary.removed >= 1 && /alter table OPTIONS_DB\.SILVER_STAGING\.PROVIDER drop data metric function SNOWFLAKE\.CORE\.ROW_COUNT/.test(all))
}

// ---- results
{
  const now = Date.parse('2026-11-04T12:00:00Z')
  const day = 86_400_000
  const row = (name, violated, at) => ({ METRIC_NAME: 'ROW_COUNT', ARGUMENT_NAMES: '[]', VALUE: 5, EXPECTATION_NAME: name, EXPECTATION_EXPRESSION: 'VALUE >= 1', EXPECTATION_VIOLATED: violated, MEASUREMENT_TIME: new Date(at) })
  const c = fake((t, b) => {
    if (b[0] === 'SHARED_DB.SILVER.LOCAL_AUTHORITY') return [row('ROWS_IN_RANGE', false, now - 2 * day), row('LOCAL_AUTHORITY_CODE_UNIQUE', true, now - 2 * day), row('NAME_NULLS', false, now - (STALE_DAYS + 1) * day)]
    return []
  })
  const r = await latestResults(c, { now })
  check('results: three measured, one missed, two met', r.measured === 3 && r.met === 2 && r.missed.length === 1 && r.missed[0].table === 'LOCAL_AUTHORITY', JSON.stringify(r.missed))
  check('  older than 8 days is stale; 2 days is not', STALE_DAYS === 8 && r.stale.length === 1 && /^LOCAL_AUTHORITY\.NAME_NULLS \(2026-10-26\)$/.test(r.stale[0]), JSON.stringify(r.stale))
  check('  expectations with no measurement yet are listed, not stale', r.notMeasured.length === Object.values(QUALITY).flat().length - 3 && !r.notMeasured.includes('LOCAL_AUTHORITY.NAME_NULLS'))
  const exactly = await latestResults(fake((t, b) => (b[0] === 'SHARED_DB.SILVER.LSOA' ? [row('ROWS_IN_RANGE', false, now - STALE_DAYS * day)] : [])), { now })
  check('  exactly 8 days old is not yet stale', exactly.stale.length === 0)
}

// ---- bookkeeping connections
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tick-'))
  const opened = []
  const conns = {}
  const open = async (opts) => {
    const as = opts?.as ?? 'app'
    opened.push(as)
    return (conns[as] = fake((t) => (/OTHER_OPEN|array_contains/.test(t) ? [] : [])))
  }
  const ran = []
  const runners = Object.fromEntries(JOB_ORDER.map((j) => [j, async () => { ran.push(j); return { outcome: 'succeeded' } }]))
  const result = await tick({ stateFile: path.join(dir, 'state.json'), now: () => Date.parse('2030-01-01T02:00:00Z'), openConnection: open, closeConnection: async () => {}, runners, log: quiet })
  const startedOn = (as) => conns[as]?.sql.filter((s) => /insert into SHARED_DB\.OPS\.JOB_RUN/.test(s)).length ?? 0
  const expected = (as) => ran.filter((j) => (JOB_SCHEDULE[j].connectAs ?? 'app') === as).length
  check('a tick with every job due ran them all', ran.length > 0 && result.ran.length === ran.length, String(ran.length))
  check('  one connection of each kind, opened once', new Set(opened).size === opened.length && opened.includes('loader') && opened.includes('transform'), opened.join())
  check('  each run is recorded on its own kind of connection', ['loader', 'transform', 'app'].every((as) => startedOn(as) === expected(as)), JSON.stringify({ loader: startedOn('loader'), transform: startedOn('transform'), app: startedOn('app') }))
  check('  the silver build, link check and official loads never use the app connection', ['transform-silver', 'website-links', 'reach-export', 'travel-monthly', 'official-api', 'vacancies-full'].every((j) => JOB_SCHEDULE[j].connectAs))
}

console.log(failures ? `\n${failures} failed` : '\nall passed')
process.exit(failures ? 1 : 0)
