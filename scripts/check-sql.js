// check-sql.js - catches SQL files that would fail, or be misread, when Alan
// runs them in a Snowflake worksheet with Run All. Read-only; no
// connection.
//
// On 13 October 2026 flow_01's procedures failed in the worksheet
// ("syntax error line 148 at position 0 unexpected 'COMMENT'"): their
// COMMENT clause came after EXECUTE AS OWNER, which Snowflake rejects. The
// scratch dry runs had run only the procedure bodies, so they missed it.
// While finding that, the files were also made worksheet-proof: no comments
// inside dollar-quoted blocks, so nothing in a block can be misread.
//
// Fails if, in any sql/*.sql file:
//   1. a comment (-- or /* */) is inside a dollar-quoted block ($$ ... $$:
//      procedure bodies, EXECUTE IMMEDIATE): explain the steps above the
//      block instead
//   2. a comment contains $$ (it could look like the start of a block)
//   3. a CREATE PROCEDURE or FUNCTION has its COMMENT clause after EXECUTE
//      AS (Snowflake: "unexpected 'COMMENT'")
//   4. a Snowflake Scripting block (DECLARE, a bare BEGIN, or EXECUTE
//      IMMEDIATE without $$) is outside a dollar-quoted block: a worksheet
//      only sends a scripting block whole when it is between $$ and $$
//   5. a query (SELECT, INSERT, UPDATE, DELETE, MERGE, CALL, COPY, WITH,
//      EXECUTE IMMEDIATE) comes before any USE WAREHOUSE: a fresh worksheet
//      has none, and stops with "No active warehouse selected" (13 October
//      2026, journeys_01b). Definitions (tables, views, procedures, grants)
//      need no warehouse.
//
//   npm run check:sql

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SQL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sql')

// The problems in one file's text, as { line, problem }. Exported so it can
// be tried on made-up text.
export function sqlProblems(text) {
  const problems = []
  const add = (line, problem) => problems.push({ line, problem })
  let inBlock = false
  let inQuote = false
  let header = null // a CREATE PROCEDURE or FUNCTION, until its AS
  let definition = false // inside a CREATE statement, until its ;
  let warehouse = false
  let queryReported = false
  text.split('\n').forEach((line, i) => {
    const n = i + 1
    const startedInBlock = inBlock
    // Split the line into code and comment, minding quoted strings ('' is a
    // quote inside a string) outside dollar-quoted blocks.
    let code = ''
    let comment = ''
    for (let j = 0; j < line.length; j++) {
      const two = line.slice(j, j + 2)
      if (!inQuote && two === '$$') { inBlock = !inBlock; code += two; j++; continue }
      if (!inBlock && line[j] === "'") { inQuote = !inQuote; code += line[j]; continue }
      if (!inQuote && (two === '--' || two === '/*')) { comment = line.slice(j); break }
      code += line[j]
    }
    if (comment && (startedInBlock || inBlock)) add(n, 'a comment inside a $$ block: explain the steps above the block instead')
    if (comment.includes('$$')) add(n, 'a comment contains $$')
    const upper = code.trim().toUpperCase()
    if (!startedInBlock && !inBlock) {
      if (/^CREATE\s+(OR\s+REPLACE\s+)?(SECURE\s+)?(PROCEDURE|FUNCTION)\b/.test(upper)) header = { executeAs: false }
      if (header) {
        if (/^EXECUTE\s+AS\b/.test(upper)) header.executeAs = true
        if (/^COMMENT\s*=/.test(upper) && header.executeAs) add(n, 'COMMENT comes after EXECUTE AS: Snowflake rejects that order (put COMMENT first)')
      }
      if (/^DECLARE\b/.test(upper) || /^BEGIN\s*;?$/.test(upper)) add(n, 'a scripting block outside $$: wrap it in EXECUTE IMMEDIATE $$ ... $$')
      if (/^USE\s+WAREHOUSE\b/.test(upper)) warehouse = true
      if (/^CREATE\b/.test(upper)) definition = !/\bAS\s+SELECT\b/.test(upper)
      const query = /^(SELECT|INSERT|UPDATE|DELETE|MERGE|CALL|COPY|WITH|EXECUTE\s+IMMEDIATE)\b/.test(upper)
      if (query && !definition && !warehouse && !queryReported) {
        add(n, 'a query before any USE WAREHOUSE: add USE WAREHOUSE near the top (Snowflake: "No active warehouse selected")')
        queryReported = true
      }
    }
    if (!inBlock && code.includes(';')) definition = false
    if (header && /^AS\b/.test(upper)) header = null
    if (/^EXECUTE\s+IMMEDIATE\b/.test(upper) && !code.includes('$$') && !startedInBlock) add(n, 'EXECUTE IMMEDIATE without $$ on the same line')
  })
  return problems
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const files = fs.readdirSync(SQL).filter((f) => f.endsWith('.sql')).sort()
  let count = 0
  for (const f of files) {
    for (const p of sqlProblems(fs.readFileSync(path.join(SQL, f), 'utf8'))) {
      console.log(`FAIL sql/${f}:${p.line}  ${p.problem}`)
      count++
    }
  }
  console.log(count ? `\n${count} problem(s) a worksheet's Run All would trip over.` : `${files.length} SQL files checked: no comments inside $$ blocks, none containing $$, every COMMENT before EXECUTE AS, every scripting block inside $$, a warehouse before any query.`)
  process.exit(count ? 1 : 0)
}
