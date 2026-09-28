// Endpoints for the "My day" page: everything one officer needs today,
// worked out in Snowflake SQL, plus saving a progress review.

import crypto from 'node:crypto'
import { execute } from './db.js'
import { allow, ASSESSOR, MANAGER, ORG_OFFICER_ASSIGNMENT, TUTOR, VISIBLE_LEARNER, VISIBLE_OFFICER } from './access.js'
import { todayString, validateProgressReviewForm } from '../src/validation.js'
import { QAR_AIMS, DEFAULT_QAR_YEAR } from './reports.js'

// Task thresholds, in days.
const ENDING_SOON_DAYS = 30
export const REVIEW_WINDOW_DAYS = 35 // 5 weeks
const REVIEW_DO_FIRST_DAYS = 7
const NO_EVIDENCE_DAYS = 28
const NO_EVIDENCE_DO_FIRST_DAYS = 42
const EVIDENCE_WAITING_DO_FIRST_DAYS = 5

// This officer's continuing learners, with every date the page needs.
// Binds: :1 today's date, :2 the officer reference.
//
// Progress reviews are due by the last day of the third calendar month
// after the month of the last review, e.g. a review on 1 August is next due
// by 30 November. With no review yet, count from the learning start date.
// "Last evidence" is the most recent Burrow evidence the learner added that
// hasn't been withdrawn; with none, count from the start date.
const MY_CONTINUING_LEARNERS = `
  with mine as (
    select
      ld.LEARNREFNUMBER,
      l.GIVENNAMES,
      l.FAMILYNAME,
      ld.STDCODE,
      s.REFERENCE as STDREFERENCE,
      s.NAME as STDNAME,
      ld.LEARNSTARTDATE,
      ld.LEARNPLANENDDATE
    from ${ORG_OFFICER_ASSIGNMENT} a
    join ${VISIBLE_LEARNER} l
      on l.LEARNREFNUMBER = a.LEARNREFNUMBER
    join LEARNING_DELIVERY ld
      on ld.LEARNREFNUMBER = a.LEARNREFNUMBER
     and ld.LEARNAIMREF = 'ZPROG001'
     and ld.AIMSEQNUMBER = 1
    left join LARS.STANDARD s
      on s.STANDARD_CODE = ld.STDCODE
    where a.OFFICERREFNUMBER = :2
      and a.ENDEDAT is null
      and ld.COMPSTATUS = 1
  ),
  last_review as (
    select LEARNREFNUMBER, max(REVIEWDATE) as LAST_REVIEW_DATE
    from PROGRESS_REVIEW
    group by LEARNREFNUMBER
  ),
  last_evidence as (
    select LEARNREFNUMBER, max(CREATED_AT)::date as LAST_EVIDENCE_DATE
    from BURROW.EVIDENCE
    where STATUS <> 'withdrawn'
    group by LEARNREFNUMBER
  ),
  learners as (
    select
      m.*,
      r.LAST_REVIEW_DATE,
      e.LAST_EVIDENCE_DATE,
      last_day(dateadd(month, 3, coalesce(r.LAST_REVIEW_DATE, m.LEARNSTARTDATE))) as REVIEW_DUE_BY,
      datediff(day, :1::date, REVIEW_DUE_BY) as DAYS_UNTIL_REVIEW_DUE,
      datediff(day, :1::date, m.LEARNPLANENDDATE) as DAYS_UNTIL_PLANNED_END,
      datediff(day, coalesce(e.LAST_EVIDENCE_DATE, m.LEARNSTARTDATE), :1::date) as DAYS_SINCE_EVIDENCE,
      -- Share of the planned time on programme used so far. Below 0 means
      -- not started yet; above 100 means past the planned end date.
      round(100 * datediff(day, m.LEARNSTARTDATE, :1::date)
        / nullif(datediff(day, m.LEARNSTARTDATE, m.LEARNPLANENDDATE), 0)) as PCT_TIME_ON_PROGRAMME
    from mine m
    left join last_review r
      on r.LEARNREFNUMBER = m.LEARNREFNUMBER
    left join last_evidence e
      on e.LEARNREFNUMBER = m.LEARNREFNUMBER
  )
`

export const MY_LEARNERS_QUERY = `
  ${MY_CONTINUING_LEARNERS}
  select *
  from learners
  order by PCT_TIME_ON_PROGRAMME desc, FAMILYNAME, GIVENNAMES
`

// Every task, already sorted into "Do first" or "Coming up". URGENCY orders
// cards within a column: lower is more urgent.
export const MY_TASKS_QUERY = `
  ${MY_CONTINUING_LEARNERS},
  waiting_evidence as (
    select
      ev.EVIDENCE_ID,
      ev.LEARNREFNUMBER,
      ev.TITLE,
      ev.SUBMITTED_AT,
      datediff(day, ev.SUBMITTED_AT::date, :1::date) as DAYS_WAITING
    from BURROW.EVIDENCE ev
    join learners l
      on l.LEARNREFNUMBER = ev.LEARNREFNUMBER
    where ev.STATUS = 'submitted'
  )
  select 'past_end' as TASK, 'do_first' as PRIORITY, LEARNREFNUMBER, null as EVIDENCE_ID,
         null as EVIDENCE_TITLE, null as SUBMITTED_AT, null as DAYS_WAITING, DAYS_UNTIL_PLANNED_END as URGENCY
  from learners
  where DAYS_UNTIL_PLANNED_END < 0
  union all
  select 'ending_soon', 'coming_up', LEARNREFNUMBER, null, null, null, null, DAYS_UNTIL_PLANNED_END
  from learners
  where DAYS_UNTIL_PLANNED_END between 0 and ${ENDING_SOON_DAYS}
  union all
  select 'review_due', iff(DAYS_UNTIL_REVIEW_DUE <= ${REVIEW_DO_FIRST_DAYS}, 'do_first', 'coming_up'),
         LEARNREFNUMBER, null, null, null, null, DAYS_UNTIL_REVIEW_DUE
  from learners
  where DAYS_UNTIL_REVIEW_DUE <= ${REVIEW_WINDOW_DAYS}
  union all
  select 'no_recent_evidence', iff(DAYS_SINCE_EVIDENCE >= ${NO_EVIDENCE_DO_FIRST_DAYS}, 'do_first', 'coming_up'),
         LEARNREFNUMBER, null, null, null, null, -DAYS_SINCE_EVIDENCE
  from learners
  where DAYS_SINCE_EVIDENCE >= ${NO_EVIDENCE_DAYS}
  union all
  -- Oldest first: the longest wait is the most urgent.
  select 'evidence_review', iff(DAYS_WAITING >= ${EVIDENCE_WAITING_DO_FIRST_DAYS}, 'do_first', 'coming_up'),
         LEARNREFNUMBER, EVIDENCE_ID, TITLE, SUBMITTED_AT, DAYS_WAITING, -DAYS_WAITING
  from waiting_evidence
  order by PRIORITY, URGENCY, TASK, LEARNREFNUMBER
`

// Who finishes next among learners not yet past their planned end date,
// for the "Checked and clear" column.
export const NEXT_TO_FINISH_QUERY = `
  ${MY_CONTINUING_LEARNERS}
  select LEARNREFNUMBER, GIVENNAMES, FAMILYNAME, LEARNPLANENDDATE, DAYS_UNTIL_PLANNED_END
  from learners
  where DAYS_UNTIL_PLANNED_END >= 0
  order by LEARNPLANENDDATE, FAMILYNAME
  limit 1
`

// Caseload counts for one officer, by the status of each learner's
// programme aim. count_if gives null over no rows, hence the coalesces.
// Bind: the officer reference.
export const MY_CASELOAD_QUERY = `
  select
    count(a.LEARNREFNUMBER) as TOTAL,
    coalesce(count_if(ld.COMPSTATUS = 1), 0) as CONTINUING,
    coalesce(count_if(ld.COMPSTATUS = 2), 0) as COMPLETED,
    coalesce(count_if(ld.COMPSTATUS = 3), 0) as WITHDRAWN
  from ${ORG_OFFICER_ASSIGNMENT} a
  left join LEARNING_DELIVERY ld
    on ld.LEARNREFNUMBER = a.LEARNREFNUMBER
   and ld.LEARNAIMREF = 'ZPROG001'
   and ld.AIMSEQNUMBER = 1
  where a.OFFICERREFNUMBER = ?
    and a.ENDEDAT is null
`

// The QAR report's method (reports.js), limited to this officer's learners.
// Binds: :1 today, :2 the academic year, :3 the officer reference.
export const MY_QAR_QUERY = `
  ${QAR_AIMS}
  select
    coalesce(count_if(IS_LEAVER), 0) as LEAVERS,
    coalesce(count_if(IS_COMPLETER), 0) as COMPLETERS,
    coalesce(count_if(IS_ACHIEVER), 0) as ACHIEVERS,
    round(100 * count_if(IS_ACHIEVER) / nullif(count_if(IS_LEAVER), 0), 1) as ACHIEVEMENT_RATE,
    round(100 * count_if(IS_COMPLETER) / nullif(count_if(IS_LEAVER), 0), 1) as RETENTION_RATE
  from classified
  where IN_COHORT
    and LEARNREFNUMBER in (select LEARNREFNUMBER from ${ORG_OFFICER_ASSIGNMENT} where OFFICERREFNUMBER = :3 and ENDEDAT is null)
`

// A tutor or assessor finds only themselves here, so they can open only
// their own My day and record reviews only as themselves. Managers find
// any officer in the organisation.
const OFFICER_QUERY = `
  select OFFICERREFNUMBER, OFFICERNAME, OFFICERTYPE
  from ${VISIBLE_OFFICER}
  where OFFICERREFNUMBER = ?
`

const LEARNER_START_QUERY = `
  select l.LEARNREFNUMBER, ld.LEARNSTARTDATE
  from ${VISIBLE_LEARNER} l
  left join LEARNING_DELIVERY ld
    on ld.LEARNREFNUMBER = l.LEARNREFNUMBER
   and ld.LEARNAIMREF = 'ZPROG001'
   and ld.AIMSEQNUMBER = 1
  where l.LEARNREFNUMBER = ?
`

// CREATEDBY is the signed-in user's USERID: usually the officer who held
// the review, but a manager can record one for another officer.
const INSERT_PROGRESS_REVIEW = `
  insert into PROGRESS_REVIEW (REVIEWID, LEARNREFNUMBER, OFFICERREFNUMBER, REVIEWDATE, EMPLOYERATTENDED, SUMMARY, CREATEDBY)
  values (?, ?, ?, ?, ?, ?, ?)
`

function toIsoDateString(value) {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

export function registerMyDayRoutes(app) {
  app.get('/api/myday/:officerRefNumber', allow(MANAGER, TUTOR, ASSESSOR), async (req, res) => {
    const { officerRefNumber } = req.params
    const connection = req.db
    try {
      const [officer] = await execute(connection, OFFICER_QUERY, [officerRefNumber])
      if (!officer) {
        res.status(404).json({ error: 'Officer not found.' })
        return
      }

      const today = todayString()
      const [learners, tasks, [nextToFinish], [caseload], [qar]] = await Promise.all([
        execute(connection, MY_LEARNERS_QUERY, [today, officerRefNumber]),
        execute(connection, MY_TASKS_QUERY, [today, officerRefNumber]),
        execute(connection, NEXT_TO_FINISH_QUERY, [today, officerRefNumber]),
        execute(connection, MY_CASELOAD_QUERY, [officerRefNumber]),
        execute(connection, MY_QAR_QUERY, [today, DEFAULT_QAR_YEAR, officerRefNumber]),
      ])

      res.json({
        today,
        officer,
        caseload,
        qar: { ...qar, YEAR: DEFAULT_QAR_YEAR },
        learners,
        tasks,
        nextToFinish: nextToFinish ?? null,
      })
    } catch (err) {
      console.error('Failed to load My day:', err.message)
      res.status(500).json({ error: 'Failed to load My day' })
    }
  })

  // Reviews can be added (and, later, corrected) but never deleted - the
  // app's role has no DELETE on PROGRESS_REVIEW.
  app.post('/api/learners/:learnRefNumber/progress-reviews', allow(MANAGER, TUTOR, ASSESSOR), async (req, res) => {
    const { learnRefNumber } = req.params
    const fieldErrors = validateProgressReviewForm(req.body)
    const v = req.body ?? {}
    if (!v.officerRefNumber) {
      res.status(400).json({ error: 'officerRefNumber is required.' })
      return
    }

    const connection = req.db
    try {

      // Snowflake doesn't enforce the learner and officer keys, so check here.
      const [learner] = await execute(connection, LEARNER_START_QUERY, [learnRefNumber])
      if (!learner) {
        res.status(404).json({ error: 'Learner not found.' })
        return
      }
      const [officer] = await execute(connection, OFFICER_QUERY, [v.officerRefNumber])
      if (!officer) {
        res.status(404).json({ error: 'Officer not found.' })
        return
      }

      const startDate = toIsoDateString(learner.LEARNSTARTDATE)
      if (!fieldErrors.reviewDate && startDate && v.reviewDate < startDate) {
        fieldErrors.reviewDate = 'Review date cannot be before the learner started.'
      }
      if (Object.keys(fieldErrors).length > 0) {
        res.status(400).json({ error: 'Please fix the highlighted fields.', fields: fieldErrors })
        return
      }

      const reviewId = crypto.randomUUID()
      await execute(connection, INSERT_PROGRESS_REVIEW, [
        reviewId,
        learnRefNumber,
        v.officerRefNumber,
        v.reviewDate,
        v.employerAttended,
        String(v.summary).trim(),
        req.user.USERID,
      ])
      res.status(201).json({ reviewId })
    } catch (err) {
      console.error('Failed to save progress review:', err.message)
      res.status(500).json({ error: 'Could not save this review. Please try again.' })
    }
  })
}
