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
// Batch 2 (sql/load_02_tables.sql):
//   6  Ofsted state-funded schools (2 sheets)          -> OPTIONS_DB.RAW
//   7  GIAS, without the five personal columns         -> OPTIONS_DB.RAW
//   8  16 to 18 results by institution                 -> OPTIONS_DB.RAW
//   9  apprenticeship achievement rates                -> OPTIONS_DB.RAW
//   10 Discover Uni (27 CSVs; the zip, with its XML, staged)  -> OPTIONS_DB.RAW
//   11 LARS, every file as published                   -> SHARED_DB.RAW
//   12 test ILR exports and FIS output (TEST DATA)     -> CAPTURE_DB.TEST_BASELINE
// Batch 4, the official data sets (sql/load_04_official_tables.sql;
// scripts/load/official.js):
//   13 English indices of deprivation 2025             -> SHARED_DB.RAW
//   14 claimant count (Nomis)                          -> SHARED_DB.RAW
//   15 ASHE pay by area (Nomis)                        -> SHARED_DB.RAW
//   16 ASHE pay by occupation (ONS tables 14 and 15)   -> SHARED_DB.RAW
//   17 key stage 4 performance                         -> OPTIONS_DB.RAW
//   18 key stage 4 and 16 to 18 destinations           -> OPTIONS_DB.RAW
//   19 apprenticeships (headlines, underlying data)    -> SHARED_DB.RAW
//   20 LEO graduate and further education outcomes     -> OPTIONS_DB.RAW
// Batch 5, more official data (sql/load_05_official_tables.sql;
// scripts/load/official2.js):
//   21 SOC 2020 coding index, as published             -> SHARED_DB.RAW
//   22 Restart Scheme, Work and Health Programme (DWP)  -> SHARED_DB.RAW
//   23 NEET and participation, 16 to 17                 -> SHARED_DB.RAW
//   24 Universal Credit, WHP by area (Stat-Xplore)      -> SHARED_DB.RAW
//   25 online job adverts by SOC 2020 and area (ONS)    -> SHARED_DB.RAW
//   26 APS, UK Business Counts, BRES, Census 2021       -> SHARED_DB.RAW
//   27 Ofqual register of regulated qualifications     -> SHARED_DB.RAW
//   28 Employer Skills Survey, Skills England dashboards -> SHARED_DB.RAW
//   29 vacancies by industry, VACS02 (ONS)              -> SHARED_DB.RAW
//   30 history: achievement rates, Ofsted, apprenticeships -> both
//   31 Nesta skills taxonomy                           -> SHARED_DB.RAW
// Batch 6 (sql/load_06_official_tables.sql; scripts/load/official3.js):
//   32 ONS Postcode Directory in full, and its lookups -> SHARED_DB.RAW
//   33 population by LSOA and local authority (Nomis)   -> SHARED_DB.RAW
//   34 apprenticeship provider and assessment register -> SHARED_DB.RAW
//   35 police.uk street crimes and outcomes (3 years)   -> SHARED_DB.RAW
//   36 NaPTAN stops                                    -> SHARED_DB.RAW
//   37 Graduate Outcomes (HESA, via DfE)                -> OPTIONS_DB.RAW
//   38 listed buildings (Historic England), Wikidata places -> SHARED_DB.RAW
//   39 Ofgem price caps, fuel poverty, electricity regions -> SHARED_DB.RAW
// Batch 7 (sql/load_08_achievement_national.sql):
//   40 achievement rates, national and by provider (2025/26 releases) -> OPTIONS_DB.RAW
// Travel times, decision 19 (sql/load_09_travel_sources.sql; the files
// fetched by scripts/travel/fetch.py into data/travel/, git-ignored):
//   41 BODS GTFS (Yorkshire), ONS LSOA centroids, OpenStreetMap extract -> SHARED_DB.RAW
//   42 the journey times computed by scripts/travel/compute.py          -> SHARED_DB.RAW
// The ILR dummy data workbook (sql/load_10_ilr_dummy.sql):
//   43 ilr-dummy-data.xlsx, its three sheets as they are (TEST DATA)    -> CAPTURE_DB.TEST_BASELINE
//   44 Network Rail SCHEDULE extract and CORPUS, the rail GTFS for the day -> SHARED_DB.RAW
//   45 ONS LSOA (December 2021) boundaries, BGC V5, England and Wales (reach map) -> SHARED_DB.RAW
//
// Where the downloads are: RAREBIT_DATA (default /mnt/c/Users/alanb/
// rarebit-data); the API files the school leavers app cached in
// ~/.cache/school-leavers-app/api; the app itself in SCHOOL_LEAVERS_REPO
// (default ~/school-leavers-app); the LARS zip and the test ILR files and
// FIS output in Downloads and OneDrive (WINDOWS_HOME, default
// /mnt/c/Users/alanb). Needs DATA_LOAD_PRIVATE_KEY_PATH in server/.env.

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import ExcelJS from 'exceljs'
import { Loader } from './load/loader.js'
import { loadContent } from './load/content.js'
import { officialSteps } from './load/official.js'
import { officialSteps2 } from './load/official2.js'
import { officialSteps3 } from './load/official3.js'
import { odsRows, csvLine, csvRecords, writeLines, zipEntry, zipNames } from './load/files.js'

const RAREBIT_DATA = process.env.RAREBIT_DATA || '/mnt/c/Users/alanb/rarebit-data'
const WINDOWS_HOME = process.env.WINDOWS_HOME || '/mnt/c/Users/alanb'
const DOWNLOADS = path.join(WINDOWS_HOME, 'Downloads')
const FIS_RUNS = path.join(WINDOWS_HOME, 'OneDrive/Documents/Funding Information System 2026-27')
const FIS_SANDBOX = path.join(DOWNLOADS, 'DC-ILR-2627-FIS-Desktop.2627.2/Sandbox')
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
  // Ofsted now has one page per inspection year (the single page above
  // answers 404 since October 2026); this is the year the file belongs to.
  // The next year's file will be on that year's page.
  page: 'https://www.gov.uk/government/statistical-data-sets/further-education-and-skills-inspections-and-outcomes-management-information-from-november-2025-to-august-2026',
  file: OFSTED_FE, member: sheet, kind: 'converted', table: `OPTIONS_DB.RAW.${table}`, make: odsToCsv(OFSTED_FE, sheet, 'Provider URN'),
})

// A file inside a zip, copied out as it is.
const extract = (zip, member) => async (out) => { await pipeline(await zipEntry(zip, member), fs.createWriteStream(out)) }

const TRAVEL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'travel')
const REACH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'reach')
const newest = (dir, re) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => re.test(n)).sort().map((n) => path.join(dir, n)) : [])
const GTFS_MEMBERS = ['agency', 'stops', 'routes', 'trips', 'calendar', 'calendar_dates', 'feed_info']
const RAIL_GTFS_MEMBERS = ['agency', 'stops', 'routes', 'trips', 'stop_times', 'calendar_dates', 'feed_info']
const NETWORK_RAIL = 'Network Rail Infrastructure Limited'
const NR_LICENCE = 'Network Rail Infrastructure Limited Data Feeds Licence'
const NR_PAGE = 'https://publicdatafeeds.networkrail.co.uk/'

// GIAS without its personal columns: every other field byte for byte
// (Windows-1252, read and written as latin1, one byte one character).
// TelephoneNum too (sql/load_03_gias_telephone.sql): 157 establishments,
// mostly small independent schools, give a mobile, which may be a person's.
const GIAS_PERSONAL = ['HeadTitle (name)', 'HeadFirstName', 'HeadLastName', 'HeadPreferredJobTitle', 'PropsName', 'TelephoneNum']
const giasWithoutNames = (zip, member) => async (out) => {
  let drop = null
  async function* lines() {
    for await (const record of csvRecords(await zipEntry(zip, member), 'latin1')) {
      if (!drop) {
        drop = new Set(GIAS_PERSONAL.map((c) => record.indexOf(c)))
        if (drop.has(-1) || drop.size !== GIAS_PERSONAL.length) throw new Error(`${member}: the personal columns aren't all there (${GIAS_PERSONAL.join(', ')}): stopped, nothing loaded.`)
      }
      yield csvLine(record.filter((_, i) => !drop.has(i)))
    }
  }
  await writeLines(out, lines(), 'latin1')
  return { removed: GIAS_PERSONAL }
}

// FIS output rows as arrays of cell text: a CSV report, an .xlsx report
// (every sheet), or a CSV inside FIS-CSV.zip.
const RUN_TIME = / \d{8}-\d{6}(?=\.[a-z]+$)/i
// A cell's text as shown. ExcelJS throws on a merged cell whose top-left
// cell is empty: that is an empty cell (a merged range's value is only in
// its top-left cell).
const cellText = (cell) => { try { return cell.text ?? '' } catch { return '' } }

async function fisReportRows({ file, member, run }) {
  const report = member ?? path.basename(file).replace(RUN_TIME, '')
  const rows = []
  if (member || file.toLowerCase().endsWith('.csv')) {
    let n = 0
    for await (const cells of csvRecords(member ? await zipEntry(file, member) : file)) rows.push({ run, report, sheet: null, row: ++n, cells })
  } else {
    const book = new ExcelJS.Workbook()
    await book.xlsx.readFile(file)
    book.eachSheet((sheet) => sheet.eachRow((r, n) => {
      const cells = Array.from({ length: r.cellCount }, (_, i) => cellText(r.getCell(i + 1)))
      rows.push({ run, report, sheet: sheet.name, row: n, cells })
    }))
  }
  return rows
}

async function fisOriginals() {
  const out = []
  for (const run of fs.readdirSync(FIS_RUNS).sort()) {
    const dir = path.join(FIS_RUNS, run)
    for (const name of fs.readdirSync(dir).sort()) {
      const file = path.join(dir, name)
      if (/\.(csv|xlsx)$/i.test(name)) out.push({ file, run })
      else if (/^FIS-CSV.*\.zip$/i.test(name)) for (const m of (await zipNames(file)).filter((n) => n.toLowerCase().endsWith('.csv')).sort()) out.push({ file, member: m, run })
    }
  }
  return out
}

// The ILR dummy data workbook (fictional learners), from its own folder.
// Its two data sheets have a header row, so load as CSVs with their column
// names; the Guide sheet is a title, notes and two lists, so one row per
// sheet row, as the FIS .xlsx reports are.
const ILR_DUMMY = process.env.ILR_DUMMY_XLSX || path.join(WINDOWS_HOME, 'lms/ilr_data/ilr-dummy-data.xlsx')
const ILR_DUMMY_SPEC = { home: 'CAPTURE_DB', source: 'test-ilr-dummy', publisher: 'Rarebit (made for testing)',
  licence: 'Test data (fictional learners); the Guide quotes the ILR 2026 to 2027 guidance (OGL v3.0)', page: null }
// A merged range's value is only in its top-left cell: the others are empty
// here (ExcelJS would repeat the value in each).
const sheetCells = (row) => Array.from({ length: row.cellCount }, (_, i) => {
  const cell = row.getCell(i + 1)
  return cell.type === ExcelJS.ValueType.Merge ? '' : cellText(cell)
})
async function workbookSheet(file, name) {
  const book = new ExcelJS.Workbook()
  await book.xlsx.readFile(file)
  const sheet = book.getWorksheet(name)
  if (!sheet) throw new Error(`${path.basename(file)}: no sheet "${name}"`)
  return sheet
}
// A sheet with a header in row 1 as a CSV: every row as wide as the header,
// each cell's text as shown.
const sheetToCsv = (file, name) => async (out) => {
  const sheet = await workbookSheet(file, name)
  const width = sheet.getRow(1).cellCount
  async function* lines() {
    for (let n = 1; n <= sheet.rowCount; n++) {
      const cells = sheetCells(sheet.getRow(n))
      if (cells.length > width) throw new Error(`${name}: row ${n} is wider than its header`)
      if (n > 1 && cells.every((c) => c === '')) continue
      yield csvLine(Array.from({ length: width }, (_, i) => cells[i] ?? ''))
    }
  }
  await writeLines(out, lines())
}

const TEST = { home: 'CAPTURE_DB', publisher: 'Funding Information System (FIS) 2026 to 2027, run on Rarebit test learners', licence: 'Test data (fictional learners); FIS output', page: null }

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

  // ---------------------------------------------------------------- batch 2
  6: { job: 'load-ofsted-schools', files: () => {
    const file = path.join(RAREBIT_DATA, 'ofsted/Management_information_-_state-funded_schools_-_as_at_31_Aug_2026.ods')
    const spec = (sheet, table) => ({ home: 'OPTIONS_DB', source: 'ofsted-schools', publisher: 'Ofsted', licence: OGL, format: 'OPTIONS_DB.RAW.CSV_UTF8',
      title: 'State-funded schools inspections and outcomes: management information',
      page: 'https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes',
      file, member: sheet, kind: 'converted', table: `OPTIONS_DB.RAW.${table}`, make: odsToCsv(file, sheet, 'URN') })
    return [spec('D1_In_year_inspections', 'OFSTED_SCHOOLS_D1_IN_YEAR'), spec('D2_Most_recent_inspections', 'OFSTED_SCHOOLS_D2_MOST_RECENT')]
  } },
  7: { job: 'load-gias', files: async () => {
    const zip = path.join(RAREBIT_DATA, 'gias/extract.zip')
    const member = (await zipNames(zip)).find((n) => /^edubasealldata\d{8}\.csv$/.test(n))
    if (!member) throw new Error(`No edubasealldata<date>.csv in ${zip}`)
    return [{ home: 'OPTIONS_DB', source: 'gias', publisher: DFE, licence: OGL, format: 'OPTIONS_DB.RAW.CSV_WINDOWS1252', encoding: 'latin1',
      title: 'Get Information about Schools: all establishments', page: 'https://get-information-schools.service.gov.uk/Downloads',
      file: zip, member, kind: 'columns-removed', stageOriginal: false, table: 'OPTIONS_DB.RAW.GIAS_ESTABLISHMENT', make: giasWithoutNames(zip, member) }]
  } },
  8: { job: 'load-performance-16-18', files: [
    { home: 'OPTIONS_DB', source: 'performance-16-18', publisher: DFE, licence: OGL, format: 'OPTIONS_DB.RAW.CSV_UTF8', kind: 'as-downloaded',
      title: 'A level and other 16 to 18 results: institution performance', page: 'https://explore-education-statistics.service.gov.uk/find-statistics/a-level-and-other-16-to-18-results',
      file: path.join(RAREBIT_DATA, 'school-college-results/institution_performance_202225_API.csv'), table: 'OPTIONS_DB.RAW.PERFORMANCE_16_18_INSTITUTION' },
  ] },
  9: { job: 'load-achievement-app', files: () => {
    const zip = path.join(RAREBIT_DATA, 'achievement-rates/apprenticeships_2025-26.zip')
    const member = 'data/na05_app_narts_provider_level_fwk_std_ptype_202526_14.csv'
    return [{ home: 'OPTIONS_DB', source: 'achievement-app', publisher: DFE, licence: OGL, format: 'OPTIONS_DB.RAW.CSV_UTF8',
      title: 'Apprenticeship achievement rates by provider (Apprenticeships)', page: 'https://explore-education-statistics.service.gov.uk/find-statistics/apprenticeships',
      file: zip, member, kind: 'extracted', table: 'OPTIONS_DB.RAW.ACHIEVEMENT_APP_PROVIDER', make: extract(zip, member) }]
  } },
  10: { job: 'load-discover-uni', files: async () => {
    const zip = path.join(RAREBIT_DATA, 'universities/DiscoverUni_latest.zip')
    const members = (await zipNames(zip)).filter((n) => /\.csv$/i.test(n) && !/TEFOutcome\.csv$/i.test(n)).sort()
    return members.map((member) => ({ home: 'OPTIONS_DB', source: 'discover-uni', publisher: 'HESA (Discover Uni)', format: 'OPTIONS_DB.RAW.CSV_UTF8',
      licence: 'CC BY 4.0 (credit HESA, www.hesa.ac.uk; link to the licence; say what was changed)', title: `Discover Uni open data: ${path.basename(member)}`,
      page: 'https://www.hesa.ac.uk/support/tools-and-downloads/unistats', file: zip, member, kind: 'extracted',
      table: `OPTIONS_DB.RAW.DISCOVERUNI_${path.basename(member, '.csv').toUpperCase()}`, make: extract(zip, member) }))
  } },
  11: { job: 'load-lars', files: async () => {
    const zip = process.env.LARS_ZIP || path.join(DOWNLOADS, 'published_012_LearningDelivery_V012_CSV.Zip')
    const members = (await zipNames(zip)).filter((n) => /\.csv$/i.test(n)).sort()
    return members.map((member) => ({ home: 'SHARED_DB', source: 'lars', publisher: DFE, licence: OGL, format: 'SHARED_DB.RAW.CSV_UTF8',
      title: `Learning Aim Reference Service (LARS): ${path.basename(member)}`, page: 'https://submit-learner-data.service.gov.uk/find-a-learning-aim/DownloadData',
      file: zip, member, kind: 'extracted', table: `SHARED_DB.RAW.LARS_${path.basename(member, '.csv').toUpperCase()}`, make: extract(zip, member) }))
  } },
  12: { job: 'load-test-fis', run: async (loader) => [
    ...await loader.loadWholeFiles({ ...TEST, source: 'test-ilr-export', title: 'ILR file exported from the test learners', table: 'CAPTURE_DB.TEST_BASELINE.ILR_EXPORT_XML',
      format: 'CAPTURE_DB.TEST_BASELINE.XML_FILE', column: 'XMLDOC',
      files: [DOWNLOADS, FIS_SANDBOX].flatMap((d) => fs.readdirSync(d).filter((n) => /^ILR-99999999-2627-.*\.XML$/i.test(n)).sort().map((n) => path.join(d, n))) }),
    ...await loader.loadJsonLines({ ...TEST, source: 'test-fis-report', title: 'FIS report on the test ILR file', table: 'CAPTURE_DB.TEST_BASELINE.FIS_REPORT_ROW',
      format: 'CAPTURE_DB.TEST_BASELINE.JSON_LINES', originals: await fisOriginals(), rows: fisReportRows,
      cols: { RUN: '$1:run::string', REPORT: '$1:report::string', SHEET: '$1:sheet::string', ROWNUMBER: '$1:row::number', CELLS: '$1:cells::array' } }),
    ...await loader.loadJsonLines({ ...TEST, source: 'test-fis-output', title: 'FIS output left in its Sandbox folder after its latest run', table: 'CAPTURE_DB.TEST_BASELINE.FIS_OUTPUT_JSON',
      format: 'CAPTURE_DB.TEST_BASELINE.JSON_LINES', originals: fs.readdirSync(FIS_SANDBOX).filter((n) => n.toLowerCase().endsWith('.json')).sort().map((n) => ({ file: path.join(FIS_SANDBOX, n) })),
      rows: async ({ file }) => [{ name: path.basename(file), item: JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) }],
      cols: { NAME: '$1:name::string', ITEM: '$1:item' } }),
  ] },
  ...officialSteps(RAREBIT_DATA),
  ...officialSteps2(RAREBIT_DATA),
  ...officialSteps3(RAREBIT_DATA),

  // ---------------------------------------------------------------- batch 7
  // Achievement rates for provider_benchmark, provider and national from the
  // same 2025/26 releases (sql/load_08_achievement_national.sql).
  40: { job: 'load-achievement-national', files: () => {
    const dir = path.join(RAREBIT_DATA, 'achievement-rates')
    const ees = (file, title, page, table, source) => ({ home: 'OPTIONS_DB', source, publisher: DFE, licence: OGL, format: 'OPTIONS_DB.RAW.CSV_UTF8', kind: 'as-downloaded',
      title, page, file: path.join(dir, file), table })
    return [
      ees('na04_app_narts_provider_type_202526_14.csv', 'Apprenticeship national achievement rates by provider type, subject area, level and age (Apprenticeships 2025/26)',
        'https://explore-education-statistics.service.gov.uk/data-catalogue/data-set/37cc153c-bf81-4376-98eb-c03092fc8e8f', 'OPTIONS_DB.RAW.ACHIEVEMENT_APP_NATIONAL', 'achievement-app-national'),
      ees('nf03_et_narts_headline_total_202526_14.csv', 'Education and training national achievement rates by provider type, provision type, age and subject area (Further education and skills 2025/26)',
        'https://explore-education-statistics.service.gov.uk/data-catalogue/data-set/46840ef9-903f-4dc0-9a3e-996df4263a30', 'OPTIONS_DB.RAW.ACHIEVEMENT_ET_NATIONAL', 'achievement-et-national'),
      ees('nf11_et_narts_provider_summary_with_gcse_202526_14.csv', 'Education and training achievement rates by provider, provision type, age and subject area (Further education and skills 2025/26)',
        'https://explore-education-statistics.service.gov.uk/data-catalogue/data-set/7fe87724-0cec-478b-adcc-6968ba451bc7', 'OPTIONS_DB.RAW.ACHIEVEMENT_ET_PROVIDER', 'achievement-et-provider'),
    ]
  } },

  // ---------------------------------------------------------------- travel times
  // The originals go into the stage beside their rows: the GTFS zip (once,
  // for all seven of its small files), the .osm.pbf and the centroids CSV.
  41: { job: 'load-travel-sources', run: async (loader) => {
    const shared = { home: 'SHARED_DB', format: 'SHARED_DB.RAW.CSV_UTF8' }
    const zip = path.join(TRAVEL, 'bods', 'itm_yorkshire_gtfs.zip')
    const results = []
    for (const m of GTFS_MEMBERS) {
      results.push(await loader.loadCsv({ ...shared, source: 'bods-gtfs', publisher: 'Department for Transport, Bus Open Data Service (supplemented by TNDS)', licence: OGL,
        title: `Bus Open Data Service GTFS timetables, Yorkshire: ${m}.txt`, page: 'https://data.bus-data.dft.gov.uk/timetable/download/gtfs-file/yorkshire/',
        file: zip, member: `${m}.txt`, kind: 'extracted', table: `SHARED_DB.RAW.BODS_GTFS_${m.toUpperCase()}`, make: extract(zip, `${m}.txt`) }))
    }
    results.push(await loader.loadCsv({ ...shared, source: 'ons-lsoa-pwc', publisher: 'Office for National Statistics', licence: `${OGL}; contains OS data © Crown copyright and database right`,
      title: 'Lower layer Super Output Areas (December 2021) EW Population Weighted Centroids (V4)', kind: 'as-downloaded',
      page: 'https://geoportal.statistics.gov.uk/datasets/32729e42d05e4e23bc7e43a36aa4ae8b_0', file: path.join(TRAVEL, 'ons-pwc', 'lsoa21_pwc_v4.csv'), table: 'SHARED_DB.RAW.ONS_LSOA_PWC' }))
    results.push(...await loader.loadJsonLines({ home: 'SHARED_DB', source: 'geofabrik-osm', publisher: 'OpenStreetMap contributors, extract by Geofabrik',
      licence: 'Open Database Licence (ODbL) v1.0; © OpenStreetMap contributors', title: 'OpenStreetMap extract, South Yorkshire',
      page: 'https://download.geofabrik.de/europe/united-kingdom/england/south-yorkshire.html', table: 'SHARED_DB.RAW.OSM_EXTRACT', format: 'SHARED_DB.RAW.JSON_LINES',
      originals: newest(path.join(TRAVEL, 'osm'), /^south-yorkshire-\d{4}-\d{2}-\d{2}\.osm\.pbf$/).map((file) => ({ file })),
      rows: async ({ file }) => [{ name: path.basename(file), header: JSON.parse(fs.readFileSync(`${file}.header.json`, 'utf8')) }],
      cols: { NAME: '$1:name::string', HEADER: '$1:header' } }))
    return results
  }, runLabel: 'BODS GTFS (Yorkshire), ONS LSOA centroids, OpenStreetMap extract' },
  // Each run's journey times (scripts/travel/compute.py), one CSV per run.
  42: { job: 'load-travel-times', files: () => newest(path.join(TRAVEL, 'results'), /^travel_time_lsoa_.*\.csv$/).map((file) => ({
    home: 'SHARED_DB', format: 'SHARED_DB.RAW.CSV_UTF8', source: 'rarebit-travel-time', publisher: 'Rarebit (computed with r5py from BODS, OpenStreetMap and ONS data)',
    // Derived from OpenStreetMap; its BODS and ONS inputs (OGL) have their own SOURCE_FILE rows.
    licence: 'Open Database Licence (ODbL) v1.0; © OpenStreetMap contributors',
    title: 'Journey times between South Yorkshire LSOA population-weighted centroids (decision 19)', kind: 'as-downloaded', page: null,
    file, table: 'SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN' })) },
  // Rail (decision 19 phase B): the SCHEDULE extract (its header row; the
  // file itself in the stage), CORPUS, and the newest rail GTFS that
  // scripts/travel/cif_to_gtfs.py built from them (its zip in the stage once,
  // for all seven of its files).
  44: { job: 'load-rail-sources', run: async (loader) => {
    const shared = { home: 'SHARED_DB', format: 'SHARED_DB.RAW.CSV_UTF8' }
    const nr = path.join(TRAVEL, 'nr')
    const results = []
    results.push(...await loader.loadJsonLines({ home: 'SHARED_DB', source: 'network-rail-schedule', publisher: NETWORK_RAIL, licence: NR_LICENCE,
      title: 'Network Rail SCHEDULE full extract (CIF)', page: NR_PAGE, table: 'SHARED_DB.RAW.NR_SCHEDULE_EXTRACT', format: 'SHARED_DB.RAW.JSON_LINES',
      originals: newest(nr, /^toc-full-\d{4}-\d{2}-\d{2}\.CIF\.gz$/).slice(-1).map((file) => ({ file })),
      rows: async ({ file }) => [{ name: path.basename(file), header: JSON.parse(fs.readFileSync(`${file}.header.json`, 'utf8')) }],
      cols: { NAME: '$1:name::string', HEADER: '$1:header' } }))
    results.push(...await loader.loadJsonLines({ home: 'SHARED_DB', source: 'network-rail-corpus', publisher: NETWORK_RAIL, licence: NR_LICENCE,
      title: 'Network Rail CORPUS location codes', page: NR_PAGE, table: 'SHARED_DB.RAW.NR_CORPUS', format: 'SHARED_DB.RAW.JSON_LINES',
      originals: newest(nr, /^corpus-\d{4}-\d{2}-\d{2}\.json\.gz$/).slice(-1).map((file) => ({ file })),
      rows: async ({ file }) => JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8')).TIPLOCDATA.map((r, i) => ({ n: i + 1, ...r })),
      cols: { FILEROWNUMBER: '$1:n::number', ...Object.fromEntries(['NLC', 'STANOX', 'TIPLOC', '3ALPHA', 'UIC', 'NLCDESC', 'NLCDESC16'].map((k) => [`"${k}"`, `$1:"${k}"::string`])) } }))
    for (const zip of newest(path.join(nr, 'gtfs'), /^rail_south_yorkshire_\d{4}-\d{2}-\d{2}\.zip$/).slice(-1)) {
      for (const m of RAIL_GTFS_MEMBERS) {
        results.push(await loader.loadCsv({ ...shared, source: 'network-rail-schedule', publisher: `${NETWORK_RAIL}; GTFS built by Rarebit`,
          licence: NR_LICENCE, title: `Rail GTFS for South Yorkshire, built from the Network Rail SCHEDULE extract by scripts/travel/cif_to_gtfs.py (station positions from NaPTAN): ${m}.txt`, page: NR_PAGE,
          file: zip, member: `${m}.txt`, kind: 'extracted', table: `SHARED_DB.RAW.NR_GTFS_${m.toUpperCase()}`, make: extract(zip, `${m}.txt`) }))
      }
    }
    return results
  }, runLabel: 'Network Rail SCHEDULE extract, CORPUS, rail GTFS' },
  // The reach map's shading (sql/load_12): the ONS LSOA (December 2021)
  // boundaries, BGC V5, England and Wales, from scripts/reach/fetch-boundaries.js.
  45: { job: 'load-lsoa-boundaries', run: async (loader) => loader.loadJsonLines({ home: 'SHARED_DB', source: 'ons-lsoa-boundaries', publisher: 'Office for National Statistics',
    licence: `${OGL}; contains OS data © Crown copyright and database right`,
    title: 'Lower layer Super Output Areas (December 2021) Boundaries EW BGC (V5), GeoJSON',
    page: 'https://open-geography-portalx-ons.hub.arcgis.com/datasets/ons::lower-layer-super-output-areas-december-2021-boundaries-ew-bgc-v5-2',
    table: 'SHARED_DB.RAW.ONS_LSOA_BOUNDARY', format: 'SHARED_DB.RAW.JSON_LINES',
    originals: [{ file: path.join(REACH, 'lsoa21_bgc_v5.geojson') }],
    rows: async ({ file }) => JSON.parse(fs.readFileSync(file, 'utf8')).features.map((f, i) => ({ n: i + 1, properties: f.properties, geometry: f.geometry })),
    cols: { FEATURENUMBER: '$1:n::number', PROPERTIES: '$1:properties', GEOMETRY: '$1:geometry' } }),
    runLabel: 'ONS LSOA boundaries (reach map)' },
  // ---------------------------------------------------------------- test data
  43: { job: 'load-ilr-dummy', run: async (loader) => {
    const results = []
    for (const [sheet, table] of [['Learner', 'ILR_DUMMY_LEARNER'], ['LearningDelivery', 'ILR_DUMMY_LEARNING_DELIVERY']]) {
      results.push(await loader.loadCsv({ ...ILR_DUMMY_SPEC, format: 'CAPTURE_DB.TEST_BASELINE.CSV_UTF8', title: `ILR 2026 to 2027 dummy data workbook: ${sheet} sheet`,
        file: ILR_DUMMY, member: sheet, kind: 'converted', table: `CAPTURE_DB.TEST_BASELINE.${table}`, make: sheetToCsv(ILR_DUMMY, sheet) }))
    }
    results.push(...await loader.loadJsonLines({ ...ILR_DUMMY_SPEC, title: 'ILR 2026 to 2027 dummy data workbook: Guide sheet',
      table: 'CAPTURE_DB.TEST_BASELINE.ILR_DUMMY_GUIDE', format: 'CAPTURE_DB.TEST_BASELINE.JSON_LINES', originals: [{ file: ILR_DUMMY, member: 'Guide' }],
      rows: async () => {
        const rows = []
        ;(await workbookSheet(ILR_DUMMY, 'Guide')).eachRow((r, n) => rows.push({ row: n, cells: sheetCells(r) }))
        return rows
      },
      cols: { ROWNUMBER: '$1:row::number', CELLS: '$1:cells::array' } }))
    return results
  }, runLabel: 'ilr-dummy-data.xlsx: Learner, LearningDelivery, Guide (TEST DATA)' },
}

export async function runStep(loader, n) {
  const step = STEPS[n]
  await loader.startRun(step.job)
  try {
    const files = typeof step.files === 'function' ? await step.files() : step.files
    const results = step.content ? (await loadContent(loader, step.content)).results ?? []
      : step.run ? await step.run(loader)
        : await files.reduce(async (acc, spec) => [...(await acc), await loader.loadCsv(spec)], Promise.resolve([]))
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
    for (const [n, s] of Object.entries(STEPS)) {
      const files = typeof s.files === 'function' ? await s.files() : s.files
      console.log(`${n}  ${s.job}: ${s.content ?? (s.run ? (s.runLabel ?? 'test ILR exports and FIS output') : `${files.length} file(s): ${files.slice(0, 3).map((f) => `${path.basename(f.file)}${f.member ? ` [${path.basename(f.member)}]` : ''}`).join(', ')}${files.length > 3 ? ' ...' : ''}`)}`)
    }
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
