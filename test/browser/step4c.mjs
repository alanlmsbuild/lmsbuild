// Run against the test servers (test/start-test-servers.sh); see setup.mjs.
import { BASE, OUT, REPO, launch } from './setup.mjs'
const browser = await launch()
let failures = 0
const check = (label, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`) }
async function open(user, width = 1280) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } })
  await ctx.addCookies([{ name: 'dev_user_id', value: user, domain: 'localhost', path: '/api' }])
  const p = await ctx.newPage(); p.problems = []
  p.on('pageerror', (e) => p.problems.push(e.message))
  p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 400) p.problems.push(`${r.status()} ${r.url()}`) })
  return p
}
async function record(p, ref) {
  await p.goto(`${BASE}/app/learners/${ref}?back=/app/learners`)
  await p.locator('.record-ilr-summary').waitFor()
  await p.waitForFunction(() => !/Checking the ILR/.test(document.querySelector('.record-ilr-summary')?.innerText ?? ''), null, { timeout: 30000 })
  await p.waitForTimeout(500)
  return { summary: await p.locator('.record-ilr-summary').innerText(), sections: await p.locator('.learner-section h2').allInnerTexts(), text: await p.locator('.learner-record').innerText() }
}
{
  const p = await open('USR-T0008')
  const r = await record(p, 'TESTL0056')
  check('manager: summary', /no problems found/.test(r.summary), r.summary)
  check('manager: sections', r.sections.join('|') === 'Personal details|Contact details|Equality and support|Prior attainment|Employment|Apprenticeship programme|Off-the-job hours|Prices and payments|Component aims|Outcome|Officers|Workplace', r.sections.join('|'))
  check('manager: NI, ethnicity, prices', /NI number/.test(r.text) && /Ethnicity/.test(r.text) && /Total training price/.test(r.text) && /£/.test(r.text))
  check('manager: records shown', /Employment status\s+In paid employment \(10\)/.test(r.text) && /Length of employment/.test(r.text) && /Planned hours for off the job training\s+\d+ hours/.test(r.text) && /Worked out by Warren/.test(r.text), '')
  check('manager: prior attainment label', /Recorded \d\d\/\d\d\/\d{4}\s+(Full )?Level|Entry|No qualifications|Other|Not known/.test(r.text))
  check('manager: LLDD category', /LLDD categories\s+\S/.test(r.text))
  check('manager: component aims', /Component aims[\s\S]*(ZPROG|Functional|Level|\d{8})/.test(r.text))
  await p.screenshot({ path: `${OUT}/4c-manager.png`, fullPage: true })
  const r2 = await record(p, 'TESTL0005')
  check('not in the return', /not in this year.s return/.test(r2.summary), r2.summary)
  check('manager: no page errors', p.problems.length === 0, p.problems.join('; '))
  await p.context().close()
}
for (const [user, name] of [['USR-T0014', 'tutor'], ['USR-T0007', 'IQA']]) {
  const p = await open(user)
  const r = await record(p, 'TESTL0056')
  check(`${name}: no NI, ethnicity or prices`, !/NI number|Ethnicity|Prices and payments|£/.test(r.text) && !r.sections.includes('Prices and payments'))
  check(`${name}: LLDD and support shown`, /LLDD health problem/.test(r.text) && /LLDD categories/.test(r.text))
  check(`${name}: note about manager-only checks`, /Checks on NI number, prices and payments are for managers only/.test(r.summary), r.summary)
  check(`${name}: API has no prices`, await p.evaluate(async () => { const d = await (await fetch('/api/learners/TESTL0056/ilr')).json(); return d.aims.every((a) => a.fin.length === 0) && d.canSeePrices === false }))
  if (name === 'tutor') await p.screenshot({ path: `${OUT}/4c-tutor.png`, fullPage: true })
  check(`${name}: no page errors`, p.problems.length === 0, p.problems.join('; '))
  await p.context().close()
}
{
  const p = await open('USR-T0008', 390)
  await record(p, 'TESTL0056')
  check('phone: fits', !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)))
  await p.screenshot({ path: `${OUT}/4c-phone.png`, fullPage: true })
  await p.context().close()
}
console.log(failures ? `${failures} FAILED` : 'all passed')
await browser.close()
