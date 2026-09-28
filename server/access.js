// Who is asking, what they can see, and what they can do.
//
// Every /api request goes through attachUser first. It opens the request's
// Snowflake connection (req.db), loads the signed-in user and their active
// roles (req.user), refuses inactive users, and sets session variables for
// the organisation and for what the user's roles let them see. The ORG_ and
// VISIBLE_ sources below read those variables, so a route never passes an
// organisation or a caseload itself and can't pass the wrong one or forget
// it. Routes read learners, officers, employers, users and caseloads
// through these sources, never the raw tables (npm run check:scoping looks
// for slips, and for routes that don't say which roles they allow).
//
// Each request has its own connection, closed when the response ends, so
// the session variables can't carry over from one user to another.

import { connect, execute, destroy } from './db.js'
import { testUserId } from './devUsers.js'

// Only for reading from the ORG_ sources below. Not a table.
const ORG = '$CURRENT_ORGANISATIONID'

export const ORG_OFFICER = `(select * from ILR.OFFICER where ORGANISATIONID = ${ORG})`
export const ORG_EMPLOYER = `(select * from ILR.EMPLOYER where ORGANISATIONID = ${ORG})`
export const ORG_APP_USER = `(select * from ACCESS.APP_USER where ORGANISATIONID = ${ORG})`
export const ORG_ORGANISATION = `(select * from ACCESS.ORGANISATION where ORGANISATIONID = ${ORG})`

// The organisation to write on new learners and officers.
export const CURRENT_ORGANISATIONID = ORG

// TRUE when the signed-in user is test data. Written as ISTESTDATA on every
// row the app creates in a table that has that column, so records made
// while testing can be found and removed with the rest of the test data.
export const CURRENT_ISTESTDATA = '$CURRENT_ISTESTDATA'

// ---------------------------------------------------------------- roles

export const LEARNER = 'LEARNER'
export const TUTOR = 'TUTOR'
export const ASSESSOR = 'ASSESSOR'
export const IQA = 'IQA'
export const EMPLOYER = 'EMPLOYER'
export const MANAGER = 'MANAGER'

// Everyone who works for the provider, i.e. everyone who can use Warren.
export const STAFF = [MANAGER, TUTOR, ASSESSOR, IQA]

// Route middleware: lets the request through only when the user holds at
// least one of these roles. A user with several roles gets the combined
// access of all of them. Every /api route starts with one of these (npm run
// check:scoping checks), so no route is open to everyone by accident.
export function allow(...roles) {
  const allowed = new Set(roles.flat())
  return (req, res, next) => {
    if (req.user.roles.some((role) => allowed.has(role))) {
      next()
      return
    }
    res.status(403).json({ error: "You don't have access to this." })
  }
}

// ---------------------------------------------------------------- learners
//
// The one place that says which learners a request can reach. Every read
// of ILR.LEARNER goes through LEARNER_ROWS, and every learner lookup
// through VISIBLE_LEARNER (or IN_VISIBLE_LEARNERS, the same set for a
// where clause). Limiting managers to their own team (part 8) is a change
// to VISIBLE_LEARNER only.
//
// Only managers see these columns. For everyone else they read as null,
// whatever query asks for them (npm run check:scoping checks nothing reads
// the table another way). Tutors, assessors and IQAs still see LLDD and
// support needs, which they need to support the learner.
export const MANAGER_ONLY_LEARNER_COLUMNS = ['NINUMBER', 'ETHNICITY']

const LEARNER_ROWS = `(
  select * replace (${MANAGER_ONLY_LEARNER_COLUMNS.map((c) => `iff($SEES_MANAGER_ONLY, ${c}, null) as ${c}`).join(', ')})
  from ILR.LEARNER
  where ORGANISATIONID = ${ORG}
)`

// Within the organisation, the learners a user can see depend on their
// roles, added together:
//   Manager, IQA        every learner in the organisation
//   Tutor, Assessor     the learners currently assigned to them
//   Employer            their employer's current apprentices, by EMPLOYERID
//                       only (the same employer reference can exist at
//                       another organisation)
//   Learner             themselves
// A learner outside this gets "not found", the same as one in another
// organisation. Session variables for a role the user doesn't hold are ''
// (matches nothing) or FALSE.
export const VISIBLE_LEARNER = `(
  select * from ${LEARNER_ROWS}
  where $SEES_ALL_LEARNERS
    or LEARNREFNUMBER in (
      select LEARNREFNUMBER from ILR.OFFICER_ASSIGNMENT
      where OFFICERREFNUMBER = $CASELOAD_OFFICERREFNUMBER and ENDEDAT is null)
    or LEARNREFNUMBER in (
      select LEARNREFNUMBER from ILR.LEARNER_EMPLOYER
      where EMPLOYERID = $APPRENTICES_OF_EMPLOYERID and (TODATE is null or TODATE >= current_date()))
    or LEARNREFNUMBER = $OWN_LEARNREFNUMBER
)`

// For tables keyed by learner without an ORGANISATIONID of their own
// (LEARNING_DELIVERY, PROGRESS_REVIEW, BURROW.EVIDENCE, the ILR records):
// add to the where clause, so a query or update only touches learners this
// user can reach.
export const IN_VISIBLE_LEARNERS = `LEARNREFNUMBER in (select LEARNREFNUMBER from ${VISIBLE_LEARNER})`

// The current apprentices of the signed-in user's own employer (by
// EMPLOYERID only), whatever other roles they hold. For the employer
// screens, which show only what an employer may see of each apprentice.
export const EMPLOYER_APPRENTICE = `(
  select * from ${VISIBLE_LEARNER}
  where LEARNREFNUMBER in (
    select LEARNREFNUMBER from ILR.LEARNER_EMPLOYER
    where EMPLOYERID = $APPRENTICES_OF_EMPLOYERID and (TODATE is null or TODATE >= current_date()))
)`

// Every learner in the organisation, whoever is asking. Only for duties
// that must cover the whole organisation rather than the learners someone
// can see: a ULN can't be used twice in the organisation, and the ILR
// return covers everyone. ORG_LEARNER and IN_ORG_LEARNERS (for a where
// clause) are for these only, and each use says why with "-- whole organisation:"
// (npm run check:scoping checks). Manager-only columns are masked as above.
export const ORG_LEARNER = LEARNER_ROWS
export const IN_ORG_LEARNERS = `LEARNREFNUMBER in (select LEARNREFNUMBER from ${LEARNER_ROWS})`

// Caseload assignments where both the learner and the officer are in the
// organisation.
export const ORG_OFFICER_ASSIGNMENT = `(
  select * from ILR.OFFICER_ASSIGNMENT
  where LEARNREFNUMBER in (select LEARNREFNUMBER from ${LEARNER_ROWS})
    and OFFICERREFNUMBER in (select OFFICERREFNUMBER from ILR.OFFICER where ORGANISATIONID = ${ORG})
)`

// Managers see every officer in the organisation. Anyone else sees only
// their own officer record (for My day and their caseload report).
export const VISIBLE_OFFICER = `(
  select * from ILR.OFFICER
  where ORGANISATIONID = ${ORG}
    and ($SEES_ALL_OFFICERS or OFFICERREFNUMBER = $CURRENT_OFFICERREFNUMBER)
)`

// ---------------------------------------------------------------- the signed-in user

const USER_QUERY = `
  select u.USERID, u.ORGANISATIONID, o.NAME as ORGANISATIONNAME, u.DISPLAYNAME, u.EMAIL, u.OFFICERREFNUMBER,
    u.LEARNREFNUMBER, u.EMPLOYERID, u.ISACTIVE, u.ISTESTDATA
  from ACCESS.APP_USER u
  left join ACCESS.ORGANISATION o
    on o.ORGANISATIONID = u.ORGANISATIONID
  where u.USERID = ?
`

// A role counts only while it hasn't been revoked.
const ACTIVE_ROLES_QUERY = `
  select distinct ROLE
  from ACCESS.USER_ROLE
  where USERID = ? and REVOKEDAT is null
  order by ROLE
`

const SET_SESSION = `
  set (CURRENT_ORGANISATIONID, CURRENT_ISTESTDATA, SEES_ALL_LEARNERS, SEES_ALL_OFFICERS, SEES_MANAGER_ONLY,
       CURRENT_OFFICERREFNUMBER, CASELOAD_OFFICERREFNUMBER, APPRENTICES_OF_EMPLOYERID, OWN_LEARNREFNUMBER)
    = (?, ?, ?, ?, ?, ?, ?, ?, ?)
`

function sessionValues(user) {
  const holds = (...roles) => user.roles.some((role) => roles.includes(role))
  return [
    user.ORGANISATIONID,
    user.ISTESTDATA === true,
    holds(MANAGER, IQA),
    holds(MANAGER),
    holds(MANAGER),
    user.OFFICERREFNUMBER ?? '',
    holds(TUTOR, ASSESSOR) ? user.OFFICERREFNUMBER ?? '' : '',
    holds(EMPLOYER) ? user.EMPLOYERID ?? '' : '',
    holds(LEARNER) ? user.LEARNREFNUMBER ?? '' : '',
  ]
}

// There's no real sign-in yet. With TEST_SIGN_IN=true, signing in is
// picking a test user on the sign-in page (devUsers.js), which sets a
// cookie. Without the cookie, or without TEST_SIGN_IN=true, nobody is
// signed in. Real sign-in replaces this.
function signedInUserId(req) {
  return testUserId(req)
}

export async function attachUser(req, res, next) {
  const userId = signedInUserId(req)
  if (!userId) {
    // signedIn: false tells the app to show the sign-in page, not an error.
    res.status(401).json({ error: "You're not signed in.", signedIn: false })
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
    if (!user.ISTESTDATA) {
      await destroy(connection)
      res.status(403).json({ error: 'Only test users can sign in with test sign-in.' })
      return
    }
    if (!user.ISACTIVE) {
      await destroy(connection)
      res.status(403).json({ error: 'Your access has ended. Ask a manager if you think this is wrong.' })
      return
    }
    const roles = await execute(connection, ACTIVE_ROLES_QUERY, [userId])
    user.roles = roles.map((r) => r.ROLE)
    if (user.roles.length === 0) {
      await destroy(connection)
      res.status(403).json({ error: "You don't have any roles yet. Ask a manager to give you one." })
      return
    }
    await execute(connection, SET_SESSION, sessionValues(user))
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
