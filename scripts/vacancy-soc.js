// vacancy-soc.js - SOC 2020 codes for the adverts in SHARED_DB.EXT.VACANCY
// (decision 18; docs/plan-vacancy-sources.md; sql/vacancies_02_soc.sql has
// the table and the rules). Run after every vacancy import
// (scripts/import-vacancies.js), as DATA_LOAD_USER, or by hand:
//
//   npm run code:vacancies
//
// Each live advert is coded two ways:
//   the standard: its LARS code to Skills England's occupation, and its
//     options' occupations, to their SOC 2020 unit groups
//     (SKILLS.STANDARD_VERSION, STANDARD_OPTION, OCCUPATION_SOC);
//   the title: after taking out "apprentice", "level 3", a place after a
//     dash and the like, the whole title in the ONS coding index
//     (REF.SOC2020_INDEX, natural word order), else the longest index title
//     inside it (a one-word one only if that word means one code), else the
//     reviewed activity words (scripts/ref/activity-words.csv: a whole
//     title like "childcare"; NOT A JOB means nothing is coded from it).
// The rule (Alan, 14 October 2026): the standard wins over the title. If
// the title's code is one of the standard's, that one is kept
// (title-confirmed); if not, all the standard's are kept and the advert is
// flagged (standard, with title-uncoded, title-ambiguous or
// title-disagrees). An advert with no standard is coded from its title
// alone (title), or not at all: never guessed.
//
// Written with MERGE on (VACANCYREFERENCE, SOC2020): a code that applies
// again has GONEAT cleared on its row; a code of a live advert that no
// longer applies is marked GONEAT, never deleted. Adverts that are gone
// keep their codes as they were.

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { connect, execute, destroy } from '../server/db.js'
import { csvRecords } from './load/files.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const ACTIVITY_WORDS_FILE = path.join(HERE, 'ref', 'activity-words.csv')
// Change when the rules change; the activity words' checksum is added.
const RULES_VERSION = '1'

const NOISE = /\b(apprentices?|apprenticeships?|trainees?|level ?\d|l\d|degree|higher|advanced|intermediate|junior|graduate|school leavers?|entry level)\b/g
// A title, ready to compare: lower case, straight apostrophes, no brackets,
// nothing after " - " (usually a place), no apprenticeship words.
export const normaliseTitle = (t) => String(t ?? '').toLowerCase().replace(/[‘’\u0092`]/g, "'").replace(/\(.*?\)/g, ' ')
  .split(/\s+[-–|:]\s+/)[0]
  .replace(NOISE, ' ').replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim()

// The reviewed activity words: phrase -> SOC code, or null for NOT A JOB.
export async function readActivityWords(file = ACTIVITY_WORDS_FILE) {
  const words = new Map()
  let header = null
  for await (const r of csvRecords(file)) {
    if (!header) { header = r; continue }
    const row = Object.fromEntries(header.map((h, i) => [h, r[i]]))
    const review = String(row.REVIEW ?? '').trim()
    const code = review === 'OK' ? String(row.PROPOSED_SOC2020).trim() : /^\d{4}$/.test(review) ? review : review === 'NOT A JOB' ? null : undefined
    if (code === undefined) throw new Error(`${path.basename(file)}: "${row.PHRASE}" has REVIEW "${review}" (OK, a 4-digit SOC code or NOT A JOB)`)
    words.set(row.PHRASE, code)
  }
  return words
}

// A title coder from the index rows ({ title, qualified, soc }) and the
// activity words. Returns { soc } | { ambiguous: [socs] } | { none } with how
// and the index title or phrase it matched.
export function makeTitleCoder(indexRows, activityWords) {
  const byTitle = new Map()
  for (const r of indexRows) {
    const t = normaliseTitle(r.title)
    if (!t) continue
    if (!byTitle.has(t)) byTitle.set(t, [])
    byTitle.get(t).push(r)
  }
  const titles = [...byTitle.keys()].sort((x, y) => y.split(' ').length - x.split(' ').length || y.length - x.length)
  const pick = (entries) => {
    const plain = entries.filter((e) => !e.qualified)
    const socs = [...new Set((plain.length ? plain : entries).map((e) => String(e.soc)))]
    return socs.length === 1 ? { soc: socs[0] } : { ambiguous: socs.sort() }
  }
  return (title) => {
    const t = normaliseTitle(title)
    if (byTitle.has(t)) return { how: 'index', match: byTitle.get(t)[0].title, ...pick(byTitle.get(t)) }
    const padded = ` ${t} `
    for (const it of titles) {
      if (!padded.includes(` ${it} `)) continue
      const p = pick(byTitle.get(it))
      if (!it.includes(' ') && p.ambiguous) continue
      return { how: 'index', match: byTitle.get(it)[0].title, ...p }
    }
    if (activityWords.has(t)) {
      const soc = activityWords.get(t)
      return soc ? { how: 'activity', match: t, soc } : { how: 'none', match: t, notAJob: true }
    }
    return { how: 'none' }
  }
}

// The rows for one advert under the rule. standardSocs: a Set (empty if none).
export function codesFor(advert, standardSocs, coded) {
  const base = { VACANCYREFERENCE: advert.VACANCYREFERENCE, MATCHEDTITLE: coded.match ?? null }
  if (standardSocs.size > 0) {
    if (coded.soc && standardSocs.has(coded.soc)) return [{ ...base, SOC2020: coded.soc, METHOD: 'title-confirmed', FLAG: null, TITLESOC: null }]
    const flag = coded.soc ? 'title-disagrees' : coded.ambiguous ? 'title-ambiguous' : 'title-uncoded'
    return [...standardSocs].sort().map((soc) => ({ ...base, SOC2020: soc, METHOD: 'standard', FLAG: flag, TITLESOC: coded.soc ?? null }))
  }
  if (coded.soc) return [{ ...base, SOC2020: coded.soc, METHOD: 'title', FLAG: null, TITLESOC: null }]
  return []
}

const DESIRED = `(select f.value:VACANCYREFERENCE::string as VACANCYREFERENCE, f.value:SOC2020::string as SOC2020, f.value:METHOD::string as METHOD,
  f.value:FLAG::string as FLAG, f.value:TITLESOC::string as TITLESOC, f.value:MATCHEDTITLE::string as MATCHEDTITLE
  from table(flatten(input => parse_json(?))) f)`
const MERGE = `
  merge into SHARED_DB.EXT.VACANCY_SOC t
  using ${DESIRED} s
  on t.VACANCYREFERENCE = s.VACANCYREFERENCE and t.SOC2020 = s.SOC2020
  when matched and (t.GONEAT is not null or t.METHOD is distinct from s.METHOD or t.FLAG is distinct from s.FLAG
      or t.TITLESOC is distinct from s.TITLESOC or t.MATCHEDTITLE is distinct from s.MATCHEDTITLE) then update set
    METHOD = s.METHOD, FLAG = s.FLAG, TITLESOC = s.TITLESOC, MATCHEDTITLE = s.MATCHEDTITLE, CODERVERSION = ?,
    GONEAT = null, LASTCHANGEDAT = current_timestamp()
  when not matched then insert (VACANCYREFERENCE, SOC2020, METHOD, FLAG, TITLESOC, MATCHEDTITLE, CODERVERSION, LASTCHANGEDAT)
    values (s.VACANCYREFERENCE, s.SOC2020, s.METHOD, s.FLAG, s.TITLESOC, s.MATCHEDTITLE, ?, current_timestamp())
`
// Codes of the adverts just coded that no longer apply.
const MARK_GONE = `
  update SHARED_DB.EXT.VACANCY_SOC set GONEAT = current_timestamp(), LASTCHANGEDAT = current_timestamp()
  where GONEAT is null
    and VACANCYREFERENCE in (select value::string from table(flatten(input => parse_json(?))))
    and VACANCYREFERENCE || '|' || SOC2020 not in (select value::string from table(flatten(input => parse_json(?))))
`
const rowsAffected = (result, kind) => Number(result?.[0]?.[`number of rows ${kind}`] ?? 0)

// Codes every live advert; returns the counts. connection: DATA_LOAD_USER's.
export async function codeAdverts({ connection, log = console.log, activityFile = ACTIVITY_WORDS_FILE }) {
  const activityWords = await readActivityWords(activityFile)
  const version = `${RULES_VERSION}-${crypto.createHash('sha256').update(fs.readFileSync(activityFile)).digest('hex').slice(0, 8)}`
  const [adverts, index, standard] = await Promise.all([
    execute(connection, 'select VACANCYREFERENCE, TITLE, LARSCODE from SHARED_DB.EXT.VACANCY where GONEAT is null'),
    execute(connection, `select JOB_TITLE as TITLE, (coalesce(ADDITIONAL_QUALIFIER, '') <> '' or coalesce(INDUSTRY_QUALIFIER, '') <> '') as QUALIFIED, SOC2020
      from SHARED_DB.REF.SOC2020_INDEX where GONEAT is null`),
    execute(connection, `select v.LARS_CODE, s.UNIT_GROUP from SHARED_DB.SKILLS.STANDARD_VERSION v
        join SHARED_DB.SKILLS.OCCUPATION_SOC s on s.OCCUPATION_CODE = v.OCCUPATION_CODE and s.GONEAT is null and s.SOC_VERSION = 'SOC2020'
        where v.GONEAT is null
      union
      select v.LARS_CODE, s.UNIT_GROUP from SHARED_DB.SKILLS.STANDARD_VERSION v
        join SHARED_DB.SKILLS.STANDARD_OPTION o on o.ST_REFERENCE = v.ST_REFERENCE and o.GONEAT is null
        join SHARED_DB.SKILLS.OCCUPATION_SOC s on s.OCCUPATION_CODE = o.OCCUPATION_CODE and s.GONEAT is null and s.SOC_VERSION = 'SOC2020'
        where v.GONEAT is null`),
  ])
  const socsOf = new Map()
  for (const r of standard) {
    const k = Number(r.LARS_CODE)
    if (!socsOf.has(k)) socsOf.set(k, new Set())
    socsOf.get(k).add(String(r.UNIT_GROUP))
  }
  const titleCoder = makeTitleCoder(index.map((r) => ({ title: r.TITLE, qualified: r.QUALIFIED, soc: r.SOC2020 })), activityWords)
  const rows = []
  const counts = { adverts: adverts.length, titleConfirmed: 0, standard: 0, title: 0, uncoded: 0, notAJob: 0, flags: { 'title-uncoded': 0, 'title-ambiguous': 0, 'title-disagrees': 0 } }
  for (const ad of adverts) {
    const coded = titleCoder(ad.TITLE)
    const standardSocs = ad.LARSCODE === null || ad.LARSCODE === undefined ? new Set() : socsOf.get(Number(ad.LARSCODE)) ?? new Set()
    const out = codesFor(ad, standardSocs, coded)
    if (coded.notAJob) counts.notAJob++
    if (!out.length) counts.uncoded++
    else if (out[0].METHOD === 'standard') { counts.standard++; counts.flags[out[0].FLAG]++ } else if (out[0].METHOD === 'title-confirmed') counts.titleConfirmed++
    else counts.title++
    rows.push(...out)
  }
  await execute(connection, 'begin')
  try {
    const merged = await execute(connection, MERGE, [JSON.stringify(rows), version, version])
    const gone = await execute(connection, MARK_GONE, [JSON.stringify(adverts.map((a) => a.VACANCYREFERENCE)), JSON.stringify(rows.map((r) => `${r.VACANCYREFERENCE}|${r.SOC2020}`))])
    await execute(connection, 'commit')
    Object.assign(counts, { rows: rows.length, inserted: rowsAffected(merged, 'inserted'), updated: rowsAffected(merged, 'updated'), markedGone: rowsAffected(gone, 'updated'), version })
  } catch (err) {
    await execute(connection, 'rollback')
    throw err
  }
  log(`SOC codes: ${counts.adverts} live adverts; ${counts.titleConfirmed} title-confirmed, ${counts.standard} standard (flagged: ${Object.entries(counts.flags).map(([k, v]) => `${k} ${v}`).join(', ')}), ${counts.title} by title alone, ${counts.uncoded} not coded (${counts.notAJob} NOT A JOB); ${counts.inserted} rows added, ${counts.updated} changed, ${counts.markedGone} marked gone`)
  return counts
}

// By hand: npm run code:vacancies (as DATA_LOAD_USER).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const connection = await connect({ as: 'loader' })
  try {
    await codeAdverts({ connection })
  } finally {
    await destroy(connection)
  }
}
