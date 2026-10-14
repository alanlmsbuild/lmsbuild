// Test: SOC 2020 codes for adverts (scripts/vacancy-soc.js).
//   Part 1  no database: titles cleaned, the activity words, and the rule
//           (the standard wins over the title) on made-up adverts
//   Part 2  the real table, as DATA_LOAD_USER: every live advert coded;
//           a second run changes nothing; one row per advert and code; a
//           code marked gone comes back on the same row, not a new one.
//           Part 2 writes the real codes (the coder's normal work).
//   node test/db/vacancy-soc.mjs
import { connect, execute, destroy } from '../../server/db.js'
import { normaliseTitle, readActivityWords, makeTitleCoder, codesFor, codeAdverts } from '../../scripts/vacancy-soc.js'

let failures = 0
const check = (label, ok, detail = '') => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`) }

console.log('Part 1: no database')
check('a title loses apprenticeship words and the place after a dash', normaliseTitle('Apprentice Dental Nurse - Leamington Spa') === 'dental nurse')
check('  level and brackets too', normaliseTitle('Level 3 Nursery Practitioner (Apprentice)') === 'nursery practitioner')
check('  a curly apostrophe is straightened', normaliseTitle('Chef’s Assistant') === "chef's assistant")
const words = await readActivityWords()
check('the reviewed activity words load', words.size === 203 && words.get('childcare') === '6111', `${words.size} phrases`)
check('  NOT A JOB phrases code to nothing', words.has('nandoca') && words.get('nandoca') === null)

const index = [
  { title: 'Dental nurse', qualified: false, soc: '6133' },
  { title: 'Teaching assistant', qualified: false, soc: '6112' },
  { title: 'Teaching assistant', qualified: false, soc: '6113' },
  { title: 'Plasterer', qualified: false, soc: '5321' },
]
const code = makeTitleCoder(index, new Map([['childcare', '6111'], ['nandoca', null]]))
const ad = (title) => ({ VACANCYREFERENCE: 'X', TITLE: title })
const rows = (title, standard) => codesFor(ad(title), new Set(standard), code(title))
const one = (r) => r.map((x) => `${x.SOC2020}:${x.METHOD}:${x.FLAG ?? ''}`).join(' ')
check('title agrees with one of the standard\'s codes: that one, title-confirmed', one(rows('Apprentice Dental Nurse', ['6133', '3213'])) === '6133:title-confirmed:')
check('title disagrees: all the standard\'s, flagged', one(rows('Plasterer Apprentice', ['6133', '3213'])) === '3213:standard:title-disagrees 6133:standard:title-disagrees')
check('  and the title\'s own code kept for review', rows('Plasterer Apprentice', ['6133'])[0].TITLESOC === '5321')
check('title ambiguous: all the standard\'s, flagged', one(rows('Teaching Assistant', ['6113'])) === '6113:standard:title-ambiguous')
check('title not coded: all the standard\'s, flagged', one(rows('Groundwork apprenticeship', ['8149'])) === '8149:standard:title-uncoded')
check('no standard: the title alone', one(rows('Childcare Apprentice', [])) === '6111:title:')
check('no standard, NOT A JOB: nothing', rows('Nandoca', []).length === 0 && code('Nandoca').notAJob === true)
check('no standard, title not coded: nothing, never guessed', rows('Something unusual', []).length === 0)

console.log('Part 2: the real table, as DATA_LOAD_USER')
const c = await connect({ as: 'loader' })
const q = (sql, binds = []) => execute(c, sql, binds)
try {
  const first = await codeAdverts({ connection: c, log: () => {} })
  const [live] = await q(`select count(*) as N from SHARED_DB.EXT.VACANCY where GONEAT is null`)
  check('every live advert coded or counted', first.titleConfirmed + first.standard + first.title + first.uncoded === Number(live.N), JSON.stringify(first))
  const again = await codeAdverts({ connection: c, log: () => {} })
  check('a second run changes nothing', again.inserted === 0 && again.updated === 0 && again.markedGone === 0, JSON.stringify({ inserted: again.inserted, updated: again.updated, gone: again.markedGone }))
  const [dupes] = await q(`select count(*) as N from (select VACANCYREFERENCE, SOC2020 from SHARED_DB.EXT.VACANCY_SOC group by 1, 2 having count(*) > 1)`)
  check('one row per advert and code', Number(dupes.N) === 0)
  const [row] = await q(`select VACANCYREFERENCE, SOC2020 from SHARED_DB.EXT.VACANCY_SOC where GONEAT is null limit 1`)
  await q(`update SHARED_DB.EXT.VACANCY_SOC set GONEAT = current_timestamp() where VACANCYREFERENCE = ? and SOC2020 = ?`, [row.VACANCYREFERENCE, row.SOC2020])
  const [before] = await q('select count(*) as N from SHARED_DB.EXT.VACANCY_SOC')
  const revived = await codeAdverts({ connection: c, log: () => {} })
  const [after] = await q('select count(*) as N from SHARED_DB.EXT.VACANCY_SOC')
  const [back] = await q(`select GONEAT from SHARED_DB.EXT.VACANCY_SOC where VACANCYREFERENCE = ? and SOC2020 = ?`, [row.VACANCYREFERENCE, row.SOC2020])
  check('a code marked gone that applies again is cleared on its own row', revived.updated === 1 && revived.inserted === 0 && back.GONEAT === null && Number(after.N) === Number(before.N),
    `${row.VACANCYREFERENCE} ${row.SOC2020}: updated ${revived.updated}, inserted ${revived.inserted}, rows ${before.N} -> ${after.N}`)
} finally {
  await destroy(c)
}
console.log(failures ? `\n${failures} failed` : '\nAll passed')
process.exit(failures ? 1 : 0)
