// Test: Meadow's person record (server/meadowPerson.js), read as
// CRM_APP_USER on the test journeys' seed.
//   Part 1  no database: how buildPerson lays out the record (anonymised
//           leads, consent, age, timeline, match reasons, tasks)
//   Part 2  the database, reads only: the fixed seeded record of Poppy
//           Testwood (LEAD-J0005, ORG-T003, Offered) and Finley's close
//           reason (LEAD-J0364, Not proceeding), each organisation reads
//           only its own leads, and Meadow's user can't read Warren's
//           database
//   Part 3  the view log (CRM_DB.CRM.RECORD_VIEW, sql/crm_02_record_view_tags.sql):
//           a view of our own lead adds one row, another organisation's
//           none, and the app can't read, change or remove the log. Adds
//           two test rows (ISTESTDATA TRUE, cleared by the test reset).
//   node test/db/meadow-person.mjs
//   node test/db/meadow-person.mjs --reads-only   parts 1 and 2 only
import { connect, execute, destroy } from '../../server/db.js'
import { PERSONAL_LEAD_FIELDS, ageOn, buildPerson, loadPerson, logView, reasonText } from '../../server/meadowPerson.js'

const READS_ONLY = process.argv.includes('--reads-only')
let failures = 0
const check = (label, ok, detail = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  [${detail}]` : ''}`)
}

// ---------------------------------------------------------------- part 1
console.log('Part 1: laying out the record')
{
  const lead = {
    LEADID: 'L-1', GIVENNAMES: 'Ada', FAMILYNAME: 'Test', EMAIL: 'ada@example.com', MOBILE: '07700900000',
    DATEOFBIRTH: new Date('2009-10-17T00:00:00Z'), POSTCODE: 'S6 2LP', TRAVELMILES: 1, TRAVELMODES: '["bus","walk"]',
    HOURSWANTED: 'part_time', CURRENTSITUATION: 'school', HASENGLISHLEVEL2: false, HASMATHSLEVEL2: null, SOURCE: 'web_form',
    CREATEDAT: '2026-09-01T09:00:00Z', ANONYMISEDAT: null, ITEMID: 'I-1', STAGEID: 'ST-X-CANDIDATE-MATCHED', OWNERUSERID: 'USR-1',
    OPENEDAT: '2026-09-01T09:00:00Z', INSTAGESINCE: '2026-10-01T09:00:00Z', STAGENAME: 'Matched', CATEGORY: 'open', SYSTEMKEY: null,
  }
  const stages = [
    { STAGEID: 'ST-X-CANDIDATE-NEW', NAME: 'New', CATEGORY: 'open' },
    { STAGEID: 'ST-X-CANDIDATE-MATCHED', NAME: 'Matched', CATEGORY: 'open' },
    { STAGEID: 'ST-X-CANDIDATE-LOST', NAME: 'Not proceeding', CATEGORY: 'lost' },
  ]
  const base = {
    lead, stages, interests: [{ TYPEDTEXT: 'sparky', SOCTITLE: 'Electricians' }, { TYPEDTEXT: null, SOCTITLE: 'x' }],
    consents: [
      { KIND: 'contact_email', GIVEN: true, RECORDEDAT: '2026-09-01T09:00:00Z' },
      { KIND: 'contact_email', GIVEN: false, RECORDEDAT: '2026-10-01T09:00:00Z' },
      { KIND: 'privacy_notice', GIVEN: true, NOTICEVERSION: 'V2', RECORDEDAT: '2026-09-01T09:00:00Z' },
    ],
    history: [{ CHANGEID: 'C1', CHANGEDAT: '2026-09-01T09:00:00Z', CHANGEDBY: 'web-form', TONAME: 'New' },
      { CHANGEID: 'C2', CHANGEDAT: '2026-10-01T09:00:00Z', CHANGEDBY: 'USR-1', FROMNAME: 'New', TONAME: 'Matched' }],
    activities: [{ ACTIVITYID: 'A1', KIND: 'call', SUBJECT: 'First call', BODY: 'Chatted.', OCCURREDAT: '2026-09-15T09:00:00Z', BYUSERID: 'USR-GONE' }],
    emails: [{ MESSAGEID: 'E1', TEMPLATE: 'confirm_email', SUBJECT: null, STATUS: 'outbox', CREATEDAT: '2026-09-01T09:01:00Z' }],
    tasks: [
      { TASKID: 'T1', TITLE: 'Ring back', DUEDATE: new Date('2026-10-20T00:00:00Z'), OWNERUSERID: 'USR-1', STATUS: 'open' },
      ...Array.from({ length: 7 }, (_, i) => ({ TASKID: `D${i}`, TITLE: `Done ${i}`, OWNERUSERID: 'USR-1', STATUS: 'done', DONEAT: `2026-09-0${i + 1}T09:00:00Z` })),
    ],
    matches: [{ MATCHID: 'M1', VACANCYREFERENCE: '123', SCORE: '80.00', REASONS: '["interest: sports","hours: full_time"]', TITLE: null }],
    placements: [],
    owners: [{ USERID: 'USR-1', DISPLAYNAME: 'Grace Testmanager04' }],
    now: new Date('2026-10-16T12:00:00Z'),
  }
  const p = buildPerson(base)
  check('name, initials, district, details', p.name === 'Ada Test' && p.initials === 'AT' && p.details.district === 'S6' &&
    p.details.email === 'ada@example.com' && p.details.dateOfBirth === '2009-10-17', JSON.stringify(p.details))
  check('  age the day before their 17th birthday: 16, so under 18', p.details.age === 16 && p.details.under18)
  check('  ageOn on and after a birthday', ageOn('2009-10-17', '2026-10-17') === 17 && ageOn('2008-02-29', '2026-02-28') === 17 && ageOn(null, '2026-01-01') === null)
  check('what they told us: situation, hours, travel, English and maths', p.told.situation === 'At school' && p.told.hours === 'Part time' &&
    p.told.travel === 'Up to 1 mile' && p.told.travelModes.join() === 'bus,walking' && p.told.englishLevel2 === false && p.told.mathsLevel2 === null)
  check('  interests without typed text are left out', p.interests.length === 1 && p.interests[0].title === 'Electricians')
  const consent = Object.fromEntries(p.consent.map((c) => [c.kind, c.text]))
  check('consent: the latest of each kind, in plain words', consent.contact_email === 'Not OK to email' && consent.contact_phone === 'Phone: not asked' &&
    consent.marketing === 'News emails: not asked' && consent.privacy_notice === 'Saw the privacy notice' && p.consent.find((c) => c.kind === 'privacy_notice').version === 'V2',
    JSON.stringify(consent))
  check('the journey: stage, owner, the stage bar without Not proceeding', p.journey.stage === 'Matched' && p.journey.owner === 'Grace Testmanager04' &&
    p.journey.stages.map((s) => s.name).join() === 'New,Matched' && p.journey.status === null)
  check('one timeline, newest first, with who did each', p.timeline.map((e) => e.key).join() === 'stage-C2,activity-A1,email-E1,stage-C1' &&
    p.timeline[0].what === 'Moved to Matched' && p.timeline[3].what === 'Joined the pipeline at New' && p.timeline[3].who === 'The interest form' &&
    p.timeline[1].who === 'Someone no longer here' && p.timeline[2].what === 'Email: Confirm your email' && p.timeline[2].detail === 'In the outbox (not sent)',
    p.timeline.map((e) => `${e.key} ${e.what} ${e.who}`).join(' | '))
  check('tasks: open ones, then the 5 latest done', p.tasks.open.length === 1 && p.tasks.open[0].due === '2026-10-20' &&
    p.tasks.done.map((t) => t.taskId).join() === 'D6,D5,D4,D3,D2')
  check('a match: reasons in words, a missing advert shown as gone', p.matches[0].reasons.join(' · ') === 'Interest: sports · Hours: full time' &&
    p.matches[0].gone && p.matches[0].title === 'Advert 123' && p.matches[0].score === 80 && reasonText('distance: over 30 miles') === 'Distance: over 30 miles')

  const anon = buildPerson({ ...base, lead: { ...lead, ANONYMISEDAT: '2026-10-01T00:00:00Z' } })
  check('anonymised: no name, contact details, date of birth or postcode', anon.name === 'Anonymised' && anon.initials === '–' &&
    anon.details.email === null && anon.details.mobile === null && anon.details.dateOfBirth === null && anon.details.age === null &&
    anon.details.postcode === null && anon.details.district === null && !JSON.stringify(anon).includes('ada@example.com') &&
    !JSON.stringify(anon).includes('S6 2LP') && !JSON.stringify(anon).includes('07700900000'))
  check('  the personal fields it blanks are LEAD\'s six', PERSONAL_LEAD_FIELDS.join() === 'GIVENNAMES,FAMILYNAME,EMAIL,MOBILE,DATEOFBIRTH,POSTCODE')

  const lost = buildPerson({ ...base, lead: { ...lead, CATEGORY: 'lost', STAGENAME: 'Not proceeding', CLOSEREASON: 'Found other work', CLOSEDAT: '2026-10-02T00:00:00Z' } })
  check('a closed journey: "Not proceeding: <reason>"', lost.journey.status === 'Not proceeding: Found other work' && lost.journey.closeReason === 'Found other work')
  const enrolled = buildPerson({ ...base, lead: { ...lead, SYSTEMKEY: 'ENROLLED', CATEGORY: 'won' } })
  check('  an enrolled one: "Enrolled", and no close reason', enrolled.journey.status === 'Enrolled' && enrolled.journey.closeReason === null)
}

// ---------------------------------------------------------------- part 2
console.log('Part 2: the seeded records, as CRM_APP_USER')
const crm = await connect({ as: 'crm', timeoutMs: 30000 })
try {
  const poppy = await loadPerson(crm, 'ORG-T003', 'LEAD-J0005')
  const seeded = poppy?.name === 'Poppy Testwood' && poppy?.journey?.stage === 'Offered'
  if (!seeded) {
    console.log(`FAIL LEAD-J0005 isn't the seeded Poppy Testwood at Offered: run the test reset first  [${poppy?.name} ${poppy?.journey?.stage}]`)
    failures++
  } else {
    const d = poppy.details
    check('Poppy: her details', d.email === 'poppy.testwood5@example.com' && d.mobile === '07700900005' && d.dateOfBirth === '2003-11-02' &&
      d.postcode === 'WR13 0GU' && d.district === 'WR13' && d.cameVia === 'the interest form' && !d.under18, JSON.stringify(d))
    check('  what she told us', poppy.told.situation === 'Working' && poppy.told.hours === 'Full time' && poppy.told.travel === 'Up to 10 miles' &&
      poppy.told.travelModes.join() === 'bus,train' && poppy.told.englishLevel2 === true && poppy.told.mathsLevel2 === true)
    check('  her interest: tech support (IT user support technicians)', poppy.interests.length === 1 && poppy.interests[0].text === 'tech support' &&
      poppy.interests[0].title === 'IT user support technicians')
    const consent = Object.fromEntries(poppy.consent.map((c) => [c.kind, c.text]))
    check('  consent: OK to email, saw the privacy notice, phone and news not asked', consent.contact_email === 'OK to email' &&
      consent.privacy_notice === 'Saw the privacy notice' && consent.contact_phone === 'Phone: not asked' && consent.marketing === 'News emails: not asked', JSON.stringify(consent))
    check('  Offered, with Owen Testmanager05; the 8 stages in order', poppy.journey.owner === 'Owen Testmanager05' && poppy.journey.status === null &&
      poppy.journey.stages.map((s) => s.name).join() === 'New,Confirmed,Contacted,Matched,Interviewing,Offered,Initial assessment,Enrolled')
    const kinds = poppy.timeline.map((e) => e.kind)
    check('  timeline: 6 stage moves, 1 call, 2 emails, newest first', kinds.filter((k) => k === 'stage').length === 6 && kinds.filter((k) => k === 'activity').length === 1 &&
      kinds.filter((k) => k === 'email').length === 2 && poppy.timeline[0].what === 'Moved to Offered' &&
      poppy.timeline.every((e, i, all) => i === 0 || all[i - 1].at >= e.at), kinds.join())
    check('  the call is there once, though linked to her and her journey', poppy.timeline.filter((e) => e.key === 'activity-ACT-J0005').length === 1 &&
      poppy.timeline.find((e) => e.key === 'activity-ACT-J0005').detail === 'Talked about IT apprenticeships.')
    check('  one open task, due 19 October', poppy.tasks.open.length === 1 && poppy.tasks.open[0].title === 'Next step with Poppy' && poppy.tasks.open[0].due === '2026-10-19')
    check('  3 matches, best first, with their reasons', poppy.matches.map((m) => m.score).join() === '85,78,71' &&
      poppy.matches.every((m) => m.reasons.join() === 'Interest: it,Hours: full time') && poppy.matches[0].reference === '2000057374' &&
      poppy.matches[0].closes === '2026-10-23', poppy.matches.map((m) => `${m.score} ${m.closes}`).join())
    check('  one placement: Teststone Digital Ltd, IT solutions technician, Offered', poppy.placements.length === 1 &&
      poppy.placements[0].employer === 'Teststone Digital Ltd' && poppy.placements[0].standard === 'IT solutions technician, level 3' &&
      poppy.placements[0].status === 'Offered', JSON.stringify(poppy.placements[0]))
    const text = JSON.stringify(poppy)
    check('  her email address appears once only (her details, not the emails sent to her)', text.split('poppy.testwood5@example.com').length === 2)
  }

  const finley = await loadPerson(crm, 'ORG-T003', 'LEAD-J0364')
  check('Finley: not proceeding, found other work', finley?.journey?.status === 'Not proceeding: Found other work' &&
    finley.timeline[0].detail === 'Reason: Found other work', finley?.journey?.status)

  check("ORG-T001 can't read ORG-T003's Poppy", (await loadPerson(crm, 'ORG-T001', 'LEAD-J0005')) === null)
  check("ORG-T003 can't read ORG-T001's Jordan (LEAD-T001)", (await loadPerson(crm, 'ORG-T003', 'LEAD-T001')) === null)
  const jordan = await loadPerson(crm, 'ORG-T001', 'LEAD-T001')
  check('  ORG-T001 reads its own Jordan, under 18', jordan?.name === 'Jordan Testlead-One' && jordan.details.under18 === true, `${jordan?.name} ${jordan?.details?.age}`)
  check('no such lead: null', (await loadPerson(crm, 'ORG-T003', 'LEAD-NONE')) === null)

  let refused = false
  try {
    await execute(crm, 'select count(*) from CAPTURE_DB.ILR.LEARNER')
  } catch {
    refused = true
  }
  check("Meadow's user can't read Warren's learners (CAPTURE_DB)", refused)

  // ---------------------------------------------------------------- part 3
  if (READS_ONLY) {
    console.log('Part 3: skipped (--reads-only)')
  } else {
    console.log('Part 3: the view log')
    check('a manager opening our own lead adds one row', (await logView(crm, 'ORG-T003', 'LEAD-J0005', 'USR-T3001')) === 1)
    check("another organisation's lead adds none", (await logView(crm, 'ORG-T001', 'LEAD-J0005', 'USR-T0008')) === 0)
    for (const [what, sql] of [
      ['read', 'select count(*) from CRM_DB.CRM.RECORD_VIEW'],
      ['change', "update CRM_DB.CRM.RECORD_VIEW set VIEWEDBY = 'X' where 1 = 0"],
      ['remove', 'delete from CRM_DB.CRM.RECORD_VIEW where 1 = 0'],
    ]) {
      let no = false
      try {
        await execute(crm, sql)
      } catch {
        no = true
      }
      check(`  the app can't ${what} the log`, no)
    }
  }
} finally {
  await destroy(crm)
}

console.log(failures ? `${failures} failed` : 'all passed')
process.exit(failures ? 1 : 0)
