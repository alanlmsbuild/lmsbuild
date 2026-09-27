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
  WITHDRAW_REASON_OPTIONS,
  CONTACT_METHOD_OPTIONS,
  CONTRACT_TYPE_OPTIONS,
  OFFICER_TYPE_OPTIONS,
} from './ilrCodes.js'
import { EVIDENCE_TYPE_OPTIONS, IQA_OUTCOME_OPTIONS, TYPES_NEEDING_A_FILE } from './burrowCodes.js'

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i
const NI_NUMBER = /^[A-Za-z]{2}\d{6}[A-Da-d]$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE = /^[+\d][\d\s]{6,19}$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const STANDARD_CODE = /^\d+$/

const SEX_CODES = new Set(SEX_OPTIONS.map((o) => o.code))
const LLDD_CODES = new Set(LLDD_HEALTH_PROBLEM_OPTIONS.map((o) => o.code))
const ETHNICITY_CODES = new Set(ETHNICITY_OPTIONS.map((o) => o.code))
const WITHDRAW_REASON_CODES = new Set(WITHDRAW_REASON_OPTIONS.map((o) => o.code))
const CONTACT_METHOD_CODES = new Set(CONTACT_METHOD_OPTIONS.map((o) => o.code))
const CONTRACT_TYPE_CODES = new Set(CONTRACT_TYPE_OPTIONS.map((o) => o.code))
const OFFICER_TYPE_CODES = new Set(OFFICER_TYPE_OPTIONS.map((o) => o.code))
const EVIDENCE_TYPE_CODES = new Set(EVIDENCE_TYPE_OPTIONS.map((o) => o.code))
const IQA_OUTCOME_CODES = new Set(IQA_OUTCOME_OPTIONS.map((o) => o.code))
const KSB_REFERENCE = /^[KSB]\d+[A-Z]?$/

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
export function todayString() {
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

  if (v.title && String(v.title).trim().length > 10) {
    errors.title = 'Title must be 10 characters or fewer.'
  }
  if (v.addressLine1 && String(v.addressLine1).trim().length > 100) {
    errors.addressLine1 = 'Address line 1 must be 100 characters or fewer.'
  }
  if (v.addressLine2 && String(v.addressLine2).trim().length > 100) {
    errors.addressLine2 = 'Address line 2 must be 100 characters or fewer.'
  }
  if (v.addressLine3 && String(v.addressLine3).trim().length > 100) {
    errors.addressLine3 = 'Address line 3 must be 100 characters or fewer.'
  }
  if (v.wardOrCounty && String(v.wardOrCounty).trim().length > 100) {
    errors.wardOrCounty = 'Ward or county must be 100 characters or fewer.'
  }
  if (v.mobile && !PHONE.test(String(v.mobile).trim())) {
    errors.mobile = 'Enter a valid mobile number.'
  }

  const contactMethodsAllowed = Array.isArray(v.contactMethodsAllowed) ? v.contactMethodsAllowed : []
  if (contactMethodsAllowed.some((code) => !CONTACT_METHOD_CODES.has(code))) {
    errors.contactMethodsAllowed = 'Choose contact methods from the list.'
  }
  if (v.preferredContactMethod && !CONTACT_METHOD_CODES.has(v.preferredContactMethod)) {
    errors.preferredContactMethod = 'Choose a preferred contact method from the list.'
  } else if (
    v.preferredContactMethod &&
    contactMethodsAllowed.length > 0 &&
    !contactMethodsAllowed.includes(v.preferredContactMethod)
  ) {
    errors.preferredContactMethod = 'Preferred contact method must be one of the allowed contact methods.'
  }

  if (v.nextOfKinName && String(v.nextOfKinName).trim().length > 160) {
    errors.nextOfKinName = 'Next of kin name must be 160 characters or fewer.'
  }
  if (v.nextOfKinRelationship && String(v.nextOfKinRelationship).trim().length > 50) {
    errors.nextOfKinRelationship = 'Next of kin relationship must be 50 characters or fewer.'
  }
  if (v.nextOfKinPhone && !PHONE.test(String(v.nextOfKinPhone).trim())) {
    errors.nextOfKinPhone = 'Enter a valid next of kin phone number.'
  }

  if (v.contractType && !CONTRACT_TYPE_CODES.has(v.contractType)) {
    errors.contractType = 'Choose a contract type from the list.'
  }
}

// The aim fields (as opposed to the learner fields) are the same whether
// you're adding a new learner or editing an existing one, so both
// validateLearnerForm and validateLearnerEditForm call this. Whether the
// start date is actually allowed to change (only when the aim is still
// continuing, COMPSTATUS 1) is checked separately by the server against
// the database, never against anything the browser sends - see the
// PUT /api/learners/:learnRefNumber route. Likewise, whether the standard
// code is in LARS and open for new starts needs the database, so only its
// shape is checked here and the server's checkStandard does the rest.
function validateAimFields(v, errors) {
  if (!isValidDateString(v.startDate)) {
    errors.startDate = 'Enter a valid start date.'
  }
  if (!isValidDateString(v.plannedEndDate)) {
    errors.plannedEndDate = 'Enter a valid planned end date.'
  } else if (isValidDateString(v.startDate) && v.plannedEndDate <= v.startDate) {
    errors.plannedEndDate = 'Planned end date must be after the start date.'
  }
  if (!STANDARD_CODE.test(String(v.stdCode ?? '').trim())) {
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

// Validates the "withdraw an aim" form. startDate is the aim's existing
// start date (from the database), used to check the end date isn't before
// it, the same way validateCompleteAimForm does.
export function validateWithdrawAimForm(input, startDate) {
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

  if (!WITHDRAW_REASON_CODES.has(Number(v.withdrawReason))) {
    errors.withdrawReason = 'Choose a withdrawal reason from the list.'
  }

  return errors
}

// Validates the "add an officer" form.
export function validateOfficerForm(input) {
  const errors = {}
  const v = input ?? {}

  if (!v.name || String(v.name).trim().length === 0) {
    errors.name = 'Enter a name.'
  } else if (String(v.name).trim().length > 160) {
    errors.name = 'Name must be 160 characters or fewer.'
  }

  if (!OFFICER_TYPE_CODES.has(v.officerType)) {
    errors.officerType = 'Choose an officer type from the list.'
  }

  if (v.email && !EMAIL.test(String(v.email).trim())) {
    errors.email = 'Enter a valid email address.'
  }
  if (v.phone && !PHONE.test(String(v.phone).trim())) {
    errors.phone = 'Enter a valid phone number.'
  }

  return errors
}

// Validates the "record a progress review" form. employerAttended is a
// real true/false, not a string, so a missing answer can't pass as "no".
// Whether the date is on or after the learner's start date needs the
// database, so the server checks that separately.
export function validateProgressReviewForm(input) {
  const errors = {}
  const v = input ?? {}

  if (!isValidDateString(v.reviewDate)) {
    errors.reviewDate = 'Enter the date the review took place.'
  } else if (v.reviewDate > todayString()) {
    errors.reviewDate = 'Review date cannot be in the future.'
  }

  if (v.employerAttended !== true && v.employerAttended !== false) {
    errors.employerAttended = 'Say whether the employer attended.'
  }

  const summary = String(v.summary ?? '').trim()
  if (!summary) {
    errors.summary = 'Enter a short summary of the review.'
  } else if (summary.length > 1000) {
    errors.summary = 'Summary must be 1000 characters or fewer.'
  }

  return errors
}

// Validates Burrow's add evidence form, for saving a draft. A draft needs
// only a title, a type and a date, so a quick capture on a phone can be
// saved straight away and finished later.
export function validateEvidenceForm(input) {
  const errors = {}
  const v = input ?? {}

  const title = String(v.title ?? '').trim()
  if (!title) {
    errors.title = 'Give it a title.'
  } else if (title.length > 200) {
    errors.title = 'Title must be 200 characters or fewer.'
  }

  if (!EVIDENCE_TYPE_CODES.has(v.evidenceType)) {
    errors.evidenceType = 'Choose what kind of evidence this is.'
  }

  if (!isValidDateString(v.occurredOn)) {
    errors.occurredOn = 'Enter the date it happened.'
  } else if (v.occurredOn > todayString()) {
    errors.occurredOn = 'The date cannot be in the future.'
  }

  if (String(v.reflection ?? '').length > 5000) {
    errors.reflection = 'Keep this to 5000 characters or fewer.'
  }

  const ksbs = Array.isArray(v.ksbs) ? v.ksbs : []
  if (ksbs.some((ref) => !KSB_REFERENCE.test(String(ref)))) {
    errors.ksbs = 'Choose KSBs from the list.'
  }

  return errors
}

// The extra checks before evidence can be sent for review. fileCount is the
// number of files attached (the server counts them in the database).
export function validateEvidenceSubmission(input, fileCount) {
  const errors = validateEvidenceForm(input)
  const v = input ?? {}

  if (!String(v.reflection ?? '').trim()) {
    errors.reflection = 'Say what you did and what you learned before sending this.'
  }
  const ksbs = Array.isArray(v.ksbs) ? v.ksbs : []
  if (ksbs.length === 0 && !errors.ksbs) {
    errors.ksbs = 'Tick at least one KSB this shows.'
  }
  if (TYPES_NEEDING_A_FILE.has(v.evidenceType) && fileCount === 0) {
    errors.files = 'Add the file before sending this for review.'
  }

  return errors
}

// Validates an IQA check of an assessor's sign-off. Feedback is needed when
// action is required, so the assessor knows what to do. Whether the IQA
// signed it off themselves needs the database, so the server checks that.
export function validateIqaCheckForm(input) {
  const errors = {}
  const v = input ?? {}

  if (!IQA_OUTCOME_CODES.has(v.outcome)) {
    errors.outcome = 'Choose whether you agree with the sign-off.'
  }

  const feedback = String(v.feedback ?? '').trim()
  if (v.outcome === 'action_required' && !feedback) {
    errors.feedback = 'Say what the assessor needs to do.'
  } else if (feedback.length > 2000) {
    errors.feedback = 'Keep this to 2000 characters or fewer.'
  }

  return errors
}
