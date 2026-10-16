// Meadow's person record in the browser (server/meadowPerson.js,
// src/meadow/PersonRecord.jsx), on the test journeys' seed.
//   Grace  USR-T3001  ORG-T003 manager: opens Poppy Testwood (LEAD-J0005,
//                     Offered) from her card on the board, sees every
//                     section with the seeded values, goes back to the
//                     board; Finley (LEAD-J0364) shows his close reason; the
//                     record at phone width
//   Max    USR-T0008  ORG-T001 manager: Poppy isn't his organisation's, so
//                     the API says 404 and the page "couldn't find" her
//   Faye   USR-T3003  ORG-T003 tutor: the API refuses her
// Each opening adds a test row to the view log (CRM_DB.CRM.RECORD_VIEW,
// ISTESTDATA TRUE, cleared by the test reset); nothing else changes. Run
// against the test servers (test/start-test-servers.sh); see setup.mjs.
import { BASE, OUT, launch } from './setup.mjs'
import path from 'node:path'

const B = BASE
let failures = 0
const check = (label, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`) }
async function api(user, url) {
  const res = await fetch(`${B}${url}`, { headers: { Cookie: `dev_user_id=${user}` } })
  return { status: res.status, body: await res.json().catch(() => null) }
}

// ---------------------------------------------------------------- the API
const grace = await api('USR-T3001', '/api/meadow/people/LEAD-J0005')
const seeded = grace.status === 200 && grace.body?.name === 'Poppy Testwood' && grace.body?.journey?.stage === 'Offered'
check(seeded ? 'a manager gets Poppy\'s record' : "LEAD-J0005 isn't the seeded Poppy Testwood at Offered: run the test reset first", seeded,
  `${grace.status} ${grace.body?.name ?? grace.body?.error} ${grace.body?.journey?.stage}`)
const max = await api('USR-T0008', '/api/meadow/people/LEAD-J0005')
check("another organisation's manager gets 404, the same as no such person", max.status === 404 &&
  (await api('USR-T3001', '/api/meadow/people/LEAD-NONE')).status === 404, max.status)
check('  and nothing of hers', !JSON.stringify(max.body).includes('Poppy'))
const faye = await api('USR-T3003', '/api/meadow/people/LEAD-J0005')
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
const here = (p) => new URL(p.url()).pathname
const section = (p, name) => p.locator(`section[aria-label="${name}"]`)

try {
  const g = await pageAs('USR-T3001')
  await g.goto(`${B}/meadow`)
  await g.locator('.meadow-board').waitFor({ timeout: 60000 })
  await g.locator('.meadow-column[data-stage="OFFERED"] .meadow-card-link', { hasText: 'Poppy Testwood' }).click()
  await g.waitForURL('**/meadow/people/LEAD-J0005', { timeout: 30000 })
  await g.locator('.person-header h1').waitFor({ timeout: 60000 })
  check('a card opens the person\'s record', here(g) === '/meadow/people/LEAD-J0005', here(g))
  check('  tab: "Poppy Testwood – Meadow"', (await g.title()) === 'Poppy Testwood – Meadow', await g.title())
  check('  her name, age, district and who has her', (await g.locator('.person-header h1').innerText()) === 'Poppy Testwood' &&
    /Age 22/.test(await g.locator('.person-meta').innerText()) && /WR13/.test(await g.locator('.person-meta').innerText()) &&
    /With Owen Testmanager05/.test(await g.locator('.person-meta').innerText()), await g.locator('.person-meta').innerText())
  const stages = await g.locator('.person-stage').allInnerTexts()
  check('  the stage bar: the 8 stages, Offered current', stages.join() === 'New,Confirmed,Contacted,Matched,Interviewing,Offered,Initial assessment,Enrolled' &&
    (await g.locator('.person-stage[aria-current="step"]').innerText()) === 'Offered', stages.join())
  const told = await section(g, 'What they’ve told us').innerText()
  check('what she\'s told us: working, full time, up to 10 miles by bus or train, tech support', /Working/.test(told) && /Full time/.test(told) &&
    /Up to 10 miles by bus or train/.test(told) && /tech support/.test(told) && /IT user support technicians/.test(told), told.replace(/\n/g, ' | '))
  check('jobs that fit: 3, with why, never ranked by pay', (await section(g, 'Jobs that fit').locator('.person-match').count()) === 3 &&
    /Why it fits: Interest: it · Hours: full time/.test(await section(g, 'Jobs that fit').innerText()) &&
    /never ranked by pay/.test(await section(g, 'Jobs that fit').innerText()))
  check('history: 9 entries, newest first ("Moved to Offered")', (await section(g, 'History').locator('.person-event').count()) === 9 &&
    (await section(g, 'History').locator('.person-event-what').first().innerText()) === 'Moved to Offered')
  const contact = await section(g, 'Contact details').innerText()
  check('contact details: email, mobile, date of birth, postcode', /poppy\.testwood5@example\.com/.test(contact) && /07700900005/.test(contact) &&
    /02\/11\/2003 \(22\)/.test(contact) && /WR13 0GU/.test(contact), contact.replace(/\n/g, ' | '))
  const consent = await section(g, 'Consent').innerText()
  check('consent in plain words: OK to email, phone and news not asked', /OK to email/.test(consent) && /Phone: not asked/.test(consent) &&
    /News emails: not asked/.test(consent) &&
    /Saw the privacy notice/.test(consent), consent.replace(/\n/g, ' | '))
  check('tasks: "Next step with Poppy", due 19/10/2026', /Next step with Poppy/.test(await section(g, 'Tasks').innerText()) &&
    /Due 19\/10\/2026/.test(await section(g, 'Tasks').innerText()))
  check('placements: Teststone Digital Ltd, IT solutions technician, Offered', /Teststone Digital Ltd/.test(await section(g, 'Placements').innerText()) &&
    /IT solutions technician, level 3/.test(await section(g, 'Placements').innerText()))
  check('read only: no buttons to log a call, add a task or move stage', (await g.locator('.person button').count()) === 0)
  check('the page doesn\'t scroll sideways at 1440 px', await g.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  await g.screenshot({ path: path.join(OUT, 'meadow-person.png'), fullPage: true })
  await g.getByRole('link', { name: '← Back to the pipeline' }).click()
  await g.locator('.meadow-board').waitFor({ timeout: 60000 })
  check('"Back to the pipeline" goes back to the board', here(g) === '/meadow')

  // Finley: closed, with his reason.
  await g.goto(`${B}/meadow/people/LEAD-J0364`)
  await g.locator('.person-status').waitFor({ timeout: 60000 })
  check('a closed journey: "Not proceeding: Found other work", no stage bar', /^Not proceeding: Found other work/.test(await g.locator('.person-status').innerText()) &&
    (await g.locator('.person-stages').count()) === 0, await g.locator('.person-status').innerText())

  // At phone width.
  const phone = await pageAs('USR-T3001', { width: 390, height: 844 })
  await phone.goto(`${B}/meadow/people/LEAD-J0005`)
  await phone.locator('.person-header h1').waitFor({ timeout: 60000 })
  check('phone width: no sideways page scroll', await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
  await phone.screenshot({ path: path.join(OUT, 'meadow-person-phone.png'), fullPage: true })

  // Max: not his organisation's.
  const m = await pageAs('USR-T0008')
  await m.goto(`${B}/meadow/people/LEAD-J0005`)
  await m.locator('.person-missing').waitFor({ timeout: 60000 })
  check('Max: "We couldn’t find this person", nothing of Poppy\'s', (await m.locator('.person-missing').innerText()) === 'We couldn’t find this person' &&
    !(await m.locator('main').innerText()).includes('Poppy'))

  check('no page errors or server errors', problems.length === 0, problems.join(' | '))
} finally {
  await browser.close()
}
console.log(failures ? `${failures} failed` : 'all passed')
process.exit(failures ? 1 : 0)
