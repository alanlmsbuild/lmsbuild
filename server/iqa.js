// IQA endpoints: the sign-offs an IQA can check, and recording a check.
//
// The rule: nobody checks their own sign-off. An IQA who is also an
// assessor (Ada) never sees the sign-offs she made, and the server refuses
// a check of one even if it's asked for directly. The assessor is always
// read from the sign-off itself, never from the request. Checks are
// add-only (the app's role has no UPDATE or DELETE on IQA_CHECK), so a
// sign-off can be checked again later and every check is kept.

import crypto from 'node:crypto'
import { execute } from './db.js'
import { allow, IQA, ORG_OFFICER, VISIBLE_LEARNER } from './access.js'
import { RequestError, sendError } from './burrow.js'
import { validateIqaCheckForm } from '../src/validation.js'

// Assessor sign-offs on learners the IQA can see, other than their own, with
// the latest IQA check of each. Not yet checked first, then oldest first.
// Bind: the IQA's officer reference.
export const SIGN_OFFS_QUERY = `
  with latest_check as (
    select REVIEW_ID, OUTCOME, IQA_NAME, CHECKED_AT, FEEDBACK
    from BURROW.IQA_CHECK
    qualify row_number() over (partition by REVIEW_ID order by CHECKED_AT desc) = 1
  )
  select
    r.REVIEW_ID,
    r.EVIDENCE_ID,
    r.OFFICERREFNUMBER as ASSESSOR_OFFICERREFNUMBER,
    r.OFFICER_NAME as ASSESSOR_NAME,
    r.REVIEWED_AT,
    r.FEEDBACK as ASSESSOR_FEEDBACK,
    r.EVIDENCE_SNAPSHOT:reflection::string as REFLECTION,
    e.TITLE,
    e.EVIDENCE_TYPE,
    e.OCCURRED_ON,
    e.ST_REFERENCE,
    l.LEARNREFNUMBER,
    l.GIVENNAMES,
    l.FAMILYNAME,
    c.OUTCOME as CHECK_OUTCOME,
    c.IQA_NAME as CHECKED_BY,
    c.CHECKED_AT,
    c.FEEDBACK as CHECK_FEEDBACK
  from BURROW.EVIDENCE_REVIEW r
  join BURROW.EVIDENCE e
    on e.EVIDENCE_ID = r.EVIDENCE_ID
  join ${VISIBLE_LEARNER} l
    on l.LEARNREFNUMBER = e.LEARNREFNUMBER
  left join latest_check c
    on c.REVIEW_ID = r.REVIEW_ID
  where r.OUTCOME = 'signed_off'
    and r.OFFICERREFNUMBER <> ?
  order by c.CHECKED_AT is not null, r.REVIEWED_AT
`

const SIGN_OFF_QUERY = `
  select r.REVIEW_ID, r.OFFICERREFNUMBER
  from BURROW.EVIDENCE_REVIEW r
  join BURROW.EVIDENCE e
    on e.EVIDENCE_ID = r.EVIDENCE_ID
  join ${VISIBLE_LEARNER} l
    on l.LEARNREFNUMBER = e.LEARNREFNUMBER
  where r.REVIEW_ID = ?
    and r.OUTCOME = 'signed_off'
`

const OFFICER_NAME_QUERY = `select OFFICERNAME from ${ORG_OFFICER} where OFFICERREFNUMBER = ?`

// The assessor comes from the sign-off row, and the insert only happens
// when that isn't the IQA, so the rule holds here too.
const INSERT_CHECK = `
  insert into BURROW.IQA_CHECK
    (CHECK_ID, EVIDENCE_ID, REVIEW_ID, ASSESSOR_OFFICERREFNUMBER,
     IQA_USERID, IQA_OFFICERREFNUMBER, IQA_NAME, OUTCOME, FEEDBACK)
  select ?, r.EVIDENCE_ID, r.REVIEW_ID, r.OFFICERREFNUMBER, ?, ?, ?, ?, ?
  from BURROW.EVIDENCE_REVIEW r
  where r.REVIEW_ID = ?
    and r.OUTCOME = 'signed_off'
    and r.OFFICERREFNUMBER <> ?
`

// Records a check of one sign-off by the signed-in IQA. Returns the new
// CHECK_ID, or throws a RequestError saying why not.
export async function recordIqaCheck(connection, user, reviewId, body) {
  const [signOff] = await execute(connection, SIGN_OFF_QUERY, [reviewId])
  if (!signOff) throw new RequestError('Sign-off not found.', 404)

  const iqaRef = user.OFFICERREFNUMBER
  if (!iqaRef) {
    throw new RequestError('Your user has no officer record, so it can’t record IQA checks. Ask a manager to link one.', 409)
  }
  if (signOff.OFFICERREFNUMBER === iqaRef) {
    throw new RequestError('You signed this off yourself, so another IQA must check it.', 403)
  }

  const fieldErrors = validateIqaCheckForm(body)
  if (Object.keys(fieldErrors).length > 0) {
    throw new RequestError('Please fix the highlighted fields.', 400, fieldErrors)
  }

  const [officer] = await execute(connection, OFFICER_NAME_QUERY, [iqaRef])
  const checkId = crypto.randomUUID()
  const rows = await execute(connection, INSERT_CHECK, [
    checkId,
    user.USERID,
    iqaRef,
    officer?.OFFICERNAME ?? user.DISPLAYNAME,
    body.outcome,
    String(body.feedback ?? '').trim() || null,
    reviewId,
    iqaRef,
  ])
  if (Number(rows?.[0]?.['number of rows inserted']) !== 1) {
    throw new RequestError('You signed this off yourself, so another IQA must check it.', 403)
  }
  return checkId
}

export function registerIqaRoutes(app) {
  app.get('/api/iqa/sign-offs', allow(IQA), async (req, res) => {
    try {
      res.json(await execute(req.db, SIGN_OFFS_QUERY, [req.user.OFFICERREFNUMBER ?? '']))
    } catch (err) {
      sendError(res, err, 'Could not load sign-offs')
    }
  })

  app.post('/api/iqa/sign-offs/:reviewId/checks', allow(IQA), async (req, res) => {
    try {
      const checkId = await recordIqaCheck(req.db, req.user, req.params.reviewId, req.body)
      res.status(201).json({ checkId })
    } catch (err) {
      sendError(res, err, 'Could not save this check')
    }
  })
}
