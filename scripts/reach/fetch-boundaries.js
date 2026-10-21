// fetch-boundaries.js - the ONS LSOA (December 2021) boundaries, generalised
// to 20 m and clipped to the coast (BGC, V5), for England and Wales, as the
// reach map's shading (Options app build brief, milestone 1). Saved as
// data/reach/lsoa21_bgc_v5.geojson (WGS84, 6 decimals), then checked against
// the 860 South Yorkshire LSOAs that GOLD.TRAVEL_TIME has times for
// (data/travel/origins/south_yorkshire_lsoas.csv): every one needs a
// boundary, and the boundaries must be the same 2021 LSOAs as the times.
//
//   node scripts/reach/fetch-boundaries.js
//
// Source: ONS Open Geography Portal, ArcGIS Feature Service. Licence: ONS
// boundaries are Open Government Licence v3.0 with OS data, Crown copyright
// and database right (the catalogue record says "No Licence Provided", so
// the portal page is to be confirmed before launch: sql/load_12 tags ogl-3).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SERVICE = 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Lower_layer_Super_Output_Areas_December_2021_Boundaries_EW_BGC_V5/FeatureServer/0'
const OUT = path.join(REPO, 'data', 'reach', 'lsoa21_bgc_v5.geojson')
const PAGE = 2000

async function get(offset) {
  const q = new URLSearchParams({ where: '1=1', outFields: 'LSOA21CD,LSOA21NM,LSOA21NMW,BNG_E,BNG_N,LAT,LONG', orderByFields: 'LSOA21CD',
    resultOffset: String(offset), resultRecordCount: String(PAGE), geometryPrecision: '6', f: 'geojson' })
  const r = await fetch(`${SERVICE}/query?${q}`)
  if (!r.ok) throw new Error(`${r.status} from the boundary service at offset ${offset}`)
  return (await r.json()).features
}

const features = []
for (let offset = 0; ; offset += PAGE) {
  const page = await get(offset)
  features.push(...page)
  if (page.length < PAGE) break
}
const codes = features.map((f) => f.properties.LSOA21CD)
if (new Set(codes).size !== codes.length) throw new Error('the service returned a duplicate LSOA')
fs.mkdirSync(path.dirname(OUT), { recursive: true })
fs.writeFileSync(OUT, JSON.stringify({ type: 'FeatureCollection', features }))
console.log(`${features.length.toLocaleString()} LSOA boundaries written to ${path.relative(REPO, OUT)} (${(fs.statSync(OUT).size / 1e6).toFixed(1)} MB)`)

const origins = fs.readFileSync(path.join(REPO, 'data', 'travel', 'origins', 'south_yorkshire_lsoas.csv'), 'utf8').trim().split('\n').slice(1).map((l) => l.split(',')[0])
const have = new Set(codes)
const missing = origins.filter((c) => !have.has(c))
const bad = features.filter((f) => origins.includes(f.properties.LSOA21CD) && !['Polygon', 'MultiPolygon'].includes(f.geometry?.type))
console.log(`${origins.length} travel-time LSOAs: ${origins.length - missing.length} have a boundary, ${missing.length} missing${missing.length ? ': ' + missing.join(', ') : ''}; ${bad.length} without a polygon`)
if (missing.length || bad.length) process.exit(1)
