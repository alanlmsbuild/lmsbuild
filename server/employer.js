// Burrow's employer endpoints: an employer contact sees their current
// apprentices' progress, and the witness statements waiting for them to
// confirm. Nothing else from the portfolio: no other evidence, reflections
// or files.
//
// "Their apprentices" is EMPLOYER_APPRENTICE in access.js: current
// apprentices of the user's own employer, by EMPLOYERID only. A statement is
// waiting for them while it's submitted (with the assessor) and their
// employer hasn't answered this submission yet. If the learner changes it
// and sends it again, it's waiting again. Answers are add-only (the app's
// role has no UPDATE or DELETE on WITNESS_CONFIRMATION).

import crypto from 'node:crypto'
import { execute } from './db.js'
import { allow, EMPLOYER, EMPLOYER_APPRENTICE } from './access.js'
import { RequestError, sendError, sendStageFile } from './burrow.js'
import { REVIEW_WINDOW_DAYS } from './myday.js'
import { todayString, validateWitnessConfirmationForm } from '../src/validation.js'

// Each apprentice's progress. Binds: :1 today's date.
//
// KSBs signed off counts as the portfolio does (KSB_STATUS_QUERY in
// burrow.js): confirmed by an assessor on signed-off evidence, still
// claimed, and on the learner's standard. The next review is due by the
// last day of the third month after the last one, as on My day.
const APPRENTICES_QUERY = `
  with apprentices as (
    select
      l.LEARNREFNUMBER,
      l.GIVENNAMES,
      l.FAMILYNAME,
      s.REFERENCE as STDREFERENCE,
      s.NAME as STDNAME,
      ld.LEARNSTARTDATE,
      ld.LEARNPLANENDDATE,
      ld.COMPSTATUS,
      ld.OUTCOME
    from ${EMPLOYER_APPRENTICE} l
    left join LEARNING_DELIVERY ld
      on ld.LEARNREFNUMBER = l.LEARNREFNUMBER
     and ld.LEARNAIMREF = 'ZPROG001'
     and ld.AIMSEQNUMBER = 1
     and ld.REMOVEDAT is null
    left join LARS.STANDARD s
      on s.STANDARD_CODE = ld.STDCODE
  ),
  occupation as (
    select ST_REFERENCE, OCCUPATION_CODE
    from SKILLS.OCCUPATION
    qualify row_number() over (partition by ST_REFERENCE order by FETCHED_AT desc) = 1
  ),
  standard_ksbs as (
    select o.ST_REFERENCE, k.KSB_TYPE, k.KSB_REFERENCE
    from SKILLS.KSB k
    join occupation o
      on o.OCCUPATION_CODE = k.OCCUPATION_CODE
  ),
  signed_off as (
    select distinct e.LEARNREFNUMBER, ek.KSB_TYPE, ek.KSB_REFERENCE
    from BURROW.EVIDENCE e
    join apprentices a
      on a.LEARNREFNUMBER = e.LEARNREFNUMBER
     and a.STDREFERENCE = e.ST_REFERENCE
    join BURROW.EVIDENCE_KSB ek
      on ek.EVIDENCE_ID = e.EVIDENCE_ID
    join standard_ksbs k
      on k.ST_REFERENCE = e.ST_REFERENCE
     and k.KSB_TYPE = ek.KSB_TYPE
     and k.KSB_REFERENCE = ek.KSB_REFERENCE
    where e.STATUS = 'signed_off'
      and ek.DECISION = 'confirmed'
      and ek.UNCLAIMED_AT is null
  ),
  last_review as (
    select LEARNREFNUMBER, max(REVIEWDATE) as LAST_REVIEW_DATE
    from PROGRESS_REVIEW
    where LEARNREFNUMBER in (select LEARNREFNUMBER from apprentices)
    group by LEARNREFNUMBER
  )
  select
    a.*,
    (select count(*) from standard_ksbs k where k.ST_REFERENCE = a.STDREFERENCE) as KSBS_TOTAL,
    (select count(*) from signed_off so where so.LEARNREFNUMBER = a.LEARNREFNUMBER) as KSBS_SIGNED_OFF,
    r.LAST_REVIEW_DATE,
    last_day(dateadd(month, 3, coalesce(r.LAST_REVIEW_DATE, a.LEARNSTARTDATE))) as REVIEW_DUE_BY,
    datediff(day, :1::date, REVIEW_DUE_BY) as DAYS_UNTIL_REVIEW_DUE,
    round(100 * datediff(day, a.LEARNSTARTDATE, :1::date)
      / nullif(datediff(day, a.LEARNSTARTDATE, a.LEARNPLANENDDATE), 0)) as PCT_TIME_ON_PROGRAMME
  from apprentices a
  left join last_review r
    on r.LEARNREFNUMBER = a.LEARNREFNUMBER
  order by a.FAMILYNAME, a.GIVENNAMES, a.LEARNREFNUMBER
`

// Witness statements waiting for this employer's answer.
const WAITING_STATEMENTS = `
  waiting as (
    select e.*, l.GIVENNAMES, l.FAMILYNAME
    from BURROW.EVIDENCE e
    join ${EMPLOYER_APPRENTICE} l
      on l.LEARNREFNUMBER = e.LEARNREFNUMBER
    where e.EVIDENCE_TYPE = 'witness_statement'
      and e.STATUS = 'submitted'
      and not exists (
        select 1 from BURROW.WITNESS_CONFIRMATION c
        where c.EVIDENCE_ID = e.EVIDENCE_ID
          and c.SUBMISSION_NUMBER = e.SUBMISSION_COUNT
          and c.EMPLOYERID = $APPRENTICES_OF_EMPLOYERID)
  )
`

const STATEMENTS_QUERY = `
  with ${WAITING_STATEMENTS}
  select EVIDENCE_ID, LEARNREFNUMBER, GIVENNAMES, FAMILYNAME, TITLE, OCCURRED_ON, REFLECTION, SUBMITTED_AT
  from waiting
  order by SUBMITTED_AT
`

// The KSBs each waiting statement claims, with their wording at the time.
const STATEMENT_KSBS_QUERY = `
  with ${WAITING_STATEMENTS}
  select ek.EVIDENCE_ID, ek.KSB_REFERENCE, ek.KSB_TEXT
  from BURROW.EVIDENCE_KSB ek
  join waiting w
    on w.EVIDENCE_ID = ek.EVIDENCE_ID
  where ek.UNCLAIMED_AT is null
  order by ek.EVIDENCE_ID, decode(ek.KSB_TYPE, 'K', 1, 'S', 2, 3), ek.KSB_REFERENCE
`

const STATEMENT_FILES_QUERY = `
  with ${WAITING_STATEMENTS}
  select f.EVIDENCE_ID, f.FILE_ID, f.ORIGINAL_FILENAME, f.CONTENT_TYPE, f.SIZE_BYTES
  from BURROW.EVIDENCE_FILE f
  join waiting w
    on w.EVIDENCE_ID = f.EVIDENCE_ID
  where f.REMOVED_AT is null
  order by f.EVIDENCE_ID, f.UPLOADED_AT
`

// Only a file on a statement that's waiting for this employer.
const STATEMENT_FILE_QUERY = `
  with ${WAITING_STATEMENTS}
  select f.STAGE_PATH, f.ORIGINAL_FILENAME, f.CONTENT_TYPE
  from BURROW.EVIDENCE_FILE f
  join waiting w
    on w.EVIDENCE_ID = f.EVIDENCE_ID
  where f.EVIDENCE_ID = ? and f.FILE_ID = ? and f.REMOVED_AT is null
`

// Inserts only while the statement is still waiting for this employer, so
// the same submission can't be answered twice.
const INSERT_CONFIRMATION = `
  insert into BURROW.WITNESS_CONFIRMATION
    (CONFIRMATION_ID, EVIDENCE_ID, SUBMISSION_NUMBER, EMPLOYERID, CONFIRMED_BY, CONFIRMER_NAME, OUTCOME, COMMENT_TEXT)
  with ${WAITING_STATEMENTS}
  select ?, EVIDENCE_ID, SUBMISSION_COUNT, $APPRENTICES_OF_EMPLOYERID, ?, ?, ?, ?
  from waiting
  where EVIDENCE_ID = ?
`

function groupBy(rows, key) {
  const groups = new Map()
  for (const row of rows) {
    if (!groups.has(row[key])) groups.set(row[key], [])
    groups.get(row[key]).push(row)
  }
  return groups
}

export function registerEmployerRoutes(app) {
  app.get('/api/employer/apprentices', allow(EMPLOYER), async (req, res) => {
    try {
      const rows = await execute(req.db, APPRENTICES_QUERY, [todayString()])
      res.json({ reviewWindowDays: REVIEW_WINDOW_DAYS, apprentices: rows })
    } catch (err) {
      sendError(res, err, 'Could not load apprentices')
    }
  })

  app.get('/api/employer/witness-statements', allow(EMPLOYER), async (req, res) => {
    const connection = req.db
    try {
      const [statements, ksbs, files] = await Promise.all([
        execute(connection, STATEMENTS_QUERY),
        execute(connection, STATEMENT_KSBS_QUERY),
        execute(connection, STATEMENT_FILES_QUERY),
      ])
      const ksbsByEvidence = groupBy(ksbs, 'EVIDENCE_ID')
      const filesByEvidence = groupBy(files, 'EVIDENCE_ID')
      res.json(
        statements.map((s) => ({
          ...s,
          ksbs: (ksbsByEvidence.get(s.EVIDENCE_ID) ?? []).map(({ KSB_REFERENCE, KSB_TEXT }) => ({ KSB_REFERENCE, KSB_TEXT })),
          files: (filesByEvidence.get(s.EVIDENCE_ID) ?? []).map(({ FILE_ID, ORIGINAL_FILENAME, CONTENT_TYPE, SIZE_BYTES }) => ({
            FILE_ID, ORIGINAL_FILENAME, CONTENT_TYPE, SIZE_BYTES,
          })),
        })),
      )
    } catch (err) {
      sendError(res, err, 'Could not load witness statements')
    }
  })

  app.get('/api/employer/witness-statements/:evidenceId/files/:fileId', allow(EMPLOYER), async (req, res) => {
    try {
      const [file] = await execute(req.db, STATEMENT_FILE_QUERY, [req.params.evidenceId, req.params.fileId])
      await sendStageFile(req, res, file)
    } catch (err) {
      sendError(res, err, 'Could not fetch this file')
    }
  })

  app.post('/api/employer/witness-statements/:evidenceId/confirmations', allow(EMPLOYER), async (req, res) => {
    const fieldErrors = validateWitnessConfirmationForm(req.body)
    if (Object.keys(fieldErrors).length > 0) {
      res.status(400).json({ error: 'Please fix the highlighted fields.', fields: fieldErrors })
      return
    }
    try {
      const confirmationId = crypto.randomUUID()
      const rows = await execute(req.db, INSERT_CONFIRMATION, [
        confirmationId,
        req.user.USERID,
        req.user.DISPLAYNAME,
        req.body.outcome,
        String(req.body.comment ?? '').trim() || null,
        req.params.evidenceId,
      ])
      if (Number(rows?.[0]?.['number of rows inserted']) !== 1) {
        throw new RequestError('This statement isn’t waiting for your answer.', 409)
      }
      res.status(201).json({ confirmationId })
    } catch (err) {
      sendError(res, err, 'Could not save your answer')
    }
  })
}
