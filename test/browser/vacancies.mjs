// Vacancies (vacancies build step 3) in the browser, with the real imported
// adverts (npm run import:vacancies -- --full first):
//   Tina  USR-T0004  tutor: searches and reads adverts, links none
//   Max   USR-T0008  manager, ORG-T001: confirms and rejects links
//   Nia   USR-T0011  manager, ORG-T002: never sees ORG-T001's links
// Advert text must only ever be text: one advert's API answer is replaced
// in the browser with a hostile one (nothing is added to the shared
// adverts). For a suggestion, the test adds a test employer named like a
// real open advert's employer, and marks it no longer used at the end; its
// link decisions stay until the next test reset.
// Run against the test servers (test/start-test-servers.sh); see setup.mjs.
import { execFileSync } from 'node:child_process'
import { BASE, OUT, REPO, launch } from './setup.mjs'
import { connect, execute, destroy } from '../../server/db.js'

const B = BASE
const RUN = Date.now().toString(36)
let failures = 0
const check = (label, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`) }
const db = await connect()
const q = (sql, binds = []) => execute(db, sql, binds)
async function api(user, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${B}${path}`, {
    method,
    headers: { Cookie: `dev_user_id=${user}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}
const browser = await launch()
const pages = []
async function pageAs(user, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport })
  await ctx.addCookies([{ name: 'dev_user_id', value: user, domain: 'localhost', path: '/api' }])
  const p = await ctx.newPage()
  p.problems = []
  p.on('pageerror', (e) => p.problems.push(e.message))
  p.on('response', (r) => { if (r.url().includes('/api/') && r.status() >= 500) p.problems.push(`${r.status()} ${r.url()}`) })
  pages.push(p)
  return p
}
const text = (p, sel) => p.locator(sel).innerText()
const card = (p, title) => p.locator('section.ui-card').filter({ has: p.getByRole('heading', { name: title, exact: true }) })

const [open] = await q(`select count(*) as N from SHARED_DB.EXT.VACANCY where CLOSINGDATE > current_timestamp() and GONEAT is null`)
if (Number(open.N) === 0) {
  console.log('FAIL there are no open adverts: run npm run import:vacancies -- --full first')
  process.exit(1)
}

// ---------------------------------------------------------------- searching (Tina)
const tina = await pageAs('USR-T0004')
await tina.goto(`${B}/app/vacancies`)
await tina.locator('#vacancies form').waitFor({ timeout: 60000 })
check('a tutor sees the Vacancies tab', (await tina.getByRole('link', { name: 'Vacancies', exact: true }).count()) === 1)
await tina.getByLabel('Near postcode').fill('s10 5aa')
await tina.getByLabel('Within').selectOption('10')
await tina.getByRole('button', { name: 'Search' }).click()
await tina.waitForURL((u) => u.search.includes('postcode=s10'), { timeout: 60000 })
await tina.locator('.vacancy-results li').first().waitFor({ timeout: 60000 })
const count = await text(tina, '.vacancy-count')
const miles = (await tina.locator('.vacancy-results li').allInnerTexts()).map((t) => Number(t.match(/([\d.]+) miles/)?.[1] ?? NaN)).filter((n) => !Number.isNaN(n))
check('searching near S10 5AA lists open adverts nearest first, within 10 miles', /within 10 miles of S10 5AA, nearest first/.test(count) &&
  miles.length > 1 && miles.every((m, i) => i === 0 || m >= miles[i - 1]) && miles.every((m) => m <= 10), `${count} | ${miles.slice(0, 6).join(', ')}`)
await tina.screenshot({ path: `${OUT}/vacancies-search.png`, fullPage: true })
await tina.goto(`${B}/app/vacancies`)
await tina.locator('#vacancies form').waitFor({ timeout: 60000 })
check('  the postcode is remembered in this browser', (await tina.getByLabel('Near postcode').inputValue()).toLowerCase() === 's10 5aa')

await tina.goto(`${B}/app/vacancies?source=NHS`)
await tina.locator('.vacancy-results li').first().waitFor({ timeout: 60000 })
const nhsItems = await tina.locator('.vacancy-results li').allInnerTexts()
const [nhsCount] = await q(`select count(*) as N from SHARED_DB.EXT.VACANCY where SOURCE = 'NHS' and CLOSINGDATE > current_timestamp() and GONEAT is null`)
check(`the NHS Jobs filter lists only NHS adverts (${nhsCount.N} open)`, nhsItems.length === Math.min(Number(nhsCount.N), 50) && nhsItems.every((t) => t.includes('NHS Jobs')), `${nhsItems.length}`)
await tina.goto(`${B}/app/vacancies?level=3&route=Business%20and%20administration`)
await tina.locator('.vacancy-count').waitFor({ timeout: 60000 })
const [lvl] = await q(`select count(*) as N from SHARED_DB.EXT.VACANCY where COURSELEVEL = 3 and ROUTE = 'Business and administration' and CLOSINGDATE > current_timestamp() and GONEAT is null`)
check('level and route filters give the matching count', (await text(tina, '.vacancy-count')).startsWith(`${lvl.N} open advert`), `${await text(tina, '.vacancy-count')} vs ${lvl.N}`)
await tina.goto(`${B}/app/vacancies?postcode=ZZ9%209ZZ`)
await tina.locator('.field-error').waitFor({ timeout: 60000 })
check('an unknown postcode is refused', /ZZ9 9ZZ isn't on the ONS postcode list/.test(await text(tina, '#vacancies')))

// ---------------------------------------------------------------- an advert (Tina)
const [advert] = await q(`select VACANCYREFERENCE as R, TITLE, EMPLOYERNAME, VACANCYURL from SHARED_DB.EXT.VACANCY
  where SOURCE = 'FAA' and CLOSINGDATE > current_timestamp() + interval '2 days' and GONEAT is null and VACANCYURL is not null
    and FULLDESCRIPTION is not null and length(EMPLOYERNAME) > 3 order by VACANCYREFERENCE limit 1`)
await tina.goto(`${B}/app/vacancies/${advert.R}`)
await tina.locator('#vacancy h2').waitFor({ timeout: 60000 })
const apply = tina.getByRole('link', { name: /View and apply on Find an apprenticeship/ })
check("an advert's page links to apply on the original site, in a new tab, without passing anything on",
  (await apply.getAttribute('href')) === advert.VACANCYURL && (await apply.getAttribute('target')) === '_blank' && /noopener/.test(await apply.getAttribute('rel')) && /noreferrer/.test(await apply.getAttribute('rel')))
check('  a tutor sees the advert and which employers it is linked to, but no way to link it',
  (await text(tina, '#vacancy h2')) === advert.TITLE && (await card(tina, 'Your employers').count()) === 1 &&
  (await tina.getByRole('button', { name: /Confirm|Reject/ }).count()) === 0 && (await tina.getByText('Link to another of your employers').count()) === 0)
const tutorTry = await api('USR-T0004', `/api/vacancies/${advert.R}/decisions`, { method: 'POST', body: { decision: 'confirmed', employerId: 'EMP-T001' } })
check('  and the API refuses a tutor linking it', tutorTry.status === 403)
await tina.screenshot({ path: `${OUT}/vacancies-advert.png`, fullPage: true })

// Advert text is only ever text: the advert's answer replaced in this
// browser by a hostile one.
const hostile = await pageAs('USR-T0004')
await hostile.route(`**/api/vacancies/TEST-HOSTILE`, (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    advert: {
      VACANCYREFERENCE: 'TEST-HOSTILE', SOURCE: 'FAA', ISOPEN: true, TITLE: 'TEST <img src=x onerror="window.__pwned=1">',
      EMPLOYERNAME: '<b>Bold</b> Ltd', DESCRIPTION: '<script>window.__pwned=2</script>Line one\nLine two',
      FULLDESCRIPTION: '<iframe src="https://evil.example"></iframe>', VACANCYURL: 'https://www.findapprenticeship.service.gov.uk/apprenticeship/TEST',
      ADDRESSES: [{ addressLine1: '<svg onload="window.__pwned=3">', postcode: 'S1 1AA' }], SKILLS: ['<a href="javascript:alert(1)">x</a>'],
    },
    links: [],
  }),
}))
await hostile.goto(`${B}/app/vacancies/TEST-HOSTILE`)
await hostile.locator('#vacancy h2').waitFor({ timeout: 60000 })
await hostile.waitForTimeout(500)
const pwned = await hostile.evaluate(() => window.__pwned ?? null)
const injected = await hostile.evaluate(() => document.querySelectorAll('#vacancy script, #vacancy iframe, #vacancy img, #vacancy svg, #vacancy a[href^="javascript"]').length)
check('advert text with scripts, frames and handlers is shown as text, and nothing runs',
  pwned === null && injected === 0 && (await text(hostile, '#vacancy h2')).includes('<img src=x onerror=') &&
  (await text(hostile, '#vacancy')).includes('<script>window.__pwned=2</script>Line one'), `pwned=${pwned} injected=${injected}`)
check('  and its line breaks are kept', (await hostile.locator('.vacancy-text').first().innerText()).includes('Line one\nLine two'))

// ---------------------------------------------------------------- links (Max)
// A test employer named like the advert's employer, so Warren suggests it.
const added = await api('USR-T0008', '/api/employers', { method: 'POST', body: { name: advert.EMPLOYERNAME, notOnCompaniesHouse: `TEST vacancies.mjs ${RUN}` } })
const employerId = added.body?.employerId
check('(set-up) a test employer with the advert employer\'s name', added.status === 201 && Boolean(employerId), JSON.stringify(added.body))
let decisions = []
try {
  const max = await pageAs('USR-T0008')
  await max.goto(`${B}/app/employers/${employerId}`)
  await card(max, 'Vacancies').waitFor({ timeout: 60000 })
  const suggested = card(max, 'Vacancies').locator('.vacancy-suggestions li', { hasText: advert.TITLE })
  check("the employer's page suggests the advert, to confirm or reject", (await suggested.count()) >= 1 &&
    (await suggested.first().getByRole('button', { name: /^Confirm/ }).count()) === 1 && (await suggested.first().getByRole('button', { name: 'Not theirs' }).count()) === 1)
  await max.screenshot({ path: `${OUT}/vacancies-employer-suggested.png`, fullPage: true })
  await suggested.first().getByRole('button', { name: /^Confirm/ }).click()
  await card(max, 'Vacancies').locator('ul.plain-list li', { hasText: advert.TITLE }).waitFor({ timeout: 60000 })
  check('  confirmed: it is listed under the employer\'s open vacancies, no longer suggested',
    (await card(max, 'Vacancies').locator('.vacancy-suggestions li', { hasText: advert.TITLE }).count()) === 0)
  decisions = await q(`select ORGANISATIONID, DECISION, DECIDEDBY, ISTESTDATA from ILR.EMPLOYER_VACANCY where EMPLOYERID = ? and VACANCYREFERENCE = ?`, [employerId, advert.R])
  check('  stored once, for ORG-T001, by Max, as test data', decisions.length === 1 && decisions[0].ORGANISATIONID === 'ORG-T001' &&
    decisions[0].DECISION === 'confirmed' && decisions[0].DECIDEDBY === 'USR-T0008' && decisions[0].ISTESTDATA === true, JSON.stringify(decisions))

  await tina.goto(`${B}/app/vacancies/${advert.R}`)
  await card(tina, 'Your employers').waitFor({ timeout: 60000 })
  check("a tutor sees the advert's confirmed employer", (await card(tina, 'Your employers').innerText()).includes(advert.EMPLOYERNAME))
  const nia = await api('USR-T0011', `/api/vacancies/${advert.R}`)
  check("ORG-T002's manager sees no ORG-T001 link, decision or employer", nia.status === 200 && nia.body.links.length === 0 && nia.body.decisions.length === 0 &&
    !nia.body.employers.some((e) => e.EMPLOYERID === employerId) && !nia.body.suggestions.some((s) => s.EMPLOYERID === employerId))
  const crossOrg = await api('USR-T0011', `/api/vacancies/${advert.R}/decisions`, { method: 'POST', body: { decision: 'rejected', employerId } })
  check("  and can't decide for ORG-T001's employer", crossOrg.status === 400 && /your employers/.test(crossOrg.body?.fields?.employerId))

  // Changing the decision on the advert's page.
  await max.goto(`${B}/app/vacancies/${advert.R}`)
  await card(max, 'Your employers').waitFor({ timeout: 60000 })
  const decided = card(max, 'Your employers').locator('.vacancy-suggestions li', { has: max.locator(`a[href="/app/employers/${employerId}"]`) })
  check("the advert's page shows Max the decision, with Confirm and Reject", (await decided.innerText()).includes('confirmed'))
  await decided.getByRole('button', { name: 'Reject' }).click()
  await decided.getByText('not theirs').waitFor({ timeout: 60000 })
  const linksNow = (await api('USR-T0008', `/api/vacancies/${advert.R}`)).body.links
  check('  rejecting removes the link and records "not theirs"', !linksNow.some((l) => l.EMPLOYERID === employerId), JSON.stringify(linksNow))
  await max.screenshot({ path: `${OUT}/vacancies-advert-manager.png`, fullPage: true })
  const emp = await api('USR-T0008', `/api/employers/${employerId}`)
  check('  and it is neither listed nor suggested on the employer page any more', !emp.body.vacancies.some((v) => v.VACANCYREFERENCE === advert.R) &&
    !emp.body.vacancySuggestions.some((v) => v.VACANCYREFERENCE === advert.R))
  const rows = await q(`select count(*) as N from ILR.EMPLOYER_VACANCY where EMPLOYERID = ? and VACANCYREFERENCE = ?`, [employerId, advert.R])
  check('  still one row for the employer and advert', rows[0].N === 1)
  const bad = await api('USR-T0008', `/api/vacancies/${advert.R}/decisions`, { method: 'POST', body: { decision: 'confirmed', employerId, siteId: 'SITE-T001' } })
  check("another employer's site is refused", bad.status === 400 && /sites still in use/.test(bad.body?.fields?.siteId))

  // Phone width.
  const phone = await pageAs('USR-T0008', { width: 390, height: 844 })
  for (const path of ['/app/vacancies?postcode=S10%205AA', `/app/vacancies/${advert.R}`]) {
    await phone.goto(`${B}${path}`)
    await phone.locator('.vacancy-results li, #vacancy h2').first().waitFor({ timeout: 60000 })
    const wide = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    check(`phone width: ${path} has no sideways scroll`, wide <= 1, `${wide}px`)
  }
} finally {
  // Put back: the test employer is no longer used (the app can't delete it,
  // nor its decisions; the test reset removes them).
  if (employerId) await q(`update ILR.EMPLOYER set ISACTIVE = false where EMPLOYERID = ? and ISTESTDATA`, [employerId])
}

check('no server or page errors', pages.every((p) => p.problems.length === 0), pages.flatMap((p) => p.problems).join('; '))
await browser.close()
await destroy(db)
try {
  const out = execFileSync('npm', ['run', '-s', 'check:test-flags'], { cwd: REPO, encoding: 'utf8' })
  check('check:test-flags: every row matches, links within their organisation', /Every row matches/.test(out))
} catch (err) {
  check('check:test-flags: every row matches, links within their organisation', false, err.stdout)
}
console.log(failures ? `${failures} FAILED` : 'all passed')
process.exit(failures ? 1 : 0)
