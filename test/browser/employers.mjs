// Employers via Companies House, build step 3, in the browser: the
// Employers list, an employer's page, and adding and changing employers.
//   Max  USR-T0008  manager, ORG-T001: adds TESCO PLC (00445790) by searching
//                   Companies House live, and a test sole trader
//   Tina USR-T0004  tutor, ORG-T001: sees name, status and SIC codes, never
//                   the registered office, and can't add or change
//   Nia  USR-T0011  manager, ORG-T002: adds the same company, which must
//                   change nothing ORG-T001 sees
// Employers added here are test employers (ISTESTDATA from the user); the
// test reset removes them. On a rerun, TESCO PLC is already ORG-T001's, so
// adding it again must be refused, and the test carries on with that one.
// Calls Companies House for real (public company data; a few requests).
// Run against the test servers (test/start-test-servers.sh); see setup.mjs.
import { execFileSync } from 'node:child_process'
import { BASE, OUT, REPO, launch } from './setup.mjs'
import { connect, execute, destroy } from '../../server/db.js'

const B = BASE
const COMPANY = '00445790'
let failures = 0
const check = (label, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`) }
const db = await connect()
const q = (sql, binds = []) => execute(db, sql, binds)

async function api(user, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${B}${path}`, {
    method,
    headers: { Cookie: `dev_user_id=${user}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}
const companyRow = async (org) => (await q(`select EMPLOYERID, NAME, ISTESTDATA, CREATEDBY, to_varchar(COMPANYCHECKEDAT) as CHECKED,
    to_json(COMPANYDETAILS) as DETAILS, COMPANYRESPONSEID from ILR.EMPLOYER where ORGANISATIONID = ? and COMPANYNUMBER = ?`, [org, COMPANY]))

const browser = await launch()
async function pageAs(user, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport })
  await ctx.addCookies([{ name: 'dev_user_id', value: user, domain: 'localhost', path: '/api' }])
  const p = await ctx.newPage()
  p.problems = []
  p.on('pageerror', (e) => p.problems.push(e.message))
  p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) p.problems.push(`${r.status()} ${r.url()}`) })
  return p
}
const text = (p, sel) => p.locator(sel).innerText()

// ---------------------------------------------------------------- Max adds TESCO PLC
const max = await pageAs('USR-T0008')
const before = await companyRow('ORG-T001')
await max.goto(`${B}/app/employers`)
await max.locator('#employers table').waitFor({ timeout: 60000 })
check('Max sees the Employers tab and list', (await max.getByRole('link', { name: 'Employers', exact: true }).count()) === 1 && /Testco Retail Ltd/.test(await text(max, '#employers')))
await max.getByRole('link', { name: 'Add an employer' }).click()
await max.locator('#employer-form form').waitFor({ timeout: 60000 })
await max.getByRole('button', { name: 'Add employer' }).click()
check('  the form asks whether it is on Companies House first', /Choose whether the employer is on Companies House/.test(await text(max, '#employer-form')))
await max.getByLabel('On Companies House', { exact: true }).check()
await max.getByLabel('Company name or number').fill('t')
await max.getByRole('button', { name: 'Search Companies House' }).click()
await max.locator('.field-error').first().waitFor({ timeout: 60000 })
check('  a one-letter search is refused', /at least 2 characters/.test(await text(max, '#employer-form')))
await max.getByLabel('Company name or number').fill('tesco plc')
await max.getByRole('button', { name: 'Search Companies House' }).click()
await max.locator('.company-results li').first().waitFor({ timeout: 60000 })
const results = await text(max, '.company-results')
check('  searching by name lists live results, with TESCO PLC', /TESCO PLC \(00445790\)/.test(results))
await max.screenshot({ path: `${OUT}/employers-search.png`, fullPage: true })
await max.locator('.company-results li', { hasText: '(00445790)' }).getByRole('button', { name: 'Choose' }).click()
await max.locator('.chosen-company').waitFor({ timeout: 60000 })
const chosen = await text(max, '.chosen-company')
check('  the chosen company is shown as Companies House has it now, registered office included',
  /TESCO PLC/.test(chosen) && /Active/.test(chosen) && /Welwyn Garden City/.test(chosen) && /47110/.test(chosen), chosen.replace(/\s+/g, ' '))
await max.getByLabel('Employer reference number (ERN, optional)').fill('123')
await max.getByRole('button', { name: 'Add employer' }).click()
await max.locator('.field-error').first().waitFor({ timeout: 60000 })
check('  a bad employer reference is refused in the page', /exactly 9 digits/.test(await text(max, '#employer-form')))
await max.getByLabel('Employer reference number (ERN, optional)').fill('')
await max.getByRole('button', { name: 'Add employer' }).click()
let teId
if (before.length === 0) {
  await max.waitForURL((u) => /^\/app\/employers\/EMP-/.test(u.pathname), { timeout: 60000 })
  teId = decodeURIComponent(new URL(max.url()).pathname.split('/').pop())
  check('  adding it opens the new employer', Boolean(teId))
} else {
  await max.locator('.field-error, .error-banner').first().waitFor({ timeout: 60000 })
  check('  (rerun) adding it again is refused: already an employer', /already an employer with company number 00445790/.test(await text(max, '#employer-form')))
  teId = before[0].EMPLOYERID
}
const [row] = await companyRow('ORG-T001')
check('one ORG-T001 employer for the company, a test employer, with its own copy and checked time',
  (await companyRow('ORG-T001')).length === 1 && row.ISTESTDATA === true && row.NAME === 'TESCO PLC' && row.CHECKED && /"COMPANYSTATUS":"active"/.test(row.DETAILS) && row.COMPANYRESPONSEID,
  JSON.stringify({ ...row, DETAILS: row.DETAILS?.length }))

await max.goto(`${B}/app/employers/${teId}`)
await max.locator('#employer dl').first().waitFor({ timeout: 60000 })
const maxPage = await text(max, '#employer')
check("Max's employer page: status, SIC with its description, registered office, checked time",
  /Active/.test(maxPage) && /47110 Retail sale in non-specialised stores with food, beverages or tobacco predominating/.test(maxPage) &&
  /Registered office/.test(maxPage) && /AL7 1GA/.test(maxPage) && /Checked with Companies House\s+\d\d\/\d\d\/\d{4} at \d\d:\d\d/.test(maxPage), maxPage.slice(0, 600).replace(/\s+/g, ' '))
await max.screenshot({ path: `${OUT}/employers-page-manager.png`, fullPage: true })

// ---------------------------------------------------------------- refreshing
const checkedNow = (await companyRow('ORG-T001'))[0].CHECKED
await max.reload()
await max.locator('#employer dl').first().waitFor({ timeout: 60000 })
check('opening it again within a day does not ask Companies House', (await companyRow('ORG-T001'))[0].CHECKED === checkedNow)
await q(`update ILR.EMPLOYER set COMPANYCHECKEDAT = dateadd(day, -2, current_timestamp()) where EMPLOYERID = ?`, [teId])
const stale = (await companyRow('ORG-T001'))[0].CHECKED
const tina = await pageAs('USR-T0004')
await tina.goto(`${B}/app/employers/${teId}`)
await tina.locator('#employer dl').first().waitFor({ timeout: 60000 })
check('a tutor opening a stale employer does not refresh it', (await companyRow('ORG-T001'))[0].CHECKED === stale)
await max.reload()
await max.locator('#employer dl').first().waitFor({ timeout: 60000 })
const refreshed = (await companyRow('ORG-T001'))[0]
check('a manager opening a stale employer refreshes it', refreshed.CHECKED !== stale && refreshed.COMPANYRESPONSEID !== row.COMPANYRESPONSEID)
await max.getByRole('button', { name: 'Check Companies House now' }).click()
await max.getByRole('button', { name: 'Check Companies House now' }).waitFor({ timeout: 60000 })
await max.waitForTimeout(300)
check('"Check Companies House now" refreshes it', (await companyRow('ORG-T001'))[0].COMPANYRESPONSEID !== refreshed.COMPANYRESPONSEID)

// ---------------------------------------------------------------- the tutor
const tinaPage = await text(tina, '#employer')
check("the tutor sees name, status and SIC, not the registered office, nor Change or refresh",
  /TESCO PLC/.test(tinaPage) && /Active/.test(tinaPage) && /47110/.test(tinaPage) && !/Registered office/.test(tinaPage) && !/AL7 1GA|Welwyn/.test(tinaPage) &&
  (await tina.getByRole('link', { name: 'Change' }).count()) === 0 && (await tina.getByRole('button', { name: /Check Companies House/ }).count()) === 0)
const asTutor = await api('USR-T0004', `/api/employers/${teId}`)
const keys = Object.keys(asTutor.body.employer.COMPANYDETAILS ?? {})
check("  and the API leaves the registered office out of the tutor's copy", keys.includes('COMPANYNAME') && !keys.some((k) => k.startsWith('ADDRESS') || k.startsWith('OFFICE')), keys.join(','))
await tina.screenshot({ path: `${OUT}/employers-page-tutor.png`, fullPage: true })
await tina.goto(`${B}/app/employers/new`)
await tina.waitForURL((u) => u.pathname === '/app/employers', { timeout: 60000 })
check('  /app/employers/new sends the tutor to the list', true)
const tutorTries = [
  await api('USR-T0004', '/api/employers', { method: 'POST', body: { name: 'X', notOnCompaniesHouse: 'sole trader' } }),
  await api('USR-T0004', `/api/employers/${teId}`, { method: 'PATCH', body: {} }),
  await api('USR-T0004', `/api/employers/${teId}/refresh`, { method: 'POST' }),
  await api('USR-T0004', '/api/companies-house/search?q=tesco'),
]
check('  the API refuses the tutor adding, changing, refreshing and searching', tutorTries.every((t) => t.status === 403), tutorTries.map((t) => t.status).join(','))
const ivy = await api('USR-T0007', '/api/employers')
check('an IQA can see the list', ivy.status === 200 && ivy.body.employers.some((e) => e.EMPLOYERID === teId))

// ---------------------------------------------------------------- another organisation
const t001Before = (await companyRow('ORG-T001'))[0]
check("ORG-T002's manager can't open ORG-T001's employer", (await api('USR-T0011', `/api/employers/${teId}`)).status === 404)
const t002 = await companyRow('ORG-T002')
const nia = t002.length === 0
  ? await api('USR-T0011', '/api/employers', { method: 'POST', body: { companyNumber: COMPANY } })
  : await api('USR-T0011', `/api/employers/${t002[0].EMPLOYERID}/refresh`, { method: 'POST' })
check('ORG-T002 adds (or refreshes) the same company', nia.status === 201 || nia.status === 200, JSON.stringify(nia.body).slice(0, 200))
const t001After = (await companyRow('ORG-T001'))[0]
check("  and nothing ORG-T001 sees changes: its own copy, checked time and response",
  t001After.CHECKED === t001Before.CHECKED && t001After.DETAILS === t001Before.DETAILS && t001After.COMPANYRESPONSEID === t001Before.COMPANYRESPONSEID)
const t001List = (await api('USR-T0008', '/api/employers')).body.employers.filter((e) => e.COMPANYNUMBER === COMPANY)
check("  ORG-T001's list still shows one, with its own checked time", t001List.length === 1 && t001List[0].EMPLOYERID === teId)

// ---------------------------------------------------------------- not on Companies House
await max.goto(`${B}/app/employers/new`)
await max.locator('#employer-form form').waitFor({ timeout: 60000 })
await max.getByLabel(/Not on Companies House/).check()
await max.getByRole('button', { name: 'Add employer' }).click()
check('a sole trader needs a name and a reason', /Enter the employer's name/.test(await text(max, '#employer-form')) && /Say why this employer isn't on Companies House/.test(await text(max, '#employer-form')))
const soleName = `TEST Sole Trader ${Date.now().toString(36)}`
await max.getByLabel('Name').fill(soleName)
await max.getByLabel("Why isn't it on Companies House?").fill('Sole trader')
await max.getByRole('button', { name: 'Add employer' }).click()
await max.waitForURL((u) => /^\/app\/employers\/EMP-/.test(u.pathname), { timeout: 60000 })
const soleId = decodeURIComponent(new URL(max.url()).pathname.split('/').pop())
await max.locator('#employer h2').waitFor({ timeout: 60000 })
check('  added, and its page says why it is not on Companies House', /Not on Companies House: Sole trader/.test(await text(max, '#employer')))
await max.getByRole('link', { name: 'Change' }).click()
await max.locator('#employer-form form').waitFor({ timeout: 60000 })
await max.waitForFunction(() => document.querySelector('#employer-form input[type="text"]')?.value?.startsWith('TEST Sole Trader'), null, { timeout: 60000 })
await max.getByLabel('Employer reference number (ERN, optional)').fill('999999999')
await max.getByLabel('Still used').uncheck()
await max.getByRole('button', { name: 'Save changes' }).click()
await max.waitForURL((u) => u.pathname === `/app/employers/${soleId}`, { timeout: 60000 })
await max.locator('#employer h2').waitFor({ timeout: 60000 })
const soleRow = (await q(`select ISACTIVE, EMPLOYERREF, UPDATEDBY, ISTESTDATA, COMPANYDETAILS from ILR.EMPLOYER where EMPLOYERID = ?`, [soleId]))[0]
check('  changed: ERN 999999999, no longer used, who changed it', soleRow.ISACTIVE === false && Number(soleRow.EMPLOYERREF) === 999999999 && soleRow.UPDATEDBY === 'USR-T0008' && soleRow.ISTESTDATA === true && soleRow.COMPANYDETAILS === null, JSON.stringify(soleRow))
await max.goto(`${B}/app/employers`)
await max.locator('#employers table').waitFor({ timeout: 60000 })
const soleListRow = await max.locator('#employers tr', { hasText: soleName }).innerText()
check('  the list marks it "No longer used"', /No longer used/.test(soleListRow) && /Not on Companies House/.test(soleListRow))
const ilr = (await api('USR-T0008', '/api/learners/TESTL0001/ilr')).body
check("  the learner forms' employer list carries ISACTIVE so it can leave it out", ilr.employers.some((e) => e.EMPLOYERID === soleId && e.ISACTIVE === false))
await max.screenshot({ path: `${OUT}/employers-list.png`, fullPage: true })

// ---------------------------------------------------------------- phone width
const phone = await pageAs('USR-T0008', { width: 390, height: 844 })
for (const path of ['/app/employers', `/app/employers/${teId}`, '/app/employers/new']) {
  await phone.goto(`${B}${path}`)
  await phone.locator('#employers, #employer dl, #employer-form form').first().waitFor({ timeout: 60000 })
  const wide = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check(`phone width: ${path} has no sideways scroll`, wide <= 1, `${wide}px`)
}
await phone.screenshot({ path: `${OUT}/employers-phone-form.png`, fullPage: true })

check('no server or page errors', [max, tina, phone].every((p) => p.problems.length === 0), [max, tina, phone].flatMap((p) => p.problems).join('; '))
await browser.close()
await destroy(db)
try {
  const out = execFileSync('npm', ['run', '-s', 'check:test-flags'], { cwd: REPO, encoding: 'utf8' })
  check('check:test-flags: every row matches, every employer ID is its organisation\'s', /Every row matches/.test(out))
} catch (err) {
  check('check:test-flags: every row matches, every employer ID is its organisation\'s', false, err.stdout)
}
console.log(failures ? `${failures} FAILED` : 'all passed')
process.exit(failures ? 1 : 0)
