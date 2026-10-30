// The National Careers Service course directory fetch and filter (decision 58,
// scripts/load/ncs.js), on small made-up files. No network, no Snowflake.
//   node test/ncs.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { COURSE_KEEP, COURSE_REMOVED, PROVIDER_KEEP, PROVIDER_REMOVED, coursesWithoutContacts, fetchNcs, newestFiles, ncsSteps, providersWithoutContacts } from '../scripts/load/ncs.js'
import { csvLine, csvRecords } from '../scripts/load/files.js'

let failures = 0
const check = (name, ok, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); if (!ok) failures++ }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ncs-test-'))
const read = async (file) => { const rows = []; for await (const r of csvRecords(file)) rows.push(r); return rows }

// ---- the filter
{
  const header = [...COURSE_KEEP, ...COURSE_REMOVED].sort()
  const row = (over) => header.map((h) => over[h] ?? '')
  const file = path.join(tmp, 'courses.csv')
  fs.writeFileSync(file, '﻿' + csvLine(header) + csvLine(row({ COURSE_RUN_ID: 'run-1', COURSE_NAME: 'Maths', LOCATION_EMAIL: 'a@b.com', LOCATION_TELEPHONE: '0114 111 2222', WHO_THIS_COURSE_IS_FOR: 'call 0114 000 1111', LOCATION_ADDRESS1: '1 High St', LOCATION_POSTCODE: 'S1 1AA', LOCATION_WEBSITE: 'me@home.org', COURSE_URL: 'https://x.ac.uk/c' })))
  const out = path.join(tmp, 'courses_out.csv')
  const r = await coursesWithoutContacts(file)(out)
  const rows = await read(out)
  check('the courses copy has the kept columns in order and nothing else', JSON.stringify(rows[0]) === JSON.stringify(COURSE_KEEP))
  check('the contact columns and free text are gone', !/a@b\.com|0114|High St|call/.test(fs.readFileSync(out, 'utf8')) && r.removed.length === 8)
  check('a web address that is an email address is blanked, a real one is kept', rows[1][COURSE_KEEP.indexOf('LOCATION_WEBSITE')] === '' && rows[1][COURSE_KEEP.indexOf('COURSE_URL')] === 'https://x.ac.uk/c')
  check('the postcode and name are kept', rows[1][COURSE_KEEP.indexOf('LOCATION_POSTCODE')] === 'S1 1AA' && rows[1][COURSE_KEEP.indexOf('COURSE_NAME')] === 'Maths')
  const missing = path.join(tmp, 'missing.csv')
  fs.writeFileSync(missing, csvLine(header.filter((h) => h !== 'LOCATION_EMAIL')))
  let err = ''
  try { await coursesWithoutContacts(missing)(path.join(tmp, 'x.csv')) } catch (e) { err = e.message }
  check('a missing personal column stops the load', /missing/.test(err), err)
  const added = path.join(tmp, 'added.csv')
  fs.writeFileSync(added, csvLine([...header, 'CONTACT_NAME']) + csvLine([...header.map(() => ''), 'Jo Bloggs']))
  err = ''
  try { await coursesWithoutContacts(added)(path.join(tmp, 'y.csv')) } catch (e) { err = e.message }
  check('a new column in the file stops the load until someone has decided whether it is personal', /new columns.*CONTACT_NAME/.test(err), err)
}
{
  const header = [...PROVIDER_KEEP, ...PROVIDER_REMOVED]
  const file = path.join(tmp, 'providers.csv')
  fs.writeFileSync(file, Buffer.from(csvLine(header) + csvLine(['10000001', 'Café College', '', 'Leeds', 'LS1 1AA', 'www.x.ac.uk', '1 Road', '', '0113 1', 'a@b.com']), 'latin1'))
  const out = path.join(tmp, 'providers_out.csv')
  await providersWithoutContacts(file)(out)
  const rows = await read(out)
  check('providers: the address, telephone and email columns are gone and the name is kept (Windows-1252 read)', rows[0].length === PROVIDER_KEEP.length && rows[1][1] === 'Café College' && !/0113|a@b/.test(fs.readFileSync(out, 'utf8')))
}

// ---- the newest files
{
  const a = (title, url) => ({ title, url, content_type: 'text/csv' })
  const list = [
    a('Live course providers: August 2026', 'https://x/ProvAug.csv'), a('Live courses with regions and venues: August 2026', 'https://x/CourseAug.csv'),
    { title: 'Live courses with regions and venues: September 2026 (accessible)', url: 'https://x/course.xlsx', content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    a('Live courses with regions and venues: September 2026', 'https://x/CourseSep.csv'), a('Live course providers: September 2026', 'https://x/ProvSep.csv'),
    { title: 'Live course providers: October 2026', url: 'https://x/ProvOct.xlsx', content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  ]
  const n = newestFiles(list)
  check('the newest month\'s two CSV files are chosen (not the spreadsheets)', n.courses.url.endsWith('CourseSep.csv') && n.providers.url.endsWith('ProvSep.csv'))
  let err = ''
  try { newestFiles([a('Live courses with regions and venues: September 2026', 'u'), a('Live course providers: August 2026', 'v')]) } catch (e) { err = e.message }
  check('files from different months are refused', /different months/.test(err), err)
  const root = path.join(tmp, 'rd')
  const saved = []
  const getJson = async () => ({ details: { attachments: list } })
  const download = async (url, to) => { fs.writeFileSync(to, 'x'); saved.push(url) }
  const first = await fetchNcs({ root, log: () => {}, getJson, download })
  const again = await fetchNcs({ root, log: () => {}, getJson, download })
  check('the files are saved under RAREBIT_DATA/ncs, and not fetched again', first.length === 2 && again.length === 0 && saved.length === 2 && fs.readdirSync(path.join(root, 'ncs')).sort().join() === 'CourseSep.csv,ProvSep.csv')
}

// ---- the load step
{
  const dir = path.join(tmp, 'rd2', 'ncs')
  fs.mkdirSync(dir, { recursive: true })
  for (const n of ['Live_Courses_With_Regions_And_Venues_Report_-_20260827.csv', 'Live_Courses_With_Regions_And_Venues_Report_-_20261012.csv', 'Live_Course_Providers_Report_-_20261012.csv']) fs.writeFileSync(path.join(dir, n), 'x')
  const steps = ncsSteps(path.join(tmp, 'rd2'))
  const files = steps[54].files()
  check('the latest courses file by its date stamp is the one loaded', path.basename(files[0].file).endsWith('20261012.csv'))
  check('step 54 loads the courses and the providers into OPTIONS_DB.RAW as columns-removed copies that are never staged',
    files.length === 2 && files.every((f) => f.kind === 'columns-removed' && f.stageOriginal === false && f.licence === 'Open Government Licence v3.0' && f.source === 'ncs-course-directory')
      && files[0].table === 'OPTIONS_DB.RAW.NCS_COURSE' && files[1].table === 'OPTIONS_DB.RAW.NCS_PROVIDER')
}

// ---- the gate
{
  const dbt = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'dbt')
  const read = (f) => fs.readFileSync(path.join(dbt, 'models', f), 'utf8')
  const ncs = ['silver/ncs/ncs_provider.sql', 'silver/ncs/ncs_course.sql', 'gold/ncs/ncs_course_card.sql', 'gold/ncs/ncs_course_count.sql']
  const neet = ['silver/neet/neet_participation.sql', 'gold/neet/neet_la_year.sql']
  check('every NCS model but the feed copies the live table when nothing new is loaded (ncs_reusable) and stores its stamp', ncs.every((f) => /\{% set reuse = ncs_reusable\(\) %\}/.test(read(f)) && /ncs_stamp\(\) \}\}::varchar as built_from/.test(read(f))))
  check('every NEET model but the feed does the same (neet_reusable)', neet.every((f) => /\{% set reuse = neet_reusable\(\) %\}/.test(read(f)) && /neet_stamp\(\) \}\}::varchar as built_from/.test(read(f))))
  const macro = fs.readFileSync(path.join(dbt, 'macros', 'ncs.sql'), 'utf8')
  check('the NCS stamp covers the latest course, provider and LARS files and a parsing version, the same in the feed and the check', /ncs_files\(\)/.test(read('silver/ncs/ncs_feed.sql')) && /ncs_lars_files\(\)/.test(read('silver/ncs/ncs_feed.sql')) && /\|v1/.test(read('silver/ncs/ncs_feed.sql')) && /\|v1/.test(macro))
  check('the scratch switch is never on in a normal build (a variable that defaults to false)', (macro.match(/var\('ncs_scratch', false\)/g) ?? []).length >= 3 && !/ncs_scratch: true/.test(fs.readFileSync(path.join(dbt, 'dbt_project.yml'), 'utf8')))
}

fs.rmSync(tmp, { recursive: true, force: true })
console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
