// import-ksbs.js - load each apprenticeship standard's duties, knowledge,
// skills and behaviours (KSBs) from the Skills England occupational maps API
// into the CAPTURE_DB.SKILLS schema.
//
// Usage:
//   npm run import:ksbs                         standards our learners are on
//   npm run import:ksbs -- --all                every standard open for new starts
//   npm run import:ksbs -- --only ST0072        just one ST reference (for trying things out)
//   npm run import:ksbs -- --dry-run            fetch and check, but write nothing
//   npm run import:ksbs -- --dry-run --fixture <file>
//                                               parse a saved API response only:
//                                               no API calls, no Snowflake
//
// The API key is read from server/.env as SKILLS_ENGLAND_API_KEY and sent
// in the X-API-KEY header. API docs:
// https://occupational-maps-api.skillsengland.education.gov.uk/swagger/index.html
//
// Linking our standards to the API: the API identifies occupations by codes
// like OCC0135 and has no field for the LARS code or ST reference. But each
// occupation lists its "products", and an apprenticeship's product code is
// its ST reference - and the search endpoint matches on product codes. So
// each ST reference is searched for, and the occupation whose products
// include exactly that code is used. Links found on an earlier run are
// reused from SKILLS.OCCUPATION, so re-runs only fetch the occupation itself.
//
// Everything is fetched and checked before anything is written. Then, in one
// transaction, each fetched occupation is MERGEd into OCCUPATION and its
// duties, KSBs and duty-KSB links are replaced - so a re-run updates rather
// than duplicates, and KSBs dropped from a new version of a standard go too.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import dotenv from 'dotenv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCHEMA = 'SKILLS'

// The base URL can be overridden for testing against a local stand-in.
const DEFAULT_API_BASE_URL = 'https://occupational-maps-api.skillsengland.education.gov.uk/api/v1'
const EXPAND = [
  'occupation.dutiesKSB',
  'occupation.products',
  'occupation.overview',
  'occupation.summary',
  'occupation.maphierarchy',
  'occupation.soc',
  'occupation.links',
].join(',')

// Be gentle with the API: one request at a time with a pause between them,
// and on 429 (rate limited) or a server error, wait and try again.
const PAUSE_MS = 500
const MAX_RETRIES = 5
const MAX_RETRY_WAIT_MS = 120_000
const REQUEST_TIMEOUT_MS = 30_000

const KSB_TYPES = [
  { type: 'K', list: 'knowledges', idField: 'knowledgeId', mappedIds: 'mappedKnowledgeIds', mappedText: 'mappedKnowledge' },
  { type: 'S', list: 'skills', idField: 'skillId', mappedIds: 'mappedSkillsIds', mappedText: 'mappedSkills' },
  { type: 'B', list: 'behaviours', idField: 'behaviourId', mappedIds: 'mappedBehaviourIds', mappedText: 'mappedBehaviour' },
]

// ---------------------------------------------------------------- parsing

const text = (v) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim())
const int = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Math.trunc(Number(v)))
const upper = (v) => text(v)?.toUpperCase() ?? null
const ST_REFERENCE = /^ST\d{4}$/i

// The apprenticeship ST references among an occupation's products.
function stReferencesIn(occupation) {
  const codes = (occupation.products ?? []).map((p) => upper(p?.productCode)).filter(Boolean)
  return [...new Set(codes.filter((c) => ST_REFERENCE.test(c)))]
}

// Turns one Occupation response into rows for OCCUPATION, DUTY, KSB and
// DUTY_KSB. `standard` is the LARS standard it was fetched for
// ({ stReference, larsCode }), or null for a fixture, in which case the ST
// reference comes from the occupation's own products. Returns
// { rows, stats, problems, warnings }: problems mean the occupation can't be
// loaded; warnings are worth knowing but don't stop it.
export function parseOccupation(json, standard = null) {
  const problems = []
  const warnings = []

  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { rows: null, stats: null, problems: ['response is not a single occupation object'], warnings }
  }

  const occupationCode = upper(json.stdCode)
  if (!occupationCode) problems.push('occupation has no stdCode')
  if (!text(json.name)) problems.push('occupation has no name')

  const productRefs = stReferencesIn(json)
  let stReference = standard?.stReference ?? null
  if (stReference && !productRefs.includes(stReference)) {
    problems.push(`none of its products has code ${stReference} (found ${productRefs.join(', ') || 'none'})`)
  }
  if (!stReference) {
    if (productRefs.length === 1) stReference = productRefs[0]
    else if (productRefs.length > 1) warnings.push(`several ST references in products: ${productRefs.join(', ')}`)
    else warnings.push('no ST reference found in products')
  }

  // KSBs. References are normally K1, S2, B3...; if a list doesn't look like
  // that, number it by position instead so every KSB still has one.
  const ksbs = []
  const ksbLookup = { K: new Map(), S: new Map(), B: new Map() }
  const counts = { K: 0, S: 0, B: 0 }
  for (const { type, list, idField } of KSB_TYPES) {
    const items = Array.isArray(json[list]) ? json[list] : []
    if (!Array.isArray(json[list])) warnings.push(`no ${list} in the response - was occupation.dutiesKSB expanded?`)
    const pattern = new RegExp(`^${type}\\d+[a-z]?$`, 'i')
    const given = items.map((item) => upper(item?.[idField]))
    const usePosition = !given.every((ref) => ref && pattern.test(ref))
    if (usePosition && items.length > 0) warnings.push(`${list} references numbered by position (${type}1, ${type}2, ...)`)

    const seen = new Set()
    items.forEach((item, index) => {
      const reference = usePosition ? `${type}${index + 1}` : given[index]
      if (seen.has(reference)) problems.push(`duplicate ${type} reference ${reference}`)
      seen.add(reference)
      const detail = text(item?.detail)
      if (!detail) warnings.push(`${reference} has no text`)
      const row = {
        OCCUPATION_CODE: occupationCode,
        KSB_TYPE: type,
        KSB_REFERENCE: reference,
        API_ID: text(item?.id),
        DETAIL: detail,
        SORT_ORDER: index + 1,
      }
      ksbs.push(row)
      // A duty can point at a KSB by its id, its reference or its text.
      for (const key of [row.API_ID, text(item?.[idField]), reference, detail]) {
        if (key && !ksbLookup[type].has(key.toUpperCase())) ksbLookup[type].set(key.toUpperCase(), reference)
      }
    })
    counts[type] = items.length
  }
  // Loading replaces an occupation's KSBs, so a response without any must
  // never get that far - it would wipe out the ones already stored.
  if (counts.K + counts.S + counts.B === 0) problems.push('no knowledge, skills or behaviours in the response')

  // Duties, and which KSBs each relates to.
  const duties = []
  const dutyKsbs = []
  let unresolved = 0
  const unresolvedExamples = []
  const dutyItems = Array.isArray(json.duties) ? json.duties : []
  const dutyRefsGiven = dutyItems.map((d) => upper(d?.dutyId))
  const dutyByPosition = !dutyRefsGiven.every((ref) => ref && /^D\d+[a-z]?$/i.test(ref))
  if (dutyByPosition && dutyItems.length > 0) warnings.push('duty references numbered by position (D1, D2, ...)')
  const seenDuties = new Set()
  dutyItems.forEach((duty, index) => {
    const reference = dutyByPosition ? `D${index + 1}` : dutyRefsGiven[index]
    if (seenDuties.has(reference)) problems.push(`duplicate duty reference ${reference}`)
    seenDuties.add(reference)
    duties.push({
      OCCUPATION_CODE: occupationCode,
      DUTY_REFERENCE: reference,
      API_ID: text(duty?.id),
      DETAIL: text(duty?.dutyDetail),
      IS_CORE: duty?.isThisACoreDuty === true,
      CRITERIA: text(duty?.criteriaForMeasuringPerformance),
      SORT_ORDER: index + 1,
    })

    for (const { type, mappedIds, mappedText } of KSB_TYPES) {
      // Prefer the ids; fall back to the text list if there are no ids.
      const ids = Array.isArray(duty?.[mappedIds]) ? duty[mappedIds] : []
      const keys = ids.length > 0 ? ids : Array.isArray(duty?.[mappedText]) ? duty[mappedText] : []
      const linked = new Set()
      for (const key of keys) {
        const ksbRef = ksbLookup[type].get(String(key ?? '').trim().toUpperCase())
        if (!ksbRef) {
          unresolved++
          if (unresolvedExamples.length < 3) unresolvedExamples.push(`${reference} -> ${type} '${key}'`)
          continue
        }
        if (linked.has(ksbRef)) continue
        linked.add(ksbRef)
        dutyKsbs.push({ OCCUPATION_CODE: occupationCode, DUTY_REFERENCE: reference, KSB_TYPE: type, KSB_REFERENCE: ksbRef })
      }
    }
  })
  if (unresolved > 0) {
    warnings.push(`${unresolved} duty-KSB link(s) point at KSBs not in the response, e.g. ${unresolvedExamples.join('; ')}`)
  }

  const hierarchy = json.mapHierarchy ?? {}
  const occupation = {
    OCCUPATION_CODE: occupationCode,
    ST_REFERENCE: stReference,
    LARS_STANDARD_CODE: standard?.larsCode ?? null,
    TITLE: text(json.name),
    LEVEL: int(json.level),
    VERSION: text(json.versionNo),
    STATUS: int(json.status),
    STATUS_NAME: text(json.statusName),
    OVERVIEW: text(json.overview),
    SUMMARY: text(json.summary),
    ROUTE_NAME: text(hierarchy.routeName),
    PATHWAY_NAME: text(hierarchy.pathwayName),
    SOC_2020_CODE: int(json.soc?.soc2020Code),
    STATUS_LAST_UPDATED: text(json.statusLastUpdated),
    RAW_RESPONSE: JSON.stringify(json),
  }

  const stats = {
    occupation_code: occupationCode,
    st_reference: stReference,
    lars_standard_code: occupation.LARS_STANDARD_CODE,
    title: occupation.TITLE,
    duties: duties.length,
    knowledge: counts.K,
    skills: counts.S,
    behaviours: counts.B,
    duty_ksb_links: dutyKsbs.length,
    links_unresolved: unresolved,
  }
  return { rows: { occupation, duties, ksbs, dutyKsbs }, stats, problems, warnings }
}

// ---------------------------------------------------------------- API

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

class FatalApiError extends Error {}

// A small client that keeps to one request at a time with a pause between
// requests, and backs off and retries when rate limited. The key is only
// ever put in the request header - never in a URL or a log line.
export function createApiClient({ apiKey, baseUrl = DEFAULT_API_BASE_URL, pauseMs = PAUSE_MS, log = console.log }) {
  let lastRequestAt = 0

  async function get(pathAndQuery) {
    for (let attempt = 0; ; attempt++) {
      const wait = lastRequestAt + pauseMs - Date.now()
      if (wait > 0) await sleep(wait)
      lastRequestAt = Date.now()

      let res
      try {
        res = await fetch(`${baseUrl}${pathAndQuery}`, {
          headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch (err) {
        if (attempt >= MAX_RETRIES) throw new Error(`could not reach the API: ${err.message}`)
        await backOff(attempt, null, `network error (${err.message})`)
        continue
      }

      if (res.status === 429 || res.status >= 500) {
        if (attempt >= MAX_RETRIES) throw new Error(`API still returning ${res.status} after ${MAX_RETRIES} retries`)
        await backOff(attempt, res.headers.get('retry-after'), res.status === 429 ? 'rate limited (429)' : `server error (${res.status})`)
        continue
      }
      if (res.status === 404) return null
      if (res.status === 401 || res.status === 403) {
        const body = (await res.text()).trim().slice(0, 200)
        throw new FatalApiError(`the API refused the request (${res.status}${body ? `: ${body}` : ''}). Check SKILLS_ENGLAND_API_KEY.`)
      }
      if (!res.ok) {
        const body = (await res.text()).trim().slice(0, 200)
        throw new Error(`API returned ${res.status}${body ? `: ${body}` : ''}`)
      }
      return res.json()
    }
  }

  // Honour Retry-After when it's given in seconds; otherwise wait 2s, 4s,
  // 8s, ... Either way, never more than MAX_RETRY_WAIT_MS.
  async function backOff(attempt, retryAfter, reason) {
    // No header must mean "back off", not Number(null) = 0 seconds.
    const seconds = retryAfter?.trim() ? Number(retryAfter) : NaN
    const ms = Math.min(
      Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : 2000 * 2 ** attempt,
      MAX_RETRY_WAIT_MS,
    )
    log(`      ${reason}, waiting ${Math.round(ms / 1000)}s before retrying`)
    await sleep(ms)
  }

  return {
    // The occupation whose products include exactly this ST reference, or
    // { error } if there's none or more than one.
    async findOccupationCode(stReference) {
      const query = new URLSearchParams({ searchTerm: stReference, expand: 'occupation.products', pageSize: '50' })
      const page = await get(`/SearchOccupations?${query}`)
      const matches = (page?.results ?? []).filter((o) => stReferencesIn(o).includes(stReference))
      const codes = [...new Set(matches.map((o) => upper(o.stdCode)).filter(Boolean))]
      if (codes.length === 1) return { code: codes[0] }
      if (codes.length === 0) return { error: 'no occupation has this ST reference as a product code' }
      return { error: `more than one occupation has this product code: ${codes.join(', ')}` }
    },

    getOccupation(occupationCode) {
      return get(`/Occupations/${encodeURIComponent(occupationCode)}?expand=${EXPAND}`)
    },
  }
}

// ---------------------------------------------------------------- tables

export const CREATE_TABLES = [
  `create table if not exists ${SCHEMA}.SKILLS_IMPORT_RUN (
    ID number(38,0) not null,
    SCOPE varchar not null,
    API_BASE_URL varchar,
    STARTED_AT timestamp_ltz not null default current_timestamp(),
    FINISHED_AT timestamp_ltz,
    STATUS varchar not null default 'running',
    ROW_COUNTS variant,
    ERROR varchar,
    primary key (ID)
  )`,
  // Keyed by the API's occupation code. ST_REFERENCE and LARS_STANDARD_CODE
  // link it back to LARS.STANDARD; RAW_RESPONSE keeps the whole response.
  `create table if not exists ${SCHEMA}.OCCUPATION (
    OCCUPATION_CODE varchar not null,
    ST_REFERENCE varchar,
    LARS_STANDARD_CODE number(38,0),
    TITLE varchar not null,
    LEVEL number(38,0),
    VERSION varchar,
    STATUS number(38,0),
    STATUS_NAME varchar,
    OVERVIEW varchar,
    SUMMARY varchar,
    ROUTE_NAME varchar,
    PATHWAY_NAME varchar,
    SOC_2020_CODE number(38,0),
    STATUS_LAST_UPDATED timestamp_ntz,
    RAW_RESPONSE variant,
    FETCHED_AT timestamp_ltz not null,
    LAST_IMPORT_RUN_ID number(38,0) not null,
    primary key (OCCUPATION_CODE),
    foreign key (LAST_IMPORT_RUN_ID) references ${SCHEMA}.SKILLS_IMPORT_RUN (ID)
  )`,
  `create table if not exists ${SCHEMA}.DUTY (
    OCCUPATION_CODE varchar not null,
    DUTY_REFERENCE varchar not null,
    API_ID varchar,
    DETAIL varchar,
    IS_CORE boolean not null default false,
    CRITERIA varchar,
    SORT_ORDER number(38,0) not null,
    LAST_IMPORT_RUN_ID number(38,0) not null,
    primary key (OCCUPATION_CODE, DUTY_REFERENCE),
    foreign key (OCCUPATION_CODE) references ${SCHEMA}.OCCUPATION (OCCUPATION_CODE)
  )`,
  `create table if not exists ${SCHEMA}.KSB (
    OCCUPATION_CODE varchar not null,
    KSB_TYPE varchar(1) not null,
    KSB_REFERENCE varchar not null,
    API_ID varchar,
    DETAIL varchar,
    SORT_ORDER number(38,0) not null,
    LAST_IMPORT_RUN_ID number(38,0) not null,
    primary key (OCCUPATION_CODE, KSB_TYPE, KSB_REFERENCE),
    foreign key (OCCUPATION_CODE) references ${SCHEMA}.OCCUPATION (OCCUPATION_CODE)
  )`,
  `create table if not exists ${SCHEMA}.DUTY_KSB (
    OCCUPATION_CODE varchar not null,
    DUTY_REFERENCE varchar not null,
    KSB_TYPE varchar(1) not null,
    KSB_REFERENCE varchar not null,
    LAST_IMPORT_RUN_ID number(38,0) not null,
    primary key (OCCUPATION_CODE, DUTY_REFERENCE, KSB_TYPE, KSB_REFERENCE),
    foreign key (OCCUPATION_CODE, DUTY_REFERENCE) references ${SCHEMA}.DUTY (OCCUPATION_CODE, DUTY_REFERENCE),
    foreign key (OCCUPATION_CODE, KSB_TYPE, KSB_REFERENCE) references ${SCHEMA}.KSB (OCCUPATION_CODE, KSB_TYPE, KSB_REFERENCE)
  )`,
]

// The columns written from parsed rows, per table. RAW_RESPONSE is staged
// as text and parsed into a VARIANT during the MERGE.
const OCCUPATION_COLUMNS = [
  'OCCUPATION_CODE', 'ST_REFERENCE', 'LARS_STANDARD_CODE', 'TITLE', 'LEVEL', 'VERSION', 'STATUS',
  'STATUS_NAME', 'OVERVIEW', 'SUMMARY', 'ROUTE_NAME', 'PATHWAY_NAME', 'SOC_2020_CODE',
  'STATUS_LAST_UPDATED', 'RAW_RESPONSE',
]
const CHILD_TABLES = [
  { table: 'DUTY', rowsKey: 'duties', columns: ['OCCUPATION_CODE', 'DUTY_REFERENCE', 'API_ID', 'DETAIL', 'IS_CORE', 'CRITERIA', 'SORT_ORDER'] },
  { table: 'KSB', rowsKey: 'ksbs', columns: ['OCCUPATION_CODE', 'KSB_TYPE', 'KSB_REFERENCE', 'API_ID', 'DETAIL', 'SORT_ORDER'] },
  { table: 'DUTY_KSB', rowsKey: 'dutyKsbs', columns: ['OCCUPATION_CODE', 'DUTY_REFERENCE', 'KSB_TYPE', 'KSB_REFERENCE'] },
]

// Rows go into the temporary staging tables this many at a time.
const INSERT_BATCH = 200

async function insertRows(execute, connection, table, columns, rows) {
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH)
    const placeholders = batch.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ')
    await execute(
      connection,
      `insert into ${table} (${columns.join(', ')}) values ${placeholders}`,
      batch.flatMap((row) => columns.map((c) => row[c] ?? null)),
    )
  }
}

// Loads parsed occupations. DDL commits implicitly in Snowflake, so tables
// are created and staging filled before the one transaction that changes
// the real tables. `db` is { execute } from server/db.js.
export async function loadIntoSnowflake({ connection, execute }, parsedList, { scope, apiBaseUrl, counts, log = console.log }) {
  for (const sql of CREATE_TABLES) await execute(connection, sql)

  const [{ NEXT_ID }] = await execute(
    connection,
    `select coalesce(max(ID), 0) + 1 as NEXT_ID from ${SCHEMA}.SKILLS_IMPORT_RUN`,
  )
  const runId = Number(NEXT_ID)
  await execute(
    connection,
    `insert into ${SCHEMA}.SKILLS_IMPORT_RUN (ID, SCOPE, API_BASE_URL) values (?, ?, ?)`,
    [runId, scope, apiBaseUrl],
  )
  log(`\nImport run ${runId} started. Loading...`)

  try {
    await execute(
      connection,
      `create or replace temporary table ${SCHEMA}.STG_OCCUPATION (
        ${OCCUPATION_COLUMNS.map((c) => `${c} varchar`).join(', ')}
      )`,
    )
    for (const { table } of CHILD_TABLES) {
      await execute(
        connection,
        `create or replace temporary table ${SCHEMA}.STG_${table} like ${SCHEMA}.${table}`,
      )
    }

    await insertRows(execute, connection, `${SCHEMA}.STG_OCCUPATION`, OCCUPATION_COLUMNS,
      parsedList.map((p) => p.rows.occupation))
    for (const { table, rowsKey, columns } of CHILD_TABLES) {
      const rows = parsedList.flatMap((p) => p.rows[rowsKey]).map((row) => ({ ...row, LAST_IMPORT_RUN_ID: runId }))
      await insertRows(execute, connection, `${SCHEMA}.STG_${table}`, [...columns, 'LAST_IMPORT_RUN_ID'], rows)
    }

    const occupationUpdates = OCCUPATION_COLUMNS.filter((c) => c !== 'OCCUPATION_CODE')
    const occupationSource = `
      select
        OCCUPATION_CODE, ST_REFERENCE, LARS_STANDARD_CODE::number(38,0) as LARS_STANDARD_CODE, TITLE,
        LEVEL::number(38,0) as LEVEL, VERSION, STATUS::number(38,0) as STATUS, STATUS_NAME,
        OVERVIEW, SUMMARY, ROUTE_NAME, PATHWAY_NAME, SOC_2020_CODE::number(38,0) as SOC_2020_CODE,
        try_to_timestamp_ntz(STATUS_LAST_UPDATED) as STATUS_LAST_UPDATED,
        parse_json(RAW_RESPONSE) as RAW_RESPONSE
      from ${SCHEMA}.STG_OCCUPATION
    `

    await execute(connection, 'begin')
    await execute(
      connection,
      `merge into ${SCHEMA}.OCCUPATION t
       using (${occupationSource}) s
         on t.OCCUPATION_CODE = s.OCCUPATION_CODE
       when matched then update set
         ${occupationUpdates.map((c) => `${c} = s.${c}`).join(', ')},
         FETCHED_AT = current_timestamp(), LAST_IMPORT_RUN_ID = ?
       when not matched then insert (${OCCUPATION_COLUMNS.join(', ')}, FETCHED_AT, LAST_IMPORT_RUN_ID)
         values (${OCCUPATION_COLUMNS.map((c) => `s.${c}`).join(', ')}, current_timestamp(), ?)`,
      [runId, runId],
    )
    // Replace each loaded occupation's duties and KSBs outright, children
    // first, so ones removed from the standard don't linger.
    for (const { table } of [...CHILD_TABLES].reverse()) {
      await execute(
        connection,
        `delete from ${SCHEMA}.${table}
         where OCCUPATION_CODE in (select OCCUPATION_CODE from ${SCHEMA}.STG_OCCUPATION)`,
      )
    }
    for (const { table, columns } of CHILD_TABLES) {
      const cols = [...columns, 'LAST_IMPORT_RUN_ID'].join(', ')
      await execute(connection, `insert into ${SCHEMA}.${table} (${cols}) select ${cols} from ${SCHEMA}.STG_${table}`)
    }
    await execute(
      connection,
      `update ${SCHEMA}.SKILLS_IMPORT_RUN
       set STATUS = 'succeeded', FINISHED_AT = current_timestamp(), ROW_COUNTS = parse_json(?)
       where ID = ?`,
      [JSON.stringify(counts), runId],
    )
    await execute(connection, 'commit')
  } catch (err) {
    try {
      await execute(connection, 'rollback')
    } catch (rollbackErr) {
      log(`Failed to roll back transaction: ${rollbackErr.message}`)
    }
    await execute(
      connection,
      `update ${SCHEMA}.SKILLS_IMPORT_RUN
       set STATUS = 'failed', FINISHED_AT = current_timestamp(), ERROR = ?
       where ID = ?`,
      [err.message, runId],
    )
    err.runId = runId
    throw err
  }

  log(`\nImport run ${runId} succeeded.`)
  return runId
}

// ---------------------------------------------------------------- reading our standards

const OPEN_STANDARD = `
  (s.LAST_DATE_STARTS is null or s.LAST_DATE_STARTS >= current_date())
  and (s.EFFECTIVE_TO is null or s.EFFECTIVE_TO >= current_date())
`

const LEARNER_STANDARDS_QUERY = `
  select distinct s.STANDARD_CODE, s.REFERENCE, s.NAME
  from LEARNING_DELIVERY ld
  join LARS.STANDARD s on s.STANDARD_CODE = ld.STDCODE
  order by s.REFERENCE, s.STANDARD_CODE
`
const OPEN_STANDARDS_QUERY = `
  select s.STANDARD_CODE, s.REFERENCE, s.NAME
  from LARS.STANDARD s
  where ${OPEN_STANDARD}
  order by s.REFERENCE, s.STANDARD_CODE
`
const ONE_STANDARD_QUERY = `
  select s.STANDARD_CODE, s.REFERENCE, s.NAME
  from LARS.STANDARD s
  where upper(s.REFERENCE) = ? or to_varchar(s.STANDARD_CODE) = ?
  order by s.STANDARD_CODE
`

// ST reference -> occupation code links found on earlier runs, if any.
async function knownOccupationCodes(execute, connection) {
  const [{ N }] = await execute(
    connection,
    `select count(*) as N from information_schema.tables where table_schema = ? and table_name = 'OCCUPATION'`,
    [SCHEMA],
  )
  if (Number(N) === 0) return new Map()
  const rows = await execute(
    connection,
    `select ST_REFERENCE, OCCUPATION_CODE from ${SCHEMA}.OCCUPATION where ST_REFERENCE is not null`,
  )
  return new Map(rows.map((r) => [r.ST_REFERENCE, r.OCCUPATION_CODE]))
}

// ---------------------------------------------------------------- output

function describeCounts(stats) {
  return `${stats.duties} duties, ${stats.knowledge} K, ${stats.skills} S, ${stats.behaviours} B, ${stats.duty_ksb_links} duty-KSB links`
}

function printParsed(parsed) {
  const { occupation } = parsed.rows ?? {}
  if (occupation) {
    console.log(`  Occupation     ${occupation.OCCUPATION_CODE}  ${occupation.TITLE}`)
    console.log(`  ST reference   ${occupation.ST_REFERENCE ?? '-'}`)
    console.log(`  LARS code      ${occupation.LARS_STANDARD_CODE ?? '- (not known from a fixture)'}`)
    console.log(`  Level          ${occupation.LEVEL ?? '-'}    Version ${occupation.VERSION ?? '-'}    Status ${occupation.STATUS_NAME ?? '-'}`)
    console.log(`  Route          ${occupation.ROUTE_NAME ?? '-'}`)
    const s = parsed.stats
    console.log(`  Duties         ${s.duties}`)
    console.log(`  Knowledge (K)  ${s.knowledge}`)
    console.log(`  Skills (S)     ${s.skills}`)
    console.log(`  Behaviours (B) ${s.behaviours}`)
    console.log(`  Duty-KSB links ${s.duty_ksb_links}${s.links_unresolved ? `  (${s.links_unresolved} unresolved)` : ''}`)
    const sample = parsed.rows.ksbs.slice(0, 1).concat(
      parsed.rows.ksbs.filter((k) => k.KSB_TYPE === 'S').slice(0, 1),
      parsed.rows.ksbs.filter((k) => k.KSB_TYPE === 'B').slice(0, 1),
    )
    for (const k of sample) console.log(`      e.g. ${k.KSB_REFERENCE}: ${k.DETAIL}`)
  }
  for (const w of parsed.warnings) console.log(`  Note: ${w}`)
  for (const p of parsed.problems) console.log(`  PROBLEM: ${p}`)
}

// ---------------------------------------------------------------- main

async function main() {
  const { values: args } = parseArgs({
    options: {
      all: { type: 'boolean', default: false },
      only: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      fixture: { type: 'string' },
    },
  })

  if (args.fixture) {
    if (!args['dry-run']) {
      console.error('--fixture only works with --dry-run.')
      process.exit(1)
    }
    const file = path.resolve(args.fixture)
    console.log(`Parsing fixture ${file}`)
    console.log('No API calls and no Snowflake: nothing is fetched or written.\n')
    let json
    try {
      json = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (err) {
      console.error(`Can't read the fixture: ${err.message}`)
      process.exit(1)
    }
    const parsed = parseOccupation(json)
    printParsed(parsed)
    const rows = parsed.rows
    if (rows) {
      console.log(
        `\nWould load: 1 OCCUPATION row (with raw JSON), ${rows.duties.length} DUTY, ` +
          `${rows.ksbs.length} KSB and ${rows.dutyKsbs.length} DUTY_KSB rows.`,
      )
    }
    console.log(parsed.problems.length ? '\nThis occupation would be skipped.' : '\nDry run finished. Nothing was written.')
    process.exitCode = parsed.problems.length ? 1 : 0
    return
  }

  if (args.all && args.only) {
    console.error('Use either --all or --only, not both.')
    process.exit(1)
  }

  // Check the key before anything else, so nothing happens without it.
  dotenv.config({ path: path.join(__dirname, '..', 'server', '.env'), quiet: true })
  const apiKey = process.env.SKILLS_ENGLAND_API_KEY?.trim()
  if (!apiKey) {
    console.error(
      'SKILLS_ENGLAND_API_KEY is empty in server/.env.\n' +
        'Add the key Skills England sent you, then run this again. Nothing was fetched or written.\n' +
        'To check the parsing without a key, use --dry-run --fixture <file>.',
    )
    process.exit(1)
  }
  const apiBaseUrl = (process.env.SKILLS_ENGLAND_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL).replace(/\/+$/, '')
  const scope = args.all ? 'all open standards' : args.only ? `only ${args.only.toUpperCase()}` : 'learner standards'

  const { connect, execute, destroy } = await import('../server/db.js')

  // Which standards to fetch, and any occupation links already known. The
  // connection is closed during fetching, which can take a while.
  let standards
  let known
  let connection = await connect()
  try {
    if (args.all) standards = await execute(connection, OPEN_STANDARDS_QUERY)
    else if (args.only) {
      const only = args.only.trim().toUpperCase()
      standards = await execute(connection, ONE_STANDARD_QUERY, [only, only])
    } else standards = await execute(connection, LEARNER_STANDARDS_QUERY)
    known = await knownOccupationCodes(execute, connection)
  } finally {
    await destroy(connection)
  }

  // One entry per ST reference: two LARS codes can share one.
  const byReference = new Map()
  for (const s of standards) {
    const ref = upper(s.REFERENCE)
    if (!ref) continue
    if (!byReference.has(ref)) byReference.set(ref, { stReference: ref, larsCode: s.STANDARD_CODE, name: s.NAME, otherCodes: [] })
    else byReference.get(ref).otherCodes.push(s.STANDARD_CODE)
  }
  if (byReference.size === 0) {
    console.log(`No standards to fetch for ${scope}.`)
    return
  }

  console.log(`Fetching KSBs for ${byReference.size} standard(s) (${scope}) from ${apiBaseUrl}\n`)
  const api = createApiClient({ apiKey, baseUrl: apiBaseUrl })
  const parsedList = []
  const counts = { scope, requested: byReference.size, loaded: 0, skipped: [], occupations: {} }

  try {
    for (const standard of byReference.values()) {
      const label = `${standard.stReference} ${standard.name}`
      // Use the link from an earlier run if there is one; search if not, or
      // if that occupation code no longer exists.
      let code = known.get(standard.stReference)
      let json = code ? await api.getOccupation(code) : null
      if (!json) {
        const found = await api.findOccupationCode(standard.stReference)
        if (found.error) {
          console.log(`  ${label}: skipped, ${found.error}`)
          counts.skipped.push({ st_reference: standard.stReference, reason: found.error })
          continue
        }
        code = found.code
        json = await api.getOccupation(code)
      }
      if (!json) {
        console.log(`  ${label}: skipped, ${code} not found`)
        counts.skipped.push({ st_reference: standard.stReference, reason: `${code} not found` })
        continue
      }
      const parsed = parseOccupation(json, standard)
      if (parsed.problems.length) {
        console.log(`  ${label} -> ${code}: skipped, ${parsed.problems.join('; ')}`)
        counts.skipped.push({ st_reference: standard.stReference, reason: parsed.problems.join('; ') })
        continue
      }
      parsedList.push(parsed)
      counts.occupations[code] = parsed.stats
      console.log(`  ${label} -> ${code}: ${describeCounts(parsed.stats)}`)
      if (standard.otherCodes.length) {
        console.log(`      Note: LARS codes ${standard.otherCodes.join(', ')} share this ST reference; stored against ${standard.larsCode}`)
      }
      for (const w of parsed.warnings) console.log(`      Note: ${w}`)
    }
  } catch (err) {
    console.error(`\nStopped: ${err.message}\nNothing was written.`)
    process.exit(1)
  }

  counts.loaded = parsedList.length
  console.log(`\n${parsedList.length} of ${byReference.size} standard(s) ready, ${counts.skipped.length} skipped.`)

  if (args['dry-run']) {
    console.log('Dry run finished. Nothing was written to the database.')
    return
  }
  if (parsedList.length === 0) {
    console.log('Nothing to load.')
    return
  }

  connection = await connect()
  try {
    await loadIntoSnowflake({ connection, execute }, parsedList, { scope, apiBaseUrl, counts })
  } catch (err) {
    const run = err.runId ? `Import run ${err.runId} FAILED and nothing was changed.` : 'Import FAILED.'
    console.error(`\n${run}\nDetails: ${err.message}`)
    process.exitCode = 1
  } finally {
    await destroy(connection)
  }
}

// Run only when called as a script, so the functions above can be imported
// by tests without starting an import.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('Import failed:', err.message)
    process.exit(1)
  })
}
