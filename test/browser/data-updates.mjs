// Scheduling step 4 in the browser: when data was last updated.
//   Max   USR-T0008  manager: the Data updates tile on My day, from
//                    GET /api/jobs/status (times and outcomes only)
//   Tina  USR-T0004  tutor: no tile, and the API refuses her; the
//                    Vacancies tab says when adverts were updated
// The tile's states that can't be made on demand (overdue, failed,
// running, never run) and out-of-date adverts are checked by replacing the
// API's answer in the browser with a fixed one. Reads only: changes no data.
// Run against the test servers (test/start-test-servers.sh); see setup.mjs.
import { BASE, OUT, launch } from './setup.mjs'
import { ukDateTimeText, ukWhenText } from '../../src/ukTime.js'
import path from 'node:path'

const B = BASE
let failures = 0
const check = (label, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`) }
async function api(user, url) {
  const res = await fetch(`${B}${url}`, { headers: { Cookie: `dev_user_id=${user}` } })
  return { status: res.status, body: await res.json().catch(() => null) }
}

// ---------------------------------------------------------------- the API
const max = await api('USR-T0008', '/api/jobs/status')
const jobs = max.body ?? []
check('a manager gets the four jobs, in order', max.status === 200 && jobs.map((j) => j.job).join() === 'vacancies-full,vacancies-new,companies-refresh,skills',
  `${max.status} ${jobs.map((j) => j.job).join()}`)
check('  only times and outcomes: no error, counts, host or who started it',
  jobs.every((j) => Object.keys(j).sort().join() === 'job,label,lastResult,lastRun,lastSuccess,overdue,short'), Object.keys(jobs[0] ?? {}).join())
check('  times are ISO instants', jobs.every((j) => j.lastRun === null || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(j.lastRun)), jobs[0]?.lastRun)
const tinaApi = await api('USR-T0004', '/api/jobs/status')
check('a tutor is refused', tinaApi.status === 403, tinaApi.status)
const filters = (await api('USR-T0004', '/api/vacancies/filters')).body

// ---------------------------------------------------------------- the browser
const browser = await launch()
const problems = []
async function pageAs(user) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await ctx.addCookies([{ name: 'dev_user_id', value: user, domain: 'localhost', path: '/api' }])
  const p = await ctx.newPage()
  p.on('pageerror', (e) => problems.push(e.message))
  p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) problems.push(`${r.status()} ${r.url()}`) })
  return p
}
const shot = (p, name) => p.screenshot({ path: path.join(OUT, `data-updates-${name}.png`), fullPage: true })
const tile = (p) => p.locator('.myday-tile-data')

try {
  // Max: the real statuses.
  const m = await pageAs('USR-T0008')
  await m.goto(`${B}/app/my-day`)
  // The officer's day, then the tile inside its row (until the day has
  // loaded, the tile stands on its own).
  await m.locator('.myday-tiles-with-data').waitFor({ timeout: 60000 })
  await m.locator('.myday-tiles-with-data .myday-tile-data .myday-jobs li').first().waitFor({ timeout: 60000 })
  const rows = await tile(m).locator('.myday-job').allInnerTexts()
  const overdue = jobs.filter((j) => j.overdue).length
  check('My day: the Data updates tile lists the four jobs by their short names', rows.length === 4 &&
    ['Adverts, all', 'Adverts, new', 'Companies House', 'Skills England'].every((n, i) => rows[i].startsWith(n)), rows.join(' | '))
  check(`  "${overdue ? `${overdue} overdue` : 'All up to date'}", as the API says`,
    (await tile(m).locator('.myday-data-summary').innerText()) === (overdue ? `${overdue} overdue` : 'All up to date'))
  const full = jobs[0]
  check('  each last run in UK time', full.lastRun && rows[0].includes(ukWhenText(full.lastRun)), `${rows[0]} / ${ukWhenText(full.lastRun)}`)
  check('  a fifth tile in the row', (await m.locator('.myday-tiles-with-data > .myday-tile').count()) === 5)
  const overlaps = await tile(m).locator('.myday-job').evaluateAll((lis) => lis.filter((li) => {
    const a = li.querySelector('.myday-job-name').getBoundingClientRect()
    const b = li.querySelector('.myday-job-when').getBoundingClientRect()
    return a.right > b.left && a.bottom > b.top && b.bottom > a.top
  }).length)
  check("  no job's name runs into its time", overlaps === 0, overlaps)
  await shot(m, 'myday')

  // Max: fixed answers for the states that can't be made on demand.
  const now = Date.now()
  const H = 3600_000
  const fake = [
    { job: 'vacancies-full', label: 'Vacancies: every advert', short: 'Adverts, all', lastRun: new Date(now - 2 * H).toISOString(), lastResult: 'succeeded', lastSuccess: new Date(now - 2 * H).toISOString(), overdue: false },
    { job: 'vacancies-new', label: 'Vacancies: new adverts', short: 'Adverts, new', lastRun: new Date(now - 60_000).toISOString(), lastResult: 'running', lastSuccess: new Date(now - 2 * H).toISOString(), overdue: false },
    { job: 'companies-refresh', label: 'Companies House refresh', short: 'Companies House', lastRun: new Date(now - 1 * H).toISOString(), lastResult: 'failed', lastSuccess: new Date(now - 50 * H).toISOString(), overdue: true },
    { job: 'skills', label: 'Skills England standards and KSBs', short: 'Skills England', lastRun: null, lastResult: 'never run', lastSuccess: null, overdue: true },
  ]
  const f = await pageAs('USR-T0008')
  await f.route('**/api/jobs/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fake) }))
  await f.goto(`${B}/app/my-day`)
  await tile(f).locator('.myday-jobs li').first().waitFor({ timeout: 60000 })
  await f.locator('.myday-tiles-with-data').waitFor({ timeout: 60000 }) // the officer's day too, for the screenshot
  await tile(f).locator('.myday-jobs li').first().waitFor({ timeout: 60000 })
  const fr = await tile(f).locator('.myday-job').allInnerTexts()
  check('fixed answer: "2 overdue", in the overdue colour', (await tile(f).locator('.myday-data-summary').innerText()) === '2 overdue' &&
    (await tile(f).locator('.myday-data-summary.is-overdue').count()) === 1)
  check('  a running job says so', /Running now/.test(fr[1]), fr[1])
  check('  a failed, overdue job: overdue, failed, and when it last succeeded', /Overdue · Failed · last success /.test(fr[2]) &&
    fr[2].includes(ukWhenText(fake[2].lastSuccess)) && (await tile(f).locator('.myday-job-overdue').count()) === 2, fr[2])
  check('  a job never run: overdue, never run, no time', /—/.test(fr[3]) && /Overdue · Never run/.test(fr[3]), fr[3])
  await shot(f, 'myday-fixed')

  // Tina: no tile; the Vacancies tab says when adverts were updated.
  const t = await pageAs('USR-T0004')
  await t.goto(`${B}/app/my-day`)
  await t.locator('.myday-greeting').waitFor({ timeout: 60000 })
  await t.waitForTimeout(1500)
  check('a tutor has no Data updates tile', (await tile(t).count()) === 0)
  await t.goto(`${B}/app/vacancies`)
  await t.locator('#vacancies .section-intro').waitFor({ timeout: 60000 })
  await t.getByText('Adverts updated').waitFor({ timeout: 60000 })
  const intro = await t.locator('#vacancies .section-intro').innerText()
  check('Vacancies: "Adverts updated" with the date and time in UK time', intro.includes(`Adverts updated ${ukDateTimeText(filters.lastImport)}.`), intro)
  check(`  ${filters.lastImportStale ? 'says' : "doesn't say"} they may be out of date, as the API says`, /may be out of date/.test(intro) === filters.lastImportStale)
  await shot(t, 'vacancies')

  const s = await pageAs('USR-T0004')
  const old = new Date(Date.now() - 30 * H).toISOString()
  await s.route('**/api/vacancies/filters', async (route) => {
    const real = await (await route.fetch()).json()
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...real, lastImport: old, lastImportStale: true }) })
  })
  await s.goto(`${B}/app/vacancies`)
  await s.getByText('may be out of date').waitFor({ timeout: 60000 })
  const staleIntro = await s.locator('#vacancies .section-intro').innerText()
  check('fixed answer, 30 hours old: "They may be out of date."', staleIntro.includes(`Adverts updated ${ukDateTimeText(old)}. They may be out of date.`), staleIntro)

  check('no page errors or server errors', problems.length === 0, problems.join(' | '))
} finally {
  await browser.close()
}
console.log(failures ? `${failures} failed` : 'all passed')
process.exit(failures ? 1 : 0)
