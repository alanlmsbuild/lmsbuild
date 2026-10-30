// fetch-official.js - fetches the official data sets that have an API (plan
// of 13 October 2026) into RAREBIT_DATA, then loads them into Snowflake as
// DATA_LOAD_USER (scripts/load-data.js steps). Run by the scheduler
// (server/jobSchedule.js: official-nomis, official-api) or by hand:
//
//   npm run fetch:official -- nomis     claimant count and ASHE by area
//   npm run fetch:official -- api       KS4, destinations, apprenticeships
//   npm run fetch:official -- statxplore  Universal Credit, Work and Health
//                                          Programme (scripts/load/statxplore.js)
//   npm run fetch:official -- ons       online job adverts, VACS02 (new editions)
//   npm run fetch:official -- ofqual    the Ofqual register (if it changed)
//   npm run fetch:official -- advice    FCDO foreign travel advice: the countries that changed
//                                          (scripts/load/travel-advice.js; daily)
//   npm run fetch:official -- monthly   police.uk, APAR, NaPTAN, listed buildings,
//                                          Wikidata places (batch 6, each only if new)
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
import { withoutPersonalFields } from './load/ofqual.js'
import { fetchTravelAdvice } from './load/travel-advice.js'
import { NOMIS_SETS, nomisFetched } from './load/nomis-sets.js'

const RAREBIT_DATA = process.env.RAREBIT_DATA || '/mnt/c/Users/alanb/rarebit-data'
const NOMIS = 'https://www.nomisweb.co.uk/api/v01/dataset/'
const EES_API = 'https://api.education.gov.uk/statistics/v1/data-sets/'
// NOMIS_SETS and nomisFetched live in scripts/load/nomis-sets.js, which the load files import
// too (they can't import this file: it imports them back when it runs a load).
export { NOMIS_SETS, nomisFetched }
const NOMIS_LIMIT = 25000
// Key stage 4 performance (load:data step 17) is PAUSED from 22 October 2026:
// DfE's version 2.0 changed the layout, the loader refuses the new header, and
// the step failed on every run (the job retried each hour for nothing). The
// two data sets and the step go back in when plan 3 (Key stage 4 v2 tables,
// docs/ideas.md) is built: add KS4_EES_SETS to EES_SETS and 17 to
// LOAD_STEPS.api. `npm run load:data -- 17` still runs it by hand.
export const KS4_EES_SETS = [
  ['ks4-performance', '19e39901-a96c-be76-b9c2-6af54ae076d2'], ['ks4-performance', 'b3e19901-5d2b-b676-bb4c-e60937d74725'],
].map(([dir, id]) => ({ dir, id }))
export const EES_SETS = [
  ['destinations', '019d4f41-22d1-71b2-a1a7-f3b91026815b'], ['destinations', '019d4e73-6440-7523-b60c-bfab1ad4a30d'],
  ['apprenticeships', '1d419801-a90e-f970-9335-a13623faccbe'], ['apprenticeships', '1d419801-435d-c676-b428-1217e08290c3'],
].map(([dir, id]) => ({ dir, id }))

// The load:data steps each kind feeds (api: 17, Key stage 4, is paused: see KS4_EES_SETS).
export const LOAD_STEPS = { nomis: [14, 15, 26, 33], api: [18, 19], statxplore: [24], ons: [25, 29], ofqual: [27], advice: [51], monthly: [34, 35, 36, 38] }

// ONS datasets published as spreadsheets: a new file only for a new edition.
// The name is the file's own, with the edition added unless it's "current".
const ONS_SITE = 'https://www.ons.gov.uk'
export const ONS_SETS = [
  { dir: 'ons-online-adverts', page: '/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/datasets/labourdemandvolumesbystandardoccupationclassificationsoc2020uk' },
  { dir: 'ons-vacancies', page: '/employmentandlabourmarket/peoplenotinwork/unemployment/datasets/vacanciesbyindustryvacs02' },
]

// ONS refuses quick repeat requests (an empty reply): a pause, and tries.
async function onsJson(url) {
  for (let t = 1; ; t++) {
    await new Promise((r) => setTimeout(r, 4000))
    const res = await fetch(url, { headers: { 'user-agent': 'Rarebit data loader' } })
    const text = res.ok ? await res.text() : ''
    try { return JSON.parse(text) } catch { if (t >= 4) throw new Error(`${url}: ${res.status}, no JSON`) }
    await new Promise((r) => setTimeout(r, 10000 * t))
  }
}

export async function fetchOns(set, { root = RAREBIT_DATA, log = console.log } = {}) {
  const dir = path.join(root, set.dir)
  fs.mkdirSync(dir, { recursive: true })
  const edition = (await onsJson(`${ONS_SITE}${set.page}/data`)).datasets[0].uri
  const file = (await onsJson(`${ONS_SITE}${edition}/data`)).downloads[0].file
  const slug = edition.split('/').at(-1)
  const ext = path.extname(file)
  const name = slug === 'current' ? file : `${path.basename(file, ext)}_${slug}${ext}`
  const out = path.join(dir, name)
  if (fs.existsSync(out)) {
    log(`  ${name}: already fetched`)
    return null
  }
  await new Promise((r) => setTimeout(r, 4000))
  const res = await get(`${ONS_SITE}/file?uri=${edition}/${file}`)
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(`${out}.part`))
  fs.renameSync(`${out}.part`, out)
  log(`  ${name}: fetched (${fs.statSync(out).size} bytes)`)
  return out
}

// The Ofqual register (API, no key), every page, as JSON lines; a new
// dated file only if it differs from the last one fetched. 10,000 is the
// most the API accepts a page (it answers 400 above that; checked 22 October
// 2026), so the register is 6 calls, not about 270.
//
// Checked before anything is written (a failed check throws, and the
// scheduler records the run as failed):
//   - the records fetched equal the API's own count (a page that came back
//     short or empty, or a register that changed mid-fetch, is an error:
//     it used to end the fetch quietly with whatever it had)
//   - every record has a distinct key (the QAN or the recognition number)
//   - the fields are the same as in the last file (any added or removed)
//   - the register hasn't shrunk by more than OFQUAL_SHRINK_LIMIT
// A real change that trips the last two is accepted by running once with
// OFQUAL_ACCEPT_CHANGES=1.
//
// Organisation records are saved without their contact details (email, phone,
// postal address: scripts/load/ofqual.js), and the last file is read the same
// way, so one saved before that change still compares fine.
export const OFQUAL_PAGE_LIMIT = 10000
export const OFQUAL_SHRINK_LIMIT = 0.05
const OFQUAL_KEYS = { Qualifications: 'qualificationNumber', Organisations: 'recognitionNumber' }

// What is wrong with a fetched set of records, as a list of sentences:
// `records` against `count`, and against `previous` (the last file's records,
// or null). Pure, for the tests.
export function ofqualProblems(what, records, count, previous, { acceptChanges = false } = {}) {
  const key = OFQUAL_KEYS[what]
  const problems = []
  if (records.length !== count) problems.push(`fetched ${records.length} records but the API says ${count}`)
  const present = records.map((r) => r[key]).filter((k) => k !== undefined && k !== null && k !== '')
  const repeated = present.length - new Set(present).size
  const missing = records.length - present.length
  if (repeated || missing) problems.push(`${repeated} repeated and ${missing} missing ${key}`)
  if (previous && !acceptChanges) {
    const fields = (rs) => new Set(rs.flatMap((r) => Object.keys(r)))
    const was = fields(previous)
    const now = fields(records)
    const added = [...now].filter((k) => !was.has(k))
    const removed = [...was].filter((k) => !now.has(k))
    if (added.length || removed.length) problems.push(`the fields changed (added: ${added.join(', ') || 'none'}; removed: ${removed.join(', ') || 'none'})`)
    if (previous.length && records.length < previous.length * (1 - OFQUAL_SHRINK_LIMIT)) problems.push(`the register shrank from ${previous.length} to ${records.length} records (more than ${OFQUAL_SHRINK_LIMIT * 100}%)`)
  }
  return problems
}

export async function fetchOfqual(what, { root = RAREBIT_DATA, log = console.log, getJson = async (url) => (await get(url)).json(), acceptChanges = process.env.OFQUAL_ACCEPT_CHANGES === '1' } = {}) {
  const dir = path.join(root, 'ofqual')
  fs.mkdirSync(dir, { recursive: true })
  const out = path.join(dir, `ofqual_${what.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.jsonl`)
  const records = []
  let count = Infinity
  for (let page = 1; records.length < count; page++) {
    let d
    for (let t = 1; !d; t++) {
      try { d = await getJson(`https://register-api.ofqual.gov.uk/api/${what}?page=${page}&limit=${OFQUAL_PAGE_LIMIT}`) } catch (e) { if (t >= 6) throw e; await new Promise((r) => setTimeout(r, 2000 * t)) }
    }
    if (page > 1 && d.count !== count) throw new Error(`Ofqual ${what}: the register changed while it was being fetched (${count} records, then ${d.count}); will try again`)
    count = d.count
    if (!d.results.length) break
    records.push(...d.results)
  }
  if (what === 'Organisations') records.forEach((r, i) => { records[i] = withoutPersonalFields(r) })
  const previous = fs.readdirSync(dir).filter((n) => n.startsWith(`ofqual_${what.toLowerCase()}_`) && n.endsWith('.jsonl')).sort().at(-1)
  const previousText = previous ? fs.readFileSync(path.join(dir, previous), 'utf8') : null
  const problems = ofqualProblems(what, records, count, previousText ? previousText.split('\n').filter(Boolean).map((l) => (what === 'Organisations' ? withoutPersonalFields(JSON.parse(l)) : JSON.parse(l))) : null, { acceptChanges })
  if (problems.length) throw new Error(`Ofqual ${what}: not saved: ${problems.join('; ')}.${problems.some((p) => /^the (fields changed|register shrank)/.test(p)) ? ' (A real change: run once with OFQUAL_ACCEPT_CHANGES=1.)' : ''}`)
  const text = records.map((x) => JSON.stringify(x)).join('\n') + '\n'
  if (previousText === text) {
    log(`  Ofqual ${what}: no change since ${previous}`)
    return null
  }
  fs.writeFileSync(out, text)
  log(`  Ofqual ${what}: ${records.length} records, ${path.basename(out)}`)
  return out
}

async function get(url, tries = 4, headers = {}) {
  for (let t = 1; ; t++) {
    const res = await fetch(url, { headers })
    if (res.ok) return res
    if (t >= tries) throw new Error(`${url}: ${res.status} ${res.statusText}`)
    await new Promise((r) => setTimeout(r, 3000 * t))
  }
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


// ---------------------------------------------------------------- monthly (batch 6)
// Each a new dated file only if it differs from the last one kept.
const today = () => new Date().toISOString().slice(0, 10)
function keepIfNew(dir, prefix, ext, file, log, label) {
  const previous = fs.readdirSync(dir).filter((n) => n.startsWith(prefix) && n.endsWith(ext) && path.join(dir, n) !== file).sort().at(-1)
  if (previous && fs.readFileSync(path.join(dir, previous)).equals(fs.readFileSync(file))) {
    fs.rmSync(file)
    log(`  ${label}: no change since ${previous}`)
    return null
  }
  log(`  ${label}: ${path.basename(file)} (${fs.statSync(file).size} bytes)`)
  return file
}
async function download(url, file, headers = {}) {
  const res = await get(url, 4, headers)
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(`${file}.part`))
  fs.renameSync(`${file}.part`, file)
}

// police.uk: the latest 3-year archive, only if the server's copy is newer
// than the last one kept (its Last-Modified date names the file).
async function fetchPolice({ root = RAREBIT_DATA, log }) {
  const dir = path.join(root, 'police-uk'); fs.mkdirSync(dir, { recursive: true })
  const head = await fetch('https://data.police.uk/data/archive/latest.zip', { method: 'HEAD' })
  const stamp = new Date(head.headers.get('last-modified') ?? Date.now()).toISOString().slice(0, 10)
  const file = path.join(dir, `police-uk-archive-${stamp}.zip`)
  const kept = fs.readdirSync(dir).filter((n) => /^police-uk-archive-.*\.zip$/.test(n)).sort()
  if (kept.length && kept.at(-1).slice(18, 28) >= stamp) { log(`  police.uk: nothing newer than ${kept.at(-1)}`); return null }
  await download('https://data.police.uk/data/archive/latest.zip', file)
  log(`  police.uk: ${path.basename(file)} (${fs.statSync(file).size} bytes)`)
  return file
}
async function fetchApar({ root = RAREBIT_DATA, log }) {
  const dir = path.join(root, 'apar'); fs.mkdirSync(dir, { recursive: true })
  const page = await (await get('https://download.apprenticeships.education.gov.uk')).text()
  const link = page.match(/apar\/downloadcsv\?filename=([^"&]+)/)
  if (!link) throw new Error('APAR: no CSV link on the download page')
  const file = path.join(dir, link[1])
  if (fs.existsSync(file)) { log(`  APAR: ${link[1]} already fetched`); return null }
  await download(`https://download.apprenticeships.education.gov.uk/${link[0]}`, file)
  return keepIfNew(dir, 'apar-', '.csv', file, log, 'APAR')
}
async function fetchNaptan({ root = RAREBIT_DATA, log }) {
  const dir = path.join(root, 'naptan'); fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `naptan_stops_${today()}.csv`)
  if (fs.existsSync(file)) { log('  NaPTAN: fetched today already'); return null }
  await download('https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=csv', file)
  return keepIfNew(dir, 'naptan_stops_', '.csv', file, log, 'NaPTAN')
}
// Historic England's listed building points (ArcGIS, 2,000 a request).
const HE = 'https://services-eu1.arcgis.com/ZOdPfBS3aqqDYPUQ/arcgis/rest/services/National_Heritage_List_for_England_NHLE_v02_VIEW/FeatureServer/0/query'
const HE_FIELDS = ['OBJECTID', 'ListEntry', 'Name', 'Grade', 'ListDate', 'AmendDate', 'CaptureScale', 'hyperlink', 'NGR', 'Easting', 'Northing']
async function fetchListed({ root = RAREBIT_DATA, log }) {
  const dir = path.join(root, 'historic-england'); fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `listed_building_points_${today()}.csv`)
  if (fs.existsSync(file)) { log('  listed buildings: fetched today already'); return null }
  const q = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`
  const lines = [HE_FIELDS.map(q).join(',')]
  for (let off = 0; ; off += 2000) {
    const d = await (await get(`${HE}?where=1%3D1&outFields=${HE_FIELDS.join(',')}&orderByFields=OBJECTID&resultOffset=${off}&resultRecordCount=2000&returnGeometry=false&f=json`)).json()
    if (d.error) throw new Error(`Historic England: ${JSON.stringify(d.error)}`)
    for (const f of d.features ?? []) lines.push(HE_FIELDS.map((k) => q(['ListDate', 'AmendDate'].includes(k) && f.attributes[k] ? new Date(f.attributes[k]).toISOString().slice(0, 10) : f.attributes[k])).join(','))
    if ((d.features ?? []).length < 2000 && !d.exceededTransferLimit) break
  }
  fs.writeFileSync(file, lines.join('\n') + '\n')
  fs.writeFileSync(`${file}.source.txt`, `${HE}?where=1=1&outFields=${HE_FIELDS.join(',')}&orderByFields=OBJECTID (paged, 2000 a request; dates as YYYY-MM-DD) <each of ${lines.length - 1} rows, 0 to ${lines.length - 1}>\nFetched ${new Date().toISOString()}\n`)
  const kept = keepIfNew(dir, 'listed_building_points_', '.csv', file, log, 'listed buildings')
  if (!kept) fs.rmSync(`${file}.source.txt`, { force: true })
  return kept
}
// Wikidata places with an English GSS code. Identifies itself without any
// personal contact details.
const WIKIDATA_QUERY = `SELECT ?item ?gss ?itemLabel ?itemDescription ?inception ?coord ?type WHERE {
  ?item wdt:P836 ?gss .
  FILTER(STRSTARTS(?gss, "E"))
  OPTIONAL { ?item wdt:P571 ?inception . }
  OPTIONAL { ?item wdt:P625 ?coord . }
  OPTIONAL { ?item wdt:P31 ?type . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
`
async function fetchWikidata({ root = RAREBIT_DATA, log }) {
  const dir = path.join(root, 'wikidata'); fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `wikidata_england_gss_places_${today()}.csv`)
  if (fs.existsSync(file)) { log('  Wikidata: fetched today already'); return null }
  await download(`https://query.wikidata.org/sparql?query=${encodeURIComponent(WIKIDATA_QUERY)}`, file, { Accept: 'text/csv', 'User-Agent': 'RarebitDataLoader/1.0' })
  fs.writeFileSync(`${file}.query.rq`, WIKIDATA_QUERY)
  const kept = keepIfNew(dir, 'wikidata_england_gss_places_', '.csv', file, log, 'Wikidata')
  if (!kept) fs.rmSync(`${file}.query.rq`, { force: true })
  return kept
}
export const MONTHLY_FETCHES = [fetchPolice, fetchApar, fetchNaptan, fetchListed, fetchWikidata]

// Fetch one kind ('nomis', 'api', ...), then load its steps as DATA_LOAD_USER.
// Returns the scheduler's result (scripts/job-run.js recordRun).
// Each fetch and each load step is independent: one failing doesn't stop the
// others. All fine: succeeded. Some failed: partial (not a success, so the
// job is tried again in an hour; steps already loaded are skipped by their
// checksum), with which failed in the summary and the error. Every load step
// failed: failed. `deps` is for tests: fetchOne, runStep, openLoader.
const setName = (set, i) => (typeof set === 'string' ? set : Array.isArray(set) ? set.join(' ') : set?.id ?? set?.dir ?? set?.name ?? `set ${i + 1}`)

export async function runJob({ kind, load = true, log = console.log, deps = {} }) {
  const fetched = []
  const failed = []
  const sets = { nomis: NOMIS_SETS, api: EES_SETS, statxplore: SX_SETS, ons: ONS_SETS, ofqual: ['Qualifications', 'Organisations'], advice: ['index'], monthly: MONTHLY_FETCHES }[kind]
  const fetchOne = deps.fetchOne ?? { nomis: (s) => fetchNomis(s, { log }), api: (s) => fetchEes(s, { log }), statxplore: (s) => fetchStatXplore(s, { root: RAREBIT_DATA, log }),
    ons: (s) => fetchOns(s, { log }), ofqual: (s) => fetchOfqual(s, { log }), advice: () => fetchTravelAdvice({ root: RAREBIT_DATA, log }), monthly: (f) => f({ log }) }[kind]
  let attempts = 0
  for (const [i, set] of sets.entries()) {
    attempts++
    try {
      const f = await fetchOne(set)
      if (f) fetched.push(path.basename(f))
    } catch (err) {
      failed.push({ stage: 'fetch', name: setName(set, i), error: err.message })
      log(`fetch ${setName(set, i)} failed: ${err.message}`)
    }
  }
  const loaded = []
  if (load) {
    const { runStep: realRunStep, STEPS } = await import('./load-data.js')
    const runStep = deps.runStep ?? realRunStep
    const loader = deps.openLoader ? await deps.openLoader(log) : await (await import('./load/loader.js')).Loader.open(log)
    try {
      for (const n of LOAD_STEPS[kind]) {
        attempts++
        try {
          const r = await runStep(loader, n)
          loaded.push(...r.results.filter((x) => !x.skipped).map((x) => ({ table: x.table, rows: x.rowsLoaded })))
        } catch (err) {
          failed.push({ stage: 'load', step: n, name: STEPS?.[n]?.job ?? `step ${n}`, error: err.message })
          log(`load step ${n} (${STEPS?.[n]?.job ?? '?'}) failed: ${err.message}`)
        }
      }
    } finally {
      await loader.close()
    }
  }
  const summary = { fetched, loaded, ...(failed.length ? { failed, attempted: attempts } : {}) }
  if (!failed.length) return { outcome: 'succeeded', summary }
  const error = `${failed.length} of ${attempts} failed: ${failed.map((f) => `${f.name}: ${f.error}`).join('; ')}`.slice(0, 900)
  // Failed when nothing the job is for got done: every load step failed (or,
  // with --no-load, every fetch).
  const main = failed.filter((f) => f.stage === (load ? 'load' : 'fetch')).length
  const mainTotal = load ? LOAD_STEPS[kind].length : sets.length
  return { outcome: main === mainTotal ? 'failed' : 'partial', error, summary }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const kind = process.argv[2]
  if (!LOAD_STEPS[kind]) {
    console.error('Say nomis, api, statxplore, ons, ofqual, advice or monthly: npm run fetch:official -- nomis')
    process.exit(1)
  }
  const result = await runJob({ kind, load: !process.argv.includes('--no-load') })
  console.log(JSON.stringify(result))
  process.exitCode = result.outcome === 'succeeded' ? 0 : 1
}
