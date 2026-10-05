// Part 7 step 4f-1 in the browser, as Max (manager): off-the-job hours on
// Yasmin (TESTL0056, started March 2025, the earlier rule) and Reuben
// (TESTL0088, started August 2025, published minimums), and the EPA
// organisation. Test data only; every value is put back. Leaves history
// and removed rows (test data) for the reset.
import { BASE, OUT, REPO, launch } from './setup.mjs'
import { execFileSync } from 'node:child_process'
import { connect, execute, destroy } from '../../server/db.js'
const B = BASE
const browser = await launch()
let failures = 0
const check = (label, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`) }
const here = (p) => decodeURIComponent(p.url().replace(B, ''))
const db = await connect()
const hours = async (ref) => (await execute(db, `select HRSCODE || '=' || HRSAMOUNT as H from ILR.HOURS_RECORD where LEARNREFNUMBER = ? and REMOVEDAT is null order by HRSCODE`, [ref])).map((r) => r.H).join(' ')
const epa = async (ref) => (await execute(db, `select EPAORGID from ILR.LEARNING_DELIVERY where LEARNREFNUMBER = ? and AIMSEQNUMBER = 1`, [ref]))[0].EPAORGID

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addCookies([{ name: 'dev_user_id', value: 'USR-T0008', domain: 'localhost', path: '/api' }])
const p = await ctx.newPage(); p.problems = []
p.on('pageerror', (e) => p.problems.push(e.message))
p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) p.problems.push(`${r.status()} ${r.url()}`) })
async function recordPage(ref) {
  await p.goto(`${B}/app/learners/${ref}?back=/app/learners`)
  await p.locator('.record-ilr-summary').waitFor()
  await p.waitForFunction(() => !/Checking the ILR/.test(document.querySelector('.record-ilr-summary')?.innerText ?? ''), null, { timeout: 30000 })
  await p.waitForTimeout(300)
}
async function submit(name) {
  await p.getByRole('button', { name }).click()
  await Promise.race([
    p.waitForURL((u) => !/\/(edit|records)\//.test(u.pathname), { timeout: 30000 }),
    p.locator('.field-error, .error-banner').first().waitFor({ timeout: 30000 }),
  ]).catch(() => {})
  await p.waitForTimeout(300)
}
const hoursSection = () => p.locator('.learner-section[aria-label="Off-the-job hours"]').innerText()
const formText = () => p.locator('form').innerText()

// ---- Yasmin: started before 1 August 2025
const yHours = await hours('TESTL0056')
await recordPage('TESTL0056')
let text = await hoursSection()
check('Yasmin: the earlier rule is explained', /Started before 1 August 2025/.test(text), text.slice(0, 160))
await p.locator('.learner-section[aria-label="Off-the-job hours"] .record-change').click()
await p.getByRole('heading', { name: 'Change off-the-job hours' }).waitFor()
await p.getByLabel('Planned hours').waitFor()
check('form filled in', (await p.getByLabel('Planned hours').inputValue()) === yHours.match(/1=(\d+)/)[1])
await p.getByLabel('Planned hours').fill('250')
await submit('Save changes')
check('planned under 278 refused for a 2022-2025 start (HRSAmount_02)', /HRSAmount_02/.test(await formText()))
check('changing a recorded figure asks what was wrong', /Say what was wrong/.test(await formText()))
await p.getByLabel('Planned hours').fill(yHours.match(/1=(\d+)/)[1])
await p.getByLabel('Hours removed for prior learning').fill('20')
await p.getByLabel('Actual hours').fill('120')
await submit('Save changes')
check('adding prior learning and actual hours needs no reason', here(p) === '/app/learners/TESTL0056?back=/app/learners', here(p))
check('  saved', (await hours('TESTL0056')) === `${yHours} 3=120 4=20`, await hours('TESTL0056'))
await recordPage('TESTL0056')
text = await hoursSection()
check('  Record shows them', /Planned off the job hours removed for prior learning\s+20 hours/.test(text) && /Actual hours for off the job training\s+120 hours/.test(text))
await p.goto(`${B}/app/learners/TESTL0056/edit/hours?back=/app/learners`)
await p.getByLabel('Planned hours').waitFor()
await p.getByLabel('Hours removed for prior learning').fill('')
await p.getByLabel('Actual hours').fill('')
await submit('Save changes')
check('clearing them needs a reason', /Say what was wrong/.test(await formText()))
await p.getByLabel('What was wrong?').fill('TEST: added while testing 4f')
await submit('Save changes')
check('  cleared, as before', (await hours('TESTL0056')) === yHours, await hours('TESTL0056'))

// ---- Reuben: started August 2025
const rHours = await hours('TESTL0088')
await recordPage('TESTL0088')
text = await hoursSection()
check('Reuben: the published minimum for his version is said', /Minimum: 278 hours\. ST0259 version 1\.1 publishes 278 hours/.test(text), text.slice(0, 200))
await p.goto(`${B}/app/learners/TESTL0088/edit/hours?back=/app/learners`)
await p.getByLabel('Planned hours').waitFor()
await p.getByLabel('Planned hours').fill('150')
await p.getByLabel('What was wrong?').fill('TEST')
await submit('Save changes')
check('planned under 187 refused for a start from August 2025 (HRSAmount_03)', /HRSAmount_03/.test(await formText()))
check('  nothing saved', (await hours('TESTL0088')) === rHours)
await p.getByRole('button', { name: 'Cancel' }).click()

// ---- EPA organisation
const yEpa = await epa('TESTL0056')
await p.goto(`${B}/app/learners/TESTL0056/edit/programme?back=/app/learners`)
await p.getByLabel('End-point assessment organisation').waitFor()
check('programme form has the EPA organisation, filled in', (await p.getByLabel('End-point assessment organisation').inputValue()) === (yEpa ?? ''))
await p.getByLabel('End-point assessment organisation').fill('EPA12')
await submit('Save changes')
check('a badly formed EPA organisation ID is refused', /EPA and 4 digits/.test(await formText()))
await p.getByLabel('End-point assessment organisation').fill('epa0123')
await submit('Save changes')
check('saved as EPA0123', (await epa('TESTL0056')) === 'EPA0123')
await recordPage('TESTL0056')
check('  Record shows it', /End-point assessment organisation\s+EPA0123/.test(await p.locator('.learner-section[aria-label="Apprenticeship programme"]').innerText()))
await p.goto(`${B}/app/learners/TESTL0056/edit/programme?back=/app/learners`)
await p.getByLabel('End-point assessment organisation').waitFor()
await p.getByLabel('End-point assessment organisation').fill(yEpa ?? '')
await submit('Save changes')
check('  put back', (await epa('TESTL0056')) === yEpa)
await recordPage('TESTL0056')
check('no ILR problems', /no problems found/.test(await p.locator('.record-ilr-summary').innerText()))
await p.screenshot({ path: `${OUT}/4f1-record.png`, fullPage: true })
const ret = await p.evaluate(async () => { const r = await (await fetch('/api/ilr/return')).json(); return { valid: r.schema.valid, rules: r.rules.length } })
check('ILR return valid, no failing rules', ret.valid && ret.rules === 0, JSON.stringify(ret))
check('no server or page errors', p.problems.length === 0, p.problems.join('; '))
await ctx.close()

{
  const t = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await t.addCookies([{ name: 'dev_user_id', value: 'USR-T0014', domain: 'localhost', path: '/api' }])
  const q = await t.newPage()
  await q.goto(`${B}/app/learners/TESTL0056?back=/app/learners`)
  await q.waitForFunction(() => !/Checking the ILR/.test(document.querySelector('.record-ilr-summary')?.innerText ?? 'Checking the ILR'), null, { timeout: 30000 })
  await q.waitForTimeout(300)
  const s = await q.locator('.learner-section[aria-label="Off-the-job hours"]').innerText()
  check('tutor: hours and note shown, no Change', /Planned hours for off the job training/.test(s) && /earlier rule/.test(s) && (await q.locator('.learner-section[aria-label="Off-the-job hours"] .record-change').count()) === 0)
  const status = await q.evaluate(async () => (await fetch('/api/learners/TESTL0056/ilr-hours', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status)
  check('tutor: the API refuses', status === 403, `${status}`)
  await t.close()
}
await browser.close()
await destroy(db)
try {
  const out = execFileSync('npm', ['run', '-s', 'check:test-flags'], { cwd: REPO, encoding: 'utf8' })
  check('check:test-flags: every row matches its learner', /Every row matches its learner/.test(out), out.split('\n').filter((l) => /HOURS|RECORD_CHANGE/.test(l)).join(' / '))
} catch (err) {
  check('check:test-flags: every row matches its learner', false, err.stdout)
}
console.log(failures ? `${failures} FAILED` : 'all passed')
