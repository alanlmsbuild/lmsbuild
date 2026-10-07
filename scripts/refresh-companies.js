// refresh-companies.js - the nightly Companies House refresh (employers,
// build step 4). Run by a scheduler, without a signed-in user:
//
//   npm run refresh:companies
//
// It checks every company linked to an employer still in use, across every
// organisation, once each, and gives every employer linked to it the same
// fresh copy at the same time. Because every linked company is refreshed
// every night, what one organisation sees never depends on another having
// the same company (see server/employers.js).
//
// It works across organisations, so it's kept apart from the app: its
// queries read and write only ILR.EMPLOYER's company columns (never
// learners or anything else), and nothing in server/ or src/ may import it
// (npm run check:scoping). Each run's changes are logged to
// logs/refresh-companies/<date>.log (gitignored) as well as printed.
//
// It asks Companies House at most once every PAUSE_MS, well under the
// shared limit (docs/before-real-data.md: the counter is per process).

import { fileURLToPath } from 'node:url'
import { connect, execute, destroy } from '../server/db.js'
import { makeLog, recordRun } from './job-run.js'
import { inTransaction, RequestError } from '../server/burrow.js'
import { companyColumns, companyChanges, fetchProfile, writeCompany } from '../server/companiesHouse.js'

export const PAUSE_MS = 3000 // at most 100 requests in five minutes

// Every employer still in use that's linked to a company: only the columns
// the refresh needs. Every organisation's, on purpose.
const LINKED = `
  select EMPLOYERID, ORGANISATIONID, COMPANYNUMBER, to_json(COMPANYDETAILS) as COMPANYDETAILS
  from ILR.EMPLOYER
  where COMPANYNUMBER is not null and ISACTIVE
  order by COMPANYNUMBER, EMPLOYERID
`
// One employer's copy, only if it's still linked to the same company (a
// manager may have changed it while the refresh ran). Every employer linked
// to a company gets the same checked time.
const SET_COPY = `
  update ILR.EMPLOYER set NAME = ?, COMPANYDETAILS = parse_json(?), COMPANYCHECKEDAT = ?::timestamp_ltz, COMPANYRESPONSEID = ?
  where EMPLOYERID = ? and COMPANYNUMBER = ? and ISACTIVE
`

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Refreshes every linked company. log(line) gets one line per change, per
// company not found or failed, and a summary. Returns the counts.
export async function refreshAll(connection, { pause = PAUSE_MS, log = console.log } = {}) {
  const rows = await execute(connection, LINKED)
  const byCompany = Map.groupBy(rows, (r) => r.COMPANYNUMBER)
  const counts = { companies: byCompany.size, employers: rows.length, refreshed: 0, changed: 0, notFound: 0, failed: 0 }
  let first = true
  for (const [number, employers] of byCompany) {
    if (!first) await wait(pause)
    first = false
    let fetched
    try {
      fetched = await fetchProfile(connection, number, 'REFRESH')
    } catch (err) {
      if (!(err instanceof RequestError)) throw err
      counts.failed++
      log(`${number}: not checked: ${err.message}`)
      if (err.status === 429) {
        log('Stopped: Companies House is busy. The rest are checked next run.')
        break
      }
      continue
    }
    if (!fetched.profile) {
      counts.notFound++
      log(`${number}: Companies House no longer has it; ${employers.map((e) => `${e.EMPLOYERID} (${e.ORGANISATIONID})`).join(', ')} kept as they were`)
      continue
    }
    const cols = companyColumns(fetched.profile, fetched.etag)
    const checkedAt = new Date().toISOString()
    await inTransaction(connection, async () => {
      await writeCompany(connection, cols, fetched.responseId)
      for (const e of employers) {
        const old = e.COMPANYDETAILS ? JSON.parse(e.COMPANYDETAILS) : null
        await execute(connection, SET_COPY, [cols.COMPANYNAME, JSON.stringify(cols), checkedAt, fetched.responseId, e.EMPLOYERID, number])
        const changes = companyChanges(old, cols)
        if (changes.length > 0) counts.changed++
        for (const ch of changes) log(`${number} ${e.EMPLOYERID} (${e.ORGANISATIONID}): ${ch.field} ${ch.oldValue ?? '(none)'} -> ${ch.newValue ?? '(none)'}`)
      }
    })
    counts.refreshed++
  }
  log(`${counts.companies} companies for ${counts.employers} employers: ${counts.refreshed} refreshed, ${counts.changed} employers with changes, ${counts.notFound} not found, ${counts.failed} not checked.`)
  return counts
}

// One run as a job (scripts/job-run.js): its outcome for OPS.JOB_RUN. Any
// company not checked (Companies House refused or failed) makes it failed.
export async function runJob({ connection, log }) {
  const counts = await refreshAll(connection, { log })
  return {
    outcome: counts.failed > 0 ? 'failed' : 'succeeded',
    error: counts.failed > 0 ? `${counts.failed} companies not checked.` : null,
    summary: counts,
  }
}

// Run by hand (npm run refresh:companies), recorded like a scheduled run.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const log = makeLog('refresh-companies')
  log('Nightly Companies House refresh started.')
  const connection = await connect()
  let result
  try {
    result = await recordRun({ connection, job: 'companies-refresh', triggeredBy: 'manual', log, run: (c) => runJob({ connection: c, log }) })
  } finally {
    await destroy(connection)
  }
  process.exit(result.outcome === 'succeeded' ? 0 : 1)
}
