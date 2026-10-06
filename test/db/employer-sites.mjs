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
const { FIXED, NAMES, derivedCounts, requireSeed } = await import('./employer-seed.mjs')

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
  await requireSeed(q)

  // ---- sitePostcodeOf: the current link's site, or nothing
  console.log('The site postcode for new aims')
  check('TESTL0001 (current link at Crosspool) gets S10 5AA', (await sitePostcodeOf(c, 'TESTL0001')) === 'S10 5AA')
  check('TESTL0033 (current link, no site) gets nothing', (await sitePostcodeOf(c, 'TESTL0033')) === null)
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
  const seen = {}
  for (const user of Object.keys(FIXED)) seen[user] = await sees(user)
  // The fixed numbers, as seeded (requireSeed above stops the test if the
  // seed isn't in place).
  for (const [user, n] of Object.entries(FIXED)) {
    check(`${NAMES[user]} sees ${n}`, seen[user].n === n && seen[user].visible === n, `${seen[user].n}: ${seen[user].list}`)
  }
  check("  Sam's are Crosspool's three", seen['USR-T0207'].list === 'TESTL0001 TESTL0004 TESTL0007', seen['USR-T0207'].list)
  check("  Ari's are Crosspool's and Hillsborough's five", seen['USR-T0208'].list === 'TESTL0001 TESTL0004 TESTL0007 TESTL0010 TESTL0028', seen['USR-T0208'].list)
  // 1. The test asked for: Lee's only assignment ended. Hillsborough has
  // apprentices (Ari sees TESTL0010 and 0028), so his nobody is the ended
  // assignment, nothing else.
  check('  Lee (only assignment ended) sees nobody while Hillsborough has apprentices', seen['USR-T0209'].n === 0 && /TESTL0010/.test(seen['USR-T0208'].list))
  check('  an apprentice with no site (TESTL0033) is head office only', seen['USR-T0201'].list.includes('TESTL0033') && !seen['USR-T0208'].list.includes('TESTL0033'))
  // An extra check: the app's rule agrees with the tables worked out
  // another way (as check 6 of sql/employers_03_sites_contacts.sql).
  const derived = await derivedCounts(q)
  check('  (extra) the same as worked out from the tables', Object.keys(FIXED).every((u) => derived[u] === seen[u].n), JSON.stringify(derived))
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
  check('  Sam saw 3, then Erin 17, on the same session', first.N === 3 && second.N === 17, `${first.N} then ${second.N}`)
}
console.log(failures ? `\n${failures} failed` : '\nAll passed')
process.exit(failures ? 1 : 0)
