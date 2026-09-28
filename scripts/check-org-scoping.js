// check-org-scoping.js - finds server code that skips the access rules in
// server/access.js. Three checks:
//
// 1. SQL that reads a table holding organisation data without going
//    through the scoped sources. Every template literal in server/*.js
//    (except access.js) that names LEARNER, OFFICER, EMPLOYER,
//    OFFICER_ASSIGNMENT, LEARNER_EMPLOYER, LEARNER_OFFICER, one of the ILR
//    return tables (PRIOR_ATTAINMENT, LLDD_HEALTH_PROBLEM, LEARNER_FAM,
//    EMPLOYMENT_STATUS(_MONITORING), LEARNING_DELIVERY_FAM, APP_FIN_RECORD,
//    HOURS_RECORD) or an ACCESS table after from, join or update passes only if it also uses an ORG_
//    or VISIBLE_ source, EMPLOYER_APPRENTICE or IN_ORG_LEARNERS, or says
//    "-- all organisations" to show it's meant to (with a reason nearby).
// 2. A route that doesn't say which roles may use it: every app.get, post,
//    put, patch or delete must have allow(...) straight after its path, or
//    devOnly for the development-only test user switcher.
// 3. An insert into a table with an ISTESTDATA column that doesn't write
//    ${CURRENT_ISTESTDATA}, so test users' records are marked as test data.
// 4. Learner lookups that skip the one learner scope. ORG_LEARNER and
//    IN_ORG_LEARNERS (every learner in the organisation, whoever asks) only
//    in SQL that says why with "-- whole organisation:". Everything else
//    uses VISIBLE_LEARNER or IN_VISIBLE_LEARNERS, so limiting managers to
//    their team (part 8) is one change in access.js.
// 5. Manager-only columns (NI number, ethnicity). In access.js, the only
//    read of ILR.LEARNER must be the one that masks them for everyone but
//    managers, and MANAGER_ONLY_LEARNER_COLUMNS must still list them.
//    Elsewhere, SQL marked "-- all organisations" (which skips the masked
//    sources) must not read them, or select * from the learner table.
// 6. The ILR return is for managers only: every /api/ilr route must be
//    allow(MANAGER) and nothing else.
// 7. The QAR spreadsheet (server/qarExport.js, fed by server/reports.js)
//    never carries NI number, ethnicity, prices or payments: neither file
//    may name NINUMBER, ETHNICITY, APP_FIN_RECORD or an AFIN column, or
//    select * or alias.* from a table or a scoped source (which would pick
//    them up without naming them). select * from a query step (a
//    lower-case with ... as name, built from named columns) is fine.
// 8. Prices and payments are for managers only: outside access.js,
//    APP_FIN_RECORD may only be read through ORG_APP_FIN_RECORD (which is
//    empty for anyone else). Naming the table is only allowed to write to
//    it (insert into / update).
//
// Usage:
//   npm run check:scoping

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server')
const RAW_TABLE =
  /\b(from|join|update)\s+((ILR\.)?(LEARNER|OFFICER|EMPLOYER|OFFICER_ASSIGNMENT|LEARNER_EMPLOYER|LEARNER_OFFICER|PRIOR_ATTAINMENT|LLDD_HEALTH_PROBLEM|LEARNER_FAM|EMPLOYMENT_STATUS|EMPLOYMENT_STATUS_MONITORING|LEARNING_DELIVERY_FAM|APP_FIN_RECORD|HOURS_RECORD)|ACCESS\.\w+)\b/i
const SCOPED = /\$\{(ORG_|VISIBLE_|EMPLOYER_APPRENTICE)\w*\}|\$\{IN_(ORG|VISIBLE)_LEARNERS\}|-- all organisations/
const WHOLE_ORG = /\$\{(ORG_LEARNER|IN_ORG_LEARNERS)\}/
const MANAGER_ONLY_COLUMNS = ['NINUMBER', 'ETHNICITY']
const READS_MANAGER_ONLY = new RegExp(`\\b(${MANAGER_ONLY_COLUMNS.join('|')})\\b|select\\s+(\\w+\\.)?\\*`, 'i')
const TEST_DATA_TABLE =
  /\binsert\s+into\s+((ILR\.)?(LEARNER|LEARNING_DELIVERY|OFFICER|OFFICER_ASSIGNMENT|EMPLOYER|LEARNER_EMPLOYER)|ACCESS\.\w+)\b/i
const ROUTE = /\bapp\.(get|post|put|patch|delete)\(\s*(['`"])[^'`"]*\2\s*,(?!\s*(allow\(|devOnly\b))/g

let problems = 0
function report(file, text, index, message) {
  const line = text.slice(0, index).split('\n').length
  console.log(`server/${file}:${line}  ${message}`)
  problems++
}

// Every .js file under server/, including subfolders such as server/ilr/.
const serverFiles = fs.readdirSync(serverDir, { recursive: true })
  .map((f) => f.split(path.sep).join('/'))
  .filter((f) => f.endsWith('.js') && f !== 'access.js')

for (const file of serverFiles) {
  const text = fs.readFileSync(path.join(serverDir, file), 'utf8')
  for (const match of text.matchAll(/`[^`]*`/g)) {
    const sql = match[0]
    const raw = sql.match(RAW_TABLE)
    if (raw && !SCOPED.test(sql)) {
      report(file, text, match.index, `reads ${raw[2]} without organisation scoping`)
    }
    if (WHOLE_ORG.test(sql) && !sql.includes('-- whole organisation:')) {
      report(file, text, match.index, 'uses every learner in the organisation without "-- whole organisation:" saying why')
    }
    if (raw && /-- all organisations/.test(sql) && /LEARNER\b/i.test(raw[2]) && READS_MANAGER_ONLY.test(sql)) {
      report(file, text, match.index, 'reads manager-only learner columns (or select *) around the masked sources')
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

// Check 6: ILR return routes are managers only.
const ILR_ROUTE = /\bapp\.(get|post|put|patch|delete)\(\s*(['`"])(\/api\/ilr[^'`"]*)\2\s*,\s*allow\(([^)]*)\)/g
for (const file of serverFiles) {
  const text = fs.readFileSync(path.join(serverDir, file), 'utf8')
  for (const m of text.matchAll(/\bapp\.(get|post|put|patch|delete)\(\s*(['`"])(\/api\/ilr[^'`"]*)\2/g)) {
    const withAllow = [...text.matchAll(ILR_ROUTE)].find((r) => r.index === m.index)
    if (!withAllow || withAllow[4].trim() !== 'MANAGER') {
      report(file, text, m.index, `${m[3]} is the ILR return, so it must be allow(MANAGER) only`)
    }
  }
}

// Check 7: nothing manager-only or financial in the QAR spreadsheet.
const QAR_FORBIDDEN = /\b(NINUMBER|ETHNICITY|APP_FIN_RECORD|AFIN[A-Z]*)\b|\b[a-z]\w{0,10}\.\*/gi
for (const file of ['qarExport.js', 'reports.js']) {
  const text = fs.readFileSync(path.join(serverDir, file), 'utf8')
  for (const m of text.matchAll(QAR_FORBIDDEN)) {
    report(file, text, m.index, `"${m[0]}" could put NI number, ethnicity, prices or payments in the QAR spreadsheet`)
  }
  for (const m of text.matchAll(/\bselect\s+\*/gi)) {
    const source = text.slice(m.index).match(/\bfrom\s+(\S+)/i)?.[1] ?? ''
    if (!/^[a-z_][a-z0-9_]*$/.test(source)) {
      report(file, text, m.index, `select * from ${source} could put NI number, ethnicity, prices or payments in the QAR spreadsheet`)
    }
  }
}

// Check 8: prices and payments only through ORG_APP_FIN_RECORD.
for (const file of serverFiles) {
  const text = fs.readFileSync(path.join(serverDir, file), 'utf8')
  for (const m of text.matchAll(/\bAPP_FIN_RECORD\b/g)) {
    const before = text.slice(Math.max(0, m.index - 30), m.index)
    if (/ORG_$/.test(before) || /(insert\s+into|update)\s+(ILR\.)?$/i.test(before)) continue
    if (file === 'qarExport.js' || file === 'reports.js') continue // check 7 reports these
    report(file, text, m.index, 'reads APP_FIN_RECORD directly: use ORG_APP_FIN_RECORD, so prices stay managers only')
  }
}

// Check 5 in access.js itself.
{
  const text = fs.readFileSync(path.join(serverDir, 'access.js'), 'utf8')
  const reads = [...text.matchAll(/\b(from|join)\s+ILR\.LEARNER\b/gi)]
  // LEARNER_ROWS runs from its declaration to the closing ")`".
  const start = text.indexOf('const LEARNER_ROWS = `')
  const end = text.indexOf(')`', start)
  const rows = start >= 0 && end > start ? text.slice(start, end) : ''
  const masked =
    rows.includes('select * replace (${MANAGER_ONLY_LEARNER_COLUMNS') &&
    reads.length === 1 &&
    reads[0].index > start &&
    reads[0].index < end
  if (reads.length !== 1 || !masked) {
    report('access.js', text, reads[1]?.index ?? 0, 'ILR.LEARNER must be read only once, in LEARNER_ROWS, masking MANAGER_ONLY_LEARNER_COLUMNS')
  }
  const list = text.match(/MANAGER_ONLY_LEARNER_COLUMNS = \[([^\]]*)\]/)?.[1] ?? ''
  for (const column of MANAGER_ONLY_COLUMNS) {
    if (!list.includes(`'${column}'`)) {
      report('access.js', text, text.indexOf('MANAGER_ONLY_LEARNER_COLUMNS'), `${column} is no longer in MANAGER_ONLY_LEARNER_COLUMNS`)
    }
  }
}

if (problems > 0) {
  console.log(`\n${problems} ${problems === 1 ? 'problem' : 'problems'}. See the rules in server/access.js.`)
  process.exit(1)
}
console.log('Every query on organisation data is scoped, learner lookups go through the one learner scope, NI number and ethnicity are for managers only, the ILR return is managers only, the QAR spreadsheet has no NI number, ethnicity, prices or payments, prices and payments are managers only, every route says which roles can use it, and every insert sets ISTESTDATA.')
