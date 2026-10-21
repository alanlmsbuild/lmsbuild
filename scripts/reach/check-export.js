// check-export.js - checks data/reach/export (scripts/reach/export.js)
// against Snowflake, reading gold again independently:
//   1. one file per origin, each with 860 destinations in every list
//   2. every number in every file equals gold's, pair by pair (739,600),
//      and no file value is without a gold row
//   3. all 860 boundaries are loaded (ONS_LSOA_BOUNDARY) and in boundaries.json
//      in meta's order, one polygon each
//   4. postcodes and places point at real LSOAs
//   node scripts/reach/check-export.js
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, execute, destroy } from '../../server/db.js'

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'reach', 'export')
const GOLD = 'SHARED_DB.GOLD.TRAVEL_TIME'
const read = (f) => JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8'))
const problems = []
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) problems.push(what) }

const meta = read('meta.json')
const N = meta.lsoas.length
const files = fs.readdirSync(path.join(OUT, 'origins')).filter((f) => f.endsWith('.json'))
check(N === 860, `meta lists ${N} LSOAs`)
check(meta.lsoas.every((l) => typeof l.m === 'string' && l.m.length > 0), 'every LSOA has an everyday name (the House of Commons Library\'s MSOA name)')
check(meta.attributions.some((a) => a.includes('House of Commons Library')), 'the Library\'s attribution is in meta')
check(files.length === 860 && new Set(files).size === 860, `${files.length} origin files`)
const KEYS = ['a25', 'a50', 'a75', 'b25', 'b50', 'b75', 'w', 'u']
const origins = new Map()
let shortLists = 0
for (const f of files) {
  const o = read(`origins/${f}`)
  origins.set(o.o, o)
  for (const k of KEYS) if (!Array.isArray(o[k]) || o[k].length !== N) shortLists++
}
check(shortLists === 0, `every list in every origin file has ${N} destinations (${shortLists} wrong)`)
check(meta.lsoas.every((l) => origins.has(l.c)), 'every LSOA in meta has an origin file')

const c = await connect({ as: 'transform', timeoutMs: 60000 })
try {
  const q = (sql, binds) => execute(c, sql, binds)
  const index = new Map(meta.lsoas.map((l, i) => [l.c, i]))
  const rows = await q(`select ORIGIN_LSOA21 as O, DESTINATION_LSOA21 as D, TRANSIT_MINUTES_P25 as A25, TRANSIT_MINUTES_MEDIAN as A50, TRANSIT_MINUTES_P75 as A75,
    BUS_MINUTES_P25 as B25, BUS_MINUTES_MEDIAN as B50, BUS_MINUTES_P75 as B75, WALK_MINUTES as W, MODES_USED as U from ${GOLD}`)
  check(rows.length === 739600, `gold has ${rows.length.toLocaleString()} pairs`)
  let wrong = 0
  let compared = 0
  const num = (v) => (v === null ? null : Number(v))
  for (const r of rows) {
    const o = origins.get(r.O)
    const d = index.get(r.D)
    if (!o || d === undefined) { wrong++; continue }
    for (const k of ['a25', 'a50', 'a75', 'b25', 'b50', 'b75', 'w']) { compared++; if (o[k][d] !== num(r[k.toUpperCase()])) wrong++ }
    compared++
    if (o.u[d] !== (r.U ? meta.modes_used.indexOf(r.U) : null)) wrong++
  }
  check(wrong === 0, `${compared.toLocaleString()} numbers compared with gold, ${wrong} different`)
  // the same sums, worked out by Snowflake
  const [s] = await q(`select sum(TRANSIT_MINUTES_MEDIAN) as A, sum(BUS_MINUTES_MEDIAN) as B, count(TRANSIT_MINUTES_MEDIAN) as NA, count(BUS_MINUTES_MEDIAN) as NB, count(MODES_USED) as NU from ${GOLD}`)
  const sum = (k) => [...origins.values()].reduce((t, o) => t + o[k].reduce((a, v) => a + (v ?? 0), 0), 0)
  const cnt = (k) => [...origins.values()].reduce((t, o) => t + o[k].filter((v) => v !== null).length, 0)
  check(sum('a50') === Number(s.A) && sum('b50') === Number(s.B) && cnt('a50') === Number(s.NA) && cnt('b50') === Number(s.NB) && cnt('u') === Number(s.NU),
    `sums and counts agree with Snowflake (all modes ${sum('a50').toLocaleString()} over ${cnt('a50').toLocaleString()} times; bus ${sum('b50').toLocaleString()} over ${cnt('b50').toLocaleString()}; modes on ${cnt('u').toLocaleString()})`)

  const [b] = await q(`select count(*) as ALL_, count(distinct PROPERTIES:LSOA21CD::string) as DISTINCT_,
    count_if(PROPERTIES:LSOA21CD::string in (select distinct ORIGIN_LSOA21 from ${GOLD})) as TRAVEL from SHARED_DB.RAW.ONS_LSOA_BOUNDARY`)
  check(Number(b.ALL_) === 35672 && Number(b.DISTINCT_) === 35672, `${Number(b.ALL_).toLocaleString()} boundaries loaded, ${Number(b.DISTINCT_).toLocaleString()} distinct`)
  check(Number(b.TRAVEL) === 860, `${b.TRAVEL} of the 860 travel LSOAs have a loaded boundary`)
} finally {
  await destroy(c)
}

const shapes = read('boundaries.json').features
check(shapes.length === 860 && shapes.every((f, i) => f.properties.c === meta.lsoas[i].c && f.id === i && ['Polygon', 'MultiPolygon'].includes(f.geometry.type)),
  `boundaries.json: ${shapes.length} polygons in meta's order`)
const pc = read('postcodes.json')
const idx = Object.values(pc).flatMap((d) => Object.values(d))
check(idx.length > 0 && idx.every((i) => Number.isInteger(i) && i >= 0 && i < N), `postcodes.json: ${idx.length.toLocaleString()} postcodes, all point at an LSOA`)
check(new Set(idx).size > 800, `postcodes cover ${new Set(idx).size} of the 860 LSOAs`)
const places = read('places.json')
check(places.length > 0 && places.every((p) => Number.isInteger(p.lsoa) && p.lsoa >= 0 && p.lsoa < N && p.lat > 53 && p.lat < 54 && p.lon > -2 && p.lon < -0.8), `places.json: ${places.length} dots, each inside an LSOA`)
check(['college', 'sixth-form', 'university'].every((k) => places.some((p) => p.kind === k)), 'places has colleges, sixth forms and universities')
check(meta.day && meta.timetable_as_at && meta.notes.includes('Train fares not included') && meta.attributions.some((a) => a.includes('OpenStreetMap')), `meta: ${meta.day}, timetable as at ${meta.timetable_as_at}, notes and attribution present`)
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.')
process.exit(problems.length ? 1 : 0)
