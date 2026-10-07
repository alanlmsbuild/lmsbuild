// Proves that reusing database sessions (DB_POOL=on, server/sessionPool.js)
// never lets one user see another user's learners, using a pool of ONE
// session so every request reuses the same one. Reads only: it writes no
// data.
//
// Part 1 uses the pool directly. Part 2 sends requests to a test API
// started like this (port 3002, never the dev server on 3001):
//   PORT=3002 DB_POOL=on DB_POOL_MAX=1 DB_TIMING_LOG=all node server/index.js > api.log 2>&1
// Then:
//   node test/db/pool-isolation.mjs api.log
// The log is read to see which session served each request and why any
// session was thrown away.

import fs from 'node:fs'

process.env.DB_POOL = 'on'
process.env.DB_POOL_MAX = '1'
const { connect, execute, destroy, ConnectTimeoutError } = await import('../../server/db.js')
const pool = await import('../../server/sessionPool.js')

const API = process.env.API_URL ?? 'http://localhost:3002'
if (/:3001\b/.test(API)) throw new Error('Port 3001 is the dev server. Test on 3002.')
const LOG = process.argv[2]
if (!LOG) throw new Error('Give the test API log file: node test/db/pool-isolation.mjs api.log')

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`)
}
const run = (lease, sqlText) => execute(lease, sqlText)
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

// ---------------------------------------------------------------- part 1: the pool itself
console.log('Part 1: the pool, one session')
{
  const s1 = await pool.borrow()
  const l1 = pool.leaseFor(s1)
  l1.variablesSet = true
  await run(l1, `set (${pool.SESSION_VARIABLES.join(', ')}) = ('ORG-T001', true, true, true, true, 'OFF0008', '', '', '', '')`)
  const [{ V }] = await run(l1, 'select $CURRENT_ORGANISATIONID as V')
  check('variables set on a borrowed session', V === 'ORG-T001', V)
  await pool.giveBack(l1, { reuse: true })
  let lateError = null
  try { await run(l1, 'select 1') } catch (err) { lateError = err.message }
  check('a lease used after its request ended throws', /already been returned/.test(lateError ?? ''), lateError)

  const s2 = await pool.borrow()
  check('the next request gets the same session back', s2.id === s1.id, `${s1.id} then ${s2.id}`)
  const l2 = pool.leaseFor(s2)
  let unsetError = null
  try { await run(l2, 'select $CURRENT_ORGANISATIONID as V') } catch (err) { unsetError = err.message }
  check("the last user's variables are gone (unset, not blank)", /does not exist/i.test(unsetError ?? ''), unsetError)
  let scopedError = null
  try { await run(l2, `select count(*) as N from ILR.LEARNER where ORGANISATIONID = $CURRENT_ORGANISATIONID`) } catch (err) { scopedError = err.message }
  check('  so a scoped query without setting them fails instead of reading anything', /does not exist/i.test(scopedError ?? ''), scopedError)

  await run(l2, 'begin')
  await run(l2, 'select 1')
  await pool.giveBack(l2, { reuse: true })
  const s3 = await pool.borrow()
  check('a session returned inside a transaction is rolled back and thrown away', s3.id !== s2.id, `${s2.id} then ${s3.id}`)
  const l3 = pool.leaseFor(s3)
  const [{ T }] = await run(l3, 'select current_transaction() as T')
  check('  and the new session has no transaction open', T === null, String(T))

  // Waiting respects the time limit: the only session is in use.
  const t0 = Date.now()
  let waitError = null
  try { await pool.borrow(2000) } catch (err) { waitError = err }
  const waited = Date.now() - t0
  check('waiting for a busy session gives up at the time limit (2 s here)', waitError instanceof ConnectTimeoutError && waited >= 1900 && waited < 3000, `${waited} ms: ${waitError?.message}`)
  await pool.giveBack(l3, { reuse: false, why: 'end of part 1' })
  const s4 = await pool.borrow(10000)
  check('  and the next request gets a session once one is free', Boolean(s4), String(s4?.id))
  await pool.giveBack(pool.leaseFor(s4), { reuse: false, why: 'end of part 1' })
}

// ---------------------------------------------------------------- part 2: through the API
console.log('\nPart 2: the test API with a pool of one session')
const USERS = {
  max: { id: 'USR-T0008', url: '/api/learners' },
  nia: { id: 'USR-T0011', url: '/api/learners' },
  hal: { id: 'USR-T0014', url: '/api/learners' },
  alex: { id: 'USR-T0101', url: '/api/burrow/learners' },
  erin: { id: 'USR-T0201', url: '/api/employer/apprentices' },
}
async function get(user, url = USERS[user].url, options = {}) {
  const t0 = Date.now()
  const res = await fetch(API + url, { headers: { Cookie: `dev_user_id=${USERS[user]?.id ?? user}` }, ...options })
  const body = await res.json().catch(() => null)
  const rows = Array.isArray(body) ? body : body?.apprentices
  return { status: res.status, ms: Date.now() - t0, body, refs: rows ? [...new Set(rows.map((r) => r.LEARNREFNUMBER))].sort() : null }
}

// What each user should see, from the tables.
const db = await connect()
const refs = async (sql, binds = []) => (await execute(db, sql, binds)).map((r) => r.R).sort()
const ORG_LEARNERS = `select distinct l.LEARNREFNUMBER as R from ILR.LEARNER l
  join ILR.LEARNING_DELIVERY ld on ld.LEARNREFNUMBER = l.LEARNREFNUMBER and ld.LEARNAIMREF = 'ZPROG001' and ld.AIMSEQNUMBER = 1 and ld.REMOVEDAT is null
  where l.ORGANISATIONID = ? and l.ISTESTDATA`
const expected = {
  max: await refs(ORG_LEARNERS, ['ORG-T001']),
  nia: await refs(ORG_LEARNERS, ['ORG-T002']),
  hal: await refs(`select distinct a.LEARNREFNUMBER as R from ILR.OFFICER_ASSIGNMENT a
    join SHARED_DB.ACCESS.APP_USER u on u.OFFICERREFNUMBER = a.OFFICERREFNUMBER
    join ILR.LEARNING_DELIVERY ld on ld.LEARNREFNUMBER = a.LEARNREFNUMBER and ld.LEARNAIMREF = 'ZPROG001' and ld.AIMSEQNUMBER = 1 and ld.REMOVEDAT is null
    where u.USERID = 'USR-T0014' and a.ENDEDAT is null`),
  alex: ['TESTL0001'],
  erin: await refs(`select distinct e.LEARNREFNUMBER as R from ILR.LEARNER_EMPLOYER e join SHARED_DB.ACCESS.APP_USER u on u.EMPLOYERID = e.EMPLOYERID
    where u.USERID = 'USR-T0201' and (e.TODATE is null or e.TODATE >= current_date())`),
}
await destroy(db)
check('the five users have different learners to see', expected.max.length > 20 && expected.nia.length > 0 && !expected.nia.some((r) => expected.max.includes(r)) &&
  expected.hal.length > 0 && expected.hal.every((r) => expected.max.includes(r)) && expected.erin.length > 0,
  Object.entries(expected).map(([u, r]) => `${u} ${r.length}`).join(', '))

// One at a time first.
for (const user of Object.keys(USERS)) {
  const r = await get(user)
  check(`${user} sees exactly their own learners`, r.status === 200 && same(r.refs, expected[user]), `${r.status} ${r.refs?.length} of ${expected[user].length}`)
}

// All at once, repeated: every request waits for the one session.
const ROUNDS = 8
let wrong = 0, notOk = 0, slowest = 0
const order = Object.keys(USERS)
for (let round = 0; round < ROUNDS; round++) {
  order.push(order.shift()) // a different first user each round
  const results = await Promise.all(order.flatMap((user) => [get(user), get(user)]).map((p, i) => p.then((r) => ({ ...r, user: order[i >> 1] }))))
  for (const r of results) {
    slowest = Math.max(slowest, r.ms)
    if (r.status !== 200) notOk++
    else if (!same(r.refs, expected[r.user])) { wrong++; console.log(`  ${r.user} saw ${r.refs.length} learners, expected ${expected[r.user].length}`) }
  }
}
check(`${ROUNDS} rounds of 10 requests at once from all five: each sees only their own`, wrong === 0 && notOk === 0, `${wrong} wrong, ${notOk} not 200, slowest ${slowest} ms`)

// An inactive user on the session Max just used is still refused: the
// user and their roles are looked up on every request.
const dee = await get('USR-T0010', '/api/learners')
const maxAfter = await get('max')
check("Dee (inactive) is refused on Max's session, and Max is fine after", dee.status === 403 && /access has ended/.test(dee.body?.error ?? '') && same(maxAfter.refs, expected.max), `${dee.status} ${dee.body?.error}`)

// More at once than the one session can serve in 10 seconds: the ones that
// can't get it in time are told to try again, and none hangs.
const burst = await Promise.all(Array.from({ length: 40 }, (_, i) => get(order[i % 5]).then((r) => ({ ...r, user: order[i % 5] }))))
const served = burst.filter((r) => r.status === 200)
const told = burst.filter((r) => r.status === 503)
const longest = Math.max(...burst.map((r) => r.ms))
check('40 at once: each is served correctly or told to try again (503), none hangs', served.length + told.length === 40 && served.every((r) => same(r.refs, expected[r.user])) && longest < 20000,
  `${served.length} served, ${told.length} told to try again, longest ${longest} ms`)
check('  the ones told to try again waited about the 10-second limit, no longer', told.every((r) => r.ms >= 9500 && r.ms < 15000) && /Please try again/.test(told[0]?.body?.error ?? 'Please try again'),
  told.length ? `${Math.min(...told.map((r) => r.ms))}-${Math.max(...told.map((r) => r.ms))} ms` : 'none needed')

// A request the browser abandons mid-query: its session is thrown away.
// The ILR return takes about a second of work after signing in; the test
// gives up part way through, and only counts a try where the log shows it
// gave up after signing in, while the route was working.
let thrownAway = null, nextLine = null, next = null, tries = []
for (const delay of [900, 700, 1100, 800, 1000]) {
  const before = fs.readFileSync(LOG, 'utf8').length
  const controller = new AbortController()
  const abandoned = get('max', '/api/ilr/return', { signal: controller.signal }).catch((err) => ({ aborted: err.name }))
  setTimeout(() => controller.abort(), delay)
  await abandoned
  await new Promise((r) => setTimeout(r, 2500))
  next = await get('max')
  await new Promise((r) => setTimeout(r, 500))
  const logged = fs.readFileSync(LOG, 'utf8').slice(before)
  const gaveUp = logged.match(/\[timing\] .*GET \/api\/ilr\/return USR-T0008 .*sign-in=\d+ms work=\d+ms .*session=(\d+).*\(the browser gave up before the response\)/)
  tries.push(`${delay} ms: ${gaveUp ? 'gave up mid-work' : 'not mid-work'}`)
  if (!gaveUp) continue
  thrownAway = logged.match(new RegExp(`\\[pool\\] \\S+ session ${gaveUp[1]} thrown away: the browser gave up before the response`))
  nextLine = [...logged.matchAll(/\[timing\] .*GET \/api\/learners USR-T0008 .*session=(\d+) \((new|reused)\)/g)].at(-1)
  break
}
check('a request abandoned mid-query has its session thrown away', Boolean(thrownAway), thrownAway?.[0] ?? tries.join(', '))
check('  and the next request gets a new session', nextLine && thrownAway && nextLine[2] === 'new' && same(next.refs, expected.max), nextLine?.[0]?.slice(-60) ?? tries.join(', '))

// The log shows the one session really was shared.
const all = fs.readFileSync(LOG, 'utf8')
const reused = (all.match(/session=\d+ \(reused\)/g) ?? []).length
const opened = (all.match(/session=\d+ \(new\)/g) ?? []).length
check('requests really shared sessions (from the log)', reused > 50, `${reused} reused, ${opened} new`)

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
