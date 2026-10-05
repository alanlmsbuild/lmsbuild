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
  if (userId) await ctx.addCookies([{ name: 'dev_user_id', value: userId, domain: 'localhost', path: '/api' }])
  const p = await ctx.newPage()
  p.problems = []
  p.on('pageerror', (e) => p.problems.push(`pageerror ${e.message}`))
  p.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400 && !r.url().includes('NOPE')) p.problems.push(`${r.status()} ${r.url()}`)
  })
  return p
}
const here = (p) => decodeURIComponent(p.url().replace(BASE, ''))
async function settle(p) {
  await p.waitForLoadState('networkidle')
  await p.waitForFunction(
    () => !document.querySelector('.shell-loading') && !/Loading|Opening the portfolio/.test(document.querySelector('main, .burrow-body')?.innerText ?? ''),
    null,
    { timeout: 60000 },
  ).catch(() => {})
  await p.waitForTimeout(400)
}
async function go(p, path) {
  await p.goto(BASE + path)
  await settle(p)
  return here(p)
}
async function click(p, locator) {
  await locator.click()
  await settle(p)
  return here(p)
}
const area = (p) => p.evaluate(() => document.documentElement.dataset.area)
const activeHeaderTab = (p) => p.locator('.shell-tab.is-active').first().innerText().catch(() => null)
const body = (p) => p.locator('body').innerText()

// ---------------------------------------------------------------- Max, manager
{
  const p = await open('USR-T0008')
  await go(p, '/app/learners?q=test&status=continuing')
  const row = p.locator('table tbody tr').first()
  const ref = await row.locator('td').first().innerText()
  const name = await row.locator('td').nth(1).innerText()
  let at = await click(p, row.locator('td').nth(1).locator('a'))
  check('list → learner page on Record, Back to the filtered list', at === `/app/learners/${ref}?back=/app/learners?q=test&status=continuing`, at)
  check('  a page, not a side panel', (await p.locator('.detail-overlay').count()) === 0 && (await p.locator('.learner-header h1').innerText()) === name)
  check('  Back says Learners', (await p.locator('.learner-back').innerText()).includes('Learners'))
  check('  Record tab active, Learners header tab highlighted', (await p.locator('.learner-tab.is-active').innerText()) === 'Record' && (await activeHeaderTab(p)) === 'Learners')
  check('  manager sees NI number and ethnicity', /NI number/.test(await body(p)) && /Ethnicity/.test(await body(p)))
  check('  title', (await p.title()) === `${name} – Warren`, await p.title())
  await p.screenshot({ path: `${OUT}/4a-record.png`, fullPage: true })

  at = await click(p, p.locator('.learner-tab', { hasText: 'Portfolio' }))
  check('Portfolio tab → Burrow, same Back', at === `/burrow/learners/${ref}?back=/app/learners?q=test&status=continuing`, at)
  check('  Burrow colours and icon', (await area(p)) === 'burrow' && (await p.locator('link[rel=icon]').getAttribute('href')) === '/icons/burrow.svg')
  check('  same header, Portfolio active, no dropdown', (await p.locator('.learner-header h1').innerText()) === name && (await p.locator('.learner-tab.is-active').innerText()) === 'Portfolio' && (await p.locator('.burrow-viewing-as').count()) === 0)
  check('  title', (await p.title()) === `Portfolio: ${name} – Burrow`, await p.title())
  check('  Learners tab in the header', (await activeHeaderTab(p)) === 'Learners')
  await p.screenshot({ path: `${OUT}/4a-portfolio.png`, fullPage: true })

  at = await click(p, p.locator('.learner-back'))
  check('Back → the filtered list', at === '/app/learners?q=test&status=continuing' && (await p.getByLabel('Search by learner ref or name').inputValue()) === 'test', at)

  // Last-used tab: Portfolio now.
  const row2 = p.locator('table tbody tr').nth(1)
  const ref2 = await row2.locator('td').first().innerText()
  at = await click(p, row2.locator('td').nth(1).locator('a'))
  check('next learner opens on the last-used tab (Portfolio)', at.startsWith(`/burrow/learners/${ref2}?back=`), at)
  at = await click(p, p.locator('.learner-tab', { hasText: 'Record' }))
  check('  Record tab → Warren', at.startsWith(`/app/learners/${ref2}?back=`) && (await area(p)) === 'warren', at)
  await p.goBack(); await settle(p)
  check('  browser Back returns to Portfolio', here(p).startsWith(`/burrow/learners/${ref2}`))
  await p.goForward(); await settle(p)

  // Edit on the page.
  at = await click(p, p.getByRole('link', { name: 'Change personal details' }))
  check('Change → /edit/personal with Back kept', at.startsWith(`/app/learners/${ref2}/edit/personal?back=`), at)
  check('  the form is on the learner page', (await p.locator('.learner-header').count()) === 1 && (await p.getByRole('button', { name: 'Cancel' }).count()) === 1)
  at = await click(p, p.getByRole('button', { name: 'Cancel' }))
  check('  Cancel → the learner page', at.startsWith(`/app/learners/${ref2}?back=`), at)

  // Step 3 addresses still work.
  at = await go(p, `/app/learners/${ref}?q=test`)
  check('old /app/learners/<ref>?q= shows the page with Back to the filtered list', (await p.locator('.learner-back').getAttribute('href')) === '/app/learners?q=test')
  at = await go(p, `/app/learners/${ref}/edit`)
  check('old /app/learners/<ref>/edit shows the form', (await p.getByRole('button', { name: 'Cancel' }).count()) === 1)

  // From an officer.
  await go(p, '/app/officers/OFF0014')
  const officerLearner = p.locator('.detail-overlay .link-button').first()
  at = await click(p, officerLearner)
  check('learner from an officer: Back to that officer', at.includes('back=/app/officers/OFF0014') && (await p.locator('.learner-back').innerText()).includes('Officer'), at)
  at = await click(p, p.locator('.learner-back'))
  check('  Back reopens the officer', at === '/app/officers/OFF0014' && (await p.locator('.detail-overlay').count()) === 1, at)

  // From a caseload.
  await go(p, '/app/reports/caseload/OFF0014')
  at = await click(p, p.locator('.caseload-detail table a, .caseload-detail .link-button').first())
  check('learner from a caseload: Back to it, Reports highlighted', at.includes('back=/app/reports/caseload/OFF0014') && (await activeHeaderTab(p)) === 'Reports', at)

  check('unknown learner', (await go(p, '/app/learners/NOPE123')) === '/app/learners/NOPE123' && /no learner NOPE123/.test(await body(p)))

  // Burrow list.
  at = await go(p, '/burrow')
  check('staff /burrow → /burrow/learners', at === '/burrow/learners', at)
  check('  the list', (await p.locator('.burrow-learner-row').count()) === 98 && (await p.title()) === 'Learners – Burrow', `${await p.locator('.burrow-learner-row').count()}`)
  await p.getByLabel('Find a learner').fill('ST0259')
  const narrowed = await p.locator('.burrow-learner-row').count()
  check('  search narrows', narrowed > 0 && narrowed < 98, `${narrowed}`)
  await p.screenshot({ path: `${OUT}/4a-burrow-list.png` })
  // last used is Record now
  at = await click(p, p.locator('.burrow-learner-row').first())
  check('  opens on the last-used tab (Record), Back to the Burrow list', at.startsWith('/app/learners/') && at.endsWith('?back=/burrow/learners') && (await p.locator('.learner-back').innerText()).includes('Learners'), at)
  at = await click(p, p.locator('.learner-back'))
  check('  Back → Burrow list', at === '/burrow/learners')
  check('unknown portfolio: error with Go back', (await go(p, '/burrow/learners/NOPE123')) === '/burrow/learners/NOPE123' && (await p.getByRole('link', { name: 'Go back' }).count()) === 1)
  check('staff /burrow/add → list', (await go(p, '/burrow/add')) === '/burrow/learners')
  check('Max: no page errors', p.problems.length === 0, p.problems.join('; '))
  await p.context().close()
}

// ---------------------------------------------------------------- Hal, tutor
{
  const p = await open('USR-T0014')
  await go(p, '/app/my-day')
  const link = p.locator('.myday-task-name').first()
  let at = await click(p, link)
  check('tutor: from My day, Back to My day, My day highlighted', at.includes('?back=/app/my-day') && (await activeHeaderTab(p)) === 'My day' && (await p.locator('.learner-back').innerText()).includes('My day'), at)
  const text = await body(p)
  const labels = (await p.locator('.record-row dt').allInnerTexts()).join('|')
  check('  no NI number or ethnicity', !/NI number/.test(labels) && !/Ethnicity/.test(labels), labels.slice(0, 80))
  check('  LLDD still shown', /LLDD health problem/.test(text))
  check('  no Change links', (await p.locator('.record-change').count()) === 0)
  await p.screenshot({ path: `${OUT}/4a-tutor-record.png`, fullPage: true })
  at = await click(p, p.locator('.learner-back'))
  check('  Back → My day', at === '/app/my-day')
  const api = await p.evaluate(async () => {
    const r = await (await fetch('/api/learners')).json()
    return { n: r.length, ni: r.filter((x) => x.NINUMBER).length, eth: r.filter((x) => x.ETHNICITY != null).length }
  })
  check('  API masks NI and ethnicity', api.n > 0 && api.ni === 0 && api.eth === 0, JSON.stringify(api))
  check('tutor: /burrow → list of caseload', (await go(p, '/burrow')) === '/burrow/learners' && (await p.locator('.burrow-learner-row').count()) === 12)
  check('tutor: no page errors', p.problems.length === 0, p.problems.join('; '))
  await p.context().close()
}

// ---------------------------------------------------------------- Ivy, IQA
{
  const p = await open('USR-T0007')
  await go(p, '/app/sign-offs')
  const l = p.locator('.link-button').first()
  if (await l.count()) {
    const at = await click(p, l)
    check('IQA: from Sign-offs, Back to them', at.includes('?back=/app/sign-offs') && (await p.locator('.learner-back').innerText()).includes('Sign-offs'), at)
    await p.locator('.record-row dt').first().waitFor()
    check('  no NI number or ethnicity', !/NI number|Ethnicity/.test((await p.locator('.record-row dt').allInnerTexts()).join('|')))
  } else check('IQA has a sign-off to open', false)
  check('IQA: no page errors', p.problems.length === 0, p.problems.join('; '))
  await p.context().close()
}

// ---------------------------------------------------------------- others
{
  const p = await open('USR-T0011') // Nia, ORG-T002
  check('other organisation: not found', (await go(p, '/app/learners/TESTL0001')) === '/app/learners/TESTL0001' && /no learner TESTL0001/.test(await body(p)))
  await p.context().close()
}
{
  const p = await open('USR-T0101') // Alex, learner
  check('learner: /burrow/learners → /burrow', (await go(p, '/burrow/learners')) === '/burrow')
  const tabs = await p.locator('.shell-tabs a').allInnerTexts()
  check('learner: own tabs, no Learners', tabs.join('|').startsWith('My portfolio|Add evidence|Feedback') && !tabs.includes('Learners'), tabs.join('|'))
  check('learner: greeting, no learner header', /Hello, Alex/.test(await body(p)) && (await p.locator('.learner-header').count()) === 0)
  check('learner: no page errors', p.problems.length === 0, p.problems.join('; '))
  await p.context().close()
}
{
  const p = await open('USR-T0201') // Erin, employer
  check('employer: /burrow/learners → apprentices', (await go(p, '/burrow/learners')) === '/burrow/apprentices')
  await p.context().close()
}
{
  const p = await open('USR-T0008', { width: 390 })
  await go(p, '/app/learners/TESTL0001')
  const o1 = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  await p.screenshot({ path: `${OUT}/4a-phone-record.png`, fullPage: true })
  await go(p, '/burrow/learners/TESTL0001')
  const o2 = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  await p.screenshot({ path: `${OUT}/4a-phone-portfolio.png` })
  check('phone: no sideways scroll on either tab', !o1 && !o2, `${o1} ${o2}`)
  check('phone: no page errors', p.problems.length === 0, p.problems.join('; '))
  await p.context().close()
}

console.log(failures ? `${failures} FAILED` : 'all passed')
await browser.close()
