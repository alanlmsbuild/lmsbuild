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
// 14. Companies House data. RAW (responses as returned) is add-only: the
//    app only ever writes insert into RAW.x. EXT (cleaned company details)
//    is shared across organisations, so nothing shown may come from it:
//    SQL may only insert into or merge into an EXT table (adverts, below,
//    excepted), and only
//    server/companiesHouse.js may read one company by its number (where
//    COMPANYNUMBER = ?, nothing else) to log changes. access.js never names
//    RAW or EXT. Screens use each employer's own copy (COMPANYDETAILS)
//    through ORG_EMPLOYER, which must remove the registered office
//    (MANAGER_ONLY_COMPANY_COLUMNS) for everyone but managers, and SQL
//    marked "-- all organisations" must not read COMPANYDETAILS. Adverts
//    (SHARED_DB.EXT.VACANCY, SHARED_DB.EXT.VACANCY_IMPORT_RUN) are public and the same for every
//    organisation: the app may read them, never write them (the import does).
// 15. The nightly Companies House refresh (scripts/refresh-companies.js)
//    works across every organisation without a signed-in user, so it stays
//    out of the app: nothing in server/ or src/ imports it, and its own SQL
//    names no table but ILR.EMPLOYER, reads only EMPLOYERID,
//    ORGANISATIONID, COMPANYNUMBER and COMPANYDETAILS, and sets only NAME
//    and the company copy (COMPANYDETAILS, COMPANYCHECKEDAT,
//    COMPANYRESPONSEID).
// 16. Employer contacts' Burrow access fails closed. In access.js,
//    EMPLOYER_LINKS keeps its two routes exactly (head office: an active
//    user with ISHEADOFFICE = true; sites: an active user with a current
//    assignment, ENDEDAT is null, to a site of the same employer), and
//    VISIBLE_LEARNER and EMPLOYER_APPRENTICE both use it. Anywhere,
//    ISHEADOFFICE is only ever compared "= true" (never coalesce, nvl,
//    "is not false" or "<> false"), and only access.js reads APP_USER_SITE.
//    Sites and contacts are read through ORG_EMPLOYER_SITE and
//    ORG_EMPLOYER_CONTACT (check 1) and inserted with the user's ISTESTDATA
//    (check 3).
// 17. The vacancy import (scripts/import-vacancies.js) runs without a
//    signed-in user, so it stays out of the app too: nothing in server/ or
//    src/ imports it, and its SQL names no table but SHARED_DB.RAW.FAA_VACANCY_PAGE,
//    SHARED_DB.EXT.VACANCY and SHARED_DB.EXT.VACANCY_IMPORT_RUN (no organisation's data).
// 18. Links from adverts to employers (ILR.EMPLOYER_VACANCY) are one
//    organisation's own: outside access.js they're read only through
//    ORG_EMPLOYER_VACANCY, and the table is named only to write to it
//    (insert into, merge into, update), in SQL that sets or matches the
//    signed-in user's organisation (CURRENT_ORGANISATIONID) and, for new
//    rows, their ISTESTDATA (CURRENT_ISTESTDATA).
// 19. Skills England's standards and occupations are the same for every
//    organisation, loaded by the import (scripts/import-skills.js), which
//    runs without a signed-in user: nothing in server/ or src/ imports it or
//    writes SKILLS or SHARED_DB.RAW.SE_* (insert into, merge into, update), and the
//    import's SQL names only SKILLS and SHARED_DB.RAW.SE_* tables.
// 20. The scheduler and the job records (scripts/jobs.js, job-run.js,
//    check-jobs.js) stay out of the app: nothing in server/ or src/ imports
//    them, and nothing there writes OPS (insert into, merge into, update).
//    The app only reads SHARED_DB.OPS.JOB_RUN, for when data was last updated.
//
// Usage:
//   npm run check:scoping

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server')
const RAW_TABLE =
  /\b(from|join|update)\s+((ILR\.)?(LEARNER|OFFICER|EMPLOYER|EMPLOYER_SITE|EMPLOYER_CONTACT|OFFICER_ASSIGNMENT|LEARNER_EMPLOYER|LEARNER_OFFICER|PRIOR_ATTAINMENT|LLDD_HEALTH_PROBLEM|LEARNER_FAM|EMPLOYMENT_STATUS|EMPLOYMENT_STATUS_MONITORING|LEARNING_DELIVERY_FAM|APP_FIN_RECORD|HOURS_RECORD)|(?:SHARED_DB\.)?ACCESS\.\w+)\b/i
const SCOPED = /\$\{(ORG_|VISIBLE_|EMPLOYER_APPRENTICE)\w*\}|\$\{IN_(ORG|VISIBLE)_LEARNERS\}|-- all organisations/
const WHOLE_ORG = /\$\{(ORG_LEARNER|IN_ORG_LEARNERS)\}/
const MANAGER_ONLY_COLUMNS = ['NINUMBER', 'ETHNICITY']
const READS_MANAGER_ONLY = new RegExp(`\\b(${MANAGER_ONLY_COLUMNS.join('|')})\\b|select\\s+(\\w+\\.)?\\*`, 'i')
// Tables whose rows belong to the organisation or a user: ISTESTDATA is
// the signed-in user's.
const TEST_DATA_TABLE = /\binsert\s+into\s+((ILR\.)?(LEARNER|OFFICER|EMPLOYER|EMPLOYER_SITE|EMPLOYER_CONTACT)|(?:SHARED_DB\.)?ACCESS\.\w+)\b/i
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

// Check 14 on one SQL string: what it does wrong with RAW or EXT.
const ONE_COMPANY = /^\s+(?:as\s+)?(?:\w+\s+)?where\s+(?:\w+\.)?COMPANYNUMBER\s*=\s*\?(?![^`]*\b(or|like|ilike|rlike|regexp|in)\b)/i
export function layerProblems(sql, file = 'companiesHouse.js') {
  const found = []
  for (const m of sql.matchAll(/\b(\w+\s+\w+\s+)?(?:SHARED_DB\.)?RAW\.(\w+)/gi)) {
    if (!/^insert\s+into\s+$/i.test(m[1] ?? '')) found.push(`uses RAW.${m[2]} other than insert into: RAW is add-only`)
  }
  for (const m of sql.matchAll(/\b(\w+)(\s+\w+)?\s+(?:SHARED_DB\.)?EXT\.(\w+)\b/gi)) {
    const before = `${m[1]}${m[2] ?? ''}`.toLowerCase().replace(/\s+/g, ' ')
    // Adverts are public and the same for every organisation: the app may
    // read them, but only the import (scripts/) writes them.
    if (/^VACANCY(_IMPORT_RUN)?$/i.test(m[3])) {
      if (/(^|\s)(into|update)$/.test(before)) found.push(`writes EXT.${m[3]}: only the vacancy import writes adverts`)
      continue
    }
    if (before === 'insert into' || before === 'merge into') continue
    const after = sql.slice(m.index + m[0].length)
    if (file === 'companiesHouse.js' && /(^|\s)from$/.test(before) && ONE_COMPANY.test(after)) continue
    found.push(`reads EXT.${m[3]}: EXT is shared across organisations, so show the employer's own copy (COMPANYDETAILS) from ORG_EMPLOYER`)
  }
  return found
}

// Check 15 on the nightly refresh's own SQL: what it does beyond ILR.EMPLOYER's
// company columns.
const NIGHTLY_READS = new Set(['EMPLOYERID', 'ORGANISATIONID', 'COMPANYNUMBER', 'COMPANYDETAILS'])
const NIGHTLY_SETS = new Set(['NAME', 'COMPANYDETAILS', 'COMPANYCHECKEDAT', 'COMPANYRESPONSEID'])
export function nightlyProblems(sql) {
  const found = []
  for (const m of sql.matchAll(/\b(from|join|update|into)\s+([\w.$]+)/gi)) {
    if (!/^(ILR\.)?EMPLOYER$/i.test(m[2])) found.push(`names ${m[2]}: the nightly refresh may only use ILR.EMPLOYER`)
  }
  const select = sql.match(/\bselect\s+([\s\S]*?)\s+from\b/i)
  if (select) {
    for (const col of select[1].split(',')) {
      const name = col.trim().match(/^(?:to_json\()?(\w+)\)?(?:\s+as\s+\w+)?$/i)?.[1]?.toUpperCase()
      if (!name || !NIGHTLY_READS.has(name)) found.push(`reads ${col.trim()}: the nightly refresh reads only ${[...NIGHTLY_READS].join(', ')}`)
    }
  }
  const set = sql.match(/\bset\s+([\s\S]*?)\s+where\b/i)
  if (set) {
    for (const m of set[1].matchAll(/(?:^|,)\s*(\w+)\s*=/g)) {
      if (!NIGHTLY_SETS.has(m[1].toUpperCase())) found.push(`sets ${m[1]}: the nightly refresh sets only ${[...NIGHTLY_SETS].join(', ')}`)
    }
  }
  return found
}

// Check 16 on access.js's text: what's wrong with the employer contacts' rule.
const LINKS_REQUIRED = [
  'join SHARED_DB.ACCESS.APP_USER u\n        on u.USERID = $CURRENT_USERID and u.EMPLOYERID = le.EMPLOYERID and u.ISACTIVE and u.ISHEADOFFICE = true',
  'join ILR.EMPLOYER_SITE s on s.SITEID = le.SITEID and s.EMPLOYERID = le.EMPLOYERID',
  'join SHARED_DB.ACCESS.APP_USER_SITE a on a.SITEID = s.SITEID and a.USERID = $CURRENT_USERID and a.ENDEDAT is null',
  'join SHARED_DB.ACCESS.APP_USER u on u.USERID = a.USERID and u.EMPLOYERID = le.EMPLOYERID and u.ISACTIVE',
]
export function employerRuleProblems(text) {
  const found = []
  const start = text.indexOf('const EMPLOYER_LINKS = `')
  const end = text.indexOf(')`', start)
  const links = start >= 0 && end > start ? text.slice(start, end) : ''
  if (!links) return ['EMPLOYER_LINKS is missing']
  for (const part of LINKS_REQUIRED) if (!links.includes(part)) found.push(`EMPLOYER_LINKS no longer has: ${part.replace(/\s+/g, ' ')}`)
  if ((links.match(/\bunion\b/gi) ?? []).length !== 1) found.push('EMPLOYER_LINKS must be exactly two routes joined by one union')
  if ((links.match(/where le\.EMPLOYERID = \$APPRENTICES_OF_EMPLOYERID and \(le\.TODATE is null or le\.TODATE >= current_date\(\)\)/g) ?? []).length !== 2) {
    found.push("both EMPLOYER_LINKS routes must keep to the user's own employer's current links")
  }
  if (/\bor\b/i.test(links.replace(/le\.TODATE is null or le\.TODATE/g, ''))) found.push('EMPLOYER_LINKS has an "or" that could widen a route')
  for (const name of ['VISIBLE_LEARNER', 'EMPLOYER_APPRENTICE']) {
    const s = text.indexOf(`export const ${name} = \``)
    const e = text.indexOf(')`', s)
    if (s < 0 || !text.slice(s, e).includes('LEARNREFNUMBER in ${EMPLOYER_LINKS}')) found.push(`${name} no longer uses EMPLOYER_LINKS`)
  }
  const others = [...text.matchAll(/\$APPRENTICES_OF_EMPLOYERID/g)].filter((m) => m.index < start || m.index > end)
  if (others.length > 0) found.push('$APPRENTICES_OF_EMPLOYERID is used outside EMPLOYER_LINKS')
  return found
}
// Anywhere: ISHEADOFFICE only as "= true".
export function headOfficeProblems(text) {
  const found = []
  for (const m of text.matchAll(/ISHEADOFFICE\b(?!\s*=\s*true\b)/gi)) found.push(m.index)
  return found
}

// Check 18 on one SQL string from server/ (not access.js).
export function vacancyLinkProblems(sql) {
  const found = []
  for (const m of sql.matchAll(/\b(\w+\s+\w+\s+|\w+\s+)?(?:ILR\.)?EMPLOYER_VACANCY\b/gi)) {
    const before = (m[1] ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
    const write = /^(insert into|merge into|update)$/.test(before) || /(^|\s)update$/.test(before)
    if (!write) {
      found.push('reads ILR.EMPLOYER_VACANCY directly: use ORG_EMPLOYER_VACANCY')
      continue
    }
    if (!sql.includes('${CURRENT_ORGANISATIONID}')) found.push("writes ILR.EMPLOYER_VACANCY without the signed-in user's organisation (CURRENT_ORGANISATIONID)")
    if (/insert|merge/.test(before) && !sql.includes('${CURRENT_ISTESTDATA}')) found.push('adds to ILR.EMPLOYER_VACANCY without setting ISTESTDATA (CURRENT_ISTESTDATA)')
  }
  return found
}

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
    for (const message of layerProblems(sql, file)) report(file, text, match.index, message)
    for (const message of vacancyLinkProblems(sql)) report(file, text, match.index, message)
    if (/-- all organisations/.test(sql) && /\bCOMPANYDETAILS\b/i.test(sql)) {
      report(file, text, match.index, 'reads COMPANYDETAILS around ORG_EMPLOYER, which hides the registered office from all but managers')
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

// Check 14 in access.js: no RAW or EXT, and ORG_EMPLOYER masks the
// registered office and is the only read of ILR.EMPLOYER.
{
  const text = fs.readFileSync(path.join(serverDir, 'access.js'), 'utf8')
  for (const m of text.matchAll(/\b(RAW|EXT)\.\w+/g)) report('access.js', text, m.index, `${m[0]}: access.js never reads RAW or EXT`)
  const start = text.indexOf('export const ORG_EMPLOYER = `')
  const end = text.indexOf(')`', start)
  const source = start >= 0 && end > start ? text.slice(start, end) : ''
  const reads = [...text.matchAll(/\b(from|join)\s+ILR\.EMPLOYER\b/gi)]
  const ok = source.includes('iff($SEES_MANAGER_ONLY, COMPANYDETAILS,') &&
    source.includes('object_delete(COMPANYDETAILS::object, ${MANAGER_ONLY_COMPANY_COLUMNS') &&
    reads.length === 1 && reads[0].index > start && reads[0].index < end
  if (!ok) report('access.js', text, Math.max(start, 0), 'ILR.EMPLOYER must be read only in ORG_EMPLOYER, removing MANAGER_ONLY_COMPANY_COLUMNS from COMPANYDETAILS for all but managers')
  const list = text.match(/MANAGER_ONLY_COMPANY_COLUMNS = \[([^\]]*)\]/)?.[1] ?? ''
  for (const column of ['ADDRESSPREMISES', 'ADDRESSLINE1', 'ADDRESSLINE2', 'ADDRESSLOCALITY', 'ADDRESSREGION', 'ADDRESSPOSTCODE', 'ADDRESSCOUNTRY', 'ADDRESSPOBOX', 'ADDRESSCAREOF']) {
    if (!list.includes(`'${column}'`)) report('access.js', text, text.indexOf('MANAGER_ONLY_COMPANY_COLUMNS'), `${column} is no longer in MANAGER_ONLY_COMPANY_COLUMNS`)
  }
}

// Check 15: the nightly refresh stays out of the app, and keeps to the
// employer's company columns.
{
  const repo = path.join(serverDir, '..')
  const appFiles = [
    ...fs.readdirSync(serverDir, { recursive: true }).map((f) => ['server', f]),
    ...fs.readdirSync(path.join(repo, 'src'), { recursive: true }).map((f) => ['src', f]),
  ].filter(([, f]) => /\.(js|jsx|mjs)$/.test(f))
  for (const [area, f] of appFiles) {
    const text = fs.readFileSync(path.join(repo, area, f), 'utf8')
    const m = text.match(/\b(import|from|import\()\s*['"`][^'"`]*refresh-companies/)
    if (m) {
      console.log(`${area}/${f.split(path.sep).join('/')}:${text.slice(0, m.index).split('\n').length}  imports the nightly refresh, which works across every organisation: the app must not`)
      problems++
    }
  }
  const nightly = fs.readFileSync(path.join(repo, 'scripts', 'refresh-companies.js'), 'utf8')
  for (const match of nightly.matchAll(/`[^`]*`/g)) {
    if (!/\b(select|update|insert|merge|delete)\b/i.test(match[0])) continue
    for (const message of nightlyProblems(match[0])) {
      console.log(`scripts/refresh-companies.js:${nightly.slice(0, match.index).split('\n').length}  ${message}`)
      problems++
    }
  }
}

// Check 16: employer contacts' Burrow access fails closed.
{
  const accessText = fs.readFileSync(path.join(serverDir, 'access.js'), 'utf8')
  for (const message of employerRuleProblems(accessText)) report('access.js', accessText, accessText.indexOf('const EMPLOYER_LINKS'), message)
  for (const file of [...serverFiles, 'access.js']) {
    const text = fs.readFileSync(path.join(serverDir, file), 'utf8')
    for (const index of headOfficeProblems(text)) report(file, text, index, 'ISHEADOFFICE is only ever compared "= true", so a missing or false flag never grants access')
    if (file !== 'access.js') {
      for (const m of text.matchAll(/\bAPP_USER_SITE\b/g)) report(file, text, m.index, 'only access.js (EMPLOYER_LINKS) reads APP_USER_SITE')
    }
  }
}

// Check 17: the vacancy import stays out of the app, and keeps to its own
// tables.
{
  const repo = path.join(serverDir, '..')
  const IMPORT_TABLES = new Set(['SHARED_DB.RAW.FAA_VACANCY_PAGE', 'SHARED_DB.EXT.VACANCY', 'SHARED_DB.EXT.VACANCY_IMPORT_RUN'])
  for (const [area, f] of [
    ...fs.readdirSync(serverDir, { recursive: true }).map((x) => ['server', x]),
    ...fs.readdirSync(path.join(repo, 'src'), { recursive: true }).map((x) => ['src', x]),
  ].filter(([, x]) => /\.(js|jsx|mjs)$/.test(x))) {
    const text = fs.readFileSync(path.join(repo, area, f), 'utf8')
    const m = text.match(/\b(import|from|import\()\s*['"`][^'"`]*import-vacancies/)
    if (m) {
      console.log(`${area}/${f.split(path.sep).join('/')}:${text.slice(0, m.index).split('\n').length}  imports the vacancy import, which runs without a signed-in user: the app must not`)
      problems++
    }
  }
  const importer = fs.readFileSync(path.join(repo, 'scripts', 'import-vacancies.js'), 'utf8')
  for (const sql of importer.matchAll(/`[^`]*`/g)) {
    if (!/\b(select|update|insert|merge|delete)\b/i.test(sql[0])) continue
    for (const m of sql[0].matchAll(/\b(?:from|join|update|into)\s+([A-Za-z_][\w.$]*)/gi)) {
      if (['table', 'set', 'select'].includes(m[1].toLowerCase()) || IMPORT_TABLES.has(m[1])) continue
      console.log(`scripts/import-vacancies.js:${importer.slice(0, sql.index).split('\n').length}  names ${m[1]}: the vacancy import uses only ${[...IMPORT_TABLES].join(', ')}`)
      problems++
    }
  }
}

// Check 19: only the Skills England import writes SKILLS, and it keeps to
// SKILLS and SHARED_DB.RAW.SE_*.
{
  const repo = path.join(serverDir, '..')
  for (const [area, f] of [
    ...fs.readdirSync(serverDir, { recursive: true }).map((x) => ['server', x]),
    ...fs.readdirSync(path.join(repo, 'src'), { recursive: true }).map((x) => ['src', x]),
  ].filter(([, x]) => /\.(js|jsx|mjs)$/.test(x))) {
    const text = fs.readFileSync(path.join(repo, area, f), 'utf8')
    const where = (i) => `${area}/${f.split(path.sep).join('/')}:${text.slice(0, i).split('\n').length}`
    const m = text.match(/\b(import|from|import\()\s*['"`][^'"`]*import-skills/)
    if (m) {
      console.log(`${where(m.index)}  imports the Skills England import, which runs without a signed-in user: the app must not`)
      problems++
    }
    for (const w of text.matchAll(/\b(?:into|update)\s+(?:(?:CAPTURE|SHARED)_DB\.)?(SKILLS\.\w+|RAW\.SE_\w+)/gi)) {
      console.log(`${where(w.index)}  writes ${w[1]}: only scripts/import-skills.js writes Skills England's data`)
      problems++
    }
  }
  const importer = fs.readFileSync(path.join(repo, 'scripts', 'import-skills.js'), 'utf8')
  for (const sql of importer.matchAll(/`[^`]*`/g)) {
    if (!/\b(select|update|insert|merge|delete)\b/i.test(sql[0])) continue
    for (const m of sql[0].matchAll(/\b(?:from|join|update|into|using)\s+([A-Za-z_][\w.$]*)/gi)) {
      const name = m[1].replace(/^(CAPTURE|SHARED)_DB\./i, '')
      if (['table', 'set', 'select', 'lateral'].includes(name.toLowerCase()) || /^(SKILLS\.(\w+|\$)|RAW\.SE_\w+)$/.test(name)) continue
      if (!name.includes('.')) continue // a CTE or alias in the import's own SQL
      console.log(`scripts/import-skills.js:${importer.slice(0, sql.index).split('\n').length}  names ${m[1]}: the Skills England import uses only SKILLS and SHARED_DB.RAW.SE_* tables`)
      problems++
    }
  }
}

// Check 20: the scheduler and job records stay out of the app, which only
// reads OPS.
{
  const repo = path.join(serverDir, '..')
  for (const [area, f] of [
    ...fs.readdirSync(serverDir, { recursive: true }).map((x) => ['server', x]),
    ...fs.readdirSync(path.join(repo, 'src'), { recursive: true }).map((x) => ['src', x]),
  ].filter(([, x]) => /\.(js|jsx|mjs)$/.test(x))) {
    const text = fs.readFileSync(path.join(repo, area, f), 'utf8')
    const where = (i) => `${area}/${f.split(path.sep).join('/')}:${text.slice(0, i).split('\n').length}`
    const m = text.match(/\b(import|from|import\()\s*['"`][^'"`]*scripts\/(jobs|job-run|check-jobs)(\.js)?['"`]/)
    if (m) {
      console.log(`${where(m.index)}  imports the scheduler or its job records, which run without a signed-in user: the app must not`)
      problems++
    }
    for (const w of text.matchAll(/\b(?:into|update)\s+(?:(?:CAPTURE|SHARED)_DB\.)?(OPS\.\w+)/gi)) {
      console.log(`${where(w.index)}  writes ${w[1]}: only the jobs (scripts/job-run.js) write OPS`)
      problems++
    }
  }
}

if (problems > 0) {
  console.log(`\n${problems} ${problems === 1 ? 'problem' : 'problems'}. See the rules in server/access.js.`)
  process.exit(1)
}
console.log('Every query on organisation data is scoped, learner lookups go through the one learner scope, NI number and ethnicity are for managers only, the ILR return is managers only, the QAR spreadsheet has no NI number, ethnicity, prices or payments, prices and payments are managers only, every route says which roles can use it, every insert sets ISTESTDATA (a learner\'s records copy the learner\'s), removed ILR records are left out, no query keeps session state, transactions only go through inTransaction, every session variable is in SESSION_VARIABLES, the programme aim is always the current one, RAW is add-only, nothing shown comes from the shared Companies House tables, and the nightly refresh stays out of the app and keeps to employers\' company columns, employer contacts see only head office\'s or their own sites\' apprentices, the vacancy import stays out of the app, links to adverts are the organisation\'s own, only the Skills England import writes SKILLS, and the scheduler stays out of the app.')
