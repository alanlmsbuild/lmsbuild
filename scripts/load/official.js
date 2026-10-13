// Batch 4 (sql/load_04_official_tables.sql): the official data sets of the
// plan of 13 October 2026, as load:data steps 13 to 20, in the agreed order.
// The API and Nomis files are fetched by scripts/fetch-official.js (and its
// scheduled job); the rest were downloaded once by hand. All into
// RAREBIT_DATA/<source>/; the downloads are only read.
//
// Two sets are spreadsheets, converted to rows here:
//   ASHE tables 14 and 15: every data row of every sheet (All, Male, ...)
//     of every workbook in the zips, estimates and coefficients of
//     variation, with the zip member, sheet and title; each cell's text
//     (x, .., : and . as published). The 2024 table 15 zip holds two zips:
//     their workbooks are named "<inner zip>/<workbook>".
//   IoD 2025 files 10 and 11 (local authority summaries): one row per cell,
//     with its sheet's column header; the Notes sheets left out (and
//     ASHE's notes sheets too).

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import ExcelJS from 'exceljs'
import { csvLine, writeLines, zipEntry, zipNames } from './files.js'
import { nomisFetched } from '../fetch-official.js'

const OGL = 'Open Government Licence v3.0'
const OGL_ONS = 'Open Government Licence v3.0 (credit the Office for National Statistics)'
const DFE = 'Department for Education'
const MHCLG = 'Ministry of Housing, Communities and Local Government'
const EES = 'https://explore-education-statistics.service.gov.uk/find-statistics/'
const EES_API = 'https://api.education.gov.uk/statistics/v1/data-sets/'
const NOMIS = 'https://www.nomisweb.co.uk/api/v01/dataset/'

// A cell's text. ExcelJS throws on a merged cell whose top-left cell is
// empty: that is an empty cell.
const cellText = (cell) => { try { return cell.text ?? '' } catch { return '' } }
const rowTexts = (row, from, to) => Array.from({ length: to - from + 1 }, (_, i) => cellText(row.getCell(from + i)))

// The one file in dir matching re.
function one(dir, re) {
  const f = fs.existsSync(dir) && fs.readdirSync(dir).filter((n) => re.test(n)).sort()
  if (!f?.length) throw new Error(`No file matching ${re} in ${dir}`)
  if (f.length > 1) throw new Error(`More than one file matching ${re} in ${dir}: ${f.join(', ')}`)
  return path.join(dir, f[0])
}

// The first line of a fetched file's .source.txt (the query it came from).
const fetchedFrom = (file) => fs.readFileSync(`${file}.source.txt`, 'utf8').split('\n')[0]

// A workbook out of a zip (or out of a zip inside it) into a temporary
// folder; returns its path and a function to remove it.
async function workbookFromZip(zip, member) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rarebit-xlsx-'))
  const [outer, inner] = member.split(/(?<=\.zip)\//)
  let file = path.join(tmp, 'outer')
  await pipeline(await zipEntry(zip, outer), fs.createWriteStream(file))
  if (inner) {
    const innerFile = path.join(tmp, 'inner')
    await pipeline(await zipEntry(file, inner), fs.createWriteStream(innerFile))
    file = innerFile
  }
  return { file, done: () => fs.rmSync(tmp, { recursive: true, force: true }) }
}

// Every workbook in an ASHE zip, as members (a zip inside it: "<zip>/<xlsx>").
async function asheWorkbooks(zip) {
  const out = []
  for (const n of (await zipNames(zip)).sort()) {
    if (/\.xlsx$/i.test(n)) out.push(n)
    else if (/\.zip$/i.test(n)) {
      const { file, done } = await workbookFromZip(zip, n)
      try { for (const m of (await zipNames(file)).sort()) if (/\.xlsx$/i.test(m)) out.push(`${n}/${m}`) } finally { done() }
    }
  }
  return out
}

export const ASHE_COLUMNS = ['ZIPMEMBER', 'SHEET', 'SHEETROW', 'TABLETITLE', 'Description', 'Code', 'Number of jobs (thousand)', 'Median', 'Median annual percentage change',
  'Mean', 'Mean annual percentage change', '10', '20', '25', '30', '40', '60', '70', '75', '80', '90']

// One ASHE workbook as rows: from the row after the "Description" header
// to the first footnote (a row merged across, Code reading as Description)
// or the first empty row.
const asheToCsv = (zip, member) => async (out) => {
  const { file, done } = await workbookFromZip(zip, member)
  try {
    const book = new ExcelJS.Workbook()
    await book.xlsx.readFile(file)
    async function* lines() {
      yield csvLine(ASHE_COLUMNS)
      for (const sheet of book.worksheets) {
        if (/notes/i.test(sheet.name)) continue
        const title = cellText(sheet.getRow(1).getCell(1))
        let header = 0
        for (let r = 1; r <= Math.min(sheet.rowCount, 20) && !header; r++) if (cellText(sheet.getRow(r).getCell(1)) === 'Description') header = r
        if (!header) throw new Error(`${member} [${sheet.name}]: no "Description" header row`)
        for (let r = header + 1; r <= sheet.rowCount; r++) {
          const cells = rowTexts(sheet.getRow(r), 1, 17)
          if (!cells[0] || cells[1] === cells[0]) break
          yield csvLine([member, sheet.name, r, title, ...cells])
        }
      }
    }
    await writeLines(out, lines())
  } finally { done() }
}

// An IoD local authority summary workbook as one row per cell.
const iodSummaryToCsv = (file) => async (out) => {
  const book = new ExcelJS.Workbook()
  await book.xlsx.readFile(file)
  async function* lines() {
    yield csvLine(['WORKBOOK', 'SHEET', 'SHEETROW', 'AREACODE', 'AREANAME', 'MEASURE', 'VALUE'])
    for (const sheet of book.worksheets) {
      if (sheet.name === 'Notes') continue
      const width = sheet.getRow(1).cellCount
      const header = rowTexts(sheet.getRow(1), 1, width)
      if (!/code/i.test(header[0] ?? '')) throw new Error(`${path.basename(file)} [${sheet.name}]: the first column isn't a code ("${header[0]}")`)
      for (let r = 2; r <= sheet.rowCount; r++) {
        const cells = rowTexts(sheet.getRow(r), 1, width)
        if (!cells[0]) continue
        for (let c = 2; c < width; c++) yield csvLine([path.basename(file), sheet.name, r, cells[0], cells[1], header[c], cells[c]])
      }
    }
  }
  await writeLines(out, lines())
}

const extract = (zip, member) => async (out) => { await pipeline(await zipEntry(zip, member), fs.createWriteStream(out)) }

export function officialSteps(R) {
  const shared = { home: 'SHARED_DB', format: 'SHARED_DB.RAW.CSV_UTF8' }
  const options = { home: 'OPTIONS_DB', format: 'OPTIONS_DB.RAW.CSV_UTF8' }
  // An API data set's latest version fetched (older versions stay on disk).
  const apiFile = (dir, id) => {
    const vers = (fs.existsSync(path.join(R, dir)) ? fs.readdirSync(path.join(R, dir)) : []).map((n) => n.match(new RegExp(`^${id}_v([\\d.]+)\\.csv$`))).filter(Boolean)
    if (!vers.length) throw new Error(`No ${id}_v<version>.csv in ${path.join(R, dir)}`)
    const key = (v) => v.split('.').map((x) => x.padStart(6, '0')).join('.')
    return path.join(R, dir, vers.sort((a, b) => (key(a[1]) < key(b[1]) ? -1 : 1)).at(-1)[0])
  }
  // Every file fetched for a Nomis set (the first, then one per fetch).
  const nomisFiles = (dir, base) => nomisFetched(path.join(R, dir), base).map((f) => f.file).sort()
  const api = (base, source, dir, id, title, table) => ({ ...base, source, publisher: DFE, licence: OGL, kind: 'as-downloaded', title,
    page: `${EES_API}${id}`, file: apiFile(dir, id), table })
  const nomis = (source, file, title, table) => ({ ...shared, source, publisher: 'Office for National Statistics, via Nomis', licence: OGL_ONS, kind: 'as-downloaded',
    title, page: fetchedFrom(file), file, table })
  return {
    13: { job: 'load-iod-2025', files: () => {
      const dir = path.join(R, 'iod-2025')
      const page = 'https://www.gov.uk/government/statistics/english-indices-of-deprivation-2025'
      const summary = (re, title) => {
        const file = one(dir, re)
        return { ...shared, source: 'iod-2025', publisher: MHCLG, licence: OGL, page, title, file, member: path.basename(file), kind: 'converted',
          table: 'SHARED_DB.RAW.IOD2025_LA_SUMMARY', make: iodSummaryToCsv(file) }
      }
      return [
        { ...shared, source: 'iod-2025', publisher: MHCLG, licence: OGL, page, kind: 'as-downloaded', file: one(dir, /^File_7_.*\.csv$/),
          title: 'English indices of deprivation 2025, File 7: all ranks, scores, deciles and population denominators', table: 'SHARED_DB.RAW.IOD2025_LSOA' },
        summary(/^File_10_.*\.xlsx$/, 'English indices of deprivation 2025, File 10: local authority district summaries (lower tier)'),
        summary(/^File_11_.*\.xlsx$/, 'English indices of deprivation 2025, File 11: local authority district summaries (upper tier)'),
      ]
    } },
    14: { job: 'load-claimant-count', files: () => nomisFiles('claimant-count', 'claimant_count_nm_162_1').map((f) =>
      nomis('nomis-claimant-count', f, 'Claimant count by sex and age (Nomis NM_162_1)', 'SHARED_DB.RAW.NOMIS_CLAIMANT_COUNT')) },
    15: { job: 'load-ashe-area', files: () => [
      ...nomisFiles('ashe', 'ashe_workplace_nm_99_1').map((f) => nomis('nomis-ashe-workplace', f, 'Annual Survey of Hours and Earnings, workplace analysis (Nomis NM_99_1)', 'SHARED_DB.RAW.NOMIS_ASHE_WORKPLACE')),
      ...nomisFiles('ashe', 'ashe_resident_nm_30_1').map((f) => nomis('nomis-ashe-resident', f, 'Annual Survey of Hours and Earnings, resident analysis (Nomis NM_30_1)', 'SHARED_DB.RAW.NOMIS_ASHE_RESIDENT')),
    ] },
    16: { job: 'load-ashe-occupation', files: async () => {
      const B = 'https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/datasets/'
      const out = []
      for (const [re, page, title] of [
        [/^ashetable14\d{4}\w+\.zip$/, `${B}occupation4digitsoc2010ashetable14`, 'ASHE Table 14: occupation by four-digit SOC'],
        [/^ashetable15\d{4}\w+\.zip$/, `${B}regionbyoccupation4digitsoc2010ashetable15`, 'ASHE Table 15: region by occupation by four-digit SOC'],
      ]) {
        for (const zip of fs.readdirSync(path.join(R, 'ashe')).filter((n) => re.test(n)).sort().map((n) => path.join(R, 'ashe', n))) {
          for (const member of await asheWorkbooks(zip)) {
            out.push({ ...shared, source: 'ashe-occupation', publisher: 'Office for National Statistics', licence: OGL_ONS, page, title: `${title} (${path.basename(zip, '.zip')})`,
              file: zip, member, kind: 'converted', table: 'SHARED_DB.RAW.ASHE_OCCUPATION', make: asheToCsv(zip, member) })
          }
        }
      }
      return out
    } },
    17: { job: 'load-ks4-performance', files: () => [
      api(options, 'ks4-performance-school', 'ks4-performance', '19e39901-a96c-be76-b9c2-6af54ae076d2', 'Key stage 4 performance: performance tables schools data', 'OPTIONS_DB.RAW.KS4_PERFORMANCE_SCHOOL'),
      api(options, 'ks4-performance-geography', 'ks4-performance', 'b3e19901-5d2b-b676-bb4c-e60937d74725', 'Key stage 4 performance: all state-funded pupil characteristics and geography data', 'OPTIONS_DB.RAW.KS4_PERFORMANCE_GEOGRAPHY'),
    ] },
    18: { job: 'load-destinations', files: () => [
      api(options, 'ks4-destinations', 'destinations', '019d4f41-22d1-71b2-a1a7-f3b91026815b', 'Key stage 4 destination measures: key stage 4 leavers destinations', 'OPTIONS_DB.RAW.KS4_DESTINATIONS'),
      api(options, 'destinations-16-18', 'destinations', '019d4e73-6440-7523-b60c-bfab1ad4a30d', '16-18 destination measures: 16-18 study leavers destinations', 'OPTIONS_DB.RAW.DESTINATIONS_16_18'),
    ] },
    19: { job: 'load-apprenticeships', files: () => {
      const dir = path.join(R, 'apprenticeships')
      const underlying = (n, title, table) => ({ ...shared, source: 'app-underlying', publisher: DFE, licence: OGL, page: `${EES}apprenticeships`, title,
        file: path.join(dir, `${n}.zip`), member: `${n}.csv`, kind: 'extracted', table, make: extract(path.join(dir, `${n}.zip`), `${n}.csv`) })
      return [
        api(shared, 'app-headline-full-year', 'apprenticeships', '1d419801-a90e-f970-9335-a13623faccbe', 'Apprenticeships: headline full year starts, achievements and participation', 'SHARED_DB.RAW.APP_HEADLINE_FULL_YEAR'),
        api(shared, 'app-headline-in-year', 'apprenticeships', '1d419801-435d-c676-b428-1217e08290c3', 'Apprenticeships: headline in-year starts, achievements and participation', 'SHARED_DB.RAW.APP_HEADLINE_IN_YEAR'),
        underlying('apps_u01_underlying_starts_202526_10', 'Apprenticeships 2025/26 underlying data: starts', 'SHARED_DB.RAW.APP_UNDERLYING_STARTS'),
        underlying('apps_u03_underlying_achievements_202526_10', 'Apprenticeships 2025/26 underlying data: achievements', 'SHARED_DB.RAW.APP_UNDERLYING_ACHIEVEMENTS'),
      ]
    } },
    20: { job: 'load-leo', files: () => {
      const g = path.join(R, 'leo/graduate')
      const f = path.join(R, 'leo/fe')
      const gradPage = `${EES}leo-graduate-and-postgraduate-outcomes`
      const fePage = `${EES}further-education-outcome-based-success-measures`
      const leo = (file, page, title, table, extra = {}) => ({ ...options, source: table.split('.').at(-1).toLowerCase().replaceAll('_', '-'), publisher: DFE, licence: OGL,
        kind: 'as-downloaded', page, title, file, table, ...extra })
      const zip = path.join(g, 'Underlying data files for the LEO provider level dashboard.zip')
      return [
        leo(one(g, /^outcomes_and_earnings_data_.*\.csv$/), gradPage, 'LEO graduate outcomes: outcomes and earnings data', 'OPTIONS_DB.RAW.LEO_GRAD_OUTCOMES_EARNINGS'),
        leo(one(g, /^cah_level_3_subject_data_.*\.csv$/), gradPage, 'LEO graduate outcomes: CAH level 3 subject data', 'OPTIONS_DB.RAW.LEO_GRAD_CAH3_SUBJECT'),
        leo(path.join(g, 'provider_regional_movement_data.csv'), gradPage, 'LEO graduate outcomes: provider regional movement data', 'OPTIONS_DB.RAW.LEO_GRAD_PROVIDER_REGIONAL_MOVEMENT'),
        ...['provider_data_by_sex', 'provider_data_by_ethnicity', 'provider_data_by_ethnicity_by_subject', 'provider_data_by_idaci', 'provider_data_by_priorattainment', 'variable_lookup'].map((m) =>
          leo(zip, gradPage, `LEO graduate outcomes: provider level dashboard data, ${m}.csv`, `OPTIONS_DB.RAW.LEO_GRAD_${m.replace('provider_data_by_', 'PROVIDER_').toUpperCase()}`,
            { member: `${m}.csv`, kind: 'extracted', make: extract(zip, `${m}.csv`) })),
        ...['PRV01', 'PRV02', 'PRV03', 'PRV04', 'PRV05', 'EAR01', 'EAR02'].map((c) =>
          leo(one(f, new RegExp(`^${c.toLowerCase()}_.*\\.csv$`)), fePage, `Further education outcome-based success measures (${c})`, `OPTIONS_DB.RAW.LEO_FE_${c}`)),
      ]
    } },
  }
}
