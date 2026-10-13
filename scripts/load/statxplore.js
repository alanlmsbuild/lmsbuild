// DWP Stat-Xplore (https://stat-xplore.dwp.gov.uk), through its API with
// STATXPLORE_API_KEY (server/.env): Universal Credit and the Work and Health
// Programme, monthly, by local authority. Each set is one table query per 12
// months, written as one long CSV per fetch:
//   DATABASE, MEASURE, MONTH, MONTHCODE, AREACODE, AREANAME, BREAKDOWN,
//   BREAKDOWNVALUE, VALUE
// Starts to UC are left out: Stat-Xplore has them by Jobcentre Plus office
// and postcode district only, not local authority. For WHP the month is
// the referral or start month (outcomes and first earnings by start cohort).
// Values are as Stat-Xplore gives them: rounded and with small numbers
// controlled by DWP's disclosure rules. The Restart Scheme isn't on
// Stat-Xplore (DWP publishes it only as a spreadsheet on GOV.UK).
//
// Like the Nomis sets (scripts/fetch-official.js): each fetch is a new file,
// <base>_<from>_<to>.csv, from the last month fetched before (it may have
// been revised) to the latest, with the query in <file>.source.txt.

import fs from 'node:fs'
import path from 'node:path'
import { csvLine, writeLines } from './files.js'
import '../../server/db.js' // loads server/.env (STATXPLORE_API_KEY)

const API = 'https://stat-xplore.dwp.gov.uk/webapi/rest/v1'
const MONTHS_PER_QUERY = 12

export const SX_SETS = [
  { base: 'uc_people_by_employment', database: 'UC_Monthly', breakdown: /^Employment Indicator$/ },
  { base: 'uc_people_by_conditionality', database: 'UC_Monthly', breakdown: /^Conditionality Regime$/ },
  { base: 'uc_households', database: 'UC_Households' },
  { base: 'whp_referrals', database: 'WHP_Refs' },
  { base: 'whp_starts', database: 'WHP_Starts' },
  { base: 'whp_job_outcomes', database: 'WHP_Outcomes' },
  { base: 'whp_first_earnings', database: 'WHP_First_Earnings' },
].map((s) => ({ ...s, dir: 'stat-xplore' }))

function headers() {
  const key = process.env.STATXPLORE_API_KEY
  if (!key) throw new Error('STATXPLORE_API_KEY is not set in server/.env')
  return { APIKey: key, 'content-type': 'application/json' }
}

async function call(url, init = {}) {
  for (let t = 1; ; t++) {
    const res = await fetch(url, { ...init, headers: headers() })
    if (res.ok) return res
    if (t >= 4 || (res.status >= 400 && res.status < 500 && res.status !== 429)) throw new Error(`Stat-Xplore ${url.replace(API, '')}: ${res.status} ${(await res.text()).slice(0, 200)}`)
    await new Promise((r) => setTimeout(r, 5000 * t))
  }
}

const schema = async (id) => (await call(`${API}/schema/${id}`)).json()

// Every value in a value set (it comes 100 at a time; the next page is in the Link header).
async function values(valuesetId) {
  const out = []
  for (let url = `${API}/schema/${valuesetId}`; url;) {
    const res = await call(url)
    out.push(...((await res.json()).children ?? []))
    url = res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] ?? null
  }
  return out
}

// A database's count, month field, residence-based local authority field
// and (if asked) breakdown field, found by their labels in the schema.
async function describe(set) {
  const db = await schema(`str:database:${set.database}`)
  const count = db.children.find((c) => c.type === 'COUNT')
  const fields = [...db.children]
  for (const g of db.children.filter((c) => c.type === 'GROUP')) fields.push(...((await schema(g.id)).children ?? []).map((c) => ({ ...c, group: g.label })))
  const month = fields.find((c) => c.type === 'FIELD' && /:DATE_NAME$/.test(c.id))
  const geo = fields.find((c) => c.type === 'FIELD' && /residence/i.test(c.group ?? '') && /LA - OAs/.test(c.label))
  if (!count || !month || !geo) throw new Error(`${set.database}: no count, month or residence-based geography field`)
  const la = ((await schema(geo.id)).children ?? []).find((v) => v.label === 'Local Authority')
  const monthSet = ((await schema(month.id)).children ?? [])[0]
  const breakdown = set.breakdown ? fields.find((c) => c.type === 'FIELD' && set.breakdown.test(c.label)) : null
  if (!la || !monthSet || (set.breakdown && !breakdown)) throw new Error(`${set.database}: missing the local authority level, the months or the breakdown`)
  return { db, count, month, geo, la, monthSet, breakdown }
}

const monthCode = (id) => id.split(':').at(-1) // ...:C_UC_DATE:202108 -> 202108

export function sxFetched(dir, base) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter((n) => n.startsWith(`${base}_`) && n.endsWith('.csv.source.txt')).map((n) => {
    const m = fs.readFileSync(path.join(dir, n), 'utf8').match(/ to ([^>]+)>/)
    return { file: path.join(dir, n.replace(/\.source\.txt$/, '')), to: m?.[1] ?? '' }
  })
}

export const SX_COLUMNS = ['DATABASE', 'MEASURE', 'MONTH', 'MONTHCODE', 'AREACODE', 'AREANAME', 'BREAKDOWN', 'BREAKDOWNVALUE', 'VALUE']

export async function fetchStatXplore(set, { root, log = console.log }) {
  const dir = path.join(root, set.dir)
  fs.mkdirSync(dir, { recursive: true })
  const d = await describe(set)
  const months = (await values(d.monthSet.id)).sort((a, b) => (monthCode(a.id) < monthCode(b.id) ? -1 : 1))
  const las = await values(d.la.id)
  const last = sxFetched(dir, set.base).map((f) => f.to).sort().at(-1)
  const todo = last ? months.filter((m) => monthCode(m.id) >= last) : months
  if (!todo.some((m) => !last || monthCode(m.id) > last)) {
    log(`  ${set.base}: nothing new since ${last}`)
    return null
  }
  const from = monthCode(todo[0].id)
  const to = monthCode(todo.at(-1).id)
  const file = path.join(dir, `${set.base}_${from}_${to}.csv`)
  let rows = 0
  async function* lines() {
    yield csvLine(SX_COLUMNS)
    for (let i = 0; i < todo.length; i += MONTHS_PER_QUERY) {
      const chunk = todo.slice(i, i + MONTHS_PER_QUERY)
      const dims = [[d.month.id], [d.geo.id], ...(d.breakdown ? [[d.breakdown.id]] : [])]
      const body = { database: d.db.id, measures: [d.count.id], dimensions: dims,
        recodes: { [d.month.id]: { map: chunk.map((m) => [m.id]), total: false }, [d.geo.id]: { map: las.map((v) => [v.id]), total: false } } }
      const j = await (await call(`${API}/table`, { method: 'POST', body: JSON.stringify(body) })).json()
      const [fm, fg, fb] = j.fields
      const cube = j.cubes[d.count.id].values
      for (const [a, m] of fm.items.entries()) {
        for (const [b, g] of fg.items.entries()) {
          const cells = fb ? fb.items.map((x, c) => [x.labels[0], cube[a][b][c]]) : [['', cube[a][b]]]
          for (const [bv, v] of cells) {
            rows++
            yield csvLine([set.database, d.count.label, m.labels[0], monthCode(m.uris[0]), g.uris[0].split(':').at(-1), g.labels[0], d.breakdown?.label ?? '', bv, v ?? ''])
          }
        }
      }
    }
  }
  await writeLines(`${file}.part`, lines())
  fs.renameSync(`${file}.part`, file)
  fs.writeFileSync(`${file}.source.txt`, `${API}/table: ${d.db.id}, ${d.count.id}, by ${d.month.id} x ${d.la.id}${d.breakdown ? ` x ${d.breakdown.id}` : ''}, <each of ${todo.length} months, ${from} to ${to}>\nFetched ${new Date().toISOString()}\n`)
  log(`  ${set.base}: ${path.basename(file)}, ${todo.length} month(s), ${las.length} areas, ${rows} rows`)
  return file
}
