// import-skills.js - the Skills England import (replaces import:standards
// and import:ksbs). Run weekly by a scheduler:
//
//   npm run import:skills
//
// Two sources:
//   1. The standards API (no key, one request): every version of every
//      apprenticeship standard, with each version's knowledge, skills and
//      behaviours (KSBs), duties and options, its LARS code, start dates and
//      the published minimum off-the-job hours.
//      https://skillsengland.education.gov.uk/api/apprenticeshipstandards
//   2. The occupational maps API (SKILLS_ENGLAND_API_KEY, one request per
//      occupation, paced): each occupation's SOC codes, typical job titles
//      and keywords. It only has the current version of each occupation.
//
// Every record goes to RAW as returned (RAW.SE_STANDARD_VERSION, one row
// per version record since the whole file is over Snowflake's 16 MB VARIANT
// limit; RAW.SE_OCCUPATION) and is cleaned into SKILLS with MERGE on each
// table's key. Nothing is deleted: a complete run marks whatever it no
// longer saw as gone (GONEAT), and clears GONEAT on whatever comes back.
//
// KSB references (K1, S1, B1...) and duty references (D1...) come from the
// order each version lists them. For each occupation's current version, the
// maps API gives its own labels for the same KSBs (matched by Skills
// England's ID): every difference is logged in SKILLS_IMPORT_RUN.
// LABEL_MISMATCHES and the run carries on with ours. A duty that names a
// KSB its version doesn't list can't be linked: each such link is left out
// and recorded in SKILLS_IMPORT_RUN.UNMAPPED_LINKS. Options are numbered
// O1, O2... in the order listed, like duties, because a version can list
// two options under one ID (ST0363 1.0). Duties name options by ID: a link
// to an ID the version doesn't list, or lists more than once, is left out
// and recorded in SKILLS_IMPORT_RUN.OPTION_LINK_PROBLEMS, never guessed.
//
// The app only reads SKILLS; this import (and nothing in server/ or src/)
// writes it (npm run check:scoping). A run refuses to start while another
// is open. The key is never logged. Each run is logged to
// logs/import-skills/<date>.log (gitignored) as well as printed.

import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { connect, execute, destroy } from '../server/db.js'
import { makeLog, recordRun } from './job-run.js'

export const STANDARDS_URL = 'https://skillsengland.education.gov.uk/api/apprenticeshipstandards'
export const MAPS_API = 'https://occupational-maps-api.skillsengland.education.gov.uk/api/v1'
const MAPS_EXPAND = 'occupation.dutiesKSB,occupation.soc,occupation.typicaljobtitles,occupation.keywords,occupation.maphierarchy'
export const PAUSE_MS = 500
const TIMEOUT_MS = 30000
const MAX_RETRIES = 5

const text = (value) => {
  if (value === null || value === undefined) return null
  const t = String(value).trim()
  return t === '' ? null : t
}
const date = (value) => (value ? String(value).slice(0, 10) : null)
const number = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const n = Number(String(value).replace(/[£,]/g, ''))
  return Number.isFinite(n) ? n : null
}
const KSB_LISTS = [
  ['K', 'knowledges', 'knowledgeId'],
  ['S', 'skills', 'skillId'],
  ['B', 'behaviours', 'behaviourId'],
]

// The rows for one standard version record. KSBs and duties are labelled
// by order (K1, K2..., D1, D2...); a duty's mapped KSBs and options are
// Skills England IDs, turned into our references.
export function parseVersion(r) {
  const st = text(r.referenceNumber)
  const version = text(r.version ?? r.versionNumber)
  const key = { ST_REFERENCE: st, VERSION: version }
  const versionRow = {
    ...key,
    LARS_CODE: number(r.larsCode) || null,
    TITLE: text(r.title),
    LEVEL: number(r.level),
    STATUS: text(r.status),
    EARLIEST_START_DATE: date(r.earliestStartDate),
    LATEST_START_DATE: date(r.latestStartDate),
    LATEST_END_DATE: date(r.latestEndDate),
    TYPICAL_DURATION_MONTHS: number(r.typicalDuration),
    MIN_OTJ_HOURS: number(r.minimumHoursForCompliance),
    MAX_FUNDING: number(r.maxFunding),
    STANDARD_PAGE_URL: text(r.standardPageUrl ?? r.url),
    OCCUPATION_CODE: text(r.occupationCode),
    ROUTE: text(typeof r.route === 'object' && r.route !== null ? r.route.name ?? r.route.title : r.route),
    APPROVED_FOR_DELIVERY: date(r.approvedForDelivery),
    CORE_AND_OPTIONS: r.coreAndOptions === true,
  }
  const ksbs = []
  const ksbById = new Map()
  for (const [type, list, idField] of KSB_LISTS) {
    ;(Array.isArray(r[list]) ? r[list] : []).forEach((k, i) => {
      const detail = text(k?.detail)
      if (!detail) return
      const row = { ...key, KSB_TYPE: type, KSB_REFERENCE: `${type}${i + 1}`, SOURCE_ID: text(k[idField] ?? k.id), DETAIL: detail, SORT_ORDER: i + 1 }
      ksbs.push(row)
      if (row.SOURCE_ID) ksbById.set(row.SOURCE_ID, row)
    })
  }
  const options = (Array.isArray(r.options) ? r.options : []).filter((o) => o?.optionId).map((o, i) => ({
    ...key, OPTION_REFERENCE: `O${i + 1}`, OPTION_ID: text(o.optionId), TITLE: text(o.title) ?? '(no title)', OCCUPATION_CODE: text(o.occupationCode), SORT_ORDER: i + 1,
  }))
  const duties = []
  const dutyKsbs = []
  const dutyOptions = []
  const unmapped = []
  const optionProblems = []
  ;(Array.isArray(r.duties) ? r.duties : []).forEach((d, i) => {
    const detail = text(d?.dutyDetail)
    if (!detail) return
    const ref = `D${i + 1}`
    duties.push({ ...key, DUTY_REFERENCE: ref, SOURCE_ID: text(d.dutyID), DETAIL: detail, IS_CORE: d.isThisACoreDuty === 1 || d.isThisACoreDuty === true,
      CRITERIA: text(d.criteriaForMeasuringPerformance), SORT_ORDER: i + 1 })
    for (const [list, ids] of [['mappedKnowledge', d.mappedKnowledge], ['mappedSkills', d.mappedSkills], ['mappedBehaviour', d.mappedBehaviour]]) for (const id of ids ?? []) {
      const k = ksbById.get(String(id))
      if (!k) {
        unmapped.push({ st_reference: key.ST_REFERENCE, version: key.VERSION, duty_reference: ref, duty_id: text(d.dutyID), list, ksb_id: String(id) })
        continue
      }
      dutyKsbs.push({ ...key, DUTY_REFERENCE: ref, KSB_TYPE: k.KSB_TYPE, KSB_REFERENCE: k.KSB_REFERENCE })
    }
    for (const id of d.mappedOptions ?? []) {
      const matches = options.filter((o) => o.OPTION_ID === String(id))
      if (matches.length === 1) dutyOptions.push({ ...key, DUTY_REFERENCE: ref, OPTION_REFERENCE: matches[0].OPTION_REFERENCE, OPTION_ID: String(id) })
      else optionProblems.push({ st_reference: key.ST_REFERENCE, version: key.VERSION, duty_reference: ref, duty_id: text(d.dutyID), option_id: String(id),
        problem: matches.length ? 'option ID repeated' : 'no such option', options: matches.map((o) => o.OPTION_REFERENCE) })
    }
  })
  const unique = (rows, keyOf) => [...new Map(rows.map((x) => [keyOf(x), x])).values()]
  return {
    key,
    versionRow,
    ksbs,
    duties,
    dutyKsbs: unique(dutyKsbs, (x) => `${x.DUTY_REFERENCE} ${x.KSB_TYPE}${x.KSB_REFERENCE}`),
    options,
    dutyOptions: unique(dutyOptions, (x) => `${x.DUTY_REFERENCE} ${x.OPTION_REFERENCE}`),
    unmapped,
    optionProblems,
  }
}

// A reason to stop the run.
export class StopRun extends Error {}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// The standards file: { records, sha256 }. One request, no key.
export async function fetchStandards(fetchImpl = fetch) {
  let res
  try {
    res = await fetchImpl(STANDARDS_URL, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(300000) })
  } catch (err) {
    throw new StopRun(`The standards API didn't answer (${err.name}).`)
  }
  if (res.status !== 200) throw new StopRun(`The standards API answered HTTP ${res.status}.`)
  const body = await res.text()
  let records
  try {
    records = JSON.parse(body)
  } catch {
    throw new StopRun("The standards API's answer isn't JSON.")
  }
  if (!Array.isArray(records) || records.length === 0) throw new StopRun('The standards API returned no standards.')
  return { records, sha256: crypto.createHash('sha256').update(body).digest('hex') }
}

// One occupation from the maps API: { endpoint, status, body }, body null
// for 404. Waits PAUSE_MS between requests; on 429 or 5xx waits (Retry-After
// if given, else 2, 4, 8... seconds) and tries again, up to MAX_RETRIES;
// stops the run on a refused key.
export function makeMapsClient({ fetchImpl = fetch, key = process.env.SKILLS_ENGLAND_API_KEY, pauseMs = PAUSE_MS, sleep = wait } = {}) {
  let last = 0
  let requests = 0
  async function get(code) {
    if (!key) throw new StopRun('SKILLS_ENGLAND_API_KEY is missing from server/.env.')
    const endpoint = `/Occupations/${encodeURIComponent(code)}?expand=${MAPS_EXPAND}`
    for (let attempt = 0; ; attempt++) {
      const gap = last + pauseMs - Date.now()
      if (gap > 0) await sleep(gap)
      last = Date.now()
      requests++
      let res
      try {
        res = await fetchImpl(MAPS_API + endpoint, { headers: { 'X-API-KEY': key, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
      } catch (err) {
        if (attempt < MAX_RETRIES) {
          await sleep(2000 * 2 ** attempt)
          continue
        }
        throw new StopRun(`The occupational maps API didn't answer for ${code} (${err.name}).`)
      }
      if (res.status === 401 || res.status === 403) throw new StopRun(`The occupational maps API refused the key (HTTP ${res.status}).`)
      if ((res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
        const seconds = Number(res.headers.get('retry-after'))
        await sleep(Math.min(Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 2000 * 2 ** attempt, 120000))
        continue
      }
      if (res.status === 404) return { endpoint, status: 404, body: null }
      if (res.status !== 200) throw new StopRun(`The occupational maps API answered HTTP ${res.status} for ${code}.`)
      return { endpoint, status: 200, body: await res.json() }
    }
  }
  return { get, requests: () => requests }
}

// The rows for one occupation from the maps API, and its own KSB labels
// ({ id, type, label, detail }) for the cross-check.
export function parseOccupation(code, o) {
  const h = o.mapHierarchy ?? {}
  const profile = {
    OCCUPATION_CODE: code,
    TITLE: text(o.name),
    LEVEL: number(o.level),
    VERSION: text(o.versionNo),
    STATUS: number(o.status),
    STATUS_NAME: text(o.statusName),
    ROUTE: text(h.routeName),
    PATHWAY: text(h.pathwayName),
    SOC_2020_CODE: number(o.soc?.soc2020Code),
    STATUS_LAST_UPDATED: text(o.statusLastUpdated)?.slice(0, 19) ?? null,
  }
  const soc = []
  const add = (row) => {
    if (!soc.some((s) => s.SOC_VERSION === row.SOC_VERSION && s.SOC_KEY === row.SOC_KEY)) soc.push({ OCCUPATION_CODE: code, ...row })
  }
  for (const g of o.soc?.soc2020SubUnitGroups ?? []) {
    const c = text(g?.code)
    if (!c || !/^\d{4}(\/\d{2})?$/.test(c)) continue
    add({ SOC_VERSION: 'SOC2020', SOC_KEY: c, UNIT_GROUP: c.slice(0, 4), SUB_UNIT_GROUP: c.length > 4 ? c : null, IS_PRIMARY: g.isPrimary === true, DESCRIPTION: text(g.description) })
  }
  const unit2020 = text(o.soc?.soc2020Code)
  if (unit2020 && /^\d{4}$/.test(unit2020) && !soc.some((s) => s.SOC_VERSION === 'SOC2020' && s.UNIT_GROUP === unit2020)) {
    add({ SOC_VERSION: 'SOC2020', SOC_KEY: unit2020, UNIT_GROUP: unit2020, SUB_UNIT_GROUP: null, IS_PRIMARY: true, DESCRIPTION: text(o.soc?.soc2020Description) })
  }
  const unit2010 = text(o.soc?.soc2010Code)
  if (unit2010 && /^\d{4}$/.test(unit2010)) {
    add({ SOC_VERSION: 'SOC2010', SOC_KEY: unit2010, UNIT_GROUP: unit2010, SUB_UNIT_GROUP: null, IS_PRIMARY: true, DESCRIPTION: text(o.soc?.soc2010Description) })
  }
  const terms = []
  const seen = new Set()
  for (const [kind, list] of [['job title', o.typicalJobTitles], ['keyword', o.keywords]]) {
    for (const item of Array.isArray(list) ? list : []) {
      const term = text(typeof item === 'string' ? item : item?.name)?.slice(0, 300)
      if (!term || seen.has(`${kind} ${term.toLowerCase()}`)) continue
      seen.add(`${kind} ${term.toLowerCase()}`)
      terms.push({ OCCUPATION_CODE: code, KIND: kind, TERM: term })
    }
  }
  const labels = []
  for (const [type, list, idField] of KSB_LISTS) {
    for (const k of Array.isArray(o[list]) ? o[list] : []) {
      if (k?.id && k[idField]) labels.push({ id: String(k.id), type, label: String(k[idField]), detail: text(k.detail) })
    }
  }
  return { profile, soc, terms, labels }
}

// Where the maps API's label for a KSB (matched by Skills England's ID)
// differs from ours for the same version: [{ st_reference, version,
// ksb_type, ours, theirs, detail }]. ksbsById: our KSB rows for that
// version, by SOURCE_ID. A KSB the maps API has that our version hasn't is
// listed with ours null.
export function labelMismatches(labels, ksbsById, key) {
  const out = []
  for (const l of labels) {
    const ours = ksbsById.get(l.id)
    if (ours && ours.KSB_TYPE === l.type && ours.KSB_REFERENCE === l.label) continue
    out.push({ st_reference: key.ST_REFERENCE, version: key.VERSION, ksb_type: l.type, ours: ours?.KSB_REFERENCE ?? null, theirs: l.label, detail: (ours?.DETAIL ?? l.detail ?? '').slice(0, 200) })
  }
  return out
}

// Each SKILLS table: its key, its other columns, and their types (string
// unless given).
const STD = ['ST_REFERENCE', 'VERSION']
export const TABLES = {
  STANDARD_VERSION: { keys: STD, cols: ['LARS_CODE', 'TITLE', 'LEVEL', 'STATUS', 'EARLIEST_START_DATE', 'LATEST_START_DATE', 'LATEST_END_DATE',
    'TYPICAL_DURATION_MONTHS', 'MIN_OTJ_HOURS', 'MAX_FUNDING', 'STANDARD_PAGE_URL', 'OCCUPATION_CODE', 'ROUTE', 'APPROVED_FOR_DELIVERY', 'CORE_AND_OPTIONS'] },
  STANDARD_KSB: { keys: [...STD, 'KSB_TYPE', 'KSB_REFERENCE'], cols: ['SOURCE_ID', 'DETAIL', 'SORT_ORDER'] },
  STANDARD_DUTY: { keys: [...STD, 'DUTY_REFERENCE'], cols: ['SOURCE_ID', 'DETAIL', 'IS_CORE', 'CRITERIA', 'SORT_ORDER'] },
  STANDARD_DUTY_KSB: { keys: [...STD, 'DUTY_REFERENCE', 'KSB_TYPE', 'KSB_REFERENCE'], cols: [] },
  STANDARD_OPTION: { keys: [...STD, 'OPTION_REFERENCE'], cols: ['OPTION_ID', 'TITLE', 'OCCUPATION_CODE', 'SORT_ORDER'] },
  STANDARD_DUTY_OPTION: { keys: [...STD, 'DUTY_REFERENCE', 'OPTION_REFERENCE'], cols: ['OPTION_ID'] },
  OCCUPATION_PROFILE: { keys: ['OCCUPATION_CODE'], cols: ['TITLE', 'LEVEL', 'VERSION', 'STATUS', 'STATUS_NAME', 'ROUTE', 'PATHWAY', 'SOC_2020_CODE', 'STATUS_LAST_UPDATED'] },
  OCCUPATION_SOC: { keys: ['OCCUPATION_CODE', 'SOC_VERSION', 'SOC_KEY'], cols: ['UNIT_GROUP', 'SUB_UNIT_GROUP', 'IS_PRIMARY', 'DESCRIPTION'] },
  OCCUPATION_TERM: { keys: ['OCCUPATION_CODE', 'KIND', 'TERM'], cols: [] },
}
const TYPES = {
  LARS_CODE: 'number(5,0)', LEVEL: 'number(2,0)', TYPICAL_DURATION_MONTHS: 'number(3,0)', MIN_OTJ_HOURS: 'number(4,0)', MAX_FUNDING: 'number(8,0)',
  EARLIEST_START_DATE: 'date', LATEST_START_DATE: 'date', LATEST_END_DATE: 'date', APPROVED_FOR_DELIVERY: 'date',
  CORE_AND_OPTIONS: 'boolean', IS_CORE: 'boolean', IS_PRIMARY: 'boolean', SORT_ORDER: 'number(5,0)', STATUS: 'string',
  SOC_2020_CODE: 'number(4,0)', STATUS_LAST_UPDATED: 'timestamp_ntz',
}
// STATUS is text on STANDARD_VERSION and a number on OCCUPATION_PROFILE.
const typeOf = (table, c) => (table === 'OCCUPATION_PROFILE' && c === 'STATUS' ? 'number(3,0)' : TYPES[c] ?? 'string')

function mergeSql(table) {
  const { keys, cols } = TABLES[table]
  const all = [...keys, ...cols]
  const source = `(select ${all.map((c) => `f.value:${c}::${typeOf(table, c)} as ${c}`).join(', ')}, f.value:SOURCERESPONSEID::string as SOURCERESPONSEID
    from table(flatten(input => parse_json(?))) f)`
  const on = keys.map((k) => `t.${k} = s.${k}`).join(' and ')
  const differs = cols.length ? `hash(${cols.map((c) => `t.${c}`).join(', ')}) <> hash(${cols.map((c) => `s.${c}`).join(', ')})` : null
  return {
    changed: differs ? `select count(*) as N from ${source} s join SKILLS.${table} t on ${on} where ${differs}` : null,
    merge: `merge into SKILLS.${table} t using ${source} s on ${on}
      ${differs ? `when matched and ${differs} then update set ${cols.map((c) => `${c} = s.${c}`).join(', ')},
        LASTSEENAT = current_timestamp(), GONEAT = null, LASTCHANGEDAT = current_timestamp(), SOURCERESPONSEID = s.SOURCERESPONSEID` : ''}
      when matched then update set LASTSEENAT = current_timestamp(), GONEAT = null, SOURCERESPONSEID = s.SOURCERESPONSEID
      when not matched then insert (${all.join(', ')}, LASTSEENAT, LASTCHANGEDAT, SOURCERESPONSEID)
        values (${all.map((c) => `s.${c}`).join(', ')}, current_timestamp(), current_timestamp(), s.SOURCERESPONSEID)`,
    gone: `update SKILLS.${table} set GONEAT = current_timestamp()
      where GONEAT is null and coalesce(LASTSEENAT, '1900-01-01'::timestamp_ltz) < (select STARTEDAT from SKILLS.SKILLS_IMPORT_RUN where RUNID = ?)`,
  }
}
const SQL = Object.fromEntries(Object.keys(TABLES).map((t) => [t, mergeSql(t)]))
const affected = (result, kind) => Number(result?.[0]?.[`number of rows ${kind}`] ?? 0)

// Rows in pieces of at most ~2 MB of JSON.
function* chunks(rows, maxBytes = 2_000_000) {
  let piece = []
  let size = 0
  for (const row of rows) {
    const n = JSON.stringify(row).length
    if (piece.length > 0 && size + n > maxBytes) {
      yield piece
      piece = []
      size = 0
    }
    piece.push(row)
    size += n
  }
  if (piece.length > 0) yield piece
}

// Merges rows (each with SOURCERESPONSEID) into a SKILLS table: { added, changed }.
// Snowflake doesn't enforce primary keys, so rows repeating a key are
// refused here, before anything is written (npm run check:test-flags
// checks the tables too).
export async function mergeRows(connection, table, rows) {
  const seen = new Set()
  for (const row of rows) {
    const k = JSON.stringify(TABLES[table].keys.map((c) => row[c]))
    if (seen.has(k)) throw new Error(`Two ${table} rows for the same key ${k}: nothing written to ${table}`)
    seen.add(k)
  }
  const counts = { added: 0, changed: 0 }
  for (const piece of chunks(rows)) {
    const json = JSON.stringify(piece)
    if (SQL[table].changed) counts.changed += Number((await execute(connection, SQL[table].changed, [json]))[0].N)
    counts.added += affected(await execute(connection, SQL[table].merge, [json]), 'inserted')
  }
  return counts
}

const RAW_VERSIONS = `
  insert into RAW.SE_STANDARD_VERSION (RESPONSEID, RUNID, SOURCEURL, FILESHA256, ST_REFERENCE, VERSION, BODY)
  select f.value:RESPONSEID::string, ?, ?, ?, f.value:ST::string, f.value:V::string, f.value:BODY
  from table(flatten(input => parse_json(?))) f
`
const RAW_OCCUPATION = `
  insert into RAW.SE_OCCUPATION (RESPONSEID, RUNID, OCCUPATION_CODE, ENDPOINT, HTTPSTATUS, BODY)
  select ?, ?, ?, ?, ?, parse_json(?)
`
const START_RUN = `insert into SKILLS.SKILLS_IMPORT_RUN (RUNID) values (?)`
const OTHER_OPEN_RUNS = `
  select RUNID, to_varchar(convert_timezone('Europe/London', STARTEDAT), 'YYYY-MM-DD HH24:MI') || ' UK time' as STARTED from SKILLS.SKILLS_IMPORT_RUN
  where FINISHEDAT is null and STARTEDAT > dateadd(hour, -3, current_timestamp()) and RUNID <> ?
`
const FINISH_RUN = `
  update SKILLS.SKILLS_IMPORT_RUN set FINISHEDAT = current_timestamp(), COMPLETE = ?, REQUESTS = ?, FILESHA256 = ?,
    VERSIONS = ?, KSBS = ?, OCCUPATIONS = ?, ADDED = ?, CHANGED = ?, GONE = ?, LABEL_MISMATCHES = parse_json(?),
    UNMAPPED_LINKS = parse_json(?), OPTION_LINK_PROBLEMS = parse_json(?), ERROR = ?
  where RUNID = ?
`

// One run. Returns the counts, or { refused } when another run is open.
export async function runImport({ connection, fetchImpl = fetch, maps = makeMapsClient({ fetchImpl }), log = console.log }) {
  const runId = crypto.randomUUID()
  await execute(connection, START_RUN, [runId])
  const others = await execute(connection, OTHER_OPEN_RUNS, [runId])
  if (others.length > 0) {
    const why = `Another Skills England import is running (started ${others[0].STARTED}).`
    await execute(connection, FINISH_RUN, [false, 0, null, 0, 0, 0, 0, 0, 0, '[]', '[]', '[]', why, runId])
    log(`Not started: ${why}`)
    return { runId, refused: why }
  }
  const c = { runId, requests: 0, sha256: null, versions: 0, ksbs: 0, occupations: 0, notFound: 0, added: 0, changed: 0, gone: 0, mismatches: [], unmapped: [], optionProblems: [], complete: false, error: null }
  const tally = (counts) => {
    c.added += counts.added
    c.changed += counts.changed
  }
  try {
    // 1. Every version, with its KSBs, duties and options.
    const { records, sha256 } = await fetchStandards(fetchImpl)
    c.requests++
    c.sha256 = sha256
    const parsed = new Map()
    let skipped = 0
    for (const r of records) {
      const p = parseVersion(r)
      if (!/^ST\d{4}$/.test(p.key.ST_REFERENCE ?? '') || !p.key.VERSION) {
        skipped++
        continue
      }
      parsed.set(`${p.key.ST_REFERENCE} ${p.key.VERSION}`, { p, record: r, responseId: crypto.randomUUID() })
    }
    if (skipped || parsed.size !== records.length) log(`${records.length} version records: ${parsed.size} used, ${skipped} without a usable reference or version, ${records.length - skipped - parsed.size} repeated`)
    for (const piece of chunks([...parsed.values()].map(({ p, record, responseId }) => ({ RESPONSEID: responseId, ST: p.key.ST_REFERENCE, V: p.key.VERSION, BODY: record })))) {
      await execute(connection, RAW_VERSIONS, [runId, STANDARDS_URL, sha256, JSON.stringify(piece)])
    }
    const withId = (rows, responseId) => rows.map((row) => ({ ...row, SOURCERESPONSEID: responseId }))
    const all = (pick) => [...parsed.values()].flatMap(({ p, responseId }) => withId(pick(p), responseId))
    tally(await mergeRows(connection, 'STANDARD_VERSION', all((p) => [p.versionRow])))
    const ksbs = all((p) => p.ksbs)
    tally(await mergeRows(connection, 'STANDARD_KSB', ksbs))
    tally(await mergeRows(connection, 'STANDARD_DUTY', all((p) => p.duties)))
    tally(await mergeRows(connection, 'STANDARD_DUTY_KSB', all((p) => p.dutyKsbs)))
    tally(await mergeRows(connection, 'STANDARD_OPTION', all((p) => p.options)))
    tally(await mergeRows(connection, 'STANDARD_DUTY_OPTION', all((p) => p.dutyOptions)))
    c.versions = parsed.size
    c.ksbs = ksbs.length
    c.unmapped = [...parsed.values()].flatMap(({ p }) => p.unmapped)
    if (c.unmapped.length) log(`${c.unmapped.length} duty-to-KSB links name a KSB the version doesn't list: left out, recorded on the run`)
    c.optionProblems = [...parsed.values()].flatMap(({ p }) => p.optionProblems)
    if (c.optionProblems.length) log(`${c.optionProblems.length} duty-to-option links name an option the version doesn't list, or lists twice: left out, recorded on the run`)
    log(`Standards: ${c.versions} versions, ${c.ksbs} KSBs`)

    // 2. Each occupation: SOC codes, job titles, keywords, and its own KSB labels.
    const codes = [...new Set([...parsed.values()].flatMap(({ p }) => [p.versionRow.OCCUPATION_CODE, ...p.options.map((o) => o.OCCUPATION_CODE)]).filter(Boolean))].sort()
    const byOccupation = new Map()
    for (const { p } of parsed.values()) {
      const code = p.versionRow.OCCUPATION_CODE
      if (!code) continue
      if (!byOccupation.has(code)) byOccupation.set(code, [])
      byOccupation.get(code).push(p)
    }
    const occ = { profiles: [], soc: [], terms: [] }
    for (const [i, code] of codes.entries()) {
      const res = await maps.get(code)
      const responseId = crypto.randomUUID()
      await execute(connection, RAW_OCCUPATION, [responseId, runId, code, res.endpoint, res.status, JSON.stringify(res.body)])
      if (!res.body) {
        c.notFound++
        continue
      }
      const o = parseOccupation(code, res.body)
      occ.profiles.push(...withId([o.profile], responseId))
      occ.soc.push(...withId(o.soc, responseId))
      occ.terms.push(...withId(o.terms, responseId))
      c.occupations++
      // The cross-check: the version the maps API describes, else the
      // latest of this occupation's versions.
      const versions = byOccupation.get(code) ?? []
      const ours = versions.find((p) => p.key.VERSION === o.profile.VERSION) ??
        [...versions].sort((a, b) => String(a.versionRow.EARLIEST_START_DATE ?? '').localeCompare(String(b.versionRow.EARLIEST_START_DATE ?? ''))).at(-1)
      if (ours && o.labels.length > 0) c.mismatches.push(...labelMismatches(o.labels, new Map(ours.ksbs.filter((k) => k.SOURCE_ID).map((k) => [k.SOURCE_ID, k])), ours.key))
      if ((i + 1) % 100 === 0) log(`Occupations: ${i + 1} of ${codes.length}`)
    }
    c.requests += maps.requests()
    tally(await mergeRows(connection, 'OCCUPATION_PROFILE', occ.profiles))
    tally(await mergeRows(connection, 'OCCUPATION_SOC', occ.soc))
    tally(await mergeRows(connection, 'OCCUPATION_TERM', occ.terms))
    log(`Occupations: ${c.occupations} fetched, ${c.notFound} not in the occupational maps API`)

    // 3. Complete: whatever this run didn't see is gone.
    c.complete = true
    for (const table of Object.keys(TABLES)) c.gone += affected(await execute(connection, SQL[table].gone, [runId]), 'updated')
  } catch (err) {
    c.requests += maps.requests?.() ?? 0
    c.error = err instanceof StopRun ? err.message : `Stopped: ${err.message}`
    if (!(err instanceof StopRun)) {
      await execute(connection, FINISH_RUN, [false, c.requests, c.sha256, c.versions, c.ksbs, c.occupations, c.added, c.changed, 0, JSON.stringify(c.mismatches.slice(0, 5000)), JSON.stringify(c.unmapped.slice(0, 5000)), JSON.stringify(c.optionProblems.slice(0, 5000)), c.error.slice(0, 1000), runId])
      log(`Run stopped (recorded on run ${runId}): ${c.error}`)
      throw err
    }
  }
  await execute(connection, FINISH_RUN, [c.complete, c.requests, c.sha256, c.versions, c.ksbs, c.occupations, c.added, c.changed, c.gone,
    JSON.stringify(c.mismatches.slice(0, 5000)), JSON.stringify(c.unmapped.slice(0, 5000)), JSON.stringify(c.optionProblems.slice(0, 5000)), c.error?.slice(0, 1000) ?? null, runId])
  log(`Run ${c.complete ? 'complete' : 'stopped'}: ${c.requests} requests, ${c.versions} versions, ${c.ksbs} KSBs, ${c.occupations} occupations ` +
    `(${c.notFound} not found), ${c.added} added, ${c.changed} changed, ${c.gone} gone, ${c.mismatches.length} KSB label mismatches, ${c.unmapped.length} duty-to-KSB links left out, ${c.optionProblems.length} duty-to-option links left out${c.error ? `. ${c.error}` : ''}`)
  return c
}

// One run as a job (scripts/job-run.js): its outcome for OPS.JOB_RUN.
export async function runJob({ connection, log }) {
  const c = await runImport({ connection, log })
  return {
    outcome: c.refused ? 'refused' : c.complete ? 'succeeded' : 'failed',
    ref: c.runId,
    error: c.refused ?? c.error ?? null,
    summary: { requests: c.requests, versions: c.versions, ksbs: c.ksbs, occupations: c.occupations, added: c.added, changed: c.changed, gone: c.gone,
      labelMismatches: c.mismatches?.length ?? 0, unmappedLinks: c.unmapped?.length ?? 0, optionLinkProblems: c.optionProblems?.length ?? 0 },
  }
}

// Run by hand (npm run import:skills), recorded like a scheduled run.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const log = makeLog('import-skills')
  log('Skills England import started.')
  const connection = await connect()
  let result
  try {
    result = await recordRun({ connection, job: 'skills', triggeredBy: 'manual', log, run: (c) => runJob({ connection: c, log }) })
  } finally {
    await destroy(connection)
  }
  process.exit(result.outcome === 'succeeded' ? 0 : 1)
}
