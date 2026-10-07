// Test: the Skills England import (scripts/import-skills.js).
//   Part 1  no database, no network: parsing saved records (test/fixtures/
//           skills: ST0072's two versions, ST1312 1.0 with duties and
//           options, the maps API's OCC0072), labels, SOC codes
//   Part 2  the database, with the saved records under test references
//           (ST9072, ST9312, OCC9072) and fake APIs, in one transaction
//           that's rolled back: what's stored, re-runs, changes, label
//           mismatches logged, gone only after a complete run, the lock
//   Part 3  one live request to each API (nothing stored)
//   node test/db/skills-import.mjs
import fs from 'node:fs'
import { connect, execute, destroy } from '../../server/db.js'
import { fetchStandards, labelMismatches, makeMapsClient, parseOccupation, parseVersion, runImport } from '../../scripts/import-skills.js'

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`)
}
const standards = JSON.parse(fs.readFileSync(new URL('../fixtures/skills/standards.json', import.meta.url), 'utf8'))
const occupations = JSON.parse(fs.readFileSync(new URL('../fixtures/skills/occupations.json', import.meta.url), 'utf8'))
const v = (st, version) => standards.find((s) => s.referenceNumber === st && s.version === version)

// ---------------------------------------------------------------- part 1
console.log('Part 1: parsing saved records')
{
  const p = parseVersion(v('ST0072', '1.1'))
  const refs = (t) => p.ksbs.filter((k) => k.KSB_TYPE === t).map((k) => k.KSB_REFERENCE)
  check('ST0072 1.1: K1-K15, S1-S10, B1-B10, in the order listed', refs('K').join() === Array.from({ length: 15 }, (_, i) => `K${i + 1}`).join() &&
    refs('S').length === 10 && refs('B').length === 10 && p.ksbs[0].DETAIL === 'Understand who customers are.')
  check('  with its LARS code, occupation, status and start dates', p.versionRow.LARS_CODE === 122 && p.versionRow.OCCUPATION_CODE === 'OCC0072' &&
    p.versionRow.STATUS === 'Approved for delivery' && p.versionRow.EARLIEST_START_DATE === '2018-10-03' && p.versionRow.LATEST_START_DATE === null, JSON.stringify(p.versionRow))
  const old = parseVersion(v('ST0072', '1.0'))
  check('ST0072 1.0 (retired, no structured KSBs): the version, no KSBs', old.versionRow.STATUS === 'Retired' && old.ksbs.length === 0)
  const o = parseVersion(v('ST1312', '1.0'))
  check('ST1312 1.0: duties (D1...), their KSBs, options and which duties are in which',
    o.duties.length > 0 && o.duties[0].DUTY_REFERENCE === 'D1' && o.dutyKsbs.length > 0 && o.options.length > 0 && o.dutyOptions.length > 0 &&
    o.dutyKsbs.every((l) => o.ksbs.some((k) => k.KSB_TYPE === l.KSB_TYPE && k.KSB_REFERENCE === l.KSB_REFERENCE)),
    `${o.duties.length} duties, ${o.dutyKsbs.length} links, ${o.options.length} options, ${o.dutyOptions.length} duty-options, ${o.unmapped} unmapped`)

  const occ = parseOccupation('OCC0072', occupations.OCC0072.body)
  check('OCC0072: SOC 2020 sub-unit groups (primary marked), SOC 2010, job titles and keywords',
    occ.soc.some((s) => s.SOC_VERSION === 'SOC2020' && s.SOC_KEY === '7211/00' && s.UNIT_GROUP === '7211' && s.IS_PRIMARY) &&
    occ.soc.some((s) => s.SOC_VERSION === 'SOC2010' && s.SOC_KEY === '7219') &&
    occ.terms.some((t) => t.KIND === 'job title') && occ.terms.some((t) => t.KIND === 'keyword') && occ.profile.VERSION === '1.1',
    JSON.stringify(occ.soc.slice(0, 3)))
  const byId = new Map(p.ksbs.map((k) => [k.SOURCE_ID, k]))
  check("the maps API's labels for OCC0072 1.1 match ours (matched by Skills England's ID)", labelMismatches(occ.labels, byId, p.key).length === 0 && occ.labels.length === 35)
  const swapped = occ.labels.map((l) => (l.label === 'K1' ? { ...l, label: 'K2' } : l.label === 'K2' ? { ...l, label: 'K1' } : l))
  const found = labelMismatches(swapped, byId, p.key)
  check('  two swapped labels are both reported, ours and theirs', found.length === 2 && found.some((m) => m.ours === 'K1' && m.theirs === 'K2'), JSON.stringify(found))
}

// ---------------------------------------------------------------- part 2
console.log('Part 2: the database, test references, rolled back')
// The saved records as test standards and occupations, so they can't meet
// real ones: ST9072 (from ST0072), ST9312 (from ST1312), OCC9072...
const asTest = (x) => JSON.parse(JSON.stringify(x).replaceAll('ST0072', 'ST9072').replaceAll('ST1312', 'ST9312')
  .replaceAll('OCC0072', 'OCC9072').replaceAll('OCC1312', 'OCC9312'))
const testStandards = asTest(standards)
const testOcc = asTest(occupations.OCC0072.body)
// Fake APIs: the standards file is records; occupation OCC9072 is
// occupation (or a status); anything else is 404.
function fakeApis(records, { occupation = testOcc, occupationStatus = 200 } = {}) {
  const calls = []
  const fetchImpl = async (url, { headers }) => {
    calls.push({ url, headers })
    if (url.startsWith('https://skillsengland.education.gov.uk/')) return { status: 200, text: async () => JSON.stringify(records) }
    const known = url.includes('/Occupations/OCC9072?')
    const status = known ? occupationStatus : 404
    return { status, headers: { get: () => null }, json: async () => (known ? occupation : null) }
  }
  return { fetchImpl, maps: makeMapsClient({ fetchImpl, key: 'test-key', pauseMs: 0, sleep: async () => {} }), calls }
}
const c = await connect()
const q = (sql, binds = []) => execute(c, sql, binds)
const run = (records, opts) => {
  const api = fakeApis(records, opts)
  return runImport({ connection: c, fetchImpl: api.fetchImpl, maps: api.maps, log: () => {} }).then((counts) => ({ ...counts, calls: api.calls }))
}
const ksbsOf = async (st, version) => (await q(`select KSB_REFERENCE as R, DETAIL, to_varchar(GONEAT) as GONE from SKILLS.STANDARD_KSB
  where ST_REFERENCE = ? and VERSION = ? order by decode(KSB_TYPE, 'K', 1, 'S', 2, 3), SORT_ORDER`, [st, version]))
const goneOf = async (st) => (await q(`select count(*) as N, count(GONEAT) as GONE from SKILLS.STANDARD_VERSION where ST_REFERENCE = ?`, [st]))[0]
try {
  await q('begin')
  try {
    const first = await run(testStandards)
    const k = await ksbsOf('ST9072', '1.1')
    check('a complete run: 3 versions, their KSBs, 1 occupation (the others not in the maps API)', first.complete && first.versions === 3 &&
      first.occupations === 1 && first.notFound >= 1 && k.length === 35 && k[0].R === 'K1' && first.mismatches.length === 0,
      JSON.stringify({ complete: first.complete, versions: first.versions, ksbs: first.ksbs, occupations: first.occupations, notFound: first.notFound, error: first.error }))
    const [dk] = await q(`select (select count(*) from SKILLS.STANDARD_DUTY where ST_REFERENCE = 'ST9312') as D,
      (select count(*) from SKILLS.STANDARD_DUTY_KSB where ST_REFERENCE = 'ST9312') as L,
      (select count(*) from SKILLS.STANDARD_OPTION where ST_REFERENCE = 'ST9312') as O,
      (select count(*) from SKILLS.STANDARD_DUTY_OPTION where ST_REFERENCE = 'ST9312') as DO_,
      (select count(*) from SKILLS.OCCUPATION_SOC where OCCUPATION_CODE = 'OCC9072') as S,
      (select count(*) from SKILLS.OCCUPATION_TERM where OCCUPATION_CODE = 'OCC9072') as T,
      (select LARS_CODE from SKILLS.STANDARD_VERSION where ST_REFERENCE = 'ST9072' and VERSION = '1.1') as LARS`)
    check('  duties, duty-KSB links, options, SOC codes and terms stored', dk.D === 17 && dk.L === 156 && dk.O === 2 && dk.DO_ === 8 && dk.S > 0 && dk.T > 0 && dk.LARS === 122, JSON.stringify(dk))
    check('  the maps API was asked with the key', first.calls.some((x) => x.url.includes('/Occupations/OCC9072?') && x.headers['X-API-KEY'] === 'test-key'))
    const [run1] = await q(`select COMPLETE, VERSIONS, KSBS, to_json(LABEL_MISMATCHES) as M from SKILLS.SKILLS_IMPORT_RUN where RUNID = ?`, [first.runId])
    check('  the run is recorded, with no label mismatches', run1.COMPLETE && run1.VERSIONS === 3 && run1.M === '[]', JSON.stringify(run1))

    const again = await run(testStandards)
    check('the same again: nothing added, nothing changed', again.complete && again.added === 0 && again.changed === 0, JSON.stringify({ added: again.added, changed: again.changed }))

    // A changed KSB, and the maps API labelling K1 and K2 the other way round.
    const edited = JSON.parse(JSON.stringify(testStandards))
    edited.find((s) => s.referenceNumber === 'ST9072' && s.version === '1.1').knowledges[0].detail = 'TEST changed wording'
    const swapped = JSON.parse(JSON.stringify(testOcc))
    swapped.knowledges[0].knowledgeId = 'K2'
    swapped.knowledges[1].knowledgeId = 'K1'
    const third = await run(edited, { occupation: swapped })
    const k1 = (await ksbsOf('ST9072', '1.1'))[0]
    const [run3] = await q(`select to_json(LABEL_MISMATCHES) as M from SKILLS.SKILLS_IMPORT_RUN where RUNID = ?`, [third.runId])
    const logged = JSON.parse(run3.M)
    check('a changed KSB is updated in place (one change)', third.changed === 1 && k1.R === 'K1' && k1.DETAIL === 'TEST changed wording', JSON.stringify({ changed: third.changed, k1 }))
    check('  label mismatches are logged on the run, ours and theirs, and the run carries on', third.complete && logged.length === 2 &&
      logged.some((m) => m.st_reference === 'ST9072' && m.version === '1.1' && m.ours === 'K1' && m.theirs === 'K2'), run3.M)

    // Gone: only after a complete run.
    const without = testStandards.filter((s) => s.referenceNumber !== 'ST9312')
    const stopped = await run(without, { occupationStatus: 401 })
    check('a run that stops (the maps API refuses the key) marks nothing gone', !stopped.complete && /refused the key/.test(stopped.error) && (await goneOf('ST9312')).GONE === 0,
      JSON.stringify({ complete: stopped.complete, error: stopped.error }))
    const full = await run(without)
    const g = await goneOf('ST9312')
    const [gk] = await q(`select count(*) as N, count(GONEAT) as G from SKILLS.STANDARD_KSB where ST_REFERENCE = 'ST9312'`)
    check('a complete run marks a standard no longer published as gone, with its KSBs', full.complete && g.N === 1 && g.GONE === 1 && gk.N > 0 && gk.G === gk.N)
    await run(testStandards)
    check('  and clears it when it comes back', (await goneOf('ST9312')).GONE === 0)

    // The lock.
    await q(`insert into SKILLS.SKILLS_IMPORT_RUN (RUNID) values ('TEST-open-run')`)
    const refused = await run(testStandards)
    check('a run refuses to start while another is open', Boolean(refused.refused) && refused.calls.length === 0)
  } finally {
    await q('rollback')
  }
  const [left] = await q(`select (select count(*) from SKILLS.STANDARD_VERSION where ST_REFERENCE in ('ST9072', 'ST9312')) as V,
    (select count(*) from SKILLS.SKILLS_IMPORT_RUN where RUNID = 'TEST-open-run') as R`)
  check('nothing kept after the rollback', left.V === 0 && left.R === 0)
} finally {
  await destroy(c)
}

// ---------------------------------------------------------------- part 3
console.log('Part 3: one live request to each API (nothing stored)')
{
  const { records, sha256 } = await fetchStandards()
  const parsed = records.map(parseVersion)
  check('the standards API answers with every version, each with a reference and version', records.length > 1500 && sha256.length === 64 &&
    parsed.every((p) => /^ST\d{4}$/.test(p.key.ST_REFERENCE ?? '') && p.key.VERSION), `${records.length} versions`)
  const live = await makeMapsClient().get('OCC0072')
  const occ = live.body ? parseOccupation('OCC0072', live.body) : null
  check('the occupational maps API answers for OCC0072, with SOC codes and labelled KSBs', live.status === 200 && occ.soc.length > 0 && occ.labels.length > 0)
}

console.log(failures ? `\n${failures} failed` : '\nAll passed')
process.exit(failures ? 1 : 0)
