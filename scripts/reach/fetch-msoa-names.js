// fetch-msoa-names.js - the House of Commons Library's names for the 7,264
// 2021 MSOAs of England and Wales ("Crookes" for Sheffield 026), for the
// reach map's area names. Open Parliament Licence v3.0: acknowledge the
// source and link the licence. Saved as data/reach/msoa-names-<version>.csv
// (the version is on the Library's page), then checked: every one of the
// 171 MSOAs the 860 South Yorkshire travel LSOAs fall in has a name.
//
//   node scripts/reach/fetch-msoa-names.js
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, execute, destroy } from '../../server/db.js'

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const PAGE = 'https://houseofcommonslibrary.github.io/msoanames/'
const html = await (await fetch(PAGE)).text()
const version = html.replace(/<[^>]*>/g, ' ').match(/This is version\s+(\d+\.\d+)\s+of the 2021 MSOA Names/)?.[1]
if (!version) throw new Error('The Library\'s page no longer says which version the 2021 names are: check it')
const res = await fetch(`${PAGE}MSOA-Names-${version}.csv`)
if (!res.ok) throw new Error(`MSOA-Names-${version}.csv: ${res.status}`)
const text = await res.text()
const lines = text.replace(/^﻿/, '').trim().split('\n')
if (lines[0] !== 'msoa21cd,msoa21nm,msoa21nmw,msoa21hclnm,msoa21hclnmw,localauthorityname,type') throw new Error(`unexpected header: ${lines[0]}`)
if (lines.length - 1 !== 7264) throw new Error(`${lines.length - 1} MSOAs, expected 7,264`)
const out = path.join(REPO, 'data', 'reach', `msoa-names-${version}.csv`)
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, text)
console.log(`version ${version}: ${lines.length - 1} names written to ${path.relative(REPO, out)}`)

// Every MSOA the travel LSOAs fall in has a name.
const names = new Set(lines.slice(1).map((l) => l.split(',')[0]))
const c = await connect({ as: 'transform', timeoutMs: 60000 })
try {
  const rows = await execute(c, 'select distinct MSOA21_CODE as M from SHARED_DB.SILVER.LSOA where LSOA21_CODE in (select distinct ORIGIN_LSOA21 from SHARED_DB.GOLD.TRAVEL_TIME)')
  const missing = rows.filter((r) => !names.has(r.M))
  console.log(`${rows.length} MSOAs hold the travel LSOAs: ${rows.length - missing.length} named, ${missing.length} not${missing.length ? ': ' + missing.map((r) => r.M).join(', ') : ''}`)
  if (missing.length) process.exitCode = 1
} finally {
  await destroy(c)
}
