// A test journey learner's ILR records, in the shape Warren's ILR export
// reads them from the database (server/ilr/data.js, after clean()), so the
// dry run can check them with Warren's own code: assembleLearner,
// checkIlrRules (84 official rules), buildIlrXml and the official schema.
// The real run writes these same rows.

import { otjMinimum } from '../../server/ilr/standards.js'
import { addDays, daysBetween } from './world.js'

// The ILR codes each outcome is recorded with (see the provider support
// manual, "Recording apprenticeship programmes", and ilr-return notes).
const PROGRAMME = {
  continuing: { COMPSTATUS: 1, OUTCOME: null },
  withdrawn: { COMPSTATUS: 3, OUTCOME: 3 },
  break: { COMPSTATUS: 6, OUTCOME: 3 },
  achieved: { COMPSTATUS: 2, OUTCOME: 1 },
  failed: { COMPSTATUS: 2, OUTCOME: 3 },
  awaiting_epa: { COMPSTATUS: 1, OUTCOME: 8 },
}

export function ilrRows(l, ref, today) {
  const p = l.person
  const ended = ['withdrawn', 'break', 'achieved', 'failed', 'awaiting_epa'].includes(l.status)
  const learner = {
    LEARNREFNUMBER: l.ref, ULN: l.uln, FAMILYNAME: p.family, GIVENNAMES: p.given, DATEOFBIRTH: p.dob, ETHNICITY: l.ethnicity, SEX: l.sex,
    LLDDHEALTHPROB: l.lldd.length ? 1 : 2, NINUMBER: l.ni, POSTCODEPRIOR: p.postcode, POSTCODE: p.postcode,
    ADDRESSLINE1: `${(Number(l.ref.slice(-3)) % 90) + 1} Test Road`, ADDRESSLINE2: 'Test town', ADDRESSLINE3: null, WARDORCOUNTY: null,
    TELNO: p.mobile, EMAIL: p.email, ISTESTDATA: true,
  }
  const base = { LEARNREFNUMBER: l.ref, FUNDMODEL: 36, PROGTYPE: 25, STDCODE: l.std, DELLOCPOSTCODE: l.site.postcode, ORIGLEARNSTARTDATE: null,
    PRIORLEARNFUNDADJ: null, OTHERFUNDADJ: null, OUTGRADE: null, IN_LARS: true }
  const out = PROGRAMME[l.status]
  const programme = {
    ...base, LEARNAIMREF: 'ZPROG001', AIMTITLE: ref.aimTitles.get('ZPROG001'), AIMTYPE: 1, AIMSEQNUMBER: 1,
    LEARNSTARTDATE: l.start, LEARNPLANENDDATE: l.planEnd, EPAORGID: l.epa, ...out,
    LEARNACTENDDATE: ended ? l.endDate : null, WITHDRAWREASON: l.status === 'withdrawn' ? l.withdrawReason : null,
    ACHDATE: ['achieved', 'failed'].includes(l.status) ? l.achDate : null, SWSUPAIMID: `${l.ref}-programme`,
  }
  // The component aim finishes with the programme's training: completed when
  // training is (even if the EPA is failed or still to come), withdrawn or on
  // a break with the programme.
  const componentOut = !ended ? { COMPSTATUS: 1, OUTCOME: null }
    : l.status === 'withdrawn' ? { COMPSTATUS: 3, OUTCOME: 3 }
      : l.status === 'break' ? { COMPSTATUS: 6, OUTCOME: 3 }
        : { COMPSTATUS: 2, OUTCOME: 1 }
  const component = ref.components.get(l.std)
  const aims = [programme, {
    ...base, LEARNAIMREF: component.LEARN_AIM_REF, AIMTITLE: component.TITLE, AIMTYPE: 3, AIMSEQNUMBER: 2,
    LEARNSTARTDATE: l.start, LEARNPLANENDDATE: l.planEnd, EPAORGID: null, ...componentOut,
    LEARNACTENDDATE: ended ? l.endDate : null, WITHDRAWREASON: l.status === 'withdrawn' ? l.withdrawReason : null, ACHDATE: null,
    SWSUPAIMID: `${l.ref}-component`,
  }]
  // Functional Skills: achieved about seven months in, if learning lasted
  // that long; otherwise closed with the programme.
  l.fs.forEach((fs, i) => {
    const done = addDays(l.start, 210 + 30 * i)
    const finishedFirst = done <= today && (!ended || done <= l.endDate)
    const fsOut = finishedFirst ? { COMPSTATUS: 2, OUTCOME: 1, LEARNACTENDDATE: done }
      : ended ? { ...componentOut, LEARNACTENDDATE: l.endDate } : { COMPSTATUS: 1, OUTCOME: null, LEARNACTENDDATE: null }
    aims.push({
      ...base, LEARNAIMREF: fs.ref, AIMTITLE: ref.aimTitles.get(fs.ref), AIMTYPE: 3, AIMSEQNUMBER: 3 + i,
      LEARNSTARTDATE: l.start, LEARNPLANENDDATE: [addDays(l.start, 300), l.planEnd].sort()[0], EPAORGID: null, ...fsOut,
      WITHDRAWREASON: fsOut.COMPSTATUS === 3 ? l.withdrawReason : null, ACHDATE: null, SWSUPAIMID: `${l.ref}-fs-${i + 1}`,
    })
  })
  // Prices: the funding band's maximum, 80% training and 20% assessment.
  const training = Math.round((l.price * 0.8) / 100) * 100
  const fin = [
    { LEARNREFNUMBER: l.ref, AIMSEQNUMBER: 1, AFINTYPE: 'TNP', AFINCODE: 1, AFINDATE: l.start, AFINAMOUNT: training },
    { LEARNREFNUMBER: l.ref, AIMSEQNUMBER: 1, AFINTYPE: 'TNP', AFINCODE: 2, AFINDATE: l.start, AFINAMOUNT: l.price - training },
  ]
  // Off-the-job hours: planned at the published minimum (starts from August
  // 2025) or six hours a week (earlier starts, at least 278); actual hours
  // when training ends, in proportion to the time in learning.
  const minimum = otjMinimum(ref.standardVersions, programme)
  const weeks = daysBetween(l.start, l.planEnd) / 7
  const planned = minimum?.policy === 'old' || !minimum?.minimum ? Math.max(278, Math.round(weeks * 6)) : minimum.minimum + (Number(l.ref.slice(-2)) % 4) * 10
  const hours = [{ LEARNREFNUMBER: l.ref, AIMSEQNUMBER: 1, HRSTYPE: 'HRS', HRSCODE: 1, HRSAMOUNT: planned }]
  if (ended) {
    const share = Math.min(1, daysBetween(l.start, l.endDate) / daysBetween(l.start, l.planEnd))
    hours.push({ LEARNREFNUMBER: l.ref, AIMSEQNUMBER: 1, HRSTYPE: 'HRS', HRSCODE: 3, HRSAMOUNT: Math.max(1, Math.round(planned * (['achieved', 'failed', 'awaiting_epa'].includes(l.status) ? 1.03 : share))) })
  }
  const empDate = addDays(l.start, -1)
  return {
    learner,
    rows: {
      aims,
      prior: [{ LEARNREFNUMBER: l.ref, PRIORLEVEL: l.priorLevel, DATELEVELAPP: l.start }],
      lldd: l.lldd.map((cat, i) => ({ LEARNREFNUMBER: l.ref, LLDDCAT: cat, PRIMARYLLDD: i === 0 })),
      learnerFams: [],
      employment: [{ LEARNREFNUMBER: l.ref, DATEEMPSTATAPP: empDate, EMPSTAT: 10, EMPID: l.employer.ern, AGREEMID: null }],
      esm: [
        { LEARNREFNUMBER: l.ref, DATEEMPSTATAPP: empDate, ESMTYPE: 'EII', ESMCODE: 8 },
        { LEARNREFNUMBER: l.ref, DATEEMPSTATAPP: empDate, ESMTYPE: 'LOE', ESMCODE: 1 },
      ],
      aimFams: [],
      hours,
      fin,
    },
  }
}
