// import-vacancies.js - the vacancy import from Find an apprenticeship
// (Display Advert API v2), vacancies build step 2. Run by a scheduler:
//
//   npm run import:vacancies -- --full   nightly: every advert
//   npm run import:vacancies -- --new    every 2 hours: adverts posted in the last day
//
// Every response goes to RAW.FAA_VACANCY_PAGE as returned (add-only); each
// advert is cleaned into EXT.VACANCY with MERGE on VACANCYREFERENCE. Adverts
// are public and the same for every organisation: this touches no
// organisation's data, and nothing in server/ or src/ may import it (npm
// run check:scoping).
//
// Sources: each run makes three passes: no extra sources (Find an
// apprenticeship only), then AdditionalDataSources Nhs, then Csj. An advert
// is FAA if the first pass returned it, else NHS or CSJ by the pass that
// did. A rule from the advert alone (a UKPRN: FAA; else a numeric
// reference: CSJ; else NHS) is checked against that and any difference
// logged.
//
// Every request sends X-Version: 2. Requests are at least PAUSE_MS apart
// and never more than WINDOW_LIMIT in five minutes (the API allows 150). A
// run won't start while another is open. Only a complete full run marks
// adverts no longer returned as gone (GONEAT). Every text field is plain
// text by the time it reaches EXT (server/vacancyText.js); links must be
// http or https. Employer contact details stay in RAW only.
//
// The key (FAA_API_KEY in server/.env) is never logged. Each run is logged
// to logs/import-vacancies/<date>.log (gitignored) as well as printed.

import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { connect, execute, destroy } from '../server/db.js'
import { makeLog, recordRun } from './job-run.js'
import { htmlToText, safeUrl } from '../server/vacancyText.js'

export const API = 'https://api.apprenticeships.education.gov.uk/vacancies'
export const PAGE_SIZE = 100
export const PAUSE_MS = 2600 // at most 115 requests in five minutes
export const WINDOW_LIMIT = 115
const WINDOW_MS = 5 * 60 * 1000
const TIMEOUT_MS = 30000
export const PASSES = [
  { sources: null, label: 'FAA' },
  { sources: 'Nhs', label: 'NHS' },
  { sources: 'Csj', label: 'CSJ' },
]

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Waits until another request is allowed: PAUSE_MS after the last, and
// fewer than WINDOW_LIMIT in the last five minutes. now and sleep are
// replaceable for tests.
export function makePacer({ pauseMs = PAUSE_MS, limit = WINDOW_LIMIT, windowMs = WINDOW_MS, now = () => Date.now(), sleep = wait } = {}) {
  const times = []
  return async () => {
    for (;;) {
      const t = now()
      while (times.length > 0 && times[0] <= t - windowMs) times.shift()
      const sinceLast = times.length > 0 ? t - times[times.length - 1] : Infinity
      const waitFor = Math.max(sinceLast < pauseMs ? pauseMs - sinceLast : 0, times.length >= limit ? times[0] + windowMs - t : 0)
      if (waitFor <= 0) break
      await sleep(waitFor)
    }
    times.push(now())
  }
}

// A reason to stop the run (busy, a refused key, a response we can't use).
export class StopRun extends Error {}

// The path and query for one page.
export function endpointFor(page, kind) {
  const q = new URLSearchParams({ PageNumber: String(page), PageSize: String(PAGE_SIZE), IncludeDetails: 'true' })
  if (kind === 'new') q.set('PostedInLastNumberOfDays', '1')
  return `/vacancy?${q}`
}

// One page: { endpoint, status, body }. Retries once (after a pause) when
// the API doesn't answer in time or answers 5xx; stops the run on 429 or a
// refused key. fetchImpl is replaceable for tests.
export async function getPage({ fetchImpl = fetch, pace, page, sources, kind, key = process.env.FAA_API_KEY }) {
  if (!key) throw new StopRun('FAA_API_KEY is missing from server/.env.')
  const endpoint = endpointFor(page, kind)
  const headers = { 'Ocp-Apim-Subscription-Key': key, 'X-Version': '2', Accept: 'application/json' }
  if (sources) headers.AdditionalDataSources = sources
  for (let attempt = 1; ; attempt++) {
    await pace()
    let res
    try {
      res = await fetchImpl(API + endpoint, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch (err) {
      if (attempt < 2) continue
      throw new StopRun(`Find an apprenticeship didn't answer (${err.name}) for ${endpoint}.`)
    }
    if (res.status === 429) throw new StopRun('Find an apprenticeship is busy (HTTP 429). The next run starts again.')
    if (res.status === 401 || res.status === 403) throw new StopRun(`Find an apprenticeship refused the key (HTTP ${res.status}).`)
    if (res.status >= 500 && attempt < 2) continue
    const body = await res.json().catch(() => null)
    return { endpoint, status: res.status, body }
  }
}

const text = (value, max) => {
  const t = htmlToText(value)
  return t === null ? null : max ? t.slice(0, max) : t
}
const number = (value) => (value === null || value === undefined || value === '' || Number(value) === 0 || !Number.isFinite(Number(value)) ? null : Number(value))
const date = (value) => (value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null)
const bool = (value) => (value === true || value === false ? value : null)
// Strings inside lists and objects (skills, qualifications, addresses) are
// made plain text too.
const deepText = (value) => (Array.isArray(value) ? value.map(deepText)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepText(v)]))
    : typeof value === 'string' ? htmlToText(value) : value)

// The EXT.VACANCY columns for one advert, all text plain. Leaves out the
// employer contact name, email and phone some adverts carry (RAW keeps
// them) and the search-only distance.
export function advertRow(v, source) {
  const first = Array.isArray(v.addresses) ? v.addresses[0] ?? null : null
  return {
    VACANCYREFERENCE: String(v.vacancyReference),
    SOURCE: source,
    TITLE: text(v.title, 500) ?? '(no title)',
    DESCRIPTION: text(v.description),
    NUMBEROFPOSITIONS: number(v.numberOfPositions),
    POSTEDDATE: date(v.postedDate),
    CLOSINGDATE: date(v.closingDate),
    STARTDATE: date(v.startDate),
    WAGETYPE: text(v.wage?.wageType, 60),
    WAGEUNIT: text(v.wage?.wageUnit, 30),
    WAGETEXT: text(v.wage?.wageAdditionalInformation, 1000),
    WORKINGWEEK: text(v.wage?.workingWeekDescription, 2000),
    HOURSPERWEEK: number(v.hoursPerWeek),
    EXPECTEDDURATION: text(v.expectedDuration, 100),
    APPRENTICESHIPLEVEL: text(v.apprenticeshipLevel, 40),
    LARSCODE: number(v.course?.larsCode),
    COURSETITLE: text(v.course?.title, 500),
    COURSELEVEL: number(v.course?.level),
    ROUTE: text(v.course?.route, 200),
    COURSETYPE: text(v.course?.type, 40),
    EMPLOYERNAME: text(v.employerName, 500) ?? '(not given)',
    EMPLOYERDESCRIPTION: text(v.employerDescription),
    EMPLOYERWEBSITEURL: safeUrl(v.employerWebsiteUrl),
    PROVIDERNAME: text(v.providerName, 500),
    UKPRN: number(v.ukprn),
    ISDISABILITYCONFIDENT: bool(v.isDisabilityConfident),
    ISNATIONALVACANCY: bool(v.isNationalVacancy),
    NATIONALVACANCYDETAILS: text(v.isNationalVacancyDetails, 2000),
    VACANCYURL: safeUrl(v.vacancyUrl),
    APPLICATIONURL: safeUrl(v.applicationUrl),
    ADDRESSES: Array.isArray(v.addresses) ? deepText(v.addresses) : null,
    POSTCODE: text(first?.postcode, 8),
    LATITUDE: typeof first?.latitude === 'number' ? Number(first.latitude.toFixed(6)) : null,
    LONGITUDE: typeof first?.longitude === 'number' ? Number(first.longitude.toFixed(6)) : null,
    SKILLS: Array.isArray(v.skills) ? deepText(v.skills).filter(Boolean) : [],
    QUALIFICATIONS: Array.isArray(v.qualifications) ? deepText(v.qualifications) : null,
    TRAININGDESCRIPTION: text(v.trainingDescription),
    OUTCOMEDESCRIPTION: text(v.outcomeDescription),
    FULLDESCRIPTION: text(v.fullDescription),
    THINGSTOCONSIDER: text(v.thingsToConsider),
  }
}

// The source by the advert alone, for the cross-check only.
export function ruleSource(v) {
  if (number(v.ukprn)) return 'FAA'
  return /^\d+$/.test(String(v.vacancyReference)) ? 'CSJ' : 'NHS'
}

// An advert's source in a pass that hadn't been seen by an earlier pass
// of the same run: the pass's label, except that an advert with a UKPRN
// first seen in the NHS or Civil Service pass is a Find an apprenticeship
// advert posted while the run was going (those two never have one).
export function sourceFor(advert, passLabel) {
  return passLabel !== 'FAA' && number(advert.ukprn) ? 'FAA' : passLabel
}

// Labels a run's adverts by the passes that returned them. passes:
// [{ label, adverts: [advert...] }] in PASSES order. Returns
// { labelled: Map(reference -> { advert, source }), disagree: [...] }: each
// advert is labelled by the first pass that returned it (sourceFor), and
// disagree lists those where the advert-only rule says otherwise.
export function labelSources(passes) {
  const labelled = new Map()
  for (const { label, adverts } of passes) {
    for (const advert of adverts) {
      const ref = String(advert.vacancyReference)
      if (!labelled.has(ref)) labelled.set(ref, { advert, source: sourceFor(advert, label) })
    }
  }
  const disagree = [...labelled.values()].filter(({ advert, source }) => ruleSource(advert) !== source)
    .map(({ advert, source }) => ({ reference: String(advert.vacancyReference), source, rule: ruleSource(advert) }))
  return { labelled, disagree }
}

// Each EXT.VACANCY column from advertRow, as its table type.
const TYPES = {
  NUMBEROFPOSITIONS: 'number(6)', HOURSPERWEEK: 'number(5,2)', LARSCODE: 'number(6)', COURSELEVEL: 'number(2)',
  UKPRN: 'number(8)', LATITUDE: 'number(9,6)', LONGITUDE: 'number(9,6)',
  POSTEDDATE: 'timestamp_ltz', CLOSINGDATE: 'timestamp_ltz', STARTDATE: 'timestamp_ltz',
  ISDISABILITYCONFIDENT: 'boolean', ISNATIONALVACANCY: 'boolean',
  ADDRESSES: 'variant', QUALIFICATIONS: 'variant', SKILLS: 'array',
}
const COLUMNS = Object.keys(advertRow({ vacancyReference: 'x' }, 'FAA'))
const CONTENT = COLUMNS.filter((c) => c !== 'VACANCYREFERENCE')
const cast = (c) => (TYPES[c] === 'variant' ? `f.value:${c}` : `f.value:${c}::${TYPES[c] ?? 'string'}`)
const contentHash = (alias) => `hash(${CONTENT.map((c) => (TYPES[c] === 'variant' || TYPES[c] === 'array' ? `to_json(${alias}.${c})` : `${alias}.${c}`)).join(', ')})`
// One page's adverts (a JSON array of advertRow rows) as a source table.
const PAGE_ROWS = `(select ${COLUMNS.map((c) => `${cast(c)} as ${c}`).join(', ')} from table(flatten(input => parse_json(?))) f)`

const CHANGED_ON_PAGE = `
  select count(*) as N from ${PAGE_ROWS} s
  join EXT.VACANCY t on t.VACANCYREFERENCE = s.VACANCYREFERENCE
  where ${contentHash('t')} <> ${contentHash('s')}
`
const MERGE_PAGE = `
  merge into EXT.VACANCY t
  using ${PAGE_ROWS} s
  on t.VACANCYREFERENCE = s.VACANCYREFERENCE
  when matched and ${contentHash('t')} <> ${contentHash('s')} then update set
    ${CONTENT.map((c) => `${c} = s.${c}`).join(', ')},
    LASTSEENAT = current_timestamp(), GONEAT = null, LASTCHANGEDAT = current_timestamp(), SOURCERESPONSEID = ?
  when matched then update set LASTSEENAT = current_timestamp(), GONEAT = null, SOURCERESPONSEID = ?
  when not matched then insert (${COLUMNS.join(', ')}, FIRSTSEENAT, LASTSEENAT, LASTCHANGEDAT, SOURCERESPONSEID)
    values (${COLUMNS.map((c) => `s.${c}`).join(', ')}, current_timestamp(), current_timestamp(), current_timestamp(), ?)
`
const RAW_INSERT = `
  insert into RAW.FAA_VACANCY_PAGE (RESPONSEID, RUNID, ENDPOINT, SOURCES, HTTPSTATUS, BODY)
  select ?, ?, ?, ?, ?, parse_json(?)
`
const START_RUN = `insert into EXT.VACANCY_IMPORT_RUN (RUNID, KIND) values (?, ?)`
// Other runs still open (started in the last hour and not finished).
const OTHER_OPEN_RUNS = `
  select RUNID, to_varchar(convert_timezone('Europe/London', STARTEDAT), 'YYYY-MM-DD HH24:MI') || ' UK time' as STARTED from EXT.VACANCY_IMPORT_RUN
  where FINISHEDAT is null and STARTEDAT > dateadd(hour, -1, current_timestamp()) and RUNID <> ?
`
const FINISH_RUN = `
  update EXT.VACANCY_IMPORT_RUN set FINISHEDAT = current_timestamp(), COMPLETE = ?, REQUESTS = ?, ADVERTS = ?,
    ADDED = ?, CHANGED = ?, GONE = ?, ERROR = ?
  where RUNID = ?
`
// Adverts a complete full run didn't return although their closing date
// hasn't passed: withdrawn or filled.
const MARK_GONE = `
  update EXT.VACANCY set GONEAT = current_timestamp()
  where GONEAT is null
    and LASTSEENAT < (select STARTEDAT from EXT.VACANCY_IMPORT_RUN where RUNID = ?)
    and CLOSINGDATE > (select STARTEDAT from EXT.VACANCY_IMPORT_RUN where RUNID = ?)
`
const rowsAffected = (result, kind) => Number(result?.[0]?.[`number of rows ${kind}`] ?? 0)

// Saves one page: the response to RAW, its new adverts to EXT. Returns the
// counts.
async function savePage(connection, runId, { endpoint, status, body }, sources, rows) {
  const responseId = crypto.randomUUID()
  await execute(connection, RAW_INSERT, [responseId, runId, endpoint, sources, status, JSON.stringify(body ?? null)])
  if (rows.length === 0) return { added: 0, changed: 0 }
  const json = JSON.stringify(rows)
  const [{ N: changed }] = await execute(connection, CHANGED_ON_PAGE, [json])
  const merged = await execute(connection, MERGE_PAGE, [json, responseId, responseId, responseId])
  return { added: rowsAffected(merged, 'inserted'), changed: Number(changed) }
}

// One import run. kind: 'full' (every advert) or 'new' (posted in the last
// day). Returns the counts, or { refused } when another run is open. The
// run's own row is written first and then other open runs looked for, so
// two runs started together both see each other and both stop.
export async function runImport({ connection, kind, fetchImpl = fetch, pace = makePacer(), log = console.log, key }) {
  if (kind !== 'full' && kind !== 'new') throw new Error(`kind must be full or new, not ${kind}`)
  const runId = crypto.randomUUID()
  await execute(connection, START_RUN, [runId, kind])
  const others = await execute(connection, OTHER_OPEN_RUNS, [runId])
  if (others.length > 0) {
    const why = `Another vacancy import is running (started ${others[0].STARTED}).`
    await execute(connection, FINISH_RUN, [false, 0, 0, 0, 0, 0, why, runId])
    log(`Not started: ${why}`)
    return { runId, refused: why }
  }
  const counts = { runId, kind, requests: 0, adverts: 0, added: 0, changed: 0, gone: 0, disagree: 0, complete: false, error: null }
  const seen = new Set()
  const counted = async () => {
    await pace()
    counts.requests++
  }
  try {
    for (const pass of PASSES) {
      for (let page = 1; ; page++) {
        const response = await getPage({ fetchImpl, pace: counted, page, sources: pass.sources, kind, key })
        const adverts = response.body?.vacancies
        if (response.status !== 200 || !Array.isArray(adverts)) {
          await savePage(connection, runId, response, pass.sources, [])
          throw new StopRun(`Find an apprenticeship answered HTTP ${response.status} for ${response.endpoint}.`)
        }
        const rows = []
        for (const advert of adverts) {
          const ref = String(advert.vacancyReference)
          if (seen.has(ref)) continue
          seen.add(ref)
          const source = sourceFor(advert, pass.label)
          if (ruleSource(advert) !== source) {
            counts.disagree++
            if (counts.disagree <= 10) log(`${ref}: labelled ${source} by the passes, ${ruleSource(advert)} by the advert alone`)
          }
          rows.push(advertRow(advert, source))
        }
        const saved = await savePage(connection, runId, response, pass.sources, rows)
        counts.added += saved.added
        counts.changed += saved.changed
        if (page >= Number(response.body.totalPages ?? 0) || adverts.length === 0) break
      }
    }
    counts.adverts = seen.size
    counts.complete = true
    if (kind === 'full') counts.gone = rowsAffected(await execute(connection, MARK_GONE, [runId, runId]), 'updated')
  } catch (err) {
    counts.adverts = seen.size
    counts.error = err instanceof StopRun ? err.message : `Stopped: ${err.message}`
    if (!(err instanceof StopRun)) {
      await execute(connection, FINISH_RUN, [false, counts.requests, counts.adverts, counts.added, counts.changed, 0, counts.error.slice(0, 1000), runId])
      throw err
    }
  }
  await execute(connection, FINISH_RUN, [counts.complete, counts.requests, counts.adverts, counts.added, counts.changed, counts.gone, counts.error?.slice(0, 1000) ?? null, runId])
  log(`${kind} run ${counts.complete ? 'complete' : 'stopped'}: ${counts.requests} requests, ${counts.adverts} adverts, ${counts.added} new, ` +
    `${counts.changed} changed, ${counts.gone} gone${counts.disagree ? `, ${counts.disagree} labelled differently by the advert alone` : ''}` +
    `${counts.error ? `. ${counts.error}` : ''}`)
  return counts
}

// Run as a script (not when a test imports it).
// One run as a job (scripts/job-run.js): its outcome for OPS.JOB_RUN.
export async function runJob({ connection, kind, log }) {
  const counts = await runImport({ connection, kind, log })
  return {
    outcome: counts.refused ? 'refused' : counts.complete ? 'succeeded' : 'failed',
    ref: counts.runId,
    error: counts.refused ?? counts.error ?? null,
    summary: { kind, requests: counts.requests, adverts: counts.adverts, added: counts.added, changed: counts.changed, gone: counts.gone },
  }
}

// Run by hand (npm run import:vacancies -- --full | --new), recorded like a
// scheduled run.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const kind = process.argv.includes('--full') ? 'full' : process.argv.includes('--new') ? 'new' : null
  if (!kind) {
    console.log('Usage: npm run import:vacancies -- --full | --new')
    process.exit(2)
  }
  const log = makeLog('import-vacancies')
  log(`Vacancy import (${kind}) started.`)
  const connection = await connect()
  let result
  try {
    result = await recordRun({ connection, job: `vacancies-${kind}`, triggeredBy: 'manual', log, run: (c) => runJob({ connection: c, kind, log }) })
  } finally {
    await destroy(connection)
  }
  process.exit(result.outcome === 'succeeded' ? 0 : 1)
}
