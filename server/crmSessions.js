// Meadow's database sessions: CRM_APP_USER with CRM_APP_ROLE (db.js,
// as: 'crm'), never Warren and Burrow's user. A handful of open sessions are
// kept for reuse, like sessionPool.js but simpler, because Meadow's queries
// set no session state at all: the organisation is a bind in every query
// (server/meadow.js, check:scoping rule 21), there are no session variables
// to clear, and Meadow only reads, so no transaction can be left open.
//
// A session is thrown away when its work failed, when the driver says it's
// no longer connected, after 30 minutes or 500 uses, and when it has sat
// unused for 4 minutes. With DB_POOL=off each request opens its own.

import { connect, destroy } from './db.js'
import { POOL_ON } from './sessionPool.js'

const MAX_IDLE = 4
const MAX_AGE_MS = 30 * 60 * 1000
const MAX_USES = 500
const IDLE_MS = 4 * 60 * 1000

const idle = [] // { connection, created, uses, idleSince }

function close(session) {
  destroy(session.connection).catch(() => {})
}

function takeIdle() {
  while (idle.length > 0) {
    const session = idle.pop()
    if (Date.now() - session.created < MAX_AGE_MS && session.uses < MAX_USES && session.connection.isUp()) return session
    close(session)
  }
  return null
}

// Runs work(connection) on a Meadow session and returns its result.
export async function withCrmSession(work) {
  const session = (POOL_ON && takeIdle()) || { connection: await connect({ as: 'crm' }), created: Date.now(), uses: 0 }
  let ok = false
  try {
    const result = await work(session.connection)
    ok = true
    return result
  } finally {
    session.uses++
    if (POOL_ON && ok && idle.length < MAX_IDLE && session.connection.isUp()) {
      session.idleSince = Date.now()
      idle.push(session)
    } else {
      close(session)
    }
  }
}

if (POOL_ON) {
  setInterval(() => {
    for (let i = idle.length - 1; i >= 0; i--) {
      if (Date.now() - idle[i].idleSince > IDLE_MS) close(idle.splice(i, 1)[0])
    }
  }, 30 * 1000).unref()
}
