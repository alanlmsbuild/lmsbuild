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
import { EVIDENCE_TYPE_OPTIONS, IQA_OUTCOME_OPTIONS, TYPES_NEEDING_A_FILE, WITNESS_OUTCOME_OPTIONS } from './burrowCodes.js'

import {
  AIM_FAM_OPTIONS,
  PRICE_OPTIONS,
  BSI_OPTIONS,
  EII_OPTIONS,
  EMP_STAT_OPTIONS,
  LEARNER_FAM_OPTIONS,
  LLDD_CAT_OPTIONS,
  LLDD_CAT_VALID_TO,
  LOE_OPTIONS,
  LOU_OPTIONS,
  PRIOR_LEVEL_OPTIONS,
} from './ilrLabels.js'

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i
// The ILR's NI number format (rule NINumber_01): the first letter isn't D,
// F, I, Q, U or V, the second isn't D, F, I, O, Q, U or V, then 6 digits and
// A, B, C, D or a space.
const NI_NUMBER = /^[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z][0-9]{6}[ABCD ]$/
// The ILR's postcode format (rules Postcode_15, PostcodePrior_02,
// DelLocPostCode_11): outward code, one space, then a digit and two letters
// other than C, I, K, M, O and V.
const ILR_POSTCODE = /^[A-Z]{1,2}([0-9]{1,2}|[0-9][A-Z]) [0-9][ABD-HJLNP-UW-Z]{2}$/
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
const WITNESS_OUTCOME_CODES = new Set(WITNESS_OUTCOME_OPTIONS.map((o) => o.code))
const KSB_REFERENCE = /^[KSB]\d+[A-Z]?$/

// A ULN is 10 digits, not starting with 0, and the last digit is a check
// digit (DfE rule): weight the first 9 digits 10, 9, ... 2 and add them up.
// The remainder after dividing by 11 must not be 0, and the last digit must
// be 10 minus that remainder.
function isUln(value) {
  const text = String(value ?? '').trim()
  if (!/^[1-9]\d{9}$/.test(text)) return false
  const digits = [...text].map(Number)
  const remainder = digits.slice(0, 9).reduce((sum, d, i) => sum + d * (10 - i), 0) % 11
  return remainder !== 0 && digits[9] === 10 - remainder
}

// An employer identifier (ERN, the ILR's EmpId) is 9 digits whose last
// digit is a check digit (DfE rule EmpId_02, derived data DD05): weight the
// first 8 digits 9, 8, ... 2 and add them up, then take 11 minus the
// remainder after dividing by 11. 11 means 0, and 10 means the number can't
// be valid. 999999999 is the ILR's value for an employer not on the Employer
// Data Service, and is always allowed.
export function isEmployerIdentifier(value) {
  const text = String(value ?? '').trim()
  if (!/^[0-9]{9}$/.test(text)) return false
  if (text === '999999999') return true
  const sum = [...text].slice(0, 8).reduce((total, d, i) => total + Number(d) * (9 - i), 0)
  const check = 11 - (sum % 11)
  if (check === 10) return false
  return (check === 11 ? 0 : check) === Number(text[8])
}

// The message a form shows for an employer reference that fails
// isEmployerIdentifier, for when employer details are captured in the app.
export function employerIdentifierError(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  if (!/^[0-9]{9}$/.test(String(value).trim())) return 'The employer reference must be exactly 9 digits.'
  if (!isEmployerIdentifier(value)) {
    return "This isn't a valid employer reference: the last digit doesn't match the check digit. Check each digit is typed correctly."
  }
  return null
}

// A Companies House company number: 8 digits (shorter ones are padded with
// zeros), or two letters and 6 digits (e.g. SC123456). Null if it isn't one.
export function companyNumberOf(text) {
  const t = String(text ?? '').replace(/\s+/g, '').toUpperCase()
  if (/^\d{1,8}$/.test(t)) return t.padStart(8, '0')
  if (/^[A-Z]{2}\d{6}$/.test(t)) return t
  return null
}

// An employer, added or changed by a manager: either a company on Companies
// House (companyNumber; its name comes from Companies House), or a name and
// why it isn't on Companies House (sole trader, public body...). The employer
// reference (the ILR's EmpId) is optional.
export function validateEmployerForm(input) {
  const errors = {}
  const v = input ?? {}
  const text = (x) => String(x ?? '').trim()
  if (text(v.companyNumber)) {
    if (!companyNumberOf(v.companyNumber)) errors.companyNumber = 'Enter a company number: 8 digits, or 2 letters and 6 digits.'
  } else {
    if (!text(v.name)) errors.name = "Enter the employer's name."
    else if (text(v.name).length > 200) errors.name = 'Name must be 200 characters or fewer.'
    if (!text(v.notOnCompaniesHouse)) errors.notOnCompaniesHouse = "Say why this employer isn't on Companies House, for example sole trader or public body."
    else if (text(v.notOnCompaniesHouse).length > 200) errors.notOnCompaniesHouse = 'This must be 200 characters or fewer.'
  }
  const ref = employerIdentifierError(v.employerRef)
  if (ref) errors.employerRef = ref
  return errors
}

function isPostcode(value) {
  return UK_POSTCODE.test(String(value ?? '').trim())
}

// A postcode as the ILR wants it: capitals, one space before the last 3
// characters ("zz11aa" -> "ZZ1 1AA").
export function normalisePostcode(value) {
  const text = String(value ?? '').toUpperCase().replace(/\s+/g, '')
  if (text.length < 5) return text
  return `${text.slice(0, -3)} ${text.slice(-3)}`
}

// An employer's site (a workplace), added or changed by a manager. Whether
// the postcode is a real one is checked on the server (REF.POSTCODE).
export function validateSiteForm(input) {
  const errors = {}
  const v = input ?? {}
  const text = (x) => String(x ?? '').trim()
  if (!text(v.name)) errors.name = 'Enter the site\'s name, for example "Tesco Express Crosspool".'
  else if (text(v.name).length > 200) errors.name = 'Name must be 200 characters or fewer.'
  for (const [field, label] of [['addressLine1', 'Address line 1'], ['addressLine2', 'Address line 2'], ['town', 'Town']]) {
    if (text(v[field]).length > 100) errors[field] = `${label} must be 100 characters or fewer.`
  }
  if (!text(v.postcode)) errors.postcode = 'Enter the site\'s postcode.'
  else if (!isPostcode(v.postcode)) errors.postcode = 'Enter a real postcode, for example S10 5AA.'
  return errors
}

// A person at an employer, added or changed by a manager.
export function validateContactForm(input) {
  const errors = {}
  const v = input ?? {}
  const text = (x) => String(x ?? '').trim()
  if (!text(v.name)) errors.name = 'Enter their name.'
  else if (text(v.name).length > 200) errors.name = 'Name must be 200 characters or fewer.'
  if (text(v.jobTitle).length > 200) errors.jobTitle = 'Job title must be 200 characters or fewer.'
  if (text(v.email) && !EMAIL.test(text(v.email))) errors.email = 'Enter a valid email address.'
  else if (text(v.email).length > 320) errors.email = 'Email must be 320 characters or fewer.'
  if (text(v.phone) && !PHONE.test(text(v.phone))) errors.phone = 'Enter a valid phone number.'
  return errors
}

// An apprentice's workplace: their site and line manager on their current
// link to an employer. Moving from one site to another starts a new link
// from the date of the move, so that date is needed; setting a site for the
// first time or changing only the line manager doesn't. A move dated the day
// the current link began corrects that day's move. context: { moving,
// linkFrom (the current link's start, YYYY-MM-DD), today }.
export function validateWorkplace(input, { moving, linkFrom, today = todayString() }) {
  const errors = {}
  const v = input ?? {}
  if (moving) {
    if (!isValidDateString(v.moveDate)) errors.moveDate = 'Enter the date they moved, for example 2026-10-05.'
    else if (linkFrom && v.moveDate < linkFrom) errors.moveDate = `The move can't be before they started here (${linkFrom}).`
    else if (v.moveDate > today) errors.moveDate = 'The move can\'t be in the future. Record it once it has happened.'
  }
  if (v.updateDelivery && !v.siteId) errors.updateDelivery = 'Choose a site to use its postcode.'
  return errors
}

// An NI number as stored: capitals, no spaces except a final space suffix.
export function normaliseNiNumber(value) {
  const text = String(value ?? '').toUpperCase().replace(/\s+/g, '')
  return text.length === 8 ? `${text} ` : text
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
// validateLearnerForm and validateLearnerSection call this.
function validateLearnerFields(v, errors) {
  if (!/^[1-9]\d{9}$/.test(String(v.uln ?? '').trim())) {
    errors.uln = 'ULN must be exactly 10 digits, between 1000000000 and 9999999999.'
  } else if (!isUln(v.uln)) {
    errors.uln = "This isn't a valid ULN: the last digit doesn't match the check digit. Check each digit is typed correctly."
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
  } else if (!ILR_POSTCODE.test(normalisePostcode(v.postcodePrior))) {
    errors.postcodePrior = "The ILR doesn't accept this postcode's last part (C, I, K, M, O and V aren't used there)."
  }
  if (!isPostcode(v.postcode)) {
    errors.postcode = 'Enter a valid UK postcode.'
  } else if (!ILR_POSTCODE.test(normalisePostcode(v.postcode))) {
    errors.postcode = "The ILR doesn't accept this postcode's last part (C, I, K, M, O and V aren't used there)."
  }
  if (v.familyName && /[0-9]/.test(v.familyName)) {
    errors.familyName = "The ILR doesn't allow digits in a family name."
  }
  if (v.givenNames && /[0-9]/.test(v.givenNames)) {
    errors.givenNames = "The ILR doesn't allow digits in given names."
  }

  if (v.dateOfBirth && !isValidDateString(v.dateOfBirth)) {
    errors.dateOfBirth = 'Enter a valid date.'
  }
  if (v.niNumber && !NI_NUMBER.test(normaliseNiNumber(v.niNumber))) {
    errors.niNumber =
      "This isn't an NI number the ILR accepts: 2 letters, 6 digits, then A, B, C or D (e.g. AB123456C). Some letters, like D, F, I, Q, U and V, are never used at the start."
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
// validateLearnerForm and validateLearnerSection call this. Whether the
// start date is actually allowed to change (only when the aim is still
// continuing, COMPSTATUS 1) is checked separately by the server against
// the database, never against anything the browser sends - see the
// PUT /api/learners/:learnRefNumber/details/programme route. Likewise, whether the standard
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
  if (v.epaOrgId && !/^(EPA\d{4}|\d{8})$/i.test(String(v.epaOrgId).trim())) {
    errors.epaOrgId = "Enter the assessment organisation's ID from the register (EPA and 4 digits, e.g. EPA0123) or its 8-digit UKPRN."
  }
  if (!isPostcode(v.dellocPostcode)) {
    errors.dellocPostcode = 'Enter a valid UK postcode.'
  } else if (!ILR_POSTCODE.test(normalisePostcode(v.dellocPostcode))) {
    errors.dellocPostcode = "The ILR doesn't accept this postcode's last part (C, I, K, M, O and V aren't used there)."
  }
}

// The Record tab's sections a manager can change, and the form fields in
// each (the same names the add and edit forms use).
export const LEARNER_SECTIONS = {
  personal: ['uln', 'familyName', 'givenNames', 'dateOfBirth', 'sex', 'niNumber', 'postcodePrior', 'postcode', 'phone', 'email'],
  contact: ['title', 'addressLine1', 'addressLine2', 'addressLine3', 'wardOrCounty', 'mobile', 'contactMethodsAllowed',
    'preferredContactMethod', 'nextOfKinName', 'nextOfKinRelationship', 'nextOfKinPhone', 'contractType'],
  support: ['ethnicity', 'lldd'],
  programme: ['startDate', 'plannedEndDate', 'stdCode', 'dellocPostcode', 'epaOrgId'],
}

// Validates one section of the learner: v is the whole form (the section's
// new values over the rest as they are), and only the section's own fields
// are checked, so an old problem elsewhere doesn't block a change here.
export function validateLearnerSection(section, input) {
  const fields = LEARNER_SECTIONS[section]
  if (!fields) return { section: 'Unknown section.' }
  const errors = {}
  const v = input ?? {}
  validateLearnerFields(v, errors)
  validateAimFields(v, errors)
  if (section === 'contact' && !String(v.addressLine1 ?? '').trim()) {
    errors.addressLine1 = 'Address line 1 is needed for the ILR (rule AddLine1_03).'
  }
  return Object.fromEntries(Object.entries(errors).filter(([field]) => fields.includes(field)))
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

// Validates an employer's answer on a witness statement. Declining needs a
// reason, so the learner and assessor know what's wrong. Whether the
// statement is theirs to answer needs the database, so the server checks that.
export function validateWitnessConfirmationForm(input) {
  const errors = {}
  const v = input ?? {}

  if (!WITNESS_OUTCOME_CODES.has(v.outcome)) {
    errors.outcome = 'Choose whether you confirm this statement.'
  }

  const comment = String(v.comment ?? '').trim()
  if (v.outcome === 'declined' && !comment) {
    errors.comment = 'Say what isn’t right, so the learner can fix it.'
  } else if (comment.length > 2000) {
    errors.comment = 'Keep this to 2000 characters or fewer.'
  }

  return errors
}

// ---------------------------------------------------------------- the learner's ILR records (Record tab)

// An LLDD category. earliestStart: the learner's earliest aim start, for
// LLDDCat_02.
export function validateLlddRecord(input, { earliestStart } = {}) {
  const errors = {}
  const code = Number(input?.llddCat)
  if (!LLDD_CAT_OPTIONS.some((o) => o.code === code) && !LLDD_CAT_VALID_TO[code]) {
    errors.llddCat = 'Choose a category from the list.'
  } else if (LLDD_CAT_VALID_TO[code] && earliestStart && earliestStart > LLDD_CAT_VALID_TO[code]) {
    errors.llddCat = `This category can't be used for learning that started after ${LLDD_CAT_VALID_TO[code]} (rule LLDDCat_02).`
  }
  return errors
}

// A learner funding and monitoring record, as "TYPE-CODE".
export function validateLearnerFamRecord(input) {
  const errors = {}
  if (!LEARNER_FAM_OPTIONS.some((o) => o.key === input?.fam)) errors.fam = 'Choose one from the list.'
  return errors
}

// A prior attainment record.
export function validatePriorRecord(input) {
  const errors = {}
  if (!PRIOR_LEVEL_OPTIONS.some((o) => o.code === Number(input?.priorLevel))) {
    errors.priorLevel = 'Choose a level from the list.'
  }
  if (!isValidDateString(input?.dateLevelApp)) {
    errors.dateLevelApp = 'Enter a valid date.'
  } else if (input.dateLevelApp > todayString()) {
    errors.dateLevelApp = "The date can't be in the future (rule PriorAttain_09)."
  }
  return errors
}

// Why a record is being removed: required.
export function validateRemoval(input) {
  const reason = String(input?.reason ?? '').trim()
  if (!reason) return { reason: 'Say why this record is being removed.' }
  if (reason.length > 500) return { reason: 'Keep the reason to 500 characters or fewer.' }
  return {}
}

// An employment status record. The form's fields: dateEmpStatApp, empStat,
// employer (an EMPLOYERID from the organisation's employers, or 'other'),
// empId (the employer's ERN, when 'other'), agreemId, and the monitoring
// codes eii, loe and sei (in paid employment) or lou, bsi and pei (not).
// teachingYearEnd: the last day of the current teaching year (rule
// DateEmpStatApp_01).
export function validateEmploymentRecord(input, { teachingYearEnd } = {}) {
  const errors = {}
  const v = input ?? {}
  const has = (options, value) => options.some((o) => o.code === Number(value))
  if (!isValidDateString(v.dateEmpStatApp)) {
    errors.dateEmpStatApp = 'Enter a valid date.'
  } else if (v.dateEmpStatApp < '1990-08-01') {
    errors.dateEmpStatApp = "The date can't be before 1 August 1990 (rule DateEmpStatApp_02)."
  } else if (teachingYearEnd && v.dateEmpStatApp > teachingYearEnd) {
    errors.dateEmpStatApp = "The date can't be after this teaching year (rule DateEmpStatApp_01)."
  }
  if (!has(EMP_STAT_OPTIONS, v.empStat)) {
    errors.empStat = 'Choose an employment status.'
    return errors
  }
  const employed = Number(v.empStat) === 10
  if (employed) {
    if (!v.employer) {
      errors.employer = 'Choose the employer (rule EmpId_10).'
    } else if (v.employer === 'other') {
      const message = employerIdentifierError(v.empId)
      if (!String(v.empId ?? '').trim()) errors.empId = "Enter the employer's ERN, or 999999999 if they're not on the Employer Data Service."
      else if (message) errors.empId = message
    }
    if (!has(EII_OPTIONS, v.eii)) errors.eii = 'Choose the hours a week (rule ESMType_02).'
    if (!has(LOE_OPTIONS, v.loe)) errors.loe = 'Choose how long they have been employed (rule ESMType_09).'
  } else {
    if (Number(v.empStat) === 11 && !has(LOU_OPTIONS, v.lou)) {
      errors.lou = 'Choose how long they have been unemployed (rule ESMType_08).'
    } else if (v.lou && !has(LOU_OPTIONS, v.lou)) {
      errors.lou = 'Choose from the list.'
    }
    if (v.bsi && !has(BSI_OPTIONS, v.bsi)) errors.bsi = 'Choose from the list.'
  }
  const agreemId = String(v.agreemId ?? '').trim()
  if (agreemId && !/^[A-Za-z0-9]{1,7}$/.test(agreemId)) {
    errors.agreemId = 'The agreement ID is up to 7 letters and digits, as shown in the Apprenticeship Service.'
  }
  return errors
}

// The last day of the teaching year (1 August to 31 July) a date is in.
export function teachingYearEnd(date = todayString()) {
  const year = Number(date.slice(0, 4))
  return date.slice(5) >= '08-01' ? `${year + 1}-07-31` : `${year}-07-31`
}

// The monitoring records an employment status form describes, by the
// ILR's rules: only the ones that fit the status (ESMType_05, 10, 12).
export function employmentMonitoring(input) {
  const v = input ?? {}
  const esm = []
  if (Number(v.empStat) === 10) {
    if (v.eii) esm.push({ ESMTYPE: 'EII', ESMCODE: Number(v.eii) })
    if (v.loe) esm.push({ ESMTYPE: 'LOE', ESMCODE: Number(v.loe) })
    if (v.sei === true) esm.push({ ESMTYPE: 'SEI', ESMCODE: 1 })
  } else if ([11, 12].includes(Number(v.empStat))) {
    if (v.lou) esm.push({ ESMTYPE: 'LOU', ESMCODE: Number(v.lou) })
    if (v.bsi) esm.push({ ESMTYPE: 'BSI', ESMCODE: Number(v.bsi) })
    if (v.pei === true) esm.push({ ESMTYPE: 'PEI', ESMCODE: 1 })
  }
  return esm
}

// Off-the-job hours on the programme: planned (HRS 1), removed for prior
// learning (HRS 4) and actual (HRS 3), each '' (none) or whole hours.
// startDate: the programme's start, for the ILR's floors (HRSAmount_02 and
// 03). existing: the current values { 1: 300, 4: null, 3: null }; changing
// or clearing one is a correction, so it needs a reason.
export const OTJ_FIELDS = { planned: 1, priorLearning: 4, actual: 3 }

export function validateOtjHours(input, { startDate, existing = {} } = {}) {
  const errors = {}
  const v = input ?? {}
  for (const field of Object.keys(OTJ_FIELDS)) {
    const text = String(v[field] ?? '').trim()
    if (text && (!/^\d{1,4}$/.test(text))) errors[field] = 'Enter whole hours, from 0 to 9999.'
  }
  const planned = String(v.planned ?? '').trim()
  if (!errors.planned) {
    if (!planned && startDate >= '2019-08-01') {
      errors.planned = 'Planned hours are needed for the ILR (rule HRSType_01).'
    } else if (planned && startDate >= '2025-08-01' && Number(planned) < 187) {
      errors.planned = 'For starts from 1 August 2025, planned hours must be at least 187 (rule HRSAmount_03).'
    } else if (planned && startDate >= '2022-08-01' && startDate <= '2025-07-31' && Number(planned) < 278) {
      errors.planned = 'For starts from 1 August 2022 to 31 July 2025, planned hours must be at least 278 (rule HRSAmount_02).'
    }
  }
  const changed = Object.entries(OTJ_FIELDS).some(([field, code]) => {
    const before = existing[code]
    const text = String(v[field] ?? '').trim()
    return before !== null && before !== undefined && String(before) !== text
  })
  if (changed && !String(v.reason ?? '').trim()) {
    errors.reason = 'Say what was wrong: changing or clearing hours already recorded is a correction.'
  }
  return errors
}

const addYears = (date, years) => `${Number(date.slice(0, 4)) + years}${date.slice(4)}`

// A funding and monitoring code on the programme aim. aim: { startDate,
// plannedEndDate, actualEndDate }. LSF needs its dates (LearnDelFAMDateFrom_01),
// a restart its original start date (OrigLearnStartDate_02, 01, 09).
export function validateAimFamRecord(input, aim = {}) {
  const errors = {}
  const v = input ?? {}
  const option = AIM_FAM_OPTIONS.find((o) => o.key === v.fam)
  if (!option) return { fam: 'Choose one from the list.' }
  if (option.type === 'LSF') {
    if (!isValidDateString(v.dateFrom)) errors.dateFrom = 'Enter the date learning support starts (rule LearnDelFAMDateFrom_01).'
    else if (aim.startDate && v.dateFrom < aim.startDate) errors.dateFrom = "It can't be before the programme starts (rule LearnDelFAMDateFrom_02)."
    if (!isValidDateString(v.dateTo)) errors.dateTo = 'Enter the date it ends (rule LearnDelFAMDateFrom_01).'
    else if (isValidDateString(v.dateFrom) && v.dateTo < v.dateFrom) errors.dateTo = "It can't end before it starts (rule LearnDelFAMDateTo_01)."
    else if (aim.actualEndDate && v.dateTo > aim.actualEndDate) errors.dateTo = "It can't end after the programme ended (rule LearnDelFAMDateTo_03)."
  }
  if (option.type === 'RES') {
    if (!isValidDateString(v.origStartDate)) {
      errors.origStartDate = 'Enter the date the learner first started this apprenticeship.'
    } else if (aim.startDate && v.origStartDate >= aim.startDate) {
      errors.origStartDate = 'It must be before this programme start date (rule OrigLearnStartDate_02).'
    } else if (aim.startDate && v.origStartDate < addYears(aim.startDate, -10)) {
      errors.origStartDate = "It can't be more than 10 years before this programme start (rule OrigLearnStartDate_01)."
    } else if (v.origStartDate < '2017-05-01') {
      errors.origStartDate = "For apprenticeships funded since May 2017, it can't be before 1 May 2017 (rule OrigLearnStartDate_09)."
    }
  }
  return errors
}

// A price or payment. aim: { startDate }. today: for payments
// (AFinDate_14).
export function validatePriceRecord(input, { startDate, today = todayString() } = {}) {
  const errors = {}
  const v = input ?? {}
  const option = PRICE_OPTIONS.find((o) => o.key === v.fin)
  if (!option) errors.fin = 'Choose one from the list.'
  if (!isValidDateString(v.date)) {
    errors.date = 'Enter a valid date.'
  } else if (startDate && v.date < addYears(startDate, -1)) {
    errors.date = "It can't be more than a year before the programme starts (rule AFinDate_09)."
  } else if (option?.type === 'TNP' && startDate && v.date < startDate) {
    errors.date = "A price can't apply from before the programme starts (rule R_119)."
  } else if (option?.type === 'PMR' && v.date > today) {
    errors.date = "A payment can't be dated in the future (rule AFinDate_14)."
  }
  const text = String(v.amount ?? '').trim()
  if (!/^\d{1,6}$/.test(text)) {
    errors.amount = 'Enter whole pounds, without a £ sign or pence.'
  } else if (option?.type === 'RIP' && (Number(text) < 5 || Number(text) > 18000)) {
    errors.amount = 'A price reduction for prior learning must be from £5 to £18,000 (rules AFinType_15 and 16).'
  }
  return errors
}

// A component aim (the standard's own aim, English or maths). programme:
// { startDate } of the programme aim.
export function validateComponentAim(input, { programmeStart } = {}) {
  const errors = {}
  const v = input ?? {}
  if (!/^[A-Z0-9]{8}$/i.test(String(v.learnAimRef ?? '').trim())) errors.learnAimRef = 'Choose the learning aim from LARS (8 characters).'
  if (!isValidDateString(v.startDate)) errors.startDate = 'Enter a valid start date.'
  else if (programmeStart && v.startDate < programmeStart) errors.startDate = "A component aim can't start before the programme."
  if (!isValidDateString(v.plannedEndDate)) errors.plannedEndDate = 'Enter a valid planned end date.'
  else if (isValidDateString(v.startDate) && v.plannedEndDate < v.startDate) errors.plannedEndDate = "It can't end before it starts (rule LearnPlanEndDate_02)."
  const plfa = String(v.priorLearnFundAdj ?? '').trim()
  if (plfa && !/^\d{1,2}$/.test(plfa)) errors.priorLearnFundAdj = 'A percentage from 0 to 99, or leave it empty if all the learning is delivered.'
  const ofa = String(v.otherFundAdj ?? '').trim()
  if (ofa && !/^\d{1,3}$/.test(ofa)) errors.otherFundAdj = 'A number from 0 to 999, only if DfE has told you to use one.'
  return errors
}

// ---------------------------------------------------------------- the programme's outcome (docs/ilr-outcomes.md)

export const EPA_GRADES = [
  { code: 'PA', label: 'Pass' },
  { code: 'ME', label: 'Merit' },
  { code: 'DS', label: 'Distinction' },
]

// What can be recorded next for a programme aim: { compStatus, outcome,
// actualEndDate }.
export function outcomeActions(programme) {
  if (!programme) return []
  const { compStatus, outcome, actualEndDate } = programme
  if (compStatus === 1 && !actualEndDate) return ['learning-complete', 'break', 'withdraw']
  if (compStatus === 1 && outcome === 8) return ['epa-result', 'withdraw']
  if (compStatus === 6) return ['return', 'withdraw']
  return []
}

// Returning from a break in learning (part 7 step 4g-2): new aims from the
// restart date for the programme and each component on the break. ctx:
// { breakAim: { startDate, endDate }, components: [{ seq, startDate,
// englishOrMaths }], newEmployer, teachingYearEnd, today }. input:
//   restartDate, plannedEndDate
//   trainingPrice, assessmentPrice   whole pounds: TNP 1 and 2 for the same
//                                    employer, residual TNP 3 and 4 for a new one
//   components: { [seq]: { plannedEndDate, proportion } }  proportion still to
//                                    be delivered, English and maths only
//   employer ('same' or a new employer) and, for a new employer, the
//   employment status fields (validateEmploymentRecord) from the restart date
export function validateReturn(input, ctx) {
  const v = input ?? {}
  const errors = {}
  const today = ctx?.today ?? todayString()
  const breakAim = ctx?.breakAim ?? {}
  if (!isValidDateString(v.restartDate)) errors.restartDate = 'Enter a valid date.'
  else if (breakAim.endDate && v.restartDate <= breakAim.endDate) {
    errors.restartDate = `It must be after the last day before the break (${breakAim.endDate}): programme aims can't overlap (rule R_124).`
  } else if (v.restartDate > today) errors.restartDate = "It can't be in the future."
  if (!isValidDateString(v.plannedEndDate)) errors.plannedEndDate = 'Enter a valid date.'
  else if (isValidDateString(v.restartDate) && v.plannedEndDate <= v.restartDate) errors.plannedEndDate = 'It must be after the restart date (rule LearnPlanEndDate_02).'
  const pounds = (field, label) => {
    const text = String(v[field] ?? '').trim()
    if (!/^\d{1,6}$/.test(text) || Number(text) < 1) errors[field] = `Enter the ${label} in whole pounds, without a £ sign or pence.`
  }
  pounds('trainingPrice', 'training price')
  pounds('assessmentPrice', 'assessment price')
  for (const c of ctx?.components ?? []) {
    const cv = v.components?.[c.seq] ?? {}
    const key = `component-${c.seq}`
    if (!isValidDateString(cv.plannedEndDate)) errors[key] = 'Enter its new planned end date.'
    else if (isValidDateString(v.restartDate) && cv.plannedEndDate <= v.restartDate) errors[key] = 'Its planned end date must be after the restart date.'
    const proportion = String(cv.proportion ?? '').trim()
    if (c.englishOrMaths && proportion && !/^\d{1,2}$/.test(proportion)) errors[key] = 'The proportion still to be delivered is a percentage from 0 to 99, or empty if all of it is.'
  }
  if (ctx?.newEmployer) {
    const employment = validateEmploymentRecord({ ...v, empStat: '10', dateEmpStatApp: v.restartDate }, { teachingYearEnd: ctx.teachingYearEnd })
    delete employment.dateEmpStatApp
    delete employment.empStat
    Object.assign(errors, employment)
  }
  return errors
}

// One outcome. ctx: { programme: { startDate, compStatus, outcome,
// actualEndDate }, components: [{ seq, startDate }] (the open ones),
// latestComponentEnd (for a correction), today }. input fields by action:
//   learning-complete  endDate, actualHours, components: { [seq]: { endDate, outcome } }
//   epa-result         result ('passed' | 'failed'), achDate, grade
//   withdraw           endDate (unless the programme already has one), reason, actualHours
//   break              endDate
//   correct            endDate, achDate, grade, reason (the withdrawal reason), why
export function validateOutcome(action, input, ctx) {
  const errors = {}
  const v = input ?? {}
  const p = ctx?.programme ?? {}
  const today = ctx?.today ?? todayString()
  if (action !== 'correct' && !outcomeActions(p).includes(action)) {
    return { action: "That can't be recorded for this programme now." }
  }
  const date = (field, { min, max = today, minWhy, maxWhy } = {}) => {
    if (!isValidDateString(v[field])) errors[field] = 'Enter a valid date.'
    else if (min && v[field] < min) errors[field] = minWhy
    else if (max && v[field] > max) errors[field] = maxWhy
  }
  const hours = (required, why) => {
    const text = String(v.actualHours ?? '').trim()
    if (!text && required) errors.actualHours = why
    else if (text && !/^\d{1,4}$/.test(text)) errors.actualHours = 'Enter whole hours, from 0 to 9999.'
  }
  const notBeforeStart = "It can't be before the programme started."
  const notFuture = "It can't be in the future (rule LearnActEndDate_04)."
  if (action === 'learning-complete') {
    date('endDate', { min: p.startDate, minWhy: notBeforeStart, maxWhy: notFuture })
    hours(true, 'Record the off-the-job hours delivered: they go on the ILR at the end of the practical period (funding rules, paragraph 90).')
    for (const c of ctx?.components ?? []) {
      const cv = v.components?.[c.seq] ?? {}
      const key = `component-${c.seq}`
      if (!isValidDateString(cv.endDate)) errors[key] = 'Enter the date of its last learning activity.'
      else if (cv.endDate < c.startDate) errors[key] = "It can't end before it started."
      else if (isValidDateString(v.endDate) && cv.endDate > v.endDate) errors[key] = "It can't end after the programme's training (rule R_89)."
      else if (![1, 3].includes(Number(cv.outcome))) errors[key] = 'Say whether it was achieved.'
    }
  }
  if (action === 'epa-result') {
    if (!['passed', 'failed'].includes(v.result)) errors.result = 'Choose the result.'
    date('achDate', { min: p.actualEndDate, minWhy: "It can't be before the end of training (rule AchDate_05).", maxWhy: "It can't be in the future (rule AchDate_07)." })
    if (v.result === 'passed' && !EPA_GRADES.some((g) => g.code === v.grade)) errors.grade = 'Choose the grade.'
  }
  if (action === 'withdraw') {
    if (!p.actualEndDate) date('endDate', { min: p.startDate, minWhy: notBeforeStart, maxWhy: notFuture })
    if (!WITHDRAW_REASON_CODES.has(Number(v.reason))) errors.reason = 'Choose the reason (rule WithdrawReason_03).'
    hours(p.startDate >= '2022-08-01', 'Record the off-the-job hours delivered (rule HRSType_09).')
  }
  if (action === 'break') {
    date('endDate', { min: p.startDate, minWhy: notBeforeStart, maxWhy: notFuture })
    const later = (ctx?.components ?? []).find((c) => isValidDateString(v.endDate) && c.startDate > v.endDate)
    if (!errors.endDate && later) errors.endDate = `A component aim started after this (${later.startDate}), and none can end after the programme (rule R_89).`
  }
  if (action === 'correct') {
    if (!p.actualEndDate) return { action: 'There is no outcome to correct yet.' }
    date('endDate', { min: p.startDate, minWhy: notBeforeStart, maxWhy: notFuture })
    const latest = ctx?.latestComponentEnd
    if (!errors.endDate && latest && v.endDate < latest) errors.endDate = `A component aim ends on ${latest}, and none can end after the programme (rule R_89).`
    if (p.compStatus === 2) {
      date('achDate', { min: isValidDateString(v.endDate) ? v.endDate : p.actualEndDate, minWhy: "It can't be before the end of training (rule AchDate_05).", maxWhy: "It can't be in the future (rule AchDate_07)." })
      if (p.outcome === 1 && !EPA_GRADES.some((g) => g.code === v.grade)) errors.grade = 'Choose the grade.'
    }
    if (p.compStatus === 3 && !WITHDRAW_REASON_CODES.has(Number(v.reason))) errors.reason = 'Choose the reason.'
    if (!String(v.why ?? '').trim()) errors.why = 'Say what was wrong.'
  }
  return errors
}
