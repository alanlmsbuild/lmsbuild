// Test: the Ofqual register fetch (scripts/fetch-official.js fetchOfqual):
// the page size, and the checks that stop a short, changed or shrunken
// register being saved. Fake pages in a test folder; no network, no Snowflake.
//   node test/ofqual-fetch.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchOfqual, OFQUAL_PAGE_LIMIT, ofqualProblems } from '../scripts/fetch-official.js'

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`)
}
const quiet = () => {}
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '.output', 'ofqual-test')
const fresh = (name) => { const r = path.join(dir, name); fs.rmSync(r, { recursive: true, force: true }); fs.mkdirSync(r, { recursive: true }); return r }
const qual = (n, extra = {}) => ({ qualificationNumber: `600/${String(n).padStart(4, '0')}/0`, title: `Qualification ${n}`, level: 'Level 2', ...extra })
const register = (n, extra) => Array.from({ length: n }, (_, i) => qual(i + 1, extra))
// A fake API: pages of `limit` from `records`, counting the calls and the URLs.
const api = (records, { count = records.length, shortAfter = Infinity, countChanges = false } = {}) => {
  const calls = []
  const getJson = async (url) => {
    calls.push(url)
    const u = new URL(url)
    const page = Number(u.searchParams.get('page'))
    const limit = Number(u.searchParams.get('limit'))
    let results = records.slice((page - 1) * limit, page * limit)
    if (page > shortAfter) results = []
    return { count: countChanges && page > 1 ? count + 1 : count, currentPage: page, limit, results }
  }
  return { getJson, calls }
}
const lines = (root, what = 'qualifications') => fs.readdirSync(path.join(root, 'ofqual')).filter((n) => n.startsWith(`ofqual_${what}_`)).sort()
const seed = (root, records, date = '2026-10-01') => { fs.mkdirSync(path.join(root, 'ofqual'), { recursive: true }); fs.writeFileSync(path.join(root, 'ofqual', `ofqual_qualifications_${date}.jsonl`), records.map((r) => JSON.stringify(r)).join('\n') + '\n') }
const fails = async (fn) => { try { await fn(); return null } catch (e) { return e.message } }

console.log('Page size and paging')
check('the page limit is the API maximum, 10,000', OFQUAL_PAGE_LIMIT === 10000)
{
  const root = fresh('paging')
  const a = api(register(25000))
  const out = await fetchOfqual('Qualifications', { root, log: quiet, getJson: a.getJson })
  const written = fs.readFileSync(out, 'utf8').split('\n').filter(Boolean)
  check('25,000 records: 3 calls at limit=10000, all saved in order', a.calls.length === 3 && a.calls.every((u) => u.endsWith('limit=10000')) && written.length === 25000 && JSON.parse(written[24999]).qualificationNumber === '600/25000/0', `${a.calls.length} calls, ${written.length} lines`)
}
{
  const root = fresh('exact')
  const a = api(register(20000))
  const out = await fetchOfqual('Qualifications', { root, log: quiet, getJson: a.getJson })
  check('exactly two full pages: two calls, no third', a.calls.length === 2 && fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).length === 20000, `${a.calls.length} calls`)
}

console.log('Completeness')
{
  const root = fresh('short')
  const a = api(register(15000), { count: 15500, shortAfter: 1 })
  const msg = await fails(() => fetchOfqual('Qualifications', { root, log: quiet, getJson: a.getJson }))
  check('a page that comes back empty early is an error, not a smaller file', /fetched 10000 records but the API says 15500/.test(msg ?? '') && !/ACCEPT_CHANGES/.test(msg), msg)
  check('  and nothing is written', !fs.existsSync(path.join(root, 'ofqual')) || lines(root).length === 0)
}
{
  const root = fresh('changing')
  const a = api(register(15000), { countChanges: true })
  const msg = await fails(() => fetchOfqual('Qualifications', { root, log: quiet, getJson: a.getJson }))
  check('the register changing between pages is an error', /changed while it was being fetched/.test(msg ?? ''), msg)
}
{
  const root = fresh('repeat')
  const records = register(100); records[50] = qual(10)
  const msg = await fails(() => fetchOfqual('Qualifications', { root, log: quiet, getJson: api(records).getJson }))
  check('a repeated QAN is an error', /1 repeated and 0 missing qualificationNumber/.test(msg ?? ''), msg)
}
{
  const root = fresh('missingkey')
  const records = register(10); delete records[3].qualificationNumber
  const msg = await fails(() => fetchOfqual('Qualifications', { root, log: quiet, getJson: api(records).getJson }))
  check('a record with no QAN is an error', /0 repeated and 1 missing qualificationNumber/.test(msg ?? ''), msg)
}

console.log('Format and size against the last file')
{
  const root = fresh('same')
  seed(root, register(1000))
  const out = await fetchOfqual('Qualifications', { root, log: quiet, getJson: api([...register(1000), qual(1001)]).getJson })
  check('one more record, same fields: saved as a new file', out && lines(root).length === 2)
  const again = await fetchOfqual('Qualifications', { root, log: quiet, getJson: api([...register(1000), qual(1001)]).getJson })
  check('  fetched again unchanged: no new file', again === null && lines(root).length === 2)
}
{
  const root = fresh('fields')
  seed(root, register(1000))
  const records = register(1000, { gradingScale: 'A-E' })
  const msg = await fails(() => fetchOfqual('Qualifications', { root, log: quiet, getJson: api(records).getJson }))
  check('a new field is an error, naming it', /fields changed \(added: gradingScale; removed: none\)/.test(msg ?? '') && /OFQUAL_ACCEPT_CHANGES=1/.test(msg ?? ''), msg)
  check('  and nothing new is written', lines(root).length === 1)
  const out = await fetchOfqual('Qualifications', { root, log: quiet, getJson: api(records).getJson, acceptChanges: true })
  check('  accepted when told to (OFQUAL_ACCEPT_CHANGES=1)', out && lines(root).length === 2)
}
{
  const root = fresh('removed')
  seed(root, register(1000))
  const records = register(1000).map(({ level, ...rest }) => rest)
  const msg = await fails(() => fetchOfqual('Qualifications', { root, log: quiet, getJson: api(records).getJson }))
  check('a removed field is an error, naming it', /added: none; removed: level/.test(msg ?? ''), msg)
}
{
  const root = fresh('shrink')
  seed(root, register(1000))
  const msg = await fails(() => fetchOfqual('Qualifications', { root, log: quiet, getJson: api(register(940)).getJson }))
  check('6% fewer records is an error', /shrank from 1000 to 940/.test(msg ?? ''), msg)
  const ok = await fetchOfqual('Qualifications', { root, log: quiet, getJson: api(register(960)).getJson })
  check('  4% fewer is fine', ok !== null)
}
{
  const p = ofqualProblems('Organisations', [{ recognitionNumber: 'RN1' }, { recognitionNumber: 'RN2' }], 2, [{ recognitionNumber: 'RN1' }, { recognitionNumber: 'RN2' }])
  check('organisations are keyed on the recognition number, and unchanged is clean', p.length === 0, p.join('; '))
  const q = ofqualProblems('Organisations', [{ recognitionNumber: 'RN1' }, { recognitionNumber: 'RN1' }], 2, null)
  check('  a repeated recognition number is caught', q.length === 1 && /1 repeated and 0 missing recognitionNumber/.test(q[0]), q.join('; '))
}
console.log(failures ? `\n${failures} FAILED` : '\nAll passed')
process.exit(failures ? 1 : 0)
