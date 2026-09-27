// check-org-scoping.js - finds server code that skips the access rules in
// server/access.js. Three checks:
//
// 1. SQL that reads a table holding organisation data without going
//    through the scoped sources. Every template literal in server/*.js
//    (except access.js) that names LEARNER, OFFICER, EMPLOYER,
//    OFFICER_ASSIGNMENT, LEARNER_EMPLOYER, LEARNER_OFFICER or an ACCESS
//    table after from, join or update passes only if it also uses an ORG_
//    or VISIBLE_ source or IN_ORG_LEARNERS, or says "-- all organisations"
//    to show it's meant to (with a reason nearby).
// 2. A route that doesn't say which roles may use it: every app.get, post,
//    put, patch or delete must have allow(...) straight after its path.
// 3. An insert into a table with an ISTESTDATA column that doesn't write
//    ${CURRENT_ISTESTDATA}, so test users' records are marked as test data.
//
// Usage:
//   npm run check:scoping

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server')
const RAW_TABLE =
  /\b(from|join|update)\s+((ILR\.)?(LEARNER|OFFICER|EMPLOYER|OFFICER_ASSIGNMENT|LEARNER_EMPLOYER|LEARNER_OFFICER)|ACCESS\.\w+)\b/i
const SCOPED = /\$\{(ORG_|VISIBLE_)\w+\}|\$\{IN_ORG_LEARNERS\}|-- all organisations/
const TEST_DATA_TABLE =
  /\binsert\s+into\s+((ILR\.)?(LEARNER|LEARNING_DELIVERY|OFFICER|OFFICER_ASSIGNMENT|EMPLOYER|LEARNER_EMPLOYER)|ACCESS\.\w+)\b/i
const ROUTE = /\bapp\.(get|post|put|patch|delete)\(\s*(['`"])[^'`"]*\2\s*,(?!\s*allow\()/g

let problems = 0
function report(file, text, index, message) {
  const line = text.slice(0, index).split('\n').length
  console.log(`server/${file}:${line}  ${message}`)
  problems++
}

for (const file of fs.readdirSync(serverDir).filter((f) => f.endsWith('.js') && f !== 'access.js')) {
  const text = fs.readFileSync(path.join(serverDir, file), 'utf8')
  for (const match of text.matchAll(/`[^`]*`/g)) {
    const sql = match[0]
    const raw = sql.match(RAW_TABLE)
    if (raw && !SCOPED.test(sql)) {
      report(file, text, match.index, `reads ${raw[2]} without organisation scoping`)
    }
    const insert = sql.match(TEST_DATA_TABLE)
    if (insert && !sql.includes('${CURRENT_ISTESTDATA}')) {
      report(file, text, match.index, `inserts into ${insert[1]} without setting ISTESTDATA`)
    }
  }
  for (const match of text.matchAll(ROUTE)) {
    report(file, text, match.index, 'route has no allow(...) saying which roles can use it')
  }
}

if (problems > 0) {
  console.log(`\n${problems} ${problems === 1 ? 'problem' : 'problems'}. See the rules in server/access.js.`)
  process.exit(1)
}
console.log('Every query on organisation data is scoped, every route says which roles can use it, and every insert sets ISTESTDATA.')
