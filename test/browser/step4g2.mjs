// Part 7 step 4g-2 in the browser: returning from a break in learning, as
// Max (manager). Test learners only:
//   Dev    TESTL0051  on a break since 22/06/2025: returns to the same
//                      employer, the return is undone, then he returns again
//   Yusuf  TESTL0065  on a break since 08/03/2026: returns to a new
//                      employer (Sample Logistics, EMP-T003), residual prices
// Both are LEFT RETURNED for checking in FIS; the test reset puts them back.
// Each run first undoes an earlier run's returns (through the app's own
// undo), and adds one test piece of evidence for Dev once.
// Run against the test servers (test/start-test-servers.sh); see setup.mjs.
import { execFileSync } from 'node:child_process'
import { BASE, OUT, REPO, launch } from './setup.mjs'
import { connect, execute, destroy } from '../../server/db.js'

const browser = await launch()
const B = BASE
let failures = 0
const check = (label, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`) }
const db = await connect()
const q = (sql, binds = []) => execute(db, sql, binds)

// "seq:type:start:orig:compstatus:removed" for each aim, removed ones too.
const aims = async (ref) => (await q(`select AIMSEQNUMBER || ':' || AIMTYPE || ':' || to_char(LEARNSTARTDATE, 'YYYY-MM-DD') || ':' ||
    coalesce(to_char(ORIGLEARNSTARTDATE, 'YYYY-MM-DD'), '-') || ':' || COMPSTATUS || ':' || iff(REMOVEDAT is null, 'live', 'removed') as A
  from ILR.LEARNING_DELIVERY where LEARNREFNUMBER = ? order by AIMSEQNUMBER`, [ref])).map((r) => r.A)
const live = async (ref) => (await aims(ref)).filter((a) => a.endsWith(':live'))
const records = async (ref, seq) => ({
  fams: (await q(`select LEARNDELFAMTYPE || LEARNDELFAMCODE as F from ILR.LEARNING_DELIVERY_FAM where LEARNREFNUMBER = ? and AIMSEQNUMBER = ? and REMOVEDAT is null order by 1`, [ref, seq])).map((r) => r.F).join(' '),
  prices: (await q(`select AFINTYPE || AFINCODE || '=' || AFINAMOUNT || '@' || to_char(AFINDATE, 'YYYY-MM-DD') as P from ILR.APP_FIN_RECORD where LEARNREFNUMBER = ? and AIMSEQNUMBER = ? and REMOVEDAT is null order by 1`, [ref, seq])).map((r) => r.P).join(' '),
  hours: (await q(`select HRSCODE || '=' || HRSAMOUNT as H from ILR.HOURS_RECORD where LEARNREFNUMBER = ? and AIMSEQNUMBER = ? and REMOVEDAT is null order by 1`, [ref, seq])).map((r) => r.H).join(' '),
})
const links = async (ref) => (await q(`select EMPLOYERID || ' ' || to_char(FROMDATE, 'YYYY-MM-DD') || '>' || coalesce(to_char(TODATE, 'YYYY-MM-DD'), 'open') as L
  from ILR.LEARNER_EMPLOYER where LEARNREFNUMBER = ? order by FROMDATE, EMPLOYERID`, [ref])).map((r) => r.L).join(', ')

async function api(user, path, body) {
  const res = await fetch(`${B}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Cookie: `dev_user_id=${user}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

// ---- Start from the break: undo an earlier run's returns
for (const ref of ['TESTL0051', 'TESTL0065']) {
  for (let i = 0; i < 3; i++) {
    const ilr = (await api('USR-T0008', `/api/learners/${ref}/ilr`)).body
    if (!ilr.returnUndo?.allowed) break
    const r = await api('USR-T0008', `/api/learners/${ref}/outcome/undo-return`, { reason: 'TEST: step4g2 rerun' })
    if (r.status !== 200) throw new Error(`Couldn't undo an earlier return for ${ref}: ${JSON.stringify(r.body)}`)
  }
}
check('Dev and Yusuf start on the break', (await live('TESTL0051')).every((a) => a.includes(':6:')) && (await live('TESTL0065')).every((a) => a.includes(':6:')),
  `${(await live('TESTL0051')).join(' ')} | ${(await live('TESTL0065')).join(' ')}`)

// ---- Dev's evidence from before the break (added once)
const EVIDENCE = 'TEST: evidence from before the break'
const portfolio = async () => (await api('USR-T1051', '/api/burrow/learners/TESTL0051/portfolio')).body
const hasEvidence = (p) => JSON.stringify(p ?? {}).includes(EVIDENCE)
if (!hasEvidence(await portfolio())) {
  const r = await api('USR-T1051', '/api/burrow/learners/TESTL0051/evidence', {
    title: EVIDENCE, evidenceType: 'reflection', occurredOn: '2025-05-12', reflection: 'Written by the 4g-2 browser test.', ksbs: [],
  })
  check('Dev adds a piece of evidence (as himself)', r.status === 201 || r.status === 200, `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`)
}
check("Dev's evidence is in his portfolio", hasEvidence(await portfolio()))

// ---- The browser, as Max
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addCookies([{ name: 'dev_user_id', value: 'USR-T0008', domain: 'localhost', path: '/api' }])
const p = await ctx.newPage(); p.problems = []
p.on('pageerror', (e) => p.problems.push(e.message))
p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) p.problems.push(`${r.status()} ${r.url()}`) })
const outcome = () => p.locator('.learner-section[aria-label="Outcome"]')
async function recordPage(ref) {
  await p.goto(`${B}/app/learners/${ref}?back=/app/learners`)
  await outcome().waitFor({ timeout: 60000 })
  await p.waitForFunction(() => !/Checking the ILR/.test(document.querySelector('.record-ilr-summary')?.innerText ?? 'Checking the ILR'), null, { timeout: 60000 })
  await p.waitForTimeout(300)
}
const outcomeLinks = async () => (await outcome().locator('.outcome-actions a').allInnerTexts()).join(' | ')
async function openLink(ref, label) {
  await recordPage(ref)
  await outcome().getByRole('link', { name: label, exact: true }).click()
  await p.locator('form').waitFor({ timeout: 60000 })
}
async function save(name) {
  await p.getByRole('button', { name }).click()
  await Promise.race([
    p.waitForURL((u) => !/\/outcome\//.test(u.pathname), { timeout: 60000 }),
    p.locator('.field-error, .error-banner').first().waitFor({ timeout: 60000 }),
  ]).catch(() => {})
  await p.waitForTimeout(300)
}
const saved = () => !/\/outcome\//.test(new URL(p.url()).pathname)
const formText = () => p.locator('form').innerText()

async function returnDev() {
  await openLink('TESTL0051', 'Return from the break')
  await p.getByLabel('Restart date').fill('2026-09-01')
  await p.getByLabel('New planned end date').fill('2027-06-30')
  await save('Record the return')
}

// ---- Dev returns to the same employer
// Aim numbers are never reused, so the new aims follow the highest used.
const nextSeq = async (ref) => Math.max(...(await aims(ref)).map((a) => Number(a.split(':')[0]))) + 1
const devSeq = await nextSeq('TESTL0051')
await recordPage('TESTL0051')
check('Dev on a break: Return and Withdraw offered', (await outcomeLinks()).startsWith('Return from the break | Withdraw'), await outcomeLinks())
await openLink('TESTL0051', 'Return from the break')
check('  the form fills in the price before the break', (await p.getByLabel('Training price (£)').inputValue()) === '2550' && (await p.getByLabel('Assessment price (£)').inputValue()) === '450')
await save('Record the return')
check('  empty dates refused', /Enter a valid date/.test(await formText()))
await p.getByLabel('Restart date').fill('2025-06-22')
await p.getByLabel('New planned end date').fill('2027-06-30')
await save('Record the return')
check('  a restart on the last day before the break refused (R_124)', /R_124/.test(await formText()))
await p.getByLabel('Restart date').fill('2026-09-01')
await save('Record the return')
check('  saved', saved(), p.url())
const devAims = await live('TESTL0051')
check('  new programme and component aims from the restart, with the original start; the aims on the break unchanged',
  devAims.join(' ') === `1:1:2025-01-20:-:6:live 2:3:2025-01-20:-:6:live ${devSeq}:1:2026-09-01:2025-01-20:1:live ${devSeq + 1}:3:2026-09-01:2025-01-20:1:live`, devAims.join(' '))
const devNew = await records('TESTL0051', devSeq)
check('  restart indicator, same price from the restart date, planned hours copied',
  devNew.fams === 'RES1' && devNew.prices === 'TNP1=2550@2026-09-01 TNP2=450@2026-09-01' && devNew.hours === '1=336', JSON.stringify(devNew))
check('  the component is a restart too', (await records('TESTL0051', devSeq + 1)).fams === 'RES1')
check('  the aims on the break keep their prices and hours', JSON.stringify(await records('TESTL0051', 1)) === JSON.stringify({ fams: '', prices: 'TNP1=2550@2025-01-20 TNP2=450@2025-01-20', hours: '1=336' }))
await recordPage('TESTL0051')
let text = await outcome().innerText()
check('  Record: continuing, Undo the return offered', /Continuing/.test(text) && /Undo the return/.test(await outcomeLinks()), await outcomeLinks())
const programmeText = await p.locator('.learner-section[aria-label="Apprenticeship programme"]').innerText()
check('  time on programme counts the spells and the break', /Time on programme\s+5 months before the break, then 1 month since returning \(break of 1 year 2 months\)/.test(programmeText),
  programmeText.match(/Time on programme[^\n]*\n?[^\n]*/)?.[0])
const devIlr = (await api('USR-T0008', '/api/learners/TESTL0051/ilr')).body
check('  no failing ILR rules; all four aims in this year\'s return', devIlr.rules.length === 0 && devIlr.aims.every((a) => a.IN_YEAR), devIlr.rules.map((r) => r.rule).join(', '))
const xml = (await (await fetch(`${B}/api/ilr/return/file`, { headers: { Cookie: 'dev_user_id=USR-T0008' } })).text())
const devXml = xml.split('<Learner>').find((b) => b.includes('<LearnRefNumber>TESTL0051</LearnRefNumber>')) ?? ''
check('  ILR file: four aims, the restart with RES 1 and the original start date',
  (devXml.match(/<LearningDelivery>/g) ?? []).length === 4 &&
  // The file numbers the aims 1 to 4 (Warren's own numbers have gaps).
  ['1', '2', '3', '4'].every((n) => devXml.includes(`<AimSeqNumber>${n}</AimSeqNumber>`)) &&
  /<AimSeqNumber>3<\/AimSeqNumber>[\s\S]*?<OrigLearnStartDate>2025-01-20<\/OrigLearnStartDate>/.test(devXml) &&
  /<LearnDelFAMType>RES<\/LearnDelFAMType>\s*<LearnDelFAMCode>1<\/LearnDelFAMCode>/.test(devXml), devXml.length)
const qar = (await api('USR-T0008', '/api/reports/qar')).body
check("  the QAR's past-planned-end warning no longer lists Dev", !qar.pastPlannedEnd.some((r) => r.LEARNREFNUMBER === 'TESTL0051'))
check("  Dev's evidence from before the break is still in his portfolio", hasEvidence(await portfolio()))
await p.screenshot({ path: `${OUT}/4g2-dev-returned.png`, fullPage: true })
// ---- Undo it (entered in error), then return him again
await openLink('TESTL0051', 'Undo the return')
await save('Undo the return')
check('Undo: a reason is required', /Say why/.test(await formText()))
await p.getByLabel('Why is it being undone?').fill('TEST: undoing a return in the 4g-2 browser test')
await save('Undo the return')
check('  saved', saved(), p.url())
const undone = await aims('TESTL0051')
check('  the new aims are marked removed (kept), the aims on the break are current again',
  undone.includes(`${devSeq}:1:2026-09-01:2025-01-20:1:removed`) && undone.includes(`${devSeq + 1}:3:2026-09-01:2025-01-20:1:removed`) &&
  (await live('TESTL0051')).every((a) => a.includes(':6:')), undone.join(' '))
check('  their prices, hours and restart indicators are removed too', JSON.stringify(await records('TESTL0051', devSeq)) === JSON.stringify({ fams: '', prices: '', hours: '' }))
const history = (await q(`select count(*) as N, count_if(not ISTESTDATA) as REAL from ILR.RECORD_CHANGE
  where LEARNREFNUMBER = 'TESTL0051' and CHANGETYPE = 'removed' and REASON like 'TEST: undoing a return%'`))[0]
check("  the history has the removals, with the learner's ISTESTDATA", Number(history.N) >= 6 && Number(history.REAL) === 0, JSON.stringify(history))
check('  the warning lists Dev again', (await api('USR-T0008', '/api/reports/qar')).body.pastPlannedEnd.some((r) => r.LEARNREFNUMBER === 'TESTL0051'))
await recordPage('TESTL0051')
check('  Return offered again; no Undo', (await outcomeLinks()).startsWith('Return from the break') && !/Undo/.test(await outcomeLinks()), await outcomeLinks())
const devSeq2 = await nextSeq('TESTL0051')
await returnDev()
check('Dev returned again (left returned for FIS), new aim numbers', saved() && (await live('TESTL0051')).some((a) => a.startsWith(`${devSeq2}:1:2026-09-01`)), (await live('TESTL0051')).join(' '))
// ---- Yusuf returns to a new employer
const yusufSeq = await nextSeq('TESTL0065')
const yusufLinksBefore = await links('TESTL0065')
await openLink('TESTL0065', 'Return from the break')
await p.getByLabel('Restart date').fill('2026-09-14')
await p.getByLabel('New planned end date').fill('2027-08-31')
await p.getByLabel('Employer').selectOption('EMP-T003')
check('Yusuf, new employer: residual prices asked for, with employment details',
  (await p.getByLabel('Residual training price (£)').count()) === 1 && (await p.getByLabel('Hours a week').count()) === 1)
await p.getByLabel('Residual training price (£)').fill('900')
await p.getByLabel('Residual assessment price (£)').fill('300')
await save('Record the return')
check('  hours a week and length of employment required', /hours a week/i.test(await formText()) && /how long they have been employed/i.test(await formText()))
await p.getByLabel('Hours a week').selectOption('8')
await p.getByLabel('Length of employment').selectOption('1')
await save('Record the return')
check('  saved (left returned for FIS)', saved(), p.url())
const yusufNew = await records('TESTL0065', yusufSeq)
check('  residual prices TNP 3 and 4 from the restart date, planned hours copied',
  yusufNew.fams === 'RES1' && yusufNew.prices === 'TNP3=900@2026-09-14 TNP4=300@2026-09-14' && yusufNew.hours === '1=335', JSON.stringify(yusufNew))
const status = (await q(`select EMPSTAT, EMPLOYERID, EMPID, ISTESTDATA from ILR.EMPLOYMENT_STATUS
  where LEARNREFNUMBER = 'TESTL0065' and DATEEMPSTATAPP = '2026-09-14' and REMOVEDAT is null`))[0]
check('  employed by Sample Logistics from the restart date (test data)', status?.EMPSTAT === 10 && status.EMPLOYERID === 'EMP-T003' && status.ISTESTDATA === true, JSON.stringify(status))
const yusufLinks = (await links('TESTL0065')).split(', ')
check('  Burrow: the old employer link ends the day before, the new one starts on the restart date, one row each',
  yusufLinks.includes('EMP-T005 2025-04-21>2026-09-13') && yusufLinks.filter((l) => l.startsWith('EMP-T003 2026-09-14')).length === 1 &&
  yusufLinks.includes('EMP-T003 2026-09-14>open') && yusufLinks.filter((l) => l.endsWith('>open')).length === 1,
  `${yusufLinksBefore} -> ${yusufLinks.join(', ')}`)
const yusufIlr = (await api('USR-T0008', '/api/learners/TESTL0065/ilr')).body
check('  no failing ILR rules', yusufIlr.rules.length === 0, yusufIlr.rules.map((r) => r.rule).join(', '))
// ---- Layout: Correct and Remove sit on the component title's first line
await recordPage('TESTL0051')
const rows = await p.locator('.learner-section[aria-label="Component aims"] .record-history-head').evaluateAll((heads) => heads.map((h) => {
  const title = h.querySelector('.record-history-title')?.getBoundingClientRect()
  const actions = h.querySelector('.record-actions')?.getBoundingClientRect()
  return actions && title ? Math.abs(actions.top - title.top) < 8 && actions.left > title.left : null
}))
check('component rows: Correct and Remove on the title line, on the right', rows.length > 0 && rows.every((r) => r === true || r === null), JSON.stringify(rows))
check('no server or page errors', p.problems.length === 0, p.problems.join('; '))
await ctx.close()

// ---- Dev's tutor: sees the programme, no Return or Undo; the API refuses
{
  const t = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await t.addCookies([{ name: 'dev_user_id', value: 'USR-T0002', domain: 'localhost', path: '/api' }])
  const tp = await t.newPage()
  await tp.goto(`${B}/app/learners/TESTL0051?back=/app/learners`)
  await tp.locator('.learner-section[aria-label="Outcome"]').waitFor({ timeout: 60000 })
  await tp.waitForTimeout(800)
  check('tutor: no outcome links', (await tp.locator('.outcome-actions').count()) === 0)
  await t.close()
}
const tutorTries = await Promise.all(['return', 'undo-return'].map((a) => api('USR-T0002', `/api/learners/TESTL0051/outcome/${a}`, { reason: 'x' })))
check('tutor: the API refuses return and undo', tutorTries.every((r) => r.status === 403), tutorTries.map((r) => r.status).join(','))

// ---- The whole return, and test flags
const ret = (await api('USR-T0008', '/api/ilr/return')).body
check('ILR return valid, no failing rules', ret.schema.valid && ret.rules.length === 0, JSON.stringify({ valid: ret.schema.valid, rules: ret.rules.map((r) => r.rule) }))
const flags = (await q(`select count(*) as N, count_if(not ISTESTDATA) as REAL from ILR.RECORD_CHANGE
  where LEARNREFNUMBER in ('TESTL0051', 'TESTL0065') and CHANGETYPE = 'return'`))[0]
check("the return's history rows carry the learner's ISTESTDATA", Number(flags.N) > 0 && Number(flags.REAL) === 0, JSON.stringify(flags))
await browser.close()
await destroy(db)
try {
  const out = execFileSync('npm', ['run', '-s', 'check:test-flags'], { cwd: REPO, encoding: 'utf8' })
  check('check:test-flags: every row matches its learner', /Every row matches its learner/.test(out))
} catch (err) {
  check('check:test-flags: every row matches its learner', false, err.stdout)
}
console.log(failures ? `${failures} FAILED` : 'all passed')
