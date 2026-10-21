// export.js - the reach map's data, exported once from Snowflake to static
// files (Options app build brief, milestone 1), so the page makes no
// Snowflake call per click. Read as TRANSFORM_USER; writes to
// data/reach/export/ (not in git):
//
//   meta.json          the run: the day, window, timetable date, feed versions,
//                      notes, attribution lines, and the 860 LSOAs in index
//                      order (code, ONS name, local authority, and m: the House
//                      of Commons Library's everyday name, e.g. Crookes)
//   origins/<LSOA>.json one per origin: for each destination (by index in
//                      meta.json's lsoas) the all-modes 25th, 50th and 75th
//                      percentile minutes (a25, a50, a75), bus-and-tram-only
//                      (b25, b50, b75), walking (w) and the estimated modes
//                      (u: 0 walk, 1 bus, 2 train, 3 train and bus); null where
//                      gold has no time within 90 minutes
//   boundaries.json    the 860 LSOAs' ONS BGC boundaries (GeoJSON, 5 decimals,
//                      same order)
//   postcodes.json     live postcode -> LSOA index for the 860, by district
//                      then the rest of the postcode, for a lookup that stays
//                      on the device
//   places.json        dots: colleges and sixth forms (GIAS; special schools left
//                      out) and universities
//                      (Discover Uni) inside the 860 LSOAs, each with its LSOA
//                      index
//
//   node scripts/reach/export.js
//
// Decision 19: these files are the travel-time table in another form. Local
// use only until the ODbL question is settled.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, execute, destroy } from '../../server/db.js'

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = path.join(REPO, 'data', 'reach', 'export')
const MODES = ['walk', 'bus', 'train', 'train and bus']
const GOLD = 'SHARED_DB.GOLD.TRAVEL_TIME'
const ATTRIBUTION_TABLES = ['SHARED_DB.RAW.TRAVEL_TIME_LSOA_RUN', 'SHARED_DB.RAW.ONS_LSOA_BOUNDARY', 'SHARED_DB.RAW.ONSPD', 'OPTIONS_DB.RAW.GIAS_ESTABLISHMENT', 'OPTIONS_DB.RAW.DISCOVERUNI_LOCATION', 'SHARED_DB.RAW.HOCL_MSOA_NAME', 'SHARED_DB.RAW.COLLEGE_CAMPUS']

const write = (name, data) => {
  const file = path.join(OUT, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data))
  return fs.statSync(file).size
}
const round = (n, dp) => Math.round(n * 10 ** dp) / 10 ** dp
const roundCoords = (c, dp) => (typeof c[0] === 'number' ? c.map((n) => round(n, dp)) : c.map((x) => roundCoords(x, dp)))

// Point in polygon (ring list: outer ring then holes), even-odd rule.
function inRings(x, y, rings) {
  let inside = false
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i]
      const [xj, yj] = ring[j]
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
  }
  return inside
}
function bboxOf(geometry) {
  const b = [Infinity, Infinity, -Infinity, -Infinity]
  const walk = (c) => (typeof c[0] === 'number' ? (b[0] = Math.min(b[0], c[0]), b[1] = Math.min(b[1], c[1]), b[2] = Math.max(b[2], c[0]), b[3] = Math.max(b[3], c[1])) : c.forEach(walk))
  walk(geometry.coordinates)
  return b
}

const c = await connect({ as: 'transform', timeoutMs: 60000 })
const q = (sql, binds) => execute(c, sql, binds)
try {
  fs.rmSync(OUT, { recursive: true, force: true })
  const sizes = {}

  // ---- the run (one row, or the export stops)
  const runs = await q(`select distinct to_varchar(DEPARTURE_DATE) as DAY, DEPARTURE_WINDOW, MAX_MINUTES, MODES, GTFS_FEED_VERSION, RAIL_FEED_VERSION,
      to_varchar(RAIL_TIMETABLE_AS_AT) as TIMETABLE_AS_AT, to_varchar(OSM_DATA_DATE) as OSM_DATA_DATE, to_varchar(COMPUTED_ON) as COMPUTED_ON, NOTES from ${GOLD}`)
  if (runs.length !== 1) throw new Error(`gold travel_time holds ${runs.length} runs; the export expects one`)
  const run = runs[0]

  // ---- the LSOAs, in index order
  const lsoaRows = await q(`select distinct ORIGIN_LSOA21 as CODE, ORIGIN_NAME as NAME, ORIGIN_LOCAL_AUTHORITY_NAME as LA from ${GOLD} order by 1`)
  // Each LSOA's everyday name: the House of Commons Library's name for its MSOA (sql/load_13).
  const nameRows = await q(`select l.LSOA21_CODE as CODE, n."msoa21hclnm" as M from SHARED_DB.SILVER.LSOA l
    join SHARED_DB.RAW.HOCL_MSOA_NAME n on n."msoa21cd" = l.MSOA21_CODE
      and n.SOURCEFILEID = (select SOURCEFILEID from SHARED_DB.RAW.HOCL_MSOA_NAME qualify row_number() over (order by SOURCEFILEID desc) = 1)
    where l.LSOA21_CODE in (select distinct ORIGIN_LSOA21 from ${GOLD})`)
  const everyday = new Map(nameRows.map((r) => [r.CODE, r.M]))
  const lsoas = lsoaRows.map((r) => ({ c: r.CODE, n: r.NAME, la: r.LA, m: everyday.get(r.CODE) }))
  const unnamed = lsoas.filter((l) => !l.m)
  if (unnamed.length) throw new Error(`${unnamed.length} LSOAs have no MSOA name: ${unnamed.slice(0, 5).map((l) => l.c).join(', ')}`)
  const index = new Map(lsoas.map((l, i) => [l.c, i]))
  console.log(`${lsoas.length} LSOAs on ${run.DAY}`)

  // ---- the times: one file per origin
  const pairs = await q(`select ORIGIN_LSOA21 as O, DESTINATION_LSOA21 as D, TRANSIT_MINUTES_P25 as A25, TRANSIT_MINUTES_MEDIAN as A50, TRANSIT_MINUTES_P75 as A75,
      BUS_MINUTES_P25 as B25, BUS_MINUTES_MEDIAN as B50, BUS_MINUTES_P75 as B75, WALK_MINUTES as W, MODES_USED as U from ${GOLD}`)
  const origins = new Map()
  const blank = () => new Array(lsoas.length).fill(null)
  for (const p of pairs) {
    if (!origins.has(p.O)) origins.set(p.O, Object.fromEntries(['a25', 'a50', 'a75', 'b25', 'b50', 'b75', 'w', 'u'].map((k) => [k, blank()])))
    const f = origins.get(p.O)
    const d = index.get(p.D)
    for (const k of ['a25', 'a50', 'a75', 'b25', 'b50', 'b75', 'w']) f[k][d] = p[k.toUpperCase()] === null ? null : Number(p[k.toUpperCase()])
    f.u[d] = p.U ? MODES.indexOf(p.U) : null
    if (p.U && f.u[d] < 0) throw new Error(`unknown modes_used "${p.U}"`)
  }
  let total = 0
  for (const [o, f] of origins) total += write(`origins/${o}.json`, { o, ...f })
  sizes.origins = total

  // ---- the boundaries
  const bRows = await q(`select PROPERTIES:LSOA21CD::string as CODE, GEOMETRY from SHARED_DB.RAW.ONS_LSOA_BOUNDARY
    where PROPERTIES:LSOA21CD::string in (select distinct ORIGIN_LSOA21 from ${GOLD})`)
  const geoms = new Map(bRows.map((r) => [r.CODE, typeof r.GEOMETRY === 'string' ? JSON.parse(r.GEOMETRY) : r.GEOMETRY]))
  if (geoms.size !== lsoas.length) throw new Error(`${geoms.size} boundaries loaded for ${lsoas.length} LSOAs`)
  const shapes = lsoas.map((l, i) => {
    const g = geoms.get(l.c)
    return { type: 'Feature', id: i, properties: { c: l.c }, geometry: { type: g.type, coordinates: roundCoords(g.coordinates, 5) } }
  })
  sizes.boundaries = write('boundaries.json', { type: 'FeatureCollection', features: shapes })
  const boxes = shapes.map((s) => bboxOf(s.geometry))
  const lsoaAt = (lon, lat) => {
    for (let i = 0; i < shapes.length; i++) {
      const b = boxes[i]
      if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue
      const g = shapes[i].geometry
      if (g.type === 'Polygon' ? inRings(lon, lat, g.coordinates) : g.coordinates.some((rings) => inRings(lon, lat, rings))) return i
    }
    return null
  }

  // ---- postcodes (live, in the 860)
  const pcRows = await q(`select replace(POSTCODE, ' ', '') as COMPACT, LSOA21_CODE as L from SHARED_DB.SILVER.POSTCODE
    where IS_LIVE and LSOA21_CODE in (select distinct ORIGIN_LSOA21 from ${GOLD}) order by 1`)
  const postcodes = {}
  for (const r of pcRows) {
    const compact = r.COMPACT
    const district = compact.slice(0, -3)
    ;(postcodes[district] ??= {})[compact.slice(-3)] = index.get(r.L)
  }
  sizes.postcodes = write('postcodes.json', postcodes)

  // ---- places
  const gias = await q(`select g."URN" as URN, g."EstablishmentName" as NAME, g."TypeOfEstablishment (name)" as TYPE, g."FurtherEducationType (name)" as FE_TYPE,
      g."OfficialSixthForm (name)" as SIXTH, g."PhaseOfEducation (name)" as PHASE, nullif(g."Postcode", '') as POSTCODE, nullif(g."Town", '') as TOWN,
      st_x(st_transform(to_geometry('POINT(' || g."Easting" || ' ' || g."Northing" || ')', 27700), 4326)) as LON,
      st_y(st_transform(to_geometry('POINT(' || g."Easting" || ' ' || g."Northing" || ')', 27700), 4326)) as LAT
    from OPTIONS_DB.RAW.GIAS_ESTABLISHMENT g
    where g.SOURCEFILEID = (select SOURCEFILEID from OPTIONS_DB.RAW.GIAS_ESTABLISHMENT qualify row_number() over (order by SOURCEFILEID desc) = 1)
      and g."EstablishmentStatus (name)" like 'Open%' and g."Easting" <> '' and g."Northing" <> ''
      and g."TypeOfEstablishment (name)" not ilike '%special%'
      and (g."TypeOfEstablishment (name)" in ('Further education', 'Sixth form centres', 'Academy 16-19 converter', 'Free schools 16 to 19', 'University technical college')
           or g."OfficialSixthForm (name)" = 'Has a sixth form' or g."PhaseOfEducation (name)" = '16 plus')`)
  const places = []
  let outside = 0
  for (const g of gias) {
    const lsoa = lsoaAt(g.LON, g.LAT)
    if (lsoa === null) { outside++; continue }
    const kind = g.TYPE === 'Further education' && !String(g.FE_TYPE).startsWith('Sixth Form College') ? 'college' : 'sixth-form'
    places.push({ kind, name: g.NAME, urn: g.URN, type: g.TYPE, town: g.TOWN, postcode: g.POSTCODE, lat: round(g.LAT, 5), lon: round(g.LON, 5), lsoa })
  }
  // Colleges: GIAS has one record each (a dot at its head office). Each
  // college's own published campuses (sql/load_14) replace it, one dot per
  // postcode (sites sharing a postcode share a dot); a campus with no address,
  // or none the postcode directory places, stays off and is counted.
  const campusRows = await q(`select "college" as COLLEGE, "college_urn" as URN, "campus" as CAMPUS, "postcode" as POSTCODE, "date_checked" as CHECKED
    from SHARED_DB.RAW.COLLEGE_CAMPUS where SOURCEFILEID = (select SOURCEFILEID from SHARED_DB.RAW.COLLEGE_CAMPUS qualify row_number() over (order by SOURCEFILEID desc) = 1)`)
  const where = new Map((await q(`select replace(POSTCODE, ' ', '') as P, LATITUDE as LAT, LONGITUDE as LON from SHARED_DB.SILVER.POSTCODE
    where replace(POSTCODE, ' ', '') in (select replace("postcode", ' ', '') from SHARED_DB.RAW.COLLEGE_CAMPUS)`)).map((r) => [r.P, r]))
  const campusDots = new Map()
  const campusStats = { total: campusRows.length, placed: 0, missing: 0, outside: 0, checked: [...new Set(campusRows.map((r) => r.CHECKED))].sort().at(-1) }
  for (const r of campusRows) {
    const pt = r.POSTCODE ? where.get(r.POSTCODE.replace(/\s+/g, '').toUpperCase()) : null
    if (!pt) { campusStats.missing++; continue }
    const lsoa = lsoaAt(Number(pt.LON), Number(pt.LAT))
    if (lsoa === null) { campusStats.outside++; continue }
    campusStats.placed++
    const key = `${r.URN}|${r.POSTCODE}`
    if (!campusDots.has(key)) campusDots.set(key, { urn: r.URN, postcode: r.POSTCODE, lat: round(Number(pt.LAT), 5), lon: round(Number(pt.LON), 5), lsoa, campuses: [] })
    campusDots.get(key).campuses.push(r.CAMPUS)
  }
  const withCampuses = new Set([...campusDots.values()].map((d) => d.urn))
  for (let i = places.length - 1; i >= 0; i--) if (places[i].kind === 'college' && withCampuses.has(places[i].urn)) places.splice(i, 1)
  const collegeName = new Map(campusRows.map((r) => [r.URN, r.COLLEGE]))
  for (const d of campusDots.values()) places.push({ kind: 'college', name: collegeName.get(d.urn), campus: d.campuses.join(', '), urn: d.urn, type: 'Further education', postcode: d.postcode, lat: d.lat, lon: d.lon, lsoa: d.lsoa })
  const dots = { college: places.filter((p) => p.kind === 'college').length, 'sixth-form': places.filter((p) => p.kind === 'sixth-form').length }
  const uni = await q(`select l.UKPRN, l.LOCID, l.LOCNAME, i.LEGAL_NAME as PROVIDER, to_double(l.LATITUDE) as LAT, to_double(l.LONGITUDE) as LON
    from OPTIONS_DB.RAW.DISCOVERUNI_LOCATION l
    join OPTIONS_DB.RAW.DISCOVERUNI_INSTITUTION i on i.UKPRN = l.UKPRN and i.SOURCEFILEID = (select SOURCEFILEID from OPTIONS_DB.RAW.DISCOVERUNI_INSTITUTION qualify row_number() over (order by SOURCEFILEID desc) = 1)
    where l.SOURCEFILEID = (select SOURCEFILEID from OPTIONS_DB.RAW.DISCOVERUNI_LOCATION qualify row_number() over (order by SOURCEFILEID desc) = 1)
      and l.LATITUDE <> '' and l.LONGITUDE <> '' and i.LEGAL_NAME ilike '%university%'`)
  let uniOutside = 0
  for (const u of uni) {
    const lsoa = lsoaAt(u.LON, u.LAT)
    if (lsoa === null) { uniOutside++; continue }
    places.push({ kind: 'university', name: u.PROVIDER, campus: u.LOCNAME, ukprn: u.UKPRN, lat: round(u.LAT, 5), lon: round(u.LON, 5), lsoa })
  }
  dots.university = places.filter((p) => p.kind === 'university').length
  places.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name) || String(a.campus ?? '').localeCompare(String(b.campus ?? '')))
  sizes.places = write('places.json', places)

  // ---- meta
  const attributions = new Set(['© OpenStreetMap contributors'])
  for (const t of ATTRIBUTION_TABLES) {
    const [r] = await q(`select system$get_tag('SHARED_DB.GOVERNANCE.ATTRIBUTION', '${t}', 'table') as A`)
    if (!r.A) throw new Error(`${t} has no ATTRIBUTION tag`)
    attributions.add(r.A)
  }
  sizes.meta = write('meta.json', {
    day: run.DAY, window: run.DEPARTURE_WINDOW, max_minutes: Number(run.MAX_MINUTES), modes: run.MODES, timetable_as_at: run.TIMETABLE_AS_AT,
    gtfs_feed_version: run.GTFS_FEED_VERSION, rail_feed_version: run.RAIL_FEED_VERSION, osm_data_date: run.OSM_DATA_DATE, computed_on: run.COMPUTED_ON,
    notes: run.NOTES, campuses: campusStats, modes_used: MODES, attributions: [...attributions], exported_from: GOLD, lsoas,
  })

  const kb = (n) => `${(n / 1024).toFixed(0)} KB`
  console.log(`origins: ${origins.size} files, ${(sizes.origins / 1e6).toFixed(1)} MB in all (${kb(sizes.origins / origins.size)} each)`)
  console.log(`boundaries.json ${kb(sizes.boundaries)}; postcodes.json ${kb(sizes.postcodes)} (${pcRows.length.toLocaleString()} postcodes in ${Object.keys(postcodes).length} districts); places.json ${kb(sizes.places)} (${places.length} dots: ${JSON.stringify(dots)}; campuses ${JSON.stringify(campusStats)}; ${outside} GIAS and ${uniOutside} university locations outside the area left out); meta.json ${kb(sizes.meta)}`)
} finally {
  await destroy(c)
}
