// Test: Oak National Academy's curriculum (scripts/load/oak.js, decision 56):
// a restricted lesson is kept as its slug, title, unit and exam board and
// nothing else; a unit with no open lesson loses its text; the raw download
// is never kept; a file saved earlier is filtered again at load; the load
// step is set up as a columns-removed load of the filtered files only.
// Fake download; no network, no Snowflake, no key.
//   node test/oak.mjs
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { OAK_DIR, OAK_REMOVED, OAK_SUBJECTS, RESTRICTED_LESSON_KEYS, UNIT_TEXT_KEYS, downloadBulk, fetchOak, filterSequence, isRestricted, keptLesson, leaks, oakSteps, refilterLesson, refilterUnit } from '../scripts/load/oak.js'
import { OAK_MIN_REMAINING, QUIZ_FILE, QUIZ_REMOVED, fetchOakQuizzes, hasImage, keptQuiz, oakJson, oakQuizSteps, openLessonSlugs, refilterQuiz } from '../scripts/load/oak-quiz.js'
import { FORBIDDEN, findOakCalls } from '../scripts/check-no-oak-calls.js'
import { JOB_ORDER, JOB_SCHEDULE } from '../server/jobSchedule.js'
import { JOB_RUNNERS } from '../scripts/jobs.js'
import { LOAD_STEPS } from '../scripts/fetch-official.js'
import { STEPS } from '../scripts/load-data.js'

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`)
}
const here = path.dirname(fileURLToPath(import.meta.url))
const fresh = (name) => { const r = path.join(here, '.output', 'oak-test', name); fs.rmSync(r, { recursive: true, force: true }); fs.mkdirSync(r, { recursive: true }); return r }
const fails = async (fn) => { try { await fn(); return null } catch (e) { return e.message } }
const quiet = () => {}

// A small subject: unit A has an open and a restricted lesson, unit B only restricted ones.
const unit = (slug, extra = {}) => ({ unitSlug: slug, unitTitle: `Unit ${slug}`, canonicalUrl: `https://example/${slug}`, threads: [], description: `About ${slug}`, whyThisWhyNow: 'because', priorKnowledgeRequirements: ['p'], nationalCurriculumContent: ['n'],
  yearSlug: 'year-10', year: 10, keyStageSlug: 'ks4', subjectSlug: 'science', unitLessons: [{ lessonSlug: `${slug}-l1`, lessonTitle: 'L1', lessonOrder: 1, state: 'published' }], ...extra })
const lesson = (slug, unitSlug, extra = {}) => ({ lessonTitle: `Lesson ${slug}`, lessonSlug: slug, oakUrl: `https://www.thenational.academy/teachers/lessons/${slug}`, canonicalUrl: 'https://x', unitSlug, unitTitle: `Unit ${unitSlug}`,
  subjectSlug: 'science', subjectTitle: 'Science', keyStageSlug: 'ks4', keyStageTitle: 'Key Stage 4', lessonKeywords: [{ keyword: 'k', description: 'd' }], keyLearningPoints: [{ keyLearningPoint: 'p' }],
  misconceptionsAndCommonMistakes: [], pupilLessonOutcome: 'o', teacherTips: [{ teacherTip: 't' }], contentGuidance: null, downloadsavailable: true, supervisionLevel: null,
  transcript_sentences: `Transcript of ${slug}`, transcript_vtt: 'WEBVTT', ...extra })
const allOpen = (d) => Object.fromEntries(d.lessons.map((l) => [l.lessonSlug, 'ogl-compatible']))
const subject = () => ({
  sequenceSlug: 'science-secondary', subjectTitle: 'Science',
  sequence: [unit('a', { examBoard: { slug: 'aqa', title: 'AQA' } }), unit('b', { examBoard: { slug: 'ocr', title: 'OCR' } })],
  lessons: [lesson('open-1', 'a'), lesson('closed-1', 'a', { restricted: true }), lesson('closed-2', 'b', { restricted: true, transcript_sentences: 'must not be kept' })],
})

// ---------------------------------------------------------------- the filter
{
  const f = filterSequence(subject(), 'science-secondary', allOpen(subject()))
  const closed = f.lessons.find((l) => l.lessonSlug === 'closed-1')
  const open = f.lessons.find((l) => l.lessonSlug === 'open-1')
  check('a restricted lesson keeps only its slug, title, unit slug and title, exam board and sequence',
    JSON.stringify(Object.keys(closed).sort()) === JSON.stringify([...RESTRICTED_LESSON_KEYS].sort()) && closed.restricted === true && closed.unitTitle === 'Unit a' && closed.examBoard.slug === 'aqa')
  check('nothing else of it survives (no keywords, outcome, tips, transcript, URL, subject)', !/keyword|transcript|WEBVTT|pupilLessonOutcome|teacherTip|oakUrl|subjectTitle|must not be kept/i.test(JSON.stringify(f.lessons.filter((l) => l.restricted))))
  check('an open lesson is kept whole, with the sequence, restricted false and its exam board', open.transcript_sentences === 'Transcript of open-1' && open.lessonKeywords.length === 1 && open.restricted === false && open.sequenceSlug === 'science-secondary' && open.examBoard.title === 'AQA')
  const a = f.units.find((u) => u.unitSlug === 'a')
  const b = f.units.find((u) => u.unitSlug === 'b')
  check('a unit with an open lesson keeps its text', a.hasOpenLessons === true && UNIT_TEXT_KEYS.every((k) => k in a))
  check('a unit with only restricted lessons loses its text but keeps its slugs, titles, year, exam board and lesson list',
    b.hasOpenLessons === false && UNIT_TEXT_KEYS.every((k) => !(k in b)) && b.unitTitle === 'Unit b' && b.year === 10 && b.examBoard.slug === 'ocr' && b.unitLessons[0].lessonTitle === 'L1')
  check('counts', JSON.stringify(f.counts) === JSON.stringify({ units: 2, lessons: 3, restricted: 2, unitsWithoutOpenLessons: 1, restrictedOnlyByOaksCheck: 0 }), JSON.stringify(f.counts))
  check('no leaks in the filtered lines', leaks(f.lessons, f.units).length === 0)
  check('a leak is found: a restricted lesson with a transcript, a text-less unit with a description', leaks([{ ...closed, transcript_sentences: 'x' }], [{ ...b, description: 'x' }]).length === 2)
  check('restricted means anything but absent or false', isRestricted({ restricted: true }) && isRestricted({ restricted: 'yes' }) && isRestricted({ restricted: null }) && !isRestricted({}) && !isRestricted({ restricted: false }))
  check('a lesson with no unit in the sequence has no exam board', keptLesson({ lessonSlug: 's', lessonTitle: 't', unitSlug: 'zzz', unitTitle: 'z', restricted: true }, 'x', new Map()).examBoard === null)
  // Oak's check decides, not the absence of the flag (30 October 2026: art).
  const d = subject()
  const verdicts = { ...allOpen(d), 'open-1': 'restricted' }
  const g = filterSequence(d, 'science-secondary', verdicts)
  const o1 = g.lessons.find((l) => l.lessonSlug === 'open-1')
  check('a lesson the download does not flag but Oak\'s check calls restricted is kept as a title only', o1.restricted === true && JSON.stringify(Object.keys(o1).sort()) === JSON.stringify([...RESTRICTED_LESSON_KEYS].sort()) && !JSON.stringify(g).includes('Transcript of open-1'))
  check('and it counts: restricted only by the check', g.counts.restrictedOnlyByOaksCheck === 1)
  const none = filterSequence(subject(), 'science-secondary', {})
  check('a lesson with no verdict at all is restricted, so with no verdicts nothing but titles is kept', none.lessons.every((l) => l.restricted) && leaks(none.lessons, none.units).length === 0 && !JSON.stringify(none.lessons).includes('Transcript of'))
  check('a lesson the download flags stays restricted even if the check says ogl-compatible', filterSequence(subject(), 'science-secondary', allOpen(subject())).lessons.find((l) => l.lessonSlug === 'closed-1').restricted === true)
  // Citizenship lists a unit in both pathways; the lessons are then listed twice, identically.
  const c = subject()
  c.sequence.push({ ...unit('a', { examBoard: { slug: 'aqa', title: 'AQA' } }), pathwaySlug: 'core', yearSlug: 'year-11' })
  c.sequence[0].pathwaySlug = 'gcse'
  c.lessons.push({ ...c.lessons[0] })
  const cf = filterSequence(c, 'science-secondary', allOpen(c))
  check('a unit listed in two pathways is two units, and its lessons listed twice are one', cf.units.length === 3 && cf.lessons.length === 3 && cf.lessons.find((l) => l.lessonSlug === 'open-1').examBoard.slug === 'aqa')
  const e = subject()
  e.sequence.push({ ...unit('a'), examBoard: { slug: 'ocr', title: 'OCR' } })
  const ef = filterSequence(e, 'science-secondary', allOpen(e))
  check('a unit slug with two different exam boards gives its lessons no exam board rather than a guess', ef.lessons.find((l) => l.lessonSlug === 'open-1').examBoard === null)
}

// ---------------------------------------------------------------- a bad download is never saved
{
  const bad = (mutate) => { const s = subject(); mutate(s); return fails(() => filterSequence(s, 'science-secondary', allOpen(s))) }
  check('the wrong sequence', /not science-secondary/.test(await bad((s) => { s.sequenceSlug = 'maths-secondary' })))
  check('no units', /no units/.test(await bad((s) => { s.sequence = [] })))
  check('no lessons', /no lessons/.test(await bad((s) => { s.lessons = [] })))
  check('a lesson whose unit is not there', /not in the sequence/.test(await bad((s) => { s.lessons[0].unitSlug = 'nope' })))
  check('the same unit twice with nothing to tell them apart', /repeated/.test(await bad((s) => { s.sequence.push(s.sequence[0]) })))
  check('a lesson twice with different content', /different content/.test(await bad((s) => { s.lessons.push({ ...s.lessons[0], lessonTitle: 'Other' }) })))
  check('a lesson with no title', /no slug, title or unit/.test(await bad((s) => { delete s.lessons[0].lessonTitle })))
}

// ---------------------------------------------------------------- the load re-filters a saved line
{
  const full = { ...lesson('r', 'a', { restricted: true }), sequenceSlug: 'science-secondary', examBoard: { slug: 'aqa', title: 'AQA' } }
  const again = refilterLesson(full)
  check('a restricted line saved with more than it may have is cut down when loaded', JSON.stringify(Object.keys(again).sort()) === JSON.stringify([...RESTRICTED_LESSON_KEYS].sort()) && !JSON.stringify(again).includes('Transcript'))
  check('an open line is loaded as it is', refilterLesson({ restricted: false, lessonSlug: 'o', transcript_sentences: 't' }).transcript_sentences === 't')
  check('a unit saved without open lessons but with text loses the text', !('description' in refilterUnit({ unitSlug: 'u', hasOpenLessons: false, description: 'x' })))
  check('a unit with open lessons is loaded as it is', refilterUnit({ unitSlug: 'u', hasOpenLessons: true, description: 'x' }).description === 'x')
}

// ---------------------------------------------------------------- the fetch
{
  const root = fresh('fetch')
  const calls = []
  const seenZips = []
  const download = async (slug, to, { key }) => { calls.push({ slug, key }); fs.writeFileSync(to, 'zip'); seenZips.push(to) }
  const data = { 'science-secondary': subject() }
  const readJson = async (_zip, slug) => structuredClone(data[slug])
  const verdictsOf = async (slugs) => Object.fromEntries(slugs.map((x) => [x, 'ogl-compatible']))
  const written = await fetchOak({ root, key: 'K', subjects: ['science-secondary'], log: quiet, download, readJson, check: verdictsOf, pauseMs: 0 })
  const dir = path.join(root, OAK_DIR)
  check('it writes a units file and a lessons file for the subject', written.length === 2 && fs.existsSync(path.join(dir, 'units_science-secondary.jsonl')) && fs.existsSync(path.join(dir, 'lessons_science-secondary.jsonl')))
  check('the key goes to the download and nowhere into the files', calls[0].key === 'K' && !fs.readdirSync(dir).some((n) => fs.readFileSync(path.join(dir, n), 'utf8').includes('"K"')))
  const lines = fs.readFileSync(path.join(dir, 'lessons_science-secondary.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  check('the saved lessons hold no restricted detail', lines.length === 3 && !/must not be kept|WEBVTT.*closed/.test(JSON.stringify(lines.filter((l) => l.restricted))) && leaks(lines, []).length === 0)
  check('the raw download is gone (its temporary folder is removed)', seenZips.every((z) => !fs.existsSync(z) && !fs.existsSync(path.dirname(z))))
  check('nothing but the filtered files and the state is in the folder (no raw JSON, no zip)', fs.readdirSync(dir).every((n) => /^(units|lessons)_.*\.jsonl$|^state\.json$/.test(n)), fs.readdirSync(dir).join())
  const again = await fetchOak({ root, key: 'K', subjects: ['science-secondary'], log: quiet, download, readJson, check: verdictsOf, pauseMs: 0 })
  check('a second run with nothing new writes nothing', again.length === 0)
  data['science-secondary'].lessons.push(lesson('open-2', 'a'))
  const changed = await fetchOak({ root, key: 'K', subjects: ['science-secondary'], log: quiet, download, readJson, check: verdictsOf, pauseMs: 0 })
  check('a changed subject writes only the file that changed (a new lesson in a unit that already had an open one: the lessons)', changed.length === 1 && /lessons_science-secondary/.test(changed[0]))
  data['science-secondary'].lessons = data['science-secondary'].lessons.slice(0, 1)
  check('lessons shrinking by more than 5% is not saved, unless accepted', /fell from 4 to 1/.test(await fails(() => fetchOak({ root, key: 'K', subjects: ['science-secondary'], log: quiet, download, readJson, check: verdictsOf, pauseMs: 0 }))))
  const failedRaw = []
  const boom = async (slug, to) => { failedRaw.push(to); fs.writeFileSync(to, 'zip'); throw new Error('Oak bulk: 500') }
  await fails(() => fetchOak({ root: fresh('boom'), key: 'K', subjects: ['science-secondary'], log: quiet, download: boom, readJson, pauseMs: 0 }))
  check('after a failed download the temporary folder is removed too', failedRaw.every((z) => !fs.existsSync(path.dirname(z))))
  check('no key: it stops before asking', /OAK_API_KEY is not set/.test(await fails(() => downloadBulk('x', '/nonexistent/x.zip', { key: '' }))))
  const posts = []
  const post = async (url, opts) => { posts.push({ url, auth: opts.headers.authorization, body: opts.body }); return { ok: false, status: 429, statusText: 'Too Many', headers: { get: () => '0' } } }
  check('a 429 is tried again, then fails with the status', /429/.test(await fails(() => downloadBulk('science-secondary', '/tmp/x.zip', { key: 'K', post, tries: 2, sleep: async () => {} }))) && posts.length === 2 && posts[0].url.endsWith('/api/bulk') && posts[0].auth === 'Bearer K' && posts[0].body === '{"subjects":["science-secondary"]}')
  check('17 subjects, all secondary', OAK_SUBJECTS.length === 17 && OAK_SUBJECTS.every((s) => s.endsWith('-secondary')))
}

// ---------------------------------------------------------------- load step 52
{
  const root = fresh('load')
  const dir = path.join(root, OAK_DIR)
  fs.mkdirSync(dir, { recursive: true })
  const f = filterSequence(subject(), 'science-secondary', allOpen(subject()))
  // A lessons file saved with a restricted lesson's transcript still in it (an earlier rule).
  const sloppy = f.lessons.map((l) => (l.restricted ? { ...l, transcript_sentences: 'leaked' } : l))
  fs.writeFileSync(path.join(dir, 'units_science-secondary.jsonl'), f.units.map((u) => JSON.stringify(u)).join('\n') + '\n')
  fs.writeFileSync(path.join(dir, 'lessons_science-secondary.jsonl'), sloppy.map((l) => JSON.stringify(l)).join('\n') + '\n')
  const step = oakSteps(root)[52]
  check('step 52 is the Oak load, in the load:data steps and the oak fetch', step.job === 'load-oak' && STEPS[52]?.job === 'load-oak' && JSON.stringify(LOAD_STEPS.oak) === '[52,53]')
  const specs = []
  await step.run({ loadJsonLines: async (spec) => { specs.push(spec); return [] } })
  check('units and lessons go to OPTIONS_DB.RAW.OAK_UNIT and OAK_LESSON', specs.map((s) => s.table).join() === 'OPTIONS_DB.RAW.OAK_UNIT,OPTIONS_DB.RAW.OAK_LESSON' && specs.every((s) => s.home === 'OPTIONS_DB'))
  check('as columns-removed naming what is left out, source oak-curriculum, OGL, the filtered files as the originals',
    specs.every((s) => s.kind === 'columns-removed' && JSON.stringify(s.removed) === JSON.stringify(OAK_REMOVED) && s.source === 'oak-curriculum' && /Open Government Licence v3.0/.test(s.licence) && s.stageOriginal !== false && s.originals.length === 1))
  const rows = await specs[1].rows(specs[1].originals[0])
  check('the rows of the lessons are filtered again: no leaked transcript reaches Snowflake', rows.length === 3 && !JSON.stringify(rows).includes('leaked') && rows.find((r) => r.item.lessonSlug === 'open-1').item.transcript_sentences === 'Transcript of open-1')
  check('columns: sequence, lesson, unit, exam board, restricted, the whole item', ['SEQUENCE_SLUG', 'LESSON_SLUG', 'UNIT_SLUG', 'EXAM_BOARD_SLUG', 'RESTRICTED', 'ITEM'].every((k) => k in specs[1].cols) && ['SEQUENCE_SLUG', 'UNIT_SLUG', 'KEY_STAGE_SLUG', 'EXAM_BOARD_SLUG', 'ITEM'].every((k) => k in specs[0].cols))
  const none = fresh('load-none')
  const counts = []
  await oakSteps(none)[52].run({ loadJsonLines: async (spec) => { counts.push(spec.originals.length); return [] } })
  check('with nothing fetched yet it loads nothing and does not fail', counts.join() === '0,0')
}


// ---------------------------------------------------------------- quizzes: images
const mc = (text, answers, extra = {}) => ({ question: text, questionType: 'multiple-choice', answers, ...extra })
const textAnswers = [{ type: 'text', content: 'a', distractor: true }, { type: 'text', content: 'b', distractor: false }]
{
  check('a text question has no image', !hasImage(mc('Q', textAnswers)))
  check('a question image', hasImage(mc('Q', textAnswers, { questionImage: { url: 'https://cloudinary-res.thenational.academy/x.png', width: 1, height: 1 } })))
  check('an image answer', hasImage(mc('Q', [{ type: 'image', content: 'x', distractor: false }])))
  check('an image in a match question (either side)', hasImage({ question: 'M', questionType: 'match', answers: [{ matchOption: { type: 'text', content: 'a' }, correctChoice: { type: 'image', content: 'b' } }] }))
  check('an image address hidden in some other field', hasImage(mc('Q', [{ type: 'text', content: 'https://cloudinary-res.thenational.academy/a/b.jpg', distractor: false }])))
  check('words about an image are not an image', !hasImage(mc('Which image shows a cell? (no picture here)', textAnswers)))
  const k = keptQuiz({ lessonSlug: 'l', lessonTitle: 'L', starterQuiz: [mc('t', textAnswers), mc('i', textAnswers, { questionImage: { url: 'u', width: 1, height: 1 } })], exitQuiz: [mc('i2', [{ type: 'image' }])] })
  check('a quiz loses its image questions and counts them', k.starterQuiz.length === 1 && k.exitQuiz.length === 0 && k.questionsLeftOut.starter === 1 && k.questionsLeftOut.exit === 1)
  check('a missing quiz is empty, not an error', keptQuiz({ lessonSlug: 'l', lessonTitle: 'L' }).starterQuiz.length === 0)
  const again = refilterQuiz({ ...k, starterQuiz: [...k.starterQuiz, mc('late', textAnswers, { questionImage: { url: 'u' } })] })
  check('filtered again at load: a late image question goes, and what was left out before stays counted', again.starterQuiz.length === 1 && again.questionsLeftOut.starter === 2 && again.questionsLeftOut.exit === 1)
}

// ---------------------------------------------------------------- quizzes: the fetch
{
  const root = fresh('quiz')
  const dir = path.join(root, OAK_DIR)
  fs.mkdirSync(dir, { recursive: true })
  const f = filterSequence(subject(), 'science-secondary', allOpen(subject()))
  fs.writeFileSync(path.join(dir, 'lessons_science-secondary.jsonl'), f.lessons.map((l) => JSON.stringify(l)).join('\n') + '\n')
  check('only the open lessons are in the open list', JSON.stringify([...openLessonSlugs(dir)]) === '["open-1"]')
  const asked = []
  const entries = [
    { lessonSlug: 'open-1', lessonTitle: 'Lesson open-1', starterQuiz: [mc('t', textAnswers), mc('i', textAnswers, { questionImage: { url: 'u', width: 1, height: 1 } })], exitQuiz: [mc('t2', textAnswers)] },
    { lessonSlug: 'closed-1', lessonTitle: 'Lesson closed-1', starterQuiz: [mc('must not be kept', textAnswers)], exitQuiz: [] },
    { lessonSlug: 'not-in-bulk', lessonTitle: 'x', starterQuiz: [mc('unknown lesson', textAnswers)], exitQuiz: [] },
  ]
  const api = async (p, { body }) => {
    asked.push(p)
    if (p === '/subjects/science') return { json: { sequenceSlugs: [{ sequenceSlug: 'science-primary', years: [1], phaseSlug: 'primary' }, { sequenceSlug: 'science-secondary-aqa', years: [6, 7, 10], phaseSlug: 'secondary' }] }, remaining: 900 }
    if (p.startsWith('/sequences/science-secondary-aqa/questions')) return { json: /year=7&/.test(p) ? entries : [], remaining: 900 }
    if (p === '/lessons/check-restricted') return { json: Object.fromEntries(body.lessonSlugs.map((s) => [s, 'ogl-compatible'])), remaining: 900 }
    throw new Error(`unexpected ${p}`)
  }
  const file = await fetchOakQuizzes({ root, key: 'K', subjects: ['science'], log: quiet, api, pauseMs: 0 })
  const lines = fs.readFileSync(path.join(dir, QUIZ_FILE), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  check('it asks for the secondary sequence in years 7 to 11 only (not primary, not year 6)', asked.filter((p) => p.includes('/questions')).map((p) => p.match(/year=(\d+)/)[1]).join() === '7,10' && !asked.some((p) => p.includes('science-primary')))
  check('and saves only the open lesson, without its image question, nothing of the restricted or unknown ones', file && lines.length === 1 && lines[0].lessonSlug === 'open-1' && lines[0].starterQuiz.length === 1 && lines[0].questionsLeftOut.starter === 1 && !JSON.stringify(lines).includes('must not be kept') && !JSON.stringify(lines).includes('unknown lesson'))
  check('a second run with nothing new writes nothing', (await fetchOakQuizzes({ root, key: 'K', subjects: ['science'], log: quiet, api, pauseMs: 0 })) === null)
  const hold = async (p, o) => (p === '/lessons/check-restricted' ? { json: { 'open-1': 'restricted' }, remaining: 900 } : api(p, o))
  const root2 = fresh('quiz2')
  fs.mkdirSync(path.join(root2, OAK_DIR), { recursive: true })
  fs.copyFileSync(path.join(dir, 'lessons_science-secondary.jsonl'), path.join(root2, OAK_DIR, 'lessons_science-secondary.jsonl'))
  check('a lesson Oak\'s own check calls restricted is dropped (and with none left the run is refused)', /only 0 of 1 open lessons/.test(await fails(() => fetchOakQuizzes({ root: root2, key: 'K', subjects: ['science'], log: quiet, api: hold, pauseMs: 0 })) ?? ''))
  const low = async (p, o) => ({ ...(await api(p, o)), remaining: OAK_MIN_REMAINING - 1 })
  check('it stops when the hour\'s allowance runs low', /requests left of this hour's allowance/.test(await fails(() => fetchOakQuizzes({ root, key: 'K', subjects: ['science'], log: quiet, api: low, pauseMs: 0 })) ?? ''))
  check('with no lessons fetched yet it says to fetch the bulk first', /fetch the bulk download first/.test(await fails(() => fetchOakQuizzes({ root: fresh('quiz3'), key: 'K', log: quiet, api, pauseMs: 0 })) ?? ''))
  const posts = []
  const res = (status) => ({ ok: status === 200, status, statusText: 's', headers: { get: () => '5' }, json: async () => ({}) })
  let n = 0
  await oakJson('/subjects', { key: 'K', request: async (url, o) => { posts.push([url, o.headers.authorization]); return res(++n < 2 ? 429 : 200) }, sleep: async () => {} })
  check('a 429 is tried again; the key is only in the header', posts.length === 2 && posts.every(([u, a]) => !u.includes('K') && a === 'Bearer K'))
}

// ---------------------------------------------------------------- load step 53
{
  const root = fresh('quiz-load')
  const dir = path.join(root, OAK_DIR)
  fs.mkdirSync(dir, { recursive: true })
  const sloppy = { lessonSlug: 'open-1', lessonTitle: 'L', starterQuiz: [mc('t', textAnswers), mc('image one', textAnswers, { questionImage: { url: 'https://cloudinary-res.thenational.academy/x.png' } })], exitQuiz: [], questionsLeftOut: { starter: 0, exit: 0 } }
  fs.writeFileSync(path.join(dir, QUIZ_FILE), JSON.stringify(sloppy) + '\n')
  const step = oakQuizSteps(root)[53]
  check('step 53 is the Oak quiz load, in the load:data steps', step.job === 'load-oak-quiz' && STEPS[53]?.job === 'load-oak-quiz')
  const specs = []
  await step.run({ loadJsonLines: async (spec) => { specs.push(spec); return [] } })
  const rows = await specs[0].rows(specs[0].originals[0])
  check('OAK_QUIZ, columns-removed naming the image questions, the saved file as the original', specs[0].table === 'OPTIONS_DB.RAW.OAK_QUIZ' && specs[0].home === 'OPTIONS_DB' && specs[0].kind === 'columns-removed' && JSON.stringify(specs[0].removed) === JSON.stringify(QUIZ_REMOVED) && specs[0].originals.length === 1)
  check('the rows are filtered again: no image question and no Oak image address reaches Snowflake', rows.length === 1 && rows[0].item.starterQuiz.length === 1 && !JSON.stringify(rows).includes('cloudinary') && rows[0].item.questionsLeftOut.starter === 1)
  const none = fresh('quiz-none')
  const got = []
  await oakQuizSteps(none)[53].run({ loadJsonLines: async (spec) => { got.push(spec.originals.length); return [] } })
  check('with no quizzes saved it loads nothing', got.join() === '0')
}

// ---------------------------------------------------------------- the job and the no-calls check
{
  const j = JOB_SCHEDULE['official-oak']
  check('the job is monthly, overdue after 32 days, on the loader connection, in the official lock group', j.every === 30 * 24 * 3600e3 && j.overdueAfter === 32 * 24 * 3600e3 && j.connectAs === 'loader' && j.lockGroup === 'official' && JOB_ORDER.includes('official-oak') && typeof JOB_RUNNERS['official-oak'] === 'function')
  const base = fresh('nocalls')
  const clean = path.join(base, 'clean')
  const dirty = path.join(base, 'dirty')
  for (const d of [clean, dirty]) fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(path.join(clean, 'a.js'), "const link = 'https://www.thenational.academy/teachers/lessons/some-lesson'\n")
  fs.writeFileSync(path.join(dirty, 'b.js'), "fetch('https://open-api.thenational.academy/api/v0/lessons/x/quiz')\n")
  fs.writeFileSync(path.join(dirty, 'c.html'), '<img src="https://cloudinary-res.thenational.academy/i.png">')
  fs.writeFileSync(path.join(dirty, 'd.json'), '{"k":"process.env.OAK_API_KEY"}')
  fs.writeFileSync(path.join(dirty, '.env'), 'OAK_API_KEY=secret')
  check('a link to an Oak lesson is allowed', findOakCalls(clean).length === 0)
  check('the API address, the image server and the key name are found (and .env is not read)', findOakCalls(dirty).length === 3 && findOakCalls(dirty).every((x) => !x.file.endsWith('.env')) && FORBIDDEN.length === 3)
}

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
