// Oak National Academy's quizzes (decision 56): the starter and exit quiz of
// every OPEN lesson, from the Curriculum API, loaded by load:data step 53 into
// OPTIONS_DB.RAW.OAK_QUIZ. See scripts/load/oak.js for the rules about what is
// kept; the ones that matter here:
//
//   - a restricted lesson's quiz is never saved (the API returns quizzes for
//     restricted lessons too: only lessons the bulk download marks open, and
//     Oak's check-restricted endpoint agrees are open, are kept)
//   - a question with an image, on the question or on any answer, is left out
//     for now (and counted in the lesson's row), so no Oak image address is
//     stored and the options app never has a reason to call Oak's servers
//
// Requests: /subjects, then /subjects/{subject} for its sequences, then each
// secondary sequence and year (7 to 11) of /sequences/{sequence}/questions,
// 300 lessons a request. Oak allows 1,000 requests an hour per key; this stops
// if fewer than OAK_MIN_REMAINING are left. The key is only in request headers.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { OAK_DIR, OAK_SUBJECTS, isRestricted, oakJson } from './oak.js'

export { oakJson }

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms))

export const OAK_YEARS = [7, 8, 9, 10, 11]
export const OAK_PAGE = 300
export const OAK_MIN_REMAINING = 100
// An open lesson without a quiz is normal for a few; this many without means something is wrong.
export const OAK_MIN_QUIZ_SHARE = 0.8
export const QUIZ_FILE = 'quizzes.jsonl'
export const QUIZ_REMOVED = ['quiz questions with an image on the question or an answer']

// ---------------------------------------------------------------- images
// A question has an image if it has a question image or an answer that is an
// image (multiple-choice, short-answer and order answers have a `type`; a
// match answer has `matchOption` and `correctChoice`, each with a `type`), or
// anything in it points at an image on Oak's servers.
const IMAGE_ADDRESS = /cloudinary|\.(png|jpe?g|gif|svg|webp)(\?|"|$)/i
export function hasImage(question) {
  if (question?.questionImage) return true
  const walk = (v) => {
    if (typeof v === 'string') return IMAGE_ADDRESS.test(v)
    if (Array.isArray(v)) return v.some(walk)
    if (v && typeof v === 'object') {
      if (v.type === 'image') return true
      return Object.entries(v).some(([k, x]) => (/image/i.test(k) && x) || walk(x))
    }
    return false
  }
  return walk(question)
}

// One lesson's quizzes without the image questions: { lessonSlug, lessonTitle,
// starterQuiz, exitQuiz, questionsLeftOut }. Pure.
export function keptQuiz(entry) {
  const split = (qs) => {
    const list = Array.isArray(qs) ? qs : []
    return { kept: list.filter((q) => !hasImage(q)), left: list.filter(hasImage).length }
  }
  const s = split(entry.starterQuiz)
  const e = split(entry.exitQuiz)
  return { lessonSlug: entry.lessonSlug, lessonTitle: entry.lessonTitle, starterQuiz: s.kept, exitQuiz: e.kept, questionsLeftOut: { starter: s.left, exit: e.left } }
}
// A saved line filtered again when it is loaded (what was left out before stays counted).
export function refilterQuiz(line) {
  const k = keptQuiz(line)
  const was = line.questionsLeftOut ?? {}
  return { ...k, questionsLeftOut: { starter: k.questionsLeftOut.starter + (was.starter ?? 0), exit: k.questionsLeftOut.exit + (was.exit ?? 0) } }
}

// ---------------------------------------------------------------- fetching
// The slugs of the lessons the bulk download marks open, from the saved lessons files.
export function openLessonSlugs(dir) {
  const open = new Set()
  if (!fs.existsSync(dir)) return open
  for (const name of fs.readdirSync(dir).filter((n) => /^lessons_.*\.jsonl$/.test(n))) {
    for (const line of fs.readFileSync(path.join(dir, name), 'utf8').split('\n').filter(Boolean)) {
      const l = JSON.parse(line)
      if (!isRestricted(l)) open.add(l.lessonSlug)
    }
  }
  return open
}

const jsonLines = (records) => records.map((r) => JSON.stringify(r)).join('\n') + '\n'
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex')

// Fetch the quizzes of the open lessons and save <root>/oak/quizzes.jsonl (one
// lesson per line, in slug order), only if it differs from the file there.
// Returns the file or null.
export async function fetchOakQuizzes({ root, key = process.env.OAK_API_KEY, log = console.log, api = oakJson, pauseMs = 300, subjects = OAK_SUBJECTS.map((s) => s.replace(/-secondary$/, '')) } = {}) {
  const dir = path.join(root, OAK_DIR)
  const open = openLessonSlugs(dir)
  if (!open.size) throw new Error('Oak quizzes: no open lessons saved yet: fetch the bulk download first.')
  let requests = 0
  let remaining = Infinity
  const call = async (p, opts = {}) => {
    if (remaining < OAK_MIN_REMAINING) throw new Error(`Oak quizzes: stopped with ${remaining} requests left of this hour's allowance; run again after it resets.`)
    if (requests) await sleepMs(pauseMs)
    requests++
    const r = await api(p, { key, ...opts })
    remaining = r.remaining
    return r.json
  }

  // The secondary sequences (a subject's exam-board variants are separate sequences).
  const sequences = []
  for (const subject of subjects) {
    const s = await call(`/subjects/${subject}`)
    for (const q of s.sequenceSlugs ?? []) if (q.phaseSlug === 'secondary') sequences.push({ slug: q.sequenceSlug, years: (q.years ?? []).filter((y) => OAK_YEARS.includes(y)) })
  }

  const byLesson = new Map()
  let differing = 0
  for (const seq of sequences) {
    for (const year of seq.years) {
      for (let offset = 0; ; offset += OAK_PAGE) {
        const page = await call(`/sequences/${seq.slug}/questions?year=${year}&offset=${offset}&limit=${OAK_PAGE}`)
        if (!Array.isArray(page)) throw new Error(`Oak quizzes: ${seq.slug} year ${year}: not a list.`)
        for (const entry of page) {
          if (!open.has(entry.lessonSlug)) continue
          const kept = keptQuiz(entry)
          const was = byLesson.get(kept.lessonSlug)
          if (!was) byLesson.set(kept.lessonSlug, kept)
          else if (JSON.stringify(was) !== JSON.stringify(kept)) differing++
        }
        if (page.length < OAK_PAGE) break
      }
    }
  }

  // Open lessons the sweep did not return (key stage 4 lessons of sequences the
  // per-year list leaves out: history-secondary, design-technology-secondary) are
  // asked for one at a time. A lesson with no quiz there either is left without one.
  let single = 0
  for (const slug of [...open].sort()) {
    if (byLesson.has(slug)) continue
    let quiz
    try { quiz = await call(`/lessons/${slug}/quiz`) } catch (e) { if (/\b404\b/.test(String(e.message))) continue; throw e }
    if (!quiz || (!quiz.starterQuiz?.length && !quiz.exitQuiz?.length)) continue
    byLesson.set(slug, keptQuiz({ lessonSlug: slug, lessonTitle: null, starterQuiz: quiz.starterQuiz, exitQuiz: quiz.exitQuiz }))
    single++
  }

  // Oak's own check of the lessons we are about to keep: any it calls restricted is dropped.
  const slugs = [...byLesson.keys()].sort()
  let dropped = 0
  for (let i = 0; i < slugs.length; i += 500) {
    const verdict = await call('/lessons/check-restricted', { body: { lessonSlugs: slugs.slice(i, i + 500) } })
    for (const [slug, v] of Object.entries(verdict)) if (v !== 'ogl-compatible') { byLesson.delete(slug); dropped++ }
  }

  const covered = byLesson.size / open.size
  if (covered < OAK_MIN_QUIZ_SHARE) throw new Error(`Oak quizzes: not saved: only ${byLesson.size} of ${open.size} open lessons have a quiz (under ${OAK_MIN_QUIZ_SHARE * 100}%).`)
  const records = [...byLesson.values()].sort((a, b) => a.lessonSlug.localeCompare(b.lessonSlug))
  const questions = records.reduce((n, r) => n + r.starterQuiz.length + r.exitQuiz.length, 0)
  const left = records.reduce((n, r) => n + r.questionsLeftOut.starter + r.questionsLeftOut.exit, 0)
  log(`  Oak quizzes: ${records.length} of ${open.size} open lessons, ${questions} questions kept, ${left} with images left out; ${requests} requests${single ? `; ${single} fetched one at a time` : ""}${differing ? `; ${differing} lessons had different quizzes in two sequences (first kept)` : ''}${dropped ? `; ${dropped} dropped as restricted by Oak's check` : ''}`)

  const text = jsonLines(records)
  const file = path.join(dir, QUIZ_FILE)
  if (fs.existsSync(file) && sha(fs.readFileSync(file, 'utf8')) === sha(text)) return null
  fs.writeFileSync(`${file}.part`, text)
  fs.renameSync(`${file}.part`, file)
  return file
}

// ---------------------------------------------------------------- load step 53
const OGL = 'Open Government Licence v3.0'

export function oakQuizSteps(R) {
  return {
    53: { job: 'load-oak-quiz', runLabel: 'Oak National Academy: quizzes of the open lessons (Curriculum API, questions with images left out)', run: async (loader) => {
      const dir = path.join(R, OAK_DIR)
      const file = path.join(dir, QUIZ_FILE)
      return loader.loadJsonLines({ home: 'OPTIONS_DB', source: 'oak-curriculum', publisher: 'Oak National Academy', licence: OGL, page: 'https://open-api.thenational.academy/docs/about-oaks-api/api-overview',
        format: 'OPTIONS_DB.RAW.JSON_LINES', kind: 'columns-removed', removed: QUIZ_REMOVED,
        title: 'Oak National Academy: starter and exit quizzes of the open lessons (questions with images left out)', table: 'OPTIONS_DB.RAW.OAK_QUIZ',
        originals: fs.existsSync(file) ? [{ file }] : [],
        rows: async ({ file: f }) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l, i) => ({ n: i + 1, item: refilterQuiz(JSON.parse(l)) })),
        cols: { LINENUMBER: '$1:n::number', LESSON_SLUG: '$1:item:lessonSlug::string', ITEM: '$1:item' } })
    } },
  }
}
