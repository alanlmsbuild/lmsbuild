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
// Each request has its own session: borrowed from a pool of open sessions
// (sessionPool.js), where every variable is set afresh on each request and
// unset when the session comes back, or with DB_POOL=off, opened for it and
// closed when the response ends. Either way the user and their roles
// are looked up on every request, so deactivating someone or changing
// their roles takes effect on their next request.

import { connect, execute, destroy, ConnectTimeoutError } from './db.js'
import { POOL_ON, SESSION_VARIABLES, borrow, giveBack, leaseFor } from './sessionPool.js'
import { testUserId } from './devUsers.js'

// Only for reading from the ORG_ sources below. Not a table.
const ORG = '$CURRENT_ORGANISATIONID'

export const ORG_OFFICER = `(select * from ILR.OFFICER where ORGANISATIONID = ${ORG})`
export const ORG_EMPLOYER = `(select * from ILR.EMPLOYER where ORGANISATIONID = ${ORG})`
export const ORG_APP_USER = `(select * from ACCESS.APP_USER where ORGANISATIONID = ${ORG})`
export const ORG_ORGANISATION = `(select * from ACCESS.ORGANISATION where ORGANISATIONID = ${ORG})`

// Companies House details (the EXT schema) are shared across organisations, so
// they're read only for the organisation's own employers, one row per
// employer with a company number (npm run check:scoping). The registered
// office is managers only: for tutors, assessors and IQAs it reads as null.
export const MANAGER_ONLY_COMPANY_COLUMNS = [
  'ADDRESSPREMISES', 'ADDRESSLINE1', 'ADDRESSLINE2', 'ADDRESSLOCALITY', 'ADDRESSREGION',
  'ADDRESSPOSTCODE', 'ADDRESSCOUNTRY', 'ADDRESSPOBOX', 'ADDRESSCAREOF', 'OFFICEINDISPUTE', 'OFFICEUNDELIVERABLE',
]
export const ORG_EMPLOYER_COMPANY = `(
  select e.EMPLOYERID, c.* replace (${MANAGER_ONLY_COMPANY_COLUMNS.map((col) => `iff($SEES_MANAGER_ONLY, c.${col}, null) as ${col}`).join(', ')})
  from ILR.EMPLOYER e
  join EXT.COMPANY c on c.COMPANYNUMBER = e.COMPANYNUMBER
  where e.ORGANISATIONID = ${ORG}
)`

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

// Each learner's current programme aim: the latest programme aim that
// hasn't been removed. A learner who returned from a break has more than
// one, and the aims before the break stay, but aren't current. Every learner
// across all organisations: only use it joined to a scoped source or with
// IN_VISIBLE_LEARNERS (check:scoping makes sure). currentProgramme() in
// src/programme.js picks the same aim from aims already loaded.
export const CURRENT_PROGRAMME = `(
    select * from LEARNING_DELIVERY
    where AIMTYPE = 1 and REMOVEDAT is null
    qualify AIMSEQNUMBER = max(AIMSEQNUMBER) over (partition by LEARNREFNUMBER)
  )`

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

// Prices and payments (ILR.APP_FIN_RECORD) are for managers only: anyone
// else gets no rows, whatever the query. Every read goes through here (npm
// run check:scoping checks). Add IN_VISIBLE_LEARNERS (or, for the ILR
// return, IN_ORG_LEARNERS) to say whose.
export const ORG_APP_FIN_RECORD = `(
  select * from ILR.APP_FIN_RECORD
  where $SEES_MANAGER_ONLY
    and LEARNREFNUMBER in (select LEARNREFNUMBER from ${LEARNER_ROWS})
)`

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

// The user and their roles in one trip. A role counts only while it hasn't
// been revoked.
const USER_QUERY = `
  select u.USERID, u.ORGANISATIONID, o.NAME as ORGANISATIONNAME, u.DISPLAYNAME, u.EMAIL, u.OFFICERREFNUMBER,
    u.LEARNREFNUMBER, u.EMPLOYERID, u.ISACTIVE, u.ISTESTDATA,
    listagg(distinct r.ROLE, ',') within group (order by r.ROLE) as ROLES
  from ACCESS.APP_USER u
  left join ACCESS.ORGANISATION o
    on o.ORGANISATIONID = u.ORGANISATIONID
  left join ACCESS.USER_ROLE r
    on r.USERID = u.USERID and r.REVOKEDAT is null
  where u.USERID = ?
  group by u.USERID, u.ORGANISATIONID, o.NAME, u.DISPLAYNAME, u.EMAIL, u.OFFICERREFNUMBER,
    u.LEARNREFNUMBER, u.EMPLOYERID, u.ISACTIVE, u.ISTESTDATA
`

// Every variable in SESSION_VARIABLES, in that order, in one statement.
const SET_SESSION = `set (${SESSION_VARIABLES.join(', ')}) = (${SESSION_VARIABLES.map(() => '?').join(', ')})`

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

// How long each request spends opening its Snowflake session, signing in
// (the user, their roles and the session variables) and on the route's own
// work. Logged for requests slower than SLOW_REQUEST_MS (server/.env,
// default 2 seconds), ones that fail, time out, or that the browser gave up
// on; DB_TIMING_LOG=all logs every request.
const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS) || 2000
const LOG_EVERY_REQUEST = process.env.DB_TIMING_LOG === 'all'

function timeRequest(req, res) {
  const start = performance.now()
  const marks = {}
  res.on('close', () => {
    const total = performance.now() - start
    const gaveUp = !res.writableFinished
    if (!(LOG_EVERY_REQUEST || gaveUp || res.statusCode >= 500 || total > SLOW_REQUEST_MS)) return
    const ms = (from, to) => (from === undefined || to === undefined ? '-' : `${Math.round(to - from)}ms`)
    const work = marks.signedIn === undefined ? '-' : ms(marks.signedIn, performance.now())
    console.log(
      `[timing] ${new Date().toISOString()} ${req.method} ${req.originalUrl} ${req.user?.USERID ?? '-'} status=${res.statusCode}` +
        ` connect=${ms(0, marks.connected === undefined ? undefined : marks.connected - start)} sign-in=${ms(marks.connected, marks.signedIn)}` +
        ` work=${work} total=${Math.round(total)}ms${res.locals.dbSession ? ` session=${res.locals.dbSession}` : ''}` +
        `${gaveUp ? ' (the browser gave up before the response)' : ''}`,
    )
  })
  return (name) => {
    marks[name] = performance.now()
  }
}

// The request's database session: borrowed from the pool, or with
// DB_POOL=off opened just for this request. end({ reuse, why }) returns it
// to the pool, or throws it away; without the pool it's always closed.
async function sessionForRequest(res) {
  if (!POOL_ON) {
    const connection = await connect()
    return { db: connection, end: () => destroy(connection).catch((err) => console.error('Failed to close connection:', err.message)) }
  }
  const session = await borrow()
  res.locals.dbSession = `${session.id}${session.fresh ? ' (new)' : ' (reused)'}`
  const lease = leaseFor(session)
  return { db: lease, lease, end: (outcome) => giveBack(lease, outcome) }
}

export async function attachUser(req, res, next) {
  const mark = timeRequest(req, res)
  const userId = signedInUserId(req)
  if (!userId) {
    // signedIn: false tells the app to show the sign-in page, not an error.
    res.status(401).json({ error: "You're not signed in.", signedIn: false })
    return
  }

  // Watched from the start: the browser can give up while the session is
  // still being opened (or waited for), and that session must still be
  // closed or returned. A session whose browser gave up may still be
  // running a query, and one whose request failed may be in a bad state:
  // neither is reused.
  let session = null
  let closed = false
  let ended = false
  const finish = () => {
    if (!session || ended) return
    ended = true
    const gaveUp = !res.writableFinished
    session.end({
      reuse: !gaveUp && res.statusCode < 500,
      why: gaveUp ? 'the browser gave up before the response' : `the request failed (${res.statusCode})`,
    })
  }
  res.on('close', () => {
    closed = true
    finish()
  })

  try {
    session = await sessionForRequest(res)
    mark('connected')
    if (closed) return finish()
    // Looked up on every request, pooled or not.
    const [user] = await execute(session.db, USER_QUERY, [userId])
    if (!user) return res.status(401).json({ error: `User ${userId} doesn't exist.` })
    if (!user.ISTESTDATA) return res.status(403).json({ error: 'Only test users can sign in with test sign-in.' })
    if (!user.ISACTIVE) return res.status(403).json({ error: 'Your access has ended. Ask a manager if you think this is wrong.' })
    user.roles = user.ROLES ? user.ROLES.split(',') : []
    delete user.ROLES
    if (user.roles.length === 0) return res.status(403).json({ error: "You don't have any roles yet. Ask a manager to give you one." })
    if (session.lease) session.lease.variablesSet = true
    await execute(session.db, SET_SESSION, sessionValues(user))
    mark('signedIn')
    if (closed) return
    req.user = user
    req.db = session.db
  } catch (err) {
    if (err instanceof ConnectTimeoutError) {
      console.error('Timed out opening a database session:', err.message)
      if (!closed) res.status(503).json({ error: "Couldn't reach the database just now. Please try again." })
      return
    }
    console.error('Failed to look up the signed-in user:', err.message)
    if (!closed) res.status(500).json({ error: 'Could not check who is signed in. Please try again.' })
    return
  }
  next()
}
