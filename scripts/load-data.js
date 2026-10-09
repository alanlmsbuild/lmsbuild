// load-data.js - loading the data we work with into Snowflake (Rarebit's
// standing rule, 9 October 2026), as DATA_LOAD_USER. Each step is one run in
// SHARED_DB.OPS.JOB_RUN; every file gets a SOURCE_FILE row with its
// checksum, licence and counts; files already loaded are skipped, so any
// step is safe to run again. The downloads are only read.
//
//   npm run load:data -- 1 2 3     run steps 1, 2 and 3
//   npm run load:data -- list      what each step loads
//
// Steps (sql/load_01_tables.sql has their tables):
//   1  knowledge bank (school-leavers-app content/)    -> OPTIONS_DB.CONTENT
//   2  page data (school-leavers-app data/)            -> OPTIONS_DB.CONTENT
//   3  national 16 to 18 figures (2 API data sets)     -> OPTIONS_DB.RAW
//   4  Ofsted further education and skills (4 sheets)  -> OPTIONS_DB.RAW
//   5  education and training achievement rates       -> OPTIONS_DB.RAW
//
// Where the downloads are: RAREBIT_DATA (default /mnt/c/Users/alanb/
// rarebit-data); the API files the school leavers app cached in
// ~/.cache/school-leavers-app/api; the app itself in SCHOOL_LEAVERS_REPO
// (default ~/school-leavers-app). Needs DATA_LOAD_PRIVATE_KEY_PATH in
// server/.env.

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Loader } from './load/loader.js'
import { loadContent } from './load/content.js'
import { odsRows, csvLine, writeLines } from './load/files.js'

const RAREBIT_DATA = process.env.RAREBIT_DATA || '/mnt/c/Users/alanb/rarebit-data'
const API_CACHE = path.join(process.env.HOME, '.cache/school-leavers-app/api')
const OGL = 'Open Government Licence v3.0'
const DFE = 'Department for Education'
const EES_API = 'https://api.education.gov.uk/statistics/v1/data-sets/'

// An .ods sheet as a CSV: the title and notes rows before the header (the
// row with `marker` in it) left out; each cell's text as shown; the address
// behind the first column's web link added as a last column.
const odsToCsv = (file, sheet, marker) => async (out) => {
  async function* lines() {
    let width = 0
    for await (const cells of odsRows(file, sheet)) {
      if (!width) {
        if (!cells.some((c) => c.text === marker)) continue
        width = cells.length
        yield csvLine([...cells.map((c) => c.text), `${cells[0].text} [link address]`])
        continue
      }
      if (cells.length > width) throw new Error(`${sheet}: a row is wider than its header`)
      const texts = Array.from({ length: width }, (_, i) => cells[i]?.text ?? '')
      yield csvLine([...texts, cells[0]?.href ?? ''])
    }
    if (!width) throw new Error(`${sheet}: no header row with "${marker}"`)
  }
  await writeLines(out, lines())
}

const OFSTED_FE = path.join(RAREBIT_DATA, 'ofsted/Management_information_further_education_and_skills_as_at_31_August_2026 (1).ods')
const ofstedFe = (sheet, table) => ({
  home: 'OPTIONS_DB', source: 'ofsted-fe', publisher: 'Ofsted', licence: OGL, format: 'OPTIONS_DB.RAW.CSV_UTF8',
  title: 'Further education and skills inspections and outcomes: management information',
  page: 'https://www.gov.uk/government/statistical-data-sets/inspections-and-outcomes-in-further-education-and-skills-management-information',
  file: OFSTED_FE, member: sheet, kind: 'converted', table: `OPTIONS_DB.RAW.${table}`, make: odsToCsv(OFSTED_FE, sheet, 'Provider URN'),
})

export const STEPS = {
  1: { job: 'load-knowledge-bank', content: 'knowledge-bank' },
  2: { job: 'load-page-data', content: 'page-data' },
  3: { job: 'load-ees-national', files: [
    { home: 'OPTIONS_DB', source: 'ees-national-attainment', publisher: DFE, licence: OGL, format: 'OPTIONS_DB.RAW.CSV_UTF8', kind: 'as-downloaded',
      title: 'Attainment and other performance measures: institution type and sex (A level and other 16 to 18 results)',
      page: `${EES_API}019d9132-c369-7165-8288-207ef5e5e616`, file: path.join(API_CACHE, '019d9132-c369-7165-8288-207ef5e5e616_v1.0.csv'),
      table: 'OPTIONS_DB.RAW.EES_NATIONAL_ATTAINMENT_16_18' },
    { home: 'OPTIONS_DB', source: 'ees-national-retention', publisher: DFE, licence: OGL, format: 'OPTIONS_DB.RAW.CSV_UTF8', kind: 'as-downloaded',
      title: 'Retention: institution type and sex (A level and other 16 to 18 results)',
      page: `${EES_API}019d9138-fa46-7320-a39a-07864bfca1b6`, file: path.join(API_CACHE, '019d9138-fa46-7320-a39a-07864bfca1b6_v1.0.csv'),
      table: 'OPTIONS_DB.RAW.EES_NATIONAL_RETENTION_16_18' },
  ] },
  4: { job: 'load-ofsted-fe', files: [
    ofstedFe('D1_In-year_full_inspections', 'OFSTED_FE_D1_FULL_INSPECTIONS'),
    ofstedFe('D2_Monitoring_inspections', 'OFSTED_FE_D2_MONITORING'),
    ofstedFe('D3_New_provider_monitoring_insp', 'OFSTED_FE_D3_NEW_PROVIDER_MONITORING'),
    ofstedFe('D4_Provider_list', 'OFSTED_FE_D4_PROVIDER_LIST'),
  ] },
  5: { job: 'load-achievement-et', files: [
    { home: 'OPTIONS_DB', source: 'achievement-et', publisher: DFE, licence: OGL, format: 'OPTIONS_DB.RAW.CSV_UTF8', kind: 'as-downloaded',
      title: 'Education and training achievement rates by provider (Further education and skills)',
      page: 'https://explore-education-statistics.service.gov.uk/find-statistics/further-education-and-skills',
      file: path.join(RAREBIT_DATA, 'achievement-rates/et_narts_providers_summary.csv'), table: 'OPTIONS_DB.RAW.ACHIEVEMENT_ET_PROVIDER_SUMMARY' },
  ] },
}

export async function runStep(loader, n) {
  const step = STEPS[n]
  await loader.startRun(step.job)
  try {
    const results = step.content
      ? (await loadContent(loader, step.content)).results ?? []
      : await step.files.reduce(async (acc, spec) => [...(await acc), await loader.loadCsv(spec)], Promise.resolve([]))
    const summary = { files: results.length, rowsRead: results.reduce((n, r) => n + (r.rowsRead ?? 0), 0), rowsLoaded: results.reduce((n, r) => n + (r.rowsLoaded ?? 0), 0), skipped: results.filter((r) => r.skipped).length }
    await loader.finishRun('succeeded', null, summary)
    loader.log(`${step.job}: succeeded`)
    return { step: n, job: step.job, jobRunId: loader.jobRunId, results }
  } catch (err) {
    await loader.finishRun('failed', err.message)
    loader.log(`${step.job}: failed: ${err.message}`)
    throw err
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  if (!args.length || args[0] === 'list') {
    for (const [n, s] of Object.entries(STEPS)) console.log(`${n}  ${s.job}: ${s.content ?? s.files.map((f) => `${path.basename(f.file)}${f.member ? ` [${f.member}]` : ''}`).join(', ')}`)
    process.exit(0)
  }
  const unknown = args.filter((a) => !STEPS[a])
  if (unknown.length) { console.error(`No step ${unknown.join(', ')}. npm run load:data -- list`); process.exit(1) }
  const loader = await Loader.open()
  const done = []
  let failed = false
  try {
    for (const n of args) done.push(await runStep(loader, n))
  } catch {
    failed = true
  } finally {
    await loader.close()
  }
  console.log('\nstep  file  table  read  loaded  JOB_RUN')
  for (const d of done) for (const r of d.results) {
    console.log([d.step, r.file + (r.member ? ` [${r.member}]` : ''), r.table, r.skipped ? 'skipped' : r.rowsRead, r.skipped ? '' : r.rowsLoaded, d.jobRunId].join('  '))
  }
  process.exit(failed ? 1 : 0)
}
