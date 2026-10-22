// Batch 5 (sql/load_05_official_tables.sql): the further official data sets
// of the plan of 13 October 2026, as load:data steps 21 to 31, in the
// agreed order. Downloads in RAREBIT_DATA/<source>/, only read. The Nomis
// and Stat-Xplore files are fetched by scripts/fetch-official.js (and its
// scheduled jobs); the rest were fetched once.
//
// Files with a stable layout go to typed tables (columns as in the file's
// header, all text), as before. Published files whose layout varies (DWP's
// and ONS's spreadsheets, Ofsted's yearly CSVs, the 2018/19 achievement rate
// tables, small text tables) go to RAW.PUBLISHED_CELL instead: one row per
// non-empty cell, with its sheet, row and column, and the column's header.
// A sheet's header row is the first with at least three non-empty cells (a
// CSV's is its first row); it's recorded, so silver can check it. Cells
// above it have no header. Values are each cell's text as shown (a formula's
// result; a date as YYYY-MM-DD). A CSV is read as UTF-8 if it is, otherwise
// as Windows-1252 (Ofsted's), and written as UTF-8.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import ExcelJS from 'exceljs'
import { SaxesParser } from 'saxes'
import { csvLine, csvRecords, writeLines, zipEntry, zipNames } from './files.js'
import { NOMIS_SETS } from '../fetch-official.js'
import { SX_SETS, sxFetched } from './statxplore.js'
import { OFQUAL_PERSONAL_FIELDS, withoutPersonalFields } from './ofqual.js'

const OGL = 'Open Government Licence v3.0'
const OGL_ONS = 'Open Government Licence v3.0 (credit the Office for National Statistics)'
const DFE = 'Department for Education'
const DWP = 'Department for Work and Pensions'
const ONS = 'Office for National Statistics'
const EES = 'https://explore-education-statistics.service.gov.uk/find-statistics/'
const GOVUK = 'https://www.gov.uk'

export const CELL_COLUMNS = ['MEMBER', 'SHEET', 'SHEETROW', 'SHEETCOLUMN', 'HEADERROW', 'HEADER', 'VALUE']

function files(dir, re) {
  const out = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => re.test(n)).sort().map((n) => path.join(dir, n)) : []
  if (!out.length) throw new Error(`No file matching ${re} in ${dir}`)
  return out
}
const one = (dir, re) => {
  const f = files(dir, re)
  if (f.length > 1) throw new Error(`More than one file matching ${re} in ${dir}`)
  return f[0]
}

// ------------------------------------------------------------------ cells

const xlsxText = (v) => {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v !== 'object') return String(v)
  if (v.richText) return v.richText.map((t) => t.text).join('')
  if ('result' in v) return xlsxText(v.result)
  if (v.text !== undefined) return xlsxText(v.text)
  if (v.error) return String(v.error)
  return ''
}

// An .xlsx's rows, streamed: { sheet, row, cells } (cells[0] is column A).
async function* xlsxRows(file) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(file, { sharedStrings: 'cache', hyperlinks: 'ignore', styles: 'ignore', worksheets: 'emit' })
  for await (const ws of reader) {
    for await (const row of ws) yield { sheet: ws.name, row: row.number, cells: (row.values ?? []).slice(1).map(xlsxText) }
  }
}

// An .ods's rows, every sheet: { sheet, row, cells }, with true row numbers
// (repeated empty rows counted).
async function* odsRowsAll(file) {
  const stream = await zipEntry(file, 'content.xml')
  stream.setEncoding('utf8')
  const parser = new SaxesParser()
  const queue = []
  let sheet = null
  let rowNo = 0
  let row = null
  let rowRepeat = 1
  let cell = null
  let repeat = 1
  let paragraphs = 0
  let skip = 0 // inside a drawing or comment: its text isn't the cell's
  parser.on('opentag', (tag) => {
    if (/^(draw:|office:annotation)/.test(tag.name)) { skip++; return }
    if (skip) return
    if (tag.name === 'table:table') { sheet = tag.attributes['table:name']; rowNo = 0 } else if (tag.name === 'table:table-row') {
      row = []
      rowRepeat = Number(tag.attributes['table:number-rows-repeated'] ?? 1)
    } else if ((tag.name === 'table:table-cell' || tag.name === 'table:covered-table-cell') && row) {
      cell = ''
      repeat = Math.min(Number(tag.attributes['table:number-columns-repeated'] ?? 1), 1000)
      paragraphs = 0
    } else if (tag.name === 'text:p' && cell !== null) { if (paragraphs++) cell += ' ' } else if (tag.name === 'text:s' && cell !== null) cell += ' '.repeat(Number(tag.attributes['text:c'] ?? 1))
  })
  parser.on('text', (t) => { if (cell !== null && !skip) cell += t })
  parser.on('closetag', (tag) => {
    if (/^(draw:|office:annotation)/.test(tag.name)) { skip--; return }
    if (skip) return
    if ((tag.name === 'table:table-cell' || tag.name === 'table:covered-table-cell') && row && cell !== null) {
      for (let i = 0; i < repeat; i++) row.push(cell)
      cell = null
    } else if (tag.name === 'table:table-row' && row) {
      while (row.length && !row.at(-1)) row.pop()
      if (row.length) queue.push({ sheet, row: rowNo + 1, cells: row })
      rowNo += rowRepeat
      row = null
    }
  })
  for await (const chunk of stream) {
    parser.write(chunk)
    while (queue.length) yield queue.shift()
  }
  parser.close()
  while (queue.length) yield queue.shift()
}

// A CSV's rows (sheet ''), read as UTF-8 or else Windows-1252.
async function* csvRowsDecoded(file) {
  const bytes = fs.readFileSync(file)
  let text
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { text = new TextDecoder('windows-1252').decode(bytes) }
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rarebit-csv-')), 'utf8.csv')
  fs.writeFileSync(tmp, text)
  try {
    let n = 0
    for await (const cells of csvRecords(tmp)) yield { sheet: '', row: ++n, cells, csv: true }
  } finally { fs.rmSync(path.dirname(tmp), { recursive: true, force: true }) }
}

// A file (or a member of a zip) as cell rows, written to out.
export const toCells = (file, member = null) => async (out) => {
  let local = file
  let tmp = null
  if (member) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rarebit-cell-'))
    local = path.join(tmp, path.basename(member).replace(/[^A-Za-z0-9._-]+/g, '_'))
    await pipeline(await zipEntry(file, member), fs.createWriteStream(local))
  }
  const name = member ?? path.basename(file)
  const rows = /\.xlsx$/i.test(name) ? xlsxRows(local) : /\.ods$/i.test(name) ? odsRowsAll(local) : csvRowsDecoded(local)
  async function* lines() {
    yield csvLine(CELL_COLUMNS)
    let sheet = null
    let headerRow = 0
    let header = []
    for await (const r of rows) {
      if (r.sheet !== sheet) { sheet = r.sheet; headerRow = 0; header = [] }
      if (!headerRow && (r.csv || r.cells.filter((c) => c !== '').length >= 3)) { headerRow = r.row; header = r.cells }
      for (const [i, v] of r.cells.entries()) {
        if (v === '') continue
        yield csvLine([member ?? '', r.sheet, r.row, i + 1, headerRow || '', headerRow && r.row > headerRow ? (header[i] ?? '') : '', v])
      }
    }
  }
  try { await writeLines(out, lines()) } finally { if (tmp) fs.rmSync(tmp, { recursive: true, force: true }) }
}

const extract = (zip, member) => async (out) => { await pipeline(await zipEntry(zip, member), fs.createWriteStream(out)) }

// ------------------------------------------------------------------ steps

export function officialSteps2(R) {
  const shared = { home: 'SHARED_DB', format: 'SHARED_DB.RAW.CSV_UTF8' }
  const options = { home: 'OPTIONS_DB', format: 'OPTIONS_DB.RAW.CSV_UTF8' }
  const cells = (base, source, file, member, title, publisher, page, licence = OGL) => ({ ...base, source, publisher, licence, page, title, file, member: member ?? path.basename(file),
    kind: 'converted', table: `${base.home}.RAW.PUBLISHED_CELL`, make: toCells(file, member) })
  const csv = (base, source, file, title, publisher, page, table, licence = OGL) => ({ ...base, source, publisher, licence, page, title, file, kind: 'as-downloaded', table })
  const fetched = (dir, base) => {
    const d = path.join(R, dir)
    if (!fs.existsSync(d)) return []
    return fs.readdirSync(d).filter((n) => n.startsWith(base) && n.endsWith('.csv') && fs.existsSync(path.join(d, `${n}.source.txt`))).sort().map((n) => path.join(d, n))
  }
  const nomisSet = (id) => NOMIS_SETS.find((s) => s.id === id)
  const nomis = (id, table, title) => fetched(nomisSet(id).dir, nomisSet(id).base).map((f) => ({ ...shared, source: `nomis-${id.toLowerCase().replaceAll('_', '-')}`,
    publisher: 'Office for National Statistics, via Nomis', licence: OGL_ONS, kind: 'as-downloaded', title, file: f, table,
    // The full query is longer than PAGEURL takes: it's staged beside the file.
    page: `https://www.nomisweb.co.uk/api/v01/dataset/${id}.data.csv (query: ${path.basename(f)}.source.txt beside it in the stage)`, sidecar: `${f}.source.txt` }))

  return {
    21: { job: 'load-soc-coding-index', files: () => {
      const zip = one(path.join(R, 'soc-coding-index'), /\.zip$/)
      const page = 'https://www.ons.gov.uk/methodology/classificationsandstandards/standardoccupationalclassificationsoc/soc2020/soc2020volume2codingrulesandconventions'
      const base = { source: 'soc-coding-index', publisher: ONS, licence: OGL_ONS, page, file: zip }
      return [
        { ...shared, ...base, format: 'SHARED_DB.RAW.CSV_WINDOWS1252', encoding: 'latin1', title: 'SOC 2020 Volume 2: the coding index', member: 'SOC2020_volume2_thecodingindexv2.csv',
          kind: 'extracted', table: 'SHARED_DB.RAW.SOC2020_CODING_INDEX', make: extract(zip, 'SOC2020_volume2_thecodingindexv2.csv') },
        { ...shared, ...base, title: 'SOC 2020 Volume 2: the SOC 2020 framework', member: 'SOC2020_framework.csv',
          kind: 'extracted', table: 'SHARED_DB.RAW.SOC2020_FRAMEWORK', make: extract(zip, 'SOC2020_framework.csv') },
        ...['ISOC-08_framework.csv', 'Abbreviations.csv', 'Information.csv', 'FILE SPEC.csv'].map((m) =>
          cells(shared, 'soc-coding-index', zip, m, `SOC 2020 Volume 2: ${m}`, ONS, page, OGL_ONS)),
      ]
    } },
    22: { job: 'load-dwp-programmes', files: () => [
      cells(shared, 'dwp-restart-scheme', one(path.join(R, 'dwp'), /^restart-scheme.*\.ods$/), null, 'Restart Scheme statistics (tables)', DWP, `${GOVUK}/government/collections/restart-scheme-statistics`),
      cells(shared, 'dwp-work-and-health', one(path.join(R, 'dwp'), /^Work_and_Health.*\.ods$/), null, 'Work and Health Programme statistics (tables)', DWP, `${GOVUK}/government/collections/work-and-health-programme-statistics`),
    ] },
    23: { job: 'load-neet-16-17', files: () => {
      const page = `${EES}participation-in-education-training-and-neet-age-16-to-17-by-local-authority`
      return [
        csv(shared, 'neet-16-17', one(path.join(R, 'neet'), /^neet_by_characteristics_.*\.csv$/), 'NEET age 16 to 17 by characteristics', DFE, page, 'SHARED_DB.RAW.NEET_16_17_BY_CHARACTERISTICS'),
        csv(shared, 'neet-16-17', one(path.join(R, 'neet'), /^participation_by_characteristics_.*\.csv$/), 'Participation age 16 to 17 by characteristics', DFE, page, 'SHARED_DB.RAW.PARTICIPATION_16_17_BY_CHARACTERISTICS'),
        csv(shared, 'neet-16-17', one(path.join(R, 'neet'), /^participation_by_type_.*\.csv$/), 'Participation age 16 to 17 by type', DFE, page, 'SHARED_DB.RAW.PARTICIPATION_16_17_BY_TYPE'),
      ]
    } },
    24: { job: 'load-stat-xplore', files: () => SX_SETS.flatMap((s) => sxFetched(path.join(R, s.dir), s.base).map((f) => f.file).sort().map((f) =>
      ({ ...shared, source: `statxplore-${s.base.replaceAll('_', '-')}`, publisher: `${DWP}, via Stat-Xplore`, licence: OGL, kind: 'as-downloaded',
        title: `Stat-Xplore: ${s.database} by month and local authority`, page: `https://stat-xplore.dwp.gov.uk (query: ${path.basename(f)}.source.txt beside it in the stage)`,
        sidecar: `${f}.source.txt`, file: f, table: 'SHARED_DB.RAW.STATXPLORE_TABLE' }))) },
    25: { job: 'load-online-job-adverts', files: () => files(path.join(R, 'ons-online-adverts'), /\.xlsx$/).map((f) =>
      cells(shared, 'ons-online-job-adverts', f, null, 'Labour demand volumes by SOC 2020, UK (online job adverts, Textkernel; official statistics in development)', ONS,
        'https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/employmentandemployeetypes/datasets/labourdemandvolumesbystandardoccupationclassificationsoc2020uk', OGL_ONS)) },
    26: { job: 'load-labour-market', files: () => [
      ...nomis('NM_17_5', 'SHARED_DB.RAW.NOMIS_APS', 'Annual Population Survey: qualifications and employment (Nomis NM_17_5)'),
      ...nomis('NM_141_1', 'SHARED_DB.RAW.NOMIS_UBC_LOCAL_UNITS', 'UK Business Counts: local units (Nomis NM_141_1)'),
      ...nomis('NM_142_1', 'SHARED_DB.RAW.NOMIS_UBC_ENTERPRISES', 'UK Business Counts: enterprises (Nomis NM_142_1)'),
      ...nomis('NM_189_1', 'SHARED_DB.RAW.NOMIS_BRES', 'Business Register and Employment Survey, open access (Nomis NM_189_1)'),
      ...nomis('NM_2080_1', 'SHARED_DB.RAW.NOMIS_CENSUS_TS063_OCCUPATION', 'Census 2021 TS063: occupation (Nomis NM_2080_1)'),
      ...nomis('NM_2077_1', 'SHARED_DB.RAW.NOMIS_CENSUS_TS060_INDUSTRY', 'Census 2021 TS060: industry (Nomis NM_2077_1)'),
    ] },
    27: { job: 'load-ofqual-register', runLabel: 'Ofqual register (JSON lines)', run: async (loader) => {
      const dir = path.join(R, 'ofqual')
      const lines = async ({ file }) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l, i) => ({ n: i + 1, item: JSON.parse(l) }))
      const base = { home: 'SHARED_DB', source: 'ofqual-register', publisher: 'Ofqual', licence: OGL, page: 'https://register-api.ofqual.gov.uk', format: 'SHARED_DB.RAW.JSON_LINES' }
      return [
        ...await loader.loadJsonLines({ ...base, title: 'Ofqual register: qualifications (API, all pages)', table: 'SHARED_DB.RAW.OFQUAL_QUALIFICATION',
          originals: files(dir, /^ofqual_qualifications_.*\.jsonl$/).map((file) => ({ file })), rows: lines,
          cols: { LINENUMBER: '$1:n::number', QUALIFICATIONNUMBER: '$1:item:qualificationNumber::string', ITEM: '$1:item' } }),
        // Contact details are out of the file already (fetch-official.js) and are taken out again here, so a file saved before that change never reaches
        // Snowflake with them, and its original stays out of the stage (as GIAS).
        ...await loader.loadJsonLines({ ...base, title: 'Ofqual register: awarding organisations (API, all pages)', table: 'SHARED_DB.RAW.OFQUAL_ORGANISATION',
          kind: 'columns-removed', removed: OFQUAL_PERSONAL_FIELDS, stageOriginal: false,
          originals: files(dir, /^ofqual_organisations_.*\.jsonl$/).map((file) => ({ file })),
          rows: async ({ file }) => (await lines({ file })).map((r) => ({ ...r, item: withoutPersonalFields(r.item) })),
          cols: { LINENUMBER: '$1:n::number', RECOGNITIONNUMBER: '$1:item:recognitionNumber::string', ITEM: '$1:item' } }),
      ]
    } },
    28: { job: 'load-employer-skills', files: () => {
      const ess = path.join(R, 'employer-skills-survey')
      const page = `${EES}employer-skills-survey`
      const e = (re, title, table) => csv(shared, 'employer-skills-survey', one(ess, re), `Employer Skills Survey: ${title}`, DFE, page, `SHARED_DB.RAW.${table}`)
      const se = (repo, re, title, table) => csv(shared, `skills-england-${repo.split('_')[0].replace('ufs-jobs-and-skills-dashboard', 'jobs-skills')}`, one(path.join(R, 'skills-england', fs.readdirSync(path.join(R, 'skills-england')).find((d) => d.startsWith(repo))), re),
        `Skills England ${title}`, 'Skills England (Department for Education)', `https://github.com/dfe-analytical-services/${repo}`, `SHARED_DB.RAW.${table}`, 'MIT (the dashboard repository); figures from the sources it names (Open Government Licence v3.0)')
      const seDir = (repo) => path.join(R, 'skills-england', fs.readdirSync(path.join(R, 'skills-england')).find((d) => d.startsWith(repo)))
      return [
        e(/^core_indicators_.*\.csv$/, 'core indicators', 'ESS_CORE_INDICATORS'),
        e(/^investment_in_training_.*\.csv$/, 'investment in training', 'ESS_INVESTMENT_IN_TRAINING'),
        e(/^vacancy_measures_soc2010_.*\.csv$/, 'vacancy measures by occupation (SOC 2010)', 'ESS_VACANCY_SOC2010'),
        e(/^vacancy_measures_soc2020_.*\.csv$/, 'vacancy measures by occupation (SOC 2020)', 'ESS_VACANCY_SOC2020'),
        e(/^mayoral_authority_core_indicators_22_24_with_filters\.csv$/, 'core indicators by mayoral strategic authority', 'ESS_MAYORAL_CORE_INDICATORS'),
        e(/^twodigitsic_core_indicators_22_24_with_filters\.csv$/, 'core indicators by two-digit SIC', 'ESS_TWO_DIGIT_SIC_CORE_INDICATORS'),
        se('lsip_dashboard', /^C_datahub\.csv$/, 'Local Skills Dashboard: data hub', 'SE_LSIP_DATAHUB'),
        se('lsip_dashboard', /^C_time1\.csv$/, 'Local Skills Dashboard: time series (part 1)', 'SE_LSIP_TIME'),
        se('lsip_dashboard', /^C_time2\.csv$/, 'Local Skills Dashboard: time series (part 2)', 'SE_LSIP_TIME'),
        se('lsip_dashboard', /^C_breakdown\.csv$/, 'Local Skills Dashboard: breakdowns', 'SE_LSIP_BREAKDOWN'),
        se('lsip_dashboard', /^C_topTenEachBreakdown\.csv$/, 'Local Skills Dashboard: top ten in each breakdown', 'SE_LSIP_TOP_TEN'),
        se('ufs-jobs-and-skills-dashboard', /^C_time\.csv$/, 'Jobs and Skills Dashboard: time series', 'SE_JOBS_SKILLS_TIME'),
        se('ufs-jobs-and-skills-dashboard', /^C_table\.csv$/, 'Jobs and Skills Dashboard: occupation table', 'SE_JOBS_SKILLS_TABLE'),
        se('ufs-jobs-and-skills-dashboard', /^C_pathways\.csv$/, 'Jobs and Skills Dashboard: education pathways', 'SE_JOBS_SKILLS_PATHWAYS'),
        se('ufs-jobs-and-skills-dashboard', /^C_sectorLookup\.csv$/, 'Jobs and Skills Dashboard: sector to SOC lookup', 'SE_JOBS_SKILLS_SECTOR_LOOKUP'),
        ...['lsip_dashboard', 'ufs-jobs-and-skills-dashboard'].flatMap((repo) => files(seDir(repo), /^(I_.*|C_axisMinMax|C_DataTable|C_sectorDescriptions)\.csv$/).map((f) =>
          cells(shared, `skills-england-${repo === 'lsip_dashboard' ? 'lsip' : 'jobs-skills'}`, f, null, `Skills England dashboard text table: ${path.basename(f)}`,
            'Skills England (Department for Education)', `https://github.com/dfe-analytical-services/${repo}`, 'MIT (the dashboard repository)'))),
      ]
    } },
    29: { job: 'load-ons-vacancies', files: () => files(path.join(R, 'ons-vacancies'), /^vacs02.*\.xlsx$/).map((f) =>
      cells(shared, 'ons-vacs02', f, null, 'VACS02: vacancies by industry', ONS, 'https://www.ons.gov.uk/employmentandlabourmarket/peoplenotinwork/unemployment/datasets/vacanciesbyindustryvacs02', OGL_ONS)) },
    30: { job: 'load-history', files: async () => {
      const h = path.join(R, 'history')
      const narts = []
      for (const zip of files(path.join(h, 'achievement-rates'), /^201819_.*\.zip$/)) {
        for (const m of (await zipNames(zip)).filter((n) => /\.csv$/i.test(n)).sort()) {
          narts.push(cells(options, 'narts-2018-19', zip, m, `National achievement rates tables 2018 to 2019: ${m}`, 'Education and Skills Funding Agency', `${GOVUK}/government/statistics/national-achievement-rates-tables-2018-to-2019`))
        }
      }
      const ofsted = (dir, source, page) => files(path.join(h, dir), /\.csv$/).map((f) => cells(options, source, f, null, `Ofsted: ${path.basename(f, '.csv').replaceAll('_', ' ')}`, 'Ofsted', page))
      const und = (k, table) => ({ ...shared, source: 'app-underlying-2022-23', publisher: DFE, licence: OGL, page: `${EES}apprenticeships-and-traineeships/2022-23`,
        title: `Apprenticeships and traineeships 2022/23 underlying data: ${k}`, file: path.join(h, 'apprenticeships', `underlying-data-apps-${k}-202223-q4.zip`),
        member: `underlying-data-apps-${k}-202223-q4.csv`, kind: 'extracted', table, make: extract(path.join(h, 'apprenticeships', `underlying-data-apps-${k}-202223-q4.zip`), `underlying-data-apps-${k}-202223-q4.csv`) })
      return [
        csv(options, 'achievement-app', one(path.join(h, 'achievement-rates'), /^apps_narts_provider_level_.*_2024-25\.csv$/), 'Apprenticeship achievement rates by provider (Apprenticeships 2024/25 release: 2021/22 to 2023/24)', DFE, `${EES}apprenticeships/2024-25`, 'OPTIONS_DB.RAW.ACHIEVEMENT_APP_PROVIDER'),
        csv(options, 'achievement-et', one(path.join(h, 'achievement-rates'), /^et_narts_providers_summary_2024-25_.*\.csv$/), 'Education and training achievement rates by provider (Further education and skills 2024/25 release: 2021/22 to 2023/24)', DFE, `${EES}further-education-and-skills/2024-25`, 'OPTIONS_DB.RAW.ACHIEVEMENT_ET_PROVIDER_SUMMARY'),
        ...narts,
        ...ofsted('ofsted-fe', 'ofsted-fe-history', `${GOVUK}/government/collections/further-education-and-skills-statistics`),
        ...ofsted('ofsted-schools', 'ofsted-schools-history', `${GOVUK}/government/collections/maintained-schools-and-academies-inspections-and-outcomes-official-statistics`),
        und('starts', 'SHARED_DB.RAW.APP_UNDERLYING_STARTS_2022_23'),
        und('achievements', 'SHARED_DB.RAW.APP_UNDERLYING_ACHIEVEMENTS_2022_23'),
      ]
    } },
    31: { job: 'load-nesta-skills', runLabel: 'Nesta skills taxonomy (JSON)', run: async (loader) => loader.loadJsonLines({ home: 'SHARED_DB', source: 'nesta-skills-taxonomy', publisher: 'Nesta',
      licence: 'MIT (credit Nesta; nestauk/skills-taxonomy-v2)', page: 'https://github.com/nestauk/skills-taxonomy-v2', title: 'Nesta UK skills taxonomy v2: hierarchy (2022)',
      format: 'SHARED_DB.RAW.JSON_LINES', table: 'SHARED_DB.RAW.NESTA_SKILLS_TAXONOMY', originals: files(path.join(R, 'nesta'), /\.json$/).map((file) => ({ file })),
      rows: async ({ file }) => [{ name: path.basename(file), item: JSON.parse(fs.readFileSync(file, 'utf8')) }], cols: { NAME: '$1:name::string', ITEM: '$1:item' } }) },
  }
}
