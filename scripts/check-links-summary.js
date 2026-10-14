// check-links-summary.js - where the website link check has got to
// (decision 26; scripts/check-website-links.js): every link silver has by
// its latest result, how many are hidden, how many haven't been checked
// yet, each day's slice, and the last run. Read-only, as DATA_LOAD_USER.
// Fails if a hidden link hasn't failed twice in a row (the rule broken).
//   npm run check:links
import { connect, execute, destroy } from '../server/db.js'
import { todaysSlice } from './check-website-links.js'

const c = await connect({ as: 'loader', timeoutMs: 30000 })
try {
  const [latest] = await execute(c, 'select max(LASTINSILVERAT) as T from SHARED_DB.EXT.WEBSITE_LINK')
  const inSilver = 'LASTINSILVERAT >= dateadd(hour, -1, ?::timestamp_ltz)'
  const since = latest.T ? new Date(latest.T).toISOString() : '9999-01-01'
  const byResult = await execute(c, `select coalesce(LASTRESULT, 'not checked yet') as R, count(*) as N, count_if(ISHIDDEN) as HIDDEN
    from SHARED_DB.EXT.WEBSITE_LINK where ${inSilver} group by 1 order by 2 desc`, [since])
  const bySlice = await execute(c, `select SLICE, count(*) as N, count(LASTCHECKEDAT) as CHECKED, max(LASTCHECKEDAT) as LAST
    from SHARED_DB.EXT.WEBSITE_LINK where ${inSilver} group by 1 order by 1`, [since])
  const [gone] = await execute(c, `select count(*) as N from SHARED_DB.EXT.WEBSITE_LINK where not (${inSilver})`, [since])
  const [bad] = await execute(c, 'select count(*) as N from SHARED_DB.EXT.WEBSITE_LINK where ISHIDDEN and CONSECUTIVEFAILURES < 2')
  // The last run that ran (a run refused because another was open is not
  // one), in UK time.
  const [run] = await execute(c, `select to_varchar(convert_timezone('Europe/London', STARTEDAT), 'YYYY-MM-DD HH24:MI') as S, OUTCOME, TRIGGEREDBY, to_json(SUMMARY) as SUMMARY
    from SHARED_DB.OPS.JOB_RUN where JOB = 'website-links' and OUTCOME is distinct from 'refused' order by STARTEDAT desc limit 1`)
  const total = byResult.reduce((n, r) => n + Number(r.N), 0)
  console.log(`Website links in silver: ${total} (today's slice is ${todaysSlice()})`)
  for (const r of byResult) console.log(`  ${String(r.R).padEnd(16)} ${String(r.N).padStart(6)}${Number(r.HIDDEN) ? `  (${r.HIDDEN} hidden)` : ''}`)
  console.log('By day (slice: links, checked, last checked):')
  for (const s of bySlice) console.log(`  ${s.SLICE}: ${s.N}, ${s.CHECKED} checked${s.LAST ? `, last ${new Date(s.LAST).toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'short', timeStyle: 'short' })} UK time` : ''}`)
  console.log(`No longer in silver (kept, not checked): ${gone.N}`)
  console.log(run ? `Last run: ${run.S} UK time (${run.TRIGGEREDBY}), ${run.OUTCOME}: ${run.SUMMARY}` : 'Last run: never')
  if (Number(bad.N)) {
    console.log(`FAIL ${bad.N} link(s) hidden without two failures in a row`)
    process.exitCode = 1
  }
} finally {
  await destroy(c)
}
