// check-sql.js - catches the SQL files a Snowflake worksheet's Run All would
// split in the wrong place. Read-only; no connection.
//
// A worksheet splits a file into statements itself, and inside a
// dollar-quoted block ($$ ... $$: procedures, EXECUTE IMMEDIATE) it counts a
// plain apostrophe in a -- comment as a quote. With an odd number the block
// runs on into the next statements: on 13 October 2026 the test reset
// failed ("syntax error ... line 142") and flow_01's procedures were never
// created. The same text runs fine through the driver, so only this check
// catches it.
//
// Fails if, in any sql/*.sql file:
//   1. a -- comment inside a dollar-quoted block has a plain apostrophe
//      (reword it, or use a typographic one: ’)
//   2. a -- comment anywhere contains $$ (it could start a block)
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
  let inBlock = false
  text.split('\n').forEach((line, i) => {
    const c = line.indexOf('--')
    const code = c < 0 ? line : line.slice(0, c)
    const comment = c < 0 ? '' : line.slice(c)
    if (comment.includes('$$')) problems.push({ line: i + 1, problem: 'a comment contains $$' })
    if (inBlock && comment.includes("'")) problems.push({ line: i + 1, problem: 'a plain apostrophe in a comment inside a $$ block' })
    if ((code.match(/\$\$/g) ?? []).length % 2 === 1) inBlock = !inBlock
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
  console.log(count ? `\n${count} problem(s): a worksheet's Run All would split these files in the wrong place.` : `${files.length} SQL files checked: none would be split in the wrong place by a worksheet's Run All.`)
  process.exit(count ? 1 : 0)
}
