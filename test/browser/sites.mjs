// Employer sites and contacts (employers build step 5) in the browser, with
// the test data from sql/employers_03_sites_contacts.sql:
//   Max   USR-T0008  manager, ORG-T001: sites, contacts, an apprentice's
//                    workplace
//   Tina  USR-T0004  tutor: sees sites and contacts, changes none
//   Ivy   USR-T0007  IQA: sees an apprentice's workplace, changes nothing
//   Erin  USR-T0201  head office at Testco Retail: every current apprentice
//   Sam   USR-T0207  site contact, Crosspool: only Crosspool's
//   Lee   USR-T0209  his only site assignment ended: nobody
//   Kai   USR-T0210  no head office flag, no assignments: nobody
// Needs the seeded test data (run the test reset first, or it stops), and
// checks the fixed numbers in Burrow before and after: Erin 17, Sam 3, Ari 5,
// Lee 0, Kai 0. It changes test data only, and puts back what it changed
// (restoreSites in test/db/employer-seed.mjs, updates only: TESTL0004's move
// from Crosspool, TESTL0044's site and aims' postcode). The site and contact
// it adds each run (named with the run's time), the link the move started
// and the change history can't be deleted by the app's role: they're marked
// no longer used or current, or ended, until the next reset.
// Run against the test servers (test/start-test-servers.sh); see setup.mjs.
import { execFileSync } from 'node:child_process'
import { BASE, OUT, REPO, launch } from './setup.mjs'
import { connect, execute, destroy } from '../../server/db.js'
import { FIXED, NAMES, derivedCounts, requireSeed, restoreSites, seedProblems } from '../db/employer-seed.mjs'

const B = BASE
const RUN = Date.now().toString(36)
let failures = 0
const check = (label, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`) }
const db = await connect()
const q = (sql, binds = []) => execute(db, sql, binds)
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date())

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
// A box on a page, by its heading.
const card = (p, title) => p.locator('section.ui-card').filter({ has: p.getByRole('heading', { name: title, exact: true }) })

// ---------------------------------------------------------------- Burrow, as seeded
// The fixed numbers (test/db/employer-seed.mjs), on the Burrow home page.
async function burrowCheck(when) {
  for (const [user, n] of Object.entries(FIXED)) {
    const p = await pageAs(user)
    await p.goto(`${B}/burrow`)
    await p.locator('#employer-apprentices').waitFor({ timeout: 60000 })
    const heading = await text(p, '#employer-apprentices')
    check(`Burrow ${when}: ${NAMES[user]} sees ${n}`, heading === `Apprentices (${n})`, heading)
    if (user === 'USR-T0207' && when === 'before') await p.screenshot({ path: `${OUT}/sites-burrow-sam.png`, fullPage: true })
    await p.context().close()
    pages.splice(pages.indexOf(p), 1)
  }
  const derived = await derivedCounts(q)
  check(`  (extra) ${when}: the same as worked out from the tables`, Object.keys(FIXED).every((u) => derived[u] === FIXED[u]), JSON.stringify(derived))
}
await requireSeed(q)
await burrowCheck('before')

// Everything below changes test data; the finally puts it back.
try {
  // ---------------------------------------------------------------- sites and contacts (Max)
  const max = await pageAs('USR-T0008')
  await max.goto(`${B}/app/employers/EMP-T001`)
  await card(max, 'Sites').locator('table').waitFor({ timeout: 60000 })
  const sitesBox = await card(max, 'Sites').innerText()
  check('the employer page lists its sites, with contacts and apprentice counts',
    /Testco Express Crosspool\s+S10 5AA\s+Sam Testsitecontact07\s+3\b/.test(sitesBox) && /Testco Metro Old Town \(closed\)\s+No longer used/.test(sitesBox), sitesBox.replace(/\s+/g, ' ').slice(0, 300))
  const contactsBox = await card(max, 'Contacts').innerText()
  check('and its contacts, marking Burrow users', /Sam Testsitecontact07\s+Uses Burrow/.test(contactsBox) && /Rae Testlinemanager11/.test(contactsBox))

  await max.getByRole('link', { name: 'Add a site' }).click()
  await max.locator('#site-form form').waitFor({ timeout: 60000 })
  const siteName = `TEST Testco Local ${RUN}`
  await max.getByLabel('Name').fill(siteName)
  await max.getByLabel('Postcode').fill('ZZ1 1ZZ')
  await max.getByRole('button', { name: 'Add site' }).click()
  await max.locator('.field-error').first().waitFor({ timeout: 60000 })
  check('a postcode not on the ONS list is refused', /ZZ1 1ZZ isn't a current postcode on the ONS postcode list/.test(await text(max, '#site-form')))
  await max.getByLabel('Postcode').fill('s10 5ad')
  await max.getByLabel('Site contact (optional)').selectOption({ label: 'Rae Testlinemanager11, Team leader' })
  await max.getByRole('button', { name: 'Add site' }).click()
  await max.waitForURL((u) => /\/sites\/SITE-/.test(u.pathname), { timeout: 60000 })
  await max.locator('#site-page dl').waitFor({ timeout: 60000 })
  const newSite = await text(max, '#site-page')
  check('a site is added, its postcode tidied, with its contact', newSite.includes(siteName) && /S10 5AD/.test(newSite) && /Rae Testlinemanager11/.test(newSite))
  const dup = await api('USR-T0008', '/api/employers/EMP-T001/sites', { method: 'POST', body: { name: 'testco express crosspool', postcode: 'S10 5AA' } })
  check('a second site with the same name (any case) is refused', dup.status === 409 && /already has a site called Testco Express Crosspool/.test(dup.body?.fields?.name), JSON.stringify(dup.body))

  await max.goto(`${B}/app/employers/EMP-T001/sites/SITE-T001`)
  await max.locator('#site-page table').waitFor({ timeout: 60000 })
  const crosspool = await text(max, '#site-page')
  const crosspoolRows = await max.locator('#site-page tbody tr').count()
  check("Crosspool's page lists its 3 apprentices with their line managers",
    crosspoolRows === 3 && (crosspool.match(/Rae Testlinemanager11/g) ?? []).length === 2 &&
    /Sam Testsitecontact07/.test(crosspool), `${crosspoolRows} rows`)
  await max.screenshot({ path: `${OUT}/sites-site-page.png`, fullPage: true })

  await max.goto(`${B}/app/employers/EMP-T001/contacts/new`)
  await max.locator('#contact-form form').waitFor({ timeout: 60000 })
  const contactName = `TEST Contact ${RUN}`
  await max.getByLabel('Name').fill(contactName)
  await max.getByLabel('Job title (optional)').fill('Team leader')
  await max.getByLabel('Email (optional)').fill('RAE.TESTLINEMANAGER11@example.com')
  await max.getByRole('button', { name: 'Add contact' }).click()
  await max.locator('.field-error').first().waitFor({ timeout: 60000 })
  check('the same email as another current contact (any case) is refused', /Rae Testlinemanager11 already has this email/.test(await text(max, '#contact-form')))
  await max.getByLabel('Email (optional)').fill(`test.contact.${RUN}@example.com`)
  await max.getByLabel('Based at (optional)').selectOption({ label: 'Testco Superstore Hillsborough' })
  await max.getByRole('button', { name: 'Add contact' }).click()
  await max.waitForURL((u) => u.pathname === '/app/employers/EMP-T001', { timeout: 60000 })
  await card(max, 'Contacts').locator('table').waitFor({ timeout: 60000 })
  check('a contact is added', (await card(max, 'Contacts').innerText()).includes(contactName))
  const [added] = await q(`select ISTESTDATA, SITEID, CREATEDBY, USERID from ILR.EMPLOYER_CONTACT where NAME = ?`, [contactName])
  check('  as test data, based at Hillsborough, with no sign-in', added?.ISTESTDATA === true && added.SITEID === 'SITE-T002' && added.CREATEDBY === 'USR-T0008' && added.USERID === null, JSON.stringify(added))
  const samEmail = await api('USR-T0008', '/api/employers/EMP-T001/contacts/CON-T207', { method: 'PATCH', body: { name: 'Sam Testsitecontact07', email: 'sam.new@example.com' } })
  const samGone = await api('USR-T0008', '/api/employers/EMP-T001/contacts/CON-T207', { method: 'PATCH', body: { name: 'Sam Testsitecontact07', email: 'sam.testsitecontact07@example.com', isCurrent: false } })
  check("a Burrow user's email can't be changed, nor can they be made no longer current", samEmail.status === 400 && /sign in to Burrow with this email/.test(samEmail.body?.fields?.email) &&
    samGone.status === 400 && /still sign in to Burrow/.test(samGone.body?.fields?.isCurrent), JSON.stringify([samEmail.body, samGone.body]))
  const otherEmployer = await api('USR-T0008', '/api/employers/EMP-T001/sites', { method: 'POST', body: { name: `TEST x ${RUN}`, postcode: 'S10 5AA', contactId: 'CON-T213' } })
  check("another employer's contact can't be a site's contact", otherEmployer.status === 400 && /current contacts/.test(otherEmployer.body?.fields?.contactId), JSON.stringify(otherEmployer.body))
  const t002 = await api('USR-T0011', '/api/employers/EMP-T001/sites/SITE-T001')
  check("ORG-T002's manager can't open ORG-T001's site", t002.status === 404)

  const tina = await pageAs('USR-T0004')
  await tina.goto(`${B}/app/employers/EMP-T001`)
  await card(tina, 'Sites').locator('table').waitFor({ timeout: 60000 })
  check('a tutor sees sites and contacts, with no add or change', /Testco Express Crosspool/.test(await text(tina, '#employer')) &&
    (await tina.getByRole('link', { name: /Add a site|Add a contact/ }).count()) === 0 && (await tina.getByRole('link', { name: /^Change/ }).count()) === 0)
  const tutorTries = [
    await api('USR-T0004', '/api/employers/EMP-T001/sites', { method: 'POST', body: { name: 'x', postcode: 'S10 5AA' } }),
    await api('USR-T0004', '/api/employers/EMP-T001/contacts', { method: 'POST', body: { name: 'x' } }),
    await api('USR-T0004', '/api/learners/TESTL0001/workplace', { method: 'PATCH', body: {} }),
  ]
  check('  and the API refuses them adding sites, contacts or changing a workplace', tutorTries.every((t) => t.status === 403), tutorTries.map((t) => t.status).join(','))
  await tina.goto(`${B}/app/employers/EMP-T001/sites/SITE-T001/edit`)
  await tina.waitForURL((u) => u.pathname === '/app/employers/EMP-T001/sites/SITE-T001', { timeout: 60000 })
  check('  /sites/<id>/edit sends a tutor to the site page', true)

  // ---------------------------------------------------------------- an apprentice's workplace (Max)
  const workplaceBox = (p) => p.locator('.learner-section[aria-label="Workplace"]')
  const links = async (ref) => q(`select EMPLOYERID, to_varchar(FROMDATE) as F, to_varchar(TODATE) as T, SITEID, LINEMANAGERCONTACTID as LM
    from ILR.LEARNER_EMPLOYER where LEARNREFNUMBER = ? order by FROMDATE`, [ref])
  const openPostcodes = async (ref) => (await q(`select distinct DELLOCPOSTCODE as P from LEARNING_DELIVERY
    where LEARNREFNUMBER = ? and REMOVEDAT is null and LEARNACTENDDATE is null`, [ref])).map((r) => r.P)
  async function openWorkplace(p, ref) {
    await p.goto(`${B}/app/learners/${ref}?back=/app/learners`)
    await workplaceBox(p).locator('dl').first().waitFor({ timeout: 60000 })
  }

  await openWorkplace(max, 'TESTL0001')
  const wp1 = await workplaceBox(max).innerText()
  check("the learner page's Workplace shows the employer, site and line manager", /Testco Retail Ltd/.test(wp1) && /Testco Express Crosspool \(S10 5AA\)/.test(wp1) && /Rae Testlinemanager11, Team leader/.test(wp1), wp1.replace(/\s+/g, ' '))
  const ivy = await pageAs('USR-T0007') // IQA: sees every learner, manages none
  await openWorkplace(ivy, 'TESTL0001')
  check('  an IQA sees it too, with no Change workplace', /Testco Express Crosspool/.test(await workplaceBox(ivy).innerText()) && (await ivy.getByRole('link', { name: 'Change workplace' }).count()) === 0)

  // Setting a site for the first time: the link is changed as it is, and the
  // postcode question is asked if their open aims use another postcode.
  const current44 = (await links('TESTL0044')).find((l) => l.T === null)
  const postcodes44 = await openPostcodes('TESTL0044')
  await openWorkplace(max, 'TESTL0044')
  await max.getByRole('link', { name: 'Change workplace' }).click()
  await max.locator('#edit-learner form').waitFor({ timeout: 60000 })
  await max.getByLabel('Site', { exact: true }).selectOption({ label: 'Testco Superstore Hillsborough (S6 2AA)' })
  await max.getByLabel('Line manager').selectOption({ label: 'Ira Testlinemanager12, Team leader' })
  const asked = await max.getByText(/Change the delivery location postcode on their open aims to S6 2AA\?/).count()
  check('setting a first site asks about the aims\' postcode, since they use another one (ZZ3 3DA)', asked > 0 && postcodes44.join(',') === 'ZZ3 3DA', `asked=${asked} now=${postcodes44.join(',')}`)
  check('  and needs no move date', (await max.getByLabel('Date they moved').count()) === 0)
  await max.getByRole('button', { name: 'Save workplace' }).click()
  await max.locator('.field-error, .ui-field-error').first().waitFor({ timeout: 60000 })
  check('  the question has to be answered', /Say whether their aims should use the new site's postcode/.test(await text(max, '#edit-learner')))
  await max.getByLabel("Yes, use the new site's postcode").check()
  await max.screenshot({ path: `${OUT}/sites-workplace-form.png`, fullPage: true })
  await max.getByRole('button', { name: 'Save workplace' }).click()
  await max.waitForURL((u) => u.pathname === '/app/learners/TESTL0044', { timeout: 60000 })
  const after44 = (await links('TESTL0044')).find((l) => l.T === null)
  check('  saved on the same link: Hillsborough, Ira', after44.F === current44.F && after44.SITEID === 'SITE-T002' && after44.LM === 'CON-T212', JSON.stringify(after44))
  check('  and "yes" put S6 2AA on every open aim', (await openPostcodes('TESTL0044')).every((p) => p === 'S6 2AA'), (await openPostcodes('TESTL0044')).join(','))

  // Moving between sites: the old link ends the day before, a new one starts.
  const now4 = (await links('TESTL0004')).find((l) => l.T === null && l.EMPLOYERID === 'EMP-T001')
  const to = { id: 'SITE-T002', label: 'Testco Superstore Hillsborough (S6 2AA)', postcode: 'S6 2AA' }
  const postcodes4 = await openPostcodes('TESTL0004')
  await openWorkplace(max, 'TESTL0004')
  await max.getByRole('link', { name: 'Change workplace' }).click()
  await max.locator('#edit-learner form').waitFor({ timeout: 60000 })
  await max.getByLabel('Site', { exact: true }).selectOption({ label: to.label })
  await max.getByLabel('Date they moved').fill('2099-01-01')
  if (await max.getByText(/Change the delivery location postcode/).count()) await max.getByLabel('No, leave them as they are').check()
  await max.getByRole('button', { name: 'Save workplace' }).click()
  await max.locator('.field-error').first().waitFor({ timeout: 60000 })
  check('moving site needs a move date, not in the future', /can't be in the future/.test(await text(max, '#edit-learner')))
  await max.getByLabel('Date they moved').fill(today)
  await max.getByRole('button', { name: 'Save workplace' }).click()
  await max.waitForURL((u) => u.pathname === '/app/learners/TESTL0004', { timeout: 60000 })
  const all4 = await links('TESTL0004')
  const old = all4.find((l) => l.F === now4.F && l.EMPLOYERID === 'EMP-T001')
  const fresh = all4.find((l) => l.F === today && l.EMPLOYERID === 'EMP-T001' && l.T === null)
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10)
  check('the move ends the Crosspool link yesterday and starts a new one today at Hillsborough, keeping the line manager',
    old?.T === yesterday && fresh?.SITEID === to.id && fresh?.T === null && fresh?.LM === now4.LM, JSON.stringify(all4))
  check('  "no" left their aims\' postcodes alone', (await openPostcodes('TESTL0004')).join(',') === postcodes4.join(','))
  const logged = await q(`select count(*) as N, count_if(not ISTESTDATA) as REAL from ILR.RECORD_CHANGE
    where LEARNREFNUMBER = 'TESTL0004' and TABLENAME = 'LEARNER_EMPLOYER' and CHANGEDAT >= dateadd(minute, -10, current_timestamp())`)
  check('  both changes are in the history, as test data', Number(logged[0].N) >= 2 && Number(logged[0].REAL) === 0, JSON.stringify(logged[0]))
  const sam4 = (await api('USR-T0207', '/api/employer/apprentices')).body
  const samSees = (Array.isArray(sam4) ? sam4 : sam4.apprentices ?? []).some((a) => a.LEARNREFNUMBER === 'TESTL0004')
  check('  Sam (Crosspool) no longer sees TESTL0004 once they are at Hillsborough', !samSees)

  // A second move the same day (back to Crosspool) corrects that day's move:
  // still one link per key, the day's link now at Crosspool, logged.
  await openWorkplace(max, 'TESTL0004')
  await max.getByRole('link', { name: 'Change workplace' }).click()
  await max.locator('#edit-learner form').waitFor({ timeout: 60000 })
  await max.getByLabel('Site', { exact: true }).selectOption({ label: 'Testco Express Crosspool (S10 5AA)' })
  await max.getByLabel('Date they moved').fill(today)
  if (await max.getByText(/Change the delivery location postcode/).count()) await max.getByLabel('No, leave them as they are').check()
  await max.getByRole('button', { name: 'Save workplace' }).click()
  await max.waitForURL((u) => u.pathname === '/app/learners/TESTL0004', { timeout: 60000 })
  const twice = await links('TESTL0004')
  const keys = twice.map((l) => `${l.EMPLOYERID} ${l.F}`)
  check('a second move the same day leaves one link per key', keys.length === new Set(keys).size, JSON.stringify(twice))
  const day = twice.filter((l) => l.F === today && l.EMPLOYERID === 'EMP-T001')
  check("  the day's link is now at Crosspool, current; the seeded one still ended yesterday",
    day.length === 1 && day[0].SITEID === 'SITE-T001' && day[0].T === null && twice.find((l) => l.F === now4.F)?.T === yesterday, JSON.stringify(twice))
  const corrected = await q(`select count(*) as N from ILR.RECORD_CHANGE
    where LEARNREFNUMBER = 'TESTL0004' and TABLENAME = 'LEARNER_EMPLOYER' and CHANGETYPE = 'corrected'
      and NEWVALUES:SITEID::string = 'SITE-T001' and CHANGEDAT >= dateadd(minute, -10, current_timestamp())`)
  check('  and the correction is in the history', Number(corrected[0].N) >= 1, JSON.stringify(corrected[0]))
} finally {
  await restoreSites(q)
}
const left = await seedProblems(q)
check('everything the test changed is put back', left.length === 0, left.join('; '))
await burrowCheck('after putting back')

const leeTries = await api('USR-T0209', '/api/employer/witness-statements')
const leeStatements = Array.isArray(leeTries.body) ? leeTries.body : leeTries.body?.statements ?? []
check("  Lee gets no witness statements to confirm", leeTries.status === 200 && leeStatements.length === 0, JSON.stringify(leeTries.body).slice(0, 120))
const samMe = (await api('USR-T0207', '/api/me')).body
check("  Sam's name in Burrow comes from his contact record", samMe.DISPLAYNAME === 'Sam Testsitecontact07')

check('no server or page errors', pages.every((p) => p.problems.length === 0), pages.flatMap((p) => p.problems).join('; '))
await browser.close()
await destroy(db)
try {
  const out = execFileSync('npm', ['run', '-s', 'check:test-flags'], { cwd: REPO, encoding: 'utf8' })
  check('check:test-flags: everything matches, sites and contacts within their employer', /Every row matches/.test(out))
} catch (err) {
  check('check:test-flags: everything matches, sites and contacts within their employer', false, err.stdout)
}
console.log(failures ? `${failures} FAILED` : 'all passed')
process.exit(failures ? 1 : 0)
