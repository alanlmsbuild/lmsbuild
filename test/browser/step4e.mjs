// Part 7 step 4e in the browser, as Max (manager) on Yasmin, TESTL0056, a
// test learner. Adds, corrects and removes employment statuses (test data
// only) and puts Yasmin's employment back as it was. Leaves removed rows
// and RECORD_CHANGE history, all test data, cleared by the test reset.
import { BASE, OUT, REPO, launch } from './setup.mjs'
import { execFileSync } from 'node:child_process'
import { connect, execute, destroy } from '../../server/db.js'
const B = BASE
const REF = 'TESTL0056'
const browser = await launch()
let failures = 0
const check = (label, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`) }
const here = (p) => decodeURIComponent(p.url().replace(B, ''))

// Yasmin's active monitoring codes, straight from the table (read-only).
const db = await connect()
async function esmRows() {
  const rows = await execute(db, `select to_char(DATEEMPSTATAPP, 'YYYY-MM-DD') as D, ESMTYPE || ESMCODE as M from ILR.EMPLOYMENT_STATUS_MONITORING
    where LEARNREFNUMBER = ? and REMOVEDAT is null order by 1, 2`, [REF])
  return rows.map((r) => `${r.D}:${r.M}`).join(' ')
}
async function statusRows() {
  const rows = await execute(db, `select to_char(DATEEMPSTATAPP, 'YYYY-MM-DD') as D, EMPSTAT, EMPID, EMPLOYERID, AGREEMID from ILR.EMPLOYMENT_STATUS
    where LEARNREFNUMBER = ? and REMOVEDAT is null order by 1`, [REF])
  return rows.map((r) => `${r.D}:${r.EMPSTAT}:${r.EMPID ?? '-'}:${r.EMPLOYERID ?? '-'}:${r.AGREEMID ?? '-'}`).join(' ')
}
const originalStatus = await statusRows()
const originalEsm = await esmRows()
console.log('     before:', originalStatus, '|', originalEsm)

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addCookies([{ name: 'dev_user_id', value: 'USR-T0008', domain: 'localhost', path: '/api' }])
const p = await ctx.newPage(); p.problems = []
p.on('pageerror', (e) => p.problems.push(e.message))
p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) p.problems.push(`${r.status()} ${r.url()}`) })
async function recordPage() {
  await p.goto(`${B}/app/learners/${REF}?back=/app/learners`)
  await p.locator('.record-ilr-summary').waitFor()
  await p.waitForFunction(() => !/Checking the ILR/.test(document.querySelector('.record-ilr-summary')?.innerText ?? ''), null, { timeout: 30000 })
  await p.waitForTimeout(300)
}
async function submit(name) {
  await p.getByRole('button', { name }).click()
  await Promise.race([
    p.waitForURL((u) => !/\/records\//.test(u.pathname), { timeout: 30000 }),
    p.locator('.field-error, .error-banner').first().waitFor({ timeout: 30000 }),
  ]).catch(() => {})
  await p.waitForTimeout(300)
}
const employment = () => p.locator('.learner-section[aria-label="Employment"]').innerText()
const formText = () => p.locator('form').innerText()
const newForm = async () => { await p.goto(`${B}/app/learners/${REF}/records/employment/new?back=/app/learners`); await p.locator('form').waitFor() }

await recordPage()
check('Employment: Correct, Remove and Add', /Correct/.test(await employment()) && (await p.getByRole('link', { name: '+ Add an employment status' }).count()) === 1)

// ---- Add a new status: a new employer from 1 December 2025
await p.getByRole('link', { name: '+ Add an employment status' }).click()
await p.getByRole('heading', { name: 'Add an employment status' }).waitFor()
check('the form explains change vs correct', /To fix a mistake, correct the record instead/.test(await formText()))
await p.getByLabel(/Date this status applies from/).fill('2025-12-01')
await p.getByLabel(/^Employment status/).selectOption('10')
check('employed: employer, hours and length of employment shown', (await p.getByLabel(/Hours a week/).count()) === 1 && (await p.getByLabel(/Length of unemployment/).count()) === 0)
await submit('Add')
check('employed needs employer, hours and length (EmpId_10, ESMType_02, 09)', /EmpId_10/.test(await formText()) && /ESMType_02/.test(await formText()) && /ESMType_09/.test(await formText()))
await p.getByLabel(/^Employer/).selectOption('EMP-T001')
await p.getByLabel(/Hours a week/).selectOption('7')
await p.getByLabel(/Length of employment/).selectOption('1')
await p.getByLabel(/Agreement ID/).fill('zzagt01')
await submit('Add')
check('added, back on the Record tab', here(p) === `/app/learners/${REF}?back=/app/learners`, here(p))
await recordPage()
let text = await employment()
check('Record shows both statuses, the new one with Testco', /From 01\/12\/2025/.test(text) && /Testco Retail Ltd/.test(text) && /Employed for 21 to 30 hours per week \(7\)/.test(text), text.replace(/\n/g, ' | ').slice(0, 300))
check('  ERN and agreement ID from the employer', /2025-12-01:10:999000012:EMP-T001:ZZAGT01/.test(await statusRows()), await statusRows())
check('  monitoring codes added', /2025-12-01:EII7 2025-12-01:LOE1/.test(await esmRows()), await esmRows())

// ---- Same date refused, unemployed needs length of unemployment, bad ERN refused
await newForm()
await p.getByLabel(/Date this status applies from/).fill('2025-12-01')
await p.getByLabel(/^Employment status/).selectOption('11')
await submit('Add')
check('looking for work needs length of unemployment (ESMType_08)', /ESMType_08/.test(await formText()))
await p.getByLabel(/Length of unemployment/).selectOption('1')
await submit('Add')
check('a second status on the same date is refused (R_43)', /R_43/.test(await formText()))
await newForm()
await p.getByLabel(/Date this status applies from/).fill('2026-01-05')
await p.getByLabel(/^Employment status/).selectOption('10')
await p.getByLabel(/^Employer/).selectOption('other')
await p.getByLabel(/Employer reference number/).fill('999000013')
await p.getByLabel(/Hours a week/).selectOption('8')
await p.getByLabel(/Length of employment/).selectOption('1')
await submit('Add')
check("another employer's ERN must pass the check digit (EmpId_02)", /check digit/.test(await formText()))

// ---- Correct the new status: different date and hours; codes move with it
await p.goto(`${B}/app/learners/${REF}/records/employment/2025-12-01/correct?back=/app/learners`)
await p.getByLabel(/Date this status applies from/).waitFor()
check('correct form filled in', (await p.getByLabel(/Date this status applies from/).inputValue()) === '2025-12-01' && (await p.getByLabel(/^Employer/).inputValue()) === 'EMP-T001' && (await p.getByLabel(/Hours a week/).inputValue()) === '7')
await p.getByLabel(/Date this status applies from/).fill('2025-12-15')
await p.getByLabel(/Hours a week/).selectOption('6')
await p.getByLabel(/What was wrong/).fill('TEST: wrong date and hours')
await submit('Save correction')
check('corrected: status and its codes moved to the new date', /2025-12-15:10:999000012:EMP-T001/.test(await statusRows()) && !/2025-12-01/.test(await statusRows()) && /2025-12-15:EII6 2025-12-15:LOE1/.test(await esmRows()) && !/2025-12-01/.test(await esmRows()), `${await statusRows()} | ${await esmRows()}`)

// ---- Correct to not employed: employer and employed-only codes go
await p.goto(`${B}/app/learners/${REF}/records/employment/2025-12-15/correct?back=/app/learners`)
await p.getByLabel(/^Employment status/).waitFor()
await p.getByLabel(/^Employment status/).selectOption('12')
check('not employed: no employer or hours fields', (await p.getByLabel(/^Employer/).count()) === 0 && (await p.getByLabel(/Hours a week/).count()) === 0)
await p.getByLabel(/full-time education/).check()
await submit('Save correction')
check('  employer and agreement removed, EII and LOE removed, PEI added', /2025-12-15:12:-:-:-/.test(await statusRows()) && /2025-12-15:PEI1/.test(await esmRows()) && !/2025-12-15:EII/.test(await esmRows()), `${await statusRows()} | ${await esmRows()}`)
await recordPage()
check('  no ILR problems', /no problems found/.test(await p.locator('.record-ilr-summary').innerText()))

// ---- Remove it
await p.getByRole('link', { name: 'Remove employment status from 15/12/2025' }).click()
await p.getByLabel(/Why is it being removed/).fill('TEST: added while testing 4e')
await submit('Remove')
check('removed with its codes', !/2025-12-15/.test(await statusRows()) && !/2025-12-15/.test(await esmRows()))

// ---- Remove the original status: the programme now has none, and the rules say so
const firstDate = originalStatus.split(':')[0]
const [y, m, d] = firstDate.split('-')
await recordPage()
await p.getByRole('link', { name: `Remove employment status from ${d}/${m}/${y}` }).click()
await p.getByLabel(/Why is it being removed/).fill('TEST: removed to check the rules, added back next')
await submit('Remove')
await recordPage()
text = await employment()
check('without a status before the start, EmpStat_09 shows', /EmpStat_09/.test(text), text.slice(0, 200))
// ...and add it back exactly as it was (a new record on the same date as the removed one)
await newForm()
await p.getByLabel(/Date this status applies from/).fill(firstDate)
await p.getByLabel(/^Employment status/).selectOption('10')
await p.getByLabel(/^Employer/).selectOption('EMP-T003')
await p.getByLabel(/Hours a week/).selectOption('8')
await p.getByLabel(/Length of employment/).selectOption('2')
await p.getByLabel(/Agreement ID/).fill('ZZAGT03')
await submit('Add')
check('added back: same status and codes as before', (await statusRows()) === originalStatus && (await esmRows()) === originalEsm, `${await statusRows()} | ${await esmRows()}`)
await recordPage()
check('  no ILR problems again', /no problems found/.test(await p.locator('.record-ilr-summary').innerText()))
await p.screenshot({ path: `${OUT}/4e-record.png`, fullPage: true })
const ret = await p.evaluate(async () => { const r = await (await fetch('/api/ilr/return')).json(); return { valid: r.schema.valid, rules: r.rules.length } })
check('ILR return valid, no failing rules', ret.valid && ret.rules === 0, JSON.stringify(ret))
check('no server or page errors', p.problems.length === 0, p.problems.join('; '))
await ctx.close()

// ---- Tutor
{
  const t = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await t.addCookies([{ name: 'dev_user_id', value: 'USR-T0014', domain: 'localhost', path: '/api' }])
  const q = await t.newPage()
  await q.goto(`${B}/app/learners/${REF}?back=/app/learners`)
  await q.locator('.record-ilr-summary').waitFor()
  await q.waitForFunction(() => !/Checking the ILR/.test(document.querySelector('.record-ilr-summary')?.innerText ?? ''), null, { timeout: 30000 })
  await q.waitForTimeout(300)
  check('tutor: employment shown, no links', /In paid employment/.test(await q.locator('.learner-section[aria-label="Employment"]').innerText()) && (await q.locator('.record-actions, .record-add').count()) === 0)
  const status = await q.evaluate(async () => (await fetch('/api/learners/TESTL0056/ilr/employment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status)
  check('tutor: the API refuses', status === 403, `${status}`)
  await t.close()
}
await browser.close()
await destroy(db)

try {
  const out = execFileSync('npm', ['run', '-s', 'check:test-flags'], { cwd: REPO, encoding: 'utf8' })
  check('check:test-flags: every row matches its learner', /Every row matches its learner/.test(out), out.split('\n').filter((l) => /EMPLOYMENT|RECORD_CHANGE/.test(l)).join(' / '))
} catch (err) {
  check('check:test-flags: every row matches its learner', false, err.stdout)
}
console.log(failures ? `${failures} FAILED` : 'all passed')
