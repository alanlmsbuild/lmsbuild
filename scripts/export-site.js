// export-site.js - the school leavers site's build-time export (the real-data
// plan, 31 October 2026). Reads GOLD as SITE_EXPORT_USER (sql/site_export_01.sql:
// read only, through the two GOLD_SITE database roles) and writes small static
// JSON files into the site's data/site/. Nothing on the live site talks to
// Snowflake: the site is built from these files.
//
//   npm run export:site [-- <the site's data/site folder>]
//
// The default folder is ../school-leavers-app/data/site beside this repo.
// Every figure is as published, with its year and source; a number is only
// ever counted, listed or shown as a range of what was listed, never
// estimated. No personal data: gold has none, and the files hold no key.
//
// Pre-aggregated by local authority, so the build stays small:
//   areas.json             every local authority, with its police.uk crime
//                          figures (area_profile)
//   apprenticeships.json   adverts by local authority and level, and the
//                          lengths advertised by level (vacancy_card)
//   courses.json           courses by local authority and level (ncs_course_count),
//                          and every fee listed for Access to Higher Education
//                          (each one, as listed: none hidden or estimated)
//   universities.json      providers (and their courses by local authority)
//   compare/<la>.json      the institutions in each local authority, with their
//                          Ofsted and latest 16 to 18 results
//   oak.json               subjects, lessons and a fixed set of quiz questions
//   manifest.json          what was written, from which tables, when

import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { connect, execute, destroy } from '../server/db.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SITE = path.join(ROOT, '..', 'school-leavers-app')
const out = path.resolve(process.argv[2] ?? path.join(SITE, 'data', 'site'))
const { KINDS, COHORTS } = await import(path.join(SITE, 'scripts', 'lib', 'kinds.mjs'))

const started = Date.now()
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null)
const num = (v) => (v === null || v === undefined ? null : Number(v))
const parse = (v) => (v ? (typeof v === 'string' ? JSON.parse(v) : v) : null)
const drop = (o) => JSON.parse(JSON.stringify(o, (k, v) => (v === null ? undefined : v)))

// The gold models' own attribution lines (dbt/models/gold/*/_*_gold.yml, meta.attribution).
const OGL = 'Contains public sector information licensed under the Open Government Licence v3.0.'
const CREDITS = {
  areas: `${OGL} Source: Office for National Statistics, licensed under the Open Government Licence v3.0. Crime figures: police.uk.`,
  apprenticeships: OGL,
  courses: `${OGL} National Careers Service course directory, Department for Education.`,
  universities: 'Credit: HESA (www.hesa.ac.uk). Licence: CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Changes: honesty rules applied (fewer than 10 hidden, 10 to 29 marked); columns renamed.',
  compare: OGL,
  oak: `${OGL} Lessons by Oak National Academy.`,
}

const written = []
const write = (rel, data) => {
  const file = path.join(out, rel)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const text = `${JSON.stringify(data)}\n`
  fs.writeFileSync(file, text)
  written.push({ file: rel, bytes: Buffer.byteLength(text), sha256: createHash('sha256').update(text).digest('hex') })
}

const c = await connect({ as: 'site-export', timeoutMs: 60000 })
const rows = {}
const q = async (name, sql) => { rows[name] = await execute(c, sql); return rows[name] }
const counts = {}

try {
  // ---- local authorities and crime (area_profile)
  const areas = await q('areas', 'select * from SHARED_DB.GOLD.AREA_PROFILE order by local_authority_code')
  counts.AREA_PROFILE = areas.length
  write('areas.json', {
    credit: CREDITS.areas,
    areas: areas.map((a) => drop({
      code: a.LOCAL_AUTHORITY_CODE, name: a.NAME, region: a.REGION_NAME, country: a.COUNTRY_NAME,
      crime: a.CRIME_RATE_PER_1000 === null ? null : {
        perThousand: num(a.CRIME_RATE_PER_1000), last12Months: num(a.CRIMES_LAST_12_MONTHS), months: num(a.CRIME_MONTHS_PRESENT),
        similarAreas: a.CRIME_VS_SIMILAR_AREAS, england: a.CRIME_VS_ENGLAND, englandPerThousand: num(a.CRIME_RATE_ENGLAND),
        trend: a.CRIME_TREND, lastMonth: iso(a.CRIME_LAST_MONTH), note: a.POLICE_DATA_NOTE,
      },
    })),
  })

  // ---- apprenticeship adverts (vacancy_card)
  const vac = await q('vacancies', 'select local_authority_code, apprenticeship_level, expected_duration, as_of from SHARED_DB.GOLD.VACANCY_CARD')
  counts.VACANCY_CARD = vac.length
  const months = (t) => {
    const m = /^(?:(\d+) Years?)?\s*(?:(\d+) Months?)?$/.exec((t ?? '').trim())
    return m && (m[1] || m[2]) ? Number(m[1] ?? 0) * 12 + Number(m[2] ?? 0) : null
  }
  const byArea = {}
  const lengths = {}
  for (const v of vac) {
    const la = v.LOCAL_AUTHORITY_CODE
    const level = v.APPRENTICESHIP_LEVEL ?? 'Not stated'
    if (la) {
      byArea[la] ??= { total: 0, levels: {} }
      byArea[la].total++
      byArea[la].levels[level] = (byArea[la].levels[level] ?? 0) + 1
    }
    const m = months(v.EXPECTED_DURATION)
    if (m !== null && level !== 'Not stated') {
      lengths[level] ??= { shortest: m, longest: m, adverts: 0 }
      lengths[level].shortest = Math.min(lengths[level].shortest, m)
      lengths[level].longest = Math.max(lengths[level].longest, m)
      lengths[level].adverts++
    }
  }
  write('apprenticeships.json', { credit: CREDITS.apprenticeships, asOf: iso(vac[0]?.AS_OF), total: vac.length, byArea, lengthsInMonths: lengths })

  // ---- courses (ncs_course_count) and Access to Higher Education fees (ncs_course_card)
  const cc = await q('courses', 'select * from OPTIONS_DB.GOLD.NCS_COURSE_COUNT')
  counts.NCS_COURSE_COUNT = cc.length
  const courseAreas = {}
  for (const r of cc) {
    if (r.AREA_TYPE !== 'local_authority') continue
    const a = (courseAreas[r.AREA_CODE] ??= { levels: {} })
    if (r.IS_ALL_LEVELS) Object.assign(a, { courses: num(r.COURSES), providers: num(r.PROVIDERS) })
    else a.levels[r.LEVEL] = num(r.COURSES)
  }
  const online = cc.find((r) => r.AREA_TYPE === 'online_or_national' && r.IS_ALL_LEVELS)
  const access = await q('access', `select local_authority_code, count(*) listings, count_if(cost > 0) with_cost, count_if(cost is null or cost = 0) no_cost, min(iff(cost > 0, cost, null)) lowest, max(cost) highest,
      array_sort(array_agg(iff(cost > 0, cost, null))) fees
    from OPTIONS_DB.GOLD.NCS_COURSE_CARD where qualification ilike '%access to higher education%' and local_authority_code is not null group by 1`)
  counts.NCS_COURSE_CARD_ACCESS = access.length
  write('courses.json', {
    credit: CREDITS.courses, publishedOn: iso(cc[0]?.PUBLISHED_ON), sourceUrl: cc[0]?.SOURCE_URL,
    online: online ? { courses: num(online.COURSES), providers: num(online.PROVIDERS) } : null,
    byArea: courseAreas,
    accessFees: Object.fromEntries(access.map((r) => [r.LOCAL_AUTHORITY_CODE, drop({ listings: num(r.LISTINGS), withCost: num(r.WITH_COST), noCost: num(r.NO_COST), lowest: num(r.LOWEST), highest: num(r.HIGHEST), fees: (parse(r.FEES) ?? []).map(Number) })])),
  })

  // ---- universities (university_course_card)
  const unis = await q('universities', `select publishing_ukprn, provider_name, local_authority_code, local_authority_name, count(*) courses, max(published_on) published_on
    from OPTIONS_DB.GOLD.UNIVERSITY_COURSE_CARD group by 1, 2, 3, 4 order by 2`)
  counts.UNIVERSITY_COURSE_CARD = unis.reduce((n, u) => n + Number(u.COURSES), 0)
  const uniByArea = {}
  for (const u of unis) if (u.LOCAL_AUTHORITY_CODE) uniByArea[u.LOCAL_AUTHORITY_CODE] = (uniByArea[u.LOCAL_AUTHORITY_CODE] ?? 0) + Number(u.COURSES)
  write('universities.json', {
    credit: CREDITS.universities, publishedOn: iso(unis[0]?.PUBLISHED_ON), coursesByArea: uniByArea,
    providers: unis.map((u) => drop({ ukprn: String(u.PUBLISHING_UKPRN), name: u.PROVIDER_NAME, la: u.LOCAL_AUTHORITY_CODE, laName: u.LOCAL_AUTHORITY_NAME, courses: num(u.COURSES) })),
  })

  // ---- institutions, by local authority (institution_*, national_comparison)
  const cards = await q('cards', 'select * from OPTIONS_DB.GOLD.INSTITUTION_CARD order by urn')
  const results = await q('results', 'select * from OPTIONS_DB.GOLD.INSTITUTION_RESULT')
  const national = await q('national', 'select * from OPTIONS_DB.GOLD.NATIONAL_COMPARISON')
  counts.INSTITUTION_CARD = cards.length
  counts.INSTITUTION_RESULT = results.length
  counts.NATIONAL_COMPARISON = national.length
  const nat = new Map(national.map((n) => [`${n.ESTABLISHMENT_TYPE}|${n.COHORT}|${n.ACADEMIC_YEAR}`, n]))
  const byUrn = new Map()
  for (const r of results) byUrn.set(r.URN, [...(byUrn.get(r.URN) ?? []), r])
  const figure = (row) => {
    if (!row || !row.STATUS) return null
    if (row.STATUS !== 'shown') return { hidden: row.HIDDEN_REASON }
    const f = { value: row.VALUE_TEXT ?? row.VALUE_NUMBER, base: Number(row.BASE) }
    if (row.SMALL_GROUP) f.small = true
    return f
  }
  const shards = {}
  for (const card of cards) {
    const kind = KINDS[card.KIND]
    if (!kind || !card.LOCAL_AUTHORITY_CODE) continue
    const mine = byUrn.get(card.URN) ?? []
    const res = {}
    for (const cohort of Object.keys(COHORTS)) {
      const years = [...new Set(mine.filter((r) => r.COHORT === cohort && ['grade', 'progress', 'retained'].includes(r.MEASURE)).map((r) => r.ACADEMIC_YEAR))].sort()
      const year = years.at(-1)
      if (!year) continue
      const get = (m) => mine.find((r) => r.COHORT === cohort && r.ACADEMIC_YEAR === year && r.MEASURE === m)
      const g = nat.get(`${kind.compare.grades}|${cohort}|${year}`)
      const rt = kind.compare.retention ? nat.get(`${kind.compare.retention}|${cohort}|${year}`) : null
      res[cohort] = [{ year, grade: figure(get('grade')), best3: cohort === 'A level' ? figure(get('best3')) : null, progress: figure(get('progress')), retained: figure(get('retained')),
        national: { grade: g?.GRADE ?? null, best3: cohort === 'A level' ? g?.BEST3_GRADE ?? null : null, retained: rt?.RETAINED_PERCENT ?? null } }]
    }
    ;(shards[card.LOCAL_AUTHORITY_CODE] ??= []).push(drop({
      urn: card.URN, name: card.NAME, kind: card.KIND, kindLabel: card.KIND_LABEL, comparedWith: card.COMPARED_WITH, town: card.TOWN ?? '', la: card.LOCAL_AUTHORITY_NAME,
      ofsted: card.OFSTED_FROM ? { from: card.OFSTED_FROM, url: card.OFSTED_URL, renewed: parse(card.OFSTED_RENEWED), original: parse(card.OFSTED_ORIGINAL) } : null,
      results: res,
    }))
  }
  for (const [la, list] of Object.entries(shards)) write(`compare/${la}.json`, { credit: CREDITS.compare, institutions: list })

  // ---- Oak (decision 56): content only, from gold
  const cover = await q('oakCoverage', 'select * from OPTIONS_DB.GOLD.OAK_SUBJECT_COVERAGE order by subject_title')
  counts.OAK_SUBJECT_COVERAGE = cover.length
  const lessonsOpen = await q('oakOpen', `select subject_slug, lesson_title, unit_title, oak_url from OPTIONS_DB.GOLD.OAK_LESSON_CARD qualify row_number() over (partition by subject_slug order by lesson_key) <= 6`)
  const lessonsLink = await q('oakLink', `select subject_slug, lesson_title, unit_title, oak_url from OPTIONS_DB.GOLD.OAK_RESTRICTED_LESSON_LINK qualify row_number() over (partition by subject_slug order by lesson_key) <= 6`)
  counts.OAK_LESSONS = lessonsOpen.length + lessonsLink.length
  // Quiz: multiple-choice questions with three answers, exactly one right, in the subjects with open lessons; the same 12 for each subject, taken in key order (no choosing).
  const quiz = await q('oakQuiz', `
    with open_subjects as (select subject_slug from OPTIONS_DB.GOLD.OAK_SUBJECT_COVERAGE where open_lessons > 0 and quiz_questions > 0),
    one_right as (
      select question_key from OPTIONS_DB.GOLD.OAK_QUIZ_ANSWER_RESULT group by 1 having count(*) = 3 and count_if(is_correct) = 1
    ),
    picked as (
      select q.*, row_number() over (partition by q.subject_slug order by q.question_key) rn
      from OPTIONS_DB.GOLD.OAK_QUIZ_QUESTION_CARD q
      where q.question_type = 'multiple-choice' and q.answer_count = 3 and q.subject_slug in (select subject_slug from open_subjects) and q.question_key in (select question_key from one_right)
    )
    select p.question_key, p.subject_slug, p.subject_title, p.question, p.attribution, p.licence_url, p.oak_url, a.answer_text, a.is_correct, a.answer_order
    from picked p join OPTIONS_DB.GOLD.OAK_QUIZ_ANSWER_RESULT a on a.question_key = p.question_key
    where p.rn <= 12 order by p.subject_slug, p.question_key, a.answer_order`)
  counts.OAK_QUIZ_QUESTION_CARD = new Set(quiz.map((r) => r.QUESTION_KEY)).size
  const questions = new Map()
  for (const r of quiz) {
    const k = questions.get(r.QUESTION_KEY) ?? { subject: r.SUBJECT_TITLE, question: String(r.QUESTION).trim(), options: [], correct: null, attribution: r.ATTRIBUTION, licenceUrl: r.LICENCE_URL, url: r.OAK_URL }
    if (r.IS_CORRECT) k.correct = k.options.length
    k.options.push(String(r.ANSWER_TEXT).trim())
    questions.set(r.QUESTION_KEY, k)
  }
  const lessons = (list, slug) => list.filter((l) => l.SUBJECT_SLUG === slug).map((l) => ({ title: l.LESSON_TITLE, unit: l.UNIT_TITLE, url: l.OAK_URL }))
  write('oak.json', {
    credit: CREDITS.oak, licenceUrl: cover[0]?.LICENCE_URL, downloadedOn: iso(cover[0]?.DOWNLOADED_ON),
    subjects: cover.map((s) => ({ slug: s.SUBJECT_SLUG, title: s.SUBJECT_TITLE, openLessons: num(s.OPEN_LESSONS), linkOnlyLessons: num(s.LINK_ONLY_LESSONS), quizQuestions: num(s.QUIZ_QUESTIONS), linkOnly: Boolean(s.LINK_ONLY_SUBJECT), attribution: s.ATTRIBUTION,
      lessons: Number(s.OPEN_LESSONS) > 0 ? lessons(lessonsOpen, s.SUBJECT_SLUG) : lessons(lessonsLink, s.SUBJECT_SLUG) })),
    quiz: [...questions.values()],
  })
} finally {
  await destroy(c)
}

const seconds = Math.round((Date.now() - started) / 1000)
write('manifest.json', {
  exportedAt: new Date().toISOString(), exportedAs: 'SITE_EXPORT_USER (SITE_EXPORT_ROLE: the GOLD_SITE database roles)', seconds,
  goldRowsRead: counts, files: written.filter((f) => f.file !== 'manifest.json'), credits: CREDITS,
})
const total = written.reduce((n, f) => n + f.bytes, 0)
console.log(`Exported ${written.length} files (${(total / 1e6).toFixed(2)} MB) to ${out} in ${seconds} s.`)
for (const [t, n] of Object.entries(counts)) console.log(`  ${t}: ${n} rows read`)
