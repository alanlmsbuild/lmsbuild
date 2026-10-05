// Part 7 step 4d in the browser, as Max (manager) on Yasmin, TESTL0056, a
// test learner. Changes test data only, and puts each value back. What it
// leaves: removed records (kept, marked removed) and ILR.RECORD_CHANGE
// history, all ISTESTDATA = TRUE, cleared by sql/test_reset_02_reset.sql.
import { BASE, OUT, REPO, launch } from './setup.mjs'
import { execFileSync } from 'node:child_process'
const B = BASE
const REF = 'TESTL0056'
const browser = await launch()
let failures = 0
const check = (label, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`) }
async function open(user) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addCookies([{ name: 'dev_user_id', value: user, domain: 'localhost', path: '/api' }])
  const p = await ctx.newPage(); p.problems = []
  p.on('pageerror', (e) => p.problems.push(e.message))
  p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) p.problems.push(`${r.status()} ${r.url()}`) })
  return p
}
const here = (p) => decodeURIComponent(p.url().replace(B, ''))
async function recordPage(p) {
  await p.goto(`${B}/app/learners/${REF}?back=/app/learners`)
  await p.locator('.record-ilr-summary').waitFor()
  await p.waitForFunction(() => !/Checking the ILR/.test(document.querySelector('.record-ilr-summary')?.innerText ?? ''), null, { timeout: 30000 })
  await p.waitForTimeout(300)
}
const section = (p, title) => p.locator(`.learner-section[aria-label="${title}"]`)
async function submitAndWait(p, buttonName) {
  await p.getByRole('button', { name: buttonName }).click()
  await Promise.race([
    p.waitForURL((u) => !/\/(edit|records)\//.test(u.pathname), { timeout: 30000 }),
    p.locator('.field-error, .error-banner').first().waitFor({ timeout: 30000 }),
  ]).catch(() => {})
  await p.waitForTimeout(300)
}
const history = async (p) => p.evaluate(async () => null) // (history is checked through SQL below)

const p = await open('USR-T0008')

// ---- Old address and the links
await p.goto(`${B}/app/learners/${REF}/edit?back=/app/learners`)
await p.waitForURL(`**/app/learners/${REF}/edit/personal?back=*`)
check('old /edit goes to /edit/personal, keeping Back', here(p) === `/app/learners/${REF}/edit/personal?back=/app/learners`, here(p))
await recordPage(p)
const changes = await p.locator('.record-change').count()
check('manager: Change on 5 sections', changes === 5, `${changes}`)
check('manager: no Edit button left at the top', (await p.locator('.learner-actions').getByText('Edit', { exact: true }).count()) === 0)

// ---- Personal: a valid change, then an ILR-invalid NI number
await section(p, 'Personal details').locator('.record-change').click()
await p.getByRole('heading', { name: 'Change personal details' }).waitFor()
check('personal form shows only personal fields', (await p.locator('legend').allInnerTexts()).join('|').includes('Personal details') && (await p.getByLabel('Contract type').count()) === 0)
await p.getByLabel('Phone').fill('07700 900123')
await submitAndWait(p, 'Save changes')
check('phone saved, back on the Record tab', here(p) === `/app/learners/${REF}?back=/app/learners`, here(p))
await recordPage(p)
check('  Record shows the new phone', /Phone\s+07700 900123/.test(await section(p, 'Personal details').innerText()))
await p.goto(`${B}/app/learners/${REF}/edit/personal?back=/app/learners`)
await p.getByLabel('NI number').fill('QQ123456C')
await submitAndWait(p, 'Save changes')
check('NI number the ILR refuses: error, not saved', /isn.t an NI number the ILR accepts/.test(await p.locator('form').innerText()) && here(p).includes('/edit/personal'))
await p.getByLabel('NI number').fill('ZZ000056A')
await p.getByLabel('Phone').fill('')
await submitAndWait(p, 'Save changes')
check('phone put back', here(p) === `/app/learners/${REF}?back=/app/learners`)

// ---- Contact: address line 1 is required
await p.goto(`${B}/app/learners/${REF}/edit/contact?back=/app/learners`)
await p.getByLabel(/Address line 1/).fill('')
await submitAndWait(p, 'Save changes')
check('contact: address line 1 required (AddLine1_03)', /AddLine1_03/.test(await p.locator('form').innerText()))

// ---- Support: can't say no LLDD while categories exist
await p.goto(`${B}/app/learners/${REF}/edit/support?back=/app/learners`)
await p.getByLabel(/LLDD health problem/).selectOption('2')
await submitAndWait(p, 'Save changes')
check('support: LLDD 2 refused while categories exist', /Remove them first/.test(await p.locator('form').innerText()))

// ---- LLDD categories
await recordPage(p)
await p.getByRole('link', { name: '+ Add a category' }).click()
await p.getByRole('heading', { name: 'Add an LLDD category' }).waitFor()
await p.getByLabel(/Category/).selectOption('14')
await p.getByLabel(/primary LLDD/).check()
await submitAndWait(p, 'Add')
await recordPage(p)
let support = await section(p, 'Equality and support').innerText()
check('add Autism as primary: Dyslexia loses primary', /Autism spectrum disorder\s*Primary/.test(support) && /Dyslexia\s*Correct/.test(support), support.replace(/\n/g, ' | ').slice(0, 200))
await p.getByRole('link', { name: 'Remove Autism spectrum disorder' }).click()
await p.getByRole('heading', { name: 'Remove an LLDD category' }).waitFor()
await submitAndWait(p, 'Remove')
check('remove needs a reason', /Say why/.test(await p.locator('form').innerText()))
await p.getByLabel(/Why is it being removed/).fill('TEST: added in error while testing 4d')
await submitAndWait(p, 'Remove')
await recordPage(p)
support = await section(p, 'Equality and support').innerText()
check('Autism removed; no category is primary, so the rule shows', !/Autism/.test(support) && /PrimaryLLDD_01/.test(support), support.replace(/\n/g, ' | ').slice(0, 220))
check('  the summary counts it', /1 error/.test(await p.locator('.record-ilr-summary').innerText()))
await p.getByRole('link', { name: 'Correct Dyslexia' }).click()
await p.getByRole('heading', { name: 'Correct an LLDD category' }).waitFor()
await p.getByLabel(/primary LLDD/).check()
await p.getByLabel(/What was wrong/).fill('TEST: primary restored')
await submitAndWait(p, 'Save correction')
await recordPage(p)
support = await section(p, 'Equality and support').innerText()
check('Dyslexia primary again, rule gone', /Dyslexia\s*Primary/.test(support) && !/PrimaryLLDD_01/.test(support))

// ---- Learner FAMs
await p.getByRole('link', { name: '+ Add funding and monitoring' }).click()
await p.getByLabel(/Funding and monitoring/).selectOption('EHC-1')
await submitAndWait(p, 'Add')
await p.goto(`${B}/app/learners/${REF}/records/learner-fam/new?back=/app/learners`)
await p.getByLabel(/Funding and monitoring/).selectOption('SEN-1')
await submitAndWait(p, 'Add')
check('SEN refused alongside EHC (LearnFAMType_14)', /LearnFAMType_14/.test(await p.locator('form').innerText()))
await recordPage(p)
check('EHC shown', /Education Health Care plan \(EHC\)\s+Learner has an Education Health Care plan \(1\)/.test(await section(p, 'Equality and support').innerText()))
await p.getByRole('link', { name: 'Remove Education Health Care plan (EHC)' }).click()
await p.getByLabel(/Why is it being removed/).fill('TEST: added while testing 4d')
await submitAndWait(p, 'Remove')

// ---- Prior attainment
await recordPage(p)
await p.getByRole('link', { name: '+ Add prior attainment' }).click()
await p.getByLabel(/Prior attainment level/).selectOption('6')
await p.getByLabel(/Date the level applies/).fill('2025-03-10')
await submitAndWait(p, 'Add')
check('same date refused (PriorAttain_10)', /PriorAttain_10/.test(await p.locator('form').innerText()))
await p.getByLabel(/Date the level applies/).fill('2024-09-01')
await p.getByLabel(/Prior attainment level/).selectOption('4')
await submitAndWait(p, 'Add')
await recordPage(p)
let prior = await section(p, 'Prior attainment').innerText()
check('second prior attainment added', /Recorded 01\/09\/2024\s+Full Level 2/.test(prior), prior.replace(/\n/g, ' | '))
await p.getByRole('link', { name: 'Correct prior attainment recorded 01/09/2024' }).click()
await p.getByLabel(/Prior attainment level/).selectOption('3')
await submitAndWait(p, 'Save correction')
await recordPage(p)
check('corrected to Level 2', /Recorded 01\/09\/2024\s+Level 2/.test(await section(p, 'Prior attainment').innerText()))
await p.getByRole('link', { name: 'Remove prior attainment recorded 01/09/2024' }).click()
await p.getByLabel(/Why is it being removed/).fill('TEST: added while testing 4d')
await submitAndWait(p, 'Remove')
await recordPage(p)
prior = await section(p, 'Prior attainment').innerText()
check('removed, original left', !/01\/09\/2024/.test(prior) && /10\/03\/2025\s+Full Level 3/.test(prior))
check('back to no problems', /no problems found/.test(await p.locator('.record-ilr-summary').innerText()))
await p.screenshot({ path: `${OUT}/4d-record.png`, fullPage: true })

// ---- The ILR return leaves removed records out and is still valid
const ret = await p.evaluate(async () => { const r = await (await fetch('/api/ilr/return')).json(); return { valid: r.schema.valid, rules: r.rules.length, learners: r.learners } })
check('ILR return still valid with no failing rules', ret.valid && ret.rules === 0, JSON.stringify(ret))
check('manager: no server errors or page errors', p.problems.length === 0, p.problems.join('; '))
await p.context().close()

// ---- A tutor sees no change links
{
  const t = await open('USR-T0014')
  await recordPage(t)
  check('tutor: no Change, Correct, Remove or Add links', (await t.locator('.record-change, .record-actions, .record-add').count()) === 0)
  await t.goto(`${B}/app/learners/${REF}/records/lldd/new?back=/app/learners`)
  await t.waitForTimeout(1500)
  check('tutor: a form address goes to the learner page', here(t) === `/app/learners/${REF}`, here(t))
  await t.context().close()
}
await browser.close()

// ---- Every row carries its learner's ISTESTDATA
try {
  const out = execFileSync('npm', ['run', '-s', 'check:test-flags'], { cwd: REPO, encoding: 'utf8' })
  check('check:test-flags: every row matches its learner', /Every row matches its learner/.test(out), out.split('\n').filter((l) => /RECORD_CHANGE|LLDD|LEARNER_FAM|PRIOR/.test(l)).join(' / '))
} catch (err) {
  check('check:test-flags: every row matches its learner', false, err.stdout)
}
console.log(failures ? `${failures} FAILED` : 'all passed')
