// Validation rules for the "add learner" form.
//
// This file has no dependency on the browser or on Node, so the exact same
// rules can run in two places: instantly in the browser as the user types,
// and again on the server before anything is saved (in case the browser
// check was bypassed or skipped).

import {
  SEX_OPTIONS,
  LLDD_HEALTH_PROBLEM_OPTIONS,
  ETHNICITY_OPTIONS,
  STANDARD_OPTIONS,
} from './ilrCodes.js'

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i
const NI_NUMBER = /^[A-Za-z]{2}\d{6}[A-Da-d]$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^[+\d][\d\s]{6,19}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const SEX_CODES = new Set(SEX_OPTIONS.map((o) => o.code))
const LLDD_CODES = new Set(LLDD_HEALTH_PROBLEM_OPTIONS.map((o) => o.code))
const ETHNICITY_CODES = new Set(ETHNICITY_OPTIONS.map((o) => o.code))
const STANDARD_CODES = new Set(STANDARD_OPTIONS.map((o) => o.code))

function isUln(value) {
  const text = String(value ?? '').trim()
  if (!/^\d{10}$/.test(text)) return false
  const n = Number(text)
  return n >= 1000000000 && n <= 9999999999
}

function isPostcode(value) {
  return UK_POSTCODE.test(String(value ?? '').trim())
}

function isValidDateString(value) {
  if (!ISO_DATE.test(value ?? '')) return false
  return !Number.isNaN(new Date(value).getTime())
}

// Today's date as a YYYY-MM-DD string, so it can be compared with the ISO
// date strings the forms use just by comparing text.
function todayString() {
  return new Date().toISOString().slice(0, 10)
}

// The learner fields (as opposed to the aim fields) are the same whether
// you're adding a new learner or editing an existing one, so both
// validateLearnerForm and validateLearnerEditForm call this.
function validateLearnerFields(v, errors) {
  if (!isUln(v.uln)) {
    errors.uln = 'ULN must be exactly 10 digits, between 1000000000 and 9999999999.'
  }
  if (!ETHNICITY_CODES.has(Number(v.ethnicity))) {
    errors.ethnicity = 'Choose an ethnicity from the list.'
  }
  if (!SEX_CODES.has(v.sex)) {
    errors.sex = 'Choose a sex from the list.'
  }
  if (!LLDD_CODES.has(Number(v.lldd))) {
    errors.lldd = 'Choose an LLDD health problem option from the list.'
  }
  if (!isPostcode(v.postcodePrior)) {
    errors.postcodePrior = 'Enter a valid UK postcode.'
  }
  if (!isPostcode(v.postcode)) {
    errors.postcode = 'Enter a valid UK postcode.'
  }

  if (v.dateOfBirth && !isValidDateString(v.dateOfBirth)) {
    errors.dateOfBirth = 'Enter a valid date.'
  }
  if (v.niNumber && !NI_NUMBER.test(String(v.niNumber).trim())) {
    errors.niNumber = 'NI number must be 2 letters, 6 digits, then a letter A to D (e.g. AB123456C).'
  }
  if (v.phone && !PHONE.test(String(v.phone).trim())) {
    errors.phone = 'Enter a valid phone number.'
  }
  if (v.email && !EMAIL.test(String(v.email).trim())) {
    errors.email = 'Enter a valid email address.'
  }
}

// The aim fields (as opposed to the learner fields) are the same whether
// you're adding a new learner or editing an existing one, so both
// validateLearnerForm and validateLearnerEditForm call this. Whether the
// start date is actually allowed to change (only when the aim is still
// continuing, COMPSTATUS 1) is checked separately by the server against
// the database, never against anything the browser sends - see the
// PUT /api/learners/:learnRefNumber route.
function validateAimFields(v, errors) {
  if (!isValidDateString(v.startDate)) {
    errors.startDate = 'Enter a valid start date.'
  }
  if (!isValidDateString(v.plannedEndDate)) {
    errors.plannedEndDate = 'Enter a valid planned end date.'
  } else if (isValidDateString(v.startDate) && v.plannedEndDate <= v.startDate) {
    errors.plannedEndDate = 'Planned end date must be after the start date.'
  }
  if (!STANDARD_CODES.has(Number(v.stdCode))) {
    errors.stdCode = 'Choose a standard from the list.'
  }
  if (!isPostcode(v.dellocPostcode)) {
    errors.dellocPostcode = 'Enter a valid UK postcode.'
  }
}

// Returns an object mapping field name to error message.
// An empty object means the form is valid.
export function validateLearnerForm(input) {
  const errors = {}
  const v = input ?? {}

  validateLearnerFields(v, errors)
  validateAimFields(v, errors)

  return errors
}

// Validates the "edit a learner" form.
export function validateLearnerEditForm(input) {
  const errors = {}
  const v = input ?? {}

  validateLearnerFields(v, errors)
  validateAimFields(v, errors)

  return errors
}

// Validates the "mark aim as completed" form. startDate is the aim's
// existing start date (from the database), used to check the end and
// achievement dates aren't before it.
export function validateCompleteAimForm(input, startDate) {
  const errors = {}
  const v = input ?? {}
  const today = todayString()

  if (!isValidDateString(v.actualEndDate)) {
    errors.actualEndDate = 'Enter a valid end date.'
  } else if (v.actualEndDate < startDate) {
    errors.actualEndDate = 'End date cannot be before the start date.'
  } else if (v.actualEndDate > today) {
    errors.actualEndDate = 'End date cannot be in the future.'
  }

  if (!isValidDateString(v.achievementDate)) {
    errors.achievementDate = 'Enter a valid achievement date.'
  } else if (v.achievementDate < startDate) {
    errors.achievementDate = 'Achievement date cannot be before the start date.'
  } else if (v.achievementDate > today) {
    errors.achievementDate = 'Achievement date cannot be in the future.'
  }

  return errors
}
