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
const subject = () => ({
  sequenceSlug: 'science-secondary', subjectTitle: 'Science',
  sequence: [unit('a', { examBoard: { slug: 'aqa', title: 'AQA' } }), unit('b', { examBoard: { slug: 'ocr', title: 'OCR' } })],
  lessons: [lesson('open-1', 'a'), lesson('closed-1', 'a', { restricted: true }), lesson('closed-2', 'b', { restricted: true, transcript_sentences: 'must not be kept' })],
})

// ---------------------------------------------------------------- the filter
{
  const f = filterSequence(subject(), 'science-secondary')
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
  check('counts', JSON.stringify(f.counts) === JSON.stringify({ units: 2, lessons: 3, restricted: 2, unitsWithoutOpenLessons: 1 }), JSON.stringify(f.counts))
  check('no leaks in the filtered lines', leaks(f.lessons, f.units).length === 0)
  check('a leak is found: a restricted lesson with a transcript, a text-less unit with a description', leaks([{ ...closed, transcript_sentences: 'x' }], [{ ...b, description: 'x' }]).length === 2)
  check('restricted means anything but absent or false', isRestricted({ restricted: true }) && isRestricted({ restricted: 'yes' }) && isRestricted({ restricted: null }) && !isRestricted({}) && !isRestricted({ restricted: false }))
  check('a lesson with no unit in the sequence has no exam board', keptLesson({ lessonSlug: 's', lessonTitle: 't', unitSlug: 'zzz', unitTitle: 'z', restricted: true }, 'x', new Map()).examBoard === null)
}

// ---------------------------------------------------------------- a bad download is never saved
{
  const bad = (mutate) => { const s = subject(); mutate(s); return fails(() => filterSequence(s, 'science-secondary')) }
  check('the wrong sequence', /not science-secondary/.test(await bad((s) => { s.sequenceSlug = 'maths-secondary' })))
  check('no units', /no units/.test(await bad((s) => { s.sequence = [] })))
  check('no lessons', /no lessons/.test(await bad((s) => { s.lessons = [] })))
  check('a lesson whose unit is not there', /not in the sequence/.test(await bad((s) => { s.lessons[0].unitSlug = 'nope' })))
  check('a repeated unit', /repeated/.test(await bad((s) => { s.sequence.push(s.sequence[0]) })))
  check('a repeated lesson', /repeated/.test(await bad((s) => { s.lessons.push(s.lessons[0]) })))
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
  const written = await fetchOak({ root, key: 'K', subjects: ['science-secondary'], log: quiet, download, readJson, pauseMs: 0 })
  const dir = path.join(root, OAK_DIR)
  check('it writes a units file and a lessons file for the subject', written.length === 2 && fs.existsSync(path.join(dir, 'units_science-secondary.jsonl')) && fs.existsSync(path.join(dir, 'lessons_science-secondary.jsonl')))
  check('the key goes to the download and nowhere into the files', calls[0].key === 'K' && !fs.readdirSync(dir).some((n) => fs.readFileSync(path.join(dir, n), 'utf8').includes('"K"')))
  const lines = fs.readFileSync(path.join(dir, 'lessons_science-secondary.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  check('the saved lessons hold no restricted detail', lines.length === 3 && !/must not be kept|WEBVTT.*closed/.test(JSON.stringify(lines.filter((l) => l.restricted))) && leaks(lines, []).length === 0)
  check('the raw download is gone (its temporary folder is removed)', seenZips.every((z) => !fs.existsSync(z) && !fs.existsSync(path.dirname(z))))
  check('nothing but the filtered files and the state is in the folder (no raw JSON, no zip)', fs.readdirSync(dir).every((n) => /^(units|lessons)_.*\.jsonl$|^state\.json$/.test(n)), fs.readdirSync(dir).join())
  const again = await fetchOak({ root, key: 'K', subjects: ['science-secondary'], log: quiet, download, readJson, pauseMs: 0 })
  check('a second run with nothing new writes nothing', again.length === 0)
  data['science-secondary'].lessons.push(lesson('open-2', 'a'))
  const changed = await fetchOak({ root, key: 'K', subjects: ['science-secondary'], log: quiet, download, readJson, pauseMs: 0 })
  check('a changed subject writes only the file that changed (a new lesson in a unit that already had an open one: the lessons)', changed.length === 1 && /lessons_science-secondary/.test(changed[0]))
  data['science-secondary'].lessons = data['science-secondary'].lessons.slice(0, 1)
  check('lessons shrinking by more than 5% is not saved, unless accepted', /fell from 4 to 1/.test(await fails(() => fetchOak({ root, key: 'K', subjects: ['science-secondary'], log: quiet, download, readJson, pauseMs: 0 }))))
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
  const f = filterSequence(subject(), 'science-secondary')
  // A lessons file saved with a restricted lesson's transcript still in it (an earlier rule).
  const sloppy = f.lessons.map((l) => (l.restricted ? { ...l, transcript_sentences: 'leaked' } : l))
  fs.writeFileSync(path.join(dir, 'units_science-secondary.jsonl'), f.units.map((u) => JSON.stringify(u)).join('\n') + '\n')
  fs.writeFileSync(path.join(dir, 'lessons_science-secondary.jsonl'), sloppy.map((l) => JSON.stringify(l)).join('\n') + '\n')
  const step = oakSteps(root)[52]
  check('step 52 is the Oak load, in the load:data steps and the oak fetch', step.job === 'load-oak' && STEPS[52]?.job === 'load-oak' && JSON.stringify(LOAD_STEPS.oak) === '[52]')
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

console.log(failures ? `\n${failures} FAILED` : '\nall passed')
process.exit(failures ? 1 : 0)
