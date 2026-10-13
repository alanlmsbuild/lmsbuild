// The 10-person slice of the test journeys through Warren's and Burrow's own
// HTTP routes on the test server (3002, TEST_SIGN_IN=true): the same calls
// the screens make, so the app's own checks run on every record. What has
// no route yet (the apprentice's link to their employer and site) is written
// as the app's role, as that route will.

import { execute } from '../../server/db.js'
import { ilrRows } from './ilr.js'

async function signIn(api, userId) {
  const res = await fetch(`${api}/api/dev/user`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId }) })
  if (!res.ok) throw new Error(`Signing in as ${userId}: ${res.status} ${await res.text()}`)
  const cookie = res.headers.get('set-cookie').split(';')[0]
  return async (method, path, body) => {
    const r = await fetch(`${api}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await r.text()
    if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${text.slice(0, 400)}`)
    return text ? JSON.parse(text) : null
  }
}

export async function sliceThroughHttp(api, l, ref, today, links, managerId, app) {
  const call = await signIn(api, managerId)
  const { learner, rows } = ilrRows(l, ref, today)
  const programme = rows.aims[0]
  const aim = { startDate: programme.LEARNSTARTDATE, plannedEndDate: programme.LEARNPLANENDDATE, stdCode: programme.STDCODE, dellocPostcode: programme.DELLOCPOSTCODE, epaOrgId: programme.EPAORGID }
  const { learnRefNumber } = await call('POST', '/api/learners', {
    uln: String(learner.ULN), familyName: learner.FAMILYNAME, givenNames: learner.GIVENNAMES, dateOfBirth: learner.DATEOFBIRTH, ethnicity: learner.ETHNICITY, sex: learner.SEX,
    lldd: learner.LLDDHEALTHPROB, niNumber: learner.NINUMBER, postcodePrior: learner.POSTCODEPRIOR, postcode: learner.POSTCODE, phone: learner.TELNO, email: learner.EMAIL,
    addressLine1: learner.ADDRESSLINE1, addressLine2: learner.ADDRESSLINE2, ...aim,
  })
  const base = `/api/learners/${learnRefNumber}`
  await call('PUT', `${base}/details/programme`, aim)
  for (const a of rows.aims.slice(1)) await call('POST', `${base}/ilr/component`, { learnAimRef: a.LEARNAIMREF, startDate: a.LEARNSTARTDATE, plannedEndDate: a.LEARNPLANENDDATE })
  for (const f of rows.fin) await call('POST', `${base}/ilr/price`, { fin: `${f.AFINTYPE}-${f.AFINCODE}`, amount: String(f.AFINAMOUNT), date: f.AFINDATE })
  for (const p of rows.prior) await call('POST', `${base}/ilr/prior`, { priorLevel: p.PRIORLEVEL, dateLevelApp: p.DATELEVELAPP })
  for (const x of rows.lldd) await call('POST', `${base}/ilr/lldd`, { llddCat: x.LLDDCAT, primary: x.PRIMARYLLDD })
  const e = rows.employment[0]
  await call('POST', `${base}/ilr/employment`, { dateEmpStatApp: e.DATEEMPSTATAPP, empStat: e.EMPSTAT, empId: String(e.EMPID), employer: links.employerId, eii: 8, loe: 1 })
  const planned = rows.hours.find((h) => h.HRSCODE === 1)
  await call('PUT', `${base}/ilr-hours`, { planned: String(planned.HRSAMOUNT) })
  for (const officer of [l.tutor, l.assessor]) await call('POST', `${base}/officers`, { officerRefNumber: officer })
  // No route makes the first link to an employer yet: written as the app's role.
  await execute(app, `insert into CAPTURE_DB.ILR.LEARNER_EMPLOYER (LEARNREFNUMBER, EMPLOYERID, FROMDATE, SITEID, LINEMANAGERCONTACTID, ISTESTDATA) values (?, ?, ?::date, ?, ?, TRUE)`,
    [learnRefNumber, links.employerId, l.start, links.siteId, links.contactId])
  for (const rv of l.reviews) {
    await call('POST', `${base}/progress-reviews`, { officerRefNumber: rv.officer, reviewDate: rv.date, employerAttended: rv.employerAttended,
      summary: `Progress on the ${l.standard.NAME} standard; off-the-job training on track; next steps agreed.` })
  }
  return learnRefNumber
}

// Up to two pieces of evidence, added and submitted by the apprentice
// themselves (their sign-in from hand-over, a learner since enrolment).
export async function evidenceThroughHttp(api, l, learnRef, userId) {
  const call = await signIn(api, userId)
  let n = 0
  for (const e of l.evidence.filter((x) => x.type === 'reflection').slice(0, 2)) {
    const { evidenceId } = await call('POST', `/api/burrow/learners/${learnRef}/evidence`, {
      title: `What I did at work, ${e.occurred}`, evidenceType: 'reflection', occurredOn: e.occurred,
      reflection: `TEST reflection for ${l.standard.NAME}: what I did, what I learned and what I would do differently.`, ksbs: e.claims.map((k) => k.KSB_REFERENCE),
    })
    await call('POST', `/api/burrow/learners/${learnRef}/evidence/${evidenceId}/submit`, {})
    n++
  }
  return n
}
