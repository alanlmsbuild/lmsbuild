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
// 3. An insert that doesn't mark test data. Organisation-level rows
//    (learners, officers, employers, users) take ${CURRENT_ISTESTDATA},
//    the signed-in user's. A learner's records (aims, assignments, the ILR
//    record tables and ILR.RECORD_CHANGE) copy the learner's own flag:
//    select l.ISTESTDATA from ${VISIBLE_LEARNER} l, so the test reset
//    finds every one of them.
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
// 9. Reads of the ILR record tables and aims leave out records removed as
//    entered in error: REMOVEDAT is null for each table read, by its alias
//    if it has one. A query that must see removed records too (the next aim
//    number, so a removed aim's number is never reused) says why with
//    "-- including removed:".
// 10. No session state that could outlive a request (sessions can be
//    reused between requests and users, server/sessionPool.js): no
//    LAST_QUERY_ID, RESULT_SCAN, ALTER SESSION, USE, or temporary tables.
// 11. No hand-written transactions: begin, commit and rollback only in
//    inTransaction (server/burrow.js) and the pool's clean-up, so a failed
//    request always rolls back.
// 13. The programme aim is the learner's current one, never a fixed number:
//    no AIMSEQNUMBER = 1 (or === 1, or a key of AIMSEQNUMBER: 1, or an
//    insert writing 1 as the aim number) in server/ or src/, and no picking
//    the programme with find(a => a.AIMTYPE === 1): use CURRENT_PROGRAMME
//    (server/access.js) or currentProgramme() (src/programme.js). A learner
//    who returned from a break has more than one programme aim. SQL using
//    CURRENT_PROGRAMME, which covers every learner, must also use a scoped
//    source.
// 12. Every session variable a query reads ($NAME) is in SESSION_VARIABLES
//    (server/sessionPool.js), the list that's set on every request and
//    unset when a reused session comes back.
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
// Tables whose rows belong to the organisation or a user: ISTESTDATA is
// the signed-in user's.
const TEST_DATA_TABLE = /\binsert\s+into\s+((ILR\.)?(LEARNER|OFFICER|EMPLOYER)|ACCESS\.\w+)\b/i
// Tables whose rows belong to a learner: ISTESTDATA is the learner's, taken
// from VISIBLE_LEARNER in the insert itself.
const LEARNER_RECORD_TABLES = ['LEARNING_DELIVERY', 'OFFICER_ASSIGNMENT', 'LEARNER_EMPLOYER', 'PRIOR_ATTAINMENT',
  'LLDD_HEALTH_PROBLEM', 'LEARNER_FAM', 'EMPLOYMENT_STATUS', 'EMPLOYMENT_STATUS_MONITORING', 'LEARNING_DELIVERY_FAM',
  'APP_FIN_RECORD', 'HOURS_RECORD', 'RECORD_CHANGE']
const LEARNER_RECORD_INSERT = new RegExp(`\\binsert\\s+into\\s+(ILR\\.)?(${LEARNER_RECORD_TABLES.join('|')})\\b`, 'i')
const FROM_LEARNER_FLAG = /\b\w+\.ISTESTDATA\s+from\s+\$\{VISIBLE_LEARNER\}/i
// The ILR record tables where a manager can remove a record entered in
// error: reads must leave removed ones out.
const REMOVABLE_TABLES = ['LEARNING_DELIVERY', 'PRIOR_ATTAINMENT', 'LLDD_HEALTH_PROBLEM', 'LEARNER_FAM', 'EMPLOYMENT_STATUS',
  'EMPLOYMENT_STATUS_MONITORING', 'LEARNING_DELIVERY_FAM', 'APP_FIN_RECORD', 'HOURS_RECORD']
const SQL_WORDS = new Set(['where', 'on', 'left', 'right', 'inner', 'outer', 'full', 'cross', 'join', 'order', 'group',
  'limit', 'union', 'set', 'using', 'having', 'qualify', 'natural'])
const READS_REMOVABLE = new RegExp(`\\b(from|join)\\s+(ILR\\.)?(${REMOVABLE_TABLES.join('|')})\\b(?:\\s+(?:as\\s+)?(\\w+))?`, 'gi')
// The removable tables a query reads that it doesn't filter for REMOVEDAT
// is null (by alias, or unqualified when the table has none).
function unfilteredRemovable(sql) {
  if (sql.includes('-- including removed:')) return []
  const missing = []
  for (const m of sql.matchAll(READS_REMOVABLE)) {
    const alias = m[4] && !SQL_WORDS.has(m[4].toLowerCase()) ? m[4] : null
    const filter = alias
      ? new RegExp(`\\b${alias}\\.REMOVEDAT\\s+is\\s+null\\b`, 'i')
      : new RegExp(`(?:^|[^.\\w])(?:(?:ILR\\.)?${m[3]}\\.)?REMOVEDAT\\s+is\\s+null\\b`, 'i')
    if (!filter.test(sql)) missing.push(alias ? `${m[3]} ${alias}` : m[3])
  }
  return missing
}
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
    const learnerInsert = sql.match(LEARNER_RECORD_INSERT)
    if (learnerInsert && !FROM_LEARNER_FLAG.test(sql)) {
      report(file, text, match.index, `inserts into ${learnerInsert[2]} without copying the learner's ISTESTDATA (select l.ISTESTDATA from \${VISIBLE_LEARNER} l)`)
    }
    for (const table of unfilteredRemovable(sql)) {
      report(file, text, match.index, `reads ${table} without leaving out removed records (REMOVEDAT is null)`)
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
    // The table's name as a quoted label (in the change history), not SQL.
    if (/'$/.test(before) && text[m.index + m[0].length] === "'") continue
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

// Checks 10, 11 and 12, in every server file (access.js too).
{
  const SESSION_STATE = /\b(last_query_id|result_scan|alter\s+session|use\s+(role|warehouse|database|schema|secondary)|create\s+(or\s+replace\s+)?(temp|temporary)\b)/i
  const TRANSACTION = /\bexecute\([^,]+,\s*(['`"])\s*(begin|commit|rollback)\b/i
  const TRANSACTION_ALLOWED = { 'burrow.js': 'export async function inTransaction', 'sessionPool.js': 'export async function giveBack' }
  const poolText = fs.readFileSync(path.join(serverDir, 'sessionPool.js'), 'utf8')
  const known = new Set((poolText.match(/SESSION_VARIABLES = \[([^\]]*)\]/)?.[1] ?? '').match(/[A-Z_]+/g) ?? [])
  if (known.size === 0) report('sessionPool.js', poolText, 0, 'SESSION_VARIABLES not found')
  for (const file of [...serverFiles, 'access.js']) {
    const text = fs.readFileSync(path.join(serverDir, file), 'utf8')
    for (const match of text.matchAll(/`[^`]*`|'[^'\n]*'/g)) {
      const state = match[0].match(SESSION_STATE)
      if (state) report(file, text, match.index, `uses ${state[1]}, which keeps session state a reused session would carry to the next user`)
      for (const v of match[0].matchAll(/\$([A-Z][A-Z0-9_]{2,})\b/g)) {
        if (!known.has(v[1])) report(file, text, match.index, `reads session variable $${v[1]}, which isn't in SESSION_VARIABLES (sessionPool.js)`)
      }
    }
    for (const m of text.matchAll(new RegExp(TRANSACTION, 'gi'))) {
      const allowedIn = TRANSACTION_ALLOWED[file]
      const owner = allowedIn ? text.lastIndexOf(allowedIn, m.index) : -1
      const inside = owner >= 0 && !/\n(export )?(async )?function /.test(text.slice(owner + allowedIn.length, m.index))
      if (!inside) report(file, text, m.index, `runs ${m[2]} by hand: use inTransaction (server/burrow.js)`)
    }
  }
}

// Check 13, in server/ and src/.
{
  const srcDir = path.join(serverDir, '..', 'src')
  const FIXED_AIM = [
    [/\bAIMSEQNUMBER\s*={1,3}\s*1\b/g, 'picks aim number 1'],
    [/\bAIMSEQNUMBER:\s*1\b/g, 'records aim number 1'],
    [/\bselect\s+(\?,\s*)?l\.LEARNREFNUMBER,\s*1,/gi, 'writes aim number 1'],
    [/\.find\(\s*\(?\w+\)?\s*=>\s*\w+\.AIMTYPE\s*===\s*1\s*\)/g, 'picks the first programme aim'],
  ]
  const files = [
    ...serverFiles.concat('access.js').map((f) => ['server', path.join(serverDir, f), f]),
    ...fs.readdirSync(srcDir, { recursive: true }).map((f) => f.split(path.sep).join('/'))
      .filter((f) => /\.(js|jsx)$/.test(f) && f !== 'programme.js').map((f) => ['src', path.join(srcDir, f), f]),
  ]
  for (const [area, full, file] of files) {
    const text = fs.readFileSync(full, 'utf8')
    for (const [pattern, what] of FIXED_AIM) {
      for (const m of text.matchAll(pattern)) {
        const line = text.slice(0, m.index).split('\n').length
        console.log(`${area}/${file}:${line}  ${what}: use the current programme aim (CURRENT_PROGRAMME or currentProgramme())`)
        problems++
      }
    }
    if (area === 'server' && file !== 'access.js') {
      for (const match of text.matchAll(/`[^`]*`/g)) {
        if (match[0].includes('${CURRENT_PROGRAMME}') && !SCOPED.test(match[0])) {
          report(file, text, match.index, 'reads CURRENT_PROGRAMME (every learner) without organisation scoping')
        }
      }
    }
  }
}

if (problems > 0) {
  console.log(`\n${problems} ${problems === 1 ? 'problem' : 'problems'}. See the rules in server/access.js.`)
  process.exit(1)
}
console.log('Every query on organisation data is scoped, learner lookups go through the one learner scope, NI number and ethnicity are for managers only, the ILR return is managers only, the QAR spreadsheet has no NI number, ethnicity, prices or payments, prices and payments are managers only, every route says which roles can use it, every insert sets ISTESTDATA (a learner\'s records copy the learner\'s), removed ILR records are left out, no query keeps session state, transactions only go through inTransaction, every session variable is in SESSION_VARIABLES, and the programme aim is always the current one.')
