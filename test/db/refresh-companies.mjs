// Test: the nightly Companies House refresh (scripts/refresh-companies.js).
// Uses the TESCO PLC test employers that test/browser/employers.mjs adds
// (ORG-T001 and ORG-T002; run that first). Calls Companies House for real,
// twice, and changes only those test employers' copies:
//   1. ORG-T001's copy is made old and wrong (status liquidation), and
//      ORG-T002's is made no longer used. The refresh puts ORG-T001's right,
//      logs the change, and leaves ORG-T002's alone.
//   2. With both in use, one fetch refreshes both, at the same time, from
//      the same response.
// Run against the test database: node test/db/refresh-companies.mjs
import { connect, execute, destroy } from '../../server/db.js'
import { refreshAll } from '../../scripts/refresh-companies.js'

const COMPANY = '00445790'
let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`)
}
const c = await connect()
const q = (sql, binds = []) => execute(c, sql, binds)
const rows = async () => Object.fromEntries((await q(`select ORGANISATIONID, EMPLOYERID, ISTESTDATA, to_varchar(COMPANYCHECKEDAT) as CHECKED,
    COMPANYRESPONSEID as R, COMPANYDETAILS:COMPANYSTATUS::string as STATUS
  from ILR.EMPLOYER where COMPANYNUMBER = ? and ORGANISATIONID in ('ORG-T001', 'ORG-T002')`, [COMPANY])).map((r) => [r.ORGANISATIONID, r]))

try {
  const start = await rows()
  if (!start['ORG-T001'] || !start['ORG-T002']) throw new Error('Run test/browser/employers.mjs first: it adds TESCO PLC to ORG-T001 and ORG-T002.')
  check('both TESCO PLC employers are test data', start['ORG-T001'].ISTESTDATA && start['ORG-T002'].ISTESTDATA)

  // 1. An old, wrong copy at ORG-T001; ORG-T002's employer no longer used.
  await q(`update ILR.EMPLOYER set COMPANYCHECKEDAT = dateadd(day, -3, current_timestamp()),
      COMPANYDETAILS = object_insert(COMPANYDETAILS::object, 'COMPANYSTATUS', 'liquidation', true)
    where EMPLOYERID = ?`, [start['ORG-T001'].EMPLOYERID])
  await q(`update ILR.EMPLOYER set ISACTIVE = false where EMPLOYERID = ?`, [start['ORG-T002'].EMPLOYERID])
  const before = await rows()
  const lines = []
  const counts = await refreshAll(c, { pause: 0, log: (line) => lines.push(line) })
  const after = await rows()
  check("ORG-T001's copy is refreshed: status active again, checked now", after['ORG-T001'].STATUS === 'active' && after['ORG-T001'].CHECKED !== before['ORG-T001'].CHECKED)
  check('the change is logged with the employer and organisation',
    lines.some((l) => l === `${COMPANY} ${start['ORG-T001'].EMPLOYERID} (ORG-T001): COMPANYSTATUS liquidation -> active`), lines.join(' | '))
  check("ORG-T002's employer, no longer used, is left alone", after['ORG-T002'].CHECKED === before['ORG-T002'].CHECKED && after['ORG-T002'].R === before['ORG-T002'].R)
  check('the summary line counts it', /companies for .* employers: .* refreshed, 1 employers with changes/.test(lines.at(-1)) && counts.failed === 0, lines.at(-1))

  // 2. Both in use: one fetch, the same copy for both.
  await q(`update ILR.EMPLOYER set ISACTIVE = true where EMPLOYERID = ?`, [start['ORG-T002'].EMPLOYERID])
  const lines2 = []
  await refreshAll(c, { pause: 0, log: (line) => lines2.push(line) })
  const both = await rows()
  check('both employers get the same response, checked at the same time', both['ORG-T001'].R === both['ORG-T002'].R && both['ORG-T001'].CHECKED === both['ORG-T002'].CHECKED,
    JSON.stringify(both))
  check('no changes this time, so no change lines', lines2.length === 1, lines2.join(' | '))
} finally {
  await destroy(c)
}
console.log(failures ? `\n${failures} failed` : '\nAll passed')
process.exit(failures ? 1 : 0)
