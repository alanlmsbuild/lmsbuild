// Builds the ILR XML. Elements are written in the order the schema's
// sequences require (ILR-2026-27-schemafile-January.xsd), and optional
// elements are left out when empty.

import { ILR_YEARS } from './data.js'

const NAMESPACE = { 2026: 'ILR/2026-27' }

function escape(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

// One element per [name, value] pair, skipping empty values. Nested
// elements are passed as prebuilt strings with raw = true.
function elements(indent, pairs) {
  const pad = '\t'.repeat(indent)
  return pairs
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([name, value, raw]) => (raw ? value : `${pad}<${name}>${escape(value)}</${name}>`))
    .join('\n')
}
const block = (indent, name, pairs) => {
  const pad = '\t'.repeat(indent)
  return `${pad}<${name}>\n${elements(indent + 1, pairs)}\n${pad}</${name}>`
}

// TelNo must be digits only in the schema. Spaces are dropped; anything
// else that isn't a digit means the number is left out (and reported).
export function ilrTelNo(value) {
  if (!value) return null
  const digits = String(value).replace(/\s+/g, '')
  return /^[0-9]{1,18}$/.test(digits) ? digits : null
}

function learningDelivery(aim) {
  return block(2, 'LearningDelivery', [
    ['LearnAimRef', aim.LEARNAIMREF],
    ['AimType', aim.AIMTYPE],
    ['AimSeqNumber', aim.FILESEQ],
    ['LearnStartDate', aim.LEARNSTARTDATE],
    ['OrigLearnStartDate', aim.ORIGLEARNSTARTDATE],
    ['LearnPlanEndDate', aim.LEARNPLANENDDATE],
    ['FundModel', aim.FUNDMODEL],
    ['ProgType', aim.PROGTYPE],
    ['StdCode', aim.STDCODE],
    ['DelLocPostCode', aim.DELLOCPOSTCODE],
    ['PriorLearnFundAdj', aim.PRIORLEARNFUNDADJ],
    ['OtherFundAdj', aim.OTHERFUNDADJ],
    ['EPAOrgID', aim.AIMTYPE === 1 ? aim.EPAORGID : null],
    ['CompStatus', aim.COMPSTATUS],
    ['LearnActEndDate', aim.LEARNACTENDDATE],
    ['WithdrawReason', aim.WITHDRAWREASON],
    ['Outcome', aim.OUTCOME],
    ['AchDate', aim.ACHDATE],
    ['OutGrade', aim.OUTGRADE],
    ['SWSupAimId', aim.SWSUPAIMID],
    ...aim.fams.map((f) => [null, block(3, 'LearningDeliveryFAM', [
      ['LearnDelFAMType', f.LEARNDELFAMTYPE],
      ['LearnDelFAMCode', f.LEARNDELFAMCODE],
      ['LearnDelFAMDateFrom', f.DATEFROM],
      ['LearnDelFAMDateTo', f.DATETO],
    ]), true]),
    ...aim.hours.map((h) => [null, block(3, 'HRSRecord', [
      ['HRSType', h.HRSTYPE],
      ['HRSCode', h.HRSCODE],
      ['HRSAmount', h.HRSAMOUNT],
    ]), true]),
    ...aim.fin.map((f) => [null, block(3, 'AppFinRecord', [
      ['AFinType', f.AFINTYPE],
      ['AFinCode', f.AFINCODE],
      ['AFinDate', f.AFINDATE],
      ['AFinAmount', f.AFINAMOUNT],
    ]), true]),
  ])
}

function learner(l) {
  return block(1, 'Learner', [
    ['LearnRefNumber', l.LEARNREFNUMBER],
    ['ULN', l.ULN],
    ['FamilyName', l.FAMILYNAME],
    ['GivenNames', l.GIVENNAMES],
    ['DateOfBirth', l.DATEOFBIRTH],
    ['Ethnicity', l.ETHNICITY],
    ['Sex', l.SEX],
    ['LLDDHealthProb', l.LLDDHEALTHPROB],
    ['NINumber', l.NINUMBER],
    ['PostcodePrior', l.POSTCODEPRIOR],
    ['Postcode', l.POSTCODE],
    ['AddLine1', l.ADDRESSLINE1],
    ['AddLine2', l.ADDRESSLINE2],
    ['AddLine3', l.ADDRESSLINE3],
    ['AddLine4', l.WARDORCOUNTY],
    ['TelNo', ilrTelNo(l.TELNO)],
    ['Email', l.EMAIL],
    ...l.prior.map((p) => [null, block(2, 'PriorAttain', [['PriorLevel', p.PRIORLEVEL], ['DateLevelApp', p.DATELEVELAPP]]), true]),
    ...l.lldd.map((d) => [null, block(2, 'LLDDandHealthProblem', [['LLDDCat', d.LLDDCAT], ['PrimaryLLDD', d.PRIMARYLLDD ? 1 : null]]), true]),
    ...l.learnerFams.map((f) => [null, block(2, 'LearnerFAM', [['LearnFAMType', f.LEARNFAMTYPE], ['LearnFAMCode', f.LEARNFAMCODE]]), true]),
    ...l.employment.map((e) => [null, block(2, 'LearnerEmploymentStatus', [
      ['EmpStat', e.EMPSTAT],
      ['DateEmpStatApp', e.DATEEMPSTATAPP],
      ['EmpId', e.EMPID],
      ['AgreemId', e.AGREEMID],
      ...e.esm.map((m) => [null, block(3, 'EmploymentStatusMonitoring', [['ESMType', m.ESMTYPE], ['ESMCode', m.ESMCODE]]), true]),
    ]), true]),
    ...l.aims.map((a) => [null, learningDelivery(a), true]),
  ])
}

// The time the file is made, in UK time, for the header and the file name.
export function ukNow(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map((p) => [p.type, p.value]))
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    dateTime: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`,
    compact: `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`,
  }
}

// ILR-LLLLLLLL-YYYY-yyyymmdd-hhmmss-NN.XML (rule Filename_1).
export function ilrFileName(ukprn, year, now, serial) {
  return `ILR-${ukprn}-${ILR_YEARS[year].code}-${now.compact}-${String(serial).padStart(2, '0')}.XML`
}

export function buildIlrXml({ organisation, learners }, year, now, serial) {
  const isTest = organisation.ISTESTDATA
  const header = block(1, 'Header', [
    [null, block(2, 'CollectionDetails', [
      ['Collection', 'ILR'],
      ['Year', ILR_YEARS[year].code],
      ['FilePreparationDate', now.date],
    ]), true],
    [null, block(2, 'Source', [
      ['ProtectiveMarking', 'OFFICIAL-SENSITIVE-Personal'],
      ['UKPRN', organisation.UKPRN],
      ['SoftwareSupplier', 'Rarebit'],
      // Test files say so in the header, where anyone opening them will see it.
      ['SoftwarePackage', isTest ? 'Warren TESTDATA' : 'Warren'],
      ['Release', '1'],
      ['SerialNo', String(serial).padStart(2, '0')],
      ['DateTime', now.dateTime],
    ]), true],
  ])
  const provider = block(1, 'LearningProvider', [['UKPRN', organisation.UKPRN]])
  const warning = isTest
    ? '<!-- TESTDATA: made from Warren test data with a dummy UKPRN. Never submit this file. -->\n'
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
${warning}<Message xmlns="${NAMESPACE[year]}">
${header}
${provider}
${learners.map(learner).join('\n')}
</Message>
`
}
