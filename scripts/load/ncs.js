// The National Careers Service course directory (Department for Education),
// monthly: the live courses with their venues, and the course providers. Open
// Government Licence v3.0 (stated on the publication's page and its code
// tables page, 30 October 2026; docs/licences/ncs-course-directory-2026-10/).
// Load step 54 puts them into OPTIONS_DB.RAW.NCS_COURSE and NCS_PROVIDER
// (sql/ncs_01_tables.sql).
//
// No personal data is loaded. The files carry contact details of venues and
// providers (email addresses, telephone numbers, street addresses, which can be
// a sole trader's home) and free text in which providers wrote their own
// phone numbers and email addresses. The copy that is staged and loaded leaves
// those columns out, and blanks a website address that is really an email
// address. The download itself stays in RAREBIT_DATA/ncs and is never staged.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { csvLine, csvRecords, writeLines } from './files.js'

export const NCS_PAGE = 'https://www.gov.uk/government/publications/national-careers-service-course-directory'
const NCS_API = 'https://www.gov.uk/api/content/government/publications/national-careers-service-course-directory'
export const NCS_DIR = 'ncs'
const UA = { 'User-Agent': 'RarebitDataLoader/1.0' }

// The columns kept, in the order of the loaded tables (sql/ncs_01_tables.sql),
// and the ones left out.
export const COURSE_KEEP = ['PROVIDER_UKPRN', 'COURSE_ID', 'COURSE_RUN_ID', 'LEARN_AIM_REF', 'COURSE_NAME', 'DELIVER_MODE', 'STUDY_MODE', 'ATTENDANCE_PATTERN',
  'FLEXIBLE_STARTDATE', 'STARTDATE', 'DURATION_UNIT', 'DURATION_VALUE', 'COST', 'NATIONAL', 'REGIONS', 'LOCATION_NAME', 'LOCATION_COUNTY', 'LOCATION_LATITUDE',
  'LOCATION_LONGITUDE', 'LOCATION_POSTCODE', 'LOCATION_TOWN', 'LOCATION_WEBSITE', 'COURSE_URL', 'UPDATED_DATE', 'COURSE_TYPE', 'SECTOR', 'EDUCATION_LEVEL', 'AWARDING_BODY']
export const COURSE_REMOVED = ['WHO_THIS_COURSE_IS_FOR', 'COST_DESCRIPTION', 'LOCATION_ADDRESS1', 'LOCATION_ADDRESS2', 'LOCATION_EMAIL', 'LOCATION_TELEPHONE', 'ENTRY_REQUIREMENTS', 'HOW_YOU_WILL_BE_ASSESSED']
export const PROVIDER_KEEP = ['PROVIDER_UKPRN', 'PROVIDER_NAME', 'TRADING_NAME', 'CONTACT_TOWN', 'CONTACT_POSTCODE', 'CONTACT_WEBSITE']
export const PROVIDER_REMOVED = ['CONTACT_ADDRESS1', 'CONTACT_ADDRESS2', 'CONTACT_PHONE', 'CONTACT_EMAIL']
// Columns where a provider sometimes typed an email address in place of a web address.
const ADDRESS_COLUMNS = ['LOCATION_WEBSITE', 'COURSE_URL', 'CONTACT_WEBSITE']

// ---------------------------------------------------------------- filtering
// A record's kept values, or an error if a column is missing.
function picker(header, keep, removed, name) {
  const at = (c) => header.indexOf(c)
  const missing = [...keep, ...removed].filter((c) => at(c) === -1)
  if (missing.length) throw new Error(`${name}: columns missing from the file (${missing.join(', ')}): stopped, nothing loaded.`)
  const extra = header.filter((c) => !keep.includes(c) && !removed.includes(c))
  if (extra.length) throw new Error(`${name}: new columns in the file (${extra.join(', ')}): decide whether they are personal data before loading.`)
  const idx = keep.map(at)
  return (record) => idx.map((i, k) => (ADDRESS_COLUMNS.includes(keep[k]) && record[i].includes('@') ? '' : record[i]))
}

// A CSV file without the personal columns. Courses are UTF-8, providers
// Windows-1252; both are written as UTF-8.
async function filtered(file, keep, removed, name, out) {
  let pick = null
  let rows = 0
  const bytes = fs.readFileSync(file)
  let text
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { text = new TextDecoder('windows-1252').decode(bytes) }
  const tmp = path.join(os.tmpdir(), `rarebit-ncs-${process.pid}-${path.basename(file)}`)
  fs.writeFileSync(tmp, text)
  try {
    async function* lines() {
      for await (const record of csvRecords(tmp)) {
        if (!pick) { pick = picker(record, keep, removed, name); yield csvLine(keep); continue }
        if (record.length === 1 && record[0] === '') continue
        if (record.length !== 0 && record.length < keep.length) throw new Error(`${name}: a row of ${record.length} fields`)
        rows++
        yield csvLine(pick(record))
      }
    }
    await writeLines(out, lines())
  } finally { fs.rmSync(tmp, { force: true }) }
  return { removed, rows }
}
export const coursesWithoutContacts = (file) => (out) => filtered(file, COURSE_KEEP, COURSE_REMOVED, path.basename(file), out)
export const providersWithoutContacts = (file) => (out) => filtered(file, PROVIDER_KEEP, PROVIDER_REMOVED, path.basename(file), out)

// ---------------------------------------------------------------- fetching
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const monthOf = (title) => {
  const m = String(title).match(/:\s*(\w+)\s+(\d{4})/)
  return m && MONTHS.includes(m[1]) ? Number(m[2]) * 12 + MONTHS.indexOf(m[1]) : null
}

// The newest month's two CSV files on the publication's page: { courses, providers }
// as { title, url, month }.
export function newestFiles(attachments) {
  const csv = attachments.filter((a) => a.content_type === 'text/csv' && monthOf(a.title) !== null)
  const newest = (re) => csv.filter((a) => re.test(a.title)).sort((a, b) => monthOf(b.title) - monthOf(a.title))[0]
  const courses = newest(/^Live courses with regions and venues/i)
  const providers = newest(/^Live course providers/i)
  if (!courses || !providers) throw new Error('NCS course directory: the page lists no CSV for the live courses or the providers.')
  if (monthOf(courses.title) !== monthOf(providers.title)) throw new Error(`NCS course directory: the newest courses file (${courses.title}) and providers file (${providers.title}) are from different months.`)
  return { courses, providers }
}

// Downloads the newest month's files to <root>/ncs unless they are there.
// Returns the files saved this time (none: nothing new).
export async function fetchNcs({ root, log = console.log, getJson = async (u) => (await fetch(u, { headers: UA })).json(), download } = {}) {
  const page = await getJson(NCS_API)
  const { courses, providers } = newestFiles(page.details?.attachments ?? [])
  const dir = path.join(root, NCS_DIR)
  fs.mkdirSync(dir, { recursive: true })
  const saved = []
  for (const a of [courses, providers]) {
    const file = path.join(dir, decodeURIComponent(new URL(a.url).pathname.split('/').pop()))
    if (fs.existsSync(file)) { log(`  NCS course directory: ${path.basename(file)} already saved`); continue }
    const get = download ?? (async (url, to) => {
      const res = await fetch(url, { headers: UA })
      if (!res.ok) throw new Error(`${url} answered ${res.status}`)
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(to))
    })
    await get(a.url, `${file}.part`)
    fs.renameSync(`${file}.part`, file)
    log(`  NCS course directory: saved ${path.basename(file)} (${a.title})`)
    saved.push(file)
  }
  return saved
}

// ---------------------------------------------------------------- load step 54
const OGL = 'Open Government Licence v3.0'
const latest = (dir, re) => {
  const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => re.test(n)).sort((a, b) => a.match(/(\d{8})\.csv$/)[1].localeCompare(b.match(/(\d{8})\.csv$/)[1])) : []
  if (!names.length) throw new Error(`No file matching ${re} in ${dir}: npm run fetch:official -- ncs`)
  return path.join(dir, names.at(-1))
}

export function ncsSteps(R) {
  const dir = path.join(R, NCS_DIR)
  const base = { home: 'OPTIONS_DB', format: 'OPTIONS_DB.RAW.CSV_UTF8', source: 'ncs-course-directory', publisher: 'Department for Education (National Careers Service course directory)', licence: OGL, page: NCS_PAGE, kind: 'columns-removed', stageOriginal: false }
  return {
    54: { job: 'load-ncs', runLabel: 'National Careers Service course directory: live courses and providers (contact details left out)', files: () => {
      const courses = latest(dir, /^Live_Courses_With_Regions_And_Venues_Report.*\.csv$/)
      const providers = latest(dir, /^Live_Course_Providers_Report.*\.csv$/)
      return [
        { ...base, title: 'National Careers Service course directory: live courses with regions and venues (contact details and free text left out)', file: courses, table: 'OPTIONS_DB.RAW.NCS_COURSE', make: coursesWithoutContacts(courses), removed: COURSE_REMOVED },
        { ...base, title: 'National Careers Service course directory: live course providers (addresses, telephone and email left out)', file: providers, table: 'OPTIONS_DB.RAW.NCS_PROVIDER', make: providersWithoutContacts(providers), removed: PROVIDER_REMOVED },
      ]
    } },
  }
}
