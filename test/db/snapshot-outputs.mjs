// Saves what the app produces for the test organisations, to compare before
// and after a change that mustn't change behaviour: the ILR file (as Max and
// as Nia), the QAR as each manager, and the learner list. Reads only.
// Needs the test API on 3002. Usage: node test/db/snapshot-outputs.mjs <folder>
import fs from 'node:fs'
import path from 'node:path'

const API = process.env.API_URL ?? 'http://localhost:3002'
if (/:3001\b/.test(API)) throw new Error('Port 3001 is the dev server. Test on 3002.')
const out = process.argv[2]
if (!out) throw new Error('Give a folder to save into.')
fs.mkdirSync(out, { recursive: true })

async function get(user, url) {
  const res = await fetch(API + url, { headers: { Cookie: `dev_user_id=${user}` } })
  if (!res.ok) throw new Error(`${url} as ${user}: ${res.status}`)
  return res
}
for (const [user, org] of [['USR-T0008', 'ORG-T001'], ['USR-T0011', 'ORG-T002']]) {
  fs.writeFileSync(path.join(out, `ilr-${org}.xml`), await (await get(user, '/api/ilr/return/file')).text())
  const qar = await (await get(user, '/api/reports/qar')).json()
  fs.writeFileSync(path.join(out, `qar-${org}.json`), JSON.stringify(qar, null, 1))
  for (const year of qar.years?.map((y) => y.YEAR ?? y) ?? []) {
    fs.writeFileSync(path.join(out, `qar-${org}-${year}.json`), JSON.stringify(await (await get(user, `/api/reports/qar?year=${year}`)).json(), null, 1))
  }
  fs.writeFileSync(path.join(out, `learners-${org}.json`), JSON.stringify(await (await get(user, '/api/learners')).json(), null, 1))
  fs.writeFileSync(path.join(out, `caseload-${org}.json`), JSON.stringify(await (await get(user, '/api/reports/caseload')).json(), null, 1))
}
console.log('saved to', out, fs.readdirSync(out).join(', '))
