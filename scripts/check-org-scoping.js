// check-org-scoping.js - finds server SQL that reads a table holding
// organisation data without going through the organisation-scoped sources
// in server/access.js.
//
// Usage:
//   npm run check:scoping
//
// Looks at every template literal in server/*.js (except access.js). One
// that names LEARNER, OFFICER, EMPLOYER, OFFICER_ASSIGNMENT,
// LEARNER_EMPLOYER, LEARNER_OFFICER or an ACCESS table after from, join or
// update passes only if it also uses an ORG_ source or IN_ORG_LEARNERS, or
// says "-- all organisations" to show it's meant to (with a reason nearby).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server')
const RAW_TABLE =
  /\b(from|join|update)\s+((ILR\.)?(LEARNER|OFFICER|EMPLOYER|OFFICER_ASSIGNMENT|LEARNER_EMPLOYER|LEARNER_OFFICER)|ACCESS\.\w+)\b/i
const SCOPED = /\$\{ORG_\w+\}|\$\{IN_ORG_LEARNERS\}|-- all organisations/

let problems = 0
for (const file of fs.readdirSync(serverDir).filter((f) => f.endsWith('.js') && f !== 'access.js')) {
  const text = fs.readFileSync(path.join(serverDir, file), 'utf8')
  for (const match of text.matchAll(/`[^`]*`/g)) {
    const sql = match[0]
    const raw = sql.match(RAW_TABLE)
    if (raw && !SCOPED.test(sql)) {
      const line = text.slice(0, match.index).split('\n').length
      console.log(`server/${file}:${line}  reads ${raw[2]} without organisation scoping`)
      problems++
    }
  }
}

if (problems > 0) {
  console.log(`\n${problems} unscoped ${problems === 1 ? 'query' : 'queries'}. Use the ORG_ sources in server/access.js.`)
  process.exit(1)
}
console.log('Every query on organisation data is scoped.')
