// Test: Companies House, build step 2 (server/companiesHouse.js).
//
// Part 1 needs nothing: the rate limiter, company numbers, and turning a
// profile into EXT.COMPANY columns and changes, from made-up profiles.
// Part 2 writes made-up company ZZ999999 to EXT.COMPANY twice, and gives one
// of ORG-T001's test employers its own copy, read through ORG_EMPLOYER as a
// manager and as a tutor, all in one transaction that's rolled back: nothing
// is kept, and Companies House isn't called.
//   node test/db/companies-house.mjs
import { connect, execute, destroy } from '../../server/db.js'
import { makeLimiter, companyNumberOf, companyColumns, companyChanges, writeCompany } from '../../server/companiesHouse.js'
import { ORG_EMPLOYER } from '../../server/access.js'

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`)
}

const NUMBER = 'ZZ999999'
const profile = {
  company_number: NUMBER,
  company_name: 'MADE UP TEST COMPANY LIMITED',
  company_status: 'active',
  type: 'ltd',
  jurisdiction: 'england-wales',
  date_of_creation: '2001-02-03',
  registered_office_address: { address_line_1: '1 Test Street', locality: 'Testtown', postal_code: 'ZZ1 1ZZ', country: 'England' },
  sic_codes: ['85320', '85590'],
  previous_company_names: [{ name: 'OLD NAME LIMITED', effective_from: '2001-02-03', ceased_on: '2005-06-07' }],
  accounts: { next_accounts: { due_on: '2027-03-31', overdue: false } },
  confirmation_statement: { next_due: '2027-01-15', overdue: false },
  has_insolvency_history: false,
  etag: 'etag-1',
}
const changed = { ...profile, company_status: 'liquidation', sic_codes: ['85320'], etag: 'etag-2' }

// ---------------------------------------------------------------- part 1
console.log('Part 1: no database, no Companies House')
{
  let t = 0
  const take = makeLimiter(3, 1000, () => t)
  const first = [take(), take(), take(), take()]
  t = 999
  const stillFull = take()
  t = 1000
  const afterWindow = take()
  check('the limiter allows 3 in the window, then refuses until the window passes', first.join() === 'true,true,true,false' && !stillFull && afterWindow)

  const numbers = [['1234', '00001234'], [' sc 123456 ', 'SC123456'], ['01234567', '01234567'], ['Tesco', null], ['123456789', null], ['S1234567', null]]
  check('company numbers are padded and tidied, names are not numbers', numbers.every(([text, want]) => companyNumberOf(text) === want))

  const cols = companyColumns(profile, 'etag-1')
  check('the columns come from the profile', cols.COMPANYNAME === profile.company_name && cols.ADDRESSPOSTCODE === 'ZZ1 1ZZ' &&
    cols.ACCOUNTSNEXTDUE === '2027-03-31' && cols.SICCODES.length === 2 && cols.ADDRESSLINE2 === null && cols.ETAG === 'etag-1')
  check('no changes the first time', companyChanges(undefined, cols).length === 0)
  const stored = { ...Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, v === null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v)])) }
  check('the same profile again is no change', companyChanges(stored, cols).length === 0)
  const changes = companyChanges(stored, companyColumns(changed, 'etag-2'))
  check('a new status and SIC codes are two changes (the ETag is not one)',
    changes.map((c) => c.field).join() === 'COMPANYSTATUS,SICCODES' && changes[0].oldValue === 'active' && changes[0].newValue === 'liquidation',
    changes.map((c) => c.field).join())
}

// ---------------------------------------------------------------- part 2
console.log('Part 2: EXT.COMPANY, rolled back')
const SET = `set (CURRENT_ORGANISATIONID, CURRENT_ISTESTDATA, SEES_ALL_LEARNERS, SEES_ALL_OFFICERS, SEES_MANAGER_ONLY,
  CURRENT_OFFICERREFNUMBER, CASELOAD_OFFICERREFNUMBER, APPRENTICES_OF_EMPLOYERID, OWN_LEARNREFNUMBER, CURRENT_USERID) = ('ORG-T001', true, true, true, ?, '', '', '', '', '')`
const c = await connect()
try {
  const [before] = await execute(c, `select count(*) as N from EXT.COMPANY where COMPANYNUMBER = ?`, [NUMBER])
  check('ZZ999999 is not in EXT.COMPANY to start with', before.N === 0)
  await execute(c, 'begin')
  try {
    const first = await writeCompany(c, companyColumns(profile, 'etag-1'), 'test-response-1')
    check('first save adds the company', first.created && first.changes.length === 0)
    const [row1] = await execute(c, `select to_varchar(DATEOFCREATION) as D, to_json(SICCODES) as S, PREVIOUSNAMES[0]:name::string as P,
      SOURCERESPONSEID as R, LASTCHANGEDAT as CH from EXT.COMPANY where COMPANYNUMBER = ?`, [NUMBER])
    check('dates, SIC codes, previous names and the response ID are stored',
      row1.D === '2001-02-03' && row1.S === '["85320","85590"]' && row1.P === 'OLD NAME LIMITED' && row1.R === 'test-response-1', JSON.stringify(row1))

    const same = await writeCompany(c, companyColumns(profile, 'etag-1'), 'test-response-2')
    check('the same details again: no changes', !same.created && same.changes.length === 0, same.changes.map((x) => x.field).join())

    const second = await writeCompany(c, companyColumns(changed, 'etag-2'), 'test-response-3')
    check('changed details: status and SIC codes', !second.created && second.changes.map((x) => x.field).join() === 'COMPANYSTATUS,SICCODES')
    const [count] = await execute(c, `select count(*) as N, max(COMPANYSTATUS) as S, max(SOURCERESPONSEID) as R from EXT.COMPANY where COMPANYNUMBER = ?`, [NUMBER])
    check('still one row (MERGE), with the new status and response', count.N === 1 && count.S === 'liquidation' && count.R === 'test-response-3')
    const recorded = await execute(c, `select FIELDNAME, OLDVALUE, NEWVALUE, RESPONSEID from EXT.COMPANY_CHANGE where COMPANYNUMBER = ? order by FIELDNAME`, [NUMBER])
    check('the changes are in EXT.COMPANY_CHANGE', recorded.length === 2 && recorded[0].FIELDNAME === 'COMPANYSTATUS' &&
      recorded[1].OLDVALUE === '["85320","85590"]' && recorded.every((r) => r.RESPONSEID === 'test-response-3'), JSON.stringify(recorded))

    // Link it to one of ORG-T001's test employers, then read it as each role.
    const [employer] = await execute(c, `select EMPLOYERID from ILR.EMPLOYER where ORGANISATIONID = 'ORG-T001' and ISTESTDATA order by EMPLOYERID limit 1`)
    await execute(c, `update ILR.EMPLOYER set COMPANYNUMBER = ?, COMPANYDETAILS = parse_json(?) where EMPLOYERID = ?`,
      [NUMBER, JSON.stringify(companyColumns(changed, 'etag-2')), employer.EMPLOYERID])
    await execute(c, SET, [true])
    const asManager = await execute(c, `select EMPLOYERID, COMPANYDETAILS:COMPANYNAME::string as COMPANYNAME, COMPANYDETAILS:ADDRESSPOSTCODE::string as ADDRESSPOSTCODE
      from ${ORG_EMPLOYER} where COMPANYNUMBER = ?`, [NUMBER])
    check('a manager sees the company and its registered office', asManager.length === 1 && asManager[0].EMPLOYERID === employer.EMPLOYERID && asManager[0].ADDRESSPOSTCODE === 'ZZ1 1ZZ')
    await execute(c, SET, [false])
    const asTutor = await execute(c, `select COMPANYDETAILS:COMPANYNAME::string as COMPANYNAME, COMPANYDETAILS:COMPANYSTATUS::string as COMPANYSTATUS,
      to_json(COMPANYDETAILS:SICCODES) as S, COMPANYDETAILS:ADDRESSLINE1::string as ADDRESSLINE1, COMPANYDETAILS:ADDRESSPOSTCODE::string as ADDRESSPOSTCODE
      from ${ORG_EMPLOYER} where COMPANYNUMBER = ?`, [NUMBER])
    check('a tutor sees name, status and SIC codes, but not the registered office', asTutor.length === 1 && asTutor[0].COMPANYNAME &&
      asTutor[0].COMPANYSTATUS === 'liquidation' && asTutor[0].S === '["85320"]' && asTutor[0].ADDRESSLINE1 === null && asTutor[0].ADDRESSPOSTCODE === null)
    await execute(c, `set CURRENT_ORGANISATIONID = 'ORG-T002'`)
    const otherOrg = await execute(c, `select * from ${ORG_EMPLOYER} where COMPANYNUMBER = ?`, [NUMBER])
    check('another organisation does not see it', otherOrg.length === 0)
  } finally {
    await execute(c, 'rollback')
  }
  const [after] = await execute(c, `select (select count(*) from EXT.COMPANY where COMPANYNUMBER = ?) as C,
    (select count(*) from EXT.COMPANY_CHANGE where COMPANYNUMBER = ?) as CH,
    (select count(*) from ILR.EMPLOYER where COMPANYNUMBER = ?) as E`, [NUMBER, NUMBER, NUMBER])
  check('nothing kept after the rollback', after.C === 0 && after.CH === 0 && after.E === 0, JSON.stringify(after))
} finally {
  destroy(c)
}

console.log(failures ? `\n${failures} failed` : '\nAll passed')
process.exit(failures ? 1 : 0)
