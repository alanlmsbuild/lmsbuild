// check-sign-in.js - checks test sign-in against every API route.
//
// Starts the API server twice on a spare port (CHECK_PORT, default 3002;
// never the dev server's 3001) and sends requests to every route in
// server/ (subfolders too), found the same way as npm run check:scoping, so new routes
// are covered without changing this file.
//
// With TEST_SIGN_IN=true:
//   1. Max's cookie (USR-T0008) gets in to /api/me: the cookie works, so
//      the refusals below mean something.
//   2. Every route refuses Dee's cookie (USR-T0010, an inactive test user)
//      with 403 "Your access has ended", before the route runs.
//   3. Every route refuses a request with no cookie (401, signed out), and
//      one with a cookie for a user who doesn't exist (401).
// With TEST_SIGN_IN not set:
//   4. Every route refuses Max's cookie as signed out (401): the cookie is
//      ignored.
//   5. The test sign-in routes (/api/dev/...) answer 404, so /sign-in
//      lists nobody.
//
// Every refused request stops in attachUser (server/access.js), before any
// route's own code, so nothing is written. Needs the Snowflake connection
// in server/.env.
//
// Usage:
//   npm run check:sign-in

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const serverDir = path.join(root, 'server')
const PORT = process.env.CHECK_PORT || '3002'
if (PORT === '3001') throw new Error('Port 3001 is the dev server. Pick another CHECK_PORT.')
const BASE = `http://localhost:${PORT}`

const MAX = 'USR-T0008' // Max Testmanager01, manager, active
const DEE = 'USR-T0010' // Dee Testinactive01, tutor, access ended
const NOBODY = 'USR-NOSUCHUSER'

// ---------------------------------------------------------------- the routes

const ROUTE = /\bapp\.(get|post|put|patch|delete)\(\s*(['`"])([^'`"]*)\2/g
const ANY_ROUTE = /\bapp\.(get|post|put|patch|delete)\(/g

const routes = []
let unreadable = 0
// Every .js file under server/, including subfolders such as server/ilr/.
const serverFiles = fs.readdirSync(serverDir, { recursive: true })
  .map((f) => f.split(path.sep).join('/'))
  .filter((f) => f.endsWith('.js'))
for (const file of serverFiles) {
  const text = fs.readFileSync(path.join(serverDir, file), 'utf8')
  const found = [...text.matchAll(ROUTE)]
  for (const m of found) routes.push({ method: m[1].toUpperCase(), path: m[3], file })
  // A route whose path isn't written out can't be checked here.
  const all = [...text.matchAll(ANY_ROUTE)].length
  if (all !== found.length) {
    console.log(`FAIL server/${file}: ${all - found.length} route(s) without a written-out path, which this check can't try`)
    unreadable++
  }
}
const devRoutes = routes.filter((r) => r.path.startsWith('/api/dev/'))
const apiRoutes = routes.filter((r) => r.path.startsWith('/api/') && !r.path.startsWith('/api/dev/'))
const otherRoutes = routes.filter((r) => !r.path.startsWith('/api/'))

// Fills in route parameters (:ref, *rest) with a made-up value.
function concrete(p) {
  return p.replace(/:(\w+)/g, 'CHECK-$1').replace(/\*(\w+)/g, 'check')
}

// ---------------------------------------------------------------- the server

function startServer(testSignIn) {
  return new Promise((resolve, reject) => {
    // dotenv doesn't replace variables that are already set, so these win
    // over server/.env.
    const env = { ...process.env, PORT, TEST_SIGN_IN: testSignIn ? 'true' : '' }
    const child = spawn(process.execPath, [path.join(serverDir, 'index.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    const timer = setTimeout(() => reject(new Error(`The server didn't start:\n${output}`)), 30000)
    const onData = (d) => {
      output += d
      if (output.includes('listening')) {
        clearTimeout(timer)
        resolve(child)
      }
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`The server stopped (exit ${code}):\n${output}`))
    })
  })
}

async function stopServer(child) {
  child.removeAllListeners('exit')
  const exited = new Promise((resolve) => child.on('exit', resolve))
  child.kill()
  await exited
}

async function request(route, userId) {
  const headers = { 'Content-Type': 'application/json' }
  if (userId) headers.Cookie = `dev_user_id=${encodeURIComponent(userId)}`
  const init = { method: route.method, headers }
  if (!['GET', 'DELETE'].includes(route.method)) init.body = '{}'
  const res = await fetch(BASE + concrete(route.path), init)
  let body = null
  try {
    body = await res.json()
  } catch {
    // not JSON
  }
  return { status: res.status, body }
}

// ---------------------------------------------------------------- the checks

let failures = unreadable
function check(label, ok, detail = '') {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? `\n       ${detail}` : ''}`)
}

// Runs the requests a few at a time, and lists the routes that failed.
async function everyRoute(label, userId, expect) {
  const wrong = []
  const queue = [...apiRoutes]
  async function worker() {
    for (let route = queue.shift(); route; route = queue.shift()) {
      const r = await request(route, userId)
      if (!expect(r)) wrong.push(`${route.method} ${route.path} (server/${route.file}) -> ${r.status} ${JSON.stringify(r.body)}`)
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()])
  check(`${label}: all ${apiRoutes.length} routes`, wrong.length === 0, wrong.join('\n       '))
}

console.log(`${apiRoutes.length} API routes and ${devRoutes.length} test sign-in routes in server/`)
check('every route is under /api', otherRoutes.length === 0, otherRoutes.map((r) => `${r.method} ${r.path}`).join(', '))

let server = await startServer(true)
try {
  console.log('\nWith TEST_SIGN_IN=true')
  const users = await request({ method: 'GET', path: '/api/dev/users' })
  const dee = users.body?.users?.find((u) => u.USERID === DEE)
  check(`${DEE} (Dee) is an inactive test user`, dee && dee.ISACTIVE === false, JSON.stringify(dee))

  const max = await request({ method: 'GET', path: '/api/me' }, MAX)
  check(`${MAX} (Max) is signed in by the cookie`, max.status === 200 && max.body?.USERID === MAX, JSON.stringify(max))

  await everyRoute("Dee's cookie is refused (403, access ended)", DEE, (r) => r.status === 403 && /access has ended/.test(r.body?.error))
  await everyRoute('no cookie is signed out (401)', null, (r) => r.status === 401 && r.body?.signedIn === false)
  await everyRoute("an unknown user's cookie is refused (401)", NOBODY, (r) => r.status === 401)
} finally {
  await stopServer(server)
}

server = await startServer(false)
try {
  console.log('\nWith TEST_SIGN_IN not set')
  await everyRoute("Max's cookie is ignored: signed out (401)", MAX, (r) => r.status === 401 && r.body?.signedIn === false)
  const wrong = []
  for (const route of devRoutes) {
    const r = await request(route, MAX)
    if (r.status !== 404) wrong.push(`${route.method} ${route.path} -> ${r.status}`)
  }
  check(`the ${devRoutes.length} test sign-in routes answer 404 (nobody to pick)`, wrong.length === 0, wrong.join(', '))
} finally {
  await stopServer(server)
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll sign-in checks passed.')
process.exit(failures ? 1 : 0)
