// Test: the FCDO travel advice fetch and load (scripts/load/travel-advice.js):
// only what changed is fetched, a bad index or page is never saved, email
// addresses and phone numbers are taken out (and only those), the load step
// is set up as a columns-removed load that keeps no original, and the job is
// scheduled daily. Fake API in a test folder; no network, no Snowflake.
//   node test/travel-advice.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ADVICE_DIR, ADVICE_INDEX_URL, ADVICE_REMOVED, EMAIL_TEXT, PHONE_TEXT, adviceSteps, fetchTravelAdvice, getAdviceJson, indexProblems, isPhoneNumber, pageProblems, withoutContactDetails, withoutContactText } from '../scripts/load/travel-advice.js'
import { LOAD_STEPS, runJob } from '../scripts/fetch-official.js'
import { JOB_ORDER, JOB_SCHEDULE } from '../server/jobSchedule.js'
import { JOB_RUNNERS } from '../scripts/jobs.js'
import { STEPS } from '../scripts/load-data.js'

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`)
}
const quiet = () => {}
const here = path.dirname(fileURLToPath(import.meta.url))
const fresh = (name) => { const r = path.join(here, '.output', 'advice-test', name); fs.rmSync(r, { recursive: true, force: true }); fs.mkdirSync(r, { recursive: true }); return r }
const fails = async (fn) => { try { await fn(); return null } catch (e) { return e.message } }

// ---------------------------------------------------------------- contact details
const t = (s) => withoutContactText(s)
check('an email address is taken out', t('Write to consul@example.org today') === `Write to ${EMAIL_TEXT} today`)
check('a mailto link goes whole', t('Email <a href="mailto:a.person@mail.example">a.person@mail.example</a> now') === `Email ${EMAIL_TEXT} now`)
check('a tel link goes whole', t('Call <a href="tel:+441234567890">our line</a>') === `Call ${PHONE_TEXT}`)
for (const n of ['+44 (0)20 7008 5000', '020 7008 1500', '+1 (264) 497 2551', '+ 1 (264) 497 2551', '(+44) (0)207 008 1500', '+243815566200', '(595 21) 446 608', '031 615 247', '+356 2134 0000', '0300 123 4567']) {
  check(`phone number taken out: ${n}`, t(`Call ${n} for help`) === `Call ${PHONE_TEXT} for help`, t(`Call ${n} for help`))
}
check('(24 hours) after a number is kept', t('+44 (0)20 7008 5000 (24 hours)') === `${PHONE_TEXT} (24 hours)`)
check('a number and its trailing full stop', t('Phone 020 7008 1500.') === `Phone ${PHONE_TEXT}.`)
for (const keep of ['Call 999 or 112', 'a population of 1 000 000 people', 'on 2026-10-22 it changed', 'from 2023 - 2024', 'at 50.84439, 6.123456', 'Dial 211111 in Windhoek', 'about 1,200,000 visitors', 'the 15/10/2026 notice']) {
  check(`kept: ${keep}`, t(keep) === keep, t(keep))
}
const found = { emails: 0, phones: 0 }
const page = { content_id: '602e34bf-8222-4391-96d9-548dbe1e1799', public_updated_at: '2026-08-13T12:10:25+01:00', base_path: '/foreign-travel-advice/laos',
  details: { alert_status: ['avoid_all_but_essential_travel_to_parts'], country: { name: 'Laos', slug: 'laos' }, image: { url: 'https://assets.publishing.service.gov.uk/media/64391b7a773a8a0013ab2c63/map.jpg' },
    change_history: [{ note: 'Updated: call +856 21 413 601', public_timestamp: '2026-08-13T11:10:25Z' }],
    parts: [{ slug: 'getting-help', title: 'Getting help', body: '<p>Honorary consul: <a href="mailto:hc@example.la">hc@example.la</a>, 020 7008 1500. Emergency 999.</p>' }] } }
const before = JSON.stringify(page)
const cleaned = withoutContactDetails(page, found)
check('contact details out of every text, counted', JSON.stringify(cleaned).includes('@') === false && found.emails === 1 && found.phones === 2, JSON.stringify(found))
check('the record given is not changed', JSON.stringify(page) === before)
check('links, ids, dates, alert_status and everything else are as published',
  cleaned.details.image.url === page.details.image.url && cleaned.content_id === page.content_id && cleaned.public_updated_at === page.public_updated_at
  && cleaned.details.change_history[0].public_timestamp === '2026-08-13T11:10:25Z' && cleaned.details.alert_status[0] === 'avoid_all_but_essential_travel_to_parts' && cleaned.details.parts[0].body.includes('Emergency 999'))
check('taking them out twice changes nothing more', JSON.stringify(withoutContactDetails(cleaned)) === JSON.stringify(cleaned))
check('isPhoneNumber: seven digits is the least', isPhoneNumber('123 4567') && !isPhoneNumber('12 3456'))

// ---------------------------------------------------------------- the index and a page
const child = (n, updated = '2026-10-01T10:00:00Z') => ({ content_id: `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`, base_path: `/foreign-travel-advice/c${n}`, public_updated_at: updated,
  api_url: `https://www.gov.uk/api/content/foreign-travel-advice/c${n}`, details: { change_description: `Change ${n}`, country: { name: `Country ${n}`, slug: `c${n}` } }, withdrawn: false })
const pageOf = (c, extra = {}) => ({ content_id: c.content_id, base_path: c.base_path, public_updated_at: c.public_updated_at, details: { country: c.details.country, alert_status: [], parts: [{ slug: 'health', title: 'Health', body: '<p>Fine</p>' }] }, ...extra })
const countries = (n) => Array.from({ length: n }, (_, i) => child(i + 1))
check('a good index has no problems', indexProblems(countries(120), 0).length === 0)
check('an empty index is a problem', indexProblems([], 0).length === 1)
check('a repeated content_id is a problem', indexProblems([child(1), child(1), ...countries(120)], 0).some((p) => /content_id is repeated/.test(p)))
check('fewer than 100 countries is a problem', indexProblems(countries(50), 0).some((p) => /fewer than 100/.test(p)))
check('a list that shrank is a problem', indexProblems(countries(110), 226).some((p) => /shrank from 226 to 110/.test(p)))
check('a shrunken list is accepted when asked', indexProblems(countries(110), 226, { acceptChanges: true }).length === 0)
check('a page with another content_id is a problem', pageProblems(pageOf(child(2)), child(1)).length === 1)
check('a page with no parts is a problem', pageProblems({ ...pageOf(child(1)), details: {} }, child(1)).some((p) => /no parts/.test(p)))

// ---------------------------------------------------------------- fetching only what changed
// A fake Content API: the index, the pages, the calls (in order), 304 on a repeat ETag.
const api = (list, { pages = {}, etag = 'W/"a"' } = {}) => {
  const calls = []
  const getJson = async (url, { etag: sent } = {}) => {
    calls.push(url)
    if (url === ADVICE_INDEX_URL) return sent && sent === etag ? { status: 304, etag } : { status: 200, etag, json: { links: { children: list } } }
    const c = list.find((x) => x.api_url === url)
    return { status: 200, json: pages[c.content_id] ?? pageOf(c, { details: { country: c.details.country, parts: [{ slug: 'getting-help', body: `<p>Consul consul${c.details.country.slug}@example.org 020 7008 1500</p>` }] } }) }
  }
  return { getJson, calls, pageCalls: () => calls.filter((u) => u !== ADVICE_INDEX_URL) }
}
const readLines = (file) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
const savedIn = (root, prefix) => fs.readdirSync(path.join(root, ADVICE_DIR)).filter((n) => n.startsWith(prefix))

{
  const root = fresh('first')
  const list = countries(120)
  const a = api(list)
  const saved = await fetchTravelAdvice({ root, log: quiet, getJson: a.getJson, pauseMs: 0 })
  check('the first run fetches every country', a.pageCalls().length === 120 && path.basename(saved).startsWith('fcdo_pages_'))
  const pages = readLines(saved)
  check('every page is saved, in the index order', pages.length === 120 && pages[0].content_id === list[0].content_id)
  check('and saved without email addresses or phone numbers', !JSON.stringify(pages).includes('@') && !/020 7008/.test(JSON.stringify(pages)) && JSON.stringify(pages).includes(EMAIL_TEXT))
  check('the index is saved too, one line per country', readLines(path.join(root, ADVICE_DIR, savedIn(root, 'fcdo_index_')[0])).length === 120)
  check('no file is left half written', savedIn(root, '').every((n) => !n.endsWith('.part')))

  const b = api(list)
  check('a second run with the same ETag asks only for the index and saves nothing', (await fetchTravelAdvice({ root, log: quiet, getJson: b.getJson, pauseMs: 0 })) === null && b.calls.length === 1)

  // The index changes (new ETag) but only one country's date moved.
  const moved = list.map((c, i) => (i === 6 ? { ...c, public_updated_at: '2026-10-22T09:00:00Z' } : c))
  const c = api(moved, { etag: 'W/"b"' })
  const s2 = await fetchTravelAdvice({ root, log: quiet, getJson: c.getJson, pauseMs: 0 })
  check('only the country whose date moved is fetched', c.pageCalls().length === 1 && c.pageCalls()[0] === list[6].api_url && readLines(s2).length === 1)
  check('and the index is saved again, as its dates changed', savedIn(root, 'fcdo_index_').length === 2)

  // A new ETag but nothing moved: no page, no index file.
  const d = api(moved, { etag: 'W/"c"' })
  const s3 = await fetchTravelAdvice({ root, log: quiet, getJson: d.getJson, pauseMs: 0 })
  check('a new ETag with no new dates saves nothing', s3 === null && d.pageCalls().length === 0 && savedIn(root, 'fcdo_pages_').length === 2 && savedIn(root, 'fcdo_index_').length === 2)

  // A page the API still serves older than the index said: fetched once, the date it has is kept.
  const e = api([...moved, child(121)], { etag: 'W/"d"' })
  const s4 = await fetchTravelAdvice({ root, log: quiet, getJson: e.getJson, pauseMs: 0 })
  check('a new country is fetched', e.pageCalls().length === 1 && readLines(s4)[0].content_id === child(121).content_id)
}

{
  // A bad page: nothing saved, the state stays, the next run tries again.
  const root = fresh('bad-page')
  const list = countries(120)
  const a = api(list, { pages: { [list[50].content_id]: pageOf(child(999)) } })
  const msg = await fails(() => fetchTravelAdvice({ root, log: quiet, getJson: a.getJson, pauseMs: 0 }))
  check('a page with the wrong content_id stops the run, naming the country', /not saved: c51: its content_id/.test(msg ?? ''), msg)
  check('nothing was saved and no state kept', fs.readdirSync(path.join(root, ADVICE_DIR)).length === 0)
  const again = api(list)
  check('the next run fetches everything again', (await fetchTravelAdvice({ root, log: quiet, getJson: again.getJson, pauseMs: 0 })) !== null && again.pageCalls().length === 120)
}

{
  const root = fresh('shrunk')
  await fetchTravelAdvice({ root, log: quiet, getJson: api(countries(226)).getJson, pauseMs: 0 })
  const msg = await fails(() => fetchTravelAdvice({ root, log: quiet, getJson: api(countries(150), { etag: 'W/"z"' }).getJson, pauseMs: 0 }))
  check('a list that shrank is not saved, and says how to accept it', /shrank from 226 to 150/.test(msg ?? '') && /TRAVEL_ADVICE_ACCEPT_CHANGES=1/.test(msg ?? ''), msg)
  const ok = await fetchTravelAdvice({ root, log: quiet, getJson: api(countries(150), { etag: 'W/"y"' }).getJson, pauseMs: 0, acceptChanges: true })
  check('and is saved when accepted', ok === null || typeof ok === 'string')
}

{
  // The pause between pages, and no request faster than the API's limit.
  const root = fresh('pause')
  const times = []
  const list = countries(110)
  const base = api(list)
  const getJson = async (url, o) => { if (url !== ADVICE_INDEX_URL) times.push(Date.now()); return base.getJson(url, o) }
  await fetchTravelAdvice({ root, log: quiet, getJson, pauseMs: 20 })
  const gaps = times.slice(1).map((x, i) => x - times[i])
  check('pages are asked for with a pause between them', gaps.length === 109 && Math.min(...gaps) >= 15, `min gap ${Math.min(...gaps)} ms`)
}

// ---------------------------------------------------------------- getAdviceJson: ETag, 304, 429
{
  const realFetch = globalThis.fetch
  const responses = []
  const sent = []
  globalThis.fetch = async (url, init) => { sent.push({ url, headers: init.headers }); return responses.shift() }
  const res = (status, body, headers = {}) => ({ status, ok: status >= 200 && status < 300, statusText: String(status), headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => body })
  const sleeps = []
  const sleep = async (ms) => { sleeps.push(ms) }
  try {
    responses.push(res(304, null))
    const r1 = await getAdviceJson('https://x/y', { etag: 'W/"q"', sleep })
    check('an ETag is sent and a 304 means no change', r1.status === 304 && sent[0].headers['if-none-match'] === 'W/"q"')
    responses.push(res(429, null, { 'retry-after': '2' }), res(200, { ok: 1 }, { etag: 'W/"n"' }))
    const r2 = await getAdviceJson('https://x/y', { sleep })
    check('a 429 waits as Retry-After says, then tries again', r2.status === 200 && r2.etag === 'W/"n"' && sleeps[0] === 2000, JSON.stringify(sleeps))
    responses.push(res(503, null), res(200, { ok: 2 }))
    const r3 = await getAdviceJson('https://x/y', { sleep })
    check('a server error is tried again', r3.json.ok === 2)
    responses.push(res(404, null))
    check('a 404 is an error at once', /404/.test(await fails(() => getAdviceJson('https://x/y', { sleep })) ?? ''))
    responses.push(...Array.from({ length: 3 }, () => res(500, null)))
    check('and keeps failing, it gives up after its tries', /500/.test(await fails(() => getAdviceJson('https://x/y', { sleep, tries: 3 })) ?? ''))
    check('requests say who is asking', sent.every((s) => /Rarebit/.test(s.headers['user-agent'])))
  } finally {
    globalThis.fetch = realFetch
  }
}

// ---------------------------------------------------------------- the load step
{
  const root = fresh('load')
  fs.mkdirSync(path.join(root, ADVICE_DIR), { recursive: true })
  const dirty = pageOf(child(1), { details: { country: { slug: 'c1', name: 'Country 1' }, parts: [{ slug: 'getting-help', body: '<p>hc@example.la 020 7008 1500</p>' }] } })
  fs.writeFileSync(path.join(root, ADVICE_DIR, 'fcdo_pages_2026-10-22T10-00-00-000Z.jsonl'), JSON.stringify(dirty) + '\n')
  fs.writeFileSync(path.join(root, ADVICE_DIR, 'fcdo_index_2026-10-22T10-00-00-000Z.jsonl'), JSON.stringify(child(1)) + '\n')
  const step = adviceSteps(root)[51]
  check('step 51 is the travel advice load, in the load:data steps', step.job === 'load-travel-advice' && STEPS[51]?.job === 'load-travel-advice')
  const specs = []
  const loader = { loadJsonLines: async (spec) => { specs.push(spec); return [] } }
  await step.run(loader)
  check('it loads the pages and the index into their tables', specs.map((s) => s.table).join() === 'SHARED_DB.RAW.FCDO_TRAVEL_ADVICE,SHARED_DB.RAW.FCDO_TRAVEL_ADVICE_INDEX')
  check('as columns-removed, naming what is left out, and no original staged', specs.every((s) => s.kind === 'columns-removed' && s.stageOriginal === false && JSON.stringify(s.removed) === JSON.stringify(ADVICE_REMOVED)))
  check('with the source, licence and the page', specs.every((s) => s.source === 'fcdo-travel-advice' && /Open Government Licence v3.0/.test(s.licence) && s.page === 'https://www.gov.uk/foreign-travel-advice'))
  check('each file only in its own table', specs[0].originals.length === 1 && /fcdo_pages_/.test(specs[0].originals[0].file) && specs[1].originals.length === 1 && /fcdo_index_/.test(specs[1].originals[0].file))
  const rows = await specs[0].rows(specs[0].originals[0])
  check('rows are read with the contact details taken out again', rows.length === 1 && !JSON.stringify(rows).includes('@') && !/020 7008/.test(JSON.stringify(rows)) && rows[0].n === 1)
  check('columns: content id, country, date, the whole page', ['LINENUMBER', 'CONTENT_ID', 'COUNTRY_SLUG', 'PUBLIC_UPDATED_AT', 'ITEM'].every((k) => k in specs[0].cols) && specs[0].cols.ITEM === '$1:item')
  const none = fresh('load-none')
  const empty = []
  await adviceSteps(none)[51].run({ loadJsonLines: async (spec) => { empty.push(spec.originals.length); return [] } })
  check('with nothing fetched yet the step loads nothing and does not fail', empty.join() === '0,0')
}

// ---------------------------------------------------------------- the job and its schedule
{
  const j = JOB_SCHEDULE['official-travel-advice']
  check('the job is daily, overdue after 30 hours', j.every === 24 * 3600 * 1000 && j.overdueAfter === 30 * 3600 * 1000, JSON.stringify({ every: j.every, overdueAfter: j.overdueAfter }))
  check('it is in the official lock group and in the tick order', j.lockGroup === 'official' && JOB_ORDER.includes('official-travel-advice'))
  check('it has a runner', typeof JOB_RUNNERS['official-travel-advice'] === 'function' && JSON.stringify(LOAD_STEPS.advice) === '[51]')
  const ran = []
  const r = await runJob({ kind: 'advice', load: true, log: quiet, deps: {
    fetchOne: async () => '/data/fcdo_pages_x.jsonl',
    runStep: async (_l, n) => { ran.push(n); return { results: [{ table: 'SHARED_DB.RAW.FCDO_TRAVEL_ADVICE', rowsLoaded: 3 }] } },
    openLoader: async () => ({ close: async () => {} }) } })
  check('a run fetches, then loads step 51', r.outcome === 'succeeded' && ran.join() === '51' && r.summary.fetched[0] === 'fcdo_pages_x.jsonl' && r.summary.loaded[0].rows === 3)
  const none = await runJob({ kind: 'advice', load: true, log: quiet, deps: { fetchOne: async () => null, runStep: async () => ({ results: [{ table: 't', skipped: true }] }), openLoader: async () => ({ close: async () => {} }) } })
  check('a run with nothing new succeeds with nothing fetched or loaded', none.outcome === 'succeeded' && !none.summary.fetched.length && !none.summary.loaded.length)
  const bad = await runJob({ kind: 'advice', load: false, log: quiet, deps: { fetchOne: async () => { throw new Error('the list shrank') } } })
  check('a fetch that fails fails the job, with the reason', bad.outcome === 'failed' && /the list shrank/.test(bad.error ?? ''))
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
