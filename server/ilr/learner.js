// One learner's ILR records and checks, for the learner page's Record tab:
// GET /api/learners/:learnRefNumber/ilr, for staff who can see the learner.
//
// The records are read through the one learner scope (IN_VISIBLE_LEARNERS),
// so NI number and ethnicity are masked, and prices and payments are empty,
// for anyone but a manager. The checks are the ILR return's own (rules.js),
// run on this learner put together exactly as the return does it
// (assembleLearner in data.js), so the Record tab and Reports → ILR return
// always agree. Rules about details a non-manager can't see (NI number,
// prices and payments) aren't checked for them: those details read as empty
// for them, so the result would mean nothing.

import { execute } from '../db.js'
import {
  allow,
  IN_VISIBLE_LEARNERS,
  MANAGER,
  ORG_APP_FIN_RECORD,
  ORG_EMPLOYER,
  ORG_LEARNER,
  ORG_ORGANISATION,
  STAFF,
  VISIBLE_LEARNER,
} from '../access.js'
import { ILR_YEARS, STANDARDS_QUERY, aimInYear, aimWithRecords, assembleLearner, clean } from './data.js'
import { MANAGER_ONLY_RULES, RULE_SECTION, checkIlrRules } from './rules.js'
import { ukNow } from './xml.js'

const YEAR = 2026

const LEARNER_QUERY = `
  select LEARNREFNUMBER, ULN, FAMILYNAME, GIVENNAMES, DATEOFBIRTH, ETHNICITY, SEX, LLDDHEALTHPROB, NINUMBER,
    POSTCODEPRIOR, POSTCODE, ADDRESSLINE1, ADDRESSLINE2, ADDRESSLINE3, WARDORCOUNTY, TELNO, EMAIL, ISTESTDATA
  from ${VISIBLE_LEARNER}
  where LEARNREFNUMBER = ?
`

// Every aim, not just this year's, with its LARS title.
const AIMS_QUERY = `
  select ld.LEARNREFNUMBER, ld.LEARNAIMREF, ld.AIMTYPE, ld.AIMSEQNUMBER, ld.LEARNSTARTDATE, ld.ORIGLEARNSTARTDATE,
    ld.LEARNPLANENDDATE, ld.FUNDMODEL, ld.PROGTYPE, ld.STDCODE, ld.DELLOCPOSTCODE, ld.PRIORLEARNFUNDADJ,
    ld.OTHERFUNDADJ, ld.EPAORGID, ld.COMPSTATUS, ld.LEARNACTENDDATE, ld.WITHDRAWREASON, ld.OUTCOME, ld.ACHDATE,
    ld.OUTGRADE, ld.SWSUPAIMID, la.TITLE as AIMTITLE, la.LEARN_AIM_REF is not null as IN_LARS
  from LEARNING_DELIVERY ld
  left join LARS.LEARNING_AIM la
    on la.LEARN_AIM_REF = ld.LEARNAIMREF
  where ld.LEARNREFNUMBER = ? and ld.${IN_VISIBLE_LEARNERS}
  order by ld.AIMSEQNUMBER
`

// Leaves out records a manager removed as entered in error.
const forLearner = (source, columns, order) => `
  select ${columns} from ${source}
  where LEARNREFNUMBER = ? and ${IN_VISIBLE_LEARNERS}
    and REMOVEDAT is null
  order by ${order}
`
const PRIOR_QUERY = forLearner('ILR.PRIOR_ATTAINMENT', 'LEARNREFNUMBER, PRIORLEVEL, DATELEVELAPP', 'DATELEVELAPP')
const LLDD_QUERY = forLearner('ILR.LLDD_HEALTH_PROBLEM', 'LEARNREFNUMBER, LLDDCAT, PRIMARYLLDD', 'PRIMARYLLDD desc, LLDDCAT')
const LEARNER_FAM_QUERY = forLearner('ILR.LEARNER_FAM', 'LEARNREFNUMBER, LEARNFAMTYPE, LEARNFAMCODE', 'LEARNFAMTYPE, LEARNFAMCODE')
const ESM_QUERY = forLearner('ILR.EMPLOYMENT_STATUS_MONITORING', 'LEARNREFNUMBER, DATEEMPSTATAPP, ESMTYPE, ESMCODE', 'DATEEMPSTATAPP, ESMTYPE')
const AIM_FAM_QUERY = forLearner('ILR.LEARNING_DELIVERY_FAM',
  'LEARNREFNUMBER, AIMSEQNUMBER, LEARNDELFAMTYPE, LEARNDELFAMCODE, DATEFROM, DATETO', 'AIMSEQNUMBER, LEARNDELFAMTYPE, DATEFROM')
const HOURS_QUERY = forLearner('ILR.HOURS_RECORD', 'LEARNREFNUMBER, AIMSEQNUMBER, HRSTYPE, HRSCODE, HRSAMOUNT', 'AIMSEQNUMBER, HRSCODE')
// Empty for anyone but a manager (ORG_APP_FIN_RECORD).
const FIN_QUERY = forLearner(ORG_APP_FIN_RECORD,
  'LEARNREFNUMBER, AIMSEQNUMBER, AFINTYPE, AFINCODE, AFINDATE, AFINAMOUNT', 'AIMSEQNUMBER, AFINTYPE, AFINCODE, AFINDATE')

// With the employer's name when the record is linked to one in Warren.
const EMPLOYMENT_QUERY = `
  select es.LEARNREFNUMBER, es.DATEEMPSTATAPP, es.EMPSTAT, es.EMPID, es.AGREEMID, es.EMPLOYERID, em.NAME as EMPLOYERNAME
  from ILR.EMPLOYMENT_STATUS es
  left join ${ORG_EMPLOYER} em
    on em.EMPLOYERID = es.EMPLOYERID
  where es.LEARNREFNUMBER = ? and es.${IN_VISIBLE_LEARNERS}
    and es.REMOVEDAT is null
  order by es.DATEEMPSTATAPP
`

// Rule R_59: the same ULN on two learners in the return.
const ULN_COUNT_QUERY = `
  select count(*) as N from ${ORG_LEARNER} where ULN = ? -- whole organisation: the ILR return covers everyone
`

const ORGANISATION_QUERY = `select ISTESTDATA from ${ORG_ORGANISATION}`

// The learner's own row and every record, read as this user may see them.
// Null if they can't see the learner.
export async function loadLearnerRecords(connection, learnRefNumber) {
  const [learnerRow] = clean(await execute(connection, LEARNER_QUERY, [learnRefNumber]))
  if (!learnerRow) return null
  const bind = [learnRefNumber]
  const [aims, prior, lldd, learnerFams, employment, esm, aimFams, hours, fin, standards, [{ N: ulnCount }], [organisation]] =
    await Promise.all([
      execute(connection, AIMS_QUERY, bind).then(clean),
      execute(connection, PRIOR_QUERY, bind).then(clean),
      execute(connection, LLDD_QUERY, bind),
      execute(connection, LEARNER_FAM_QUERY, bind),
      execute(connection, EMPLOYMENT_QUERY, bind).then(clean),
      execute(connection, ESM_QUERY, bind).then(clean),
      execute(connection, AIM_FAM_QUERY, bind).then(clean),
      execute(connection, HOURS_QUERY, bind),
      execute(connection, FIN_QUERY, bind).then(clean),
      execute(connection, STANDARDS_QUERY).then(clean),
      execute(connection, ULN_COUNT_QUERY, [learnerRow.ULN]),
      execute(connection, ORGANISATION_QUERY),
    ])
  return {
    learnerRow,
    rows: { aims, prior, lldd, learnerFams, employment, esm, aimFams, hours, fin },
    standards: new Map(standards.map((s) => [s.STANDARD_CODE, s])),
    ulnCount: Number(ulnCount),
    organisationIsTest: organisation?.ISTESTDATA === true,
  }
}

export async function learnerIlr(connection, user, learnRefNumber) {
  const records = await loadLearnerRecords(connection, learnRefNumber)
  if (!records) return null
  const { learnerRow, rows, standards, ulnCount, organisationIsTest } = records
  const isManager = user.roles.includes(MANAGER)

  // In this year's return? The same test as the return: an aim in the year,
  // and test data only in a test organisation (and real only in a real one).
  const year = ILR_YEARS[YEAR]
  let notInReturn = null
  let rules = []
  if (learnerRow.ISTESTDATA !== organisationIsTest) {
    notInReturn = learnerRow.ISTESTDATA
      ? 'This is a test learner in a real organisation, so they are never put in an ILR file.'
      : 'This is a real learner in a test organisation, so they are never put in an ILR file.'
  } else {
    const assembled = assembleLearner(learnerRow, rows, YEAR)
    if (!assembled) {
      notInReturn = `None of their aims is in the ${year.label} return: they all ended before ${year.start.split('-').reverse().join('/')}.`
    } else {
      const found = checkIlrRules({ learners: [assembled], standards }, YEAR, ukNow().date, {
        ulnCounts: new Map([[String(learnerRow.ULN), ulnCount]]),
      })
      rules = found.filter((r) => isManager || !MANAGER_ONLY_RULES.has(r.rule)).map(({ rule, severity, description }) => ({ rule, severity, description, section: RULE_SECTION[rule] }))
    }
  }

  return {
    year: YEAR,
    yearLabel: year.label,
    notInReturn,
    rules,
    // Non-managers don't see NI number, prices and payments, or their checks.
    canSeePrices: isManager,
    prior: rows.prior,
    lldd: rows.lldd,
    learnerFams: rows.learnerFams,
    employment: rows.employment.map((e) => ({ ...e, esm: rows.esm.filter((m) => m.DATEEMPSTATAPP === e.DATEEMPSTATAPP) })),
    aims: rows.aims.map((a) => ({ ...aimWithRecords(a, rows), IN_YEAR: aimInYear(a, YEAR) })),
  }
}

export function registerLearnerIlrRoutes(app) {
  app.get('/api/learners/:learnRefNumber/ilr', allow(STAFF), async (req, res) => {
    try {
      const result = await learnerIlr(req.db, req.user, req.params.learnRefNumber)
      if (!result) {
        res.status(404).json({ error: 'Learner not found.' })
        return
      }
      res.json(result)
    } catch (err) {
      console.error('Failed to load a learner\'s ILR records:', err.message)
      res.status(500).json({ error: 'Could not load this learner\'s ILR records. Please try again.' })
    }
  })
}
