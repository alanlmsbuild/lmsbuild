// compare-gold-site.js - does gold show the same figures as the school
// leavers app? (the gold plan, 14 October 2026). Rebuilds each
// institution's page data from OPTIONS_DB.GOLD (institution_card,
// institution_result, institution_achievement, national_comparison) in the
// shape of the app's data/institutions/<URN>.json, and compares the two
// field by field. Read-only, as TRANSFORM_USER.
//
//   npm run compare:gold-site [-- <folder of the app's data/institutions>]
//
// The default folder is ../school-leavers-app/data/institutions beside this
// repo. Prints, for each field, how many institutions match and up to three
// examples of each difference. The website is reported on its own: gold's
// is cleaned and link-checked (decision 26), the site's is as GIAS gives it.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, execute, destroy } from '../server/db.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = process.argv[2] ?? path.join(ROOT, '..', 'school-leavers-app', 'data', 'institutions')
const { KINDS, COHORTS } = await import(path.join(dir, '..', '..', 'scripts', 'lib', 'kinds.mjs'))

// The app writes JSON without null values (dropEmpty); compare the same way.
const clean = (x) => (x === null || x === undefined ? null : JSON.parse(JSON.stringify(x, (k, v) => (v === null ? undefined : v)) ?? 'null'))
// Objects compared whatever their key order (Snowflake sorts an object's
// keys); arrays in order.
const sorted = (x) => (Array.isArray(x) ? x.map(sorted) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sorted(x[k])])) : x)
const same = (a, b) => JSON.stringify(sorted(clean(a ?? null))) === JSON.stringify(sorted(clean(b ?? null)))
// Where two values first differ (a path and both sides), for the report.
function firstDifference(a, b, where = '') {
  if (same(a, b)) return null
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of [...new Set([...Object.keys(clean(a) ?? {}), ...Object.keys(clean(b) ?? {})])].sort()) {
      const d = firstDifference(a[k] ?? null, b[k] ?? null, `${where}.${k}`)
      if (d) return d
    }
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    for (let i = 0; i < a.length; i++) { const d = firstDifference(a[i], b[i], `${where}[${i}]`); if (d) return d }
  }
  return { where: where || '(whole)', site: JSON.stringify(clean(a ?? null)).slice(0, 200), gold: JSON.stringify(clean(b ?? null)).slice(0, 200) }
}
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null)

function figure(row) {
  if (!row || !row.STATUS) return null
  if (row.STATUS !== 'shown') return { hidden: row.HIDDEN_REASON }
  const out = { value: row.VALUE_TEXT ?? row.VALUE_NUMBER, base: Number(row.BASE) }
  if (row.SMALL_GROUP) out.small = true
  return out
}

const c = await connect({ as: 'transform', timeoutMs: 30000 })
let cards, results, achievements, national
try {
  cards = await execute(c, 'select * from OPTIONS_DB.GOLD.INSTITUTION_CARD')
  results = await execute(c, 'select * from OPTIONS_DB.GOLD.INSTITUTION_RESULT')
  achievements = await execute(c, 'select * from OPTIONS_DB.GOLD.INSTITUTION_ACHIEVEMENT')
  national = await execute(c, 'select * from OPTIONS_DB.GOLD.NATIONAL_COMPARISON')
} finally {
  await destroy(c)
}

const nat = new Map(national.map((n) => [`${n.ESTABLISHMENT_TYPE}|${n.COHORT}|${n.ACADEMIC_YEAR}`, n]))
const byUrn = (rows) => rows.reduce((m, r) => m.set(r.URN, [...(m.get(r.URN) ?? []), r]), new Map())
const resultsBy = byUrn(results)
const achievementBy = byUrn(achievements)

// One institution from gold, in the site's shape (the fields compared).
function fromGold(card) {
  const kind = KINDS[card.KIND]
  const rows = resultsBy.get(card.URN) ?? []
  const students = rows.filter((r) => r.MEASURE === 'students').sort((a, b) => a.ACADEMIC_YEAR.localeCompare(b.ACADEMIC_YEAR))
    .map((r) => ({ year: r.ACADEMIC_YEAR, ...figure(r) }))
  const res = {}
  for (const cohort of Object.keys(COHORTS)) {
    const years = [...new Set(rows.filter((r) => r.COHORT === cohort).map((r) => r.ACADEMIC_YEAR))].sort()
    if (!years.length) continue
    res[cohort] = years.map((year) => {
      const get = (m) => rows.find((r) => r.COHORT === cohort && r.ACADEMIC_YEAR === year && r.MEASURE === m)
      const va = get('value_added')
      const g = nat.get(`${kind.compare.grades}|${cohort}|${year}`)
      const rt = kind.compare.retention ? nat.get(`${kind.compare.retention}|${cohort}|${year}`) : null
      return {
        year,
        grade: figure(get('grade')),
        best3: cohort === 'A level' ? figure(get('best3')) : null,
        progress: figure(get('progress')),
        va: va ? { value: va.VALUE_NUMBER, low: va.VALUE_LOW, high: va.VALUE_HIGH } : null,
        retained: figure(get('retained')),
        national: { grade: g?.GRADE ?? null, best3: cohort === 'A level' ? g?.BEST3_GRADE ?? null : null, retained: rt?.RETAINED_PERCENT ?? null },
      }
    })
  }
  const ach = achievementBy.get(card.URN) ?? []
  const achieve = (k) => {
    const list = ach.filter((a) => a.KIND === k).sort((a, b) => a.ACADEMIC_YEAR.localeCompare(b.ACADEMIC_YEAR))
    return list.length ? list.map((a) => ({ year: a.ACADEMIC_YEAR, rate: figure(a),
      typical: a.TYPICAL_RATE !== null ? { middle: a.TYPICAL_RATE, providers: Number(a.TYPICAL_PROVIDERS) } : null, providerType: a.PROVIDER_TYPE_WORDS })) : null
  }
  const parse = (v) => (v ? (typeof v === 'string' ? JSON.parse(v) : v) : null)
  return {
    urn: card.URN, ukprn: card.UKPRN, name: card.NAME, kind: card.KIND, kindLabel: card.KIND_LABEL, comparedWith: card.COMPARED_WITH,
    town: card.TOWN ?? '', postcode: card.POSTCODE ?? '', la: card.LOCAL_AUTHORITY_NAME, region: card.REGION_NAME,
    ages: [card.STATUTORY_LOW_AGE === null ? null : Number(card.STATUTORY_LOW_AGE), card.STATUTORY_HIGH_AGE === null ? null : Number(card.STATUTORY_HIGH_AGE)],
    gender: card.GENDER, religion: card.RELIGIOUS_CHARACTER, admissions: card.ADMISSIONS_POLICY, pupils: card.PUPILS === null ? null : Number(card.PUPILS) || null,
    students,
    ofsted: card.OFSTED_FROM ? { from: card.OFSTED_FROM, url: card.OFSTED_URL, renewed: parse(card.OFSTED_RENEWED), original: parse(card.OFSTED_ORIGINAL) } : null,
    results: res,
    achievement: card.UKPRN ? { education: achieve('education'), apprenticeships: achieve('apprenticeships') } : null,
    website: card.WEBSITE_URL,
  }
}

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))
const site = new Map(files.map((f) => { const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); return [j.urn, j] }))
const gold = new Map(cards.map((card) => [card.URN, fromGold(card)]))

const FIELDS = ['ukprn', 'name', 'kind', 'kindLabel', 'comparedWith', 'town', 'postcode', 'la', 'region', 'ages', 'gender', 'religion', 'admissions', 'pupils', 'students', 'ofsted', 'results', 'achievement']
const tally = Object.fromEntries(FIELDS.map((f) => [f, { match: 0, differ: 0, examples: [] }]))
let website = { same: 0, differ: 0, examples: [] }
for (const [urn, s] of site) {
  const g = gold.get(urn)
  if (!g) continue
  for (const f of FIELDS) {
    const a = f === 'town' || f === 'postcode' ? s[f] || '' : s[f]
    const b = f === 'town' || f === 'postcode' ? g[f] || '' : g[f]
    if (same(a, b)) tally[f].match++
    else {
      tally[f].differ++
      const d = firstDifference(a, b)
      tally[f].kinds = tally[f].kinds ?? {}
      const kindKey = d.where.replace(/\[\d+\]/g, '[]')
      tally[f].kinds[kindKey] = (tally[f].kinds[kindKey] ?? 0) + 1
      if (tally[f].examples.length < 3) tally[f].examples.push({ urn, site: `${d.where}: ${d.site}`, gold: `${d.where}: ${d.gold}` })
    }
  }
  const sw = s.website ? `https://${String(s.website).replace(/^https?:\/\//i, '')}` : null
  const norm = (u) => (u ? u.toLowerCase().replace(/\.$/, '').replace(/\/$/, '') : null)
  if (norm(sw) === norm(g.website)) website.same++
  else { website.differ++; if (website.examples.length < 3) website.examples.push({ urn, site: s.website ?? null, gold: g.website }) }
}
const onlySite = [...site.keys()].filter((u) => !gold.has(u))
const onlyGold = [...gold.keys()].filter((u) => !site.has(u))
console.log(`Institutions: site ${site.size}, gold ${gold.size}, in both ${site.size - onlySite.length}; only on the site ${onlySite.length}${onlySite.length ? ` (${onlySite.slice(0, 5).join(', ')})` : ''}; only in gold ${onlyGold.length}${onlyGold.length ? ` (${onlyGold.slice(0, 5).join(', ')})` : ''}`)
for (const f of FIELDS) {
  const t = tally[f]
  console.log(`${t.differ ? 'DIFF' : 'same'} ${f.padEnd(12)} ${t.match} match, ${t.differ} differ`)
  if (t.kinds) console.log(`       where: ${Object.entries(t.kinds).map(([k, n]) => `${k} ${n}`).join('; ')}`)
  for (const e of t.examples) console.log(`       ${e.urn}\n         site: ${e.site}\n         gold: ${e.gold}`)
}
console.log(`website: ${website.same} the same address, ${website.differ} differ (gold's is cleaned and link-checked)`)
for (const e of website.examples) console.log(`       ${e.urn} site ${e.site} gold ${e.gold}`)
