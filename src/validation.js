// Validation rules for the "add learner" form.
//
// This file has no dependency on the browser or on Node, so the exact same
// rules can run in two places: instantly in the browser as the user types,
// and again on the server before anything is saved (in case the browser
// check was bypassed or skipped).

import { SEX_OPTIONS, LLDD_HEALTH_PROBLEM_OPTIONS, ETHNICITY_OPTIONS } from './ilrCodes.js'

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i
const NI_NUMBER = /^[A-Za-z]{2}\d{6}[A-Da-d]$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^[+\d][\d\s]{6,19}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const SEX_CODES = new Set(SEX_OPTIONS.map((o) => o.code))
const LLDD_CODES = new Set(LLDD_HEALTH_PROBLEM_OPTIONS.map((o) => o.code))
const ETHNICITY_CODES = new Set(ETHNICITY_OPTIONS.map((o) => o.code))

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

// Returns an object mapping field name to error message.
// An empty object means the form is valid.
export function validateLearnerForm(input) {
  const errors = {}
  const v = input ?? {}

  // --- required learner fields ---
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

  // --- optional learner fields ---
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

  // --- required aim fields ---
  if (!isValidDateString(v.startDate)) {
    errors.startDate = 'Enter a valid start date.'
  }
  if (!isValidDateString(v.plannedEndDate)) {
    errors.plannedEndDate = 'Enter a valid planned end date.'
  } else if (isValidDateString(v.startDate) && v.plannedEndDate <= v.startDate) {
    errors.plannedEndDate = 'Planned end date must be after the start date.'
  }
  if (!/^\d+$/.test(String(v.stdCode ?? '').trim())) {
    errors.stdCode = 'Standard code must be a number.'
  }
  if (!isPostcode(v.dellocPostcode)) {
    errors.dellocPostcode = 'Enter a valid UK postcode.'
  }

  return errors
}
