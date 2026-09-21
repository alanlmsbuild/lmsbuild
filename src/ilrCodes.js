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
