// Reads everything an ILR return needs for the signed-in user's organisation
// and puts it together as one object per learner, in the shape of the ILR:
// learner -> prior attainment, LLDD, employment status (-> monitoring), aims
// (-> FAMs, hours, prices). Every query is limited to the organisation.
//
// Which learners are in a year's return: those with an aim still open at the
// start of the year, or that ended or was achieved during it. Aims that ended
// before the year are left out.

import { execute } from '../db.js'
import { IN_ORG_LEARNERS, ORG_APP_FIN_RECORD, ORG_LEARNER, ORG_ORGANISATION } from '../access.js'
import { loadStandardVersions } from './standards.js'
import { isEnglishOrMaths, restartOf } from '../../src/programme.js'

// DfE's dummy UKPRN from its sample ILR file, and a second one for the other
// test organisation. Neither is on the UK Register of Learning Providers.
export const TEST_UKPRNS = new Set([99999999, 99999998])

// The years Warren can produce, with the official schema for each.
export const ILR_YEARS = {
  2026: { code: '2627', start: '2026-08-01', end: '2027-07-31', label: '2026 to 2027' },
}


const ORGANISATION_QUERY = `
  select ORGANISATIONID, NAME, UKPRN, ISTESTDATA from ${ORG_ORGANISATION}
`

const LEARNERS_QUERY = `
  select LEARNREFNUMBER, ULN, FAMILYNAME, GIVENNAMES, DATEOFBIRTH, ETHNICITY, SEX, LLDDHEALTHPROB, NINUMBER,
    POSTCODEPRIOR, POSTCODE, ADDRESSLINE1, ADDRESSLINE2, ADDRESSLINE3, WARDORCOUNTY, TELNO, EMAIL, ISTESTDATA
  from ${ORG_LEARNER} -- whole organisation: the ILR return covers everyone
  order by LEARNREFNUMBER
`

const AIMS_QUERY = `
  select ld.LEARNREFNUMBER, ld.LEARNAIMREF, ld.AIMTYPE, ld.AIMSEQNUMBER, ld.LEARNSTARTDATE, ld.ORIGLEARNSTARTDATE,
    ld.LEARNPLANENDDATE, ld.FUNDMODEL, ld.PROGTYPE, ld.STDCODE, ld.DELLOCPOSTCODE, ld.PRIORLEARNFUNDADJ,
    ld.OTHERFUNDADJ, ld.EPAORGID, ld.COMPSTATUS, ld.LEARNACTENDDATE, ld.WITHDRAWREASON, ld.OUTCOME, ld.ACHDATE,
    ld.OUTGRADE, ld.SWSUPAIMID, la.TITLE as AIMTITLE, la.LEARN_AIM_REF is not null as IN_LARS
  from LEARNING_DELIVERY ld
  left join LARS.LEARNING_AIM la
    on la.LEARN_AIM_REF = ld.LEARNAIMREF
  where ld.REMOVEDAT is null
    and ld.${IN_ORG_LEARNERS} -- whole organisation: the ILR return covers everyone
  order by ld.LEARNREFNUMBER, ld.AIMSEQNUMBER
`

// Each standard's dates in LARS, across its versions, for rules
// LearnStartDate_13, 17 and 18.
export const STANDARDS_QUERY = `
  select STANDARD_CODE, min(EFFECTIVE_FROM) as EFFECTIVE_FROM,
    iff(count_if(EFFECTIVE_TO is null) > 0, null, max(EFFECTIVE_TO)) as EFFECTIVE_TO,
    iff(count_if(LAST_DATE_STARTS is null) > 0, null, max(LAST_DATE_STARTS)) as LAST_DATE_STARTS
  from LARS.STANDARD
  group by STANDARD_CODE
`

// Records a manager removed as entered in error are kept, but never
// returned (REMOVEDAT is set).
const byLearner = (table, columns, order) => `
  select ${columns} from ${table}
  where ${IN_ORG_LEARNERS} -- whole organisation: the ILR return covers everyone
    and REMOVEDAT is null
  order by LEARNREFNUMBER${order ? `, ${order}` : ''}
`
const PRIOR_QUERY = byLearner('ILR.PRIOR_ATTAINMENT', 'LEARNREFNUMBER, PRIORLEVEL, DATELEVELAPP', 'DATELEVELAPP')
const LLDD_QUERY = byLearner('ILR.LLDD_HEALTH_PROBLEM', 'LEARNREFNUMBER, LLDDCAT, PRIMARYLLDD', 'LLDDCAT')
const LEARNER_FAM_QUERY = byLearner('ILR.LEARNER_FAM', 'LEARNREFNUMBER, LEARNFAMTYPE, LEARNFAMCODE', 'LEARNFAMTYPE')
const EMPLOYMENT_QUERY = byLearner('ILR.EMPLOYMENT_STATUS', 'LEARNREFNUMBER, DATEEMPSTATAPP, EMPSTAT, EMPID, AGREEMID', 'DATEEMPSTATAPP')
const ESM_QUERY = byLearner('ILR.EMPLOYMENT_STATUS_MONITORING', 'LEARNREFNUMBER, DATEEMPSTATAPP, ESMTYPE, ESMCODE', 'DATEEMPSTATAPP, ESMTYPE')
const AIM_FAM_QUERY = byLearner('ILR.LEARNING_DELIVERY_FAM',
  'FAMID, LEARNREFNUMBER, AIMSEQNUMBER, LEARNDELFAMTYPE, LEARNDELFAMCODE, DATEFROM, DATETO', 'AIMSEQNUMBER, LEARNDELFAMTYPE, DATEFROM')
const HOURS_QUERY = byLearner('ILR.HOURS_RECORD', 'LEARNREFNUMBER, AIMSEQNUMBER, HRSTYPE, HRSCODE, HRSAMOUNT', 'AIMSEQNUMBER, HRSCODE')
const FIN_QUERY = byLearner(ORG_APP_FIN_RECORD,
  'LEARNREFNUMBER, AIMSEQNUMBER, AFINTYPE, AFINCODE, AFINDATE, AFINAMOUNT', 'AIMSEQNUMBER, AFINTYPE, AFINCODE, AFINDATE')

// Snowflake DATE columns can arrive as strings or Date objects. Everything
// here works with 'YYYY-MM-DD' strings, which compare correctly as text.
function isoDate(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value.slice(0, 10)
  return new Date(value).toISOString().slice(0, 10)
}
const DATE_COLUMNS = new Set(['DATEOFBIRTH', 'LEARNSTARTDATE', 'ORIGLEARNSTARTDATE', 'LEARNPLANENDDATE', 'LEARNACTENDDATE',
  'ACHDATE', 'DATELEVELAPP', 'DATEEMPSTATAPP', 'DATEFROM', 'DATETO', 'AFINDATE', 'EFFECTIVE_FROM', 'EFFECTIVE_TO', 'LAST_DATE_STARTS'])
export const clean = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, DATE_COLUMNS.has(k) ? isoDate(v) : v])))

function group(rows) {
  const map = new Map()
  for (const r of rows) {
    if (!map.has(r.LEARNREFNUMBER)) map.set(r.LEARNREFNUMBER, [])
    map.get(r.LEARNREFNUMBER).push(r)
  }
  return (ref) => map.get(ref) ?? []
}

// An aim belongs in the year's return if it's still open at the start of the
// year, or ended or was achieved during the year or later.
//
// Carried over from earlier years (Appendix B, migration specification
// 2026 to 2027, version 1): aims still continuing, aims closed for a break
// in learning (CompStatus 6) and aims whose outcome isn't known yet
// (Outcome 8: training finished, waiting for the EPA), if their planned
// end date is no more than 2 years before the year starts. A learner who
// has restarted after a break leaves the break aim behind (part 7 step
// 4g-2).
export function aimInYear(aim, year) {
  const { start } = ILR_YEARS[year]
  if (aim.LEARNACTENDDATE !== null && aim.LEARNACTENDDATE >= start) return true
  if (aim.ACHDATE !== null && aim.ACHDATE >= start) return true
  const recent = aim.LEARNPLANENDDATE >= `${Number(start.slice(0, 4)) - 2}${start.slice(4)}`
  if (aim.LEARNACTENDDATE === null) return recent
  return recent && (aim.COMPSTATUS === 6 || aim.OUTCOME === 8)
}

// The source of funding (always 105, adult) and the contract type (always
// ACT 1 on programme aims starting from 1 April 2021, rule LearnDelFAMType_92)
// aren't stored: they're added here. ACT runs from the aim's start to its
// achievement date, or its actual end date once closed (R_102, R_121-R_123).
function derivedFams(aim) {
  const fams = [{ LEARNDELFAMTYPE: 'SOF', LEARNDELFAMCODE: '105', DATEFROM: null, DATETO: null, DERIVED: true }]
  if (aim.AIMTYPE === 1 || aim.IS_ENGLISH_OR_MATHS) {
    // A programme still at CompStatus 1 (training finished, waiting for the
    // EPA: Outcome 8) keeps its ACT open (R_123).
    const to = aim.AIMTYPE === 1 && aim.ACHDATE ? aim.ACHDATE : aim.AIMTYPE === 1 && aim.COMPSTATUS === 1 ? null : aim.LEARNACTENDDATE
    fams.push({ LEARNDELFAMTYPE: 'ACT', LEARNDELFAMCODE: '1', DATEFROM: aim.LEARNSTARTDATE, DATETO: to, DERIVED: true })
  }
  return fams
}

// One learner put together in the shape of the ILR for a year, from their
// rows in each table (already cleaned): { aims, prior, lldd, learnerFams,
// employment, esm, aimFams, hours, fin }. Null if none of their aims is in
// the year's return. Used by the return and by one learner's checks on the
// Record tab (learner.js), so both check exactly the same thing.
// An aim on a break that the apprentice has returned from goes with the
// return: it's in a year's return if it ended in that year, or while its
// restart is (provider support manual, "Recording apprenticeship
// programmes": keep returning the aims from before the break until the
// apprenticeship is completed or the apprentice withdraws). The restart is
// the later aim for the same learning aim with its original start date.
export function inYearWithRestarts(aim, allAims, year) {
  const restart = restartOf(aim, allAims)
  if (!restart) return aimInYear(aim, year)
  return (aim.LEARNACTENDDATE !== null && aim.LEARNACTENDDATE >= ILR_YEARS[year].start) || inYearWithRestarts(restart, allAims, year)
}

export function assembleLearner(l, rows, year) {
  const allAims = rows.aims
  const yearAims = allAims.filter((a) => inYearWithRestarts(a, allAims, year))
  if (yearAims.length === 0) return null
  return {
    ...l,
    prior: rows.prior,
    lldd: rows.lldd,
    learnerFams: rows.learnerFams,
    employment: rows.employment.map((e) => ({ ...e, esm: rows.esm.filter((m) => m.DATEEMPSTATAPP === e.DATEEMPSTATAPP) })),
    earliestStart: allAims.map((a) => a.LEARNSTARTDATE).sort()[0],
    // The file numbers the aims it returns consecutively from 1 (ILR
    // specification 2026 to 2027, AimSeqNumber; rule AimSeqNumber_02).
    // Warren's own numbers can have gaps: a removed aim keeps its number.
    aims: yearAims.map((a, i) => ({ ...aimWithRecords(a, rows), FILESEQ: i + 1 })),
  }
}

// An aim with its FAMs (including the SOF and ACT the export adds), hours
// and prices.
export function aimWithRecords(a, rows) {
  const aim = { ...a, IS_ENGLISH_OR_MATHS: a.AIMTYPE === 3 && isEnglishOrMaths(a.AIMTITLE) }
  const seq = a.AIMSEQNUMBER
  return {
    ...aim,
    fams: [...derivedFams(aim), ...rows.aimFams.filter((f) => f.AIMSEQNUMBER === seq)],
    hours: rows.hours.filter((h) => h.AIMSEQNUMBER === seq),
    fin: rows.fin.filter((f) => f.AIMSEQNUMBER === seq),
  }
}

// Returns { organisation, learners, standards, standardVersions, excluded,
// problem }. When
// problem is set, no file may be made (for example, no UKPRN, or a test
// organisation without a dummy UKPRN).
export async function loadIlrData(connection, year) {
  const [organisation] = await execute(connection, ORGANISATION_QUERY)
  if (!organisation) return { problem: 'Your organisation could not be found.' }
  const isTest = organisation.ISTESTDATA === true
  const ukprn = organisation.UKPRN === null ? null : Number(organisation.UKPRN)
  if (ukprn === null) {
    return { organisation, problem: 'Your organisation has no UKPRN yet, so an ILR file can\'t be made.' }
  }
  if (isTest && !TEST_UKPRNS.has(ukprn)) {
    return { organisation, problem: `This is a test organisation, so it can only use a dummy UKPRN (${[...TEST_UKPRNS].join(' or ')}), not ${ukprn}.` }
  }
  if (!isTest && TEST_UKPRNS.has(ukprn)) {
    return { organisation, problem: `${ukprn} is a dummy UKPRN for test data. A real organisation needs its own UKPRN.` }
  }

  const [learners, aims, standards, prior, lldd, learnerFams, employment, esm, aimFams, hours, fin] = await Promise.all(
    [LEARNERS_QUERY, AIMS_QUERY, STANDARDS_QUERY, PRIOR_QUERY, LLDD_QUERY, LEARNER_FAM_QUERY, EMPLOYMENT_QUERY, ESM_QUERY,
      AIM_FAM_QUERY, HOURS_QUERY, FIN_QUERY].map(async (sql) => clean(await execute(connection, sql))),
  )
  const aimsOf = group(aims)
  const priorOf = group(prior)
  const llddOf = group(lldd)
  const learnerFamsOf = group(learnerFams)
  const employmentOf = group(employment)
  const esmOf = group(esm)
  const aimFamsOf = group(aimFams)
  const hoursOf = group(hours)
  const finOf = group(fin)

  // Test data never goes under a real UKPRN, and real records never go into
  // a test file: a learner is only included when their test-data flag
  // matches the organisation's.
  const excluded = { testLearnersInRealOrganisation: 0, realLearnersInTestOrganisation: 0 }
  const included = []
  for (const l of learners) {
    if (l.ISTESTDATA !== isTest) {
      if (isTest) excluded.realLearnersInTestOrganisation++
      else excluded.testLearnersInRealOrganisation++
      continue
    }
    const ref = l.LEARNREFNUMBER
    const learner = assembleLearner(l, {
      aims: aimsOf(ref),
      prior: priorOf(ref),
      lldd: llddOf(ref),
      learnerFams: learnerFamsOf(ref),
      employment: employmentOf(ref),
      esm: esmOf(ref),
      aimFams: aimFamsOf(ref),
      hours: hoursOf(ref),
      fin: finOf(ref),
    }, year)
    if (learner) included.push(learner)
  }
  return {
    organisation: { ...organisation, UKPRN: ukprn, ISTESTDATA: isTest },
    learners: included,
    standards: new Map(standards.map((s) => [s.STANDARD_CODE, s])),
    standardVersions: await loadStandardVersions(connection),
    excluded,
  }
}
