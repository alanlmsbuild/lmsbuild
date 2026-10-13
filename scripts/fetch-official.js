// fetch-official.js - fetches the official data sets that have an API (plan
// of 13 October 2026) into RAREBIT_DATA, then loads them into Snowflake as
// DATA_LOAD_USER (scripts/load-data.js steps). Run by the scheduler
// (server/jobSchedule.js: official-nomis, official-api) or by hand:
//
//   npm run fetch:official -- nomis     claimant count and ASHE by area
//   npm run fetch:official -- api       KS4, destinations, apprenticeships
//   npm run fetch:official -- statxplore  Universal Credit, Work and Health
//                                          Programme (scripts/load/statxplore.js)
//   add --no-load to fetch only
//
// Nomis: only what's new. Each fetch is a new file, <base>_<from>_<to>.csv,
// from the last period fetched before (published figures get revised, so
// it's fetched again) to the latest; nothing new, no file. The query is
// in <file>.source.txt. Fetched one period at a time, 25,000 rows a
// request (Nomis's limit for a request without a key).
// Explore education statistics API: a new file only for a new version of a
// data set, <id>_v<version>.csv, as the API serves it (unzipped).
// Old files are kept; the loader skips any file already loaded, and loads
// the latest version of each API data set.

import fs from 'node:fs'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { SX_SETS, fetchStatXplore } from './load/statxplore.js'

const RAREBIT_DATA = process.env.RAREBIT_DATA || '/mnt/c/Users/alanb/rarebit-data'
const NOMIS = 'https://www.nomisweb.co.uk/api/v01/dataset/'
const EES_API = 'https://api.education.gov.uk/statistics/v1/data-sets/'
const NOMIS_LIMIT = 25000
const AREAS = 'geography=2092957699,2092957699TYPE442,2092957699TYPE423,2092957699TYPE424' // England, combined authorities, LAs (April 2023)

// APS: % with each RQF level (4+, 3, 2, 1, other, none), all and of the
// economically active, all, male and female, aged 16 to 64.
const APS_RQF = '1902,1903,1904,1911,1912,1913,1920,1921,1922,1929,1930,1931,1938,1939,1940,1947,1948,1949,1956,1957,1958,1965,1966,1967,1974,1975,1976,1983,1984,1985,1992,1993,1994,2001,2002,2003,2010,2011,2012,2037,2038,2039,2040,2041,2042,2043,2044,2045,2046,2047,2048,2049,2050,2051,2052,2053,2054'
// The 88 SIC 2007 divisions (2 digits), as Nomis codes them.
const SIC_DIVISIONS = '146800641,146800642,146800643,146800645,146800646,146800647,146800648,146800649,146800650,146800651,146800652,146800653,146800654,146800655,146800656,146800657,146800658,146800659,146800660,146800661,146800662,146800663,146800664,146800665,146800666,146800667,146800668,146800669,146800670,146800671,146800672,146800673,146800675,146800676,146800677,146800678,146800679,146800681,146800682,146800683,146800685,146800686,146800687,146800689,146800690,146800691,146800692,146800693,146800695,146800696,146800698,146800699,146800700,146800701,146800702,146800703,146800704,146800705,146800706,146800708,146800709,146800710,146800711,146800712,146800713,146800714,146800715,146800717,146800718,146800719,146800720,146800721,146800722,146800724,146800725,146800726,146800727,146800728,146800730,146800731,146800732,146800733,146800734,146800735,146800736,146800737,146800738,146800739'

export const NOMIS_SETS = [
  { id: 'NM_162_1', dir: 'claimant-count', base: 'claimant_count_nm_162_1', from: '',
    query: `${AREAS}&gender=0,1,2&age=0,2,10,11,3,4&measure=1,2&measures=20100`,
    select: 'date,date_name,geography_code,geography_name,geography_type,gender_name,age_name,measure_name,obs_value,obs_status_name' },
  ...[['NM_99_1', 'ashe_workplace_nm_99_1'], ['NM_30_1', 'ashe_resident_nm_30_1']].map(([id, base]) => ({ id, dir: 'ashe', base, from: '2015',
    query: `${AREAS}&sex=5,6,7,8,9&item=1,2,4,6,8,13,15&pay=1,5,6,7&measures=20100,20701`,
    select: 'date_name,geography_code,geography_name,geography_type,sex_name,item_name,pay_name,measures_name,obs_value,obs_status_name' })),
  // Annual Population Survey: qualifications (RQF) and employment,
  // unemployment and inactivity rates, aged 16 to 64, with confidence.
  { id: 'NM_17_5', dir: 'aps', base: 'aps_nm_17_5', from: '',
    query: `${AREAS}&variable=45,83,84,111,${APS_RQF}&measures=20599,21003`,
    select: 'date,date_name,geography_code,geography_name,geography_type,variable_code,variable_name,measures_name,obs_value,obs_status_name' },
  // UK Business Counts: local units and enterprises by SIC 2007 division and size band.
  ...[['NM_141_1', 'ubc_local_units_nm_141_1'], ['NM_142_1', 'ubc_enterprises_nm_142_1']].map(([id, base]) => ({ id, dir: 'business-counts', base, from: '',
    query: `${AREAS}&industry=${SIC_DIVISIONS}&employment_sizeband=0,10,20,30,40&legal_status=0&measures=20100`,
    select: 'date_name,geography_code,geography_name,geography_type,industry_name,employment_sizeband_name,legal_status_name,measures_name,obs_value,obs_status_name' })),
  // Business Register and Employment Survey (open access): employees and employment by SIC 2007 division.
  { id: 'NM_189_1', dir: 'bres', base: 'bres_nm_189_1', from: '',
    query: `${AREAS}&industry=${SIC_DIVISIONS}&employment_status=1,4&measure=1&measures=20100`,
    select: 'date_name,geography_code,geography_name,geography_type,industry_name,employment_status_name,measure_name,measures_name,obs_value,obs_status_name' },
  // Census 2021: occupation (TS063) and industry (TS060) of usual residents in employment.
  { id: 'NM_2080_1', dir: 'census-2021', base: 'census_ts063_occupation_nm_2080_1', from: '',
    query: `${AREAS}&measures=20100,20301`,
    select: 'date_name,geography_code,geography_name,geography_type,c2021_occ_10_name,measures_name,obs_value,obs_status_name' },
  { id: 'NM_2077_1', dir: 'census-2021', base: 'census_ts060_industry_nm_2077_1', from: '',
    query: `${AREAS}&measures=20100,20301`,
    select: 'date_name,geography_code,geography_name,geography_type,c2021_ind_88_name,measures_name,obs_value,obs_status_name' },
]

export const EES_SETS = [
  ['ks4-performance', '19e39901-a96c-be76-b9c2-6af54ae076d2'], ['ks4-performance', 'b3e19901-5d2b-b676-bb4c-e60937d74725'],
  ['destinations', '019d4f41-22d1-71b2-a1a7-f3b91026815b'], ['destinations', '019d4e73-6440-7523-b60c-bfab1ad4a30d'],
  ['apprenticeships', '1d419801-a90e-f970-9335-a13623faccbe'], ['apprenticeships', '1d419801-435d-c676-b428-1217e08290c3'],
].map(([dir, id]) => ({ dir, id }))

// The load:data steps each kind feeds.
export const LOAD_STEPS = { nomis: [14, 15], api: [17, 18, 19], statxplore: [] }

async function get(url, tries = 4) {
  for (let t = 1; ; t++) {
    const res = await fetch(url)
    if (res.ok) return res
    if (t >= tries) throw new Error(`${url}: ${res.status} ${res.statusText}`)
    await new Promise((r) => setTimeout(r, 3000 * t))
  }
}

// The files fetched for a Nomis set so far, with the last period each
// covers (from its .source.txt: "... to <period>>").
export function nomisFetched(dir, base) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((n) => n.startsWith(base) && n.endsWith('.csv.source.txt')).map((n) => {
    const m = fs.readFileSync(path.join(dir, n), 'utf8').match(/ to ([^>]+)>/)
    return { file: path.join(dir, n.replace(/\.source\.txt$/, '')), to: m?.[1] ?? '' }
  })
}

export async function fetchNomis(set, { root = RAREBIT_DATA, log = console.log } = {}) {
  const dir = path.join(root, set.dir)
  fs.mkdirSync(dir, { recursive: true })
  const periods = (await (await get(`${NOMIS}${set.id}/time.def.sdmx.json`)).json()).structure.codelists.codelist[0].code
    .map((c) => String(c.value)).filter((v) => v >= set.from)
  const last = nomisFetched(dir, set.base).map((f) => f.to).sort().at(-1)
  const todo = last ? periods.filter((p) => p >= last) : periods
  if (!todo.some((p) => !last || p > last)) {
    log(`  ${set.id}: nothing new since ${last}`)
    return null
  }
  const file = path.join(dir, `${set.base}_${todo[0]}_${todo.at(-1)}.csv`)
  const out = fs.createWriteStream(`${file}.part`)
  let rows = 0
  for (const [i, p] of todo.entries()) {
    for (let offset = 0; ; offset += NOMIS_LIMIT) {
      const text = await (await get(`${NOMIS}${set.id}.data.csv?${set.query}&date=${p}&select=${set.select}&recordoffset=${offset}`)).text()
      const lines = text.replace(/\r?\n$/, '').split(/\r?\n/)
      out.write((i === 0 && offset === 0 ? lines : lines.slice(1)).join('\n') + '\n')
      rows += lines.length - 1
      if (lines.length - 1 < NOMIS_LIMIT) break
    }
  }
  out.end()
  await new Promise((r) => out.on('finish', r))
  fs.renameSync(`${file}.part`, file)
  fs.writeFileSync(`${file}.source.txt`, `${NOMIS}${set.id}.data.csv?${set.query}&date=<each of ${todo.length} dates, ${todo[0]} to ${todo.at(-1)}>&select=${set.select}\nFetched ${new Date().toISOString()}\n`)
  log(`  ${set.id}: ${path.basename(file)}, ${todo.length} period(s), ${rows} rows`)
  return file
}

export async function fetchEes(set, { root = RAREBIT_DATA, log = console.log } = {}) {
  const dir = path.join(root, set.dir)
  fs.mkdirSync(dir, { recursive: true })
  const version = (await (await get(`${EES_API}${set.id}`)).json()).latestVersion.version
  const file = path.join(dir, `${set.id}_v${version}.csv`)
  if (fs.existsSync(file)) {
    log(`  ${set.id}: version ${version} already fetched`)
    return null
  }
  const res = await get(`${EES_API}${set.id}/csv?dataSetVersion=${version}`)
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(`${file}.part`))
  fs.renameSync(`${file}.part`, file)
  log(`  ${set.id}: version ${version} fetched (${fs.statSync(file).size} bytes)`)
  return file
}

// Fetch one kind ('nomis' or 'api'), then load its steps as DATA_LOAD_USER.
// Returns the scheduler's result (scripts/job-run.js recordRun); a throw is
// recorded as failed.
export async function runJob({ kind, load = true, log = console.log }) {
  const fetched = []
  const sets = { nomis: NOMIS_SETS, api: EES_SETS, statxplore: SX_SETS }[kind]
  for (const set of sets) {
    const f = kind === 'nomis' ? await fetchNomis(set, { log }) : kind === 'api' ? await fetchEes(set, { log }) : await fetchStatXplore(set, { root: RAREBIT_DATA, log })
    if (f) fetched.push(path.basename(f))
  }
  const loaded = []
  if (load) {
    const { runStep } = await import('./load-data.js')
    const { Loader } = await import('./load/loader.js')
    const loader = await Loader.open(log)
    try {
      for (const n of LOAD_STEPS[kind]) {
        const r = await runStep(loader, n)
        loaded.push(...r.results.filter((x) => !x.skipped).map((x) => ({ table: x.table, rows: x.rowsLoaded })))
      }
    } finally {
      await loader.close()
    }
  }
  return { outcome: 'succeeded', summary: { fetched, loaded } }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const kind = process.argv[2]
  if (!LOAD_STEPS[kind]) {
    console.error('Say nomis, api or statxplore: npm run fetch:official -- nomis')
    process.exit(1)
  }
  const result = await runJob({ kind, load: !process.argv.includes('--no-load') })
  console.log(JSON.stringify(result))
}
