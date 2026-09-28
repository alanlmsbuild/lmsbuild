// The ILR 2026 to 2027 validation rules Warren can check itself, by their
// official names (Validation Rules 2026 to 2027, Version 4, 9 September
// 2026). Rules that need DfE's reference data are listed in NOT_CHECKED,
// with whether FIS runs them.
//
// SOF and ACT are checked as the export adds them (see data.js).

import { ILR_YEARS } from './data.js'
import { ilrTelNo } from './xml.js'
import { isEmployerIdentifier } from '../../src/validation.js'

// severity: 'Error' stops a file being accepted, 'Warning' doesn't.
export const RULES = {
  ULN_04: ['Error', 'The ULN must pass the check digit calculation.'],
  R_59: ['Error', 'Two learners in the file have the same ULN.'],
  FamilyName_01: ['Error', 'The family name must be returned, and (schema) can\'t contain digits.'],
  GivenNames_01: ['Error', 'The given names must be returned, and (schema) can\'t contain digits.'],
  DateOfBirth_01: ['Error', 'The date of birth must be returned for apprentices.'],
  DateOfBirth_48: ['Error', 'The apprentice started before the last Friday in June of the academic year they turned 16.'],
  DateOfBirth_46: ['Error', 'Planned duration under 365 days (starts to 31 July 2025, learner 16 or over).'],
  DateOfBirth_47: ['Error', 'Completed in under 365 days (starts to 31 July 2025).'],
  DateOfBirth_57: ['Error', 'Planned duration under 242 days (starts from 1 August 2025, learner 16 or over).'],
  DateOfBirth_58: ['Error', 'Completed in under 242 days (starts from 1 August 2025).'],
  AddLine1_03: ['Error', 'Address line 1 must be returned.'],
  Postcode_15: ['Error', 'The postcode isn\'t in a valid postcode format.'],
  PostcodePrior_02: ['Error', 'The postcode prior to enrolment isn\'t in a valid postcode format.'],
  DelLocPostCode_11: ['Error', 'The delivery location postcode isn\'t in a valid postcode format.'],
  NINumber_01: ['Error', 'The NI number isn\'t in a valid format.'],
  NINumber_02: ['Error', 'The NI number must be returned for an apprentice funded through the employer (ACT 1).'],
  LLDDHealthProb_06: ['Error', 'A learner with a learning difficulty, disability or health problem needs at least one LLDD category (under 25 at start).'],
  LLDDHealthProb_04: ['Error', 'LLDD categories were recorded for a learner who said they have none.'],
  PrimaryLLDD_01: ['Error', 'One LLDD category must be marked primary.'],
  PrimaryLLDD_03: ['Error', 'Only one LLDD category can be marked primary.'],
  LLDDCat_01: ['Error', 'The LLDD category isn\'t a valid code for this year.'],
  R_131: ['Error', 'There must be a prior attainment record on or before the earliest start date.'],
  EmpStat_09: ['Error', 'There must be an employment status record dated before the programme start.'],
  EmpStat_15: ['Error', 'The employment status at the programme start must not be "not known".'],
  EmpStat_12: ['Warning', 'The apprentice should be employed (EmpStat 10) at the programme start.'],
  EmpId_10: ['Error', 'An employed apprentice needs an employer identifier at the programme start.'],
  EmpId_02: ['Error', 'The employer identifier fails the check digit calculation (999999999 is allowed for an employer not on the Employer Data Service).'],
  ESMType_02: ['Error', 'An employed learner needs an employment intensity indicator (EII).'],
  ESMType_09: ['Error', 'An apprentice employed at the start needs a length of employment indicator (LOE).'],
  ESMType_15: ['Error', 'An employment monitoring type appears more than once on one employment status record.'],
  R_43: ['Error', 'Two employment status records have the same date.'],
  AimSeqNumber_02: ['Error', 'An aim sequence number is higher than the number of aims in the file.'],
  R_07: ['Error', 'Two aims have the same aim sequence number.'],
  LearnAimRef_01: ['Error', 'The learning aim reference isn\'t in LARS.'],
  LearnStartDate_03: ['Error', 'The start date is after the end of the teaching year.'],
  LearnStartDate_13: ['Error', 'The programme started after the standard\'s effective-to date in LARS.'],
  LearnStartDate_17: ['Error', 'The programme started before the standard\'s effective-from date in LARS.'],
  LearnStartDate_18: ['Error', 'The programme started after the standard\'s last date for new starts in LARS.'],
  LearnPlanEndDate_02: ['Error', 'The planned end date is before the start date.'],
  LearnActEndDate_01: ['Error', 'The actual end date is before the start date.'],
  LearnActEndDate_04: ['Error', 'The actual end date is after the file preparation date.'],
  Outcome_05: ['Error', 'An achieved aim needs an actual end date.'],
  Outcome_10: ['Error', 'Outcome 3 (no achievement) can\'t be on a continuing aim.'],
  Outcome_11: ['Error', 'An aim with an outcome needs an actual end date.'],
  Outcome_12: ['Error', 'An aim with an actual end date needs an outcome.'],
  CompStatus_03: ['Error', 'An aim with no actual end date must be continuing (completion status 1).'],
  CompStatus_04: ['Error', 'An aim with no outcome must be continuing (completion status 1).'],
  CompStatus_06: ['Error', 'A withdrawn aim or break in learning can\'t have outcome 1 or 8.'],
  CompStatus_07: ['Error', 'An apprenticeship standard with an achievement date must have completion status 2.'],
  AchDate_04: ['Error', 'An achievement date needs an actual end date.'],
  AchDate_05: ['Error', 'The achievement date is before the actual end date.'],
  AchDate_07: ['Error', 'The achievement date is after the file preparation date.'],
  AchDate_12: ['Error', 'A completed apprenticeship standard (completion status 2) needs its achievement date (the end of the end-point assessment).'],
  AchDate_14: ['Error', 'An achievement date can only be on the programme aim.'],
  WithdrawReason_03: ['Error', 'A withdrawn aim needs a withdrawal reason.'],
  WithdrawReason_04: ['Error', 'Only a withdrawn aim can have a withdrawal reason.'],
  StdCode_01: ['Error', 'An apprenticeship standard aim needs its standard code.'],
  LearnDelFAMType_01: ['Error', 'Every aim needs a source of funding (SOF).'],
  LearnDelFAMType_64: ['Error', 'The programme aim and English and maths aims need the apprenticeship contract type (ACT).'],
  R_102: ['Error', 'There must be an ACT record from the aim\'s start date.'],
  R_121: ['Error', 'The latest ACT record must end on the achievement date.'],
  R_122: ['Error', 'The latest ACT record must end on the actual end date when there\'s no achievement date.'],
  R_123: ['Error', 'A continuing programme\'s latest ACT record must not have an end date.'],
  LearnDelFAMDateFrom_01: ['Error', 'Learning support funding (LSF) needs both a date from and a date to - the planned end date while support is expected to last the whole aim.'],
  LearnDelFAMDateFrom_02: ['Error', 'A FAM date from is before the aim\'s start date.'],
  LearnDelFAMDateTo_01: ['Error', 'A FAM date to is before its date from.'],
  LearnDelFAMDateTo_02: ['Warning', 'A FAM date to is after the aim\'s planned end date.'],
  LearnDelFAMDateTo_03: ['Error', 'A FAM date to is after the aim\'s actual end date.'],
  R_52: ['Error', 'The same FAM type and code appear twice on one aim.'],
  R_30: ['Error', 'A component aim has no programme aim with the same programme type and standard.'],
  R_31: ['Error', 'An open programme aim needs a component aim.'],
  R_89: ['Error', 'The programme aim ended before one of its component aims.'],
  R_90: ['Error', 'A closed programme aim still has an open component aim.'],
  AFinType_12: ['Error', 'The programme needs a price record (TNP).'],
  AFinType_13: ['Error', 'The programme needs a price record dated its start date.'],
  AFinType_10: ['Warning', 'An end-point assessment price (TNP 2 or 4) should be recorded.'],
  R_100: ['Error', 'A completed programme needs an end-point assessment price (TNP 2 or 4).'],
  EPAOrgID_02: ['Error', 'An end-point assessment price needs an assessment organisation ID.'],
  EPAOrgID_03: ['Error', 'An assessment organisation ID needs an end-point assessment price.'],
  R_119: ['Error', 'A price record is dated before the start date.'],
  AFinDate_13: ['Error', 'A price record is dated after the achievement date, or after the actual end date of a withdrawn programme.'],
  R_68: ['Error', 'Two financial records have the same type, code and date.'],
  HRSType_01: ['Error', 'The programme needs its planned off-the-job hours (HRS 1).'],
  HRSType_08: ['Error', 'A completed programme needs its actual off-the-job hours (HRS 3).'],
  HRSType_09: ['Error', 'A withdrawn programme needs its actual off-the-job hours (HRS 3).'],
  HRSAmount_02: ['Error', 'Planned off-the-job hours under 278 (starts 1 August 2022 to 31 July 2025).'],
  HRSAmount_03: ['Error', 'Planned off-the-job hours under 187 (starts from 1 August 2025).'],
  HRSType_18: ['Error', 'The same hours code appears twice on one aim.'],
  'Warren: TelNo': ['Warning', 'The phone number isn\'t digits only, so it was left out of the file.'],
}

// Rules Warren can't check, because they need DfE reference data. The
// validation rules file says which ones FIS runs (its RuleInFis column):
// fis = true means FIS checks it with its reference data, false means it's
// only checked when the file is submitted to Submit Learner Data.
export const NOT_CHECKED = [
  { rules: 'LearnAimRef_114, LearnAimRef_116, LearnAimRef_132', what: 'LARS validity categories for component aims', fis: true },
  { rules: 'Filename_3', what: 'the UKPRN is on the organisation directory', fis: true },
  { rules: 'ULN_05', what: 'the ULN is on the Learner Register', fis: false },
  { rules: 'EmpId_01', what: 'the employer identifier is on the Employer Data Service', fis: false },
  { rules: 'UKPRN_10, UKPRN_21, UKPRN_33, UKPRN_35', what: 'the UKPRN has an apprenticeship funding relationship and can deliver the standard in the Apprenticeship Service', fis: false },
  { rules: 'Postcode_14, PostcodePrior_01, DelLocPostCode_03', what: 'postcodes exist (warnings)', fis: false },
  { rules: 'EPAOrgID_01', what: 'the assessment organisation is on the register for the standard (warning)', fis: false },
  { rules: 'AppSerAgeEligibility_01', what: 'age eligibility for the standard (starts from 1 August 2026)', fis: false },
  { rules: 'Filename_2, Filename_8, Inconsistent UKPRN', what: 'the file is newer than earlier submissions and matches the signed-in provider', fis: false },
]

// Where each rule's problem shows on the learner page's Record tab.
const SECTION_RULES = {
  personal: ['ULN_04', 'R_59', 'FamilyName_01', 'GivenNames_01', 'DateOfBirth_01', 'DateOfBirth_48', 'AddLine1_03',
    'Postcode_15', 'PostcodePrior_02', 'NINumber_01', 'NINumber_02', 'Warren: TelNo'],
  support: ['LLDDHealthProb_06', 'LLDDHealthProb_04', 'PrimaryLLDD_01', 'PrimaryLLDD_03', 'LLDDCat_01'],
  prior: ['R_131'],
  employment: ['EmpStat_09', 'EmpStat_15', 'EmpStat_12', 'EmpId_10', 'EmpId_02', 'ESMType_02', 'ESMType_09', 'ESMType_15', 'R_43'],
  programme: ['DateOfBirth_46', 'DateOfBirth_57', 'AimSeqNumber_02', 'R_07', 'LearnAimRef_01', 'LearnStartDate_03',
    'LearnStartDate_13', 'LearnStartDate_17', 'LearnStartDate_18', 'LearnPlanEndDate_02', 'StdCode_01', 'DelLocPostCode_11',
    'LearnDelFAMType_01', 'LearnDelFAMType_64', 'R_102', 'R_121', 'R_122', 'R_123', 'LearnDelFAMDateFrom_01',
    'LearnDelFAMDateFrom_02', 'LearnDelFAMDateTo_01', 'LearnDelFAMDateTo_02', 'LearnDelFAMDateTo_03', 'R_52',
    'EPAOrgID_02', 'EPAOrgID_03'],
  hours: ['HRSType_01', 'HRSType_08', 'HRSType_09', 'HRSAmount_02', 'HRSAmount_03', 'HRSType_18'],
  prices: ['AFinType_12', 'AFinType_13', 'AFinType_10', 'R_100', 'R_119', 'AFinDate_13', 'R_68'],
  components: ['R_30', 'R_31', 'R_89', 'R_90', 'AchDate_14'],
  outcome: ['DateOfBirth_47', 'DateOfBirth_58', 'LearnActEndDate_01', 'LearnActEndDate_04', 'Outcome_05', 'Outcome_10',
    'Outcome_11', 'Outcome_12', 'CompStatus_03', 'CompStatus_04', 'CompStatus_06', 'CompStatus_07', 'AchDate_04',
    'AchDate_05', 'AchDate_07', 'AchDate_12', 'WithdrawReason_03', 'WithdrawReason_04'],
}
export const RULE_SECTION = Object.fromEntries(
  Object.entries(SECTION_RULES).flatMap(([section, rules]) => rules.map((rule) => [rule, section])),
)

// Rules about details only managers see (NI number, prices and payments,
// and the assessment organisation, which goes with the assessment price).
// For anyone else those details read as empty, so these rules can't be
// checked for them and aren't shown.
export const MANAGER_ONLY_RULES = new Set(['NINumber_01', 'NINumber_02', ...SECTION_RULES.prices, 'EPAOrgID_02', 'EPAOrgID_03'])

const PC = /^[A-Z]{1,2}([0-9]{1,2}|[0-9][A-Z]) [0-9][ABD-HJLNP-UW-Z]{2}$/
const NAME = /^[^0-9\r\n\t|"]{1,100}$/
const NI = /^[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z][0-9]{6}[ABCD ]$/
const LLDD_CODES = new Set([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 93, 94, 95, 96, 97, 98, 99])

const d = (s) => new Date(`${s}T00:00:00Z`)
const days = (a, b) => Math.round((d(b) - d(a)) / 86400000)
const addYears = (s, n) => { const x = d(s); x.setUTCFullYear(x.getUTCFullYear() + n); return x.toISOString().slice(0, 10) }
function age(dob, on) {
  const a = d(dob), b = d(on)
  let y = b.getUTCFullYear() - a.getUTCFullYear()
  if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) y--
  return y
}
function lastFridayInJune(year) {
  const x = d(`${year}-06-30`)
  while (x.getUTCDay() !== 5) x.setUTCDate(x.getUTCDate() - 1)
  return x.toISOString().slice(0, 10)
}
function ulnPasses(uln) {
  const s = String(uln)
  if (!/^[1-9][0-9]{9}$/.test(s)) return false
  const r = [...s].slice(0, 9).reduce((sum, c, i) => sum + Number(c) * (10 - i), 0) % 11
  return r !== 0 && 10 - r === Number(s[9])
}

// Returns [{ rule, severity, description, learners: [ref...] }], errors
// first, then by number of learners. ulnCounts: how many learners in the
// file have each ULN, when learners isn't the whole file (one learner's
// checks), for R_59.
export function checkIlrRules({ learners, standards }, year, filePreparationDate, { ulnCounts } = {}) {
  const { end: yearEnd } = ILR_YEARS[year]
  const found = new Map()
  const fail = (rule, ref) => {
    if (!found.has(rule)) found.set(rule, new Set())
    found.get(rule).add(ref)
  }

  const ulnCount = ulnCounts ?? new Map()
  if (!ulnCounts) for (const l of learners) ulnCount.set(String(l.ULN), (ulnCount.get(String(l.ULN)) ?? 0) + 1)

  for (const l of learners) {
    const ref = l.LEARNREFNUMBER
    const f = (rule) => fail(rule, ref)
    const programme = l.aims.find((a) => a.AIMTYPE === 1)
    // learner
    if (!ulnPasses(l.ULN)) f('ULN_04')
    if (ulnCount.get(String(l.ULN)) > 1) f('R_59')
    if (!l.FAMILYNAME || !NAME.test(l.FAMILYNAME)) f('FamilyName_01')
    if (!l.GIVENNAMES || !NAME.test(l.GIVENNAMES)) f('GivenNames_01')
    if (!l.DATEOFBIRTH) f('DateOfBirth_01')
    if (!l.ADDRESSLINE1) f('AddLine1_03')
    if (!PC.test(l.POSTCODE ?? '')) f('Postcode_15')
    if (!PC.test(l.POSTCODEPRIOR ?? '')) f('PostcodePrior_02')
    if (l.TELNO && !ilrTelNo(l.TELNO)) f('Warren: TelNo')
    if (!l.NINUMBER) f('NINumber_02')
    else if (!NI.test(l.NINUMBER)) f('NINumber_01')
    if (l.LLDDHEALTHPROB === 1 && l.lldd.length === 0 && l.DATEOFBIRTH && age(l.DATEOFBIRTH, l.earliestStart) < 25) f('LLDDHealthProb_06')
    if (l.LLDDHEALTHPROB === 2 && l.lldd.length > 0) f('LLDDHealthProb_04')
    if (l.lldd.length > 0) {
      const primaries = l.lldd.filter((x) => x.PRIMARYLLDD).length
      if (primaries === 0) f('PrimaryLLDD_01')
      if (primaries > 1) f('PrimaryLLDD_03')
      if (l.lldd.some((x) => !LLDD_CODES.has(Number(x.LLDDCAT)))) f('LLDDCat_01')
    }
    if (!l.prior.some((p) => p.DATELEVELAPP <= l.earliestStart)) f('R_131')

    if (programme && l.DATEOFBIRTH) {
      const start = programme.LEARNSTARTDATE
      if (start >= '2016-08-01') {
        const turns16 = addYears(l.DATEOFBIRTH, 16)
        const month = Number(turns16.slice(5, 7))
        const academicYearEnd = month >= 9 ? Number(turns16.slice(0, 4)) + 1 : Number(turns16.slice(0, 4))
        if (start <= lastFridayInJune(academicYearEnd)) f('DateOfBirth_48')
      }
      if (age(l.DATEOFBIRTH, start) >= 16) {
        const [limit, planned, actual] = start <= '2025-07-31' ? [365, 'DateOfBirth_46', 'DateOfBirth_47'] : [242, 'DateOfBirth_57', 'DateOfBirth_58']
        if (days(start, programme.LEARNPLANENDDATE) < limit) f(planned)
        if (programme.COMPSTATUS === 2 && programme.LEARNACTENDDATE && days(start, programme.LEARNACTENDDATE) < limit) f(actual)
      }
    }

    // employment status
    if (programme) {
      const before = l.employment.filter((e) => e.DATEEMPSTATAPP < programme.LEARNSTARTDATE)
      const applies = before.at(-1)
      if (!applies) f('EmpStat_09')
      else {
        if (applies.EMPSTAT === 98) f('EmpStat_15')
        if (applies.EMPSTAT !== 10) f('EmpStat_12')
        if (applies.EMPSTAT === 10 && !applies.EMPID) f('EmpId_10')
        if (applies.EMPSTAT === 10 && !applies.esm.some((m) => m.ESMTYPE === 'LOE')) f('ESMType_09')
      }
    }
    for (const e of l.employment) {
      if (e.EMPID !== null && e.EMPID !== undefined && !isEmployerIdentifier(e.EMPID)) f('EmpId_02')
      const types = e.esm.map((m) => m.ESMTYPE)
      if (e.EMPSTAT === 10 && !types.includes('EII')) f('ESMType_02')
      if (['SEI', 'EII', 'LOU', 'LOE', 'BSI', 'PEI', 'SEM'].some((t) => types.filter((x) => x === t).length > 1)) f('ESMType_15')
    }
    if (new Set(l.employment.map((e) => e.DATEEMPSTATAPP)).size !== l.employment.length) f('R_43')

    // aims
    const seqs = l.aims.map((a) => a.AIMSEQNUMBER)
    if (new Set(seqs).size !== seqs.length) f('R_07')
    if (Math.max(...seqs) > l.aims.length) f('AimSeqNumber_02')
    for (const a of l.aims) {
      const isProgramme = a.AIMTYPE === 1
      const isStandard = a.FUNDMODEL === 36 && a.PROGTYPE === 25
      if (!a.IN_LARS) f('LearnAimRef_01')
      if (a.LEARNSTARTDATE > yearEnd) f('LearnStartDate_03')
      if (a.LEARNPLANENDDATE < a.LEARNSTARTDATE) f('LearnPlanEndDate_02')
      if (a.LEARNACTENDDATE && a.LEARNACTENDDATE < a.LEARNSTARTDATE) f('LearnActEndDate_01')
      if (a.LEARNACTENDDATE && a.LEARNACTENDDATE > filePreparationDate) f('LearnActEndDate_04')
      if (a.LEARNACTENDDATE && a.OUTCOME === null) f('Outcome_12')
      if (a.OUTCOME !== null && !a.LEARNACTENDDATE) f('Outcome_11')
      if (a.OUTCOME === 1 && !a.LEARNACTENDDATE) f('Outcome_05')
      if (a.OUTCOME === 3 && a.COMPSTATUS === 1) f('Outcome_10')
      if (!a.LEARNACTENDDATE && a.COMPSTATUS !== 1) f('CompStatus_03')
      if (a.OUTCOME === null && a.COMPSTATUS !== 1) f('CompStatus_04')
      if ([3, 6].includes(a.COMPSTATUS) && [1, 8].includes(a.OUTCOME)) f('CompStatus_06')
      if (isProgramme && isStandard && a.LEARNACTENDDATE >= '2021-08-01' && a.COMPSTATUS === 2 && !a.ACHDATE) f('AchDate_12')
      if (isProgramme && isStandard && a.LEARNACTENDDATE >= '2019-08-01' && a.ACHDATE && a.COMPSTATUS !== 2) f('CompStatus_07')
      if (a.ACHDATE) {
        if (!isProgramme) f('AchDate_14')
        if (!a.LEARNACTENDDATE) f('AchDate_04')
        else if (a.ACHDATE < a.LEARNACTENDDATE) f('AchDate_05')
        if (a.ACHDATE > filePreparationDate) f('AchDate_07')
      }
      if (a.COMPSTATUS === 3 && a.WITHDRAWREASON === null) f('WithdrawReason_03')
      if (a.COMPSTATUS !== 3 && a.WITHDRAWREASON !== null) f('WithdrawReason_04')
      if (a.PROGTYPE === 25 && a.STDCODE === null) f('StdCode_01')
      if (isProgramme && isStandard && a.STDCODE !== null) {
        const s = standards.get(a.STDCODE)
        if (s?.EFFECTIVE_FROM && a.LEARNSTARTDATE < s.EFFECTIVE_FROM) f('LearnStartDate_17')
        if (s?.EFFECTIVE_TO && a.LEARNSTARTDATE > s.EFFECTIVE_TO) f('LearnStartDate_13')
        if (s?.LAST_DATE_STARTS && a.LEARNSTARTDATE >= '2020-08-01' && a.LEARNSTARTDATE > s.LAST_DATE_STARTS) f('LearnStartDate_18')
      }
      // FAMs
      if (!a.fams.some((x) => x.LEARNDELFAMTYPE === 'SOF')) f('LearnDelFAMType_01')
      const acts = a.fams.filter((x) => x.LEARNDELFAMTYPE === 'ACT')
      if ((isProgramme || a.IS_ENGLISH_OR_MATHS) && a.FUNDMODEL === 36 && acts.length === 0) f('LearnDelFAMType_64')
      if (acts.length > 0) {
        if (!acts.some((x) => x.DATEFROM === a.LEARNSTARTDATE)) f('R_102')
        const latest = [...acts].sort((x, y) => (x.DATEFROM < y.DATEFROM ? -1 : 1)).at(-1)
        if (isProgramme && isStandard) {
          if (a.ACHDATE && latest.DATETO !== a.ACHDATE) f('R_121')
          if (a.COMPSTATUS !== 1 && !a.ACHDATE && latest.DATETO !== a.LEARNACTENDDATE) f('R_122')
          if (a.COMPSTATUS === 1 && latest.DATETO) f('R_123')
        }
      }
      for (const x of a.fams) {
        if (['LSF', 'ALB'].includes(x.LEARNDELFAMTYPE) && (!x.DATEFROM || !x.DATETO)) f('LearnDelFAMDateFrom_01')
        if (x.DATEFROM && x.DATETO && x.DATETO < x.DATEFROM) f('LearnDelFAMDateTo_01')
        // Not for an ACT that ends on the programme's achievement date.
        if (x.DATETO && x.DATETO > a.LEARNPLANENDDATE && !(isProgramme && x.LEARNDELFAMTYPE === 'ACT' && a.ACHDATE)) f('LearnDelFAMDateTo_02')
        if (x.DATEFROM && x.DATEFROM < a.LEARNSTARTDATE) f('LearnDelFAMDateFrom_02')
        // LearnDelFAMDateTo_03 doesn't apply to ACT.
        if (x.LEARNDELFAMTYPE !== 'ACT' && x.DATETO && a.LEARNACTENDDATE && x.DATETO > a.LEARNACTENDDATE) f('LearnDelFAMDateTo_03')
      }
      const famKeys = a.fams.map((x) => `${x.LEARNDELFAMTYPE}:${x.LEARNDELFAMCODE}`)
      if (new Set(famKeys).size !== famKeys.length) f('R_52')
      if (a.AIMTYPE === 3 && !l.aims.some((p) => p.AIMTYPE === 1 && p.PROGTYPE === a.PROGTYPE && p.STDCODE === a.STDCODE)) f('R_30')
    }

    // programme and components, prices, hours
    if (programme) {
      const components = l.aims.filter((a) => a.AIMTYPE === 3)
      if (!programme.LEARNACTENDDATE && components.length === 0) f('R_31')
      if (programme.LEARNACTENDDATE) {
        if (components.some((c) => !c.LEARNACTENDDATE)) f('R_90')
        const latest = components.map((c) => c.LEARNACTENDDATE).filter(Boolean).sort().at(-1)
        if (latest && programme.LEARNACTENDDATE < latest) f('R_89')
      }
      const tnp = programme.fin.filter((x) => x.AFINTYPE === 'TNP')
      const hasAssessmentPrice = tnp.some((x) => [2, 4].includes(x.AFINCODE))
      if (tnp.length === 0) f('AFinType_12')
      if (!tnp.some((x) => x.AFINDATE === programme.LEARNSTARTDATE)) f('AFinType_13')
      if (!hasAssessmentPrice) {
        f('AFinType_10')
        if (programme.COMPSTATUS === 2) f('R_100')
      }
      if (hasAssessmentPrice && !programme.EPAORGID) f('EPAOrgID_02')
      if (programme.EPAORGID && !hasAssessmentPrice) f('EPAOrgID_03')
      for (const x of tnp) {
        if (x.AFINDATE < programme.LEARNSTARTDATE) f('R_119')
        if (programme.ACHDATE && x.AFINDATE > programme.ACHDATE) f('AFinDate_13')
        if (programme.COMPSTATUS === 3 && programme.LEARNACTENDDATE && x.AFINDATE > programme.LEARNACTENDDATE) f('AFinDate_13')
      }
      const finKeys = programme.fin.map((x) => `${x.AFINTYPE}:${x.AFINCODE}:${x.AFINDATE}`)
      if (new Set(finKeys).size !== finKeys.length) f('R_68')

      const start = programme.LEARNSTARTDATE
      const codes = programme.hours.map((h) => h.HRSCODE)
      if (start >= '2019-08-01' && !codes.includes(1)) f('HRSType_01')
      if (start >= '2019-08-01' && programme.COMPSTATUS === 2 && !codes.includes(3)) f('HRSType_08')
      if (start >= '2022-08-01' && programme.COMPSTATUS === 3 && !codes.includes(3)) f('HRSType_09')
      for (const h of programme.hours.filter((x) => x.HRSCODE === 1)) {
        if (start >= '2025-08-01' && h.HRSAMOUNT < 187) f('HRSAmount_03')
        if (start >= '2022-08-01' && start <= '2025-07-31' && h.HRSAMOUNT < 278) f('HRSAmount_02')
      }
      if (new Set(codes).size !== codes.length) f('HRSType_18')
    }
  }

  return [...found.entries()]
    .map(([rule, refs]) => ({ rule, severity: RULES[rule][0], description: RULES[rule][1], learners: [...refs].sort() }))
    .sort((a, b) => (a.severity === b.severity ? b.learners.length - a.learners.length : a.severity === 'Error' ? -1 : 1))
}
