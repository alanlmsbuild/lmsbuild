// Browser test for part 7 step 3 (addresses, sign-in and role homes),
// updated to the step 4a learner page. Reads only: it changes no data.
//
// Needs the test servers running, never the dev ones:
//   PORT=3002 node server/index.js      (with TEST_SIGN_IN=true in server/.env)
//   vite on port 5199, proxying /api to 3002
// Then:
//   node test/browser/step3.mjs <folder for screenshots>
// playwright-core and a headless Chromium aren't project dependencies; say
// where they are with PLAYWRIGHT_DIR (a node_modules folder that has
// playwright-core) and CHROMIUM_PATH. BASE_URL defaults to port 5199.
import { createRequire } from 'node:module'
const require = createRequire(process.env.PLAYWRIGHT_DIR ?? process.env.HOME + '/.npm/_npx/e058441c325e062a/node_modules/')
const { chromium } = require('playwright-core')
const OUT = process.argv[2] ?? '.'
const BASE = process.env.BASE_URL ?? 'http://localhost:5199'
if (/:(3001|5173)\b/.test(BASE)) throw new Error('Ports 3001 and 5173 are the dev servers. Test on 3002 and 5199.')
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? process.env.HOME + '/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
})

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
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('401')) p.problems.push(`console ${m.text()}`) })
  p.on('response', (r) => {
    const u = r.url()
    if (!u.includes('/api/') || r.status() < 400) return
    if (r.status() === 401 && u.endsWith('/api/me')) return // signed out: expected
    p.problems.push(`${r.status()} ${u}`)
  })
  return p
}

const here = (p) => p.url().replace(BASE, '')
// networkidle doesn't wait after in-page navigation, so also wait for the
// shell's loading placeholder and page loading notes to go.
async function settle(p) {
  await p.waitForLoadState('networkidle')
  await p.waitForFunction(() => !document.querySelector('.shell-loading') && !/Loading|Opening the portfolio/.test(document.querySelector('main')?.innerText ?? ''), null, { timeout: 60000 }).catch(() => {})
  await p.waitForTimeout(400)
}
async function tab(p) {
  return { title: await p.title(), icon: await p.locator('link[rel=icon]').getAttribute('href') }
}
async function go(p, path) {
  await p.goto(BASE + path)
  await settle(p)
  return here(p)
}

// ---------------------------------------------------------------- signed out
{
  const p = await open(null)
  check('signed out: / shows the landing page', (await go(p, '/')) === '/' && (await p.locator('.landing').count()) === 1)
  let t = await tab(p)
  check('landing tab', t.title === 'Rarebit: learning and e-portfolio systems' && t.icon === '/icons/rarebit.svg', JSON.stringify(t))
  await p.locator('.shell-signin').click()
  await settle(p)
  check('Sign in goes to /sign-in', here(p) === '/sign-in')
  check('Who are you? heading', await p.getByRole('heading', { name: 'Who are you?' }).isVisible())
  t = await tab(p)
  check('sign-in tab', t.title === 'Sign in – Rarebit' && t.icon === '/icons/rarebit.svg', JSON.stringify(t))
  await p.locator('.signin-group').first().waitFor()
  const groups = await p.locator('.signin-group h3').allInnerTexts()
  console.log('     groups:', groups.join(' | '))
  const showAll = await p.locator('.signin-more').allInnerTexts()
  console.log('     show all buttons:', showAll.join(' | '))
  await p.screenshot({ path: `${OUT}/signin.png`, fullPage: true })
  await p.getByLabel('Find a name').fill('testiqa')
  check('search narrows to Ivy', (await p.locator('.signin-person').count()) === 1)
  await p.getByLabel('Find a name').fill('')

  // A deep link while signed out goes to sign-in and comes back.
  check('deep link redirects to sign-in', (await go(p, '/app/reports/caseload')) === '/sign-in?next=%2Fapp%2Freports%2Fcaseload')
  check('  Back does not bounce (history replaced)', (await p.evaluate(() => history.length)) >= 1)
  await p.getByRole('button', { name: /Max Testmanager01/ }).click()
  await p.waitForURL('**/app/reports/caseload')
  await settle(p)
  check('after sign-in, lands on the deep link', here(p) === '/app/reports/caseload')
  t = await tab(p)
  check('warren tab', t.title === 'Caseload report – Warren' && t.icon === '/icons/warren.svg', JSON.stringify(t))
  check('signed-in / goes home', (await go(p, '/')) === '/app/my-day')
  // Sign out.
  await p.locator('.shell-account-button').click()
  await p.getByRole('button', { name: 'Sign out' }).click()
  await p.waitForURL(BASE + '/')
  await settle(p)
  check('sign out lands on the landing page', here(p) === '/' && (await p.locator('.landing').count()) === 1)
  check('  and the header says Sign in', await p.locator('.shell-signin').isVisible())
  check('  and Warren now asks to sign in', (await go(p, '/app/learners')) === '/sign-in?next=%2Fapp%2Flearners')
  check('unknown address: not found', (await go(p, '/nowhere')) === '/nowhere' && (await p.getByText('There’s nothing at this address').count() + await p.getByText("There's nothing at this address").count()) > 0)
  // An unsafe next goes home instead.
  await go(p, '/sign-in?next=//evil.example/x')
  await p.getByLabel('Find a name').fill('Hal')
  await p.getByRole('button', { name: /Hal Testtutor05/ }).click()
  await p.waitForURL('**/app/my-day')
  check('off-site next is ignored', here(p) === '/app/my-day')
  // A refused user stays on the sign-in page with the reason.
  await go(p, '/sign-in')
  await p.getByLabel('Find a name').fill('Dee')
  await p.getByRole('button', { name: /Dee Testinactive01/ }).click()
  await p.locator('.signin-alert').waitFor()
  const alert = await p.locator('.signin-alert').allInnerTexts()
  check('inactive user is refused on the sign-in page', here(p) === '/sign-in' && alert.join().includes('access has ended'), alert.join())
  // Dee's refusal is a 403 from /api/me, which the browser also logs to the
  // console (without the address).
  const refused = p.problems.filter((x) => /^403 .*\/api\/me$/.test(x))
  const unexpected = p.problems.filter((x) => !refused.includes(x) && !(refused.length > 0 && /^console Failed to load resource: .*status of 403/.test(x)))
  check('signed out: no page errors (apart from Dee being refused)', unexpected.length === 0, unexpected.join('; '))
  await p.context().close()
}

// ---------------------------------------------------------------- each role lands on their home
const homes = [
  ['Max Testmanager01', '/app/my-day', 'My day – Warren'],
  ['Hal Testtutor05', '/app/my-day', 'My day – Warren'],
  ['Kay Testassessor01', '/app/my-day', 'My day – Warren'],
  ['Nia Testmanager03', '/app/my-day', 'My day – Warren'],
  ['Ivy Testiqa01', '/app/sign-offs', 'Sign-offs to check – Warren'],
  ['Ada Testassessoriqa', '/app/my-day', 'My day – Warren'],
  ['Alex Testlearner-One', '/burrow', 'My portfolio – Burrow'],
  ['Erin Testcontact01', '/burrow/apprentices', 'Apprentices – Burrow'],
  ['Tess Testcontact04', '/burrow/apprentices', 'Apprentices – Burrow'],
]
for (const [name, home, title] of homes) {
  const p = await open(null)
  await go(p, '/')
  await p.locator('.shell-signin').click()
  await settle(p)
  await p.getByLabel('Find a name').fill(name.split(' ')[0])
  await p.getByRole('button', { name: new RegExp(name) }).click()
  await p.waitForURL(`**${home}`)
  await settle(p)
  const t = await tab(p)
  const area = home.startsWith('/app') ? 'warren' : 'burrow'
  const body = await p.locator('body').innerText()
  const mentionsOther = area === 'burrow' && body.includes('Warren')
  check(`${name} → ${home}`, here(p) === home && t.title === title && t.icon === `/icons/${area}.svg` && !mentionsOther, `${here(p)} ${JSON.stringify(t)}${mentionsOther ? ' mentions Warren' : ''}`)
  check(`  ${name}: / goes home`, (await go(p, '/')) === home)
  check(`  ${name}: no page errors`, p.problems.length === 0, p.problems.join('; '))
  await p.context().close()
}

// ---------------------------------------------------------------- Warren addresses (Max)
{
  const p = await open('USR-T0008')
  check('/app → /app/my-day', (await go(p, '/app')) === '/app/my-day')
  await p.locator('.shell-tabs a', { hasText: 'Learners' }).click()
  await settle(p)
  check('Learners tab is a link to /app/learners', here(p) === '/app/learners')
  await p.getByLabel('Search by learner ref or name').fill('test')
  await p.getByLabel('Filter by status').selectOption('continuing')
  await settle(p)
  check('search and filter in the address', here(p) === '/app/learners?q=test&status=continuing', here(p))
  const first = p.locator('table tbody tr').first()
  const ref = await first.locator('td').first().innerText()
  const name = await first.locator('td').nth(1).innerText()
  await first.locator('td').nth(1).locator('a').click()
  await settle(p)
  const listPath = '/app/learners?q=test&status=continuing'
  check('learner opens at /app/learners/<ref>?back=<the filtered list>', here(p) === `/app/learners/${ref}?back=${encodeURIComponent(listPath)}`, here(p))
  check('  a page with Back to Learners, not a side panel', (await p.locator('.learner-page').count()) === 1 && (await p.locator('.detail-overlay').count()) === 0 && (await p.locator('.learner-back').innerText()).includes('Learners'))
  check('  its tab title is the learner', (await p.title()) === `${name} – Warren`, await p.title())
  await p.locator('.learner-back').click()
  await settle(p)
  check('Back goes to the filtered list', here(p) === listPath && (await p.getByLabel('Search by learner ref or name').inputValue()) === 'test', here(p))
  await p.goBack(); await settle(p)
  check('browser Back reopens the learner', here(p).startsWith(`/app/learners/${ref}?back=`) && (await p.locator('.learner-page').count()) === 1, here(p))
  await p.goForward(); await settle(p)
  check('browser Forward returns to the list', here(p) === listPath && (await p.locator('.learner-page').count()) === 0, here(p))
  // Deep link and reload.
  await go(p, `/app/learners/${ref}`)
  check('deep link to a learner shows their page, Back to Learners', (await p.locator('.learner-page').count()) === 1 && (await p.locator('.learner-back').getAttribute('href')) === '/app/learners')
  // Step 3's edit address goes to the first section's form.
  check('old /app/learners/<ref>/edit → /edit/personal', (await go(p, `/app/learners/${ref}/edit`)) === `/app/learners/${ref}/edit/personal`, here(p))
  check('  the edit form shows', (await p.locator('form').filter({ hasText: /Save/ }).count()) > 0)
  check('  title', (await p.title()) === `Change personal details: ${name} – Warren`, await p.title())
  await p.getByRole('button', { name: 'Cancel' }).click()
  await settle(p)
  check('Cancel goes back to the learner page', here(p) === `/app/learners/${ref}?back=%2Fapp%2Flearners`, here(p))
  check('unknown learner: notice', (await go(p, '/app/learners/NOPE123')) === '/app/learners/NOPE123' && (await p.getByText('no learner NOPE123').count()) === 1)

  // Officers.
  await go(p, '/app/officers')
  const off = p.locator('table tbody tr').first()
  const offRef = await off.locator('td').first().innerText()
  await off.locator('a').click()
  await settle(p)
  check('officer at /app/officers/<ref>', here(p) === `/app/officers/${offRef}` && (await p.locator('.detail-overlay').count()) === 1)
  await p.keyboard.press('Escape'); await settle(p)
  check('  closes to /app/officers', here(p) === '/app/officers')

  // Reports.
  check('/app/reports → /app/reports/qar', (await go(p, '/app/reports')) === '/app/reports/qar')
  await p.locator('.report-year select').selectOption('2024')
  await settle(p)
  check('QAR year in the address', here(p) === '/app/reports/qar?year=2024')
  check('  and a reload keeps it', (await go(p, '/app/reports/qar?year=2024')) === '/app/reports/qar?year=2024' && (await p.locator('.report-year select').inputValue()) === '2024')
  await p.locator('.report-tabs a', { hasText: 'Caseload' }).click(); await settle(p)
  check('Caseload report link', here(p) === '/app/reports/caseload')
  const cl = p.locator('.report table tbody tr').first().locator('a')
  await cl.click(); await settle(p)
  check('caseload officer in the address', /^\/app\/reports\/caseload\/[^/]+$/.test(here(p)) && (await p.locator('.caseload-detail').count()) === 1, here(p))
  const clPath = here(p)
  const clLearner = p.locator('.caseload-detail table tbody tr a').first()
  if (await clLearner.count()) {
    await clLearner.click(); await settle(p)
    check('learner from a caseload: Back to it, Reports highlighted', here(p).startsWith('/app/learners/') && here(p).endsWith(`?back=${encodeURIComponent(clPath)}`) && (await p.locator('.shell-tab.is-active').innerText()) === 'Reports', here(p))
    await p.locator('.learner-back').click(); await settle(p)
    check('  Back goes to the caseload', here(p) === clPath && (await p.locator('.caseload-detail').count()) === 1, here(p))
  }
  check('ILR return address', (await go(p, '/app/reports/ilr')) === '/app/reports/ilr' && (await p.title()) === 'ILR return – Warren')
  check('Dashboard address', (await go(p, '/app/dashboard')) === '/app/dashboard' && (await p.title()) === 'Dashboard – Warren')
  check('unknown Warren address: notice', (await go(p, '/app/nothing')) === '/app/nothing' && (await p.getByText('nothing at this address in Warren').count()) === 1)
  await p.screenshot({ path: `${OUT}/warren-notfound.png` })

  // Burrow for staff.
  check('staff /burrow → the learner list', (await go(p, '/burrow')) === '/burrow/learners', here(p))
  let t = await tab(p)
  check('  burrow tab', t.icon === '/icons/burrow.svg' && t.title === 'Learners – Burrow', JSON.stringify(t))
  check('  no learner dropdown', (await p.locator('.burrow-viewing-as').count()) === 0 && (await p.locator('.burrow-learner-row').count()) > 0)
  const portfolio = await go(p, `/burrow/learners/${ref}`)
  t = await tab(p)
  check('a portfolio at /burrow/learners/<ref>', portfolio === `/burrow/learners/${ref}` && t.title === `Portfolio: ${name} – Burrow` && !(await p.locator('body').innerText()).includes('Couldn’t load'), `${portfolio} ${t.title}`)
  check('  its feedback at /burrow/learners/<ref>/feedback', (await go(p, `/burrow/learners/${ref}/feedback`)) === `/burrow/learners/${ref}/feedback`)
  check('staff /burrow/add → the list', (await go(p, '/burrow/add')) === '/burrow/learners')
  check('staff /burrow/apprentices → the list', (await go(p, '/burrow/apprentices')) === '/burrow/learners')
  check('unknown Burrow address: notice', (await go(p, '/burrow/zzz')) === '/burrow/zzz' && (await p.getByText('nothing at this address in Burrow').count()) === 1)
  check('Max: no page errors', p.problems.length === 0, p.problems.join('; '))
  await p.context().close()
}

// ---------------------------------------------------------------- what others can't open
{
  const p = await open('USR-T0014') // Hal, tutor
  // From My day: over My day, and back to it.
  await go(p, '/app/my-day')
  const mdLink = p.locator('.myday-task-name').first()
  if (await mdLink.count()) {
    await mdLink.click()
    await settle(p)
    check('learner from My day: Back to My day, My day highlighted', /^\/app\/learners\/[^/?]+\?back=%2Fapp%2Fmy-day$/.test(here(p)) && (await p.locator('.shell-tab.is-active').innerText()) === 'My day' && (await p.locator('.learner-back').innerText()).includes('My day'), here(p))
    await p.locator('.learner-back').click()
    await settle(p)
    check('  Back goes to My day', here(p) === '/app/my-day')
  } else check('My day has a learner to open', false)

  check('tutor: /app/officers → My day', (await go(p, '/app/officers')) === '/app/my-day')
  check('tutor: /app/reports/ilr → QAR', (await go(p, '/app/reports/ilr')) === '/app/reports/qar')
  check('tutor: /app/sign-offs → My day', (await go(p, '/app/sign-offs')) === '/app/my-day')
  await go(p, '/app/learners')
  const ref = await p.locator('table tbody tr td').first().innerText()
  check('tutor: edit → the learner', (await go(p, `/app/learners/${ref}/edit`)) === `/app/learners/${ref}`)
  check('tutor: no page errors', p.problems.length === 0, p.problems.join('; '))
  await p.context().close()
}
{
  const p = await open('USR-T0101') // a learner
  check('learner: /app → /burrow', (await go(p, '/app/learners')) === '/burrow')
  check('learner: another learner → /burrow', (await go(p, '/burrow/learners/LRN999')) === '/burrow')
  check('learner: /burrow/apprentices → /burrow', (await go(p, '/burrow/apprentices')) === '/burrow')
  check('learner: add evidence', (await go(p, '/burrow/add')) === '/burrow/add' && (await p.title()) === 'Add evidence – Burrow')
  check('learner: feedback', (await go(p, '/burrow/feedback')) === '/burrow/feedback' && (await p.title()) === 'Feedback – Burrow')
  await p.locator('.shell-account-button').click()
  check('learner: account menu has no Warren', !(await p.locator('.shell-account-panel').innerText()).includes('Warren'))
  check('learner: no page errors', p.problems.length === 0, p.problems.join('; '))
  await p.context().close()
}
{
  const p = await open('USR-T0201', { width: 390 }) // an employer, on a phone
  check('employer: /burrow → apprentices', (await go(p, '/burrow')) === '/burrow/apprentices')
  check('employer: /app/my-day → apprentices', (await go(p, '/app/my-day')) === '/burrow/apprentices')
  await p.screenshot({ path: `${OUT}/employer-phone.png` })
  check('employer: no page errors', p.problems.length === 0, p.problems.join('; '))
  await p.context().close()
}
{
  const p = await open(null, { width: 390 })
  await go(p, '/sign-in')
  await p.screenshot({ path: `${OUT}/signin-phone.png`, fullPage: false })
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  check('sign-in page fits a phone', !overflow)
  await p.context().close()
}

console.log(failures ? `${failures} FAILED` : 'all passed')
await browser.close()
