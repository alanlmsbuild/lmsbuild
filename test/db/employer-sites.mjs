// Test: employer sites (employers build step 5), against the test data from
// sql/employers_03_sites_contacts.sql. Writes only inside transactions that
// are rolled back, and doesn't call Companies House.
//   node test/db/employer-sites.mjs
process.env.DB_POOL = 'on'
process.env.DB_POOL_MAX = '1'
const { connect, execute, destroy } = await import('../../server/db.js')
const pool = await import('../../server/sessionPool.js')
const { SESSION_VARIABLES } = pool
const { sitePostcodeOf } = await import('../../server/employerSites.js')
const { EMPLOYER_APPRENTICE, VISIBLE_LEARNER } = await import('../../server/access.js')

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`)
}
const SET = `set (${SESSION_VARIABLES.join(', ')}) = (${SESSION_VARIABLES.map(() => '?').join(', ')})`
// Max, manager at ORG-T001, as attachUser would set it.
const MAX = ['ORG-T001', true, true, true, true, 'OFF0008', '', '', '', '']
// An employer contact at Testco Retail (EMP-T001), as attachUser would set it.
const contact = (userId) => ['ORG-T001', true, false, false, false, '', '', 'EMP-T001', '', userId]
const SEES = `select listagg(LEARNREFNUMBER, ' ') within group (order by LEARNREFNUMBER) as L, count(*) as N from ${EMPLOYER_APPRENTICE}`

const c = await connect()
const q = (sql, binds = []) => execute(c, sql, binds)
try {
  await q(SET, MAX)

  // ---- sitePostcodeOf: the current link's site, or nothing
  console.log('The site postcode for new aims')
  check('TESTL0001 (current link at Crosspool) gets S10 5AA', (await sitePostcodeOf(c, 'TESTL0001')) === 'S10 5AA')
  const [noSite] = await q(`select LEARNREFNUMBER from ILR.LEARNER_EMPLOYER le where EMPLOYERID = 'EMP-T001' and TODATE is null and SITEID is null
    and not exists (select 1 from ILR.LEARNER_EMPLOYER o where o.LEARNREFNUMBER = le.LEARNREFNUMBER and o.TODATE is null and o.SITEID is not null)
    order by LEARNREFNUMBER limit 1`)
  check(`${noSite.LEARNREFNUMBER} (current link, no site) gets nothing`, (await sitePostcodeOf(c, noSite.LEARNREFNUMBER)) === null)
  await q('begin')
  try {
    // A newer current link with no site, while the older Crosspool link is
    // still current: the newer one is the current link, so no postcode.
    await q(`insert into ILR.LEARNER_EMPLOYER (LEARNREFNUMBER, EMPLOYERID, FROMDATE, ISTESTDATA)
      values ('TESTL0001', 'EMP-T001', current_date(), true)`)
    const [links] = await q(`select count(*) as N, count(SITEID) as WITH_SITE from ILR.LEARNER_EMPLOYER
      where LEARNREFNUMBER = 'TESTL0001' and (TODATE is null or TODATE >= current_date())`)
    check('  (set-up: two current links, only the older one at a site)', links.N === 2 && links.WITH_SITE === 1, JSON.stringify(links))
    check('a newer current link with no site gives nothing, not the older link\'s site', (await sitePostcodeOf(c, 'TESTL0001')) === null)
  } finally {
    await q('rollback')
  }
  check('after the rollback, TESTL0001 gets S10 5AA again', (await sitePostcodeOf(c, 'TESTL0001')) === 'S10 5AA')

  // ---- Who each employer contact sees (the Burrow rule, EMPLOYER_LINKS)
  console.log('Employer contacts in Burrow')
  const sees = async (userId) => {
    await q(SET, contact(userId))
    const [r] = await q(SEES)
    const [v] = await q(`select count(*) as N from ${VISIBLE_LEARNER}`)
    return { list: r.L ?? '', n: r.N, visible: v.N }
  }
  // What each should see, worked out from the tables the way check 6 of
  // sql/employers_03_sites_contacts.sql does, not by the app's rule. (Other
  // tests move apprentices between sites until the next reset.)
  const expected = {}
  for (const r of await q(`
    with users as (select USERID, EMPLOYERID, ISACTIVE, ISHEADOFFICE from ACCESS.APP_USER where USERID in ('USR-T0201', 'USR-T0207', 'USR-T0208', 'USR-T0209', 'USR-T0210')),
    current_links as (select LEARNREFNUMBER, EMPLOYERID, SITEID from ILR.LEARNER_EMPLOYER where TODATE is null or TODATE >= current_date()),
    site_access as (select a.USERID, a.SITEID, s.EMPLOYERID from ACCESS.APP_USER_SITE a join ILR.EMPLOYER_SITE s on s.SITEID = a.SITEID where a.ENDEDAT is null),
    visible as (
      select u.USERID, l.LEARNREFNUMBER from users u join current_links l on l.EMPLOYERID = u.EMPLOYERID where u.ISACTIVE and u.ISHEADOFFICE = true
      union
      select u.USERID, l.LEARNREFNUMBER from users u join site_access a on a.USERID = u.USERID and a.EMPLOYERID = u.EMPLOYERID
        join current_links l on l.EMPLOYERID = u.EMPLOYERID and l.SITEID = a.SITEID where u.ISACTIVE)
    select u.USERID, coalesce(listagg(v.LEARNREFNUMBER, ' ') within group (order by v.LEARNREFNUMBER), '') as L
    from users u left join visible v on v.USERID = u.USERID group by u.USERID`)) expected[r.USERID] = r.L
  const erin = await sees('USR-T0201')
  const sam = await sees('USR-T0207')
  const ari = await sees('USR-T0208')
  const lee = await sees('USR-T0209')
  const kai = await sees('USR-T0210')
  const [all] = await q(`select count(distinct LEARNREFNUMBER) as N from ILR.LEARNER_EMPLOYER where EMPLOYERID = 'EMP-T001' and (TODATE is null or TODATE >= current_date())`)
  check(`head office (Erin) sees all ${all.N} of Testco's current apprentices, as before`, erin.n === all.N && erin.visible === all.N && erin.list === expected['USR-T0201'])
  check('one site (Sam, Crosspool) sees exactly Crosspool\'s', sam.list === expected['USR-T0207'] && sam.n > 0 && sam.visible === sam.n, sam.list)
  check('two sites (Ari) sees exactly Crosspool\'s and Hillsborough\'s', ari.list === expected['USR-T0208'] && ari.n > sam.n, ari.list)
  // 1. The test asked for: a site contact whose only assignment has ended.
  // Hillsborough has apprentices and Ari sees them, so nobody here means the
  // ended assignment, nothing else.
  const [hillsborough] = await q(`select count(*) as N from ILR.LEARNER_EMPLOYER where SITEID = 'SITE-T002' and (TODATE is null or TODATE >= current_date())`)
  check('a site contact whose only assignment ended (Lee, Hillsborough) sees nobody', lee.n === 0 && lee.visible === 0 && hillsborough.N > 0 && ari.n > sam.n)
  check('no flag and no assignments (Kai) sees nobody', kai.n === 0 && kai.visible === 0)
  check(`an apprentice with no site (${noSite.LEARNREFNUMBER}) is head office only`, erin.list.includes(noSite.LEARNREFNUMBER) && !ari.list.includes(noSite.LEARNREFNUMBER))
  await q(SET, ['ORG-T001', true, false, false, false, '', '', 'EMP-T001', '', ''])
  check('an employer user with no user ID set sees nobody', (await q(SEES))[0].N === 0)
  await q(SET, ['ORG-T001', true, false, false, false, '', '', '', '', 'USR-T0201'])
  check('head office with no employer set sees nobody', (await q(SEES))[0].N === 0)
  await q(SET, ['ORG-T002', true, false, false, false, '', '', 'EMP-T001', '', 'USR-T0201'])
  check("head office signed in as another organisation sees nobody", (await q(`select count(*) as N from ${VISIBLE_LEARNER}`))[0].N === 0)
} finally {
  await destroy(c)
}

// ---- A reused session: a site contact, then head office, pool of one
console.log('A reused session (pool of one)')
{
  const s1 = await pool.borrow()
  const l1 = pool.leaseFor(s1)
  l1.variablesSet = true
  await execute(l1, SET, contact('USR-T0207'))
  const [first] = await execute(l1, SEES)
  const samExpected = (await execute(l1, `select count(*) as N from ILR.LEARNER_EMPLOYER where SITEID = 'SITE-T001' and (TODATE is null or TODATE >= current_date())`))[0].N
  await pool.giveBack(l1, { reuse: true })
  const s2 = await pool.borrow()
  const l2 = pool.leaseFor(s2)
  check('  the same session is reused', s2.id === s1.id)
  let leftover = null
  try {
    leftover = (await execute(l2, 'select $CURRENT_USERID as U'))[0]
  } catch (err) {
    leftover = { error: err.message }
  }
  check("  Sam's $CURRENT_USERID is unset before the next user", /CURRENT_USERID' does not exist/.test(leftover?.error ?? ''), JSON.stringify(leftover))
  l2.variablesSet = true
  await execute(l2, SET, contact('USR-T0201'))
  const [second] = await execute(l2, SEES)
  await pool.giveBack(l2, { reuse: false, why: 'end of the test' })
  check("  Sam saw Crosspool's, then Erin all of Testco's, on the same session", first.N === samExpected && second.N > first.N, `${first.N} then ${second.N}`)
}
console.log(failures ? `\n${failures} failed` : '\nAll passed')
process.exit(failures ? 1 : 0)
