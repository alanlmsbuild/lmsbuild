// The employer sites test data as sql/employers_03_sites_contacts.sql seeds
// it (and the test reset puts it back), for test/db/employer-sites.mjs and
// test/browser/sites.mjs. Both assert the fixed numbers below; the numbers
// worked out from the tables are only an extra check.

// How many current apprentices each Testco Retail contact sees in Burrow.
export const FIXED = {
  'USR-T0201': 17, // Erin, head office
  'USR-T0207': 3, // Sam, Crosspool: TESTL0001, 0004, 0007
  'USR-T0208': 5, // Ari, Crosspool and Hillsborough: those, TESTL0010, 0028
  'USR-T0209': 0, // Lee, his only assignment ended
  'USR-T0210': 0, // Kai, no head office flag, no assignments
}
export const NAMES = { 'USR-T0201': 'Erin', 'USR-T0207': 'Sam', 'USR-T0208': 'Ari', 'USR-T0209': 'Lee', 'USR-T0210': 'Kai' }

// The links and aims test/browser/sites.mjs changes, as seeded.
export const SEEDED = {
  TESTL0004: { from: '2026-01-12', site: 'SITE-T001', lineManager: 'CON-T211' },
  TESTL0044: { from: '2026-01-19', site: null, lineManager: null, postcode: 'ZZ3 3DA' },
}

// Each contact's count, worked out from the tables the way check 6 of
// sql/employers_03_sites_contacts.sql does, not by the app's rule.
export async function derivedCounts(q) {
  const rows = await q(`
    with users as (select USERID, EMPLOYERID, ISACTIVE, ISHEADOFFICE from ACCESS.APP_USER where USERID in (${Object.keys(FIXED).map(() => '?').join(', ')})),
    current_links as (select LEARNREFNUMBER, EMPLOYERID, SITEID from ILR.LEARNER_EMPLOYER where TODATE is null or TODATE >= current_date()),
    site_access as (select a.USERID, a.SITEID, s.EMPLOYERID from ACCESS.APP_USER_SITE a join ILR.EMPLOYER_SITE s on s.SITEID = a.SITEID where a.ENDEDAT is null),
    visible as (
      select u.USERID, l.LEARNREFNUMBER from users u join current_links l on l.EMPLOYERID = u.EMPLOYERID where u.ISACTIVE and u.ISHEADOFFICE = true
      union
      select u.USERID, l.LEARNREFNUMBER from users u join site_access a on a.USERID = u.USERID and a.EMPLOYERID = u.EMPLOYERID
        join current_links l on l.EMPLOYERID = u.EMPLOYERID and l.SITEID = a.SITEID where u.ISACTIVE)
    select u.USERID, count(v.LEARNREFNUMBER) as N from users u left join visible v on v.USERID = u.USERID group by u.USERID`, Object.keys(FIXED))
  return Object.fromEntries(rows.map((r) => [r.USERID, Number(r.N)]))
}

// What isn't as seeded: [] when the test data is in place.
export async function seedProblems(q) {
  const problems = []
  const derived = await derivedCounts(q)
  for (const [user, n] of Object.entries(FIXED)) {
    if (derived[user] !== n) problems.push(`${NAMES[user]} would see ${derived[user] ?? 'nothing (no such user)'}, not ${n}`)
  }
  for (const [ref, seed] of Object.entries(SEEDED)) {
    const links = await q(`select to_varchar(FROMDATE) as F, SITEID, LINEMANAGERCONTACTID as LM from ILR.LEARNER_EMPLOYER
      where LEARNREFNUMBER = ? and EMPLOYERID = 'EMP-T001' and (TODATE is null or TODATE >= current_date())`, [ref])
    const l = links[0]
    if (links.length !== 1 || l.F !== seed.from || l.SITEID !== seed.site || l.LM !== seed.lineManager) {
      problems.push(`${ref}'s current Testco link isn't as seeded: ${JSON.stringify(links)}`)
    }
    if (seed.postcode) {
      const [p] = await q(`select listagg(distinct DELLOCPOSTCODE, ',') as P from ILR.LEARNING_DELIVERY
        where LEARNREFNUMBER = ? and REMOVEDAT is null and LEARNACTENDDATE is null`, [ref])
      if (p.P !== seed.postcode) problems.push(`${ref}'s open aims' postcode is ${p.P}, not ${seed.postcode}`)
    }
  }
  return problems
}

// Stops the test if the seeded data isn't in place.
export async function requireSeed(q) {
  const problems = await seedProblems(q)
  if (problems.length > 0) {
    console.log(`FAIL the seeded employer test data isn't in place: run the test reset first (sql/test_reset_02_reset.sql).\n  ${problems.join('\n  ')}`)
    process.exit(1)
  }
}

// Puts back what test/browser/sites.mjs changes, by updates only (the app's
// role can't delete, like test/browser/restore-4g1.mjs), test rows only:
//   TESTL0004  the seeded Crosspool link is current again; links the move
//              started are ended before they began, so never current
//   TESTL0044  no site or line manager again, open aims at ZZ3 3DA
//   the sites and contacts it adds are marked no longer used / current
// Those added rows and the change history stay until the next reset.
export async function restoreSites(q) {
  const T4 = SEEDED.TESTL0004
  const T44 = SEEDED.TESTL0044
  const TEST = `LEARNREFNUMBER in (select LEARNREFNUMBER from ILR.LEARNER where ISTESTDATA)`
  await q(`update ILR.LEARNER_EMPLOYER set TODATE = dateadd(day, -1, FROMDATE)
    where LEARNREFNUMBER = 'TESTL0004' and EMPLOYERID = 'EMP-T001' and FROMDATE > ?::date and ISTESTDATA and ${TEST}`, [T4.from])
  await q(`update ILR.LEARNER_EMPLOYER set TODATE = null, SITEID = ?, LINEMANAGERCONTACTID = ?
    where LEARNREFNUMBER = 'TESTL0004' and EMPLOYERID = 'EMP-T001' and FROMDATE = ?::date and ISTESTDATA and ${TEST}`, [T4.site, T4.lineManager, T4.from])
  await q(`update ILR.LEARNER_EMPLOYER set SITEID = null, LINEMANAGERCONTACTID = null
    where LEARNREFNUMBER = 'TESTL0044' and EMPLOYERID = 'EMP-T001' and FROMDATE = ?::date and ISTESTDATA and ${TEST}`, [T44.from])
  await q(`update ILR.LEARNING_DELIVERY set DELLOCPOSTCODE = ?
    where LEARNREFNUMBER = 'TESTL0044' and REMOVEDAT is null and LEARNACTENDDATE is null and ISTESTDATA and ${TEST}`, [T44.postcode])
  await q(`update ILR.EMPLOYER_SITE set ISACTIVE = false where NAME like 'TEST Testco Local %' and ISTESTDATA and ISACTIVE`)
  await q(`update ILR.EMPLOYER_CONTACT set ISCURRENT = false where NAME like 'TEST Contact %' and USERID is null and ISTESTDATA and ISCURRENT`)
}
