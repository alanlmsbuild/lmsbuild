// Reusing Snowflake sessions between requests: the default, unless
// DB_POOL=off in server/.env. Opening a session and signing in took about
// 65% of each request's time, so attachUser borrows an open session instead
// of logging in on every request.
//
// What stops one user's session state reaching the next:
//
// - A route never holds the session itself, only a lease (req.db). Once
//   the request is over the lease is revoked, and anything still run
//   through it fails with "session already returned".
// - attachUser sets every session variable that decides what the user can
//   see (SESSION_VARIABLES, all in one statement) on every request, after
//   looking up the user and their roles afresh. When the session comes
//   back they are all unset, not blanked, so a query run without setting
//   them fails ("session variable ... does not exist") instead of using
//   the last user's values.
// - A session that comes back inside a transaction is rolled back and
//   thrown away. So is one whose request failed (500 or more), whose
//   browser gave up on it (a query may still be running), whose driver
//   reported a connection problem, or whose clean-up failed.
// - The app's queries keep no other session state: no ALTER SESSION, USE,
//   temporary tables, LAST_QUERY_ID or RESULT_SCAN (npm run check:scoping
//   enforces this). Burrow's PUT and GET name their stage path in full.
//
// Sessions are also thrown away after 30 minutes or 500 requests, and when
// they've sat unused for 4 minutes. Waiting for a session has the same
// time limit as opening one (DB_CONNECT_TIMEOUT_MS).

import { connect, destroy, CONNECT_TIMEOUT_MS, ConnectTimeoutError } from './db.js'

export const POOL_ON = process.env.DB_POOL !== 'off'
const MAX_SESSIONS = Number(process.env.DB_POOL_MAX) || 8
const MAX_AGE_MS = 30 * 60 * 1000
const MAX_USES = 500
const IDLE_MS = 4 * 60 * 1000

// Every session variable the app's queries read. Set together on every
// request (access.js) and unset together when the session comes back.
export const SESSION_VARIABLES = [
  'CURRENT_ORGANISATIONID', 'CURRENT_ISTESTDATA', 'SEES_ALL_LEARNERS', 'SEES_ALL_OFFICERS', 'SEES_MANAGER_ONLY',
  'CURRENT_OFFICERREFNUMBER', 'CASELOAD_OFFICERREFNUMBER', 'APPRENTICES_OF_EMPLOYERID', 'OWN_LEARNREFNUMBER',
  'CURRENT_USERID',
]
const UNSET_SESSION = `unset (${SESSION_VARIABLES.join(', ')})`

const idle = [] // { connection, id, created, uses }
const waiting = [] // { resolve, reject, timer }
let open = 0 // sessions in use or idle
let nextId = 1

// Logged when DB_TIMING_LOG=all, and always when a session is thrown away.
const logAll = process.env.DB_TIMING_LOG === 'all'
const log = (message) => console.log(`[pool] ${new Date().toISOString()} ${message}`)

function run(connection, sqlText) {
  return new Promise((resolve, reject) => {
    connection.execute({ sqlText, complete: (err, _stmt, rows) => (err ? reject(err) : resolve(rows)) })
  })
}

function discard(session, why) {
  open--
  log(`session ${session.id} thrown away: ${why} (${open} open)`)
  destroy(session.connection).catch(() => {})
  wakeNext()
}

function stale(session) {
  if (Date.now() - session.created > MAX_AGE_MS) return 'over 30 minutes old'
  if (session.uses >= MAX_USES) return `used ${MAX_USES} times`
  if (!session.connection.isUp()) return 'no longer connected'
  return null
}

// Hands a free session (or a free place to open one) to the longest waiter.
function wakeNext() {
  while (waiting.length > 0) {
    const session = takeIdle()
    if (session) {
      const w = waiting.shift()
      clearTimeout(w.timer)
      w.resolve(session)
      continue
    }
    if (open < MAX_SESSIONS) {
      const w = waiting.shift()
      clearTimeout(w.timer)
      openSession(w.deadline).then(w.resolve, w.reject)
      continue
    }
    return
  }
}

function takeIdle() {
  while (idle.length > 0) {
    const session = idle.pop()
    const why = stale(session)
    if (!why) return session
    discard(session, why)
  }
  return null
}

async function openSession(deadline) {
  open++
  try {
    const connection = await connect({ timeoutMs: Math.max(1, deadline - Date.now()) })
    const session = { connection, id: nextId++, created: Date.now(), uses: 0, fresh: true }
    if (logAll) log(`session ${session.id} opened (${open} open)`)
    return session
  } catch (err) {
    open--
    wakeNext()
    throw err
  }
}

// A session for one request: an idle one if there is one, a new one if
// there's room, or the next one free, within the time limit.
export async function borrow(timeoutMs = CONNECT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs
  const session = takeIdle()
  if (session) return session
  if (open < MAX_SESSIONS) return openSession(deadline)
  return new Promise((resolve, reject) => {
    const w = { resolve, reject, deadline }
    w.timer = setTimeout(() => {
      waiting.splice(waiting.indexOf(w), 1)
      reject(new ConnectTimeoutError(`Waiting for a database session took over ${timeoutMs} ms.`))
    }, timeoutMs)
    waiting.push(w)
  })
}

// The lease a request uses as req.db: it runs statements on the session
// until it's revoked, and notes driver errors that aren't SQL errors (a
// connection problem), which mean the session mustn't be reused.
export function leaseFor(session) {
  const lease = {
    session,
    active: true,
    running: 0,
    broken: false,
    variablesSet: false,
    execute(options) {
      if (!lease.active) throw new Error('This request has finished: its database session has already been returned.')
      lease.running++
      session.connection.execute({
        ...options,
        complete: (err, stmt, rows) => {
          lease.running--
          if (err && !err.sqlState) lease.broken = true
          options.complete(err, stmt, rows)
        },
      })
    },
  }
  return lease
}

// Ends a request's lease and decides the session's fate. reuse: false when
// the request failed or the browser gave up.
export async function giveBack(lease, { reuse, why }) {
  if (!lease.active) return
  lease.active = false
  const { session } = lease
  session.uses++
  if (!reuse) return discard(session, why)
  if (lease.broken) return discard(session, 'the driver reported a connection problem')
  if (lease.running > 0) return discard(session, 'a query was still running')
  try {
    const [{ T: transaction }] = await run(session.connection, 'select current_transaction() as T')
    if (transaction) {
      log(`session ${session.id} came back inside transaction ${transaction}: rolling it back`)
      await run(session.connection, 'rollback').catch(() => {})
      return discard(session, 'it came back inside a transaction')
    }
    if (lease.variablesSet) await run(session.connection, UNSET_SESSION)
  } catch (err) {
    return discard(session, `clean-up failed (${err.message})`)
  }
  session.fresh = false
  session.idleSince = Date.now()
  if (logAll) log(`session ${session.id} back in the pool`)
  idle.push(session)
  wakeNext()
}

// Closes sessions that have sat unused too long.
if (POOL_ON) {
  setInterval(() => {
    for (let i = idle.length - 1; i >= 0; i--) {
      if (Date.now() - idle[i].idleSince > IDLE_MS) discard(idle.splice(i, 1)[0], 'unused for 4 minutes')
    }
  }, 30 * 1000).unref()
}
