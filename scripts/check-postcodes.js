// check-postcodes.js - do the apps' postcode list and silver's agree? (gap 6
// of docs/data-journey.md.) Warren and Meadow read SHARED_DB.REF.POSTCODE
// (the ONS Postcode Directory as imported by scripts/import-ref.js); silver's
// SHARED_DB.SILVER.POSTCODE is built from the directory loaded to RAW.ONSPD.
// They can be different releases. This reports how they differ and chooses
// nothing: it never changes a table and exits 0 whatever it finds.
//
//   npm run check:postcodes
//
// Read-only, as TRANSFORM_USER. Needs sql/postcode_check_01_grant.sql run
// once (read on REF.POSTCODE). Rows REF has marked gone (GONEAT) are left
// out and counted. Compared by postcode with no spaces:
//   - in only one of the two
//   - live in one and terminated in the other, or terminated in different months
//   - latitude or longitude more than LOCATION_TOLERANCE degrees apart
//   - a different local authority code (a newer directory can use newer codes)
import { connect, execute, destroy } from '../server/db.js'

const LOCATION_TOLERANCE = 0.00002 // about 2 metres; REF holds 6 decimal places
const EXAMPLES = 5

const WITH = `
  ref as (
    select POSTCODE_KEY as K, POSTCODE as P, TERMINATED as T, LOCAL_AUTHORITY as LA, LATITUDE as LAT, LONGITUDE as LON
    from SHARED_DB.REF.POSTCODE where GONEAT is null
  ),
  silver as (
    select POSTCODE_COMPACT as K, POSTCODE as P, to_char(TERMINATED, 'YYYYMM') as T, LOCAL_AUTHORITY_CODE as LA, LATITUDE as LAT, LONGITUDE as LON
    from SHARED_DB.SILVER.POSTCODE
  ),
  joined as (
    select coalesce(r.K, s.K) as K, r.K as RK, s.K as SK,
           r.P as RP, s.P as SP, r.T as RT, s.T as ST, r.LA as RLA, s.LA as SLA,
           r.LAT as RLAT, s.LAT as SLAT, r.LON as RLON, s.LON as SLON
    from ref r full outer join silver s on r.K = s.K
  )`

// Each kind of difference: a name, the test on `joined`, and what to show.
const KINDS = [
  ['only in REF (the apps have it, silver does not)', 'SK is null', 'RP, RT'],
  ['only in silver (silver has it, the apps do not)', 'RK is null', 'SP, ST'],
  ['live in one, terminated in the other', 'RK is not null and SK is not null and (RT is null) <> (ST is null)', 'RP, RT, ST'],
  ['terminated in different months', 'RK is not null and SK is not null and RT is not null and ST is not null and RT <> ST', 'RP, RT, ST'],
  [`location differs by more than ${LOCATION_TOLERANCE} degrees`, `RK is not null and SK is not null and (abs(RLAT - SLAT) > ${LOCATION_TOLERANCE} or abs(RLON - SLON) > ${LOCATION_TOLERANCE})`, 'RP, RLAT, RLON, SLAT, SLON'],
  ['location in one and not the other', 'RK is not null and SK is not null and ((RLAT is null) <> (SLAT is null))', 'RP, RLAT, SLAT'],
  ['different local authority code', 'RK is not null and SK is not null and RLA is distinct from SLA', 'RP, RLA, SLA'],
]

const c = await connect({ as: 'transform', timeoutMs: 120000 })
try {
  let totals
  try {
    ;[totals] = await execute(c, `with ${WITH}
      select (select count(*) from ref) as REF_ROWS, (select count(*) from silver) as SILVER_ROWS,
             count_if(RK is not null and SK is not null) as BOTH
      from joined`)
  } catch (err) {
    console.error(`Can't read both tables: ${err.message}`)
    console.error('If it says REF.POSTCODE does not exist or is not authorized, run sql/postcode_check_01_grant.sql as ACCOUNTADMIN first.')
    process.exitCode = 1
    totals = null
  }
  if (totals) {
    const [gone] = await execute(c, 'select count(*) as N from SHARED_DB.REF.POSTCODE where GONEAT is not null')
    const [rel] = await execute(c, 'select max(LASTSEENAT) as REF_LAST_SEEN from SHARED_DB.REF.POSTCODE')
    console.log(`REF.POSTCODE (apps): ${totals.REF_ROWS} postcodes (${gone.N} more marked gone, left out)`)
    console.log(`SILVER.POSTCODE:     ${totals.SILVER_ROWS} postcodes`)
    console.log(`In both: ${totals.BOTH}`)
    if (rel.REF_LAST_SEEN) console.log(`REF last seen by an import: ${new Date(rel.REF_LAST_SEEN).toISOString()}`)
    for (const [label, test, show] of KINDS) {
      const [n] = await execute(c, `with ${WITH} select count(*) as N from joined where ${test}`)
      console.log(`\n${label}: ${n.N}`)
      if (Number(n.N)) {
        const rows = await execute(c, `with ${WITH} select ${show} from joined where ${test} order by K limit ${EXAMPLES}`)
        for (const r of rows) console.log('  ' + Object.entries(r).map(([k, v]) => `${k}=${v ?? '-'}`).join('  '))
        // Which pairs of codes make up a local authority difference.
        if (label === 'different local authority code') {
          const pairs = await execute(c, `with ${WITH} select RLA, SLA, count(*) as N from joined where ${test} group by 1, 2 order by 3 desc limit 8`)
          console.log('  by pair of codes (REF, silver, postcodes):')
          for (const r of pairs) console.log(`    ${r.RLA ?? '-'}  ${r.SLA ?? '-'}  ${r.N}`)
        }
      }
    }
    console.log('\nNothing was changed. Which list the apps should use is still to decide.')
  }
} finally {
  await destroy(c)
}
