// Report endpoints for the Reports tab. Every figure is worked out here in
// Snowflake SQL; the browser only displays what comes back.

import { connect, execute, destroy } from './db.js'
import { todayString } from '../src/validation.js'

// ---------------------------------------------------------------- QAR (indicative)
//
// Follows the DfE method in "Qualification achievement rates 2025 to 2026"
// (https://www.gov.uk/government/publications/qualification-achievement-rates-2025-to-2026),
// as far as Warren's data allows - see the notes on the Reports page.
//
// Academic years run 1 August to 31 July and are numbered by the calendar
// year they start in, so 2025 means 2025 to 2026, as in the DfE guidance.
// Moving a date back 7 months turns August into January of the same year,
// so the year of the shifted date is the academic year.
const academicYear = (column) => `year(dateadd(month, -7, ${column}))`

// DfE's apprenticeship programme aims: aim type 1 with an apprenticeship
// programme type.
const APPRENTICESHIP_PROGRAMME_TYPES = '2, 3, 10, 20, 21, 22, 23, 25'

// One row per apprenticeship programme aim, classified for the chosen year.
// Binds: :1 today's date, :2 the academic year (e.g. 2025).
export const QAR_AIMS = `
  with aims as (
    select
      ld.LEARNREFNUMBER,
      l.GIVENNAMES,
      l.FAMILYNAME,
      ld.STDCODE,
      s.REFERENCE as STDREFERENCE,
      s.NAME as STDNAME,
      ld.LEARNSTARTDATE,
      ld.LEARNPLANENDDATE,
      ld.LEARNACTENDDATE,
      ld.ACHDATE,
      ld.COMPSTATUS,
      ld.OUTCOME,
      ld.WITHDRAWREASON,
      ${academicYear('ld.LEARNPLANENDDATE')} as PLANNED_END_YEAR,
      ${academicYear('ld.LEARNACTENDDATE')} as ACTUAL_END_YEAR,
      ${academicYear('ld.ACHDATE')} as ACHIEVEMENT_YEAR,
      datediff(day, ld.LEARNSTARTDATE, ld.LEARNPLANENDDATE) as PLANNED_DAYS,
      datediff(day, ld.LEARNSTARTDATE, ld.LEARNACTENDDATE) as ACTUAL_DAYS,
      -- An overdue continuing aim: still continuing, but past its planned end date.
      coalesce(ld.COMPSTATUS = 1 and ld.LEARNPLANENDDATE < :1::date, false) as IS_OVERDUE
    from LEARNING_DELIVERY ld
    join LEARNER l
      on l.LEARNREFNUMBER = ld.LEARNREFNUMBER
    left join LARS.STANDARD s
      on s.STANDARD_CODE = ld.STDCODE
    where ld.AIMTYPE = 1
      and ld.PROGTYPE in (${APPRENTICESHIP_PROGRAMME_TYPES})
  ),
  flagged as (
    select
      *,
      -- Hybrid end year: the latest of the achievement, actual end and
      -- planned end years.
      greatest(coalesce(ACHIEVEMENT_YEAR, 0), coalesce(ACTUAL_END_YEAR, 0), PLANNED_END_YEAR) as HYBRID_END_YEAR,
      coalesce(COMPSTATUS in (2, 3), false) or IS_OVERDUE as IS_LEAVER,
      coalesce(COMPSTATUS = 2, false) as IS_COMPLETER,
      coalesce(OUTCOME = 1, false) as IS_ACHIEVER,
      -- DfE apprenticeship exclusions that Warren's data can show.
      case
        when COMPSTATUS = 3 and coalesce(OUTCOME, 0) <> 1
          and ((PLANNED_DAYS >= 168 and ACTUAL_DAYS < 42) or (PLANNED_DAYS between 14 and 167 and ACTUAL_DAYS < 14))
          then 'withdrew within the qualifying period'
        when COMPSTATUS = 6
          then 'on a break in learning'
        when WITHDRAWREASON = 7
          then 'transferred to a new provider by DfE intervention'
      end as EXCLUSION
    from aims
  ),
  classified as (
    select
      *,
      HYBRID_END_YEAR = :2 and IS_LEAVER and EXCLUSION is null as IN_COHORT,
      case
        when HYBRID_END_YEAR <> :2
          then 'Not in this year: hybrid end year is ' || HYBRID_END_YEAR || ' to ' || (HYBRID_END_YEAR + 1)
        when EXCLUSION is not null
          then 'Excluded: ' || EXCLUSION
        when not IS_LEAVER
          then 'Not counted yet: still continuing, planned end date not passed'
        when IS_COMPLETER and IS_ACHIEVER
          then 'Leaver, completer and achiever'
        when IS_COMPLETER
          then 'Leaver and completer, not achieved'
        when IS_ACHIEVER
          then 'Leaver and achiever, but not recorded as completed'
        when IS_OVERDUE
          then 'Leaver: still continuing past planned end date (overdue)'
        else 'Leaver: withdrawn'
      end as COUNTED_AS
    from flagged
  )
`

// The headline figures overall (IS_TOTAL) and for each standard, for aims
// in the cohort. Rates are percentages to 1 decimal place, or null when
// there's nothing to divide by. An empty cohort returns no rows at all.
export const QAR_SUMMARY_QUERY = `
  ${QAR_AIMS}
  select
    grouping(STDCODE) = 1 as IS_TOTAL,
    STDCODE,
    STDREFERENCE,
    STDNAME,
    count_if(IS_LEAVER) as LEAVERS,
    count_if(IS_COMPLETER) as COMPLETERS,
    count_if(IS_ACHIEVER) as ACHIEVERS,
    round(100 * count_if(IS_ACHIEVER) / nullif(count_if(IS_LEAVER), 0), 1) as ACHIEVEMENT_RATE,
    round(100 * count_if(IS_COMPLETER) / nullif(count_if(IS_LEAVER), 0), 1) as RETENTION_RATE,
    round(100 * count_if(IS_ACHIEVER) / nullif(count_if(IS_COMPLETER), 0), 1) as PASS_RATE
  from classified
  where IN_COHORT
  group by grouping sets ((STDCODE, STDREFERENCE, STDNAME), ())
  order by IS_TOTAL desc, STDREFERENCE, STDCODE
`

// Every apprenticeship programme aim with how it was treated, so each
// number on the page can be checked. Cohort aims first.
export const QAR_LEARNERS_QUERY = `
  ${QAR_AIMS}
  select
    LEARNREFNUMBER, GIVENNAMES, FAMILYNAME, STDCODE, STDREFERENCE, STDNAME,
    LEARNSTARTDATE, LEARNPLANENDDATE, LEARNACTENDDATE, ACHDATE, COMPSTATUS, OUTCOME,
    PLANNED_END_YEAR, ACTUAL_END_YEAR, ACHIEVEMENT_YEAR, HYBRID_END_YEAR,
    IS_LEAVER, IS_COMPLETER, IS_ACHIEVER, IN_COHORT, COUNTED_AS
  from classified
  order by IN_COHORT desc, HYBRID_END_YEAR, LEARNREFNUMBER
`

// Academic years worth offering in the year picker: every hybrid end year
// in the data. The page adds the default year if it's missing.
export const QAR_YEARS_QUERY = `
  ${QAR_AIMS}
  select distinct HYBRID_END_YEAR as YEAR
  from classified
  order by YEAR
`

export const DEFAULT_QAR_YEAR = 2025

// ---------------------------------------------------------------- Caseload

// One row per officer. A learner's status comes from their programme aim
// (ZPROG001, sequence 1), as elsewhere in the app. Overdue is a subset of
// continuing: still continuing, but past the planned end date.
export const CASELOAD_QUERY = `
  select
    o.OFFICERREFNUMBER,
    o.OFFICERNAME,
    o.OFFICERTYPE,
    count(a.LEARNREFNUMBER) as TOTAL,
    count_if(ld.COMPSTATUS = 1) as CONTINUING,
    count_if(ld.COMPSTATUS = 2) as COMPLETED,
    count_if(ld.COMPSTATUS = 3) as WITHDRAWN,
    count_if(ld.COMPSTATUS = 1 and ld.LEARNPLANENDDATE < ?::date) as OVERDUE
  from OFFICER o
  left join OFFICER_ASSIGNMENT a
    on a.OFFICERREFNUMBER = o.OFFICERREFNUMBER
   and a.ENDEDAT is null
  left join LEARNING_DELIVERY ld
    on ld.LEARNREFNUMBER = a.LEARNREFNUMBER
   and ld.LEARNAIMREF = 'ZPROG001'
   and ld.AIMSEQNUMBER = 1
  group by o.OFFICERREFNUMBER, o.OFFICERNAME, o.OFFICERTYPE
  order by o.OFFICERNAME
`

export const CASELOAD_LEARNERS_QUERY = `
  select
    l.LEARNREFNUMBER,
    l.GIVENNAMES,
    l.FAMILYNAME,
    ld.STDCODE,
    s.REFERENCE as STDREFERENCE,
    s.NAME as STDNAME,
    s.NOTIONAL_END_LEVEL as STDLEVEL,
    ld.LEARNSTARTDATE,
    ld.LEARNPLANENDDATE,
    ld.COMPSTATUS,
    coalesce(ld.COMPSTATUS = 1 and ld.LEARNPLANENDDATE < ?::date, false) as IS_OVERDUE
  from OFFICER_ASSIGNMENT a
  join LEARNER l
    on l.LEARNREFNUMBER = a.LEARNREFNUMBER
  left join LEARNING_DELIVERY ld
    on ld.LEARNREFNUMBER = a.LEARNREFNUMBER
   and ld.LEARNAIMREF = 'ZPROG001'
   and ld.AIMSEQNUMBER = 1
  left join LARS.STANDARD s
    on s.STANDARD_CODE = ld.STDCODE
  where a.OFFICERREFNUMBER = ?
    and a.ENDEDAT is null
  order by l.FAMILYNAME, l.GIVENNAMES, l.LEARNREFNUMBER
`

// ---------------------------------------------------------------- routes

export function registerReportRoutes(app) {
  app.get('/api/reports/qar', async (req, res) => {
    const year = req.query.year === undefined ? DEFAULT_QAR_YEAR : Number(req.query.year)
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      res.status(400).json({ error: 'year must be the starting year of an academic year, e.g. 2025.' })
      return
    }

    let connection
    try {
      connection = await connect()
      const binds = [todayString(), year]
      const summary = await execute(connection, QAR_SUMMARY_QUERY, binds)
      const learners = await execute(connection, QAR_LEARNERS_QUERY, binds)
      const years = await execute(connection, QAR_YEARS_QUERY, binds)
      const emptyTotal = {
        IS_TOTAL: true, LEAVERS: 0, COMPLETERS: 0, ACHIEVERS: 0,
        ACHIEVEMENT_RATE: null, RETENTION_RATE: null, PASS_RATE: null,
      }
      res.json({
        year,
        total: summary.find((r) => r.IS_TOTAL) ?? emptyTotal,
        byStandard: summary.filter((r) => !r.IS_TOTAL),
        learners,
        years: years.map((r) => r.YEAR),
      })
    } catch (err) {
      console.error('Failed to run QAR report:', err.message)
      res.status(500).json({ error: 'Failed to run the QAR report' })
    } finally {
      if (connection) await destroy(connection)
    }
  })

  app.get('/api/reports/caseload', async (_req, res) => {
    let connection
    try {
      connection = await connect()
      const rows = await execute(connection, CASELOAD_QUERY, [todayString()])
      res.json(rows)
    } catch (err) {
      console.error('Failed to run caseload report:', err.message)
      res.status(500).json({ error: 'Failed to run the caseload report' })
    } finally {
      if (connection) await destroy(connection)
    }
  })

  app.get('/api/reports/caseload/:officerRefNumber/learners', async (req, res) => {
    let connection
    try {
      connection = await connect()
      const rows = await execute(connection, CASELOAD_LEARNERS_QUERY, [todayString(), req.params.officerRefNumber])
      res.json(rows)
    } catch (err) {
      console.error('Failed to fetch caseload learners:', err.message)
      res.status(500).json({ error: "Failed to fetch this officer's learners" })
    } finally {
      if (connection) await destroy(connection)
    }
  })
}
