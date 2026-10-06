// Test: one learner's checks (Record tab) agree with the ILR return.
// Reads only, as Max (manager, ORG-T001) and Nia (manager, ORG-T002), with
// the same session variables attachUser would set.
import { connect, execute, destroy } from '../../server/db.js'
import { loadIlrData, assembleLearner } from '../../server/ilr/data.js'
import { loadLearnerRecords } from '../../server/ilr/learner.js'
import { checkIlrRules } from '../../server/ilr/rules.js'
import { isDeepStrictEqual } from 'node:util'

const SET = `set (CURRENT_ORGANISATIONID, CURRENT_ISTESTDATA, SEES_ALL_LEARNERS, SEES_ALL_OFFICERS, SEES_MANAGER_ONLY,
  CURRENT_OFFICERREFNUMBER, CASELOAD_OFFICERREFNUMBER, APPRENTICES_OF_EMPLOYERID, OWN_LEARNREFNUMBER, CURRENT_USERID) = (?, true, true, true, true, ?, ?, '', '', '')`
let failures = 0
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date()) // as the ILR checks use it
for (const [org, officer] of [['ORG-T001', 'OFF0008'], ['ORG-T002', 'OFF0011']]) {
  const c = await connect()
  try {
    await execute(c, SET, [org, officer, officer])
    const data = await loadIlrData(c, 2026)
    let same = 0
    const perLearner = new Map()
    for (const whole of data.learners) {
      const rec = await loadLearnerRecords(c, whole.LEARNREFNUMBER)
      const one = assembleLearner(rec.learnerRow, rec.rows, 2026)
      // The Record tab shows each employment status's employer by name; the
      // return doesn't carry Warren's employer ID or name, and no rule reads
      // them. It also lists the primary LLDD category first, where the return
      // sorts by category: the ILR doesn't care about the order.
      const byCat = (lldd) => [...lldd].sort((a, b) => a.LLDDCAT - b.LLDDCAT)
      const comparable = { ...one, lldd: byCat(one.lldd), employment: one.employment.map(({ EMPLOYERID, EMPLOYERNAME, ...e }) => e) }
      if (isDeepStrictEqual(comparable, { ...whole, lldd: byCat(whole.lldd) })) same++
      else { failures++; console.log('DIFFERENT', whole.LEARNREFNUMBER) }
      perLearner.set(whole.LEARNREFNUMBER, { rec, one })
    }
    console.log(`${org}: ${same} of ${data.learners.length} learners put together identically`)

    // Damage copies in memory (nothing is written) and compare the failures.
    const damage = (l, i) => {
      const x = structuredClone(l)
      switch (i % 8) {
        case 0: x.prior = []; break // R_131
        case 1: x.NINUMBER = 'QQ123456C'; break // NINumber_01
        case 2: x.employment = []; break // EmpStat_09
        case 3: x.aims[0].hours = []; break // HRSType_01
        case 4: x.aims[0].fin = []; break // AFinType_12 and friends
        case 5: x.lldd = [{ LLDDCAT: 4, PRIMARYLLDD: false }]; x.LLDDHEALTHPROB = 1; break // PrimaryLLDD_01
        case 6: x.aims.forEach((a) => { if (a.AIMTYPE === 1) { a.COMPSTATUS = 2; a.LEARNACTENDDATE = '2026-09-01'; a.OUTCOME = 3; a.ACHDATE = null } }); break
        case 7: x.ADDRESSLINE1 = null; x.POSTCODE = 'ZZ1 1ZC'; break
      }
      return x
    }
    const damaged = data.learners.map(damage)
    const wholeRules = checkIlrRules({ learners: damaged, standards: data.standards }, 2026, today)
    const expected = new Map()
    for (const r of wholeRules) for (const ref of r.learners) expected.set(ref, [...(expected.get(ref) ?? []), r.rule].sort())
    const ulnCounts = new Map()
    for (const l of damaged) ulnCounts.set(String(l.ULN), (ulnCounts.get(String(l.ULN)) ?? 0) + 1)
    let agree = 0
    for (const l of damaged) {
      const got = checkIlrRules({ learners: [l], standards: perLearner.get(l.LEARNREFNUMBER).rec.standards }, 2026, today, { ulnCounts })
        .map((r) => r.rule).sort()
      if (isDeepStrictEqual(got, expected.get(l.LEARNREFNUMBER) ?? [])) agree++
      else { failures++; console.log('RULES DIFFER', l.LEARNREFNUMBER, got, expected.get(l.LEARNREFNUMBER)) }
    }
    console.log(`${org}: damaged copies, ${wholeRules.length} different rules failing, per-learner checks agree for ${agree} of ${damaged.length}`)
    console.log('   rules found:', wholeRules.map((r) => `${r.rule} (${r.learners.length})`).join(', '))
  } finally { await destroy(c) }
}
console.log(failures ? `${failures} FAILED` : 'all agree')
