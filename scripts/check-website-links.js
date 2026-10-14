// check-website-links.js - the weekly link check (decision 26; the
// website-links job, server/jobSchedule.js; sql/links_01_website_link.sql).
//
// Every institution website link in silver (open schools and colleges,
// providers, university courses) is checked once a week: each day, the
// links whose SLICE is today's (0 to 6, from a hash of the URL). The links
// are read from silver as TRANSFORM_USER; the results are written to
// SHARED_DB.EXT.WEBSITE_LINK (latest state) and WEBSITE_LINK_CHECK (every
// check, add-only) as DATA_LOAD_USER.
//
// Politeness: one request at a time per host, at least HOST_GAP_MS apart,
// PARALLEL_HOSTS hosts at once (the busiest first; each host still sees
// one request per 10 seconds at most, so more hosts at once only shortens
// the run: a day's slice is about 22 hours of per-host time, mostly the
// universities' course pages); HEAD first, then a GET
// that reads only the headers if HEAD isn't answered properly; TIMEOUT_MS
// per request; at most MAX_REDIRECTS redirects; no retries in a run; a 429
// stops that host for the rest of the run. The User-Agent says what it is
// (no email address).
//
// Results: ok (2xx in the end), http-only (https fails to connect but http
// works), broken (404 or 410), unreachable (5xx, timeout, no such host,
// connection or certificate failure) or blocked (401, 403 or 429: a site
// refusing robots, not a dead link; other 4xx count as broken). broken and
// unreachable are failures: two in a row hide the link (ISHIDDEN), a later
// ok or http-only shows it again; blocked changes nothing.
//
//   npm run links:check                 today's slice, not recorded
//   npm run links:check -- --record     the same, recorded as a manual run
//   npm run links:check -- --slice 3    another day's slice
//   npm run links:check -- --limit 50   only the first 50 links (testing)

import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { connect, execute, destroy } from '../server/db.js'
import { JobTimeout, makeLog, recordRun } from './job-run.js'

export const HOST_GAP_MS = 10_000
export const PARALLEL_HOSTS = 64
export const TIMEOUT_MS = 15_000
export const MAX_REDIRECTS = 5
export const USER_AGENT = 'RarebitLinkCheck/1.0 (checks once a week that school, college and university website links still work)'
const WRITE_BATCH = 500
export const RECHECK_HOURS = 20

// The links in silver, as listed (cleaned to https://, before any http-only
// change): WEBSITE_LINK's key.
const LINKS_QUERY = `
  select distinct website_url_listed as URL from (
    select website_url_listed from OPTIONS_DB.SILVER.SCHOOL where is_open
    union all select website_url_listed from OPTIONS_DB.SILVER.COLLEGE_16_18 where is_open
    union all select website_url_listed from OPTIONS_DB.SILVER.PROVIDER
    union all select website_url_listed from OPTIONS_DB.SILVER.UNIVERSITY_COURSE
  ) where website_url_listed is not null`

export const sliceOf = (url) => crypto.createHash('sha1').update(url).digest().readUInt32BE(0) % 7
export const todaysSlice = (now = Date.now()) => Math.floor(now / 86_400_000) % 7
export const hostOf = (url) => new URL(url).host.toLowerCase()
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))

// What a final status means.
export function classify(status) {
  if (status >= 200 && status < 300) return 'ok'
  if (status === 401 || status === 403 || status === 429) return 'blocked'
  if (status >= 500) return 'unreachable'
  return 'broken'
}
export const isFailure = (result) => result === 'broken' || result === 'unreachable'

// One request, following redirects by hand (at most MAX_REDIRECTS). A GET
// stops at the headers. Returns { status, finalUrl } or throws.
async function request(url, method, fetchImpl) {
  let current = url
  for (let hop = 0; ; hop++) {
    const res = await fetchImpl(current, { method, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,*/*' } })
    try { await res.body?.cancel() } catch { /* already closed */ }
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      if (hop >= MAX_REDIRECTS) return { status: res.status, finalUrl: current, error: `more than ${MAX_REDIRECTS} redirects` }
      current = new URL(location, current).toString()
      continue
    }
    return { status: res.status, finalUrl: current }
  }
}
const describe = (err) => String(err?.cause?.code ?? err?.cause?.message ?? err?.name ?? err?.message ?? err).slice(0, 500)

// Checks one link: HEAD, then GET if HEAD isn't answered with a 2xx, then
// plain http if https couldn't connect at all. wait() is called before
// each request, to keep to the host's pace. Returns the check's row.
export async function checkLink(url, { wait = async () => {}, fetchImpl = fetch } = {}) {
  const started = Date.now()
  const row = (o) => ({ url, elapsedMs: Date.now() - started, ...o })
  let connectError = null
  for (const method of ['HEAD', 'GET']) {
    await wait()
    try {
      const r = await request(url, method, fetchImpl)
      if (r.error) return row({ method, status: r.status, result: 'broken', finalUrl: r.finalUrl, error: r.error })
      const result = classify(r.status)
      if (result === 'ok' || method === 'GET') return row({ method, status: r.status, result, finalUrl: r.finalUrl })
    } catch (err) {
      connectError = describe(err)
      if (err?.name === 'TimeoutError' || /timeout/i.test(connectError)) return row({ method, status: null, result: 'unreachable', error: `no answer in ${TIMEOUT_MS / 1000} s` })
      break
    }
  }
  // https couldn't connect: does plain http work?
  await wait()
  try {
    const r = await request(url.replace(/^https:/, 'http:'), 'GET', fetchImpl)
    if (classify(r.status) === 'ok') return row({ method: 'GET', status: r.status, result: 'http-only', finalUrl: r.finalUrl, error: `https: ${connectError}` })
  } catch { /* neither works */ }
  return row({ method: 'GET', status: null, result: 'unreachable', error: connectError })
}

// The new state of a link after a check (the two-failures rule).
export function nextState(prev, check, checkedAt) {
  const failures = isFailure(check.result) ? (prev?.CONSECUTIVEFAILURES ?? 0) + 1
    : check.result === 'blocked' ? (prev?.CONSECUTIVEFAILURES ?? 0) : 0
  const working = check.result === 'ok' || check.result === 'http-only'
  return {
    URL: check.url, LASTCHECKEDAT: checkedAt, LASTRESULT: check.result, LASTSTATUS: check.status ?? null, FINALURL: check.finalUrl ?? null,
    LASTERROR: check.error ?? null, LASTOKAT: working ? checkedAt : (prev?.LASTOKAT ?? null), CONSECUTIVEFAILURES: failures,
    BROKENSINCE: failures === 0 ? null : (prev?.BROKENSINCE ?? (isFailure(check.result) ? checkedAt : null)), ISHIDDEN: failures >= 2,
  }
}

const SYNC = `
  merge into SHARED_DB.EXT.WEBSITE_LINK t
  using (select value:url::string as URL, value:host::string as HOST, value:slice::number as SLICE from table(flatten(parse_json(?)))) s
  on t.URL = s.URL
  when matched then update set LASTINSILVERAT = current_timestamp()
  when not matched then insert (URL, HOST, SLICE, LASTINSILVERAT) values (s.URL, s.HOST, s.SLICE, current_timestamp())`
const SAVE_STATE = `
  merge into SHARED_DB.EXT.WEBSITE_LINK t
  using (select value:URL::string as URL, value:LASTCHECKEDAT::timestamp_ltz as LASTCHECKEDAT, value:LASTRESULT::string as LASTRESULT,
           value:LASTSTATUS::number as LASTSTATUS, value:FINALURL::string as FINALURL, value:LASTERROR::string as LASTERROR,
           value:LASTOKAT::timestamp_ltz as LASTOKAT, value:CONSECUTIVEFAILURES::number as CONSECUTIVEFAILURES,
           value:BROKENSINCE::timestamp_ltz as BROKENSINCE, value:ISHIDDEN::boolean as ISHIDDEN
         from table(flatten(parse_json(?)))) s
  on t.URL = s.URL
  when matched then update set LASTCHECKEDAT = s.LASTCHECKEDAT, LASTRESULT = s.LASTRESULT, LASTSTATUS = s.LASTSTATUS, FINALURL = s.FINALURL,
    LASTERROR = s.LASTERROR, LASTOKAT = s.LASTOKAT, CONSECUTIVEFAILURES = s.CONSECUTIVEFAILURES, BROKENSINCE = s.BROKENSINCE, ISHIDDEN = s.ISHIDDEN`
const SAVE_CHECKS = `
  insert into SHARED_DB.EXT.WEBSITE_LINK_CHECK (CHECKID, URL, CHECKEDAT, METHOD, STATUS, RESULT, FINALURL, ELAPSEDMS, ERROR, JOBRUNID)
  select value:id::string, value:url::string, value:checkedAt::timestamp_ltz, value:method::string, value:status::number, value:result::string,
    value:finalUrl::string, value:elapsedMs::number, value:error::string, value:jobRunId::string
  from table(flatten(parse_json(?)))`

export async function runJob({ log = console.log, slice = todaysSlice(), limit = null, jobRunId = null } = {}) {
  const started = Date.now()
  // 1. The links in silver, recorded (new ones added, all marked as seen).
  const t = await connect({ as: 'transform', timeoutMs: 30000 })
  let urls
  try {
    urls = (await execute(t, LINKS_QUERY)).map((r) => r.URL)
  } finally {
    await destroy(t)
  }
  const links = urls.map((url) => ({ url, host: hostOf(url), slice: sliceOf(url) }))
  const c = await connect({ as: 'loader', timeoutMs: 30000 })
  try {
    for (let i = 0; i < links.length; i += 10_000) await execute(c, SYNC, [JSON.stringify(links.slice(i, i + 10_000))])
    // 2. Today's slice, with each link's state before the check.
    // A link checked in the last RECHECK_HOURS is left (a run that stopped
    // half way resumes instead of asking the same sites again).
    let due = await execute(c, `select * from SHARED_DB.EXT.WEBSITE_LINK where SLICE = ? and LASTINSILVERAT >= ?::timestamp_ltz
      and (LASTCHECKEDAT is null or LASTCHECKEDAT < dateadd(hour, -${RECHECK_HOURS}, current_timestamp())) order by URL`, [slice, new Date(started).toISOString()])
    if (limit) due = due.slice(0, limit)
    log(`website-links: ${links.length} links in silver; slice ${slice}: ${due.length} to check across ${new Set(due.map((d) => d.HOST)).size} hosts`)

    // 3. Check them: one queue per host, the busiest hosts first.
    const queues = new Map()
    for (const d of due) (queues.get(d.HOST) ?? queues.set(d.HOST, []).get(d.HOST)).push(d)
    const hostOrder = [...queues.keys()].sort((a, b) => queues.get(b).length - queues.get(a).length)
    const counts = { ok: 0, 'http-only': 0, broken: 0, unreachable: 0, blocked: 0 }
    let newlyHidden = 0
    let shownAgain = 0
    let stoppedHosts = 0
    let pendingStates = []
    let pendingChecks = []
    const flush = async () => {
      if (!pendingStates.length) return
      const states = pendingStates
      const checks = pendingChecks
      pendingStates = []
      pendingChecks = []
      await execute(c, SAVE_CHECKS, [JSON.stringify(checks)])
      await execute(c, SAVE_STATE, [JSON.stringify(states)])
    }
    let done = 0
    const worker = async () => {
      for (;;) {
        const host = hostOrder.shift()
        if (!host) return
        let last = 0
        const wait = async () => {
          const gap = last + HOST_GAP_MS - Date.now()
          if (gap > 0) await sleep(gap)
          last = Date.now()
        }
        for (const prev of queues.get(host)) {
          const check = await checkLink(prev.URL, { wait })
          const checkedAt = new Date().toISOString()
          const state = nextState(prev, check, checkedAt)
          counts[check.result]++
          if (state.ISHIDDEN && !prev.ISHIDDEN) newlyHidden++
          if (!state.ISHIDDEN && prev.ISHIDDEN) shownAgain++
          pendingStates.push(state)
          pendingChecks.push({ id: crypto.randomUUID(), checkedAt, jobRunId, ...check })
          if (pendingStates.length >= WRITE_BATCH) await flush()
          if (++done % 500 === 0) log(`website-links: ${done} of ${due.length} checked`)
          if (check.status === 429) { stoppedHosts++; break }
        }
      }
    }
    await Promise.all(Array.from({ length: PARALLEL_HOSTS }, worker))
    await flush()

    // 4. The summary.
    const [h] = await execute(c, `select count_if(ISHIDDEN) as HIDDEN, count_if(LASTCHECKEDAT is null and LASTINSILVERAT >= ?::timestamp_ltz) as UNCHECKED from SHARED_DB.EXT.WEBSITE_LINK`, [new Date(started).toISOString()])
    const summary = { slice, inSilver: links.length, checked: done, ...counts, newlyHidden, shownAgain, hiddenNow: Number(h.HIDDEN), neverChecked: Number(h.UNCHECKED),
      hostsStoppedBy429: stoppedHosts, minutes: Math.round((Date.now() - started) / 6000) / 10 }
    log(`website-links: ${done} checked in ${summary.minutes} min: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}; ${newlyHidden} newly hidden, ${shownAgain} shown again, ${summary.hiddenNow} hidden in all`)
    return { outcome: 'succeeded', summary }
  } finally {
    await destroy(c)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? Number(process.argv[i + 1]) : null }
  const record = process.argv.includes('--record')
  const log = record ? makeLog('website-links') : console.log
  const options = { log, ...(arg('--slice') !== null ? { slice: arg('--slice') } : {}), limit: arg('--limit') }
  let result
  if (record) {
    const { JOB_SCHEDULE } = await import('../server/jobSchedule.js')
    const connection = await connect()
    try {
      result = await recordRun({ connection, job: 'website-links', triggeredBy: 'manual', log, timeoutMinutes: JOB_SCHEDULE['website-links'].timeoutMinutes,
        run: (_, jobRunId) => runJob({ ...options, jobRunId }) })
    } catch (err) {
      // A run stopped at its time limit is already recorded as failed.
      if (!(err instanceof JobTimeout)) throw err
      result = { outcome: 'failed', error: err.message }
    } finally {
      await destroy(connection)
    }
  } else {
    result = await runJob(options)
  }
  console.log(JSON.stringify(result, null, 1))
  process.exit(result.outcome === 'succeeded' ? 0 : 1)
}
