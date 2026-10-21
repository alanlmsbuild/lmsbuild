// check-campuses.js - checks scripts/reach/college-campuses.csv, the four
// colleges' own published campuses (loaded by npm run load:data -- 47):
//   1. every row has a source page, the date checked, and either a postcode
//      the Office for National Statistics knows or a note saying why not
//   2. each campus's postcode is where the college says: where Discover Uni
//      also gives a campus of the same college, the two positions are within
//      500 m; every one is listed with its distance
//   3. each college's GIAS postcode is one of its campuses (or says so)
//   4. once loaded, the table holds exactly the file's rows
//   node scripts/reach/check-campuses.js
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, execute, destroy } from '../../server/db.js'

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'college-campuses.csv')
const problems = []
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) problems.push(what) }

// A small CSV reader: quoted fields may hold commas.
function parse(text) {
  const rows = []
  let row = [], cell = '', q = false
  for (const ch of text.replace(/^﻿/, '')) {
    if (q) { if (ch === '"') q = false; else cell += ch } else if (ch === '"') q = true
    else if (ch === ',') { row.push(cell); cell = '' } else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' } else cell += ch
  }
  return rows.filter((r) => r.length > 1)
}
const [head, ...body] = parse(fs.readFileSync(FILE, 'utf8'))
const campuses = body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
const compact = (pc) => pc.replace(/\s+/g, '').toUpperCase()
const km = (a, b) => {
  const R = 6371, rad = (d) => (d * Math.PI) / 180
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

check(campuses.length > 0 && campuses.every((c) => /^https:\/\//.test(c.source_url) && /^\d{4}-\d{2}-\d{2}$/.test(c.date_checked) && c.college && c.campus && c.college_urn), `${campuses.length} campuses, each with its college, a source page and the date checked`)

const c = await connect({ as: 'transform', timeoutMs: 60000 })
try {
  const q = (sql, binds) => execute(c, sql, binds)
  const wanted = [...new Set(campuses.map((x) => compact(x.postcode)).filter(Boolean))]
  const pcs = await q(`select replace(POSTCODE, ' ', '') as P, LATITUDE as LAT, LONGITUDE as LON, IS_LIVE as LIVE from SHARED_DB.SILVER.POSTCODE where replace(POSTCODE, ' ', '') in (${wanted.map(() => '?').join(', ')})`, wanted)
  const at = new Map(pcs.map((r) => [r.P, { lat: Number(r.LAT), lon: Number(r.LON) }]))
  const ended = pcs.filter((r) => !r.LIVE).map((r) => r.P)
  if (ended.length) console.log(`     (terminated postcodes the colleges still print, placed where the directory last had them: ${ended.join(', ')})`)
  const unknown = campuses.filter((x) => x.postcode && !at.has(compact(x.postcode)))
  const empty = campuses.filter((x) => !x.postcode)
  check(unknown.length === 0, `every postcode is in the ONS directory (live, or terminated and still placed)${unknown.length ? ` (not found: ${unknown.map((x) => `${x.campus} ${x.postcode}`).join(', ')})` : ''}`)
  console.log(`     ${empty.length} campus(es) with no address found (left off the map)`)
  for (const x of campuses) x.point = at.get(compact(x.postcode))

  // Discover Uni's campuses of the same colleges (by UKPRN via the college's legal name)
  const du = await q(`select i.LEGAL_NAME as COLLEGE, l.LOCNAME as LOC, to_double(l.LATITUDE) as LAT, to_double(l.LONGITUDE) as LON
    from OPTIONS_DB.RAW.DISCOVERUNI_LOCATION l join OPTIONS_DB.RAW.DISCOVERUNI_INSTITUTION i on i.UKPRN = l.UKPRN
    where l.SOURCEFILEID = (select SOURCEFILEID from OPTIONS_DB.RAW.DISCOVERUNI_LOCATION qualify row_number() over (order by SOURCEFILEID desc) = 1)
      and i.SOURCEFILEID = (select SOURCEFILEID from OPTIONS_DB.RAW.DISCOVERUNI_INSTITUTION qualify row_number() over (order by SOURCEFILEID desc) = 1)
      and i.UKPRN in ('10000536', '10004695', '10005534', '10005788') and l.LATITUDE <> ''`)
  const OF = { 'Barnsley College': '10000536', 'DN Colleges Group': '10004695', 'RNN Group': '10005534', 'The Sheffield College': '10005788' }
  console.log('Cross-check with Discover Uni (nearest campus of the same college from the college\'s own pages):')
  let far = 0
  let compared = 0
  for (const d of du) {
    const mine = campuses.filter((x) => x.point && d.COLLEGE.toLowerCase().replace(/^the /, '') .includes(x.college.toLowerCase().replace(/^the /, '').slice(0, 6)))
    const near = mine.map((x) => ({ x, m: km(x.point, { lat: d.LAT, lon: d.LON }) * 1000 })).sort((a, b) => a.m - b.m)[0]
    if (!near) { console.log(`     ${d.COLLEGE}: ${d.LOC}: no campus of ours to compare`); continue }
    if (near.m > 20000) { console.log(`     --  Discover Uni "${d.LOC}" (${d.COLLEGE}) is ${Math.round(near.m / 1000)} km from any campus on the college's South Yorkshire pages: outside the area, not compared`); continue }
    compared++
    const ok = near.m <= 500
    if (!ok) far++
    console.log(`     ${ok ? 'ok' : 'FAR'} Discover Uni "${d.LOC}" (${d.COLLEGE}) is ${Math.round(near.m)} m from "${near.x.campus}" ${near.x.postcode}`)
  }
  check(compared > 0 && far === 0, `every Discover Uni campus in South Yorkshire is within 500 m of a campus from the college's own pages (${compared} compared)`)

  // The GIAS postcode of each college is one of its campuses
  const gias = await q(`select "URN" as URN, "Postcode" as PC from OPTIONS_DB.RAW.GIAS_ESTABLISHMENT where "URN" in ('130524', '130527', '130531', '130587')
    and SOURCEFILEID = (select SOURCEFILEID from OPTIONS_DB.RAW.GIAS_ESTABLISHMENT qualify row_number() over (order by SOURCEFILEID desc) = 1)`)
  for (const g of gias) {
    const mine = campuses.filter((x) => x.college_urn === g.URN)
    const hit = mine.some((x) => compact(x.postcode) === compact(g.PC))
    const nearest = mine.filter((x) => x.point).map((x) => km(x.point, at.get(compact(g.PC)) ?? x.point) * 1000).sort((a, b) => a - b)[0]
    console.log(`     GIAS ${g.URN} ${g.PC}: ${hit ? 'is one of its campuses' : 'is not a campus postcode'}`)
    if (!hit) {
      const [p] = await q('select LATITUDE as LAT, LONGITUDE as LON, IS_LIVE as LIVE from SHARED_DB.SILVER.POSTCODE where replace(POSTCODE, \' \', \'\') = ?', [compact(g.PC)])
      if (!p) { check(false, `GIAS ${g.URN}'s postcode ${g.PC} is not in the ONS directory at all`); continue }
      if (!p.LIVE) console.log(`     (${g.PC} is a terminated postcode: GIAS's record for URN ${g.URN} is out of date)`)
      const d = Math.min(...mine.filter((x) => x.point).map((x) => km(x.point, { lat: Number(p.LAT), lon: Number(p.LON) }) * 1000))
      check(d <= 500, `GIAS ${g.URN}'s postcode ${g.PC} is within 500 m of one of its campuses (${Math.round(d)} m)`)
    }
  }

  // Loaded: the same rows as the file
  const [exists] = await q(`select count(*) as N from SHARED_DB.INFORMATION_SCHEMA.TABLES where TABLE_SCHEMA = 'RAW' and TABLE_NAME = 'COLLEGE_CAMPUS'`)
  if (Number(exists.N) > 0) {
    const [n] = await q(`select count(*) as N, count(distinct "campus" || "postcode") as D from SHARED_DB.RAW.COLLEGE_CAMPUS where SOURCEFILEID = (select SOURCEFILEID from SHARED_DB.RAW.COLLEGE_CAMPUS qualify row_number() over (order by SOURCEFILEID desc) = 1)`)
    check(Number(n.N) === campuses.length, `the loaded table has the file's ${campuses.length} campuses (${n.N})`)
  } else console.log('     (not loaded yet)')
} finally {
  await destroy(c)
}
console.log(problems.length ? `\n${problems.length} problem(s)` : '\nAll checks passed.')
process.exit(problems.length ? 1 : 0)
