// Test: the Ofqual register fetch (scripts/fetch-official.js fetchOfqual):
// the page size, and the checks that stop a short, changed or shrunken
// register being saved. Fake pages in a test folder; no network, no Snowflake.
//   node test/ofqual-fetch.mjs
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchOfqual, OFQUAL_PAGE_LIMIT, ofqualProblems } from '../scripts/fetch-official.js'
import { officialSteps2 } from '../scripts/load/official2.js'
import { OFQUAL_PERSONAL_FIELDS, withoutPersonalFields } from '../scripts/load/ofqual.js'
import { stripSavedOrganisations } from '../scripts/strip-ofqual-contacts.js'

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
console.log('Organisations: contact details are dropped')
const org = (n, extra = {}) => ({ name: `Awarding Org ${n}`, recognitionNumber: `RN${5000 + n}`, legalName: `Awarding Org ${n} Limited`, acronym: `AO${n}`, ofqualOrganisationStatus: 'Recognised',
  ofqualRecognisedOn: '2021-12-09T12:10:23Z', cceaOrganisationStatus: 'Never been recognised', website: `https://ao${n}.example`, feesUrl: null, canonicalUrl: `https://register-api.example/api/Organisations/RN${5000 + n}`,
  lastUpdatedDate: '2025-12-03T18:18:35Z', contactEmail: `person${n}@example.org`, phoneNumber: '07700 900123', addressLine1: '1 Some Lane', addressLine2: 'Hamlet', addressCity: 'Town', addressCounty: 'County', addressCountry: 'United Kingdom', addressPostCode: 'AB1 2CD', ...extra })
const KEPT = ['name', 'recognitionNumber', 'legalName', 'acronym', 'ofqualOrganisationStatus', 'ofqualRecognisedOn', 'cceaOrganisationStatus', 'website', 'feesUrl', 'canonicalUrl', 'lastUpdatedDate']
const orgApi = (records) => ({ getJson: async (url) => { const u = new URL(url); const page = Number(u.searchParams.get('page')); const limit = Number(u.searchParams.get('limit')); return { count: records.length, currentPage: page, limit, results: records.slice((page - 1) * limit, page * limit) } } })
check('the fields dropped are the email, phone and the whole postal address', OFQUAL_PERSONAL_FIELDS.join() === 'contactEmail,phoneNumber,addressLine1,addressLine2,addressCity,addressCounty,addressCountry,addressPostCode')
{
  const r = withoutPersonalFields(org(1))
  check('withoutPersonalFields keeps the rest and leaves the argument alone', KEPT.every((k) => k in r) && OFQUAL_PERSONAL_FIELDS.every((k) => !(k in r)) && 'contactEmail' in org(1) && Object.keys(r).length === KEPT.length, Object.keys(r).join())
}
{
  const root = fresh('org-fetch')
  const out = await fetchOfqual('Organisations', { root, log: quiet, ...orgApi([org(1), org(2), org(3)]) })
  const text = fs.readFileSync(out, 'utf8')
  const saved = text.split('\n').filter(Boolean).map((l) => JSON.parse(l))
  check('organisations are saved without contact details', saved.length === 3 && saved.every((r) => OFQUAL_PERSONAL_FIELDS.every((k) => !(k in r))) && !/@example\.org|07700|Some Lane|AB1 2CD/.test(text))
  check('  everything else is kept as published', saved.every((r, i) => KEPT.every((k) => r[k] === org(i + 1)[k])))
}
{
  // The last file was saved before the change (still has the details): not a field change.
  const root = fresh('org-prev')
  fs.mkdirSync(path.join(root, 'ofqual'), { recursive: true })
  fs.writeFileSync(path.join(root, 'ofqual', 'ofqual_organisations_2026-10-21.jsonl'), [org(1), org(2)].map((r) => JSON.stringify(r)).join('\n') + '\n')
  const out = await fetchOfqual('Organisations', { root, log: quiet, ...orgApi([org(1), org(2), org(3)]) })
  check('a last file saved with the details does not trip the field check', out !== null)
}
{
  const root = fresh('qual-untouched')
  const q = register(5, { contactEmail: 'x@example.org', addressLine1: 'kept: qualifications are not touched' })
  const out = await fetchOfqual('Qualifications', { root, log: quiet, getJson: api(q).getJson })
  check('qualifications are not touched', /kept: qualifications are not touched/.test(fs.readFileSync(out, 'utf8')))
}
{
  // The loader (step 27) drops them again from any file, and says so in SOURCE_FILE.
  const R = fresh('org-load')
  fs.mkdirSync(path.join(R, 'ofqual'), { recursive: true })
  fs.writeFileSync(path.join(R, 'ofqual', 'ofqual_organisations_2026-10-13.jsonl'), [org(1), org(2)].map((r) => JSON.stringify(r)).join('\n') + '\n')
  fs.writeFileSync(path.join(R, 'ofqual', 'ofqual_qualifications_2026-10-13.jsonl'), register(2).map((r) => JSON.stringify(r)).join('\n') + '\n')
  const specs = []
  const rowsOf = {}
  const loader = { loadJsonLines: async (spec) => { specs.push(spec); rowsOf[spec.table] = await spec.rows(spec.originals[0]); return [] } }
  await officialSteps2(R)[27].run(loader)
  const orgs = specs.find((x) => x.table.endsWith('OFQUAL_ORGANISATION'))
  const quals = specs.find((x) => x.table.endsWith('OFQUAL_QUALIFICATION'))
  check('step 27: organisation rows lose the details on the way in', rowsOf[orgs.table].length === 2 && rowsOf[orgs.table].every((r) => OFQUAL_PERSONAL_FIELDS.every((k) => !(k in r.item)) && r.item.recognitionNumber), JSON.stringify(Object.keys(rowsOf[orgs.table][0].item)))
  check('  SOURCE_FILE will say columns-removed, name them, and not stage the original', orgs.kind === 'columns-removed' && orgs.removed.join() === OFQUAL_PERSONAL_FIELDS.join() && orgs.stageOriginal === false)
  check('  qualifications are loaded as they are, original staged', !quals.kind && !quals.removed && quals.stageOriginal !== false && rowsOf[quals.table][0].item.title)
}
{
  const dirOld = fresh('org-clean')
  const f = path.join(dirOld, 'ofqual_organisations_2026-10-13.jsonl')
  fs.writeFileSync(f, [org(1), org(2)].map((r) => JSON.stringify(r)).join('\n') + '\n')
  fs.writeFileSync(path.join(dirOld, 'ofqual_qualifications_2026-10-13.jsonl'), register(2, { contactEmail: 'untouched' }).map((r) => JSON.stringify(r)).join('\n') + '\n')
  const when = new Date('2026-10-13T22:52:00Z')
  fs.utimesSync(f, when, when)
  const first = stripSavedOrganisations(dirOld)
  const text = fs.readFileSync(f, 'utf8')
  check('the saved-file cleaner removes the details from organisation files only', first.length === 1 && first[0].stripped === 2 && !/@example\.org|07700|AB1 2CD/.test(text) && /untouched/.test(fs.readFileSync(path.join(dirOld, 'ofqual_qualifications_2026-10-13.jsonl'), 'utf8')))
  check('  keeps the file date, and is safe to run again', fs.statSync(f).mtime.getTime() === when.getTime() && stripSavedOrganisations(dirOld)[0].stripped === 0 && fs.readFileSync(f, 'utf8') === text)
}
console.log(failures ? `\n${failures} FAILED` : '\nAll passed')
process.exit(failures ? 1 : 0)
