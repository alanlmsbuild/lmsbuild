// Run against the test servers (test/start-test-servers.sh); see setup.mjs.
import { BASE, OUT, REPO, launch } from './setup.mjs'
const browser = await launch()
let failures = 0
function check(label, ok, detail = '') {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`)
}
async function open(userId, { width = 1280 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } })
  await ctx.addCookies([{ name: 'dev_user_id', value: userId, domain: 'localhost', path: '/api' }])
  const p = await ctx.newPage()
  p.problems = []
  p.on('pageerror', (e) => p.problems.push(`pageerror ${e.message}`))
  p.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400 && !r.url().includes('NOPE')) p.problems.push(`${r.status()} ${r.url()}`)
  })
  return p
}
const here = (p) => decodeURIComponent(p.url().replace(BASE, ''))
async function settle(p, selector) {
  await p.waitForLoadState('networkidle')
  if (selector) await p.locator(selector).first().waitFor({ timeout: 30000 }).catch(() => {})
  await p.waitForFunction(() => !/Loading|Opening the portfolio/.test(document.querySelector('main, .burrow-body')?.innerText ?? ''), null, { timeout: 30000 }).catch(() => {})
  await p.waitForTimeout(500)
}
const body = (p) => p.locator('body').innerText()

// ---------------------------------------------------------------- Ivy: See the evidence
{
  const p = await open('USR-T0007')
  await p.goto(BASE + '/app/sign-offs'); await settle(p, '.iqa-card')
  const card = p.locator('.iqa-card').first()
  const title = await card.locator('h3').innerText()
  await card.getByRole('link', { name: 'See the evidence' }).click()
  await settle(p, '.burrow-evidence-head h2')
  const at = here(p)
  check('See the evidence → Burrow evidence view, Back to sign-offs', /^\/burrow\/learners\/[^/]+\/evidence\/[^/?]+\?back=\/app\/sign-offs$/.test(at), at)
  check('  clay header, learner header with Portfolio active', (await p.evaluate(() => document.documentElement.dataset.area)) === 'burrow' && (await p.locator('.learner-tab.is-active').innerText()) === 'Portfolio')
  check('  Back says Sign-offs to check', (await p.locator('.learner-back').innerText()).includes('Sign-offs to check'))
  const tops = await p.evaluate(() => [document.querySelector('.learner-header').getBoundingClientRect().top, document.querySelector('.burrow-evidence-view').getBoundingClientRect().top])
  check('  learner header above the evidence', tops[0] < tops[1], tops.join(' < '))
  check('  the evidence it was about', (await p.locator('.burrow-evidence-head h2').innerText()) === title, title)
  const text = await body(p)
  check('  assessor reviews with a sign-off', /Assessor reviews \(\d+\)/.test(text) && /Signed off/.test(text))
  check('  IQA checks shown to staff', /IQA checks \(\d+\)/.test(text))
  check('  read only: no edit controls', /Read only/.test(text) && (await p.locator('.burrow-evidence-view button, .burrow-evidence-view input, .burrow-evidence-view textarea').count()) === 0)
  check('  tab title', (await p.title()) === `${title} – Burrow`, await p.title())
  await p.screenshot({ path: `${OUT}/4b-evidence.png`, fullPage: true })
  const ref = at.split('/')[3]
  await p.locator('.burrow-evidence-back').click(); await settle(p, '.burrow-card')
  check('All evidence → the portfolio, Back kept', here(p) === `/burrow/learners/${ref}?back=/app/sign-offs`, here(p))
  check('  staff see every piece of evidence', /Evidence \(\d+\)/.test(await body(p)))
  await p.locator('.learner-back').click(); await settle(p, '.iqa-card')
  check('Back → Sign-offs to check', here(p) === '/app/sign-offs')
  check('Ivy: no page errors', p.problems.length === 0, p.problems.join('; '))
  await p.context().close()
}

// ---------------------------------------------------------------- Hal: portfolio evidence, and the overdue note
{
  const p = await open('USR-T0014')
  await p.goto(BASE + '/burrow/learners/TESTL0056?back=/burrow/learners'); await settle(p, '.burrow-recent')
  const items = p.locator('.burrow-recent a.burrow-recent-title')
  const n = await items.count()
  const heading = await p.locator('.burrow-card h2', { hasText: 'Evidence' }).innerText().catch(() => '')
  check('tutor: every piece of evidence is a link', heading === `Evidence (${n})`, `${heading} / ${n} links`)
  if (n > 0) {
    const t = await items.first().innerText()
    await items.first().click(); await settle(p, '.burrow-evidence-head h2')
    check('  opens the read-only view', /\/burrow\/learners\/TESTL0056\/evidence\/[^?]+\?back=\/burrow\/learners$/.test(here(p)) && (await p.locator('.burrow-evidence-head h2').innerText()) === t, here(p))
    const file = p.locator('.burrow-evidence-view a[target=_blank]').first()
    if (await file.count()) {
      const href = await file.getAttribute('href')
      const status = await p.evaluate(async (u) => (await fetch(u)).status, href)
      check('  a file opens', status === 200, `${status}`)
    }
  }
  await p.goto(BASE + '/app/learners/TESTL0056?back=/app/my-day'); await settle(p, '.learner-record')
  const note = await p.locator('.learner-record .completion-status-note').innerText().catch(() => '')
  check('Yasmin: note beside Status', note === '5 months past planned end', note)
  await p.screenshot({ path: `${OUT}/4b-overdue-record.png` })
  await p.goto(BASE + '/app/learners'); await settle(p, 'table')
  const listNote = await p.locator('tr', { hasText: 'TESTL0056' }).locator('.completion-status-note').innerText().catch(() => '')
  check('  and in the learner list', listNote === '5 months past planned end', listNote)
  const notes = await p.locator('table .completion-status-note').count()
  check('  only on continuing aims past their planned end', notes > 0, `${notes} in Hal's list`)
  await p.goto(BASE + '/app/reports/caseload/OFF0014'); await settle(p, '.caseload-detail table')
  const clNote = await p.locator('.caseload-detail tr', { hasText: 'TESTL0056' }).locator('.completion-status-note').innerText().catch(() => '')
  check('  and in the caseload report', clNote === '5 months past planned end', clNote)
  // Someone else's evidence: not found.
  const other = await p.evaluate(async () => (await fetch('/api/burrow/learners/TESTL0001/evidence/EVT-IQA-0002')).status)
  check("tutor: another caseload's evidence is not found", other === 404, `${other}`)
  p.problems = p.problems.filter((x) => !x.includes('TESTL0001/evidence'))
  check('Hal: no page errors', p.problems.length === 0, p.problems.join('; '))
  await p.context().close()
}

// ---------------------------------------------------------------- Max: the note in the officer panel; Alex
{
  const p = await open('USR-T0008')
  await p.goto(BASE + '/app/officers/OFF0014'); await settle(p, '.detail-overlay')
  const n = await p.locator('.detail-overlay .completion-status-note').count()
  check('manager: notes in the officer panel', n > 0, `${n}`)
  await p.context().close()
}
{
  const p = await open('USR-T0101')
  await p.goto(BASE + '/burrow/learners/TESTL0001/evidence/EVT-IQA-0002'); await settle(p)
  check('learner: the staff evidence address → /burrow', here(p) === '/burrow', here(p))
  const api = await p.evaluate(async () => {
    const port = await (await fetch('/api/burrow/learners/TESTL0001/portfolio')).json()
    const id = port.evidence[0]?.EVIDENCE_ID
    const r = await (await fetch(`/api/burrow/learners/TESTL0001/evidence/${id}`)).json()
    return { keys: Object.keys(r) }
  })
  check('learner: own evidence without IQA checks', !api.keys.includes('iqaChecks') && api.keys.includes('reviews'), api.keys.join(','))
  check('Alex: no page errors', p.problems.length === 0, p.problems.join('; '))
  await p.context().close()
}
{
  const p = await open('USR-T0007', { width: 390 })
  await p.goto(BASE + '/app/sign-offs'); await settle(p, '.iqa-card')
  await p.getByRole('link', { name: 'See the evidence' }).first().click(); await settle(p, '.burrow-evidence-head h2')
  const o = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  await p.screenshot({ path: `${OUT}/4b-evidence-phone.png`, fullPage: true })
  check('phone: evidence view fits', !o)
  await p.context().close()
}
console.log(failures ? `${failures} FAILED` : 'all passed')
await browser.close()
