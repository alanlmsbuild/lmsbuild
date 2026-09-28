// DEVELOPMENT ONLY: test sign-in, while there's no real sign-in.
//
// With TEST_SIGN_IN=true in server/.env, the sign-in page (/sign-in) and
// the "Test user" pill in the header list the test users
// (ISTESTDATA = TRUE), and picking one sets a cookie: that's signing in.
// access.js signs every request in as that user, and without the cookie
// nobody is signed in. Signing out clears it. Only test users can be picked,
// so this can never act as a real person.
//
// Without TEST_SIGN_IN=true (missing, empty or anything else) the routes
// here answer 404, the cookie is ignored, and everyone is signed out. The
// server refuses to start with it set when NODE_ENV is production.
//
// When real sign-in arrives, this file and signedInUserId() in access.js
// are what goes.

import { connect, execute, destroy } from './db.js'

const COOKIE = 'dev_user_id'

export function testSignInEnabled() {
  return process.env.TEST_SIGN_IN?.trim() === 'true'
}

// Called once at startup.
export function refuseTestSignInInProduction() {
  if (testSignInEnabled() && process.env.NODE_ENV === 'production') {
    throw new Error('TEST_SIGN_IN=true is for development only. Remove it from server/.env before running in production.')
  }
}

// The test user signed in in this browser, or null. Always null without
// TEST_SIGN_IN=true, whatever cookie the browser sends.
export function testUserId(req) {
  if (!testSignInEnabled()) return null
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name === COOKIE) return decodeURIComponent(value.join('=')) || null
  }
  return null
}

// Instead of allow(...): these routes run before anyone is signed in, and
// only exist while test sign-in is on.
export function devOnly(req, res, next) {
  if (testSignInEnabled()) {
    next()
    return
  }
  res.clearCookie(COOKIE, { path: '/api' })
  res.status(404).json({ error: 'Test sign-in is turned off.' })
}

// Every test user in every organisation, with their active and revoked
// roles, for the picker.
const TEST_USERS_QUERY = `
  select
    u.USERID,
    u.DISPLAYNAME,
    u.ORGANISATIONID,
    o.NAME as ORGANISATIONNAME,
    u.ISACTIVE,
    listagg(distinct iff(r.REVOKEDAT is null, r.ROLE, null), ',') within group (order by iff(r.REVOKEDAT is null, r.ROLE, null)) as ROLES,
    listagg(distinct iff(r.REVOKEDAT is null, null, r.ROLE), ',') within group (order by iff(r.REVOKEDAT is null, null, r.ROLE)) as REVOKEDROLES
  from ACCESS.APP_USER u -- all organisations: a development tool, test users only
  join ACCESS.ORGANISATION o
    on o.ORGANISATIONID = u.ORGANISATIONID
  left join ACCESS.USER_ROLE r
    on r.USERID = u.USERID
  where u.ISTESTDATA
  group by u.USERID, u.DISPLAYNAME, u.ORGANISATIONID, o.NAME, u.ISACTIVE
  order by u.ORGANISATIONID, u.USERID
`

async function withConnection(work) {
  const connection = await connect()
  try {
    return await work(connection)
  } finally {
    await destroy(connection).catch(() => {})
  }
}

export function registerDevUserRoutes(app) {
  app.get('/api/dev/users', devOnly, async (req, res) => {
    try {
      const users = await withConnection((c) => execute(c, TEST_USERS_QUERY))
      res.json({
        current: testUserId(req),
        users: users.map((u) => ({
          ...u,
          ROLES: u.ROLES ? u.ROLES.split(',') : [],
          REVOKEDROLES: u.REVOKEDROLES ? u.REVOKEDROLES.split(',') : [],
        })),
      })
    } catch (err) {
      console.error('Failed to list test users:', err.message)
      res.status(500).json({ error: 'Could not list the test users.' })
    }
  })

  // Signs this browser in as a test user. Inactive users can be picked, so
  // being refused can be tried out.
  app.put('/api/dev/user', devOnly, async (req, res) => {
    const userId = String(req.body?.userId ?? '').trim()
    try {
      const [user] = await withConnection((c) =>
        execute(c, `select ISTESTDATA from ACCESS.APP_USER where USERID = ? -- all organisations: test users only`, [userId]),
      )
      if (!user?.ISTESTDATA) {
        res.status(400).json({ error: 'Only test users can be picked here.' })
        return
      }
      res.cookie(COOKIE, userId, { path: '/api', httpOnly: true, sameSite: 'strict' })
      res.json({ userId })
    } catch (err) {
      console.error('Failed to switch test user:', err.message)
      res.status(500).json({ error: 'Could not switch user.' })
    }
  })

  // Signs this browser out.
  app.post('/api/dev/sign-out', devOnly, (req, res) => {
    res.clearCookie(COOKIE, { path: '/api', httpOnly: true, sameSite: 'strict' })
    res.json({ signedOut: true })
  })
}
