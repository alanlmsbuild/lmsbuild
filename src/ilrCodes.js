// Dropdown code lists for the "add learner" form.
//
// IMPORTANT: these codes come from notes and have NOT been checked against
// an official source. Before using this for anything real, verify every
// code and label against the ILR 2026 to 2027 specification.

export const SEX_OPTIONS = [
  { code: 'M', label: 'Male' },
  { code: 'F', label: 'Female' },
]

export const LLDD_HEALTH_PROBLEM_OPTIONS = [
  { code: 1, label: 'Has a learning difficulty, disability or health problem' },
  { code: 2, label: 'Does not have a learning difficulty, disability or health problem' },
  { code: 9, label: 'No information provided' },
]

export const ETHNICITY_OPTIONS = [
  { code: 31, label: 'English/Welsh/Scottish/Northern Irish/British' },
  { code: 32, label: 'Irish' },
  { code: 33, label: 'Gypsy or Irish Traveller' },
  { code: 34, label: 'Any other White background' },
  { code: 35, label: 'White and Black Caribbean' },
  { code: 36, label: 'White and Black African' },
  { code: 37, label: 'White and Asian' },
  { code: 38, label: 'Any other Mixed background' },
  { code: 39, label: 'Indian' },
  { code: 40, label: 'Pakistani' },
  { code: 41, label: 'Bangladeshi' },
  { code: 42, label: 'Chinese' },
  { code: 43, label: 'Any other Asian background' },
  { code: 44, label: 'African' },
  { code: 45, label: 'Caribbean' },
  { code: 46, label: 'Any other Black background' },
  { code: 47, label: 'Arab' },
  { code: 98, label: 'Any other ethnic group' },
  { code: 99, label: 'Not known/not provided' },
]

// Apprenticeship standards are not listed here: they come from the real
// LARS data in CAPTURE_DB.LARS.STANDARD, via GET /api/standards.

// Outcome 1 (achieved) comes from my notes and must be checked against the
// ILR 2026 to 2027 specification before this is used for anything real.
export const OUTCOME_ACHIEVED = 1

// This is a shortened list of withdrawal reasons. Codes 2, 7, 40, 41, 42,
// 45, 46, 47, 48 also exist in the ILR spec but are left out here as
// uncommon or not relevant to apprenticeships; codes 42 and 45 are for
// higher education aims only. This list comes from notes and must be
// checked against the ILR 2026 to 2027 specification before it is used for
// anything real.
export const WITHDRAW_REASON_OPTIONS = [
  { code: 3, label: 'Learner injury or illness' },
  { code: 29, label: 'Learner made redundant' },
  { code: 43, label: 'Financial reasons' },
  { code: 44, label: 'Other personal reasons' },
  { code: 97, label: 'Other' },
  { code: 98, label: 'Reason not known' },
]

// These are not ILR fields - they're local contact-preference options for
// the "contact methods allowed" checklist and "preferred contact method"
// dropdown. CONTACTMETHODSALLOWED stores a comma-separated list of these
// codes; PREFERREDCONTACTMETHOD stores a single one.
export const CONTACT_METHOD_OPTIONS = [
  { code: 'PHONE', label: 'Phone' },
  { code: 'MOBILE', label: 'Mobile' },
  { code: 'EMAIL', label: 'Email' },
  { code: 'POST', label: 'Post' },
  { code: 'SMS', label: 'SMS' },
]

// PLACEHOLDER: these contract type options are placeholders only, and will
// be replaced with the real contract types later.
export const CONTRACT_TYPE_OPTIONS = [
  { code: 'LEVY', label: 'Levy funded' },
  { code: 'CO_INVEST', label: 'Co-investment (non-levy)' },
  { code: 'FULLY_FUNDED', label: 'Fully funded' },
  { code: 'OTHER', label: 'Other' },
]

// Not an ILR field - local officer role options for the officer type
// dropdown. More types (e.g. Coach, Employer contact) may be added later.
export const OFFICER_TYPE_OPTIONS = [
  { code: 'TUTOR', label: 'Tutor' },
  { code: 'ASSESSOR', label: 'Assessor' },
]
