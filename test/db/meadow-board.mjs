// Test: Meadow's people pipeline board (server/meadow.js), read as
// CRM_APP_USER on the test journeys' seed.
//   Part 1  no database: how buildBoard lays out stages, bands and cards
//   Part 2  the database: the fixed seeded counts for ORG-T003 (the test
//           journeys) and ORG-T001, each board only its own organisation's
//           people, and Meadow's user can't read Warren's database
// Reads only: changes no data.
//   node test/db/meadow-board.mjs
import { connect, execute, destroy } from '../../server/db.js'
import { buildBoard, daysText, loadBoard } from '../../server/meadow.js'

let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`)
}
const stagesOf = (board) => board.bands.flatMap((b) => b.stages)
const countsOf = (board) => Object.fromEntries(stagesOf(board).map((s) => [s.name, s.count]))

// ---------------------------------------------------------------- part 1
console.log('Part 1: laying out the board')
{
  const st = (key, name, order, category = 'open', systemKey = null) =>
    ({ STAGEID: `ST-ORG-X-CANDIDATE-${key}`, NAME: name, SORTORDER: order, CATEGORY: category, SYSTEMKEY: systemKey })
  const stages = [
    st('NEW', 'New', 1, 'open', 'NEW'), st('CONFIRMED', 'Confirmed', 2, 'open', 'CONFIRMED'), st('CONTACTED', 'Contacted', 3),
    st('MATCHED', 'Matched', 4), st('TRIAL', 'Work trial', 4.5), st('INTERVIEWING', 'Interviewing', 5), st('OFFERED', 'Offered', 6),
    st('ASSESSMENT', 'Initial assessment', 7, 'open', 'ASSESSMENT'), st('ENROLLED', 'Enrolled', 8, 'won', 'ENROLLED'),
    st('LOST', 'Not proceeding', 9, 'lost', 'LOST'),
  ]
  const now = Date.parse('2026-10-16T12:00:00Z')
  const row = (id, key, since, extra = {}) => ({
    ITEMID: id, STAGEID: `ST-ORG-X-CANDIDATE-${key}`, INSTAGESINCE: since, OWNERUSERID: 'USR-1', LEADID: `L-${id}`,
    GIVENNAMES: 'Ada', FAMILYNAME: 'Test', POSTCODE: 'S6 2LP', CURRENTSITUATION: 'school', ANONYMISEDAT: null,
    INTERESTS: JSON.stringify([{ text: 'sparky', title: 'Electricians and electrical fitters' }]), CANEMAIL: true, ...extra,
  })
  const board = buildBoard({
    stages,
    cards: [
      row('a', 'NEW', '2026-10-16T09:00:00Z'),
      row('b', 'MATCHED', '2026-10-06T12:00:00Z', { OWNERUSERID: null, CANEMAIL: false, INTERESTS: null }),
      row('c', 'MATCHED', '2026-10-15T11:00:00Z', { ANONYMISEDAT: '2026-10-01T00:00:00Z' }),
      row('d', 'ENROLLED', '2026-10-01T12:00:00Z'), row('e', 'ENROLLED', '2026-10-10T12:00:00Z'),
    ],
    closed: [{ STAGEID: 'ST-ORG-X-CANDIDATE-LOST', N: 357 }, { STAGEID: 'ST-ORG-X-CANDIDATE-ENROLLED', N: 100 }],
    owners: [{ USERID: 'USR-1', DISPLAYNAME: 'Grace Testmanager04' }],
    now,
  })
  check('three bands in option C order', board.bands.map((b) => b.name).join() === 'Getting to know them,Matching,Starting')
  check('  stages in each band', board.bands.map((b) => b.stages.map((s) => s.key).join(' ')).join(' | ') ===
    'NEW CONFIRMED CONTACTED | MATCHED TRIAL INTERVIEWING | OFFERED ASSESSMENT ENROLLED', board.bands.map((b) => b.stages.map((s) => s.key).join(' ')).join(' | '))
  check('  a stage added later joins the band of the stage before it (Work trial in Matching)', board.bands[1].stages[1].name === 'Work trial')
  check('Not proceeding is a count, not a column', board.notProceeding === 357 && !stagesOf(board).some((s) => s.key === 'LOST'))
  check('enrolled in all from the closed journeys; Enrolled says "Last 30 days", newest first', board.enrolledInAll === 100 &&
    stagesOf(board).find((s) => s.key === 'ENROLLED').note === 'Last 30 days' &&
    stagesOf(board).find((s) => s.key === 'ENROLLED').cards.map((c) => c.itemId).join() === 'e,d')
  check('open counts leave out Enrolled', board.open === 3, board.open)
  const [b, c] = stagesOf(board).find((s) => s.key === 'MATCHED').cards
  const a = board.bands[0].stages[0].cards[0]
  check('a card: name, initials, postcode district, situation, interests, owner, consent', a.name === 'Ada Test' && a.initials === 'AT' &&
    a.district === 'S6' && a.situation === 'At school' && a.interests[0].text === 'sparky' && a.owner === 'Grace Testmanager04' && a.canEmail, JSON.stringify(a))
  check('  days in stage: today, 10 days', a.days === 0 && b.days === 10 && b.daysText === '10 days' && daysText(1) === '1 day', `${a.days} ${b.days}`)
  check('  no owner, no consent, no interests', b.owner === null && b.canEmail === false && b.interests.length === 0)
  check('  an anonymised person shows no name or postcode', c.name === 'Anonymised' && c.district === null && c.initials === '–')
}

// ---------------------------------------------------------------- part 2
console.log('Part 2: the seeded boards, as CRM_APP_USER')
const crm = await connect({ as: 'crm', timeoutMs: 30000 })
try {
  const t3 = await loadBoard(crm, 'ORG-T003')
  const t3Counts = { New: 5, Confirmed: 4, Contacted: 7, Matched: 7, Interviewing: 5, Offered: 4, 'Initial assessment': 12 }
  const seeded = Object.entries(t3Counts).every(([k, v]) => countsOf(t3)[k] === v) && t3.notProceeding === 356 && t3.enrolledInAll === 100
  if (!seeded) {
    console.log(`FAIL ORG-T003 isn't the seeded test journeys: run the test reset first  [${JSON.stringify(countsOf(t3))} not proceeding ${t3.notProceeding} enrolled ${t3.enrolledInAll}]`)
    failures++
  } else {
    check('ORG-T003: the seeded open journeys per stage', true, JSON.stringify(countsOf(t3)))
  }
  check('  44 in the pipeline, 356 not proceeding, 100 enrolled in all', t3.open === 44 && t3.notProceeding === 356 && t3.enrolledInAll === 100,
    `${t3.open} ${t3.notProceeding} ${t3.enrolledInAll}`)
  const [{ N: enrolled30 }] = await execute(crm, `
    select count(*) as N from CRM_DB.CRM.PIPELINE_ITEM i
    join CRM_DB.CRM.PIPELINE_STAGE s on s.STAGEID = i.STAGEID
    where i.ORGANISATIONID = 'ORG-T003' and s.SYSTEMKEY = 'ENROLLED' and i.STAGECHANGEDAT >= dateadd(day, -30, current_timestamp())`)
  check('  Enrolled: those enrolled in the last 30 days, as the table says', countsOf(t3).Enrolled === Number(enrolled30), `${countsOf(t3).Enrolled} / ${enrolled30}`)
  check('  each column count is its number of cards', stagesOf(t3).every((s) => s.count === s.cards.length))
  const cards = stagesOf(t3).flatMap((s) => s.cards)
  check('  every card has a name, interests and email consent (as seeded)', cards.every((c) => c.name && c.interests.length > 0 && c.canEmail),
    cards.filter((c) => !c.interests.length || !c.canEmail).map((c) => c.leadId).join())
  check('  owners are ORG-T003 staff by name', cards.filter((c) => c.owner).every((c) => /Test/.test(c.owner)) && cards.some((c) => c.owner))

  const t1 = await loadBoard(crm, 'ORG-T001')
  const t1Counts = { New: 2, Confirmed: 2, Contacted: 1, Matched: 1, Interviewing: 1, Offered: 0, 'Initial assessment': 2 }
  check('ORG-T001: its own seeded journeys', Object.entries(t1Counts).every(([k, v]) => countsOf(t1)[k] === v) && t1.open === 9 && t1.notProceeding === 1,
    `${JSON.stringify(countsOf(t1))} not proceeding ${t1.notProceeding}`)

  const leadsOf = async (org) => new Set((await execute(crm, 'select LEADID from CRM_DB.CRM.LEAD where ORGANISATIONID = ?', [org])).map((r) => r.LEADID))
  const [own3, own1] = [await leadsOf('ORG-T003'), await leadsOf('ORG-T001')]
  const ids = (board) => stagesOf(board).flatMap((s) => s.cards.map((c) => c.leadId))
  check("each board shows only its own organisation's people", ids(t3).every((id) => own3.has(id)) && ids(t1).every((id) => own1.has(id)) &&
    !ids(t3).some((id) => own1.has(id)))
  const none = await loadBoard(crm, 'ORG-NONE')
  check('an organisation with no pipeline: an empty board', none.bands.length === 0 && none.open === 0 && none.notProceeding === 0)

  let refused = false
  try {
    await execute(crm, 'select count(*) from CAPTURE_DB.ILR.LEARNER')
  } catch {
    refused = true
  }
  check("Meadow's user can't read Warren's learners (CAPTURE_DB)", refused)
} finally {
  await destroy(crm)
}

console.log(failures ? `${failures} failed` : 'all passed')
process.exit(failures ? 1 : 0)
