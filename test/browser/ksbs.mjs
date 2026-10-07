// KSBs from Skills England (npm run import:skills) in Burrow, for the
// learner's version of their standard (server/ksbVersions.js):
//   Alex  USR-T0101  learner TESTL0001, ST0072, started in version 1.1's
//                    dates: the portfolio and Add evidence list 1.1's 35
//                    KSBs with the Skills England credit; a claim records
//                    the version and wording; one not in 1.1 is refused
//   Max   USR-T0008  manager: Alex's evidence page shows the stored wording
//   Sam   USR-T0207  employer contact (Crosspool): Alex's KSB total is 35
// Alex's draft "TEST: KSB versions" is added once and stays until the next
// test reset (like step4g2's evidence); nothing else is changed.
// Run against the test servers (test/start-test-servers.sh); see setup.mjs.
import { BASE, OUT, launch } from './setup.mjs'
import { connect, execute, destroy } from '../../server/db.js'
import path from 'node:path'

const B = BASE
let failures = 0
const check = (label, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`) }
const db = await connect()
const q = (sql, binds = []) => execute(db, sql, binds)
async function api(user, url, { method = 'GET', body } = {}) {
  const res = await fetch(`${B}${url}`, {
    method,
    headers: { Cookie: `dev_user_id=${user}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

// The fixed values this test asserts: ST0072 1.1 as published, and Alex's
// seeded standard.
const ALEX = 'TESTL0001'
const VERSION = '1.1'
const KSB_COUNT = 35
const K1 = 'Understand who customers are.'
const EVIDENCE = 'TEST: KSB versions'

const portfolio = (await api('USR-T0101', `/api/burrow/learners/${ALEX}/portfolio`)).body
if (portfolio?.learner?.STDREFERENCE !== 'ST0072') {
  console.log(`FAIL ${ALEX} isn't on ST0072 (${portfolio?.learner?.STDREFERENCE}): run the test reset first`)
  process.exit(1)
}

// ---------------------------------------------------------------- the API
check("Alex's KSBs are ST0072 version 1.1's, the version for his start date", portfolio.ksbsLoaded && portfolio.ksbVersion?.VERSION === VERSION && portfolio.ksbVersion?.FROM_START === true,
  JSON.stringify(portfolio.ksbVersion))
check(`  ${KSB_COUNT} KSBs, K1 first with its wording`, portfolio.ksbs.length === KSB_COUNT && portfolio.ksbs[0].KSB_REFERENCE === 'K1' && portfolio.ksbs[0].DETAIL === K1,
  `${portfolio.ksbs.length} ${portfolio.ksbs[0]?.KSB_REFERENCE} ${portfolio.ksbs[0]?.DETAIL}`)
const [stored] = await q(`select count(*) as N from SKILLS.STANDARD_KSB where ST_REFERENCE = 'ST0072' and VERSION = ? and GONEAT is null`, [VERSION])
check('  the same count as SKILLS.STANDARD_KSB holds for 1.1', Number(stored.N) === portfolio.ksbs.length, stored.N)

const refused = await api('USR-T0101', `/api/burrow/learners/${ALEX}/evidence`, {
  method: 'POST', body: { title: 'TEST: never saved', evidenceType: 'reflection', occurredOn: '2025-05-12', reflection: 'x', ksbs: ['K99'] },
})
check('a claim on a KSB not in his version is refused', refused.status === 400, `${refused.status} ${JSON.stringify(refused.body).slice(0, 120)}`)

let evidence = portfolio.evidence.find((e) => e.TITLE === EVIDENCE)
if (!evidence) {
  const r = await api('USR-T0101', `/api/burrow/learners/${ALEX}/evidence`, {
    method: 'POST', body: { title: EVIDENCE, evidenceType: 'reflection', occurredOn: '2025-05-12', reflection: 'Written by the KSB browser test.', ksbs: ['K1', 'B1'] },
  })
  check('Alex saves a draft claiming K1 and B1', r.status === 201, `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`)
  evidence = { EVIDENCE_ID: r.body?.evidenceId }
}
const claims = await q(`select ek.KSB_REFERENCE, ek.STANDARD_VERSION, ek.KSB_TEXT = k.DETAIL as SAME
  from BURROW.EVIDENCE_KSB ek
  join SKILLS.STANDARD_KSB k on k.ST_REFERENCE = ek.ST_REFERENCE and k.VERSION = ? and k.KSB_TYPE = ek.KSB_TYPE and k.KSB_REFERENCE = ek.KSB_REFERENCE
  where ek.EVIDENCE_ID = ? and ek.UNCLAIMED_AT is null order by 1`, [VERSION, evidence.EVIDENCE_ID])
check('  each claim records version 1.1 and its wording', claims.length === 2 && claims.every((c) => c.STANDARD_VERSION === VERSION && c.SAME),
  JSON.stringify(claims))

const sam = (await api('USR-T0207', '/api/employer/apprentices')).body
const alexForSam = (Array.isArray(sam) ? sam : sam?.apprentices ?? []).find((a) => a.LEARNREFNUMBER === ALEX)
check("Sam (employer) sees Alex's KSB total as 35", Number(alexForSam?.KSBS_TOTAL) === KSB_COUNT, alexForSam?.KSBS_TOTAL)
check('  and not the date his KSB version goes by', alexForSam && !('KSB_START' in alexForSam))

// ---------------------------------------------------------------- the browser
const browser = await launch()
const problems = []
async function pageAs(user) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addCookies([{ name: 'dev_user_id', value: user, domain: 'localhost', path: '/api' }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => problems.push(e.message))
  p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) problems.push(`${r.status()} ${r.url()}`) })
  return p
}
const credit = async (p) => {
  const c = p.locator('.ksb-credit').first()
  return (await c.count()) > 0 && /© Skills England 2025\. This information is licensed under the Open Government Licence/.test(await c.innerText())
    && (await c.locator('img[alt="Skills England"]').count()) === 1
}
const shot = (p, name) => p.screenshot({ path: path.join(OUT, `ksbs-${name}.png`), fullPage: true })

try {
  const alex = await pageAs('USR-T0101')
  await alex.goto(`${B}/burrow`)
  await alex.locator('.burrow-ksb-list li').first().waitFor({ timeout: 60000 })
  check('portfolio: the KSB lists hold 35 KSBs, K1 first', (await alex.locator('.burrow-ksb-list li').count()) === KSB_COUNT
    && (await alex.locator('.burrow-ksb-list li').first().innerText()).includes(K1))
  check(`  "0 of ${KSB_COUNT} KSBs signed off"`, (await alex.locator('.burrow-progress-head strong').innerText()) === `0 of ${KSB_COUNT} KSBs signed off`,
    await alex.locator('.burrow-progress-head strong').innerText())
  check('  the Skills England credit and logo under them', await credit(alex))
  await shot(alex, 'portfolio')

  await alex.goto(`${B}/burrow/add`)
  await alex.locator('.burrow-ksb-picker input[type=checkbox]').first().waitFor({ timeout: 60000 })
  check('Add evidence: 35 KSBs to tick, K1 with its wording', (await alex.locator('.burrow-ksb-picker input[type=checkbox]').count()) === KSB_COUNT
    && (await alex.getByRole('checkbox', { name: `K1 ${K1}` }).count()) === 1)
  check('  the credit under them', await credit(alex.locator('.burrow-ksb-picker')))
  await shot(alex, 'add')

  const max = await pageAs('USR-T0008')
  await max.goto(`${B}/burrow/learners/${ALEX}/evidence/${evidence.EVIDENCE_ID}`)
  await max.getByText(K1).first().waitFor({ timeout: 60000 })
  check("the evidence page shows K1's stored wording, with the credit", (await max.getByText(K1).count()) > 0 && await credit(max))
  await shot(max, 'evidence')

  const samPage = await pageAs('USR-T0207')
  await samPage.goto(`${B}/burrow/apprentices`)
  await samPage.getByText(`of ${KSB_COUNT}`).first().waitFor({ timeout: 60000 })
  check("Sam's Apprentices page: Alex's KSBs out of 35", (await samPage.getByText(`0 of ${KSB_COUNT}`).count()) > 0)
  await shot(samPage, 'employer')

  check('no page errors or server errors', problems.length === 0, problems.join(' | '))
} finally {
  await browser.close()
  await destroy(db)
}
console.log(failures ? `${failures} failed` : 'all passed')
process.exit(failures ? 1 : 0)
