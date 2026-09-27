// Who is asking, and which organisation's data they can see.
//
// Every /api request goes through attachUser first. It opens the request's
// Snowflake connection (req.db), loads the signed-in user (req.user), and
// sets the session variable CURRENT_ORGANISATIONID to their organisation.
// The ORG_ sources below read that variable, so a route never passes an
// organisation itself and can't pass the wrong one or forget it. Routes
// read learners, officers, employers, users and caseloads through these
// sources, never the raw tables (npm run check:scoping looks for slips).
//
// Each request has its own connection, closed when the response ends, so
// the session variable can't carry over from one user to another.

import { connect, execute, destroy } from './db.js'

// Only for reading from the ORG_ sources below. Not a table.
const ORG = '$CURRENT_ORGANISATIONID'

export const ORG_LEARNER = `(select * from ILR.LEARNER where ORGANISATIONID = ${ORG})`
export const ORG_OFFICER = `(select * from ILR.OFFICER where ORGANISATIONID = ${ORG})`
export const ORG_EMPLOYER = `(select * from ILR.EMPLOYER where ORGANISATIONID = ${ORG})`
export const ORG_APP_USER = `(select * from ACCESS.APP_USER where ORGANISATIONID = ${ORG})`

// Caseload assignments where both the learner and the officer are in the
// organisation.
export const ORG_OFFICER_ASSIGNMENT = `(
  select * from ILR.OFFICER_ASSIGNMENT
  where LEARNREFNUMBER in (select LEARNREFNUMBER from ILR.LEARNER where ORGANISATIONID = ${ORG})
    and OFFICERREFNUMBER in (select OFFICERREFNUMBER from ILR.OFFICER where ORGANISATIONID = ${ORG})
)`

// For tables keyed by learner that have no ORGANISATIONID of their own
// (LEARNING_DELIVERY, PROGRESS_REVIEW, BURROW.EVIDENCE): add to the where
// clause of an update, so it can only touch this organisation's learners.
export const IN_ORG_LEARNERS = `LEARNREFNUMBER in (select LEARNREFNUMBER from ILR.LEARNER where ORGANISATIONID = ${ORG})`

// The organisation to write on new learners and officers.
export const CURRENT_ORGANISATIONID = ORG

const USER_QUERY = `
  select USERID, ORGANISATIONID, DISPLAYNAME, EMAIL, OFFICERREFNUMBER, LEARNREFNUMBER, EMPLOYERID, ISACTIVE
  from ACCESS.APP_USER
  where USERID = ?
`

// There's no sign-in yet: the user is DEV_USER_ID from server/.env.
function signedInUserId() {
  return process.env.DEV_USER_ID?.trim() || null
}

export async function attachUser(req, res, next) {
  const userId = signedInUserId()
  if (!userId) {
    res.status(401).json({ error: 'Nobody is signed in. Set DEV_USER_ID in server/.env and restart the server.' })
    return
  }

  let connection
  try {
    connection = await connect()
    const [user] = await execute(connection, USER_QUERY, [userId])
    if (!user) {
      await destroy(connection)
      res.status(401).json({ error: `User ${userId} doesn't exist.` })
      return
    }
    await execute(connection, 'set CURRENT_ORGANISATIONID = ?', [user.ORGANISATIONID])
    req.user = user
    req.db = connection
  } catch (err) {
    if (connection) await destroy(connection).catch(() => {})
    console.error('Failed to look up the signed-in user:', err.message)
    res.status(500).json({ error: 'Could not check who is signed in. Please try again.' })
    return
  }

  res.on('close', () => {
    destroy(connection).catch((err) => console.error('Failed to close connection:', err.message))
  })
  next()
}
