// Oak National Academy's curriculum (decision 56): the bulk download of the
// 17 secondary subjects, from the Oak Curriculum API with Rarebit's key
// (OAK_API_KEY in server/.env, never printed or committed), filtered, and
// loaded by load:data step 52 into OPTIONS_DB.RAW.OAK_UNIT and OAK_LESSON.
// (Quizzes are step 53, also filtered: scripts/load/oak-quiz.js.)
//
// The licence is the Open Government Licence v3.0 "except where otherwise
// stated": Oak marks a lesson `restricted` when it contains third-party
// content. What is kept, from Oak's own answer of 27 October 2026
// (docs/licences/emails-2026-10.md; the notes are in docs/licences/oak-2026-10/):
//
//   an open lesson (not restricted)   the whole record, transcript included
//   a restricted lesson               ONLY its slug and title, its unit's slug
//                                     and title, and its exam board (and the
//                                     sequence it is in): nothing else of it
//   a unit with an open lesson        the whole record
//   a unit with only restricted       its slugs, titles, year, key stage, exam
//   lessons                           board and lesson list; not the unit's
//                                     description, prior knowledge, national
//                                     curriculum content or "why this, why now"
//                                     (the email did not cover them)
//
// The raw download is never staged or kept: it is read from a temporary
// folder, filtered and deleted, and only the filtered files are loaded (the
// loader re-applies the same filters to every line, so a file saved earlier
// can't carry anything more). The options app never calls Oak: it reads our
// gold tables only (docs/decisions.md, decision 56).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import { zipEntry } from './files.js'

export const OAK_API = 'https://open-api.thenational.academy/api'
export const OAK_DIR = 'oak'
export const OAK_SOURCE = 'oak-curriculum'
export const OAK_SUBJECTS = [
  'art', 'citizenship', 'computing', 'cooking-nutrition', 'design-technology', 'english', 'french', 'geography', 'german', 'history',
  'maths', 'music', 'physical-education', 'religious-education', 'rshe-pshe', 'science', 'spanish',
].map((s) => `${s}-secondary`)
// A subject's lessons falling by more than this since the last run is not
// saved (a real change: run once with OAK_ACCEPT_CHANGES=1).
export const OAK_SHRINK_LIMIT = 0.05

// A restricted lesson keeps these and nothing else. `sequenceSlug` is the
// download's own name for the subject (e.g. science-secondary); `examBoard`
// comes from the lesson's unit.
export const RESTRICTED_LESSON_KEYS = ['sequenceSlug', 'restricted', 'lessonSlug', 'lessonTitle', 'unitSlug', 'unitTitle', 'examBoard']
// A unit with only restricted lessons loses these.
export const UNIT_TEXT_KEYS = ['description', 'whyThisWhyNow', 'priorKnowledgeRequirements', 'nationalCurriculumContent']

// What the loader says it left out (SOURCE_FILE.REMOVEDCOLUMNS).
export const OAK_REMOVED = [
  'restricted lessons: everything except slug, title, unit slug and title, and exam board',
  'the description, prior knowledge, curriculum content and rationale of units that have only restricted lessons',
]

// Oak marks a lesson restricted with `restricted: true`; it is left out of the
// flag (undefined) on an open one. Anything that is not exactly false or absent is treated as restricted.
export const isRestricted = (lesson) => !(lesson.restricted === undefined || lesson.restricted === false)

// ---------------------------------------------------------------- filtering
const examBoardOf = (unit) => (unit?.examBoard ? { slug: unit.examBoard.slug ?? null, title: unit.examBoard.title ?? null } : null)

// One lesson as it may be kept. `units` is a Map of unitSlug -> unit.
export function keptLesson(lesson, sequenceSlug, units) {
  const examBoard = examBoardOf(units.get(lesson.unitSlug))
  if (isRestricted(lesson)) {
    return { sequenceSlug, restricted: true, lessonSlug: lesson.lessonSlug, lessonTitle: lesson.lessonTitle, unitSlug: lesson.unitSlug, unitTitle: lesson.unitTitle, examBoard }
  }
  return { sequenceSlug, ...lesson, restricted: false, examBoard }
}

// One unit as it may be kept; `open` is the set of unitSlugs with an open lesson.
export function keptUnit(unit, sequenceSlug, open) {
  const hasOpen = open.has(unit.unitSlug)
  const kept = { sequenceSlug, ...unit, hasOpenLessons: hasOpen }
  if (!hasOpen) for (const k of UNIT_TEXT_KEYS) delete kept[k]
  return kept
}

// The filtered lines of one subject's download (its JSON): { units, lessons,
// counts }. Pure. Throws if the file isn't what the bulk schema describes.
export function filterSequence(data, expectedSlug) {
  const problems = []
  if (!data || typeof data !== 'object') throw new Error('Oak: the download is not a JSON object.')
  if (expectedSlug && data.sequenceSlug !== expectedSlug) problems.push(`its sequenceSlug is ${data.sequenceSlug}, not ${expectedSlug}`)
  if (!Array.isArray(data.sequence) || !data.sequence.length) problems.push('it has no units')
  if (!Array.isArray(data.lessons) || !data.lessons.length) problems.push('it has no lessons')
  if (problems.length) throw new Error(`Oak ${expectedSlug ?? data.sequenceSlug}: not saved: ${problems.join('; ')}.`)
  const sequenceSlug = data.sequenceSlug

  const units = new Map()
  for (const u of data.sequence) {
    if (!u.unitSlug || !u.unitTitle) problems.push('a unit has no slug or title')
    else if (units.has(u.unitSlug)) problems.push(`unit ${u.unitSlug} is repeated`)
    units.set(u.unitSlug, u)
  }
  const seen = new Set()
  for (const l of data.lessons) {
    if (!l.lessonSlug || !l.lessonTitle || !l.unitSlug) problems.push('a lesson has no slug, title or unit')
    else if (!units.has(l.unitSlug)) problems.push(`lesson ${l.lessonSlug}'s unit ${l.unitSlug} is not in the sequence`)
    const key = `${l.unitSlug}|${l.lessonSlug}`
    if (seen.has(key)) problems.push(`lesson ${l.lessonSlug} is repeated in unit ${l.unitSlug}`)
    seen.add(key)
  }
  if (problems.length) throw new Error(`Oak ${sequenceSlug}: not saved: ${[...new Set(problems)].slice(0, 5).join('; ')}.`)

  const lessons = data.lessons.map((l) => keptLesson(l, sequenceSlug, units))
  const open = new Set(lessons.filter((l) => !l.restricted).map((l) => l.unitSlug))
  const keptUnits = data.sequence.map((u) => keptUnit(u, sequenceSlug, open))
  return {
    sequenceSlug,
    units: keptUnits,
    lessons,
    counts: { units: keptUnits.length, lessons: lessons.length, restricted: lessons.filter((l) => l.restricted).length, unitsWithoutOpenLessons: keptUnits.filter((u) => !u.hasOpenLessons).length },
  }
}

// A saved line filtered again when it is loaded (so a file saved before a
// rule changed never reaches Snowflake with more than the rule allows).
export function refilterLesson(line) {
  if (!isRestricted(line)) return line
  return Object.fromEntries(RESTRICTED_LESSON_KEYS.map((k) => [k, k === 'restricted' ? true : line[k] ?? null]))
}
export function refilterUnit(line) {
  if (line.hasOpenLessons) return line
  const kept = { ...line }
  for (const k of UNIT_TEXT_KEYS) delete kept[k]
  return kept
}

// What is wrong with the filtered lines, as a list of sentences: any restricted
// lesson with a key it may not have, any text left on a unit with no open lesson.
export function leaks(lessons, units) {
  const found = []
  for (const l of lessons) {
    if (!isRestricted(l)) continue
    const extra = Object.keys(l).filter((k) => !RESTRICTED_LESSON_KEYS.includes(k))
    if (extra.length) found.push(`restricted lesson ${l.lessonSlug} has ${extra.join(', ')}`)
  }
  for (const u of units) {
    if (u.hasOpenLessons) continue
    const extra = UNIT_TEXT_KEYS.filter((k) => k in u)
    if (extra.length) found.push(`unit ${u.unitSlug} has ${extra.join(', ')} but no open lesson`)
  }
  return found
}

// ---------------------------------------------------------------- fetching
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms))

// POST /bulk for one subject-phase; the response (a zip) is streamed to `to`.
// A 429 or a server error is tried again, after Retry-After if given. The key
// is only ever in the request header.
export async function downloadBulk(subject, to, { key, post = fetch, tries = 4, sleep = sleepMs } = {}) {
  if (!key) throw new Error('OAK_API_KEY is not set (server/.env).')
  for (let t = 1; ; t++) {
    const res = await post(`${OAK_API}/bulk`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'user-agent': 'Rarebit data loader' }, body: JSON.stringify({ subjects: [subject] }) })
    if (res.ok) {
      await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(to))
      return { remaining: Number(res.headers.get('x-ratelimit-remaining')) }
    }
    if ((res.status === 429 || res.status >= 500) && t < tries) {
      const wait = Number(res.headers.get('retry-after'))
      await sleep(Number.isFinite(wait) && wait > 0 ? wait * 1000 : 5000 * t)
      continue
    }
    throw new Error(`Oak bulk ${subject}: ${res.status} ${res.statusText}`)
  }
}

const readText = async (stream) => {
  const chunks = []
  for await (const c of stream) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}
const jsonLines = (records) => records.map((r) => JSON.stringify(r)).join('\n') + '\n'
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex')

// Fetch every subject, filter it, and save <root>/oak/units_<subject>.jsonl and
// lessons_<subject>.jsonl, only when their content differs from what is
// there. The download goes to a temporary folder that is removed whatever
// happens. Returns the files written (empty: nothing new).
export const readBulkJson = async (zip, subject) => JSON.parse(await readText(await zipEntry(zip, `${subject}.json`)))

export async function fetchOak({ root, key = process.env.OAK_API_KEY, subjects = OAK_SUBJECTS, log = console.log, download = downloadBulk, readJson = readBulkJson, pauseMs = 2000,
  acceptChanges = process.env.OAK_ACCEPT_CHANGES === '1' } = {}) {
  const dir = path.join(root, OAK_DIR)
  fs.mkdirSync(dir, { recursive: true })
  const statePath = path.join(dir, 'state.json')
  const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {}
  const written = []
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oak-bulk-'))
  try {
    for (const [i, subject] of subjects.entries()) {
      if (i) await sleepMs(pauseMs)
      const zip = path.join(tmp, `${subject}.zip`)
      await download(subject, zip, { key })
      const data = await readJson(zip, subject)
      fs.rmSync(zip, { force: true })
      const f = filterSequence(data, subject)
      const found = leaks(f.lessons, f.units)
      if (found.length) throw new Error(`Oak ${subject}: not saved: ${found.slice(0, 3).join('; ')}.`)
      const was = state[subject]?.lessons
      if (was && !acceptChanges && f.counts.lessons < was * (1 - OAK_SHRINK_LIMIT)) {
        throw new Error(`Oak ${subject}: not saved: lessons fell from ${was} to ${f.counts.lessons} (more than ${OAK_SHRINK_LIMIT * 100}%). A real change: run once with OAK_ACCEPT_CHANGES=1.`)
      }
      const outputs = { [`units_${subject}.jsonl`]: jsonLines(f.units), [`lessons_${subject}.jsonl`]: jsonLines(f.lessons) }
      for (const [name, text] of Object.entries(outputs)) {
        const file = path.join(dir, name)
        if (fs.existsSync(file) && sha(fs.readFileSync(file, 'utf8')) === sha(text)) continue
        fs.writeFileSync(`${file}.part`, text)
        fs.renameSync(`${file}.part`, file)
        written.push(file)
      }
      state[subject] = f.counts
      log(`  Oak ${subject}: ${f.counts.units} units, ${f.counts.lessons} lessons (${f.counts.restricted} restricted, kept as titles only)`)
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
  fs.writeFileSync(statePath, JSON.stringify(state, null, 1))
  return written
}

// ---------------------------------------------------------------- load step 52
const OGL = 'Open Government Licence v3.0'
const savedFiles = (dir, re) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => re.test(n)).sort().map((file) => ({ file: path.join(dir, file) })) : [])

export function oakSteps(R) {
  return {
    52: { job: 'load-oak', runLabel: 'Oak National Academy: units and lessons (bulk download, filtered)', run: async (loader) => {
      const dir = path.join(R, OAK_DIR)
      const read = (refilter) => async ({ file }) => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l, i) => ({ n: i + 1, item: refilter(JSON.parse(l)) }))
      const base = { home: 'OPTIONS_DB', source: OAK_SOURCE, publisher: 'Oak National Academy', licence: OGL, page: 'https://open-api.thenational.academy/docs/about-oaks-api/api-overview',
        format: 'OPTIONS_DB.RAW.JSON_LINES', kind: 'columns-removed', removed: OAK_REMOVED }
      return [
        ...await loader.loadJsonLines({ ...base, title: 'Oak National Academy: units of the secondary sequences (bulk download)', table: 'OPTIONS_DB.RAW.OAK_UNIT',
          originals: savedFiles(dir, /^units_.*\.jsonl$/), rows: read(refilterUnit),
          cols: { LINENUMBER: '$1:n::number', SEQUENCE_SLUG: '$1:item:sequenceSlug::string', UNIT_SLUG: '$1:item:unitSlug::string', KEY_STAGE_SLUG: '$1:item:keyStageSlug::string',
            EXAM_BOARD_SLUG: '$1:item:examBoard:slug::string', ITEM: '$1:item' } }),
        ...await loader.loadJsonLines({ ...base, title: 'Oak National Academy: lessons of the secondary sequences (bulk download; restricted lessons as titles only)', table: 'OPTIONS_DB.RAW.OAK_LESSON',
          originals: savedFiles(dir, /^lessons_.*\.jsonl$/), rows: read(refilterLesson),
          cols: { LINENUMBER: '$1:n::number', SEQUENCE_SLUG: '$1:item:sequenceSlug::string', LESSON_SLUG: '$1:item:lessonSlug::string', UNIT_SLUG: '$1:item:unitSlug::string',
            EXAM_BOARD_SLUG: '$1:item:examBoard:slug::string', RESTRICTED: '$1:item:restricted::boolean', ITEM: '$1:item' } }),
      ]
    } },
  }
}
