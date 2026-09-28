// The QAR download: one workbook with the figures on the Reports page and
// every aim behind them, so the sums can be checked in a spreadsheet.
//
//   Summary          the headline figures by standard, as on the page, plus
//                    check columns that recount them from the Learners sheet
//                    with formulas
//   Learners         every apprenticeship programme aim, with 1/0 columns for
//                    leaver, completer, achiever and in cohort
//   Past planned end the data quality list: aims past their planned end
//                    date with no outcome

import ExcelJS from 'exceljs'
import { COMPLETION_STATUS_LABELS, describe } from '../src/lookups.js'

const DATE_FORMAT = 'dd/mm/yyyy'
const yearLabel = (year) => (year === null || year === undefined ? null : `${year} to ${year + 1}`)
const flag = (value) => (value ? 1 : 0)
const num = (value) => (value === null || value === undefined ? null : Number(value))
const standardKey = (row) =>
  row.STDREFERENCE ?? (row.STDCODE === null || row.STDCODE === undefined ? 'No standard code' : `Code ${row.STDCODE}`)

// Snowflake DATE columns arrive as 'YYYY-MM-DD'. Excel wants a Date; UTC
// midnight keeps the day the same whatever the server's time zone.
function toDate(value) {
  if (!value) return null
  const text = typeof value === 'string' ? value.slice(0, 10) : new Date(value).toISOString().slice(0, 10)
  return new Date(`${text}T00:00:00Z`)
}

function columnLetter(index) {
  let n = index + 1
  let letters = ''
  while (n > 0) {
    const r = (n - 1) % 26
    letters = String.fromCharCode(65 + r) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

// A sheet with a bold, frozen header row and a filter on every column.
function addTable(workbook, name, columns, rows) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] })
  sheet.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 14 }))
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).alignment = { vertical: 'top', wrapText: true }
  for (const row of rows) sheet.addRow(Object.fromEntries(columns.map((c) => [c.key, c.value(row)])))
  columns.forEach((c, i) => {
    if (c.date) sheet.getColumn(i + 1).numFmt = DATE_FORMAT
  })
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }
  return sheet
}

const LEARNER_COLUMNS = [
  { key: 'ref', header: 'Learner ref', value: (r) => r.LEARNREFNUMBER, width: 12 },
  { key: 'given', header: 'Given names', value: (r) => r.GIVENNAMES },
  { key: 'family', header: 'Family name', value: (r) => r.FAMILYNAME },
  { key: 'standard', header: 'Standard', value: standardKey, width: 10 },
  { key: 'standardName', header: 'Standard name', value: (r) => r.STDNAME, width: 30 },
  { key: 'start', header: 'Start date', value: (r) => toDate(r.LEARNSTARTDATE), date: true, width: 12 },
  { key: 'plan', header: 'Planned end date', value: (r) => toDate(r.LEARNPLANENDDATE), date: true, width: 12 },
  { key: 'act', header: 'Actual end date', value: (r) => toDate(r.LEARNACTENDDATE), date: true, width: 12 },
  { key: 'ach', header: 'Achievement date', value: (r) => toDate(r.ACHDATE), date: true, width: 12 },
  { key: 'comp', header: 'Completion status', value: (r) => r.COMPSTATUS, width: 11 },
  { key: 'compLabel', header: 'Completion status meaning', value: (r) => describe(COMPLETION_STATUS_LABELS, r.COMPSTATUS) },
  { key: 'outcome', header: 'Outcome', value: (r) => r.OUTCOME, width: 9 },
  { key: 'withdraw', header: 'Withdrawal reason', value: (r) => r.WITHDRAWREASON, width: 11 },
  { key: 'plannedDays', header: 'Planned days', value: (r) => r.PLANNED_DAYS, width: 9 },
  { key: 'actualDays', header: 'Actual days', value: (r) => r.ACTUAL_DAYS, width: 9 },
  { key: 'planYear', header: 'Planned end year', value: (r) => yearLabel(r.PLANNED_END_YEAR) },
  { key: 'actYear', header: 'Actual end year', value: (r) => yearLabel(r.ACTUAL_END_YEAR) },
  { key: 'achYear', header: 'Achievement year', value: (r) => yearLabel(r.ACHIEVEMENT_YEAR) },
  { key: 'hybridYear', header: 'Hybrid end year', value: (r) => yearLabel(r.HYBRID_END_YEAR) },
  { key: 'leaver', header: 'Leaver (1/0)', value: (r) => flag(r.IS_LEAVER), width: 9 },
  { key: 'completer', header: 'Completer (1/0)', value: (r) => flag(r.IS_COMPLETER), width: 10 },
  { key: 'achiever', header: 'Achiever (1/0)', value: (r) => flag(r.IS_ACHIEVER), width: 9 },
  { key: 'excluded', header: 'Excluded because', value: (r) => r.EXCLUSION, width: 30 },
  { key: 'past', header: 'Past planned end, no outcome (1/0)', value: (r) => flag(r.IS_PAST_PLANNED_END), width: 12 },
  { key: 'inCohort', header: 'In cohort (1/0)', value: (r) => flag(r.IN_COHORT), width: 9 },
  { key: 'countedAs', header: 'Counted as', value: (r) => r.COUNTED_AS, width: 60 },
]

const PAST_PLANNED_END_COLUMNS = [
  { key: 'ref', header: 'Learner ref', value: (r) => r.LEARNREFNUMBER, width: 12 },
  { key: 'given', header: 'Given names', value: (r) => r.GIVENNAMES },
  { key: 'family', header: 'Family name', value: (r) => r.FAMILYNAME },
  { key: 'standard', header: 'Standard', value: standardKey, width: 10 },
  { key: 'standardName', header: 'Standard name', value: (r) => r.STDNAME, width: 30 },
  { key: 'status', header: 'Status', value: (r) => (r.COMPSTATUS === 6 ? 'On a break in learning' : 'Continuing'), width: 20 },
  { key: 'start', header: 'Start date', value: (r) => toDate(r.LEARNSTARTDATE), date: true, width: 12 },
  { key: 'plan', header: 'Planned end date', value: (r) => toDate(r.LEARNPLANENDDATE), date: true, width: 12 },
  { key: 'breakFrom', header: 'Break started', value: (r) => (r.COMPSTATUS === 6 ? toDate(r.LEARNACTENDDATE) : null), date: true, width: 12 },
  { key: 'days', header: 'Days past planned end', value: (r) => r.DAYS_PAST, width: 10 },
  { key: 'planYear', header: 'Planned end year', value: (r) => yearLabel(r.PLANNED_END_YEAR) },
  { key: 'tutor', header: 'Tutor', value: (r) => r.TUTORNAME, width: 22 },
]

function addSummary(workbook, qar, user) {
  const sheet = workbook.addWorksheet('Summary')
  sheet.columns = [
    { width: 16 }, { width: 36 }, { width: 10 }, { width: 11 }, { width: 10 },
    { width: 12 }, { width: 12 }, { width: 10 }, { width: 3 }, { width: 10 }, { width: 11 }, { width: 10 },
  ]
  const title = sheet.addRow([`QAR ${yearLabel(qar.year)} (indicative)`])
  title.font = { bold: true, size: 14 }
  sheet.addRow(['Organisation', user.ORGANISATIONNAME ?? user.ORGANISATIONID])
  sheet.addRow(['Downloaded by', user.DISPLAYNAME])
  sheet.addRow(['Worked out on', toDate(qar.today)]).getCell(2).numFmt = DATE_FORMAT
  sheet.addRow([
    "Calculated from Warren's data using the DfE QAR method (Qualification achievement rates 2025 to 2026). Not the official published QAR.",
  ])
  sheet.addRow([])

  const learnerCol = Object.fromEntries(LEARNER_COLUMNS.map((c, i) => [c.key, columnLetter(i)]))
  const range = (key) => `Learners!$${learnerCol[key]}:$${learnerCol[key]}`
  const inCohort = `${range('inCohort')},1`

  const header = sheet.addRow([
    'Standard', 'Standard name', 'Leavers', 'Completers', 'Achievers',
    'Achievement rate (%)', 'Retention rate (%)', 'Pass rate (%)', '',
    'Check: leavers', 'Check: completers', 'Check: achievers',
  ])
  header.font = { bold: true }
  header.alignment = { vertical: 'top', wrapText: true }

  const figures = (r) => [r.LEAVERS, r.COMPLETERS, r.ACHIEVERS, r.ACHIEVEMENT_RATE, r.RETENTION_RATE, r.PASS_RATE].map(num)
  const check = (rowNumber, key, result, byStandard) => ({
    formula: byStandard
      ? `SUMIFS(${range(key)},${inCohort},${range('standard')},$A${rowNumber})`
      : `SUMIFS(${range(key)},${inCohort})`,
    result,
  })
  for (const r of qar.byStandard) {
    const row = sheet.addRow([standardKey(r), r.STDNAME, ...figures(r), ''])
    row.getCell(10).value = check(row.number, 'leaver', r.LEAVERS, true)
    row.getCell(11).value = check(row.number, 'completer', r.COMPLETERS, true)
    row.getCell(12).value = check(row.number, 'achiever', r.ACHIEVERS, true)
  }
  const total = sheet.addRow(['All standards', '', ...figures(qar.total), ''])
  total.font = { bold: true }
  total.getCell(10).value = check(total.number, 'leaver', qar.total.LEAVERS, false)
  total.getCell(11).value = check(total.number, 'completer', qar.total.COMPLETERS, false)
  total.getCell(12).value = check(total.number, 'achiever', qar.total.ACHIEVERS, false)

  sheet.addRow([])
  const notes = [
    'How to check: on the Learners sheet, filter "In cohort (1/0)" to 1. Adding up "Leaver", "Completer" and "Achiever" for each standard gives the figures above. The check columns do this with SUMIFS.',
    'Achievement rate = achievers ÷ leavers. Retention rate = completers ÷ leavers. Pass rate = achievers ÷ completers. Rounded to 1 decimal place.',
    "An aim is in the cohort when its hybrid end year (the latest of its planned end, actual end and achievement years) is this year, it has ended (completed or withdrawn), and it isn't excluded.",
    qar.pastPlannedEnd.length === 0
      ? 'Past planned end: no learners are past their planned end date with no outcome.'
      : `Past planned end: ${qar.pastPlannedEnd.length === 1 ? '1 learner is' : `${qar.pastPlannedEnd.length} learners are`} past their planned end date with no outcome. They aren't leavers until they're completed or withdrawn. See the "Past planned end" sheet.`,
  ]
  for (const note of notes) {
    const row = sheet.addRow([note])
    sheet.mergeCells(row.number, 1, row.number, 12)
    row.alignment = { wrapText: true, vertical: 'top' }
    row.height = 30
  }
}

export function buildQarWorkbook(qar, user) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Warren'
  workbook.created = new Date()
  // Excel and LibreOffice work out the check columns again when the file
  // opens, so they always reflect the Learners sheet as it is.
  workbook.calcProperties.fullCalcOnLoad = true
  addSummary(workbook, qar, user)
  addTable(workbook, 'Learners', LEARNER_COLUMNS, qar.learners)
  addTable(workbook, 'Past planned end', PAST_PLANNED_END_COLUMNS, qar.pastPlannedEnd)
  return workbook
}
