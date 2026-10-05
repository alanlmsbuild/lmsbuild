// Part 7 step 4g-1 in the browser, as Max (manager): each programme outcome
// in docs/ilr-outcomes.md, recorded on a test learner and LEFT IN PLACE for
// checking in FIS (the reset puts them back):
//   Hana   TESTL0085  training finished, waiting for the EPA
//   Noah   TESTL0032  training finished, then EPA passed (merit)
//   Arjun  TESTL0020  training finished, then EPA failed
//   Robin  TESTL0010  withdrawn, then the reason corrected
//   Uma    TESTL0057  break in learning
//   Rhys   TESTL0075  break, then doesn't come back (withdrawn)
// Dates are in 2026 to 2027, so every one of them is in this year's return.
// Then: the ILR fields, ACT dates in the file, per-learner checks, history
// rows, test flags, and a tutor (no links, API refuses).
import { BASE, OUT, REPO, launch } from './setup.mjs'
import { execFileSync } from 'node:child_process'
import { connect, execute, destroy } from '../../server/db.js'
const B = BASE
const browser = await launch()
let failures = 0
const check = (label, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`) }
const db = await connect()
const LEARNERS = ['TESTL0085', 'TESTL0032', 'TESTL0020', 'TESTL0010', 'TESTL0057', 'TESTL0075']

// "seq:compstatus/outcome/end/ach/grade/reason" for each aim.
const aims = async (ref) => (await execute(db, `
  select AIMSEQNUMBER || ':' || COMPSTATUS || '/' || coalesce(OUTCOME::string, '-') || '/' || coalesce(to_char(LEARNACTENDDATE, 'YYYY-MM-DD'), '-')
    || '/' || coalesce(to_char(ACHDATE, 'YYYY-MM-DD'), '-') || '/' || coalesce(OUTGRADE, '-') || '/' || coalesce(WITHDRAWREASON::string, '-') as A
  from ILR.LEARNING_DELIVERY where LEARNREFNUMBER = ? order by AIMSEQNUMBER`, [ref])).map((r) => r.A)
const hrs3 = async (ref) => (await execute(db, `select HRSAMOUNT from ILR.HOURS_RECORD where LEARNREFNUMBER = ? and HRSTYPE = 'HRS' and HRSCODE = 3 and REMOVEDAT is null`, [ref]))[0]?.HRSAMOUNT ?? null

// Every learner starts continuing (run after a reset).
for (const ref of LEARNERS) {
  const a = await aims(ref)
  if (!a.every((x) => /^\d+:1\/-\/-\/-\/-\/-$/.test(x))) {
    console.log(`${ref} isn't continuing (${a.join(' ')}): run the test learner reset first.`)
    process.exit(1)
  }
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addCookies([{ name: 'dev_user_id', value: 'USR-T0008', domain: 'localhost', path: '/api' }])
const p = await ctx.newPage(); p.problems = []
p.on('pageerror', (e) => p.problems.push(e.message))
p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) p.problems.push(`${r.status()} ${r.url()}`) })
const outcomeSection = () => p.locator('.learner-section[aria-label="Outcome"]')
async function recordPage(ref) {
  await p.goto(`${B}/app/learners/${ref}?back=/app/learners`)
  await outcomeSection().waitFor().catch(async (err) => {
    await p.screenshot({ path: `${OUT}/4g1-stuck.png`, fullPage: true })
    throw new Error(`${ref}: no Outcome section at ${p.url()}: ${(await p.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 300)}`)
  })
  await p.waitForFunction(() => !/Checking the ILR/.test(document.querySelector('.record-ilr-summary')?.innerText ?? 'Checking the ILR'), null, { timeout: 30000 })
  await p.waitForTimeout(300)
}
const links = async () => (await outcomeSection().locator('.outcome-actions a').allInnerTexts()).join(' | ')
async function open(ref, label) {
  await recordPage(ref)
  await outcomeSection().getByRole('link', { name: label, exact: true }).click()
  await p.locator('form').waitFor()
}
async function save() {
  await p.getByRole('button', { name: 'Save' }).click()
  await Promise.race([
    p.waitForURL((u) => !/\/outcome\//.test(u.pathname), { timeout: 30000 }),
    p.locator('.field-error, .error-banner').first().waitFor({ timeout: 30000 }),
  ]).catch(() => {})
  await p.waitForTimeout(300)
}
const saved = () => !/\/outcome\//.test(new URL(p.url()).pathname)
const formText = () => p.locator('form').innerText()
const component = (name) => p.getByRole('group', { name })

// ---- Hana: training finished, waiting for the EPA
await recordPage('TESTL0085')
check('Hana: continuing, links for training finished, break and withdraw', (await links()) === 'Training finished | Break in learning | Withdraw', await links())
await open('TESTL0085', 'Training finished')
check('  address is /outcome/learning-complete', /\/app\/learners\/TESTL0085\/outcome\/learning-complete\?back=/.test(p.url()))
await save()
check('  empty form refused: date, hours and component', /Enter a valid date/.test(await formText()) && /off-the-job hours delivered/.test(await formText()) && /Enter the date of its last learning activity/.test(await formText()), (await formText()).replace(/\\s+/g, ' ').slice(0, 900))
await p.getByLabel('Last day of training').fill('2025-12-31')
await p.getByLabel('Actual off-the-job hours').fill('345')
await component(/Z0001875/).getByLabel('Last day of learning').fill('2026-01-05')
await component(/Z0001875/).getByLabel('Achieved', { exact: true }).check()
await save()
check('  component ending after the programme refused (R_89)', /R_89/.test(await formText()))
await component(/Z0001875/).getByLabel('Last day of learning').fill('')
await save()
check('  saved', saved(), p.url())
check('  programme: CompStatus 1, Outcome 8, end date; component closed achieved on the same date',
  (await aims('TESTL0085')).join(' ') === '1:1/8/2025-12-31/-/-/- 2:2/1/2025-12-31/-/-/-', (await aims('TESTL0085')).join(' '))
check('  actual hours recorded (HRS 3)', Number(await hrs3('TESTL0085')) === 345)
await recordPage('TESTL0085')
let text = await outcomeSection().innerText()
check('  Record says training finished, waiting for the EPA', /Training finished, waiting for the EPA/.test(text) && /Training finished, outcome not yet known/.test(text), text.slice(0, 200))
const months = (from, to) => { const [a, b] = [new Date(from), new Date(to)]; return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() - (b.getDate() < a.getDate() ? 1 : 0) }
const waited = months('2025-12-31', new Date().toISOString().slice(0, 10))
const programmeText = await p.locator('.learner-section[aria-label="Apprenticeship programme"]').innerText()
check(`  time on programme stops at the end of training, then says how long they've waited (${waited} months)`,
  new RegExp(`Time on programme\\s+1 year to the end of training, waiting for the EPA for ${waited} months?`).test(programmeText), programmeText.match(/Time on programme[^\n]*\n?[^\n]*/)?.[0])
check('  links now EPA result, withdraw, correct', (await links()) === 'Record the EPA result | Withdraw | Correct the outcome', await links())

// ---- Noah: training finished, then passed
await open('TESTL0032', 'Training finished')
await p.getByLabel('Last day of training').fill('2026-01-16')
await p.getByLabel('Actual off-the-job hours').fill('470')
await component(/Z0001831/).getByLabel('Achieved', { exact: true }).check()
await save()
check('Noah: training finished saved', saved())
await open('TESTL0032', 'Record the EPA result')
check('  form says when training finished', /Training finished on 16\/01\/2026|Training finished on 16 Jan/.test(await formText()), (await formText()).slice(0, 120))
await p.getByLabel('Passed').check()
await p.getByLabel('End of the EPA period').fill('2026-01-10')
await save()
check('  EPA end before training ended refused (AchDate_05); no grade refused', /AchDate_05/.test(await formText()) && /Choose the grade/.test(await formText()))
await p.getByLabel('End of the EPA period').fill('2027-01-10')
await save()
check('  EPA end in the future refused (AchDate_07)', /AchDate_07/.test(await formText()))
await p.getByLabel('End of the EPA period').fill('2026-09-18')
await p.getByLabel('Grade').selectOption('ME')
await save()
check('  saved', saved())
check('  programme: CompStatus 2, Outcome 1, AchDate, ME', (await aims('TESTL0032'))[0] === '1:2/1/2026-01-16/2026-09-18/ME/-', (await aims('TESTL0032')).join(' '))
await recordPage('TESTL0032')
text = await outcomeSection().innerText()
check('  Record: Completed, Achieved, merit, only Correct left', /Completed/.test(text) && /Achieved/.test(text) && /Merit/.test(text) && (await links()) === 'Correct the outcome', text.slice(0, 250))

// ---- Arjun: training finished, then failed
await open('TESTL0020', 'Training finished')
await p.getByLabel('Last day of training').fill('2026-03-19')
await p.getByLabel('Actual off-the-job hours').fill('470')
await component(/Z0001831/).getByLabel('Not achieved').check()
await save()
await open('TESTL0020', 'Record the EPA result')
await p.getByLabel('Failed').check()
check('  no grade asked for a fail', (await p.getByLabel('Grade').count()) === 0)
await p.getByLabel('End of the EPA period').fill('2026-09-25')
await save()
check('Arjun: CompStatus 2, Outcome 3, AchDate, FL; component not achieved',
  (await aims('TESTL0020')).join(' ') === '1:2/3/2026-03-19/2026-09-25/FL/- 2:2/3/2026-03-19/-/-/-', (await aims('TESTL0020')).join(' '))

// ---- Robin: withdrawn, reason corrected
await open('TESTL0010', 'Withdraw')
await p.getByLabel('Last day of learning').fill('2026-09-11')
await p.getByLabel('Withdrawal reason').selectOption('43')
await p.getByLabel('Actual off-the-job hours').fill('')
await save()
check('Robin: hours required for a start from August 2022 (HRSType_09)', /HRSType_09/.test(await formText()))
await p.getByLabel('Actual off-the-job hours').fill('210')
await save()
check('  saved', saved())
check('  programme and its component withdrawn, same date and reason',
  (await aims('TESTL0010')).join(' ') === ['1', '2'].map((s) => `${s}:3/3/2026-09-11/-/-/43`).join(' '), (await aims('TESTL0010')).join(' '))
await open('TESTL0010', 'Correct the outcome')
check('  correction form filled in', (await p.getByLabel('Withdrawal reason').inputValue()) === '43' && (await p.getByLabel('Last day of learning').inputValue()) === '2026-09-11')
await p.getByLabel('Withdrawal reason').selectOption('44')
await p.getByLabel('Last day of learning').fill('2026-09-10')
await save()
check('  a correction needs a reason; moving the end before the components refused (R_89)', /Say what was wrong/.test(await formText()) && /R_89/.test(await formText()))
await p.getByLabel('Last day of learning').fill('2026-09-11')
await p.getByLabel('What was wrong?').fill('TEST: wrong reason picked')
await save()
const lsf = await execute(db, `select to_char(DATETO, 'YYYY-MM-DD') as D from ILR.LEARNING_DELIVERY_FAM where LEARNREFNUMBER = 'TESTL0010' and LEARNDELFAMTYPE = 'LSF' and REMOVEDAT is null`)
check('  learning support (LSF) now ends on the withdrawal date (LearnDelFAMDateTo_03)', lsf[0]?.D === '2026-09-11', lsf[0]?.D)
check('  corrected', saved() && (await aims('TESTL0010'))[0] === '1:3/3/2026-09-11/-/-/44', (await aims('TESTL0010'))[0])
const hist = await execute(db, `select CHANGETYPE, OLDVALUES:WITHDRAWREASON::string as O, NEWVALUES:WITHDRAWREASON::string as N, REASON, CHANGEDBY, ISTESTDATA
  from ILR.RECORD_CHANGE where LEARNREFNUMBER = 'TESTL0010' and TABLENAME = 'LEARNING_DELIVERY' order by CHANGEDAT desc limit 1`)
check('  history keeps the old reason, who and why', hist[0]?.CHANGETYPE === 'corrected' && hist[0].O === '43' && hist[0].N === '44' && /wrong reason/.test(hist[0].REASON) && hist[0].CHANGEDBY === 'USR-T0008' && hist[0].ISTESTDATA === true, JSON.stringify(hist[0]))

// ---- Uma: break
await open('TESTL0057', 'Break in learning')
await p.getByLabel('Last day of learning before the break').fill('2027-01-01')
await save()
check('Uma: a break date in the future refused', /future/.test(await formText()))
await p.getByLabel('Last day of learning before the break').fill('2026-09-04')
await save()
check('  saved: programme and component on a break', (await aims('TESTL0057')).join(' ') === ['1', '2'].map((s) => `${s}:6/3/2026-09-04/-/-/-`).join(' '), (await aims('TESTL0057')).join(' '))
await recordPage('TESTL0057')
text = await outcomeSection().innerText()
check('  Record: Temporarily withdrawn, last day before the break, Return, Withdraw and Correct', /Temporarily withdrawn/.test(text) && /Last day before the break/.test(text) && (await links()) === 'Return from the break | Withdraw | Correct the outcome', `${await links()}`)

// ---- Rhys: break, then doesn't come back
await open('TESTL0075', 'Break in learning')
await p.getByLabel('Last day of learning before the break').fill('2026-08-14')
await save()
await open('TESTL0075', 'Withdraw')
check("Rhys: no end date asked: the break's date stays", (await p.getByLabel('Last day of learning').count()) === 0 && /On a break since/.test(await formText()))
await p.getByLabel('Withdrawal reason').selectOption('98')
await p.getByLabel('Actual off-the-job hours').fill('150')
await save()
check('  programme and component withdrawn on the break date', (await aims('TESTL0075')).join(' ') === ['1', '2'].map((s) => `${s}:3/3/2026-08-14/-/-/98`).join(' '), (await aims('TESTL0075')).join(' '))

// ---- The old addresses go to the new forms
await p.goto(`${B}/app/learners/TESTL0001/complete?back=/app/learners`)
await p.waitForURL(/\/outcome\/learning-complete/, { timeout: 10000 }).catch(() => {})
check('old /complete address goes to the training finished form', /\/app\/learners\/TESTL0001\/outcome\/learning-complete\?back=/.test(p.url()), p.url())
await p.getByRole('heading', { name: 'Training finished' }).waitFor()
await p.getByRole('button', { name: 'Cancel' }).click()

// ---- The ILR: per-learner checks, the file's ACT dates, the return
const ilr = await p.evaluate(async (refs) => Promise.all(refs.map(async (r) => [r, await (await fetch(`/api/learners/${r}/ilr`)).json()])), LEARNERS)
for (const [ref, d] of ilr) check(`${ref}: in the return, no failing rules`, !d.notInReturn && d.rules.length === 0, `${d.notInReturn ?? ''} ${d.rules.map((r) => r.rule).join(', ')}`)
const xml = await p.evaluate(async () => (await fetch('/api/ilr/return/file')).text())
const actTo = (ref) => {
  const learner = xml.split('<Learner>').find((b) => b.includes(`<LearnRefNumber>${ref}</LearnRefNumber>`)) ?? ''
  const prog = learner.split('<LearningDelivery>').find((b) => b.includes('<LearnAimRef>ZPROG001</LearnAimRef>')) ?? ''
  const act = prog.split('<LearningDeliveryFAM>').find((b) => b.includes('<LearnDelFAMType>ACT</LearnDelFAMType>')) ?? ''
  return act.match(/<LearnDelFAMDateTo>([^<]+)</)?.[1] ?? (act ? 'open' : 'missing')
}
const expectedAct = { TESTL0085: 'open', TESTL0032: '2026-09-18', TESTL0020: '2026-09-25', TESTL0010: '2026-09-11', TESTL0057: '2026-09-04', TESTL0075: '2026-08-14' }
for (const [ref, want] of Object.entries(expectedAct)) check(`${ref}: ACT date to in the file is ${want} (R_121 to R_123)`, actTo(ref) === want, actTo(ref))
const ret = await p.evaluate(async () => { const r = await (await fetch('/api/ilr/return')).json(); return { valid: r.schema.valid, rules: r.rules.length, learners: r.learners } })
check('ILR return valid, no failing rules', ret.valid && ret.rules === 0, JSON.stringify(ret))
await recordPage('TESTL0085')
await p.screenshot({ path: `${OUT}/4g1-hana.png`, fullPage: true })
await p.goto(`${B}/app/learners/TESTL0032/outcome/epa-result?back=/app/learners`)
await p.waitForFunction(() => /can.t be recorded|Save/.test(document.querySelector('#edit-learner')?.innerText ?? ''), null, { timeout: 30000 }).catch(() => {})
const gone = await p.locator('main').innerText().catch((e) => e.message)
check('an outcome that no longer applies says so', /can.t be recorded for this programme now/.test(gone), `${p.url()} ${gone.replace(/\s+/g, ' ').slice(0, 300)}`)
await open('TESTL0075', 'Correct the outcome')
await p.screenshot({ path: `${OUT}/4g1-correct.png`, fullPage: true })
check('no server or page errors', p.problems.length === 0, p.problems.join('; '))
await ctx.close()

// ---- A tutor: sees the outcome, no links; the API refuses
{
  const t = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await t.addCookies([{ name: 'dev_user_id', value: 'USR-T0014', domain: 'localhost', path: '/api' }])
  const q = await t.newPage()
  await q.goto(`${B}/app/learners/TESTL0020?back=/app/learners`)
  await q.locator('.learner-section[aria-label="Outcome"]').waitFor()
  await q.waitForTimeout(500)
  const s = await q.locator('.learner-section[aria-label="Outcome"]').innerText()
  check('tutor (Arjun is on their caseload): outcome shown, no outcome links', /Completed/.test(s) && /Fail/.test(s) && (await q.locator('.outcome-actions').count()) === 0, s.replace(/\s+/g, ' '))
  await q.goto(`${B}/app/learners/TESTL0020/outcome/correct?back=/app/learners`)
  await q.waitForURL((u) => !/\/outcome\//.test(u.pathname), { timeout: 30000 }).catch(() => {})
  check('tutor: the form address goes back to the Record tab', /\/app\/learners\/TESTL0020(\?|$)/.test(q.url()), q.url())
  const status = await q.evaluate(async () => (await fetch('/api/learners/TESTL0020/outcome/correct', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status)
  check('tutor: the API refuses', status === 403, `${status}`)
  await t.close()
}
await browser.close()
const changes = await execute(db, `select count(*) as N, count_if(not ISTESTDATA) as REAL from ILR.RECORD_CHANGE where LEARNREFNUMBER in (${LEARNERS.map(() => '?').join(',')}) and TABLENAME = 'LEARNING_DELIVERY'`, LEARNERS)
check('every aim change logged in RECORD_CHANGE as test data', Number(changes[0].N) >= 12 && Number(changes[0].REAL) === 0, JSON.stringify(changes[0]))
await destroy(db)
try {
  const out = execFileSync('npm', ['run', '-s', 'check:test-flags'], { cwd: REPO, encoding: 'utf8' })
  check('check:test-flags: every row matches its learner', /Every row matches its learner/.test(out))
} catch (err) {
  check('check:test-flags: every row matches its learner', false, err.stdout)
}
console.log(failures ? `${failures} FAILED` : 'all passed')
