// Test: Meadow's drop-off report (server/meadowFunnel.js), read as
// CRM_APP_USER on the test journeys' seed.
//   Part 1  no database: how buildFunnel counts (skipped stages, furthest
//           stage, positive outcomes, % carried on, the totals)
//   Part 2  the database: ORG-T003's fixed seeded figures, and that the
//           totals reconcile: everyone reached the first stage, the "left
//           from" counts add up to everyone not proceeding, joined =
//           enrolled + in progress + not proceeding, and at every stage
//           reached = left there + still there + reached the next. Checked
//           again against a recount from the raw rows and against the
//           board's own totals. ORG-T001 sees only its own.
// Reads only: changes no data.
//   node test/db/meadow-funnel.mjs
import { connect, execute, destroy } from '../../server/db.js'
import { buildFunnel, loadFunnel } from '../../server/meadowFunnel.js'
import { loadBoard } from '../../server/meadow.js'

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`)
}
const stagesOf = (f) => f.bands.flatMap((b) => b.stages)
const col = (f, k) => stagesOf(f).map((s) => s[k])

// Every stage: reached = left there + still there + enrolled there (the
// last stage) + reached the next.
function stagesAddUp(f) {
  const s = stagesOf(f)
  return s.every((x, i) => x.reached === x.left + x.stillHere + (i === s.length - 1 ? x.reached - x.left - x.stillHere : 0) + (s[i + 1]?.reached ?? 0))
}

// ---------------------------------------------------------------- part 1
console.log('Part 1: counting')
{
  const st = (key, name, order, category = 'open', systemKey = null) => ({ STAGEID: `ST-X-CANDIDATE-${key}`, NAME: name, SORTORDER: order, CATEGORY: category, SYSTEMKEY: systemKey })
  const stages = [st('NEW', 'New', 1), st('CONTACTED', 'Contacted', 3), st('MATCHED', 'Matched', 4), st('OFFERED', 'Offered', 6),
    st('ENROLLED', 'Enrolled', 8, 'won', 'ENROLLED'), st('LOST', 'Not proceeding', 9, 'lost', 'LOST')]
  const reasons = [{ REASONID: 'CR-X-CANDIDATE-COLLEGE', LABEL: 'Chose college or sixth form', SORTORDER: 1 },
    { REASONID: 'CR-X-CANDIDATE-NO_RESPONSE', LABEL: 'No response', SORTORDER: 4 }]
  const f = buildFunnel({
    stages, reasons,
    journeys: [
      { CATEGORY: 'open', CLOSEREASONID: null, FURTHEST: 1, N: 4 },
      { CATEGORY: 'open', CLOSEREASONID: null, FURTHEST: 4, N: 2 }, // skipped Contacted
      { CATEGORY: 'lost', CLOSEREASONID: 'CR-X-CANDIDATE-NO_RESPONSE', FURTHEST: 1, N: 3 },
      { CATEGORY: 'lost', CLOSEREASONID: 'CR-X-CANDIDATE-COLLEGE', FURTHEST: 3, N: 2 },
      { CATEGORY: 'lost', CLOSEREASONID: 'CR-X-CANDIDATE-NO_RESPONSE', FURTHEST: 3, N: 1 },
      { CATEGORY: 'lost', CLOSEREASONID: null, FURTHEST: null, N: 1 }, // straight to Not proceeding
      { CATEGORY: 'lost', CLOSEREASONID: 'CR-X-CANDIDATE-NO_RESPONSE', FURTHEST: 5, N: 1 }, // a stage since removed: counts at Matched
      { CATEGORY: 'won', CLOSEREASONID: null, FURTHEST: 8, N: 5 },
    ],
  })
  check('reached: that stage or any later one', col(f, 'reached').join() === '19,11,8,5,5', col(f, 'reached').join())
  check('  someone who skipped Contacted still reached it', stagesOf(f)[1].reached === 11)
  check('left from: their furthest stage; no stage counts as the first', col(f, 'left').join() === '4,3,1,0,0', col(f, 'left').join())
  check('% carried on to the next stage; none for the last', col(f, 'carriedOn').join() === `${Math.round(11 / 19 * 100)},${Math.round(8 / 11 * 100)},${Math.round(5 / 8 * 100)},100,`,
    col(f, 'carriedOn').join())
  const contacted = stagesOf(f)[1].leftReasons
  check('why they left, most first; college is a good outcome', contacted.map((r) => `${r.label} ${r.count} ${r.positive}`).join() ===
    'Chose college or sixth form 2 true,No response 1 false', JSON.stringify(contacted))
  check('  no reason recorded is said so', stagesOf(f)[0].leftReasons.some((r) => r.label === 'No reason recorded' && r.count === 1))
  check('totals: 19 joined = 5 enrolled + 6 in progress + 8 not proceeding (2 chose college)', JSON.stringify(f.totals) ===
    JSON.stringify({ joined: 19, enrolled: 5, inProgress: 6, notProceeding: 8, positive: 2 }), JSON.stringify(f.totals))
  check('  and reconcile', Object.values(f.reconciles).every(Boolean) && stagesAddUp(f))
  check('the board\'s bands: Getting to know them, Matching, Starting', f.bands.map((b) => `${b.key}:${b.stages.map((s) => s.key).join(' ')}`).join(' | ') ===
    'know:NEW CONTACTED | match:MATCHED | start:OFFERED ENROLLED')
  const empty = buildFunnel({ stages, reasons, journeys: [] })
  check('nobody yet: all zeros, still reconciles', empty.totals.joined === 0 && col(empty, 'reached').every((n) => n === 0) && Object.values(empty.reconciles).every(Boolean))
}

// ---------------------------------------------------------------- part 2
console.log('Part 2: the seeded figures, as CRM_APP_USER')
const crm = await connect({ as: 'crm', timeoutMs: 30000 })
try {
  const f = await loadFunnel(crm, 'ORG-T003')
  const seeded = JSON.stringify(f.totals) === JSON.stringify({ joined: 500, enrolled: 100, inProgress: 44, notProceeding: 356, positive: 9 })
  if (!seeded) {
    console.log(`FAIL ORG-T003 isn't the seeded test journeys: run the test reset first  [${JSON.stringify(f.totals)}]`)
    failures++
  } else {
    check('ORG-T003: 500 joined = 100 enrolled + 44 in progress + 356 not proceeding (9 chose college)', true)
  }
  check('  reached per stage', col(f, 'reached').join() === '500,408,345,254,179,142,119,100', col(f, 'reached').join())
  check('  left from each stage', col(f, 'left').join() === '87,59,84,68,32,19,7,0', col(f, 'left').join())
  check('  % carried on', col(f, 'carriedOn').join() === '82,85,74,70,79,84,84,', col(f, 'carriedOn').join())
  check('everyone reached the first stage', stagesOf(f)[0].reached === f.totals.joined && f.reconciles.everyoneReachedFirst)
  check('the "left from" counts add up to everyone not proceeding', col(f, 'left').reduce((a, b) => a + b, 0) === f.totals.notProceeding && f.reconciles.leftAddsUp)
  check('joined = enrolled + in progress + not proceeding', f.totals.joined === f.totals.enrolled + f.totals.inProgress + f.totals.notProceeding && f.reconciles.outcomesAddUp)
  check('at every stage, reached = left there + still there + reached the next', stagesAddUp(f))
  check('  the last stage (Enrolled) reached = everyone enrolled', stagesOf(f).at(-1).reached === f.totals.enrolled)
  check('every stage\'s reasons add up to those who left there', stagesOf(f).every((s) => s.leftReasons.reduce((n, r) => n + r.count, 0) === s.left))
  const college = stagesOf(f).flatMap((s) => s.leftReasons).filter((r) => r.positive)
  check('"Chose college or sixth form" is the good outcome, 9 in all', college.length > 0 && college.every((r) => r.label === 'Chose college or sixth form') &&
    college.reduce((n, r) => n + r.count, 0) === 9)

  // A recount straight from the rows, in JavaScript.
  const items = await execute(crm, `
    select i.ITEMID, s.SORTORDER, s.CATEGORY from CRM_DB.CRM.PIPELINE_ITEM i
    join CRM_DB.CRM.PIPELINE_STAGE s on s.STAGEID = i.STAGEID and s.ORGANISATIONID = i.ORGANISATIONID
    where i.ORGANISATIONID = 'ORG-T003' and i.RECORDTYPE = 'lead'`)
  const moves = await execute(crm, `
    select c.ITEMID, s.SORTORDER, s.CATEGORY from CRM_DB.CRM.STAGE_CHANGE c
    join CRM_DB.CRM.PIPELINE_STAGE s on s.STAGEID = c.TOSTAGEID and s.ORGANISATIONID = c.ORGANISATIONID
    where c.ORGANISATIONID = 'ORG-T003'`)
  const furthest = new Map(items.map((i) => [i.ITEMID, i.CATEGORY === 'lost' ? 1 : Number(i.SORTORDER)]))
  for (const m of moves) if (furthest.has(m.ITEMID) && m.CATEGORY !== 'lost') furthest.set(m.ITEMID, Math.max(furthest.get(m.ITEMID), Number(m.SORTORDER)))
  const recount = [1, 2, 3, 4, 5, 6, 7, 8].map((o) => [...furthest.values()].filter((h) => h >= o).length)
  check('a recount from the raw rows agrees', recount.join() === col(f, 'reached').join(), recount.join())

  const board = await loadBoard(crm, 'ORG-T003')
  check("the board agrees: in progress, not proceeding and enrolled", board.open === f.totals.inProgress && board.notProceeding === f.totals.notProceeding &&
    board.enrolledInAll === f.totals.enrolled, `${board.open} ${board.notProceeding} ${board.enrolledInAll}`)

  const t1 = await loadFunnel(crm, 'ORG-T001')
  check('ORG-T001: only its own 10 (1 not proceeding: chose college at Contacted)', JSON.stringify(t1.totals) ===
    JSON.stringify({ joined: 10, enrolled: 0, inProgress: 9, notProceeding: 1, positive: 1 }) && stagesOf(t1)[2].leftReasons[0]?.positive === true,
    JSON.stringify(t1.totals))
  const none = await loadFunnel(crm, 'ORG-NONE')
  check('an organisation with no pipeline: an empty report', none.bands.length === 0 && none.totals.joined === 0)
} finally {
  await destroy(crm)
}

console.log(failures ? `${failures} failed` : 'all passed')
process.exit(failures ? 1 : 0)
