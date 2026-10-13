// fetch-official.js - fetches the official data sets that have an API (plan
// of 13 October 2026) into RAREBIT_DATA, then loads them into Snowflake as
// DATA_LOAD_USER (scripts/load-data.js steps). Run by the scheduler
// (server/jobSchedule.js: official-nomis, official-api) or by hand:
//
//   npm run fetch:official -- nomis     claimant count and ASHE by area
//   npm run fetch:official -- api       KS4, destinations, apprenticeships
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

const RAREBIT_DATA = process.env.RAREBIT_DATA || '/mnt/c/Users/alanb/rarebit-data'
const NOMIS = 'https://www.nomisweb.co.uk/api/v01/dataset/'
const EES_API = 'https://api.education.gov.uk/statistics/v1/data-sets/'
const NOMIS_LIMIT = 25000
const AREAS = 'geography=2092957699,2092957699TYPE442,2092957699TYPE423,2092957699TYPE424' // England, combined authorities, LAs (April 2023)

export const NOMIS_SETS = [
  { id: 'NM_162_1', dir: 'claimant-count', base: 'claimant_count_nm_162_1', from: '',
    query: `${AREAS}&gender=0,1,2&age=0,2,10,11,3,4&measure=1,2&measures=20100`,
    select: 'date,date_name,geography_code,geography_name,geography_type,gender_name,age_name,measure_name,obs_value,obs_status_name' },
  ...[['NM_99_1', 'ashe_workplace_nm_99_1'], ['NM_30_1', 'ashe_resident_nm_30_1']].map(([id, base]) => ({ id, dir: 'ashe', base, from: '2015',
    query: `${AREAS}&sex=5,6,7,8,9&item=1,2,4,6,8,13,15&pay=1,5,6,7&measures=20100,20701`,
    select: 'date_name,geography_code,geography_name,geography_type,sex_name,item_name,pay_name,measures_name,obs_value,obs_status_name' })),
]

export const EES_SETS = [
  ['ks4-performance', '19e39901-a96c-be76-b9c2-6af54ae076d2'], ['ks4-performance', 'b3e19901-5d2b-b676-bb4c-e60937d74725'],
  ['destinations', '019d4f41-22d1-71b2-a1a7-f3b91026815b'], ['destinations', '019d4e73-6440-7523-b60c-bfab1ad4a30d'],
  ['apprenticeships', '1d419801-a90e-f970-9335-a13623faccbe'], ['apprenticeships', '1d419801-435d-c676-b428-1217e08290c3'],
].map(([dir, id]) => ({ dir, id }))

// The load:data steps each kind feeds.
export const LOAD_STEPS = { nomis: [14, 15], api: [17, 18, 19] }

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
  for (const set of kind === 'nomis' ? NOMIS_SETS : EES_SETS) {
    const f = kind === 'nomis' ? await fetchNomis(set, { log }) : await fetchEes(set, { log })
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
    console.error('Say nomis or api: npm run fetch:official -- nomis')
    process.exit(1)
  }
  const result = await runJob({ kind, load: !process.argv.includes('--no-load') })
  console.log(JSON.stringify(result))
}
