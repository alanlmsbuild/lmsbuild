// check-supertram.js - checks scripts/fares/supertram-fares.csv, Supertram's
// own published fares written down by hand (loaded by npm run load:data -- 49,
// sql/load_16). Supertram is not in the Bus Open Data Service, but a few bus
// operators' datasets carry tram tickets: where one is the same ticket, the
// prices must agree (they are listed either way).
//   node scripts/fares/check-supertram.js          what is in the file and how it compares
//   node scripts/fares/check-supertram.js --ready  also fails while any row has no date checked
//                                                  (load:data step 49 does the same)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connect, execute, destroy } from '../../server/db.js'

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'supertram-fares.csv')
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
const fares = body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])))
const ready = process.argv.includes('--ready')
let problems = 0
const say = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) problems++ }

say(fares.every((f) => f.ticket && ['child', '16-18', '18-21', 'student', 'adult'].includes(f.who) && ['single', 'return', 'day', 'week', '28-day'].includes(f.category) && /^\d+\.\d\d$/.test(f.price) && /^https:\/\//.test(f.source_url)),
  `${fares.length} fares, each with a ticket, who, kind, a price in pounds and a source page`)
const unchecked = fares.filter((f) => !/^\d{4}-\d{2}-\d{2}$/.test(f.date_checked))
console.log(`     ${fares.length - unchecked.length} checked on the page, ${unchecked.length} with no date checked yet`)
if (ready) say(unchecked.length === 0, 'every fare has the date a person checked it on its page')

// BODS tram tickets
const c = await connect({ as: 'transform', timeoutMs: 120000 })
try {
  const bods = await execute(c, `select p.product_name, m.who, m.category, min(p.price_min) as LO, max(p.price_max) as HI
    from SHARED_DB.SILVER.BUS_FARE_PRODUCT p join SHARED_DB.SILVER.BUS_FARE_PRODUCT_MAP m on m.operator = p.operator_name and m.product_name = p.product_name
    where m.pass_name = 'Tram' and p.operator_name = 'First Bus' and p.price_points = 1 group by 1, 2, 3`)
  console.log('Cross-check with the tram tickets in First South Yorkshire\'s BODS data (same who and kind):')
  let differ = 0
  for (const f of fares) {
    const match = bods.filter((b) => b.WHO === f.who && b.CATEGORY === f.category)
    if (!match.length) { console.log(`     --  ${f.ticket} £${f.price}: no tram ticket of this kind in BODS`); continue }
    const same = match.some((b) => Number(b.LO) === Number(f.price))
    if (!same) differ++
    console.log(`     ${same ? 'ok ' : 'DIFF'} ${f.ticket} £${f.price} vs BODS ${match.map((b) => `${b.PRODUCT_NAME} £${b.LO}`).join(', ')}`)
  }
  say(differ === 0, `no price differs from a matching BODS tram ticket (${differ} differ)`)
} finally {
  await destroy(c)
}
console.log(problems ? `\n${problems} problem(s)` : '\nAll checks passed.')
process.exit(problems ? 1 : 0)
