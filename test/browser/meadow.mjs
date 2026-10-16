// Meadow's people pipeline board in the browser (server/meadow.js,
// src/meadow/MeadowApp.jsx).
//   Grace  USR-T3001  ORG-T003 manager: the board on the test journeys'
//                     seed (fixed counts), in Meadow slate blue
//   Max    USR-T0008  ORG-T001 manager: only his organisation's people
//   Faye   USR-T3003  ORG-T003 tutor: the API refuses her, /meadow sends her
//                     home, and her account menu has no Meadow
//   Nobody signed in: the front door's Meadow "Sign in" goes to the sign-in
//                     page, then on to /meadow
// Reads only: changes no data. Run against the test servers
// (test/start-test-servers.sh); see setup.mjs.
import { BASE, OUT, launch } from './setup.mjs'
import path from 'node:path'

const B = BASE
let failures = 0
const check = (label, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`) }
async function api(user, url) {
  const res = await fetch(`${B}${url}`, { headers: { Cookie: `dev_user_id=${user}` } })
  return { status: res.status, body: await res.json().catch(() => null) }
}
const stagesOf = (board) => board.bands.flatMap((b) => b.stages)
const SEED = { New: 5, Confirmed: 4, Contacted: 7, Matched: 7, Interviewing: 5, Offered: 4, 'Initial assessment': 12 }

// ---------------------------------------------------------------- the API
const grace = await api('USR-T3001', '/api/meadow/board')
const board = grace.body ?? { bands: [] }
const counts = Object.fromEntries(stagesOf(board).map((s) => [s.name, s.count]))
const seeded = grace.status === 200 && Object.entries(SEED).every(([k, v]) => counts[k] === v) && board.notProceeding === 356
check(seeded ? 'a manager gets the seeded board' : "ORG-T003 isn't the seeded test journeys: run the test reset first", seeded, `${grace.status} ${JSON.stringify(counts)} ${board.notProceeding}`)
const max = await api('USR-T0008', '/api/meadow/board')
check("another organisation's manager gets only theirs (ORG-T001: 9 open, 1 not proceeding)", max.status === 200 && max.body.open === 9 && max.body.notProceeding === 1,
  `${max.status} ${max.body?.open} ${max.body?.notProceeding}`)
const faye = await api('USR-T3003', '/api/meadow/board')
check('a tutor is refused', faye.status === 403, faye.status)

// ---------------------------------------------------------------- the browser
const browser = await launch()
const problems = []
async function pageAs(user, viewport = { width: 1440, height: 1000 }) {
  const ctx = await browser.newContext({ viewport })
  if (user) await ctx.addCookies([{ name: 'dev_user_id', value: user, domain: 'localhost', path: '/api' }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => problems.push(e.message))
  p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) problems.push(`${r.status()} ${r.url()}`) })
  return p
}
const here = (p) => { const u = new URL(p.url()); return `${u.pathname}${u.search}` }

try {
  // Grace: the board.
  const g = await pageAs('USR-T3001')
  await g.goto(`${B}/meadow`)
  await g.locator('.meadow-board').waitFor({ timeout: 60000 })
  const header = await g.locator('.shell-header').evaluate((el) => getComputedStyle(el).backgroundColor)
  check('Meadow in the shared header, slate blue (#2b3d60)', (await g.locator('.shell-area').innerText()) === 'Meadow' && header === 'rgb(43, 61, 96)', header)
  check('  tab: "People pipeline – Meadow" with the Meadow icon', (await g.title()) === 'People pipeline – Meadow' &&
    (await g.locator('link[rel="icon"]').getAttribute('href')) === '/icons/meadow.svg', await g.title())
  check('  the Pipeline tab is the current page', (await g.locator('.shell-tabs a[aria-current="page"]').innerText()) === 'Pipeline')
  const bands = await g.locator('.meadow-band h2').allTextContents()
  check('three bands: Getting to know them, Matching, Starting', bands.join() === 'Getting to know them,Matching,Starting', bands.join())
  const columns = await g.locator('.meadow-column').evaluateAll((cols) => cols.map((c) => ({
    name: c.querySelector('h3').textContent, count: Number(c.querySelector('.meadow-count').textContent), cards: c.querySelectorAll('.meadow-card').length,
  })))
  check('  a column per stage, in order, without Not proceeding', columns.map((c) => c.name).join() ===
    'New,Confirmed,Contacted,Matched,Interviewing,Offered,Initial assessment,Enrolled', columns.map((c) => c.name).join())
  check('  each column shows the API\'s count and that many cards', columns.every((c) => c.count === counts[c.name] && c.cards === c.count),
    columns.map((c) => `${c.name} ${c.count}/${c.cards}`).join(', '))
  const summary = await g.locator('.meadow-summary').innerText()
  check('"356 not proceeding" as a count, with 44 in the pipeline', /\b356 not proceeding\b/.test(summary) && /\b44 people in the pipeline\b/.test(summary), summary)
  const text = await g.locator('.meadow-main').innerText()
  check('no funnel or "% carry on"', !/carr(y|ied) on|%/.test(text))
  const first = g.locator('.meadow-card').first()
  const card = await first.innerText()
  check('a card: name, interests, who has them, days in stage, email consent', /in stage|Moved here today/.test(card) && /OK to email|No email consent/.test(card) &&
    (await first.locator('.meadow-tags li').count()) > 0 && /^With |Nobody looking after them yet/m.test(card), card.replace(/\n/g, ' | '))
  const enrolledNote = await g.locator('.meadow-column[data-stage="ENROLLED"] .meadow-column-note').innerText()
  check('  Enrolled says it\'s the last 30 days', enrolledNote === 'Last 30 days', enrolledNote)
  check('the page itself doesn\'t scroll sideways at 1440 px', await g.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  await g.screenshot({ path: path.join(OUT, 'meadow-board.png'), fullPage: true })
  // The board scrolls in its box at this width: the Starting band too.
  await g.locator('.meadow-board').evaluate((el) => { el.scrollLeft = el.scrollWidth })
  await g.screenshot({ path: path.join(OUT, 'meadow-board-starting.png'), fullPage: true })
  await g.locator('.shell-account-button').click()
  check('Grace\'s account menu links to Meadow', (await g.locator('.shell-account-links a', { hasText: 'Meadow' }).count()) === 1)

  // Grace at phone width: the board scrolls in its box, not the page.
  const phone = await pageAs('USR-T3001', { width: 390, height: 844 })
  await phone.goto(`${B}/meadow`)
  await phone.locator('.meadow-board').waitFor({ timeout: 60000 })
  const widths = await phone.evaluate(() => ({ page: document.documentElement.scrollWidth, view: window.innerWidth,
    board: document.querySelector('.meadow-board').scrollWidth, box: document.querySelector('.meadow-board').clientWidth }))
  check('phone width: no sideways page scroll, the board scrolls in its box', widths.page <= widths.view && widths.board > widths.box, JSON.stringify(widths))
  await phone.screenshot({ path: path.join(OUT, 'meadow-board-phone.png') })

  // Max: his own organisation.
  const m = await pageAs('USR-T0008')
  await m.goto(`${B}/meadow`)
  await m.locator('.meadow-board').waitFor({ timeout: 60000 })
  const mSummary = await m.locator('.meadow-summary').innerText()
  check('Max sees ORG-T001\'s board (9 people, 1 not proceeding)', /\b9 people in the pipeline\b/.test(mSummary) && /\b1 not proceeding\b/.test(mSummary) &&
    (await m.locator('.meadow-card').count()) === 9, mSummary)

  // Faye: not for tutors.
  const f = await pageAs('USR-T3003')
  await f.goto(`${B}/meadow`)
  await f.waitForURL((u) => !u.pathname.startsWith('/meadow'), { timeout: 60000 })
  check('a tutor opening /meadow is sent to her home', here(f).startsWith('/app'), here(f))
  await f.locator('.shell-account-button').click()
  check('  and her account menu has no Meadow', (await f.locator('.shell-account-panel a', { hasText: 'Meadow' }).count()) === 0)

  // Nobody signed in: the front door.
  const n = await pageAs(null)
  await n.goto(`${B}/`)
  const link = n.locator('.landing-product-meadow .landing-product-signin')
  check('front door: Meadow has a Sign in link to /sign-in?next=/meadow', (await link.getAttribute('href')) === '/sign-in?next=%2Fmeadow')
  check('  and no "Coming soon"', (await n.locator('.landing-product-meadow .landing-product-soon').count()) === 0)
  await link.click()
  await n.waitForURL('**/sign-in?next=%2Fmeadow')
  await n.getByLabel('Find a name').fill('Grace')
  await n.getByRole('button', { name: /Grace Testmanager04/ }).click()
  await n.waitForURL('**/meadow', { timeout: 60000 })
  await n.locator('.meadow-board').waitFor({ timeout: 60000 })
  check('  signing in as a manager goes on to the board', here(n) === '/meadow', here(n))

  check('no page errors or server errors', problems.length === 0, problems.join(' | '))
} finally {
  await browser.close()
}
console.log(failures ? `${failures} failed` : 'all passed')
process.exit(failures ? 1 : 0)
