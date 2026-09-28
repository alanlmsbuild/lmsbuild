// What the ILR codes on the Record tab mean, in the words of the ILR
// Specification 2026 to 2027 (Version 1, guidance.submit-learner-data.service.gov.uk/26-27/ilr,
// each field's page and each type's "attribute" page, read 28 September
// 2026). Only the codes an apprenticeship can use are listed where a list is
// long (learning delivery monitoring, source of funding); anything else
// shows as its type and code.

const PRIOR_LEVEL = {
  1: 'Entry Level',
  2: 'Level 1',
  3: 'Level 2',
  4: 'Full Level 2',
  5: 'Level 3',
  6: 'Full Level 3',
  7: 'Level 4',
  8: 'Level 5',
  9: 'Level 6',
  10: 'Level 7 and above',
  97: 'Other qualification, level not known',
  98: 'Not known',
  99: 'No qualifications',
}

const EMP_STAT = {
  10: 'In paid employment',
  11: 'Not in paid employment, looking for work and available to start work',
  12: 'Not in paid employment, not looking for work and/or not available to start work',
  98: 'Not known / not provided',
}

const ESM = {
  SEI: { title: 'Self employment indicator', codes: { 1: 'Learner is self employed' } },
  EII: {
    title: 'Employment intensity',
    codes: {
      5: 'Employed for 0 to 10 hours per week',
      6: 'Employed for 11 to 20 hours per week',
      7: 'Employed for 21 to 30 hours per week',
      8: 'Employed for 31+ hours per week',
    },
  },
  LOU: {
    title: 'Length of unemployment',
    codes: {
      1: 'Unemployed for less than 6 months',
      2: 'Unemployed for 6-11 months',
      3: 'Unemployed for 12-23 months',
      4: 'Unemployed for 24-35 months',
      5: 'Unemployed for 36 months or more',
    },
  },
  LOE: {
    title: 'Length of employment',
    codes: {
      1: 'Employed for up to 3 months',
      2: 'Employed for 4 months - 6 months',
      3: 'Employed for 7 months - 12 months',
      4: 'Employed for more than 12 months',
    },
  },
  BSI: {
    title: 'Benefit status',
    codes: {
      1: 'In receipt of Job Seekers Allowance (JSA)',
      4: 'In receipt of Universal Credit',
      5: 'In receipt of Employment and Support Allowance (all categories)',
      6: 'In receipt of other state benefits',
    },
  },
  PEI: { title: 'Previous education', codes: { 1: 'In full-time education or training prior to enrolment' } },
  SEM: { title: 'Small employer', codes: { 1: 'Small employer' } },
  OET: {
    title: 'Other employment type',
    codes: {
      1: 'Learner has been made redundant',
      2: 'Small or Medium Employer',
      3: 'Employer has changed',
      4: 'Employment outcome gained on eligible funded programme',
    },
  },
}

const LLDD_CAT = {
  4: 'Vision impairment',
  5: 'Hearing impairment',
  6: 'Disability affecting mobility',
  7: 'Profound complex disabilities',
  8: 'Social and emotional difficulties',
  9: 'Mental health difficulty',
  10: 'Moderate learning difficulty',
  11: 'Severe learning difficulty',
  12: 'Dyslexia',
  13: 'Dyscalculia',
  14: 'Autism spectrum disorder',
  15: "Asperger's syndrome (valid to 31 July 2025)",
  16: 'Temporary disability after illness (for example post-viral) or accident',
  17: 'Speech, Language and Communication Needs',
  18: 'Down Syndrome',
  93: 'Other physical disability',
  94: 'Other specific learning difficulty (e.g. Dyspraxia)',
  95: 'Other medical condition (for example epilepsy, asthma, diabetes)',
  96: 'Other learning difficulty',
  97: 'Other disability',
  98: 'Prefer not to say',
  99: 'Not provided',
}

const LEARNER_FAM = {
  EHC: { title: 'Education Health Care plan', codes: { 1: 'Learner has an Education Health Care plan' } },
  SEN: { title: 'Special educational needs', codes: { 1: 'Special educational needs' } },
  DLA: { title: 'Disabled students allowance', codes: { 1: 'Learner is in receipt of disabled students allowance' } },
  HNS: { title: 'High needs students', codes: { 1: "High needs student in receipt of element 3 'top-up' funding" } },
  ECF: {
    title: 'GCSE English condition of funding',
    codes: {
      1: 'Exempt due to a learning difficulty',
      2: 'Exempt: holds an equivalent overseas qualification',
      3: 'Met: holds an approved equivalent UK qualification',
      4: 'Met: valid English GCSE or equivalent at another institution',
      5: 'Holds a pass grade for functional skills level 2 in English',
    },
  },
  MCF: {
    title: 'GCSE maths condition of funding',
    codes: {
      1: 'Exempt due to a learning difficulty',
      2: 'Exempt: holds an equivalent overseas qualification',
      3: 'Met: holds an approved equivalent UK qualification',
      4: 'Met: valid maths GCSE or equivalent at another institution',
      5: 'Holds a pass grade for functional skills level 2 in mathematics',
    },
  },
  NLM: {
    title: 'National learner monitoring',
    codes: {
      17: 'Learner migrated as part of provider merger',
      18: 'Learner moved as a result of Minimum Contract Level',
      22: 'Learner repeating up to one full year of 16-19 funded provision',
    },
  },
  LSR: { title: 'Learner support reason', codes: {} },
  EDF: { title: '16-19 disadvantage funding eligibility', codes: {} },
  FME: { title: 'Free meals eligibility', codes: { 2: 'Eligible for and in receipt of free meals' } },
  MMH: { title: 'Maths minimum hours', codes: {} },
  EMH: { title: 'English minimum hours', codes: {} },
}

const LEARN_DEL_FAM = {
  SOF: { title: 'Source of funding', codes: { 105: 'Adult skills funded' } },
  ACT: {
    title: 'Apprenticeship contract type',
    codes: {
      1: 'Apprenticeship funded through a contract for services with the employer',
      2: 'Apprenticeship funded through a contract for services with the Education and Skills Funding Agency',
    },
  },
  LSF: { title: 'Learning support funding', codes: { 1: 'Learning support funding' } },
  EEF: {
    title: 'Eligibility for enhanced apprenticeship funding',
    codes: {
      2: 'Entitlement to 16-18 apprenticeship funding, where the learner is 19 or over',
      3: 'Entitlement to 19-23 apprenticeship funding, where the learner is 24 or over',
      4: 'Entitlement to extended funding for apprentices',
    },
  },
  RES: { title: 'Restart indicator', codes: { 1: 'Learning aim restarted' } },
  FFI: { title: 'Full or co-funding indicator', codes: { 1: 'Fully funded learning aim', 2: 'Co funded learning aim' } },
  LDM: {
    title: 'Learning delivery monitoring',
    codes: {
      118: 'Proxy learning aim',
      129: 'Group Training Association (GTA)',
      130: 'Apprenticeship Training Agency (ATA)',
      356: 'Apprenticeship being delivered to own employees',
      361: 'Waiver to record payment records for apprenticeships',
      362: 'Apprentice care leavers',
      366: 'Non-levy non-procured contract for authorised apprentices',
      374: 'Amended earnings calculation for authorised apprentices',
      386: 'Flexi-Job Apprenticeship Agencies (FJAAs)',
      387: 'SME Apprenticeship Brokerage Pathfinder',
    },
  },
  DAM: { title: 'Devolved area monitoring', codes: {} },
  EVI: { title: 'Event indicator', codes: {} },
}

const AFIN = {
  TNP: {
    title: 'Total negotiated price',
    codes: {
      1: 'Total training price',
      2: 'Total assessment price',
      3: 'Residual training price',
      4: 'Residual assessment price',
    },
  },
  PMR: {
    title: 'Payment record',
    codes: { 1: 'Training payment', 2: 'Assessment payment', 3: 'Employer payment reimbursed by provider' },
  },
  RIP: { title: 'Price reduction', codes: { 1: 'Price reduction due to prior learning' } },
}

const HRS = {
  1: 'Planned hours for off the job training',
  3: 'Actual hours for off the job training',
  4: 'Planned off the job hours removed for prior learning',
}

const FUND_MODEL = { 36: 'Apprenticeships (from 1 May 2017)', 81: 'Other Adult', 99: 'Non-funded' }
const PROG_TYPE = { 25: 'Apprenticeship standard' }

const plain = (map, code) => map[Number(code)] ?? (code === null || code === undefined ? '—' : `Code ${code}`)
const typed = (map, type, code) => {
  const t = map[type]
  const meaning = t?.codes[Number(code)]
  return { type: t ? `${t.title} (${type})` : type, code: meaning ? `${meaning} (${code})` : String(code) }
}

export const priorLevelLabel = (code) => plain(PRIOR_LEVEL, code)
export const empStatLabel = (code) => plain(EMP_STAT, code)
export const llddCatLabel = (code) => plain(LLDD_CAT, code)
export const hrsLabel = (code) => plain(HRS, code)
export const fundModelLabel = (code) => `${plain(FUND_MODEL, code)} (${code})`
export const progTypeLabel = (code) => (code === null || code === undefined ? '—' : `${plain(PROG_TYPE, code)} (${code})`)
export const esmLabel = (type, code) => typed(ESM, type, code)
export const learnerFamLabel = (type, code) => typed(LEARNER_FAM, type, code)
export const learnDelFamLabel = (type, code) => typed(LEARN_DEL_FAM, type, code)
export const afinLabel = (type, code) => typed(AFIN, type, code)
