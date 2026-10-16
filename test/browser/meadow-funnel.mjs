// Meadow's drop-off report in the browser (server/meadowFunnel.js,
// src/meadow/FunnelReport.jsx), on the test journeys' seed.
//   Grace  USR-T3001  ORG-T003 manager: the Reports tab in Meadow's header
//                     opens the report: the three bands, the eight stages
//                     with the seeded figures, why people left (college as
//                     a good outcome), the totals, and the outcome box with
//                     no figure; at phone width too
//   Max    USR-T0008  ORG-T001 manager: only his organisation's 10
//   Faye   USR-T3003  ORG-T003 tutor: the API refuses her, /meadow/reports
//                     sends her home
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
const REACHED = [500, 408, 345, 254, 179, 142, 119, 100]
const LEFT = [87, 59, 84, 68, 32, 19, 7, 0]

// ---------------------------------------------------------------- the API
const grace = await api('USR-T3001', '/api/meadow/funnel')
const seeded = grace.status === 200 && grace.body?.totals?.joined === 500 && grace.body?.totals?.notProceeding === 356
check(seeded ? 'a manager gets the seeded report' : "ORG-T003 isn't the seeded test journeys: run the test reset first", seeded, `${grace.status} ${JSON.stringify(grace.body?.totals)}`)
check('  and it reconciles', grace.body && Object.values(grace.body.reconciles).every(Boolean), JSON.stringify(grace.body?.reconciles))
const max = await api('USR-T0008', '/api/meadow/funnel')
check("another organisation's manager gets only theirs (ORG-T001: 10 joined)", max.status === 200 && max.body.totals.joined === 10, `${max.status} ${max.body?.totals?.joined}`)
check('a tutor is refused', (await api('USR-T3003', '/api/meadow/funnel')).status === 403)

// ---------------------------------------------------------------- the browser
const browser = await launch()
const problems = []
async function pageAs(user, viewport = { width: 1440, height: 1000 }) {
  const ctx = await browser.newContext({ viewport })
  await ctx.addCookies([{ name: 'dev_user_id', value: user, domain: 'localhost', path: '/api' }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => problems.push(e.message))
  p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) problems.push(`${r.status()} ${r.url()}`) })
  return p
}
const here = (p) => new URL(p.url()).pathname

try {
  const g = await pageAs('USR-T3001')
  await g.goto(`${B}/meadow`)
  await g.locator('.meadow-board').waitFor({ timeout: 60000 })
  const tabs = await g.locator('.shell-tabs a').allInnerTexts()
  check('Meadow\'s header has Pipeline and Reports tabs', tabs.join() === 'Pipeline,Reports', tabs.join())
  await g.locator('.shell-tabs a', { hasText: 'Reports' }).click()
  await g.waitForURL('**/meadow/reports', { timeout: 30000 })
  await g.locator('.funnel-bands').waitFor({ timeout: 60000 })
  check('the Reports tab opens the report, as the current page', here(g) === '/meadow/reports' &&
    (await g.locator('.shell-tabs a[aria-current="page"]').innerText()) === 'Reports')
  check('  tab: "Reports – Meadow", slate blue header', (await g.title()) === 'Reports – Meadow' &&
    (await g.locator('.shell-header').evaluate((el) => getComputedStyle(el).backgroundColor)) === 'rgb(43, 61, 96)', await g.title())
  const bands = await g.locator('.funnel-band h2').allTextContents()
  check('three bands: Getting to know them, Matching, Starting', bands.join() === 'Getting to know them,Matching,Starting', bands.join())
  const rows = await g.locator('.funnel-row').evaluateAll((rs) => rs.map((r) => ({
    name: r.querySelector('h3').textContent,
    reached: Number(r.querySelector('.funnel-stage strong').textContent),
    bar: r.querySelector('.funnel-bar').textContent,
    left: Number(r.querySelector('.funnel-left > p strong')?.textContent ?? 0),
  })))
  check('the eight stages in order', rows.map((r) => r.name).join() === 'New,Confirmed,Contacted,Matched,Interviewing,Offered,Initial assessment,Enrolled',
    rows.map((r) => r.name).join())
  check('  reached per stage', rows.map((r) => r.reached).join() === REACHED.join(), rows.map((r) => r.reached).join())
  check('  left from each stage', rows.map((r) => r.left).join() === LEFT.join(), rows.map((r) => r.left).join())
  check('  "% carried on" on each bar, as the API says', rows.every((r, i) => r.bar === (i === rows.length - 1 ? 'the last stage' : `${grace.body.bands.flatMap((b) => b.stages)[i].carriedOn}% carried on`)),
    rows.map((r) => r.bar).join(' | '))
  check('  the left-from counts add up to the 356 not proceeding', rows.reduce((n, r) => n + r.left, 0) === 356)
  const summary = await g.locator('.funnel-summary').innerText()
  check('totals: 500 joined, 100 enrolled, 44 in progress, 356 not proceeding, 9 chose college', /500 joined/.test(summary) && /100 enrolled/.test(summary) &&
    /44 in progress/.test(summary) && /356 not proceeding, of whom 9 chose college or sixth form/.test(summary), summary.replace(/\n/g, ' '))
  const contacted = g.locator('.funnel-row[data-stage="CONTACTED"]')
  const good = contacted.locator('li.is-positive')
  check('"Chose college or sixth form" is shown as a good outcome', (await good.count()) === 1 && /Chose college or sixth form/.test(await good.innerText()) &&
    /Good outcome/.test(await good.innerText()), await good.innerText().catch(() => ''))
  check('  and only that reason is', (await g.locator('li.is-positive').evaluateAll((ls) => ls.every((l) => l.textContent.includes('Chose college or sixth form')))))
  const outcome = await g.locator('.funnel-outcome').innerText()
  check('the outcome box: available once Warren\'s outcomes are linked, no figure', /First 12 weeks in learning/i.test(outcome) &&
    /Available once Warren’s outcomes are linked/.test(outcome) && !/\d/.test(outcome.replace('12', '')), outcome.replace(/\n/g, ' | '))
  check('the page doesn\'t scroll sideways at 1440 px', await g.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  await g.screenshot({ path: path.join(OUT, 'meadow-funnel.png'), fullPage: true })

  const phone = await pageAs('USR-T3001', { width: 390, height: 844 })
  await phone.goto(`${B}/meadow/reports`)
  await phone.locator('.funnel-bands').waitFor({ timeout: 60000 })
  check('phone width: no sideways page scroll', await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  await phone.screenshot({ path: path.join(OUT, 'meadow-funnel-phone.png'), fullPage: true })

  const m = await pageAs('USR-T0008')
  await m.goto(`${B}/meadow/reports`)
  await m.locator('.funnel-summary').waitFor({ timeout: 60000 })
  check('Max sees ORG-T001\'s report (10 joined)', /10 joined/.test(await m.locator('.funnel-summary').innerText()))

  const f = await pageAs('USR-T3003')
  await f.goto(`${B}/meadow/reports`)
  await f.waitForURL((u) => !u.pathname.startsWith('/meadow'), { timeout: 60000 })
  check('a tutor opening /meadow/reports is sent to her home', here(f).startsWith('/app'), here(f))

  check('no page errors or server errors', problems.length === 0, problems.join(' | '))
} finally {
  await browser.close()
}
console.log(failures ? `${failures} failed` : 'all passed')
process.exit(failures ? 1 : 0)
