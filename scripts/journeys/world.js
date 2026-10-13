// The fictional people and employers of the test journeys (day 2 of the
// trial plan, approved 11 October 2026), built in memory from a seed and an
// "as of" date: nothing here touches Snowflake. The same seed, as-of date
// and reference data always give the same world.
//
// Everyone is in ORG-T003 and is test data. Names are real first names with
// clearly fictional "Test..." family names (no digits: the ILR forbids
// them in names), emails are @example.com, phones are Ofcom's 07700 900xxx
// drama range, NI numbers start ZZ, ULNs start 91. Postcodes are a real
// English postcode district with a made-up inward code that isn't a real
// postcode. Employers are "Test..." names, never real companies.
//
// What happens to each person: an enquiry (one or two form submissions),
// then the candidate pipeline at the agreed rates, each step a few days or
// weeks after the last; anyone whose next step would fall after the as-of
// date stays at the stage they've reached. Those who go ahead are handed
// over (F6) and enrolled as apprentices, with a full ILR record, Burrow
// evidence and progress reviews up to the as-of date. A back cohort of
// apprentices who started in 2024 to 2025, before the CRM, gives the
// reports completions and achievement rates.

import crypto from 'node:crypto'
import { SECTORS } from './reference.js'

export const ORG = 'ORG-T003'
export const MANAGERS = ['USR-T3001', 'USR-T3002']
export const TUTORS = ['OFF3003', 'OFF3004']
export const ASSESSORS = ['OFF3005', 'OFF3006']
export const IQA = { userId: 'USR-T3007', officer: 'OFF3007', name: 'Iris Testiqa02' }
export const OFFICER_NAMES = { OFF3005: 'Ruth Testassessor05', OFF3006: 'Seth Testassessor06', OFF3003: 'Faye Testtutor05', OFF3004: 'Hugo Testtutor06' }
export const EPA_ORGS = ['EPA9991', 'EPA9992', 'EPA9993']

// The rates agreed in the plan (11 October 2026).
export const RATES = { confirm: 0.8, contact: 0.85, match: 0.75, interview: 0.7, offer: 0.65, handover: 0.9, enrol: 0.92 }

// ---------------------------------------------------------------- random

export function makeRandom(seed) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const r = {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
    weighted: (pairs) => {
      const total = pairs.reduce((n, [, w]) => n + w, 0)
      let x = next() * total
      for (const [v, w] of pairs) { if ((x -= w) < 0) return v }
      return pairs.at(-1)[0]
    },
    uuid: () => {
      const b = [...Array(16)].map(() => Math.floor(next() * 256))
      b[6] = (b[6] & 0x0f) | 0x40
      b[8] = (b[8] & 0x3f) | 0x80
      const h = b.map((x) => x.toString(16).padStart(2, '0')).join('')
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
    },
  }
  return r
}

// ---------------------------------------------------------------- dates (YYYY-MM-DD)

const D = (iso) => new Date(`${iso}T12:00:00Z`)
const iso = (d) => d.toISOString().slice(0, 10)
export const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
export const addMonths = (s, n) => { const d = D(s); d.setUTCMonth(d.getUTCMonth() + n); return iso(d) }
export const addYears = (s, n) => addMonths(s, 12 * n)
export const daysBetween = (a, b) => Math.round((D(b) - D(a)) / 86400000)
const nextMonday = (s) => { const d = D(s); while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1); return iso(d) }
const lastFridayInJune = (y) => { const d = new Date(Date.UTC(y, 5, 30, 12)); while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1); return iso(d) }
export const ts = (date, hour = 10, minute = 0) => `${date} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`

// The first day an apprenticeship can start for someone born on dob: after
// the last Friday in June of the school year they turn 16 (DateOfBirth_48).
function eligibleFrom(dob) {
  const turns16 = addYears(dob, 16)
  const year = Number(turns16.slice(5, 7)) >= 9 ? Number(turns16.slice(0, 4)) + 1 : Number(turns16.slice(0, 4))
  return addDays(lastFridayInJune(year), 1)
}

// ---------------------------------------------------------------- identities

const GIVEN = ['Aaliyah', 'Adam', 'Aiden', 'Alex', 'Amara', 'Amelia', 'Ayaan', 'Ben', 'Bethany', 'Callum', 'Charlie', 'Chloe', 'Daniel', 'Demi',
  'Eden', 'Eli', 'Ella', 'Ethan', 'Evie', 'Fatima', 'Finley', 'Freya', 'George', 'Grace', 'Hamza', 'Harper', 'Harry', 'Imani', 'Isla', 'Jack',
  'Jade', 'Jamal', 'Jasmine', 'Jayden', 'Jordan', 'Kai', 'Keira', 'Leah', 'Leo', 'Lily', 'Logan', 'Maisie', 'Mason', 'Maya', 'Mia', 'Mohammed',
  'Nathan', 'Nia', 'Noah', 'Oliver', 'Olivia', 'Oscar', 'Poppy', 'Priya', 'Reece', 'Riley', 'Rosie', 'Ruby', 'Ryan', 'Sami', 'Sophie', 'Taylor',
  'Theo', 'Tyler', 'Yusuf', 'Zara', 'Zoe']
const FAMILY_END = ['brook', 'field', 'moor', 'well', 'wood', 'ford', 'ley', 'ton', 'by', 'combe', 'dale', 'gate', 'hurst', 'stead', 'thorpe',
  'wick', 'worth', 'bridge', 'cliffe', 'den', 'fold', 'holme', 'lands', 'mere', 'ridge', 'shaw', 'stone', 'vale', 'ward', 'water']
const STREET = ['Test Road', 'Test Street', 'Test Lane', 'Test Avenue', 'Test Close', 'Test Way']
const INWARD_LETTERS = 'ABDEFGHJLNPQRSTUWXYZ' // the letters an inward code can use
const EMPLOYER_FIRST = ['Testbrook', 'Testfield', 'Testmoor', 'Testwell', 'Testwood', 'Testford', 'Testley', 'Testdale', 'Testgate', 'Testhurst',
  'Testmere', 'Testridge', 'Testvale', 'Testcombe', 'Testholme', 'Teststone']
const EMPLOYER_KIND = {
  care: ['Care Homes Ltd', 'Home Care Ltd', 'Care Services Ltd'], retail: ['Stores Ltd', 'Retail Ltd', 'Trading Ltd'],
  office: ['Business Services Ltd', 'Accountants LLP', 'Lettings Ltd'], childcare: ['Nurseries Ltd', 'Day Nursery Ltd', 'Little Steps Ltd'],
  hair: ['Hair Studio Ltd', 'Barbers Ltd', 'Salons Ltd'], cooking: ['Kitchen Ltd', 'Bistro Ltd', 'Catering Ltd'],
  hospitality: ['Hotels Ltd', 'Inns Ltd', 'Hospitality Group Ltd'], warehouse: ['Logistics Ltd', 'Distribution Ltd', 'Freight Ltd'],
  leading: ['Contact Centres Ltd', 'Services Group Ltd', 'Utilities Ltd'], animals: ['Kennels Ltd', 'Pet Care Ltd', 'Vets Ltd'],
  teaching: ['Academy Trust', 'Learning Trust', 'Schools Trust'], it: ['IT Support Ltd', 'Digital Ltd', 'Tech Services Ltd'],
}
const ETHNICITY = [[31, 70], [32, 1], [33, 1], [34, 3], [35, 2], [36, 1], [37, 1], [38, 1], [39, 5], [40, 2], [41, 1], [42, 3], [43, 2], [44, 2],
  [45, 1], [46, 1], [47, 1], [98, 2]]

function uln(r, used) {
  for (;;) {
    const first = `91${String(r.int(0, 9999999)).padStart(7, '0')}`
    const remainder = [...first].reduce((s, d, i) => s + Number(d) * (10 - i), 0) % 11
    if (remainder === 0 || remainder === 1) continue // 10 - 1 = 9 is fine; 10 - 0 isn't a digit
    const value = `${first}${10 - remainder}`
    if (!used.has(value)) { used.add(value); return Number(value) }
  }
}

function ern(r) {
  for (;;) {
    const first = String(r.int(10000000, 99999998))
    const sum = [...first].reduce((s, d, i) => s + Number(d) * (9 - i), 0)
    const check = 11 - (sum % 11)
    if (check === 10) continue
    return Number(`${first}${check === 11 ? 0 : check}`)
  }
}

// ---------------------------------------------------------------- the world

// A spread of districts: 14 from every English region, from their own
// random stream, so the real postcodes in them can be read before the world
// is built (made-up inward codes are checked against them).
export function chooseDistricts(ref, seed) {
  const r = makeRandom(seed ^ 0x5eed)
  const byRegion = new Map()
  for (const d of ref.districts) { if (!byRegion.has(d.region)) byRegion.set(d.region, []); byRegion.get(d.region).push(d) }
  const districts = []
  for (const reg of [...byRegion.keys()].sort()) {
    const list = [...byRegion.get(reg)].sort((a, b) => (a.district < b.district ? -1 : 1))
    for (let i = 0; i < 14 && list.length; i++) districts.push(list.splice(r.int(0, list.length - 1), 1)[0])
  }
  return districts
}

export function buildWorld(ref, districts, { seed = 20261011, asOf, people: peopleCount = 500, backCohort = 80 } = {}) {
  const r = makeRandom(seed)
  const today = asOf
  const usedUlns = new Set()
  const usedPostcodes = new Set()
  const regions = [...new Set(districts.map((d) => d.region))].sort()
  const madeUpPostcode = (district) => {
    for (;;) {
      const pc = `${district} ${r.int(0, 9)}${r.pick(INWARD_LETTERS)}${r.pick(INWARD_LETTERS)}`
      if (!ref.existing.has(pc) && !usedPostcodes.has(pc)) { usedPostcodes.add(pc); return pc }
    }
  }

  const world = {
    seed, asOf: today, districts, people: [], employers: [], learners: [], warrenOnlyEmployers: [],
    counts: {}, stageReached: {}, lostAt: {}, openAt: {},
  }

  // ------------------------------------------------------------ employers (CRM prospects, made on demand)
  let empSeq = 0
  const makeEmployer = (sector, region, firstNeed) => {
    empSeq++
    const id = `J${String(empSeq).padStart(3, '0')}`
    const regionDistricts = districts.filter((d) => d.region === region)
    const sites = Array.from({ length: r.chance(0.35) ? 2 : 1 }, (_, i) => {
      const d = r.pick(regionDistricts)
      return { id: `CSITE-${id}-${i + 1}`, name: `${i === 0 ? 'Main site' : 'Second site'}`, line1: `${r.int(1, 99)} ${r.pick(STREET)}`, town: `Test town ${d.district}`, postcode: madeUpPostcode(d.district) }
    })
    const first = r.pick(EMPLOYER_FIRST)
    const contacts = [
      { role: 'decision_maker', title: 'Owner', marketing: r.chance(0.4) },
      { role: 'line_manager', title: 'Supervisor', marketing: false },
      ...(r.chance(0.4) ? [{ role: 'finance', title: 'Finance officer', marketing: false }] : []),
    ].map((c, i) => {
      const given = r.pick(GIVEN)
      return { id: `CCON-${id}-${i + 1}`, name: `${given} ${first}`, jobTitle: c.title, salesRole: c.role, method: r.pick(['email', 'phone']),
        email: `${given.toLowerCase()}.${first.toLowerCase()}${empSeq}@example.com`, phone: `07700900${String(r.int(0, 999)).padStart(3, '0')}`, marketing: c.marketing }
    })
    // The employer's journey runs ahead of its first placement.
    const prospect = addDays(firstNeed, -r.int(30, 60))
    const e = {
      id: `CEMP-${id}`, sector, region, name: `${first} ${r.pick(EMPLOYER_KIND[sector])}`, ern: ern(r), sites, contacts,
      itemId: `ITEM-E${id}`, owner: r.pick(MANAGERS), title: `${SECTORS.find((s) => s.key === sector).words[0]} apprentices`,
      path: [['PROSPECT', prospect]], wonAt: null, placedAt: null, placements: 0,
    }
    e.path.push(['CONTACTED', addDays(prospect, r.int(3, 10))])
    e.path.push(['MEETING', addDays(e.path.at(-1)[1], r.int(5, 15))])
    e.path.push(['AGREED', addDays(e.path.at(-1)[1], r.int(5, 15))])
    // Every step before the first placement happens before it.
    e.path = e.path.map(([k, d], i) => [k, [d, addDays(firstNeed, i - e.path.length)].sort()[0]])
    world.employers.push(e)
    return e
  }
  const employerFor = (sector, region, need) => {
    const fits = world.employers.filter((e) => e.sector === sector && e.region === region && e.placements < 6)
    if (fits.length && r.chance(0.8)) return r.pick(fits)
    if (world.employers.length >= 60) {
      const any = world.employers.filter((e) => e.sector === sector)
      if (any.length) return r.pick(any)
    }
    return makeEmployer(sector, region, need)
  }

  // ------------------------------------------------------------ people
  const ages = [[15, 15], [16, 14], [17, 13], [18, 12], [19, 10], [20, 8], [21, 8], [22, 7], [23, 7], [24, 6]]
  const start = '2025-01-06'
  const span = daysBetween(start, addDays(today, -2))
  const people = []
  for (let i = 1; i <= peopleCount; i++) {
    const age = r.weighted(ages)
    const enquiry = addDays(start, Math.floor(Math.pow(r.next(), 0.9) * span))
    const dob = addDays(addYears(enquiry, -age), -r.int(1, 364))
    const district = r.pick(districts)
    const given = r.pick(GIVEN)
    const family = `Test${r.pick(FAMILY_END)}`
    const sectorsOk = SECTORS.filter((s) => s.minAge <= Math.max(age, 16))
    const interests = [r.pick(sectorsOk)]
    if (r.chance(0.2)) { const s = r.pick(sectorsOk); if (s !== interests[0]) interests.push(s) }
    const situation = age <= 16 ? 'school' : age <= 18 ? r.pick(['school', 'college', 'not_working']) : r.pick(['working', 'not_working', 'working'])
    people.push({
      n: i, id: `J${String(i).padStart(4, '0')}`, age, dob, enquiry, district, given, family,
      email: `${given.toLowerCase()}.${family.toLowerCase()}${i}@example.com`,
      mobile: `07700900${String(i % 1000).padStart(3, '0')}`, postcode: madeUpPostcode(district.district),
      travelMiles: r.pick([5, 10, 15, 20, 25, 30]), travelModes: r.pick([['bus'], ['bus', 'walk'], ['train'], ['drives'], ['bus', 'train']]),
      hours: r.chance(0.92) ? 'full_time' : 'part_time', situation,
      english2: age >= 16 && r.chance(0.65), maths2: age >= 16 && r.chance(0.6),
      interests, sector: interests[0].key, resubmits: r.chance(0.1),
      marketing: r.chance(0.3), siblingOf: null,
    })
  }
  // A few families share a parent's email: the younger sibling can't be
  // handed over too (F6 refuses an email that already has a sign-in).
  for (let k = 0; k < 6; k++) {
    const a = people[r.int(0, people.length - 1)]
    const b = people[r.int(0, people.length - 1)]
    if (a === b || a.siblingOf || b.siblingOf) continue
    b.family = a.family
    b.email = `family.${a.family.toLowerCase()}${a.n}@example.com`
    a.email = b.email
    b.siblingOf = a.id
    b.district = a.district
    b.postcode = a.postcode
  }

  // ------------------------------------------------------------ the funnel
  const reached = (k) => { world.stageReached[k] = (world.stageReached[k] ?? 0) + 1 }
  const lost = (p, key, reason, date) => {
    if (date > today) { world.openAt[p.stage] = (world.openAt[p.stage] ?? 0) + 1; return false }
    p.path.push(['LOST', date])
    p.lostReason = reason
    world.lostAt[key] = (world.lostAt[key] ?? 0) + 1
    return true
  }
  for (const p of people) {
    p.path = [['NEW', p.enquiry]]
    p.stage = 'NEW'
    p.submissions = [p.enquiry]
    if (p.resubmits) { const again = addDays(p.enquiry, r.int(3, 40)); if (again <= today) p.submissions.push(again) }
    reached('NEW')
    const step = (key, rate, gap, reasons) => {
      const date = addDays(p.path.at(-1)[1], r.int(...gap))
      if (date > today) { world.openAt[p.stage] = (world.openAt[p.stage] ?? 0) + 1; return false }
      if (!r.chance(rate)) { lost(p, p.stage, r.pick(reasons), addDays(date, r.int(0, 10))); return false }
      p.path.push([key, date]); p.stage = key; reached(key)
      return true
    }
    // Confirming the email: never confirmed means lost for no response 30 days on.
    const confirmDate = addDays(p.enquiry, r.int(0, 2))
    if (confirmDate > today) { world.openAt.NEW = (world.openAt.NEW ?? 0) + 1; continue }
    if (!r.chance(RATES.confirm)) { lost(p, 'NEW', 'NO_RESPONSE', addDays(p.enquiry, 30)); continue }
    p.confirmedAt = confirmDate
    p.path.push(['CONFIRMED', confirmDate]); p.stage = 'CONFIRMED'; reached('CONFIRMED')
    if (!step('CONTACTED', RATES.contact, [2, 10], ['NO_RESPONSE', 'CHANGED_MIND'])) continue
    if (!step('MATCHED', RATES.match, [5, 20], p.age <= 17 ? ['COLLEGE', 'NOT_ELIGIBLE', 'CHANGED_MIND'] : ['NOT_ELIGIBLE', 'OTHER_JOB', 'CHANGED_MIND'])) continue
    // Put forward to an employer (a second try for some who aren't taken on).
    const putForward = addDays(p.path.at(-1)[1], r.int(7, 30))
    if (putForward > today) { world.openAt.MATCHED = (world.openAt.MATCHED ?? 0) + 1; continue }
    const employer = employerFor(p.sector, p.district.region, putForward)
    p.placements = [{ id: `PLC-${p.id}-1`, employer, status: 'put_forward', at: putForward, std: SECTORS.find((s) => s.key === p.sector).std }]
    if (!r.chance(RATES.interview)) { p.placements[0].status = 'withdrawn'; lost(p, 'MATCHED', r.pick(['CHANGED_MIND', 'OTHER_JOB']), addDays(putForward, r.int(3, 14))); continue }
    p.path.push(['INTERVIEWING', putForward]); p.stage = 'INTERVIEWING'; reached('INTERVIEWING')
    p.placements[0].status = 'interviewing'
    let offered = false
    for (let attempt = 0; attempt < 2 && !offered; attempt++) {
      const pl = p.placements.at(-1)
      const offerDate = addDays(pl.at, r.int(7, 21))
      if (offerDate > today) break
      if (r.chance(RATES.offer)) { offered = true; pl.status = 'offered'; pl.offeredAt = offerDate; break }
      pl.status = 'declined'
      if (attempt === 0 && r.chance(0.3)) {
        const again = addDays(offerDate, r.int(5, 20))
        if (again > today) break
        p.placements.push({ id: `PLC-${p.id}-2`, employer: employerFor(p.sector, p.district.region, again), status: 'interviewing', at: again, std: pl.std })
      }
    }
    if (!offered) {
      const last = p.placements.at(-1)
      if (last.status === 'declined') lost(p, 'INTERVIEWING', r.pick(['OTHER_JOB', 'NO_RESPONSE', 'CHANGED_MIND']), addDays(last.at, r.int(20, 40)))
      else world.openAt.INTERVIEWING = (world.openAt.INTERVIEWING ?? 0) + 1
      continue
    }
    const pl = p.placements.at(-1)
    p.path.push(['OFFERED', pl.offeredAt]); p.stage = 'OFFERED'; reached('OFFERED')
    // The employer becomes a client (F8) when its first offer is made.
    const emp = pl.employer
    if (!emp.wonAt || emp.wonAt > pl.offeredAt) emp.wonAt = pl.offeredAt
    emp.placements++
    // Hand-over (F6), then enrolment. A younger sibling sharing the email
    // stops here; nobody under the age to start is enrolled before they can.
    const handover = addDays(pl.offeredAt, r.int(3, 14))
    if (handover > today) { world.openAt.OFFERED = (world.openAt.OFFERED ?? 0) + 1; continue }
    if (p.siblingOf || !r.chance(RATES.handover)) {
      pl.status = 'declined'
      lost(p, 'OFFERED', p.siblingOf ? 'CHANGED_MIND' : r.pick(['OTHER_JOB', 'CHANGED_MIND']), addDays(handover, r.int(0, 7)))
      continue
    }
    pl.status = 'accepted'
    p.handoverAt = handover
    p.path.push(['ASSESSMENT', handover]); p.stage = 'ASSESSMENT'; reached('ASSESSMENT')
    const startDate = nextMonday([addDays(handover, r.int(14, 45)), eligibleFrom(p.dob)].sort().at(-1))
    if (startDate > today) { p.onboardingStatus = r.pick(['stage2', 'stage3']); world.openAt.ASSESSMENT = (world.openAt.ASSESSMENT ?? 0) + 1; continue }
    if (!r.chance(RATES.enrol)) {
      p.onboardingStatus = 'not_proceeding'
      p.notProceeding = r.pick(['NOT_ELIGIBLE', 'CHANGED_MIND'])
      lost(p, 'ASSESSMENT', p.notProceeding, addDays(handover, r.int(10, 30)))
      continue
    }
    p.onboardingStatus = 'enrolled'
    p.path.push(['ENROLLED', startDate]); p.stage = 'ENROLLED'; reached('ENROLLED')
    pl.status = 'enrolled'
    if (!emp.placedAt || emp.placedAt > startDate) emp.placedAt = startDate
    p.start = startDate
  }
  world.people = people

  // Employers that never got a placement: more prospects, some lost.
  while (world.employers.length < 60) {
    const sector = r.pick(SECTORS).key
    const e = makeEmployer(sector, r.pick(regions), addDays(today, -r.int(10, 400)))
    e.path = e.path.slice(0, r.int(1, 4)).filter(([, d]) => d <= today)
    if (e.path.length && r.chance(0.35)) {
      const d = addDays(e.path.at(-1)[1], r.int(10, 40))
      if (d <= today) { e.path.push(['LOST', d]); e.lostReason = r.pick(['NOT_NOW', 'OTHER_PROVIDER', 'NO_ROLE', 'NO_RESPONSE']) }
    }
  }
  for (const e of world.employers) {
    e.path = e.path.filter(([, d]) => d <= today)
    if (e.wonAt && !e.path.some(([k]) => k === 'AGREED')) e.path.push(['AGREED', addDays(e.wonAt, -1)])
    if (e.placedAt && e.placedAt <= today) e.path.push(['PLACED', e.placedAt])
    e.path.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
  }

  // ------------------------------------------------------------ learners
  let learnerSeq = 0
  const makeLearner = (p, employer, site, contact, start) => {
    learnerSeq++
    const std = SECTORS.find((s) => s.key === p.sector).std
    const s = ref.standards.get(std)
    const months = Math.max(12, s.MONTHS) + r.int(0, 6)
    let planEnd = addDays(addMonths(start, months), -1)
    if (daysBetween(start, planEnd) < 372) planEnd = addDays(start, 372)
    return {
      ref: `TESTJ${String(learnerSeq).padStart(4, '0')}`, person: p, std, standard: s, employer, site, contact, start, planEnd,
      uln: uln(r, usedUlns), ni: `ZZ${String(r.int(0, 999999)).padStart(6, '0')}${r.pick(['A', 'B', 'C', 'D'])}`,
      sex: r.pick(['F', 'M']), ethnicity: r.weighted(ETHNICITY), lldd: r.chance(0.12) ? r.pick([[11], [12], [13], [5, 13], [6]]) : [],
      tutor: r.pick(TUTORS), assessor: r.pick(ASSESSORS), epa: r.pick(EPA_ORGS), price: s.CAP,
      priorLevel: p.age <= 16 ? r.pick([1, 2]) : r.pick([2, 2, 3]),
    }
  }
  for (const p of people.filter((x) => x.start)) {
    const pl = p.placements.at(-1)
    const site = pl.employer.sites[0]
    world.learners.push(makeLearner(p, pl.employer, site, pl.employer.contacts.find((c) => c.salesRole === 'line_manager'), p.start))
  }
  // The back cohort: apprentices who started in 2024 to 2025 with employers
  // Warren had before the CRM.
  for (let k = 1; k <= 12; k++) {
    const sector = r.pick(SECTORS.filter((s) => s.minAge <= 18)).key
    const region = r.pick(regions)
    const d = r.pick(districts.filter((x) => x.region === region))
    const first = r.pick(EMPLOYER_FIRST)
    world.warrenOnlyEmployers.push({
      id: `EMP-JB${String(k).padStart(2, '0')}`, sector, region, name: `${first} ${r.pick(EMPLOYER_KIND[sector])}`, ern: ern(r),
      site: { id: `SITE-JB${String(k).padStart(2, '0')}`, name: 'Main site', line1: `${r.int(1, 99)} ${r.pick(STREET)}`, town: `Test town ${d.district}`, postcode: madeUpPostcode(d.district) },
      contact: { id: `CON-JB${String(k).padStart(2, '0')}`, name: `${r.pick(GIVEN)} ${first}`, jobTitle: 'Supervisor', email: `supervisor.jb${k}@example.com`, phone: `07700900${String(800 + k).padStart(3, '0')}` },
    })
  }
  for (let k = 1; k <= backCohort; k++) {
    const emp = r.pick(world.warrenOnlyEmployers)
    const age = r.int(16, 23)
    const start = nextMonday(addDays('2024-08-01', r.int(0, 355)))
    const dob = addDays(addYears(start, -age), -r.int(1, 364))
    const given = r.pick(GIVEN)
    const family = `Test${r.pick(FAMILY_END)}`
    const district = districts.find((x) => emp.site.postcode.startsWith(`${x.district} `)) ?? r.pick(districts)
    const p = { id: `B${String(k).padStart(3, '0')}`, age, dob, given, family, email: `${given.toLowerCase()}.${family.toLowerCase()}b${k}@example.com`,
      mobile: `07700900${String(500 + k).padStart(3, '0')}`, postcode: madeUpPostcode(district.district), sector: emp.sector,
      english2: r.chance(0.7), maths2: r.chance(0.65), backCohort: true }
    if (start < eligibleFrom(dob)) continue
    world.learners.push(makeLearner(p, emp, emp.site, emp.contact, start))
  }

  // ------------------------------------------------------------ outcomes and learning, as of today
  for (const l of world.learners) {
    const twelveMonths = addDays(l.start, 365)
    l.status = 'continuing'
    if (r.chance(0.2)) {
      const at = addDays(l.start, r.int(42, Math.max(60, daysBetween(l.start, l.planEnd) - 30)))
      if (at <= today) { l.status = 'withdrawn'; l.endDate = at; l.withdrawReason = r.pick([97, 98, 29]) }
    }
    if (l.status === 'continuing' && r.chance(0.05)) {
      const at = addDays(l.start, r.int(60, 300))
      if (at <= today && at < l.planEnd) { l.status = 'break'; l.endDate = at }
    }
    if (l.status === 'continuing' && l.planEnd <= today) {
      const end = [addDays(l.planEnd, r.int(-20, 30)), twelveMonths].sort().at(-1)
      if (end <= today) {
        l.endDate = end
        const epa = addDays(end, r.int(30, 90))
        const roll = r.next()
        if (epa > today || roll < 0.08) { l.status = 'awaiting_epa' }
        else if (roll < 0.15) { l.status = 'failed'; l.achDate = epa }
        else { l.status = 'achieved'; l.achDate = epa }
      }
    }
    // Functional Skills, for those without level 2 English or maths.
    l.fs = []
    if (!l.person.english2) l.fs.push({ ref: '60350544', title: 'English' })
    if (!l.person.maths2) l.fs.push({ ref: '6035060X', title: 'maths' })
    const learningEnd = [l.endDate ?? today, today].sort()[0]
    // Progress reviews about every 12 weeks.
    l.reviews = []
    for (let d = addDays(l.start, r.int(56, 84)); d <= learningEnd; d = addDays(d, r.int(70, 98))) {
      l.reviews.push({ date: d, officer: l.tutor, employerAttended: r.chance(0.8) })
    }
    // Evidence: about three items a month, KSBs claimed from the standard's
    // latest version; older items signed off, recent ones waiting.
    const ksbList = ref.ksbs.filter((k) => k.ST_REFERENCE === l.standard.REFERENCE)
    l.evidence = []
    for (let d = addDays(l.start, r.int(14, 28)); d <= addDays(learningEnd, -1); d = addDays(d, r.int(6, 14))) {
      const type = r.weighted([['reflection', 75], ['witness_statement', 25]]) // no photos or documents: they need files
      const claims = Array.from({ length: r.int(1, 3) }, () => r.pick(ksbList)).filter((k, i, a) => k && a.findIndex((x) => x.KSB_REFERENCE === k.KSB_REFERENCE) === i)
      const age = daysBetween(d, today)
      let status = age > 30 ? (r.chance(0.04) ? 'withdrawn' : 'signed_off') : age > 7 ? r.pick(['submitted', 'signed_off', 'changes_requested']) : r.pick(['draft', 'submitted'])
      if (l.status === 'withdrawn' && status !== 'signed_off') status = 'withdrawn'
      const resubmitted = status === 'signed_off' && r.chance(0.1)
      l.evidence.push({ id: r.uuid(), occurred: d, type, claims, status, resubmitted, iqa: status === 'signed_off' && r.chance(0.08) ? r.weighted([['agreed', 85], ['action_required', 15]]) : null,
        submitted: addDays(d, r.int(0, 3)), decided: addDays(d, r.int(5, 21)) })
    }
  }
  for (const l of world.learners) for (const e of l.evidence) { if (e.decided > today) e.decided = today; if (e.submitted > today) e.submitted = today }
  world.counts = {
    people: people.length, submissions: people.reduce((n, p) => n + p.submissions.length, 0),
    employers: world.employers.length, clients: world.employers.filter((e) => e.wonAt).length, warrenOnlyEmployers: world.warrenOnlyEmployers.length,
    learners: world.learners.length, crmLearners: world.learners.filter((l) => !l.person.backCohort).length, backCohort: world.learners.filter((l) => l.person.backCohort).length,
  }
  return world
}

// The id the world gives a made-up token, so its hash can be stored.
export const tokenHash = (personId) => crypto.createHash('sha256').update(`TEST-TOKEN-${personId}`).digest('hex')
