// Part 7 step 4f-2 in the browser, as Max (manager) on Yasmin, TESTL0056:
// programme funding and monitoring codes, prices and payments, component
// aims; and the published off-the-job minimum on Reuben, TESTL0088. Test
// data only. Codes and prices it adds are removed again, and so is the
// component aim it adds (marked removed: the row stays until the test
// reset). Removing it is checked on the page, in the ILR return, in the QAR
// and in the history.
import { BASE, OUT, REPO, launch } from './setup.mjs'
import { execFileSync } from 'node:child_process'
import { connect, execute, destroy } from '../../server/db.js'
const B = BASE
const REF = 'TESTL0056'
const browser = await launch()
let failures = 0
const check = (label, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`) }
const here = (p) => decodeURIComponent(p.url().replace(B, ''))
const db = await connect()
const q = async (sql, binds = []) => execute(db, sql, binds)
const fams = async () => (await q(`select LEARNDELFAMTYPE || LEARNDELFAMCODE || coalesce(':' || to_char(DATEFROM,'YYYY-MM-DD') || '>' || to_char(DATETO,'YYYY-MM-DD'), '') as F
  from ILR.LEARNING_DELIVERY_FAM where LEARNREFNUMBER = ? and REMOVEDAT is null order by 1`, [REF])).map((r) => r.F).join(' ')
const fin = async () => (await q(`select AFINTYPE || AFINCODE || ':' || to_char(AFINDATE,'YYYY-MM-DD') || '=' || AFINAMOUNT as F
  from ILR.APP_FIN_RECORD where LEARNREFNUMBER = ? and REMOVEDAT is null order by 1`, [REF])).map((r) => r.F).join(' ')
const orig = async () => (await q(`select to_char(ORIGLEARNSTARTDATE,'YYYY-MM-DD') as D from ILR.LEARNING_DELIVERY where LEARNREFNUMBER = ? and AIMSEQNUMBER = 1`, [REF]))[0].D
const comps = async () => (await q(`select AIMSEQNUMBER || ':' || LEARNAIMREF || ':' || coalesce(PRIORLEARNFUNDADJ::string, '-') || ':' || ISTESTDATA as C
  from ILR.LEARNING_DELIVERY where LEARNREFNUMBER = ? and AIMTYPE = 3 and REMOVEDAT is null order by AIMSEQNUMBER`, [REF])).map((r) => r.C).join(' ')
// The highest aim number used, removed aims included (numbers are never reused).
const maxSeq = async () => Number((await q(`select max(AIMSEQNUMBER) as N from ILR.LEARNING_DELIVERY where LEARNREFNUMBER = ?`, [REF]))[0].N)
const startFams = await fams()
const startFin = await fin()
console.log('     before:', startFams, '|', startFin, '|', await comps())

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addCookies([{ name: 'dev_user_id', value: 'USR-T0008', domain: 'localhost', path: '/api' }])
const p = await ctx.newPage(); p.problems = []
p.on('pageerror', (e) => p.problems.push(e.message))
p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) p.problems.push(`${r.status()} ${r.url()}`) })
async function recordPage(ref = REF) {
  await p.goto(`${B}/app/learners/${ref}?back=/app/learners`)
  await p.locator('.record-ilr-summary').waitFor()
  await p.waitForFunction(() => !/Checking the ILR/.test(document.querySelector('.record-ilr-summary')?.innerText ?? ''), null, { timeout: 30000 })
  await p.waitForTimeout(300)
}
async function submit(name) {
  await p.getByRole('button', { name, exact: true }).click()
  await Promise.race([
    p.waitForURL((u) => !/\/(edit|records)\//.test(u.pathname), { timeout: 30000 }),
    p.locator('.field-error, .error-banner').first().waitFor({ timeout: 30000 }),
  ]).catch(() => {})
  await p.waitForTimeout(300)
}
const form = (kind) => p.goto(`${B}/app/learners/${REF}/records/${kind}/new?back=/app/learners`).then(() => p.locator('form').waitFor())
const formText = () => p.locator('form').innerText()
const section = (title) => p.locator(`.learner-section[aria-label="${title}"]`).innerText()
const summary = () => p.locator('.record-ilr-summary').innerText()

// ---- The published minimum (the standards import has run)
await recordPage('TESTL0088')
check('Reuben: published minimum shown', /Minimum: 278 hours\. ST0259 version 1\.1 publishes 278 hours/.test(await section('Off-the-job hours')))

// ---- Programme funding and monitoring codes
await recordPage()
let text = await section('Apprenticeship programme')
check('LSF has Correct and Remove; SOF and ACT (worked out) do not', (await p.locator('.learner-section[aria-label="Apprenticeship programme"] .record-actions').count()) === 1 && /Worked out by Warren/.test(text))
await form('aim-fam')
await p.getByLabel(/Funding and monitoring code/).selectOption('LSF-1')
await p.getByLabel('Learning support from').fill('2025-06-01')
await p.getByLabel('Learning support to').fill('2025-07-01')
await submit('Add')
check('overlapping learning support refused (R_61)', /R_61/.test(await formText()))
await p.getByLabel(/Funding and monitoring code/).selectOption('EEF-3')
await submit('Add')
check('EEF 3 added', (await fams()).includes('EEF3'), await fams())
await form('aim-fam')
await p.getByLabel(/Funding and monitoring code/).selectOption('EEF-4')
await submit('Add')
check('a second EEF refused (LearnDelFAMType_18)', /LearnDelFAMType_18/.test(await formText()))
await form('aim-fam')
await p.getByLabel(/Funding and monitoring code/).selectOption('RES-1')
await p.getByLabel(/Original start date/).fill('2025-04-01')
await submit('Add')
check('original start must be before the start (OrigLearnStartDate_02)', /OrigLearnStartDate_02/.test(await formText()))
await p.getByLabel(/Original start date/).fill('2024-06-01')
await submit('Add')
check('restart added with its original start date', (await fams()).includes('RES1') && (await orig()) === '2024-06-01')
await recordPage()
text = await section('Apprenticeship programme')
check('  Record shows it', /Original start date\s+01\/06\/2024/.test(text) && /Restart indicator \(RES\)/.test(text))
check('  no ILR problems', /no problems found/.test(await summary()), await summary())
for (const label of ['Restart indicator (RES)', 'Eligibility for enhanced apprenticeship funding (EEF)']) {
  await p.getByRole('link', { name: `Remove ${label}` }).click()
  await p.getByLabel(/Why is it being removed/).fill('TEST: added while testing 4f-2')
  await submit('Remove')
  await recordPage()
}
check('both removed; the original start date went with the restart', (await fams()) === startFams && (await orig()) === null, `${await fams()} | ${await orig()}`)

// ---- Prices and payments
text = await section('Prices and payments')
check('prices shown with Correct and Remove', /Total training price \(1\), from 10\/03\/2025\s+£1,700/.test(text) && /Correct/.test(text))
await form('price')
await p.getByLabel(/Price or payment/).selectOption('PMR-1')
await p.getByLabel(/Date paid/).fill('2030-01-01')
await p.getByLabel(/Amount/).fill('200')
await submit('Add')
check('a payment in the future refused (AFinDate_14)', /AFinDate_14/.test(await formText()))
await p.getByLabel(/Date paid/).fill('2025-06-01')
await submit('Add')
check('payment added', (await fin()).includes('PMR1:2025-06-01=200'), await fin())
await form('price')
await p.getByLabel(/Price or payment/).selectOption('TNP-1')
await p.getByLabel(/Applies from/).fill('2025-03-10')
await p.getByLabel(/Amount/).fill('1800')
await submit('Add')
check('a second training price on the same date refused (R_68)', /R_68/.test(await formText()))
await p.getByLabel(/Price or payment/).selectOption('TNP-3')
await submit('Add')
check('a residual price on the same date as the total refused (AFinDate_07)', /AFinDate_07/.test(await formText()))
await p.getByLabel(/Price or payment/).selectOption('TNP-1')
await p.getByLabel(/Applies from/).fill('2025-09-01')
await p.getByLabel(/Amount/).fill('1900')
await submit('Add')
check('a price change added from its own date', (await fin()).includes('TNP1:2025-09-01=1900'), await fin())
await p.goto(`${B}/app/learners/${REF}/records/price/TNP-1-2025-09-01/correct?back=/app/learners`)
await p.getByLabel(/Amount/).waitFor()
await p.getByLabel(/Amount/).fill('1950')
await submit('Save correction')
check('  corrected to £1,950', (await fin()).includes('TNP1:2025-09-01=1950'), await fin())

// ---- Price reduction for prior learning and the hours that go with it
await form('price')
await p.getByLabel(/Price or payment/).selectOption('RIP-1')
await p.getByLabel(/Applies from/).fill('2025-03-10')
await p.getByLabel(/Amount/).fill('500')
await submit('Add')
await recordPage()
check('a price reduction without hours removed shows R_162', /R_162/.test(await section('Prices and payments')))
await p.goto(`${B}/app/learners/${REF}/edit/hours?back=/app/learners`)
await p.getByLabel('Hours removed for prior learning').waitFor()
await p.getByLabel('Hours removed for prior learning').fill('20')
await submit('Save changes')
await recordPage()
check('  with the hours added, no problems', /no problems found/.test(await summary()), await summary())
await p.screenshot({ path: `${OUT}/4f2-record.png`, fullPage: true })
// put the prices and hours back
for (const key of ['RIP-1-2025-03-10', 'TNP-1-2025-09-01', 'PMR-1-2025-06-01']) {
  await p.goto(`${B}/app/learners/${REF}/records/price/${key}/remove?back=/app/learners`)
  await p.getByLabel(/Why is it being removed/).fill('TEST: added while testing 4f-2')
  await submit('Remove')
}
await p.goto(`${B}/app/learners/${REF}/edit/hours?back=/app/learners`)
await p.getByLabel('Hours removed for prior learning').waitFor()
await p.getByLabel('Hours removed for prior learning').fill('')
await p.getByLabel('What was wrong?').fill('TEST: added while testing 4f-2')
await submit('Save changes')
check('prices back as they were', (await fin()) === startFin, await fin())

// ---- Component aims
const startComps = await comps()
const seq = startComps.split(' ')[0].split(':')[0]
await p.goto(`${B}/app/learners/${REF}/records/component/${seq}/correct?back=/app/learners`)
await p.getByLabel(/Funding adjustment for prior learning/).waitFor()
await p.getByLabel(/Funding adjustment for prior learning/).fill('150')
await submit('Save correction')
check('adjustment over 99 refused', /0 to 99/.test(await formText()))
await p.getByLabel(/Funding adjustment for prior learning/).fill('50')
await submit('Save correction')
check('component corrected', (await comps()).includes(`${seq}:Z0001849:50`), await comps())
await p.goto(`${B}/app/learners/${REF}/records/component/${seq}/correct?back=/app/learners`)
await p.getByLabel(/Funding adjustment for prior learning/).waitFor()
await p.getByLabel(/Funding adjustment for prior learning/).fill('')
await submit('Save correction')
check('  put back', (await comps()) === startComps, await comps())
const usedSeq = await maxSeq()
await form('component')
await p.getByLabel('Find a learning aim in LARS').fill('6035060X')
await p.getByRole('button', { name: 'Find' }).click()
await p.locator('.lars-results button').first().waitFor()
await p.locator('.lars-results button').first().click()
check('found and chosen in LARS', /Functional Skills Qualification in Mathematics \(6035060X\)/.test(await formText()))
await submit('Add')
const newSeq = usedSeq + 1
check('component aim added, test data, next sequence number (removed ones not reused)', (await comps()).endsWith(`${newSeq}:6035060X:-:true`), `${await comps()} (highest used ${usedSeq})`)
await recordPage()
check('  Record lists it', /Functional Skills Qualification in Mathematics/.test(await section('Component aims')))

// ---- Removing it (entered in error)
const qarOf = async () => p.evaluate(async (ref) => {
  const r = await (await fetch('/api/reports/qar')).json()
  return JSON.stringify({ summary: r.summary, rows: r.learners.filter((l) => l.LEARNREFNUMBER === ref) })
}, REF)
const fileAims = async () => {
  const xml = await p.evaluate(async () => (await fetch('/api/ilr/return/file')).text())
  const learner = xml.split('<Learner>').find((b) => b.includes(`<LearnRefNumber>${REF}</LearnRefNumber>`)) ?? ''
  return [...learner.matchAll(/<LearnAimRef>([^<]+)<\/LearnAimRef>\s*<AimType>\d+<\/AimType>\s*<AimSeqNumber>(\d+)</g)].map((m) => `${m[2]}:${m[1]}`).join(' ')
}
const qarBefore = await qarOf()
check('  in the ILR file before removing (the file numbers aims 1, 2, 3...)', (await fileAims()) === '1:ZPROG001 2:Z0001849 3:6035060X', await fileAims())
const aimRow = p.locator('.learner-section[aria-label="Component aims"] li', { hasText: '6035060X' })
await aimRow.getByRole('link', { name: /^Remove/ }).click()
await p.getByLabel('Why is it being removed?').waitFor()
check('Remove link opens the removal form at /records/component/<seq>/remove',
  new URL(p.url()).pathname === `/app/learners/${REF}/records/component/${newSeq}/remove` && /Functional Skills Qualification in Mathematics \(6035060X\)/.test(await formText()) && /funding and monitoring records are removed with it/.test(await formText()), p.url())
await submit('Remove')
check('  a reason is required', /reason|Say why/i.test(await formText()) && (await comps()).includes(`${newSeq}:6035060X`))
await p.getByLabel('Why is it being removed?').fill('TEST: added by the 4f-2 browser test')
await submit('Remove')
const removed = (await q(`select REMOVEDAT is not null as GONE, REMOVEDBY, REMOVEDREASON from ILR.LEARNING_DELIVERY where LEARNREFNUMBER = ? and AIMSEQNUMBER = ?`, [REF, newSeq]))[0]
check('  marked removed, not deleted: who and why kept', removed?.GONE === true && removed.REMOVEDBY === 'USR-T0008' && /4f-2 browser test/.test(removed.REMOVEDREASON), JSON.stringify(removed))
check('  no longer among the component aims', (await comps()) === startComps, await comps())
await recordPage()
const compText = await section('Component aims')
check('  gone from the learner page', !/6035060X/.test(compText) && /Z0001849/.test(compText), compText.replace(/\s+/g, ' ').slice(0, 200))
check('  gone from the ILR file', !(await fileAims()).includes(`:6035060X`) && (await fileAims()).includes('1:ZPROG001'), await fileAims())
check("  the QAR is unchanged (it counts programme aims only, and Yasmin's is still there)", (await qarOf()) === qarBefore && JSON.parse(qarBefore).rows.length === 1, (await qarOf()).slice(0, 200))
const change = (await q(`select CHANGETYPE, RECORDKEY:AIMSEQNUMBER::int as SEQ, OLDVALUES:LEARNAIMREF::string as AIM, REASON, CHANGEDBY, ISTESTDATA,
  (select ISTESTDATA from ILR.LEARNER where LEARNREFNUMBER = ?) as LEARNER_FLAG
  from ILR.RECORD_CHANGE where LEARNREFNUMBER = ? and TABLENAME = 'LEARNING_DELIVERY' order by CHANGEDAT desc limit 1`, [REF, REF]))[0]
check("  history row written, with the learner's ISTESTDATA", change?.CHANGETYPE === 'removed' && change.SEQ === newSeq && change.AIM === '6035060X' && /4f-2 browser test/.test(change.REASON)
  && change.CHANGEDBY === 'USR-T0008' && change.ISTESTDATA === change.LEARNER_FLAG && change.ISTESTDATA === true, JSON.stringify(change))
await p.goto(`${B}/app/learners/${REF}/records/component/${newSeq}/remove?back=/app/learners`)
await p.waitForFunction(() => /isn.t there any more/.test(document.querySelector('#edit-learner, .ilr-record-form')?.innerText ?? ''), null, { timeout: 30000 }).catch(() => {})
check('  its old remove address says it has gone', /isn.t there any more/.test(await p.locator('body').innerText()))

const ret = await p.evaluate(async () => { const r = await (await fetch('/api/ilr/return')).json(); return { valid: r.schema.valid, rules: r.rules.map((x) => x.rule) } })
check('ILR return still valid and clean', ret.valid && ret.rules.length === 0, JSON.stringify(ret))
check('no server or page errors', p.problems.length === 0, p.problems.join('; '))
await ctx.close()

{
  const t = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await t.addCookies([{ name: 'dev_user_id', value: 'USR-T0014', domain: 'localhost', path: '/api' }])
  const tp = await t.newPage()
  await tp.goto(`${B}/app/learners/${REF}?back=/app/learners`)
  await tp.waitForFunction(() => !/Checking the ILR/.test(document.querySelector('.record-ilr-summary')?.innerText ?? 'Checking the ILR'), null, { timeout: 30000 })
  await tp.waitForTimeout(300)
  check('tutor: no prices section, no links', (await tp.locator('.learner-section[aria-label="Prices and payments"]').count()) === 0 && (await tp.locator('.record-actions, .record-add').count()) === 0)
  const statuses = await tp.evaluate(async () => [
    (await fetch('/api/learners/TESTL0056/ilr/price', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status,
    (await fetch('/api/lars/aims?q=maths')).status,
  ])
  check('tutor: the API refuses', statuses.every((s) => s === 403), statuses.join(','))
  await t.close()
}
await browser.close()
await destroy(db)
try {
  const out = execFileSync('npm', ['run', '-s', 'check:test-flags'], { cwd: REPO, encoding: 'utf8' })
  check('check:test-flags: every row matches its learner', /Every row matches its learner/.test(out), out.split('\n').filter((l) => /FAM|FIN|LEARNING_DELIVERY |RECORD_CHANGE/.test(l)).join(' / '))
} catch (err) {
  check('check:test-flags: every row matches its learner', false, err.stdout)
}
console.log(failures ? `${failures} FAILED` : 'all passed')
